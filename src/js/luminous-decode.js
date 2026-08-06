// Reads an AudioStrobe/SpectraStrobe signal already embedded in playing
// audio — the other half of Luminous's own signal generator. Pure signal
// analysis: isolate a narrow frequency band with a bandpass filter, read its
// live amplitude. That's the same technique already proven out for Follow
// Music, aimed at a specific tone instead of the whole broadband signal.
// Works identically on every platform, since nothing here touches hardware —
// it's just reading audio the browser already has access to.
//
// Honest scope note: the core technique (isolate a band, read its
// amplitude) is solid, ordinary signal processing. The exact SpectraStrobe
// channel-to-color mapping below is a best-effort interpretation, not a
// verified spec — the precise internal mapping isn't fully public
// documentation. Treat color results as experimental until confirmed
// against real hardware or known-good SpectraStrobe content.

const AUDIOSTROBE_FREQ = 19200;
const SPECTRA_FREQS = { ref: 18200, a: 18700, b: 19200, c: 19700 };
const NOISE_FLOOR = 0.004; // below this, treat it as "no real signal," not just quiet content

export function buildDecoderBank(ctx, sourceNode){
  const splitter = ctx.createChannelSplitter(2);
  sourceNode.connect(splitter);

  function bandpass(freq, channelIndex){
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = freq;
    filter.Q.value = 40; // narrow — isolate just this tone, not neighboring content
    splitter.connect(filter, channelIndex);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512; // small on purpose — this is amplitude-of-a-narrow-band, not spectral detail
    filter.connect(analyser);
    return { analyser, buffer: new Float32Array(analyser.fftSize) };
  }

  const freqs = { as: AUDIOSTROBE_FREQ, ref: SPECTRA_FREQS.ref, a: SPECTRA_FREQS.a, b: SPECTRA_FREQS.b, c: SPECTRA_FREQS.c };
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

// SpectraStrobe's reference tone alternates hard left/right at 10-50 times a
// second, signaling "this is SpectraStrobe, not just AudioStrobe." Rather
// than try to precisely clock that rate, this checks a short rolling window
// for real, fast alternation between the two sides — noise or a steady pan
// doesn't produce this pattern, genuine alternation does.
const REF_HISTORY_LEN = 12;

export function detectSpectraStrobeReference(bank, levels){
  const balance = levels.left.ref - levels.right.ref;
  bank.refHistory.push(balance);
  if(bank.refHistory.length > REF_HISTORY_LEN) bank.refHistory.shift();
  if(bank.refHistory.length < REF_HISTORY_LEN) return false;
  let flips = 0;
  for(let i=1;i<bank.refHistory.length;i++){
    if((bank.refHistory[i] > 0) !== (bank.refHistory[i-1] > 0)) flips++;
  }
  const strongEnough = Math.max(...bank.refHistory.map(Math.abs)) > NOISE_FLOOR;
  return strongEnough && flips >= REF_HISTORY_LEN * 0.4;
}

export function audioStrobeSignalPresent(levels){
  return Math.max(levels.left.as, levels.right.as) > NOISE_FLOOR;
}

// Best-effort frequency-to-color assignment (ascending frequency → R/G/B) —
// see the file header. Scaled generously since these decoded amplitudes run
// much smaller than a full-scale signal by the time they reach here.
export function levelsToColor(sideLevels){
  const scale = (v) => Math.max(0, Math.min(255, Math.round(v * 1800)));
  return { r: scale(sideLevels.a), g: scale(sideLevels.b), b: scale(sideLevels.c) };
}
