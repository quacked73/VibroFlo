// Luminous Settings — configures how light-sync behaves during real
// sessions (persisted, read by session.js), plus a standalone AudioStrobe
// test signal generator for pre-testing connected hardware directly.
//
// The test signal below is deliberately separate from session.js's own
// audio graph — a lab bench for dialing in a real light-sync signal against
// actual hardware (starting with a MindPlace Kasina). The technique is the
// same amplitude-gating already used for Isochronic mode on the Session
// page's engines — an LFO gates a gain node — just aimed at a carrier
// frequency above normal hearing instead of an audible tone.

import { renderNav } from "./nav.js";
import { logoSVG } from "./logo.js";
import { showLuminousWarning } from "./luminous-safety.js";
import { getLuminousPrefs, saveLuminousPrefs } from "./luminous-prefs.js";

renderNav("luminous");

const luminousTabs = document.querySelectorAll(".tab-row .pill");
const luminousPanels = {
  settings: document.getElementById("panel-settings"),
  hardware: document.getElementById("panel-hardware"),
  play: document.getElementById("panel-play"),
};
luminousTabs.forEach(tab => {
  tab.addEventListener("click", () => {
    luminousTabs.forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    Object.entries(luminousPanels).forEach(([key, el]) => {
      el.style.display = key === tab.dataset.tab ? "block" : "none";
    });
  });
});

// ---------- Live Session Behavior (persisted preferences) ----------
const prefFadeIn = document.getElementById("prefFadeIn");
const prefCountdown = document.getElementById("prefCountdown");
const prefCountdownVal = document.getElementById("prefCountdownVal");
const prefSensitivity = document.getElementById("prefSensitivity");
const prefSensitivityVal = document.getElementById("prefSensitivityVal");
const prefFadeInVal = document.getElementById("prefFadeInVal");
const prefEyeDrift = document.getElementById("prefEyeDrift");
const prefEyeDriftVal = document.getElementById("prefEyeDriftVal");
const prefBrightnessVar = document.getElementById("prefBrightnessVar");
const prefBrightnessVarVal = document.getElementById("prefBrightnessVarVal");
const prefFollowMusicSwitch = document.getElementById("prefFollowMusicSwitch");
const prefScreenBrightness = document.getElementById("prefScreenBrightness");
const prefScreenBrightnessVal = document.getElementById("prefScreenBrightnessVal");

(function initPrefsUI(){
  const prefs = getLuminousPrefs();
  prefFadeIn.value = prefs.fadeInSeconds;
  prefFadeInVal.textContent = prefs.fadeInSeconds;
  prefCountdown.value = prefs.countdownSeconds;
  prefCountdownVal.textContent = prefs.countdownSeconds;
  prefSensitivity.value = prefs.sensitivity;
  prefSensitivityVal.textContent = prefs.sensitivity;
  prefEyeDrift.value = prefs.eyeDrift;
  prefEyeDriftVal.textContent = prefs.eyeDrift;
  prefBrightnessVar.value = prefs.brightnessVar;
  prefBrightnessVarVal.textContent = prefs.brightnessVar;
  prefFollowMusicSwitch.classList.toggle("on", prefs.followMusic);
  prefScreenBrightness.value = prefs.screenBrightnessDefault;
  prefScreenBrightnessVal.textContent = prefs.screenBrightnessDefault;
})();

