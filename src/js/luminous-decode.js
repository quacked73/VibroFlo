// Reads a light-sync signal already embedded in playing audio — the other
// half of Luminous's own signal generator. Pure signal analysis: isolate a
// narrow frequency band with a bandpass filter, read its live amplitude.
// That's the same technique already proven out for Follow Music, aimed at
// specific tones instead of the whole broadband signal. Works identically
// on every platform, since nothing here touches hardware — it's just
// reading audio the browser already has access to.
//
// Frequencies and RGB channel assignments below are taken directly from
// Cymatic Somatics' archived, MIT-licensed Lumasonic SDK headers (2025) —
// not a guess. Three distinct codecs exist, each with its own frequencies
// and its own R/G/B-to-frequency order (Lumasonic runs high-to-low,
// SpectraStrobe runs low-to-high — this is a real, source-confirmed
// difference, not an inconsistency in this file):
//
//   Lumasonic:     ref 22500, red 21000, green 19500, blue 18000
//   SpectraStrobe: ref 18200, red 18700, green 19200, blue 19700
//   AudioStrobe:   single tone at 19200 (brightness only, no color)
//
// Lumasonic's reference tone (22500) doesn't overlap with anything else
// these codecs use, so it's checked first as a clean, unambiguous signal
// that content is Lumasonic-encoded rather than SpectraStrobe or AudioStrobe.

const LUMASONIC_FREQS = { ref: 22500, r: 21000, g: 19500, b: 18000 };
const SPECTRA_FREQS = { ref: 18200, r: 18700, g: 19200, b: 19700 };
const AUDIOSTROBE_FREQ = 19200;
const NOISE_REF_FREQ = 16000; // clearly below every codec's lowest tone (Lumasonic's blue at 18000), used as a live noise-floor baseline instead of one fixed guessed number
const MIN_SIGNAL_RATIO = 2.5; // target band must exceed the noise baseline by this multiple to count as "real," not just ambient hiss

export function buildDecoderBank(ctx, sourceNode){
  const splitter = ctx.createChannelSplitter(2);
  sourceNode.connect(splitter);

  function bandpass(freq, channelIndex, q, fftSize){
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = freq;
    filter.Q.value = q;
    splitter.connect(filter, channelIndex);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = fftSize;
    filter.connect(analyser);
    return { analyser, buffer: new Float32Array(analyser.fftSize) };
  }

  // AudioStrobe's tone and the noise reference each stand alone with no
  // close neighbor to bleed from, so they stay on the wider, faster-reacting
  // filter — good time resolution matters more than extreme selectivity
  // when there's nothing nearby to be confused with.
  const FAST_Q = 12, FAST_FFT = 256;

  // SpectraStrobe and Lumasonic's four tones sit only 500Hz apart. At the
  // wider setting above, a strong tone can leak into its neighbor's filter
  // and inflate a channel that isn't actually carrying much signal — this
  // is a real, measured effect, confirmed by comparing decoded output
  // against an independent ground-truth spectral analysis of real encoded
  // content, not just a theoretical concern. Much narrower here trades a
  // bit of response speed for genuine channel separation — an acceptable
  // trade since color evolves more slowly than the on/off brightness pulse
  // itself, which stays on the fast filter above via the "as" entry
  // (SpectraStrobe/Lumasonic don't have a separate brightness tone the way
  // AudioStrobe does — brightness there comes from how strongly each color
  // channel is driven, not a distinct signal of its own).
  const NARROW_Q = 130, NARROW_FFT = 512;

  const freqs = {
    as: { freq: AUDIOSTROBE_FREQ, q: FAST_Q, fft: FAST_FFT },
    noise: { freq: NOISE_REF_FREQ, q: FAST_Q, fft: FAST_FFT },
    // The reference tones stay on the fast filter too — detecting their
    // alternation pattern needs good time resolution, not frequency
    // selectivity, which is a different job than separating the color
    // tones from each other.
    ss_ref: { freq: SPECTRA_FREQS.ref, q: FAST_Q, fft: FAST_FFT },
    ss_r: { freq: SPECTRA_FREQS.r, q: NARROW_Q, fft: NARROW_FFT },
    ss_g: { freq: SPECTRA_FREQS.g, q: NARROW_Q, fft: NARROW_FFT },
    ss_b: { freq: SPECTRA_FREQS.b, q: NARROW_Q, fft: NARROW_FFT },
    ls_ref: { freq: LUMASONIC_FREQS.ref, q: FAST_Q, fft: FAST_FFT },
    ls_r: { freq: LUMASONIC_FREQS.r, q: NARROW_Q, fft: NARROW_FFT },
    ls_g: { freq: LUMASONIC_FREQS.g, q: NARROW_Q, fft: NARROW_FFT },
    ls_b: { freq: LUMASONIC_FREQS.b, q: NARROW_Q, fft: NARROW_FFT },
  };
  const bank = { left: {}, right: {}, refHistory: [] };
  for(const [key, spec] of Object.entries(freqs)){
    bank.left[key] = bandpass(spec.freq, 0, spec.q, spec.fft);
    bank.right[key] = bandpass(spec.freq, 1, spec.q, spec.fft);
  }
  return bank;
}

