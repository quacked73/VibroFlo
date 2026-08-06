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

// ---------- Live Session Behavior (persisted preferences) ----------
const prefFadeIn = document.getElementById("prefFadeIn");
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

// ---------- Test Your Hardware (unchanged from before) ----------

const powerBtn = document.getElementById("lumPowerBtn");
const statusEl = document.getElementById("lumStatus");

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

const state = {
  freq: 19200,
  rate: 10,
  depth: 100,
  strength: 80,
  shape: "sine",
  channel: "both",
};

let ctx = null;
let running = false;

// One carrier + LFO-gate + panner chain per output channel, so "left only" /
// "right only" can genuinely silence the other side rather than just panning
// a shared signal.
let left = null, right = null;

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

function start(){
  if(running) return;
  if(!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if(ctx.state === "suspended") ctx.resume();

  left = buildChain(-1);
  right = buildChain(1);
  applyChannelGains();

  running = true;
  powerBtn.classList.add("on");
  statusEl.style.display = "block";
  updateStatus();
}

function stop(){
  if(!running) return;
  stopChain(left);
  stopChain(right);
  left = null; right = null;
  running = false;
  powerBtn.classList.remove("on");
  statusEl.style.display = "none";
}

function updateStatus(){
  if(!running) return;
  statusEl.textContent =
    `Running — ${state.freq}Hz carrier, pulsing at ${state.rate.toFixed(1)}Hz, ` +
    `${state.depth}% depth, ${state.shape === "sine" ? "smooth" : "sharp"} gate, ${state.channel} channel(s).`;
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
  updateStatus();
});