prefFadeIn.addEventListener("input", () => {
  prefFadeInVal.textContent = prefFadeIn.value;
  saveLuminousPrefs({ fadeInSeconds: parseInt(prefFadeIn.value, 10) });
});
prefCountdown.addEventListener("input", () => {
  prefCountdownVal.textContent = prefCountdown.value;
  saveLuminousPrefs({ countdownSeconds: parseInt(prefCountdown.value, 10) });
});
prefSensitivity.addEventListener("input", () => {
  prefSensitivityVal.textContent = prefSensitivity.value;
  saveLuminousPrefs({ sensitivity: parseInt(prefSensitivity.value, 10) });
});
prefEyeDrift.addEventListener("input", () => {
  prefEyeDriftVal.textContent = prefEyeDrift.value;
  saveLuminousPrefs({ eyeDrift: parseInt(prefEyeDrift.value, 10) });
});
prefBrightnessVar.addEventListener("input", () => {
  prefBrightnessVarVal.textContent = prefBrightnessVar.value;
  saveLuminousPrefs({ brightnessVar: parseInt(prefBrightnessVar.value, 10) });
});
prefFollowMusicSwitch.addEventListener("click", () => {
  const next = !prefFollowMusicSwitch.classList.contains("on");
  prefFollowMusicSwitch.classList.toggle("on", next);
  saveLuminousPrefs({ followMusic: next });
});
prefScreenBrightness.addEventListener("input", () => {
  prefScreenBrightnessVal.textContent = prefScreenBrightness.value;
  saveLuminousPrefs({ screenBrightnessDefault: parseInt(prefScreenBrightness.value, 10) });
});

// ---------- Test Your Hardware ----------

const powerBtn = document.getElementById("lumPowerBtn");
const statusEl = document.getElementById("lumStatus");

const modeRow = document.getElementById("lumModeRow");
const asControlsWrap = document.getElementById("asControlsWrap");
const ssControlsWrap = document.getElementById("ssControlsWrap");

const freqSlider = document.getElementById("lumFreq");
const freqVal = document.getElementById("lumFreqVal");
const rateSlider = document.getElementById("lumRate");
const rateVal = document.getElementById("lumRateVal");
const depthSlider = document.getElementById("lumDepth");
const depthVal = document.getElementById("lumDepthVal");
const strengthSlider = document.getElementById("lumStrength");
const strengthVal = document.getElementById("lumStrengthVal");
const shapeRow = document.getElementById("lumShapeRow");
const channelRow = document.getElementById("lumChannelRow");

const redSlider = document.getElementById("ssRed");
const redVal = document.getElementById("ssRedVal");
const greenSlider = document.getElementById("ssGreen");
const greenVal = document.getElementById("ssGreenVal");
const blueSlider = document.getElementById("ssBlue");
const blueVal = document.getElementById("ssBlueVal");

const SS_FREQS = { ref: 18200, r: 18700, g: 19200, b: 19700 };
const SS_PAN_RATE = 20; // Hz — fixed by the SpectraStrobe spec, not adjustable

const state = {
  testMode: "audiostrobe", // "audiostrobe" | "spectrastrobe"
  freq: 19200,
  rate: 10,
  depth: 100,
  strength: 80,
  shape: "sine",
  channel: "both",
  red: 100,
  green: 0,
  blue: 0,
};

let ctx = null;
let running = false;

// One carrier + LFO-gate + panner chain per output channel, so "left only" /
// "right only" can genuinely silence the other side rather than just panning
// a shared signal.
let left = null, right = null;

// SpectraStrobe's four-tone equivalent — a chain per side, plus one shared
// 20Hz pan oscillator both sides read from (one directly, one inverted),
// which is what produces the required alternating reference tone.
let genSsLeft = null, genSsRight = null, genSsPanLfo = null, genSsPanLfoInverted = null, genSsPanInvertGain = null;

modeRow.addEventListener("click", (e) => {
  const pill = e.target.closest(".pill");
  if(!pill || running) return; // don't allow switching mid-signal — avoids juggling two live graphs at once
  [...modeRow.children].forEach(c => c.classList.remove("active"));
  pill.classList.add("active");
  state.testMode = pill.dataset.mode;
  asControlsWrap.style.display = state.testMode === "audiostrobe" ? "block" : "none";
  ssControlsWrap.style.display = state.testMode === "spectrastrobe" ? "block" : "none";
});