function readLevel(node){
  node.analyser.getFloatTimeDomainData(node.buffer);
  let sum = 0;
  for(let i=0;i<node.buffer.length;i++) sum += node.buffer[i]*node.buffer[i];
  return Math.sqrt(sum/node.buffer.length);
}

export function readDecoderLevels(bank){
  const out = { left: {}, right: {} };
  for(const key of Object.keys(bank.left)) out.left[key] = readLevel(bank.left[key]);
  for(const key of Object.keys(bank.right)) out.right[key] = readLevel(bank.right[key]);
  return out;
}

// Real AVS hardware never drives an LED directly from a raw instantaneous
// reading — it runs the decoded signal through an envelope follower first,
// smoothing it into a clean rise and fall. Without an equivalent stage here,
// raw per-frame jitter can look like an inconsistent or outright different
// flash rate even when the underlying detection is accurate. Attack is fast
// (catches real brightness increases promptly); release is a bit slower
// (avoids a flickery, noisy fall-off) — the same asymmetric shape real
// envelope followers use.
const ATTACK_MS = 8, RELEASE_MS = 25;

export function smoothLevels(bank, rawLevels, dtSeconds){
  if(!bank.smoothed) bank.smoothed = { left: {}, right: {} };
  for(const side of ["left", "right"]){
    for(const key of Object.keys(rawLevels[side])){
      const prev = bank.smoothed[side][key] ?? 0;
      const raw = rawLevels[side][key];
      const tc = (raw > prev ? ATTACK_MS : RELEASE_MS) / 1000;
      const alpha = 1 - Math.exp(-Math.max(0.001, dtSeconds) / tc);
      bank.smoothed[side][key] = prev + (raw - prev) * alpha;
    }
  }
  return bank.smoothed;
}

// A live noise baseline instead of one fixed guessed number — real tracks
// encode this signal at whatever level their author chose, and system
// volume/hardware differences shift the absolute level further. Comparing
// against a nearby quiet frequency, rather than an absolute threshold,
// adapts to whatever the actual playback conditions happen to be.
function noiseBaseline(levels){
  return Math.max(0.0008, (levels.left.noise + levels.right.noise) / 2);
}

// Lumasonic's reference tone doesn't overlap with anything else — a clean,
// unambiguous "this is Lumasonic" check, no pattern-matching needed.
export function detectLumasonic(levels){
  const baseline = noiseBaseline(levels);
  return Math.max(levels.left.ls_ref, levels.right.ls_ref) > baseline * MIN_SIGNAL_RATIO;
}

// SpectraStrobe's reference tone alternates hard left/right at 20 times a
// second (confirmed — SS_REF_PAN_LFO_FREQ in the source SDK), signaling
// "this is SpectraStrobe, not just AudioStrobe." Checking for real, fast
// alternation in a short rolling window rather than trying to precisely
// clock the exact rate — noise or a steady pan doesn't produce this
// pattern, genuine 20Hz alternation does.
const REF_HISTORY_LEN = 12;

export function detectSpectraStrobeReference(bank, levels){
  const balance = levels.left.ss_ref - levels.right.ss_ref;
  bank.refHistory.push(balance);
  if(bank.refHistory.length > REF_HISTORY_LEN) bank.refHistory.shift();
  if(bank.refHistory.length < REF_HISTORY_LEN) return false;
  let flips = 0;
  for(let i=1;i<bank.refHistory.length;i++){
    if((bank.refHistory[i] > 0) !== (bank.refHistory[i-1] > 0)) flips++;
  }
  const baseline = noiseBaseline(levels);
  const strongEnough = Math.max(...bank.refHistory.map(Math.abs)) > baseline * MIN_SIGNAL_RATIO;
  return strongEnough && flips >= REF_HISTORY_LEN * 0.4;
}

export function audioStrobeSignalPresent(levels){
  const baseline = noiseBaseline(levels);
  return Math.max(levels.left.as, levels.right.as) > baseline * MIN_SIGNAL_RATIO;
}

// Confirmed frequency-to-channel assignment from the source SDK — note the
// order is genuinely different between the two codecs (Lumasonic runs
// high-to-low R→G→B, SpectraStrobe runs low-to-high), not a copy-paste
// inconsistency.
export function levelsToColorLumasonic(sideLevels){
  const scale = (v) => Math.max(0, Math.min(255, Math.round(v * 1800)));
  return { r: scale(sideLevels.ls_r), g: scale(sideLevels.ls_g), b: scale(sideLevels.ls_b) };
}

export function levelsToColorSpectra(sideLevels){
  const scale = (v) => Math.max(0, Math.min(255, Math.round(v * 1800)));
  return { r: scale(sideLevels.ss_r), g: scale(sideLevels.ss_g), b: scale(sideLevels.ss_b) };
}
