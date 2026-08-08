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

// A 1-5 sensitivity scale exposed as a Live Session Behavior setting on the
// Luminous page. Level 4 is where detection already stood before this scale
// existed (1.5x the noise floor); level 5 is the practical floor — the
// lowest ratio worth going before ordinary noise starts reading as signal.
// Levels 1-3 extend the range the other direction for anyone who needs it
// less sensitive, using the actual value this used before it was lowered
// for level 1, as a real reference point rather than an arbitrary number.
const SENSITIVITY_RATIOS = { 1: 2.5, 2: 2.0, 3: 1.75, 4: 1.5, 5: 1.2 };
const DEFAULT_SENSITIVITY = 4;

function ratioForLevel(level){
  return SENSITIVITY_RATIOS[level] ?? SENSITIVITY_RATIOS[DEFAULT_SENSITIVITY];
}

// SpectraStrobe specifically reads dimmer and less responsive than a
// MindPlace Kasina decoding the same real file side by side, even once
// genuinely detected — a real, reported gap, not a guess. This gives it a
// meaningfully lower threshold than the shared scale at any given level,
// so it registers real signal earlier/more readily than the other codecs do.
function spectraRatioForLevel(level){
  return ratioForLevel(level) * 0.75;
}

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

  // Every filter's Q is derived from that tone's actual nearest neighbour
  // across all three codecs, not from a general "narrow vs wide" guess. A
  // bandpass filter's bandwidth is freq/Q, so a filter needs a high enough Q
  // that its bandwidth stays comfortably inside the gap to the closest other
  // tone in use. This matters more than it looks: at a shared low Q, the
  // AudioStrobe filter at 19200Hz passes roughly 18400-20000Hz, which
  // swallows ALL THREE SpectraStrobe colour tones (18700/19200/19700) — so
  // SpectraStrobe content reads as a strong AudioStrobe signal. Likewise a
  // wide filter on SpectraStrobe's 18200Hz reference picks up Lumasonic's
  // blue at 18000Hz. Tight, per-tone Q values remove that cross-talk at the
  // source.
  //
  // Tones with no close neighbour (the 16000Hz noise reference, Lumasonic's
  // 21000/22500) keep a lower Q deliberately — there's nothing nearby to be
  // confused with, and lower Q reacts faster to real amplitude changes.
  const TONES = {
    noise:  { freq: NOISE_REF_FREQ,      q: 16,  fft: 256 },
    as:     { freq: AUDIOSTROBE_FREQ,    q: 140, fft: 512 },
    ss_ref: { freq: SPECTRA_FREQS.ref,   q: 190, fft: 512 },
    ss_r:   { freq: SPECTRA_FREQS.r,     q: 90,  fft: 512 },
    ss_g:   { freq: SPECTRA_FREQS.g,     q: 140, fft: 512 },
    ss_b:   { freq: SPECTRA_FREQS.b,     q: 200, fft: 512 },
    ls_ref: { freq: LUMASONIC_FREQS.ref, q: 40,  fft: 256 },
    ls_r:   { freq: LUMASONIC_FREQS.r,   q: 40,  fft: 256 },
    ls_g:   { freq: LUMASONIC_FREQS.g,   q: 200, fft: 512 },
    ls_b:   { freq: LUMASONIC_FREQS.b,   q: 190, fft: 512 },
  };

  // Lumasonic's reference tone (22500Hz) sits above the Nyquist limit of a
  // 44.1kHz context (22050Hz) — physically unrepresentable at that rate, so
  // its filter would read aliasing artifacts rather than signal. The code
  // asks for 48kHz, but that's only a hint the browser may ignore, so check
  // what actually came back and mark the affected tones unusable rather than
  // silently decoding noise.
  const nyquist = ctx.sampleRate / 2;
  const bank = { left: {}, right: {}, refHistory: [], sampleRate: ctx.sampleRate, unusable: {} };
  for(const [key, spec] of Object.entries(TONES)){
    if(spec.freq >= nyquist * 0.98){ // 0.98 margin: a filter right at Nyquist is unreliable even when nominally under it
      bank.unusable[key] = true;
      continue;
    }
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
  // A tone skipped as above-Nyquist reports a flat zero rather than being
  // absent — downstream comparisons then simply never fire for it, instead
  // of producing NaN from an undefined read.
  for(const key of Object.keys(bank.unusable || {})){
    out.left[key] = 0;
    out.right[key] = 0;
  }
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
export function noiseBaseline(levels){
  return Math.max(0.0008, (levels.left.noise + levels.right.noise) / 2);
}

// How many times above the noise floor counts as "fully bright." Kept
// deliberately lower than the detection thresholds above (1.2-2.5x) —
// something that's clearly registering as real signal should also look
// clearly bright, not require several more multiples of margin on top of
// what already counted as detected. A fixed absolute gain couldn't adapt to
// how loud any given track's own encoding happened to be; this scales with
// it instead, the same idea already used for detection.
const BRIGHTNESS_TARGET_RATIO = 3.5;

export function adaptiveBrightness(level, baseline){
  const ratio = level / baseline;
  return Math.max(0, Math.min(1, (ratio - 1) / (BRIGHTNESS_TARGET_RATIO - 1)));
}

// A continuous 0-1 value for a live strength indicator, rather than the
// binary detected/not-detected used for the actual codec logic above. 0
// means at or below the noise floor, 1 means at or above the detection
// threshold — checks the three "is anything here at all" candidate
// frequencies (the two reference tones plus plain AudioStrobe) since any of
// them lighting up means something real is present, before drilling into
// which specific codec it is.
export function signalStrengthFactor(levels, sensitivityLevel){
  const baseline = noiseBaseline(levels);
  const strongest = Math.max(
    levels.left.ls_ref, levels.right.ls_ref,
    levels.left.ss_ref, levels.right.ss_ref,
    levels.left.as, levels.right.as
  );
  const ratio = strongest / baseline;
  const minRatio = ratioForLevel(sensitivityLevel);
  return Math.max(0, Math.min(1, (ratio - 1) / (minRatio - 1)));
}

// Lumasonic's reference tone doesn't overlap with anything else — a clean,
// unambiguous "this is Lumasonic" check, no pattern-matching needed.
export function detectLumasonic(levels, sensitivityLevel){
  const baseline = noiseBaseline(levels);
  return Math.max(levels.left.ls_ref, levels.right.ls_ref) > baseline * ratioForLevel(sensitivityLevel);
}

// SpectraStrobe's reference tone alternates hard left/right at 20 times a
// second (confirmed — SS_REF_PAN_LFO_FREQ in the source SDK), signaling
// "this is SpectraStrobe, not just AudioStrobe."
//
// The window here is measured in TIME, not frames. Counting a fixed number
// of frames silently changes the window length with display refresh rate:
// 12 frames is 200ms at 60fps but only 100ms at 120fps, and at 20Hz
// alternation that shorter window contains too few flips to ever pass the
// threshold — meaning SpectraStrobe would never be detected at all on a
// 120Hz phone while working fine on a 60Hz one. A time-based window behaves
// identically on both.
const REF_WINDOW_MS = 250;           // ~5 full alternation cycles at 20Hz
const REF_MIN_FLIPS = 5;             // well under the ~10 expected, tolerant of jitter and dropped frames
const REF_MIN_SAMPLES = 8;           // don't judge until the window has enough points to be meaningful

export function detectSpectraStrobeReference(bank, levels, sensitivityLevel){
  const now = performance.now();
  const balance = levels.left.ss_ref - levels.right.ss_ref;
  bank.refHistory.push({ t: now, balance });
  while(bank.refHistory.length && now - bank.refHistory[0].t > REF_WINDOW_MS){
    bank.refHistory.shift();
  }
  if(bank.refHistory.length < REF_MIN_SAMPLES) return false;

  let flips = 0;
  for(let i=1;i<bank.refHistory.length;i++){
    if((bank.refHistory[i].balance > 0) !== (bank.refHistory[i-1].balance > 0)) flips++;
  }
  const baseline = noiseBaseline(levels);
  const strongEnough = Math.max(...bank.refHistory.map(e => Math.abs(e.balance))) > baseline * spectraRatioForLevel(sensitivityLevel);
  return strongEnough && flips >= REF_MIN_FLIPS;
}

export function audioStrobeSignalPresent(levels, sensitivityLevel){
  const baseline = noiseBaseline(levels);
  return Math.max(levels.left.as, levels.right.as) > baseline * ratioForLevel(sensitivityLevel);
}

// Scales all three channels by the same factor, based on how far the
// strongest one sits above the noise floor — this is what keeps hue intact
// (a channel that's genuinely twice as strong as another stays twice as
// strong in the output) while still using the adaptive brightness curve
// above, rather than three independently-maxing channels that would wash
// out any real color balance into white.
function adaptiveColorScale(rLevel, gLevel, bLevel, baseline){
  const maxLevel = Math.max(rLevel, gLevel, bLevel);
  const confidence = adaptiveBrightness(maxLevel, baseline);
  const scale = (v) => Math.round(255 * confidence * (maxLevel > 0 ? v / maxLevel : 0));
  return { r: scale(rLevel), g: scale(gLevel), b: scale(bLevel) };
}

// Confirmed frequency-to-channel assignment from the source SDK — note the
// order is genuinely different between the two codecs (Lumasonic runs
// high-to-low R→G→B, SpectraStrobe runs low-to-high), not a copy-paste
// inconsistency.
export function levelsToColorLumasonic(sideLevels, baseline){
  return adaptiveColorScale(sideLevels.ls_r, sideLevels.ls_g, sideLevels.ls_b, baseline);
}

export function levelsToColorSpectra(sideLevels, baseline){
  return adaptiveColorScale(sideLevels.ss_r, sideLevels.ss_g, sideLevels.ss_b, baseline);
}

// Without this, which codec is "active" gets re-decided completely fresh
// every single animation frame — and a few noisy or borderline frames can
// flip the result back and forth.
//
// The subtlety that makes a naive version of this WRONG: the three codecs
// are not independent candidates. AudioStrobe's only tone is 19200Hz, which
// is exactly SpectraStrobe's green channel — so real SpectraStrobe content
// makes the AudioStrobe check true immediately, while the SpectraStrobe
// check needs a rolling window of alternation history before it can report
// true even once. Racing independent streaks therefore hands the lock to
// AudioStrobe every time, and SpectraStrobe content plays back as
// brightness-only with no colour, permanently, looking stable and correct.
//
// So the codecs are ranked instead of raced. Lumasonic and SpectraStrobe are
// identified by reference tones that AudioStrobe simply does not have —
// those are positive, unambiguous evidence. "Plain AudioStrobe" is the
// fallback conclusion, and is only allowed to lock after the higher-priority
// codecs have had a fair chance to speak up and haven't.
const LOCK_CONFIRM_MS = 150;         // sustained evidence before committing to a colour codec
const AUDIOSTROBE_GRACE_MS = 500;    // how long to hold off concluding "just AudioStrobe" — must exceed the reference window plus confirm time
const FORMAT_PRIORITY = ["lumasonic", "spectrastrobe", "audiostrobe"];

export function createDetectionLock(){
  return { format: null, trackId: undefined, since: {}, firstSeen: 0 };
}

function resetDetectionLock(lock, trackId){
  lock.format = null;
  lock.trackId = trackId;
  lock.since = {};
  lock.firstSeen = 0;
}

// candidates: { lumasonic, spectrastrobe, audiostrobe } — this frame's raw,
// unlocked detection results. forcedFormat: a manual per-track override,
// if set. Returns the currently-committed format, or null if still building
// confidence.
export function updateDetectionLock(lock, trackId, candidates, forcedFormat){
  if(lock.trackId !== trackId) resetDetectionLock(lock, trackId);

  if(forcedFormat){
    lock.format = forcedFormat;
    return lock.format;
  }

  if(lock.format) return lock.format; // already committed for this track — don't re-litigate every frame

  const now = performance.now();
  if(!lock.firstSeen) lock.firstSeen = now;

  // Track how long each candidate has been continuously true.
  for(const key of FORMAT_PRIORITY){
    if(candidates[key]){
      if(!lock.since[key]) lock.since[key] = now;
    } else {
      lock.since[key] = 0;
    }
  }

  for(const key of FORMAT_PRIORITY){
    if(!lock.since[key]) continue;
    const heldFor = now - lock.since[key];
    if(heldFor < LOCK_CONFIRM_MS) continue;

    // AudioStrobe is a conclusion by elimination, not positive evidence —
    // its tone is shared with SpectraStrobe's green channel. Only accept it
    // once the reference-tone codecs have had time to declare themselves and
    // haven't, and only while neither is currently showing signal.
    if(key === "audiostrobe"){
      const elapsed = now - lock.firstSeen;
      if(elapsed < AUDIOSTROBE_GRACE_MS) continue;
      if(candidates.lumasonic || candidates.spectrastrobe) continue;
    }
    lock.format = key;
    return lock.format;
  }
  return null;
}