function buildChain(pan){
  const carrier = ctx.createOscillator();
  carrier.type = "sine";
  carrier.frequency.value = state.freq;

  const gate = ctx.createGain(); // this is the actual AudioStrobe amplitude signal
  const floor = 1 - (state.depth/100);
  gate.gain.value = 0; // baseline comes entirely from lfoOffset below — this must stay 0 or it double-counts

  const lfo = ctx.createOscillator();
  lfo.type = state.shape;
  lfo.frequency.value = state.rate;
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = (1 - floor) / 2;
  const lfoOffset = ctx.createConstantSource();
  lfoOffset.offset.value = floor + (1 - floor) / 2;

  lfo.connect(lfoDepth);
  lfoDepth.connect(gate.gain);
  lfoOffset.connect(gate.gain);

  const strength = ctx.createGain();
  strength.gain.value = state.strength/100;

  const panner = ctx.createStereoPanner();
  panner.pan.value = pan;

  carrier.connect(gate);
  gate.connect(strength);
  strength.connect(panner);
  panner.connect(ctx.destination);

  carrier.start();
  lfo.start();
  lfoOffset.start();

  return { carrier, gate, lfo, lfoDepth, lfoOffset, strength, panner };
}

function stopChain(chain){
  if(!chain) return;
  try{ chain.carrier.stop(); }catch(e){}
  try{ chain.lfo.stop(); }catch(e){}
  try{ chain.lfoOffset.stop(); }catch(e){}
}

function applyChannelGains(){
  if(!left || !right) return;
  const leftOn = state.channel === "both" || state.channel === "left";
  const rightOn = state.channel === "both" || state.channel === "right";
  left.strength.gain.setTargetAtTime(leftOn ? state.strength/100 : 0, ctx.currentTime, 0.05);
  right.strength.gain.setTargetAtTime(rightOn ? state.strength/100 : 0, ctx.currentTime, 0.05);
}

// SpectraStrobe: reference tone alternates hard left/right at a fixed 20Hz —
// both sides read from ONE shared oscillator so they're always exactly
// out of phase with each other, one directly and one through a gain of -1
// (which flips a sine 180°). Same "LFO depth + DC offset summed into a
// gain" gating technique already used for AudioStrobe above, just fed by
// the shared/inverted pan source instead of each side having its own LFO.
// Red/green/blue are steady tones — SpectraStrobe encodes color as sustained
// amplitude, not a pulse, so these don't need any gating at all.
function buildSpectraChain(pan, panSource){
  const refCarrier = ctx.createOscillator();
  refCarrier.type = "sine";
  refCarrier.frequency.value = SS_FREQS.ref;
  const refGate = ctx.createGain();
  refGate.gain.value = 0; // baseline comes entirely from refLfoOffset — must stay 0 or it double-counts
  const refLfoDepth = ctx.createGain();
  refLfoDepth.gain.value = 0.5;
  const refLfoOffset = ctx.createConstantSource();
  refLfoOffset.offset.value = 0.5;
  panSource.connect(refLfoDepth);
  refLfoDepth.connect(refGate.gain);
  refLfoOffset.connect(refGate.gain);

  const rCarrier = ctx.createOscillator(); rCarrier.type = "sine"; rCarrier.frequency.value = SS_FREQS.r;
  const rGain = ctx.createGain(); rGain.gain.value = state.red/100;
  const gCarrier = ctx.createOscillator(); gCarrier.type = "sine"; gCarrier.frequency.value = SS_FREQS.g;
  const gGain = ctx.createGain(); gGain.gain.value = state.green/100;
  const bCarrier = ctx.createOscillator(); bCarrier.type = "sine"; bCarrier.frequency.value = SS_FREQS.b;
  const bGain = ctx.createGain(); bGain.gain.value = state.blue/100;

  const mix = ctx.createGain(); // sums all four tones before the shared strength/pan stage
  refCarrier.connect(refGate); refGate.connect(mix);
  rCarrier.connect(rGain); rGain.connect(mix);
  gCarrier.connect(gGain); gGain.connect(mix);
  bCarrier.connect(bGain); bGain.connect(mix);

  const strength = ctx.createGain();
  strength.gain.value = state.strength/100;
  const panner = ctx.createStereoPanner();
  panner.pan.value = pan;
  mix.connect(strength);
  strength.connect(panner);
  panner.connect(ctx.destination);

  refCarrier.start(); refLfoOffset.start();
  rCarrier.start(); gCarrier.start(); bCarrier.start();

  return { refCarrier, refGate, refLfoDepth, refLfoOffset, rCarrier, rGain, gCarrier, gGain, bCarrier, bGain, mix, strength, panner };
}

