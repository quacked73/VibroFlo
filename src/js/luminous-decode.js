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

  function bandpass(freq, channelIndex){
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = freq;
    filter.Q.value = 12; // wider than a "pure" isolation filter — a narrower one is more selective but reacts more slowly to amplitude changes, which shows up as lag at faster pulse rates
    splitter.connect(filter, channelIndex);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256; // smaller window, less inherent smoothing — favors catching fast changes over a perfectly stable reading
    filter.connect(analyser);
    return { analyser, buffer: new Float32Array(analyser.fftSize) };
  }

  const freqs = {
    as: AUDIOSTROBE_FREQ,
    ss_ref: SPECTRA_FREQS.ref, ss_r: SPECTRA_FREQS.r, ss_g: SPECTRA_FREQS.g, ss_b: SPECTRA_FREQS.b,
    ls_ref: LUMASONIC_FREQS.ref, ls_r: LUMASONIC_FREQS.r, ls_g: LUMASONIC_FREQS.g, ls_b: LUMASONIC_FREQS.b,
    noise: NOISE_REF_FREQ,
  };
  const bank = { left: {}, right: {}, refHistory: [] };
  for(const [key, freq] of Object.entries(freqs)){
    bank.left[key] = bandpass(freq, 0);
    bank.right[key] = bandpass(freq, 1);
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