function stopSpectraChain(chain){
  if(!chain) return;
  try{ chain.refCarrier.stop(); }catch(e){}
  try{ chain.refLfoOffset.stop(); }catch(e){}
  try{ chain.rCarrier.stop(); }catch(e){}
  try{ chain.gCarrier.stop(); }catch(e){}
  try{ chain.bCarrier.stop(); }catch(e){}
}

function startSpectraStrobe(){
  genSsPanLfo = ctx.createOscillator();
  genSsPanLfo.type = "sine";
  genSsPanLfo.frequency.value = SS_PAN_RATE;
  genSsPanInvertGain = ctx.createGain();
  genSsPanInvertGain.gain.value = -1;
  genSsPanLfo.connect(genSsPanInvertGain);
  genSsPanLfo.start();

  genSsLeft = buildSpectraChain(-1, genSsPanLfo);         // in phase
  genSsRight = buildSpectraChain(1, genSsPanInvertGain);  // 180° out of phase — the actual alternation
  applySpectraChannelGains();
}

function stopSpectraStrobe(){
  stopSpectraChain(genSsLeft);
  stopSpectraChain(genSsRight);
  try{ genSsPanLfo?.stop(); }catch(e){}
  genSsLeft = null; genSsRight = null; genSsPanLfo = null; genSsPanLfoInverted = null; genSsPanInvertGain = null;
}

function applySpectraChannelGains(){
  if(!genSsLeft || !genSsRight) return;
  const leftOn = state.channel === "both" || state.channel === "left";
  const rightOn = state.channel === "both" || state.channel === "right";
  genSsLeft.strength.gain.setTargetAtTime(leftOn ? state.strength/100 : 0, ctx.currentTime, 0.05);
  genSsRight.strength.gain.setTargetAtTime(rightOn ? state.strength/100 : 0, ctx.currentTime, 0.05);
}

function start(){
  if(running) return;
  if(!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if(ctx.state === "suspended") ctx.resume();

  if(state.testMode === "spectrastrobe"){
    startSpectraStrobe();
  } else {
    left = buildChain(-1);
    right = buildChain(1);
    applyChannelGains();
  }

  running = true;
  powerBtn.classList.add("on");
  statusEl.style.display = "block";
  updateStatus();
}

function stop(){
  if(!running) return;
  if(state.testMode === "spectrastrobe"){
    stopSpectraStrobe();
  } else {
    stopChain(left);
    stopChain(right);
    left = null; right = null;
  }
  running = false;
  powerBtn.classList.remove("on");
  statusEl.style.display = "none";
}

function updateStatus(){
  if(!running) return;
  if(state.testMode === "spectrastrobe"){
    statusEl.textContent =
      `Running — SpectraStrobe: R${state.red}% G${state.green}% B${state.blue}%, ` +
      `${state.strength}% strength, ${state.channel} channel(s).`;
  } else {
    statusEl.textContent =
      `Running — ${state.freq}Hz carrier, pulsing at ${state.rate.toFixed(1)}Hz, ` +
      `${state.depth}% depth, ${state.shape === "sine" ? "smooth" : "sharp"} gate, ${state.channel} channel(s).`;
  }
}

powerBtn.addEventListener("click", () => {
  if(running){ stop(); return; }
  showLuminousWarning(() => start(), () => {});
});

freqSlider.addEventListener("input", () => {
  state.freq = parseInt(freqSlider.value, 10);
  freqVal.textContent = state.freq;
  if(left) left.carrier.frequency.setTargetAtTime(state.freq, ctx.currentTime, 0.05);
  if(right) right.carrier.frequency.setTargetAtTime(state.freq, ctx.currentTime, 0.05);
  updateStatus();
});

rateSlider.addEventListener("input", () => {
  state.rate = parseFloat(rateSlider.value);
  rateVal.textContent = state.rate.toFixed(1);
  if(left) left.lfo.frequency.setTargetAtTime(state.rate, ctx.currentTime, 0.05);
  if(right) right.lfo.frequency.setTargetAtTime(state.rate, ctx.currentTime, 0.05);
  updateStatus();
});

depthSlider.addEventListener("input", () => {
  state.depth = parseInt(depthSlider.value, 10);
  depthVal.textContent = state.depth;
  const floor = 1 - (state.depth/100);
  [left, right].forEach(chain => {
    if(!chain) return;
    chain.lfoDepth.gain.setTargetAtTime((1 - floor) / 2, ctx.currentTime, 0.05);
    chain.lfoOffset.offset.setTargetAtTime(floor + (1 - floor) / 2, ctx.currentTime, 0.05);
  });
  updateStatus();
});

strengthSlider.addEventListener("input", () => {
  state.strength = parseInt(strengthSlider.value, 10);
  strengthVal.textContent = state.strength;
  applyChannelGains();
  applySpectraChannelGains();
  updateStatus();
});

shapeRow.addEventListener("click", (e) => {
  const pill = e.target.closest(".pill");
  if(!pill) return;
  [...shapeRow.children].forEach(c => c.classList.remove("active"));
  pill.classList.add("active");
  state.shape = pill.dataset.shape;
  if(left) left.lfo.type = state.shape;
  if(right) right.lfo.type = state.shape;
  updateStatus();
});

channelRow.addEventListener("click", (e) => {
  const pill = e.target.closest(".pill");
  if(!pill) return;
  [...channelRow.children].forEach(c => c.classList.remove("active"));
  pill.classList.add("active");
  state.channel = pill.dataset.channel;
  applyChannelGains();
  applySpectraChannelGains();
  updateStatus();
});

redSlider.addEventListener("input", () => {
  state.red = parseInt(redSlider.value, 10);
  redVal.textContent = state.red;
  if(genSsLeft) genSsLeft.rGain.gain.setTargetAtTime(state.red/100, ctx.currentTime, 0.05);
  if(genSsRight) genSsRight.rGain.gain.setTargetAtTime(state.red/100, ctx.currentTime, 0.05);
  updateStatus();
});

greenSlider.addEventListener("input", () => {
  state.green = parseInt(greenSlider.value, 10);
  greenVal.textContent = state.green;
  if(genSsLeft) genSsLeft.gGain.gain.setTargetAtTime(state.green/100, ctx.currentTime, 0.05);
  if(genSsRight) genSsRight.gGain.gain.setTargetAtTime(state.green/100, ctx.currentTime, 0.05);
  updateStatus();
});

blueSlider.addEventListener("input", () => {
  state.blue = parseInt(blueSlider.value, 10);
  blueVal.textContent = state.blue;
  if(genSsLeft) genSsLeft.bGain.gain.setTargetAtTime(state.blue/100, ctx.currentTime, 0.05);
  if(genSsRight) genSsRight.bGain.gain.setTargetAtTime(state.blue/100, ctx.currentTime, 0.05);
  updateStatus();
});

// ---------- Play a File — Luminous Only ----------
// A fully standalone Screen Mode: pick a track, decode its real embedded
// signal, and watch it — no Session, no tone engines, no Home involved at
// all. Reuses the same decoder, warning, and preferences modules Session
// uses, but runs its own separate audio graph and its own copy of the
// countdown/pause/confirm state machine, since this page has no access to
// Session's — they're genuinely separate JavaScript environments once
// loaded as separate pages.

import { loadTrackList } from "./ambient-library.js";
import {
  buildDecoderBank, readDecoderLevels, smoothLevels,
  audioStrobeSignalPresent, detectSpectraStrobeReference, detectLumasonic,
  levelsToColorSpectra, levelsToColorLumasonic, signalStrengthFactor, adaptiveBrightness, noiseBaseline,
} from "./luminous-decode.js";
import { broadcastStopAll, onBroadcastStopAll } from "./luminous-broadcast.js";

const standaloneTrackSelect = document.getElementById("standaloneTrackSelect");
const standaloneStartBtn = document.getElementById("standaloneStartBtn");

const ssOverlay = document.getElementById("screenStrobeOverlay");
const ssLeft = document.getElementById("screenStrobeLeft");
const ssRight = document.getElementById("screenStrobeRight");
const ssCountdown = document.getElementById("screenStrobeCountdown");
const ssCountdownNum = document.getElementById("screenStrobeCountdownNum");
const ssRotateHint = document.getElementById("screenStrobeRotateHint");
const ssControls = document.getElementById("screenStrobeControls");
ssControls.addEventListener("click", (e) => e.stopPropagation());
ssControls.addEventListener("pointerdown", (e) => e.stopPropagation());
const ssBrightness = document.getElementById("screenStrobeBrightness");
const ssConfirm = document.getElementById("screenStrobeConfirm");
const ssConfirmStop = document.getElementById("screenStrobeConfirmStop");
const ssConfirmContinue = document.getElementById("screenStrobeConfirmContinue");
const ssSignalDot = document.getElementById("screenStrobeSignalDot");

let standaloneTracks = [];
let saCtx = null, saSource = null, saDecoderBank = null;
let saRunning = false, saPaused = false, saRafId = null, saPhaseStart = 0, saMode = null;
let saSensitivity = 4;
let saCountdownTimer = null, saConfirmTimer = null, saFadeTimer = null, saWakeLock = null, saStopTimer = null;
let saDecodeLastTime = 0;

(async function loadStandaloneTracks(){
  try{ standaloneTracks = await loadTrackList(); }
  catch(e){ console.warn("Could not load track library:", e); }
  standaloneTrackSelect.innerHTML = "";
  if(!standaloneTracks.length){
    standaloneTrackSelect.innerHTML = `<option value="">No files in your library yet — add some in Settings</option>`;
    return;
  }
  const placeholder = document.createElement("option");
  placeholder.value = ""; placeholder.textContent = "Choose a track…";
  standaloneTrackSelect.appendChild(placeholder);
  standaloneTracks.forEach((t, i) => {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = t.name + (t.hasEmbeddedLight ? " 💡" : "");
    standaloneTrackSelect.appendChild(opt);
  });
})();

function saApplyOrientation(){
  const isPortrait = window.matchMedia("(orientation: portrait)").matches;
  ssOverlay.style.flexDirection = isPortrait ? "column" : "row";
}
window.addEventListener("orientationchange", saApplyOrientation);
window.matchMedia("(orientation: portrait)").addEventListener?.("change", saApplyOrientation);

standaloneStartBtn.addEventListener("click", () => {
  const idx = parseInt(standaloneTrackSelect.value, 10);
  if(isNaN(idx) || !standaloneTracks[idx]) return;
  showLuminousWarning(() => startStandaloneSequence(standaloneTracks[idx]), () => {});
});

async function startStandaloneSequence(track){
  const prefs = getLuminousPrefs();
  ssBrightness.value = prefs.screenBrightnessDefault;
  saSensitivity = prefs.sensitivity;

  try{ saCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 }); }
  catch(e){ saCtx = new (window.AudioContext || window.webkitAudioContext)(); }
  if(saCtx.state === "suspended") await saCtx.resume();

  let arrayBuffer;
  if(track.source === "bundled"){
    const resp = await fetch(track.file);
    arrayBuffer = await resp.arrayBuffer();
  } else if(track.blob){
    arrayBuffer = await track.blob.arrayBuffer();
  } else {
    console.warn("Track has no playable audio source");
    return;
  }
  const audioBuffer = await saCtx.decodeAudioData(arrayBuffer);

  saSource = saCtx.createBufferSource();
  saSource.buffer = audioBuffer;
  const trackGain = saCtx.createGain();
  trackGain.gain.value = 0.8;
  saSource.connect(trackGain);
  trackGain.connect(saCtx.destination);
  saDecoderBank = buildDecoderBank(saCtx, trackGain);

  saSource.onended = () => { if(saRunning) stopStandalone(); };

  ssOverlay.style.display = "flex";
  ssCountdown.style.display = "flex";
  ssControls.style.display = "block";
  ssLeft.style.opacity = 0;
  ssRight.style.opacity = 0;
  ssLeft.style.backgroundColor = "";
  ssRight.style.backgroundColor = "";
  saApplyOrientation();

  try{ await ssOverlay.requestFullscreen?.(); }catch(e){}
  try{ await screen.orientation?.lock?.("landscape"); }catch(e){}
  try{ saWakeLock = await navigator.wakeLock?.request("screen"); }catch(e){}
  saApplyOrientation();
  ssRotateHint.style.display = window.matchMedia("(orientation: portrait)").matches ? "block" : "none";

  ssOverlay.addEventListener("click", saHandleOverlayTap);

  let count = Math.max(5, Math.min(15, prefs.countdownSeconds));
  ssCountdownNum.textContent = count;
  saCountdownTimer = setInterval(() => {
    count--;
    if(count <= 0){
      clearInterval(saCountdownTimer);
      saCountdownTimer = null;
      ssCountdown.style.display = "none";
      saSource.start();
      beginStandaloneFlicker(Math.min(audioBuffer.duration, 20 * 60));
    } else {
      ssCountdownNum.textContent = count;
    }
  }, 1000);
}

function beginStandaloneFlicker(safetyCapSeconds){
  saRunning = true;
  saPhaseStart = performance.now();
  saMode = null;
  saDecodeLastTime = 0;
  saStopTimer = setTimeout(stopStandalone, safetyCapSeconds * 1000);
  saRafId = requestAnimationFrame(saLoop);
}

function saUpdateSignalDot(levels){
  const strength = signalStrengthFactor(levels, saSensitivity);
  const r = Math.round(224 - (224-70)*strength);
  const g = Math.round(90 + (200-90)*strength);
  const b = 70;
  ssSignalDot.style.background = `rgb(${r}, ${g}, ${b})`;
}

function saLoop(now){
  if(!saRunning) return;
  const dtSeconds = saDecodeLastTime ? (now - saDecodeLastTime) / 1000 : 1/60;
  saDecodeLastTime = now;

  const rawLevels = readDecoderLevels(saDecoderBank);
  saUpdateSignalDot(rawLevels);
  const isLumasonic = detectLumasonic(rawLevels, saSensitivity);
  const isSpectra = !isLumasonic && detectSpectraStrobeReference(saDecoderBank, rawLevels, saSensitivity);
  const hasAudioStrobe = !isLumasonic && !isSpectra && audioStrobeSignalPresent(rawLevels, saSensitivity);
  const levels = smoothLevels(saDecoderBank, rawLevels, dtSeconds);
  const brightnessCeiling = parseInt(ssBrightness.value, 10) / 100;
  const baseline = noiseBaseline(rawLevels);

  if(isLumasonic){
    saMode = "lumasonic";
    const l = levelsToColorLumasonic(levels.left, baseline), r = levelsToColorLumasonic(levels.right, baseline);
    ssLeft.style.backgroundColor = `rgb(${l.r}, ${l.g}, ${l.b})`;
    ssRight.style.backgroundColor = `rgb(${r.r}, ${r.g}, ${r.b})`;
    ssLeft.style.opacity = brightnessCeiling.toFixed(3);
    ssRight.style.opacity = brightnessCeiling.toFixed(3);
  } else if(isSpectra){
    saMode = "spectra";
    const l = levelsToColorSpectra(levels.left, baseline), r = levelsToColorSpectra(levels.right, baseline);
    ssLeft.style.backgroundColor = `rgb(${l.r}, ${l.g}, ${l.b})`;
    ssRight.style.backgroundColor = `rgb(${r.r}, ${r.g}, ${r.b})`;
    ssLeft.style.opacity = brightnessCeiling.toFixed(3);
    ssRight.style.opacity = brightnessCeiling.toFixed(3);
  } else if(hasAudioStrobe){
    if(saMode !== "audiostrobe"){ saMode = "audiostrobe"; ssLeft.style.backgroundColor = ""; ssRight.style.backgroundColor = ""; }
    ssLeft.style.opacity = (adaptiveBrightness(levels.left.as, baseline) * brightnessCeiling).toFixed(3);
    ssRight.style.opacity = (adaptiveBrightness(levels.right.as, baseline) * brightnessCeiling).toFixed(3);
  } else {
    // No signal right now — a genuinely quiet passage is real, authored
    // data, not an absence to paper over with a fabricated pattern. Go dark.
    if(saMode !== "silent"){ saMode = "silent"; ssLeft.style.backgroundColor = ""; ssRight.style.backgroundColor = ""; }
    ssLeft.style.opacity = "0";
    ssRight.style.opacity = "0";
  }

  saRafId = requestAnimationFrame(saLoop);
}

function saPauseAndConfirm(){
  if(saPaused) return;
  saPaused = true;
  if(saRafId){ cancelAnimationFrame(saRafId); saRafId = null; }
  ssLeft.style.opacity = 0;
  ssRight.style.opacity = 0;
  ssConfirm.style.display = "flex";
  ssConfirm.style.opacity = "1";
  saConfirmTimer = setTimeout(() => {
    ssConfirm.style.opacity = "0"; // fades rather than snapping away when nobody responds
    saFadeTimer = setTimeout(saResumeFlicker, 500);
  }, 2000);
}

function saResumeFlicker(){
  if(saConfirmTimer){ clearTimeout(saConfirmTimer); saConfirmTimer = null; }
  if(saFadeTimer){ clearTimeout(saFadeTimer); saFadeTimer = null; }
  ssConfirm.style.display = "none";
  ssConfirm.style.opacity = "1"; // reset so it's ready to show fully next time
  saPaused = false;
  if(saRunning) saRafId = requestAnimationFrame(saLoop);
}

function saHandleOverlayTap(){
  if(saPaused) return;
  if(!saRunning){
    stopStandalone(); // still in the countdown — nothing disruptive happening yet
  } else {
    saPauseAndConfirm();
  }
}

ssConfirmStop.addEventListener("click", (e) => {
  e.stopPropagation();
  if(saConfirmTimer){ clearTimeout(saConfirmTimer); saConfirmTimer = null; }
  if(saFadeTimer){ clearTimeout(saFadeTimer); saFadeTimer = null; }
  ssConfirm.style.display = "none";
  saPaused = false;
  stopStandalone();
  broadcastStopAll(); // reach across to Session too, even in a separate tab
});
ssConfirmContinue.addEventListener("click", (e) => {
  e.stopPropagation();
  saResumeFlicker();
});

async function stopStandalone(){
  saRunning = false;
  if(saRafId) cancelAnimationFrame(saRafId);
  if(saCountdownTimer){ clearInterval(saCountdownTimer); saCountdownTimer = null; }
  if(saConfirmTimer){ clearTimeout(saConfirmTimer); saConfirmTimer = null; }
  if(saFadeTimer){ clearTimeout(saFadeTimer); saFadeTimer = null; }
  if(saStopTimer){ clearTimeout(saStopTimer); saStopTimer = null; }
  saPaused = false;
  ssConfirm.style.display = "none";
  ssConfirm.style.opacity = "1";
  ssOverlay.style.display = "none";
  ssControls.style.display = "block";
  try{ saSource?.stop(); }catch(e){}
  saSource = null;
  try{ saWakeLock?.release(); }catch(e){}
  saWakeLock = null;
  try{ if(document.fullscreenElement) await document.exitFullscreen(); }catch(e){}
  try{ if(saCtx) await saCtx.close(); }catch(e){}
  saCtx = null;
}

// If Session (or another tab) broadcasts a stop, stop here too.
onBroadcastStopAll(() => { if(saRunning || saCountdownTimer) stopStandalone(); });
