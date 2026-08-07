// VibroFlō — main application module
// Ported from the original single-file build. Organized by feature with
// clear section banners; a deeper per-feature module split is a planned
// follow-up once this structure has been proven in production.

import { BANDS, ARCS, BREATH_PATTERNS, ENGINE_KEYS, SOLFEGGIO_TONES } from "./constants.js";
import { dbGet, dbPut, dbGetAll, makeId } from "./db.js";
import { decodeBundledTrack } from "./sample-library.js";
import { loadTrackList, fetchSyncedTrackBlob } from "./ambient-library.js";
import { renderNav, setNavBackgroundMode } from "./nav.js";
import { logoSVG } from "./logo.js";
import { initTour } from "./tour.js";
import { showLuminousWarning, showScreenStrobeWarning } from "./luminous-safety.js";
import { bestFitLuminousRate, computeEyeDriftOffset, computeBrightnessWander, driftScaleForBand } from "./luminous-math.js";
import { getLuminousPrefs } from "./luminous-prefs.js";
import { broadcastStopAll, onBroadcastStopAll } from "./luminous-broadcast.js";
import { buildDecoderBank, readDecoderLevels, smoothLevels, audioStrobeSignalPresent, detectSpectraStrobeReference, detectLumasonic, levelsToColorSpectra, levelsToColorLumasonic, signalStrengthFactor } from "./luminous-decode.js";

renderNav("session");
document.getElementById("logoMark").innerHTML = logoSVG(34);


  // ---------- Dual engines: Low (20-120Hz) and High (100Hz-1kHz) ----------
  const els = {
    low: {
      panel: document.getElementById("lowPanel"),
      bandRow: document.getElementById("bandRowLow"),
      toneModeRow: document.getElementById("toneModeRowLow"),
      carrierSlider: document.getElementById("carrierLow"),
      carrierVal: document.getElementById("carrierLowVal"),
      beatSlider: document.getElementById("beatLow"),
      beatVal: document.getElementById("beatLowVal"),
      beatRow: document.getElementById("beatRowLow"),
      volumeSlider: document.getElementById("volumeLow"),
      volumeVal: document.getElementById("volumeLowVal"),
      balanceSlider: document.getElementById("balanceLow"),
      balanceVal: document.getElementById("balanceLowVal"),
      freqL: document.getElementById("freqLLow"),
      freqR: document.getElementById("freqRLow"),
      freqBeat: document.getElementById("freqBeatLow"),
      bandName: document.getElementById("bandNameLow"),
      colorL: "#b3a1ff", colorR: "#f2b8d8",
    },
    high: {
      panel: document.getElementById("highPanel"),
      bandRow: document.getElementById("bandRowHigh"),
      toneModeRow: document.getElementById("toneModeRowHigh"),
      carrierSlider: document.getElementById("carrierHigh"),
      carrierVal: document.getElementById("carrierHighVal"),
      beatSlider: document.getElementById("beatHigh"),
      beatVal: document.getElementById("beatHighVal"),
      beatRow: document.getElementById("beatRowHigh"),
      volumeSlider: document.getElementById("volumeHigh"),
      volumeVal: document.getElementById("volumeHighVal"),
      balanceSlider: document.getElementById("balanceHigh"),
      balanceVal: document.getElementById("balanceHighVal"),
      freqL: document.getElementById("freqLHigh"),
      freqR: document.getElementById("freqRHigh"),
      freqBeat: document.getElementById("freqBeatHigh"),
      bandName: document.getElementById("bandNameHigh"),
      colorL: "#9fd8ff", colorR: "#ffd59e",
    },
  };

  const engineTabRow = document.getElementById("engineTabRow");
  const combineSwitch = document.getElementById("combineSwitch");

  // Configured on the Luminous settings page, not here — read once at load.
  // Session only exposes simple on/off toggles; the detailed tuning lives there.
  const luminousPrefs = getLuminousPrefs();

  let state = {
    engines: {
      low:  { carrier: 60,  beatBase: 10, beatCurrent: 10, currentBand: "alpha", toneMode: "binaural", volume: 55, balance: 0, muted: false },
      high: { carrier: 300, beatBase: 10, beatCurrent: 10, currentBand: "alpha", toneMode: "binaural", volume: 55, balance: 0, muted: false },
    },
    activeTab: "low",
    combineOn: false,
    luminousOn: false,
    luminousEyeDrift: luminousPrefs.eyeDrift,
    luminousBrightnessVar: luminousPrefs.brightnessVar,
    luminousFollowMusic: luminousPrefs.followMusic,
    screenStrobeOn: false,
    driftOn: false,
    driftDepth: 1,
    driftRate: 1.5,
    noiseType: "off",
    noiseLevel: 20,
    arcMode: "off",
    breathPattern: "off",
    breathSoundOn: false,
    breathSoundVolume: 30,
    endingStyle: "fadeout",
    wakeWindowMs: 0,
    presets: [],
    moodBefore: null,
    moodAfter: null,
  };

  ENGINE_KEYS.forEach(key => {
    const el = els[key];
    Object.entries(BANDS).forEach(([bkey, b]) => {
      const btn = document.createElement("div");
      btn.className = "band-btn" + (bkey === state.engines[key].currentBand ? " active" : "");
      btn.dataset.band = bkey;
      btn.innerHTML = `${b.label}<small>${b.sub.split(" · ")[0]}</small>`;
      btn.addEventListener("click", () => selectEngineBand(key, bkey));
      el.bandRow.appendChild(btn);
    });
  });

  function selectEngineBand(key, bandKey){
    const e = state.engines[key];
    const el = els[key];
    e.currentBand = bandKey;
    [...el.bandRow.children].forEach(c => c.classList.toggle("active", c.dataset.band === bandKey));
    const b = BANDS[bandKey];
    el.beatSlider.min = b.min; el.beatSlider.max = b.max; el.beatSlider.value = b.def;
    el.bandName.textContent = b.label;
    updateEngineBeatFromSlider(key);
  }

  function updateEngineBeatFromSlider(key){
    const e = state.engines[key];
    e.beatBase = parseFloat(els[key].beatSlider.value);
    e.beatCurrent = e.beatBase;
    els[key].beatVal.textContent = e.beatBase.toFixed(1);
    applyEngineFrequencies(key);
    updateLuminousModulation();
  }

  ENGINE_KEYS.forEach(key => {
    const e = state.engines[key];
    const el = els[key];
    el.carrierSlider.addEventListener("input", () => {
      e.carrier = parseFloat(el.carrierSlider.value);
      el.carrierVal.textContent = e.carrier.toFixed(0);
      applyEngineFrequencies(key);
    });
    el.beatSlider.addEventListener("input", () => updateEngineBeatFromSlider(key));
    el.volumeSlider.addEventListener("input", () => {
      e.volume = parseFloat(el.volumeSlider.value);
      el.volumeVal.textContent = e.volume.toFixed(0);
      applyEngineMix(key);
    });
    el.balanceSlider.addEventListener("input", () => {
      e.balance = parseFloat(el.balanceSlider.value);
      el.balanceVal.textContent = e.balance === 0 ? "C" : (e.balance < 0 ? `L${Math.abs(e.balance)}` : `R${e.balance}`);
      applyEngineMix(key);
    });
    el.toneModeRow.addEventListener("click", (evt) => {
      const pill = evt.target.closest(".pill");
      if(!pill) return;
      [...el.toneModeRow.children].forEach(c => c.classList.remove("active"));
      pill.classList.add("active");
      setEngineToneMode(key, pill.dataset.mode);
    });
  });

  function updatePanelVisibility(){
    els.low.panel.style.display = (state.activeTab === "low" || state.combineOn) ? "" : "none";
    els.high.panel.style.display = (state.activeTab === "high" || state.combineOn) ? "" : "none";
  }

  // An engine is actually audible when its tab is showing (or Combine is on)
  // AND it isn't individually muted — mute is a hard override on top of that.
  function isEngineAudible(key){
    return (state.activeTab === key || state.combineOn) && !state.engines[key].muted;
  }

  function updateEngineGains(){
    if(!ctx) return;
    const now = ctx.currentTime;
    if(audioEngines.low.outGain) audioEngines.low.outGain.gain.setTargetAtTime(isEngineAudible("low") ? 1 : 0, now, 0.15);
    if(audioEngines.high.outGain) audioEngines.high.outGain.gain.setTargetAtTime(isEngineAudible("high") ? 1 : 0, now, 0.15);
  }

  engineTabRow.addEventListener("click", (e) => {
    const pill = e.target.closest(".pill");
    if(!pill) return;
    [...engineTabRow.children].forEach(c => c.classList.remove("active"));
    pill.classList.add("active");
    state.activeTab = pill.dataset.tab;
    updatePanelVisibility();
    updateEngineGains();
    updateLuminousModulation();
  });
  combineSwitch.addEventListener("click", () => {
    state.combineOn = !state.combineOn;
    combineSwitch.classList.toggle("on", state.combineOn);
    updatePanelVisibility();
    updateEngineGains();
  });

  const muteLowSwitch = document.getElementById("muteLowSwitch");
  const muteHighSwitch = document.getElementById("muteHighSwitch");
  muteLowSwitch.addEventListener("click", () => {
    state.engines.low.muted = !state.engines.low.muted;
    muteLowSwitch.classList.toggle("on", state.engines.low.muted);
    updateEngineGains();
  });
  muteHighSwitch.addEventListener("click", () => {
    state.engines.high.muted = !state.engines.high.muted;
    muteHighSwitch.classList.toggle("on", state.engines.high.muted);
    updateEngineGains();
  });

  const driftDepthSlider = document.getElementById("driftDepth");
  const driftRateSlider = document.getElementById("driftRate");
  const driftDepthVal = document.getElementById("driftDepthVal");
  const driftRateVal = document.getElementById("driftRateVal");
  const driftSwitch = document.getElementById("driftSwitch");
  const noiseLevelSlider = document.getElementById("noiseLevel");
  const noiseVal = document.getElementById("noiseVal");
  const noiseRow = document.getElementById("noiseRow");
  const arcRow = document.getElementById("arcRow");
  const arcStatusEl = document.getElementById("arcStatus");
  const breathRow = document.getElementById("breathRow");
  const endingRow = document.getElementById("endingRow");

  driftSwitch.addEventListener("click", () => {
    state.driftOn = !state.driftOn;
    driftSwitch.classList.toggle("on", state.driftOn);
  });
  driftDepthSlider.addEventListener("input", () => {
    state.driftDepth = parseFloat(driftDepthSlider.value);
    driftDepthVal.textContent = state.driftDepth.toFixed(1);
  });
  driftRateSlider.addEventListener("input", () => {
    state.driftRate = parseFloat(driftRateSlider.value);
    driftRateVal.textContent = state.driftRate.toFixed(1);
  });

  arcRow.addEventListener("click", (e) => {
    const pill = e.target.closest(".pill");
    if(!pill) return;
    [...arcRow.children].forEach(c => c.classList.remove("active"));
    pill.classList.add("active");
    state.arcMode = pill.dataset.arc;
    const arcOn = state.arcMode !== "off";
    ENGINE_KEYS.forEach(key => {
      els[key].bandRow.classList.toggle("disabled-control", arcOn);
      els[key].beatRow.classList.toggle("disabled-control", arcOn);
    });
    arcStatusEl.style.display = arcOn ? "block" : "none";
    if(arcOn) arcStartedAt = Date.now();
  });

  breathRow.addEventListener("click", (e) => {
    const pill = e.target.closest(".pill");
    if(!pill) return;
    [...breathRow.children].forEach(c => c.classList.remove("active"));
    pill.classList.add("active");
    state.breathPattern = pill.dataset.breath;
  });

  const breathSoundSwitch = document.getElementById("breathSoundSwitch");
  const breathSoundVolumeSlider = document.getElementById("breathSoundVolume");
  const breathSoundVolumeVal = document.getElementById("breathSoundVolumeVal");

  breathSoundSwitch.addEventListener("click", () => {
    state.breathSoundOn = !state.breathSoundOn;
    breathSoundSwitch.classList.toggle("on", state.breathSoundOn);
    if(ctx && breathSoundGain){
      breathSoundGain.gain.setTargetAtTime(state.breathSoundOn ? state.breathSoundVolume/100 : 0, ctx.currentTime, 0.1);
    }
  });
  breathSoundVolumeSlider.addEventListener("input", () => {
    state.breathSoundVolume = parseFloat(breathSoundVolumeSlider.value);
    breathSoundVolumeVal.textContent = state.breathSoundVolume.toFixed(0);
    if(ctx && breathSoundGain && state.breathSoundOn){
      breathSoundGain.gain.setTargetAtTime(state.breathSoundVolume/100, ctx.currentTime, 0.1);
    }
  });

  endingRow.addEventListener("click", (e) => {
    const pill = e.target.closest(".pill");
    if(!pill) return;
    [...endingRow.children].forEach(c => c.classList.remove("active"));
    pill.classList.add("active");
    state.endingStyle = pill.dataset.ending;
  });

  noiseRow.addEventListener("click", (e) => {
    const pill = e.target.closest(".pill");
    if(!pill) return;
    [...noiseRow.children].forEach(c => c.classList.remove("active"));
    pill.classList.add("active");
    state.noiseType = pill.dataset.noise;
    applyNoiseType();
  });
  noiseLevelSlider.addEventListener("input", () => {
    state.noiseLevel = parseFloat(noiseLevelSlider.value);
    noiseVal.textContent = state.noiseLevel.toFixed(0);
    applyNoiseLevel();
  });

  // EMDR bilateral pan controls
  const emdrSwitch = document.getElementById("emdrSwitch");
  const emdrSoundRow = document.getElementById("emdrSoundRow");
  const emdrSpeedSlider = document.getElementById("emdrSpeed");
  const emdrVolumeSlider = document.getElementById("emdrVolume");
  const emdrSpeedVal = document.getElementById("emdrSpeedVal");
  const emdrVolumeVal = document.getElementById("emdrVolumeVal");
  const emdrReverbSlider = document.getElementById("emdrReverb");
  const emdrReverbVal = document.getElementById("emdrReverbVal");

  state.emdrOn = false;
  state.emdrSound = "drum";
  state.emdrBpm = 60;
  state.emdrVolume = 35;
  state.emdrReverbDepth = 30;

  emdrSwitch.addEventListener("click", () => {
    state.emdrOn = !state.emdrOn;
    emdrSwitch.classList.toggle("on", state.emdrOn);
    if(state.emdrOn && running){ armNextEmdrHit(); emdrScheduler(); }
  });
  emdrSoundRow.addEventListener("click", (e) => {
    const pill = e.target.closest(".pill");
    if(!pill) return;
    [...emdrSoundRow.children].forEach(c => c.classList.remove("active"));
    pill.classList.add("active");
    state.emdrSound = pill.dataset.sound;
  });
  emdrSpeedSlider.addEventListener("input", () => {
    state.emdrBpm = parseFloat(emdrSpeedSlider.value);
    emdrSpeedVal.textContent = state.emdrBpm.toFixed(0);
  });
  emdrVolumeSlider.addEventListener("input", () => {
    state.emdrVolume = parseFloat(emdrVolumeSlider.value);
    emdrVolumeVal.textContent = state.emdrVolume.toFixed(0);
    if(emdrGain && ctx) emdrGain.gain.setTargetAtTime(state.emdrVolume/100, ctx.currentTime, 0.05);
  });
  emdrReverbSlider.addEventListener("input", () => {
    state.emdrReverbDepth = parseFloat(emdrReverbSlider.value);
    emdrReverbVal.textContent = state.emdrReverbDepth.toFixed(0);
    if(emdrSendBus && ctx) emdrSendBus.gain.setTargetAtTime((state.emdrReverbDepth/100) * 0.85, ctx.currentTime, 0.05);
  });

  // ---------- Luminous sync: optional AudioStrobe-compatible light signal ----------
  // Same technique proven out on the standalone Luminous test page — an LFO
  // gates a high-frequency carrier's amplitude. The base rate continuously
  // tracks whichever engine's beat frequency is currently active, so it
  // inherits Drift's wander and any Session Arc glide automatically. Eye
  // Drift and Brightness Variation reuse the exact same smooth two-sine-wave
  // wander technique Variability Drift already uses on the tone engines,
  // just aimed at new targets (the left/right rate difference, and overall
  // brightness) with their own independent timebase and phase constants.
  const luminousSwitch = document.getElementById("luminousSwitch");
  const luminousNote = document.getElementById("luminousNote");
  const LUMINOUS_FREQ = 19200;
  const LUMINOUS_BASE_STRENGTH = 0.8;
  let luminousLeft = null, luminousRight = null;
  let luminousPhaseTime = 0; // independent of driftPhaseTime, so it doesn't move in lockstep with tone drift
  let luminousFadeInStart = 0;
  let luminousSuppressed = false; // true while the current ambient track already has its own embedded light signal

  function buildLuminousChannel(pan){
    const carrier = ctx.createOscillator();
    carrier.type = "sine";
    carrier.frequency.value = LUMINOUS_FREQ;

    const gate = ctx.createGain();
    gate.gain.value = 0; // baseline comes entirely from lfoOffset — must stay 0 or it double-counts

    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = Math.max(0.1, state.engines[state.activeTab].beatCurrent);

    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.5; // full-depth flash: gate swings between 0 and 1
    const lfoOffset = ctx.createConstantSource();
    lfoOffset.offset.value = 0.5;

    lfo.connect(lfoDepth);
    lfoDepth.connect(gate.gain);
    lfoOffset.connect(gate.gain);

    const strength = ctx.createGain();
    strength.gain.value = 0; // starts silent — startLuminous() fades this up, doesn't jump straight in

    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;

    carrier.connect(gate);
    gate.connect(strength);
    strength.connect(panner);
    panner.connect(ctx.destination);

    carrier.start(); lfo.start(); lfoOffset.start();
    return { carrier, gate, lfo, lfoDepth, lfoOffset, strength, panner };
  }

  function stopLuminousChannel(chain){
    if(!chain) return;
    try{ chain.carrier.stop(); }catch(e){}
    try{ chain.lfo.stop(); }catch(e){}
    try{ chain.lfoOffset.stop(); }catch(e){}
  }

  function startLuminous(){
    if(!ctx || luminousLeft) return;
    luminousLeft = buildLuminousChannel(-1);
    luminousRight = buildLuminousChannel(1);
    luminousPhaseTime = 0;
    luminousFadeInStart = Date.now();
    luminousNote.style.display = "block";
    updateLuminousModulation();
  }

  function stopLuminous(){
    stopLuminousChannel(luminousLeft);
    stopLuminousChannel(luminousRight);
    luminousLeft = null; luminousRight = null;
    luminousNote.style.display = "none";
  }

  // Called on Drift's own 150ms cadence (piggybacking driftTick, since this
  // needs the same "smooth continuous wander" cadence) and immediately on
  // any manual change — tab switch, band change, slider tweak. The actual
  // wander/mapping math lives in luminous-math.js, shared with the
  // phone-screen flicker mode so the two never drift apart from each other.
  function updateLuminousModulation(){
    if(!luminousLeft || !ctx) return;
    const baseRate = bestFitLuminousRate(Math.max(0.1, state.engines[state.activeTab].beatCurrent));
    const driftScale = driftScaleForBand(state.engines[state.activeTab].currentBand);
    const eyeOffset = computeEyeDriftOffset(luminousPhaseTime, state.luminousEyeDrift) * driftScale;
    luminousLeft.lfo.frequency.setTargetAtTime(Math.max(0.1, baseRate - eyeOffset/2), ctx.currentTime, 0.3);
    luminousRight.lfo.frequency.setTargetAtTime(Math.max(0.1, baseRate + eyeOffset/2), ctx.currentTime, 0.3);

    // Follow Music (if on) drives strength continuously from the rAF loop
    // instead — skip the drift-based wander so the two don't fight over the
    // same parameter. Embedded-signal suppression overrides both.
    if(!state.luminousFollowMusic){
      const fadeInSec = Math.max(0.1, luminousPrefs.fadeInSeconds);
      const fadeInFactor = Math.min(1, (Date.now() - luminousFadeInStart) / (fadeInSec*1000));
      const wander = computeBrightnessWander(luminousPhaseTime, state.luminousBrightnessVar);
      const target = luminousSuppressed ? 0 : Math.max(0.05, Math.min(1, LUMINOUS_BASE_STRENGTH + wander)) * fadeInFactor;
      luminousLeft.strength.gain.setTargetAtTime(target, ctx.currentTime, 0.3);
      luminousRight.strength.gain.setTargetAtTime(target, ctx.currentTime, 0.3);
    }
    updateLuminousNote();
  }

  // Real-time brightness-follows-music — reads the ambient bus's actual
  // loudness every animation frame, same technique already driving the
  // visualizer's breathing orbs, just pointed at a new destination.
  function updateLuminousFollowMusic(){
    if(!state.luminousFollowMusic || !luminousLeft || !ctx || !ambientAnalyser) return;
    if(luminousSuppressed){
      luminousLeft.strength.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
      luminousRight.strength.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
      return;
    }
    const level = getRms(ambientAnalyser);
    const fadeInSec = Math.max(0.1, luminousPrefs.fadeInSeconds);
    const fadeInFactor = Math.min(1, (Date.now() - luminousFadeInStart) / (fadeInSec*1000));
    const target = Math.max(0.05, Math.min(1, level * 4)) * fadeInFactor; // ambient RMS is typically well under 1.0
    luminousLeft.strength.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
    luminousRight.strength.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
  }

  // Called whenever a new ambient track starts, so Luminous automatically
  // goes quiet for anything tagged as already having its own embedded
  // signal — two overlapping signals in that band would just garble each
  // other at the decoder.
  function setLuminousSuppressed(suppressed){
    luminousSuppressed = suppressed;
    updateLuminousModulation();
  }

  function updateLuminousNote(){
    if(!luminousLeft) return;
    if(luminousSuppressed){
      luminousNote.textContent = "Paused — the current track already has its own embedded light signal, so Luminous is staying quiet to avoid clashing with it.";
      return;
    }
    const rawRate = state.engines[state.activeTab].beatCurrent;
    const mappedRate = bestFitLuminousRate(Math.max(0.1, rawRate));
    const engineLabel = state.activeTab === "low" ? "Low" : "High";
    const mappingNote = Math.abs(mappedRate - rawRate) > 0.05
      ? ` (stepped up from the ${rawRate.toFixed(1)}Hz tone — too slow to read as a flash on its own)`
      : "";
    const extra = state.luminousFollowMusic ? " Brightness is following the ambient track's volume." : "";
    luminousNote.textContent = `Sending an inaudible signal at ${mappedRate.toFixed(1)}Hz${mappingNote}, matching the ${engineLabel} engine.${extra} Needs compatible hardware (like a MindPlace Kasina) to see anything.`;
  }

  luminousSwitch.addEventListener("click", () => {
    if(state.luminousOn){
      // turning off needs no warning, just stop
      state.luminousOn = false;
      luminousSwitch.classList.remove("on");
      stopLuminous();
      return;
    }
    showLuminousWarning(
      () => { // confirmed
        state.luminousOn = true;
        luminousSwitch.classList.add("on");
        if(running) startLuminous();
      },
      () => { /* declined — leave the switch off, nothing else to do */ }
    );
  });

  // ---------- Screen Strobe: no external hardware, uses the phone's own
  // screen held against closed eyes. Reuses the exact same wander/mapping
  // math as the audio-based Luminous sync (via luminous-math.js), rendered
  // as two flickering screen-half panels instead of an audio signal.
  const screenStrobeSwitch = document.getElementById("screenStrobeSwitch");
  const screenStrobeOverlay = document.getElementById("screenStrobeOverlay");
  const screenStrobeLeft = document.getElementById("screenStrobeLeft");
  const screenStrobeRight = document.getElementById("screenStrobeRight");
  const screenStrobeCountdown = document.getElementById("screenStrobeCountdown");
  const screenStrobeCountdownNum = document.getElementById("screenStrobeCountdownNum");
  const screenStrobeRotateHint = document.getElementById("screenStrobeRotateHint");
  const screenStrobeControls = document.getElementById("screenStrobeControls");
  const screenStrobeBrightness = document.getElementById("screenStrobeBrightness");
  screenStrobeBrightness.value = luminousPrefs.screenBrightnessDefault;
  const screenStrobeConfirm = document.getElementById("screenStrobeConfirm");
  const screenStrobeConfirmStop = document.getElementById("screenStrobeConfirmStop");
  const screenStrobeConfirmContinue = document.getElementById("screenStrobeConfirmContinue");

  let screenStrobeRunning = false;
  let screenStrobeRafId = null;
  let screenStrobePhaseStart = 0;
  let screenStrobeStopTimer = null;
  let screenStrobeCountdownTimer = null;
  let wakeLockRef = null;

  screenStrobeSwitch.addEventListener("click", () => {
    if(state.screenStrobeOn){
      state.screenStrobeOn = false;
      screenStrobeSwitch.classList.remove("on");
      return;
    }
    showScreenStrobeWarning(
      () => {
        state.screenStrobeOn = true;
        screenStrobeSwitch.classList.add("on");
      },
      () => { /* declined — leave the switch off */ }
    );
  });

  // The left/right split only matches the eyes correctly in landscape.
  // screen.orientation.lock() works on Android/Chrome (only in fullscreen)
  // but Safari — desktop and iOS both — doesn't implement locking at all,
  // only detection. So rather than assume landscape, this reads whatever
  // orientation is ACTUALLY active and switches the split to match: side by
  // side in landscape, stacked top/bottom in portrait. Re-checks live if the
  // person rotates mid-session.
  function applyScreenStrobeOrientation(){
    const isPortrait = window.matchMedia("(orientation: portrait)").matches;
    screenStrobeOverlay.style.flexDirection = isPortrait ? "column" : "row";
  }
  window.addEventListener("orientationchange", applyScreenStrobeOrientation);
  window.matchMedia("(orientation: portrait)").addEventListener?.("change", applyScreenStrobeOrientation);

  async function startScreenStrobeSequence(){
    screenStrobeOverlay.style.display = "flex";
    screenStrobeCountdown.style.display = "flex";
    screenStrobeControls.style.display = "block";
    screenStrobeLeft.style.opacity = 0;
    screenStrobeRight.style.opacity = 0;
    applyScreenStrobeOrientation();

    try{ await screenStrobeOverlay.requestFullscreen?.(); }catch(e){ /* not available on this platform — overlay still covers the viewport */ }
    try{ await screen.orientation?.lock?.("landscape"); }catch(e){ /* Safari doesn't support locking at all — the adaptive layout above covers this instead */ }
    try{ wakeLockRef = await navigator.wakeLock?.request("screen"); }catch(e){ /* not available — screen may dim on its own after a while */ }
    applyScreenStrobeOrientation(); // re-check once — a successful lock() above may have just changed it
    screenStrobeRotateHint.style.display = window.matchMedia("(orientation: portrait)").matches ? "block" : "none";

    // Registered here, not just once the flicker begins, so tapping out
    // during the countdown itself works too — the main session's Stop
    // button is covered by this overlay the moment it appears, so this is
    // the only way out until the whole thing ends on its own. During the
    // countdown a tap stops immediately (nothing disruptive is happening
    // yet); once the actual flicker has started, a tap pauses and asks for
    // confirmation instead, so one accidental brush doesn't end the whole
    // thing.
    screenStrobeOverlay.addEventListener("click", handleScreenStrobeOverlayTap);

    let count = Math.max(5, Math.min(15, luminousPrefs.countdownSeconds));
    screenStrobeCountdownNum.textContent = count;
    screenStrobeCountdownTimer = setInterval(() => {
      count--;
      if(count <= 0){
        clearInterval(screenStrobeCountdownTimer);
        screenStrobeCountdownTimer = null;
        screenStrobeCountdown.style.display = "none";
        beginScreenStrobeFlicker();
      } else {
        screenStrobeCountdownNum.textContent = count;
      }
    }, 1000);
  }

  let screenStrobePaused = false; // true while the "Stop Luminous?" prompt is showing
  let screenStrobeConfirmTimer = null;

  function beginScreenStrobeFlicker(){
    screenStrobeRunning = true;
    screenStrobePhaseStart = performance.now();
    screenStrobeCurrentMode = null;
    luminousDecodeLastTime = 0;

    // Fixed-duration backup, using whatever Session Length is already set —
    // capped at 20 minutes even if the session itself is set to run
    // indefinitely, since this is a more intense exposure than any other
    // mode in the app and shouldn't ever run unbounded.
    const durationMs = (sessionMinutes > 0 ? Math.min(sessionMinutes, 20) : 20) * 60000;
    screenStrobeStopTimer = setTimeout(stopScreenStrobe, durationMs);

    screenStrobeRafId = requestAnimationFrame(screenStrobeLoop);
  }

  // Hoisted to module scope (not a closure inside beginScreenStrobeFlicker)
  // specifically so resumeScreenStrobeFlicker() can restart the exact same
  // loop after a pause, not just the very first start.
  const screenStrobeSignalDot = document.getElementById("screenStrobeSignalDot");
  let screenStrobeCurrentMode = null; // "decode-color" | "decode-brightness" | "synthetic" — tracked so mode-dependent styling only updates on an actual change, not every frame

  // A small persistent dot next to the brightness slider instead of a text
  // toast — red at no signal, green at a strong one, smoothly interpolated
  // in between so it reads at a glance without needing to read anything.
  function updateSignalDot(levels){
    const strength = signalStrengthFactor(levels); // 0 (no signal) to 1 (strong)
    const r = Math.round(224 - (224-70)*strength);
    const g = Math.round(90 + (200-90)*strength);
    const b = 70;
    screenStrobeSignalDot.style.background = `rgb(${r}, ${g}, ${b})`;
  }

  function currentAmbientTrack(){
    return state.ambientTracks[state.ambientIndex] || null;
  }

  function screenStrobeLoop(now){
    if(!screenStrobeRunning) return;
    const phaseTime = (now - screenStrobePhaseStart) / 1000;
    const brightnessCeiling = parseInt(screenStrobeBrightness.value, 10) / 100;
    const fadeInFactor = Math.min(1, phaseTime / Math.max(0.1, luminousPrefs.fadeInSeconds));

    const track = currentAmbientTrack();
    if(track?.hasEmbeddedLight && luminousDecoderBank){
      renderScreenStrobeFromDecoder(brightnessCeiling, fadeInFactor);
    } else {
      if(screenStrobeCurrentMode !== "synthetic"){
        screenStrobeCurrentMode = "synthetic";
        screenStrobeLeft.style.backgroundColor = "";
        screenStrobeRight.style.backgroundColor = "";
      }
      renderScreenStrobeSynthetic(phaseTime, brightnessCeiling, fadeInFactor);
    }

    screenStrobeRafId = requestAnimationFrame(screenStrobeLoop);
  }

  // The original tone-engine-driven flicker — used whenever the currently
  // playing track (if any) isn't flagged as already having its own
  // embedded signal, which is the common case.
  function renderScreenStrobeSynthetic(phaseTime, brightnessCeiling, fadeInFactor){
    const baseRate = bestFitLuminousRate(Math.max(0.1, state.engines[state.activeTab].beatCurrent));
    const driftScale = driftScaleForBand(state.engines[state.activeTab].currentBand);
    const eyeOffset = computeEyeDriftOffset(phaseTime, state.luminousEyeDrift) * driftScale;
    const wander = computeBrightnessWander(phaseTime, state.luminousBrightnessVar);
    const brightness = Math.max(0.05, Math.min(1, 0.8 + wander)) * brightnessCeiling * fadeInFactor;

    const leftRate = Math.max(0.1, baseRate - eyeOffset/2);
    const rightRate = Math.max(0.1, baseRate + eyeOffset/2);
    // Square-ish flash: a raised sine, sharper than the audio version's
    // smooth gate, since a screen flash reads better as a distinct pulse.
    const leftPhase = (Math.sin(2*Math.PI*leftRate*phaseTime) + 1) / 2;
    const rightPhase = (Math.sin(2*Math.PI*rightRate*phaseTime) + 1) / 2;

    screenStrobeLeft.style.opacity = (leftPhase * brightness).toFixed(3);
    screenStrobeRight.style.opacity = (rightPhase * brightness).toFixed(3);
  }

  // Reads a real AudioStrobe/SpectraStrobe signal from the currently
  // playing track instead of generating one. Falls back to the synthetic
  // flicker above if no usable signal actually turns up despite the track
  // being flagged — a mis-tagged file or one where lossy compression ate
  // the embedded tone shouldn't just go dark with no explanation.
  let luminousDecodeLastTime = 0;

  function renderScreenStrobeFromDecoder(brightnessCeiling, fadeInFactor){
    const now = performance.now();
    const dtSeconds = luminousDecodeLastTime ? (now - luminousDecodeLastTime) / 1000 : 1/60;
    luminousDecodeLastTime = now;

    const rawLevels = readDecoderLevels(luminousDecoderBank);
    updateSignalDot(rawLevels);
    // Detection stays on the raw signal — smoothing is for how it looks
    // rendered, not for deciding whether a real signal is present.
    // Lumasonic checked first: its reference tone (22500Hz) doesn't overlap
    // with anything else these codecs use, so it's the cleanest possible
    // discriminator — no risk of a false read from SpectraStrobe/AudioStrobe
    // content bleeding into it.
    const isLumasonic = detectLumasonic(rawLevels);
    const isSpectra = !isLumasonic && detectSpectraStrobeReference(luminousDecoderBank, rawLevels);
    const hasAudioStrobe = !isLumasonic && !isSpectra && audioStrobeSignalPresent(rawLevels);
    const levels = smoothLevels(luminousDecoderBank, rawLevels, dtSeconds);

    if(isLumasonic){
      screenStrobeCurrentMode = "decode-lumasonic";
      const leftColor = levelsToColorLumasonic(levels.left);
      const rightColor = levelsToColorLumasonic(levels.right);
      screenStrobeLeft.style.backgroundColor = `rgb(${leftColor.r}, ${leftColor.g}, ${leftColor.b})`;
      screenStrobeRight.style.backgroundColor = `rgb(${rightColor.r}, ${rightColor.g}, ${rightColor.b})`;
      screenStrobeLeft.style.opacity = brightnessCeiling.toFixed(3);
      screenStrobeRight.style.opacity = brightnessCeiling.toFixed(3);
    } else if(isSpectra){
      screenStrobeCurrentMode = "decode-color";
      const leftColor = levelsToColorSpectra(levels.left);
      const rightColor = levelsToColorSpectra(levels.right);
      screenStrobeLeft.style.backgroundColor = `rgb(${leftColor.r}, ${leftColor.g}, ${leftColor.b})`;
      screenStrobeRight.style.backgroundColor = `rgb(${rightColor.r}, ${rightColor.g}, ${rightColor.b})`;
      // Deliberately no fadeInFactor here — decoding a real signal should
      // faithfully match it for accurate comparison, not ease into it the
      // way the synthetic mode does.
      screenStrobeLeft.style.opacity = brightnessCeiling.toFixed(3);
      screenStrobeRight.style.opacity = brightnessCeiling.toFixed(3);
    } else if(hasAudioStrobe){
      if(screenStrobeCurrentMode !== "decode-brightness"){
        screenStrobeCurrentMode = "decode-brightness";
        screenStrobeLeft.style.backgroundColor = "";
        screenStrobeRight.style.backgroundColor = "";
      }
      screenStrobeLeft.style.opacity = (levels.left.as * 6 * brightnessCeiling).toFixed(3);
      screenStrobeRight.style.opacity = (levels.right.as * 6 * brightnessCeiling).toFixed(3);
    } else {
      // A flagged track with no signal *right now* isn't necessarily
      // broken — amplitude is brightness, so a genuinely quiet passage
      // looks identical to "no signal" from here, and that's valid,
      // authored data, not an absence to paper over. Go dark rather than
      // fabricate a substitute pattern that isn't what the track actually
      // encodes at this moment.
      if(screenStrobeCurrentMode !== "decode-silent"){
        screenStrobeCurrentMode = "decode-silent";
        screenStrobeLeft.style.backgroundColor = "";
        screenStrobeRight.style.backgroundColor = "";
      }
      screenStrobeLeft.style.opacity = "0";
      screenStrobeRight.style.opacity = "0";
    }
  }

  // A single accidental brush shouldn't end the whole thing — pause instead,
  // show a small, calm prompt, and auto-resume if nobody actually confirms.
  // Phase math (screenStrobePhaseStart) is left untouched by the pause, so
  // resuming just continues exactly where it would have been anyway.
  function pauseAndConfirmScreenStrobeStop(){
    if(screenStrobePaused) return;
    screenStrobePaused = true;
    if(screenStrobeRafId){ cancelAnimationFrame(screenStrobeRafId); screenStrobeRafId = null; }
    screenStrobeLeft.style.opacity = 0;
    screenStrobeRight.style.opacity = 0;
    screenStrobeConfirm.style.display = "flex";
    screenStrobeConfirmTimer = setTimeout(resumeScreenStrobeFlicker, 5000);
  }

  function resumeScreenStrobeFlicker(){
    if(screenStrobeConfirmTimer){ clearTimeout(screenStrobeConfirmTimer); screenStrobeConfirmTimer = null; }
    screenStrobeConfirm.style.display = "none";
    screenStrobePaused = false;
    if(screenStrobeRunning) screenStrobeRafId = requestAnimationFrame(screenStrobeLoop);
  }

  function handleScreenStrobeOverlayTap(){
    if(screenStrobePaused) return; // prompt is already up — only its own buttons matter now
    if(!screenStrobeRunning){
      stopScreenStrobe(); // still in the countdown — nothing disruptive happening yet, stop immediately
    } else {
      pauseAndConfirmScreenStrobeStop();
    }
  }

  screenStrobeConfirmStop.addEventListener("click", (e) => {
    e.stopPropagation();
    if(screenStrobeConfirmTimer){ clearTimeout(screenStrobeConfirmTimer); screenStrobeConfirmTimer = null; }
    screenStrobeConfirm.style.display = "none";
    screenStrobePaused = false;
    stop(); // stops the whole session — audio included — not just the screen visual
    broadcastStopAll(); // and any other open tab (like a standalone Luminous player) too
  });

  screenStrobeConfirmContinue.addEventListener("click", (e) => {
    e.stopPropagation();
    resumeScreenStrobeFlicker();
  });

  async function stopScreenStrobe(){
    screenStrobeRunning = false;
    if(screenStrobeRafId) cancelAnimationFrame(screenStrobeRafId);
    if(screenStrobeStopTimer) clearTimeout(screenStrobeStopTimer);
    if(screenStrobeCountdownTimer){ clearInterval(screenStrobeCountdownTimer); screenStrobeCountdownTimer = null; }
    if(screenStrobeConfirmTimer){ clearTimeout(screenStrobeConfirmTimer); screenStrobeConfirmTimer = null; }
    screenStrobePaused = false;
    screenStrobeConfirm.style.display = "none";
    screenStrobeOverlay.style.display = "none";
    screenStrobeControls.style.display = "block";
    try{ wakeLockRef?.release(); }catch(e){}
    wakeLockRef = null;
    try{ if(document.fullscreenElement) await document.exitFullscreen(); }catch(e){}
  }

  // ---------- Timer ----------
  const timerRow = document.getElementById("timerRow");
  const remainingEl = document.getElementById("remaining");
  let sessionMinutes = 0;
  let sessionEndsAt = null;
  let timerInterval = null;

  timerRow.addEventListener("click", (e) => {
    const btn = e.target.closest(".timer-btn");
    if(!btn) return;
    [...timerRow.children].forEach(c => c.classList.remove("active"));
    btn.classList.add("active");
    sessionMinutes = parseInt(btn.dataset.min, 10);
    if(running){
      sessionEndsAt = sessionMinutes > 0 ? Date.now() + sessionMinutes*60000 : null;
    }
    updateQueueTotals();
  });

  function tickTimer(){
    if(!sessionEndsAt){
      remainingEl.textContent = running ? "∞" : "—:—";
      return;
    }
    const msLeft = sessionEndsAt - Date.now();
    if(msLeft <= 0){
      remainingEl.textContent = "0:00";
      stop();
      return;
    }
    if(state.endingStyle === "sunrise"){
      if(msLeft <= state.wakeWindowMs && state.wakeWindowMs > 0 && !fadingOut){
        fadeUp(msLeft/1000);
      }
    } else if(msLeft <= 30000 && !fadingOut){
      fadeOut(30);
    }
    const s = Math.floor(msLeft/1000);
    const m = Math.floor(s/60);
    const rem = s % 60;
    remainingEl.textContent = `${m}:${rem.toString().padStart(2,"0")}`;
  }

  // ---------- Focus / dim mode ----------
  const focusToggle = document.getElementById("focusToggle");
  focusToggle.addEventListener("click", () => {
    const on = document.body.classList.toggle("focus");
    focusToggle.textContent = on ? "Show full console ⌃" : "Dim UI for work ⌄";
  });

  // ---------- Web Audio engine ----------
  let ctx = null;
  let masterGain = null;
  let audioEngines = { low: {}, high: {} };
  let noiseSource = null, noiseSourceGain = null, noiseGain = null, noiseHighpass = null, pinkBuffer = null, whiteBuffer = null;
  let running = false;
  let fadingOut = false;
  let rafId = null;
  let driftPhaseTime = 0;
  let arcStartedAt = null;
  let sessionStartedAt = null;
  let summaryVisible = false;
  let breathRingRadius = 0;
  let emdrGain = null;
  let emdrDryBus = null, emdrSendBus = null, reverbConvolver = null;
  let emdrSide = -1;
  let emdrNextHitTime = 0;

  let ambientGain = null, ambientHighpass = null, ambientAnalyser = null;
  let luminousDecoderBank = null;
  let ambientSource = null, ambientTrackGain = null;
  let ambientPlaying = false;
  state.ambientTracks = [];      // {name, buffer}
  state.ambientIndex = -1;
  state.ambientMode = "playlist"; // "playlist" | "single"
  state.ambientShuffle = false;
  state.ambientVolume = 40;
  state.ambientFilterOn = false;

  let breathSoundGain = null;
  let breathInhaleGain = null, breathExhaleGain = null;

  // Builds one full engine chain: two oscillators, per-channel gain/analyser,
  // an isochronic LFO gate, and an outGain that mutes/unmutes the whole engine
  // depending on which tab is active and whether Combine is on. The oscillators
  // and LFO run continuously once built — only outGain changes, so switching
  // tabs or flipping Combine is an instant gain ramp, never a restart.
  function buildEngineChain(key){
    const a = {};
    a.oscL = ctx.createOscillator(); a.oscL.type = "sine";
    a.oscR = ctx.createOscillator(); a.oscR.type = "sine";
    a.gainL = ctx.createGain();
    a.gainR = ctx.createGain();
    a.analyserL = ctx.createAnalyser(); a.analyserL.fftSize = 1024;
    a.analyserR = ctx.createAnalyser(); a.analyserR.fftSize = 1024;
    a.merger = ctx.createChannelMerger(2);
    a.binauralGain = ctx.createGain();

    a.oscL.connect(a.gainL); a.gainL.connect(a.analyserL); a.gainL.connect(a.merger, 0, 0);
    a.oscR.connect(a.gainR); a.gainR.connect(a.analyserR); a.gainR.connect(a.merger, 0, 1);
    a.merger.connect(a.binauralGain);

    a.isoGain = ctx.createGain();
    a.isoGain.gain.value = 1; // 1 = pass-through (binaural mode)
    a.binauralGain.connect(a.isoGain);

    a.lfoOsc = ctx.createOscillator(); a.lfoOsc.type = "sine";
    a.lfoOsc.frequency.value = state.engines[key].beatCurrent;
    a.lfoDepthGain = ctx.createGain();
    a.lfoDepthGain.gain.value = 0; // 0 depth = no modulation until isochronic mode is on
    a.lfoOsc.connect(a.lfoDepthGain);
    a.lfoDepthGain.connect(a.isoGain.gain);
    a.lfoOsc.start();

    a.outGain = ctx.createGain();
    const audible = (state.activeTab === key || state.combineOn);
    a.outGain.gain.value = audible ? 1 : 0;
    a.isoGain.connect(a.outGain);
    a.outGain.connect(masterGain);

    a.oscL.start();
    a.oscR.start();
    return a;
  }

  function buildGraph(){
    // Explicitly requesting 48kHz, not just accepting whatever the device
    // defaults to: Lumasonic's reference tone sits at 22500Hz, which is
    // above the 22050Hz Nyquist limit of standard 44.1kHz audio — at that
    // rate the tone doesn't just get quieter, it aliases into a different,
    // wrong frequency entirely. 48kHz (Nyquist 24000Hz) is what the format
    // is actually built for.
    try{
      ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
    }catch(e){
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    }

    masterGain = ctx.createGain();
    masterGain.gain.value = 0;

    pinkBuffer = makeNoiseBuffer(ctx, "pink", 4);
    whiteBuffer = makeNoiseBuffer(ctx, "white", 4);

    audioEngines.low = buildEngineChain("low");
    audioEngines.high = buildEngineChain("high");

    noiseHighpass = ctx.createBiquadFilter();
    noiseHighpass.type = "highpass";
    noiseHighpass.frequency.value = 140;
    noiseHighpass.Q.value = 0.707;
    noiseGain = ctx.createGain();
    noiseGain.gain.value = (state.noiseLevel / 100) * 0.7;
    noiseHighpass.connect(noiseGain);
    noiseGain.connect(masterGain);

    emdrGain = ctx.createGain();
    emdrGain.gain.value = state.emdrVolume / 100;
    emdrGain.connect(masterGain);

    emdrDryBus = ctx.createGain();
    emdrDryBus.gain.value = 1;
    emdrDryBus.connect(emdrGain);

    reverbConvolver = ctx.createConvolver();
    reverbConvolver.buffer = makeReverbImpulse(ctx, 2.4, 2.8);
    reverbConvolver.connect(emdrGain);

    emdrSendBus = ctx.createGain();
    emdrSendBus.gain.value = (state.emdrReverbDepth / 100) * 0.85;
    emdrSendBus.connect(reverbConvolver);

    ambientHighpass = ctx.createBiquadFilter();
    ambientHighpass.type = "highpass";
    ambientHighpass.frequency.value = state.ambientFilterOn ? 140 : 20;
    ambientHighpass.Q.value = 0.707;

    ambientGain = ctx.createGain();
    ambientGain.gain.value = state.ambientVolume / 100;
    ambientHighpass.connect(ambientGain);
    ambientGain.connect(masterGain);

    // A parallel tap (not part of the output path) so Luminous's Follow
    // Music mode can read the ambient track's live loudness.
    ambientAnalyser = ctx.createAnalyser();
    ambientAnalyser.fftSize = 1024;
    ambientGain.connect(ambientAnalyser);

    // Same tap point, for reading a real AudioStrobe/SpectraStrobe signal
    // already embedded in whatever's playing — separate purpose from the
    // analyser above, which just measures overall loudness for Follow Music.
    luminousDecoderBank = buildDecoderBank(ctx, ambientHighpass);

    // Breath sound: two continuously-looping filtered noise sources, silent by
    // default, swelled up and down by the breath-phase envelope in drawScope.
    breathSoundGain = ctx.createGain();
    breathSoundGain.gain.value = state.breathSoundOn ? state.breathSoundVolume / 100 : 0;
    breathSoundGain.connect(masterGain);

    const inhaleSrc = ctx.createBufferSource();
    inhaleSrc.buffer = whiteBuffer; inhaleSrc.loop = true;
    const inhaleFilter = ctx.createBiquadFilter();
    inhaleFilter.type = "bandpass"; inhaleFilter.frequency.value = 1100; inhaleFilter.Q.value = 0.7;
    breathInhaleGain = ctx.createGain(); breathInhaleGain.gain.value = 0;
    inhaleSrc.connect(inhaleFilter); inhaleFilter.connect(breathInhaleGain); breathInhaleGain.connect(breathSoundGain);
    inhaleSrc.start();

    const exhaleSrc = ctx.createBufferSource();
    exhaleSrc.buffer = whiteBuffer; exhaleSrc.loop = true;
    const exhaleFilter = ctx.createBiquadFilter();
    exhaleFilter.type = "bandpass"; exhaleFilter.frequency.value = 450; exhaleFilter.Q.value = 0.7;
    breathExhaleGain = ctx.createGain(); breathExhaleGain.gain.value = 0;
    exhaleSrc.connect(exhaleFilter); exhaleFilter.connect(breathExhaleGain); breathExhaleGain.connect(breathSoundGain);
    exhaleSrc.start();

    masterGain.connect(ctx.destination);
  }


  // Ramps the first/last few ms of a buffer to silence so a looped buffer's
  // seam passes through near-zero instead of jumping — eliminates the
  // periodic tick you'd otherwise get every time it loops.
  function applyEdgeFade(buffer, fadeSeconds){
    const fadeLen = Math.min(Math.floor(buffer.sampleRate * fadeSeconds), Math.floor(buffer.length/2));
    if(fadeLen <= 0) return;
    for(let ch=0; ch<buffer.numberOfChannels; ch++){
      const data = buffer.getChannelData(ch);
      for(let i=0;i<fadeLen;i++){
        const g = i/fadeLen;
        data[i] *= g;
        data[buffer.length - 1 - i] *= g;
      }
    }
  }

  function makeNoiseBuffer(ctx, type, seconds){
    const len = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(2, len, ctx.sampleRate);
    for(let ch=0; ch<2; ch++){
      const data = buffer.getChannelData(ch);
      if(type === "white"){
        for(let i=0;i<len;i++) data[i] = (Math.random()*2 - 1) * 0.4;
      } else {
        let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
        for(let i=0;i<len;i++){
          const white = Math.random()*2 - 1;
          b0 = 0.99886*b0 + white*0.0555179;
          b1 = 0.99332*b1 + white*0.0750759;
          b2 = 0.96900*b2 + white*0.1538520;
          b3 = 0.86650*b3 + white*0.3104856;
          b4 = 0.55000*b4 + white*0.5329522;
          b5 = -0.7616*b5 - white*0.0168980;
          const pink = b0+b1+b2+b3+b4+b5+b6+white*0.5362;
          b6 = white*0.115926;
          data[i] = pink * 0.09;
        }
      }
    }
    applyEdgeFade(buffer, 0.02); // 20ms — inaudible as a dip, enough to kill the loop-point click
    return buffer;
  }

  function applyEngineFrequencies(key){
    if(!ctx) return;
    const e = state.engines[key];
    const a = audioEngines[key];
    let fL, fR;
    if(e.toneMode === "isochronic"){
      fL = fR = e.carrier;
    } else {
      const half = e.beatCurrent / 2;
      fL = Math.max(20, e.carrier - half);
      fR = Math.max(20, e.carrier + half);
    }
    const now = ctx.currentTime;
    a.oscL.frequency.setTargetAtTime(fL, now, 0.05);
    a.oscR.frequency.setTargetAtTime(fR, now, 0.05);
    if(a.lfoOsc) a.lfoOsc.frequency.setTargetAtTime(Math.max(0.1, e.beatCurrent), now, 0.05);
    els[key].freqL.textContent = fL.toFixed(1) + " Hz";
    els[key].freqR.textContent = fR.toFixed(1) + " Hz";
    els[key].freqBeat.textContent = e.beatCurrent.toFixed(1) + " Hz";
  }

  function setEngineToneMode(key, mode){
    state.engines[key].toneMode = mode;
    if(ctx){
      const a = audioEngines[key];
      const now = ctx.currentTime;
      if(mode === "isochronic"){
        a.isoGain.gain.setTargetAtTime(0.5, now, 0.15);
        a.lfoDepthGain.gain.setTargetAtTime(0.5, now, 0.15);
      } else {
        a.isoGain.gain.setTargetAtTime(1, now, 0.15);
        a.lfoDepthGain.gain.setTargetAtTime(0, now, 0.15);
      }
      applyEngineFrequencies(key);
    }
  }

  function applyEngineMix(key){
    if(!ctx) return;
    const e = state.engines[key];
    const a = audioEngines[key];
    const vol = e.volume / 100;
    const bal = e.balance / 100;
    const lMul = bal >= 0 ? 1 - bal : 1;
    const rMul = bal <= 0 ? 1 + bal : 1;
    const now = ctx.currentTime;
    a.gainL.gain.setTargetAtTime(vol * lMul, now, 0.05);
    a.gainR.gain.setTargetAtTime(vol * rMul, now, 0.05);
  }

  const NOISE_FADE_SEC = 0.3;

  // Level changes alone never touch the source — just the shared gain — so
  // dragging the slider is already click-free via setTargetAtTime.
  function applyNoiseLevel(){
    if(!ctx) return;
    const lvl = (state.noiseLevel / 100) * 0.7;
    noiseGain.gain.setTargetAtTime(lvl, ctx.currentTime, 0.15);
  }

  // Switching Off/Pink/White used to stop the old source immediately and
  // start the new one at full level — two clicks back to back. Now the old
  // source gets its own gain ramped to silence before it's stopped, while the
  // new source fades in from its own gain at 0, so there's never a hard edge.
  function applyNoiseType(){
    if(!ctx) return;
    const prevSource = noiseSource;
    const prevGain = noiseSourceGain;
    if(prevSource && prevGain){
      prevGain.gain.cancelScheduledValues(ctx.currentTime);
      prevGain.gain.setValueAtTime(prevGain.gain.value, ctx.currentTime);
      prevGain.gain.linearRampToValueAtTime(0, ctx.currentTime + NOISE_FADE_SEC);
      setTimeout(() => { try{ prevSource.stop(); }catch(e){} }, NOISE_FADE_SEC*1000 + 100);
    }
    noiseSource = null;
    noiseSourceGain = null;

    if(state.noiseType === "off") return;

    const src = ctx.createBufferSource();
    src.buffer = state.noiseType === "pink" ? pinkBuffer : whiteBuffer;
    src.loop = true;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(1, ctx.currentTime + NOISE_FADE_SEC);
    src.connect(g); g.connect(noiseHighpass);
    src.start();
    noiseSource = src;
    noiseSourceGain = g;
  }

  // ---------- Ambient layer: session queue, played/crossfaded in order ----------
  // Adding/removing files from the LIBRARY lives on the Settings page
  // (settings.js) — this page builds a QUEUE from that library for the
  // current session: pick tracks, see the running total against session
  // length, and playback cycles through just the queue (looping back to its
  // start) instead of your entire library, once one exists.
  const ambientTrackSelect = document.getElementById("ambientTrackSelect");
  const ambientModeRow = document.getElementById("ambientModeRow");
  const ambientShuffleSwitch = document.getElementById("ambientShuffleSwitch");
  const ambientFilterSwitch = document.getElementById("ambientFilterSwitch");
  const ambientVolumeSlider = document.getElementById("ambientVolume");
  const ambientVolumeVal = document.getElementById("ambientVolumeVal");
  const ambientNowPlaying = document.getElementById("ambientNowPlaying");
  const queueListEl = document.getElementById("queueList");
  const queueBarFill = document.getElementById("queueBarFill");
  const queueTotalLabel = document.getElementById("queueTotalLabel");
  const queueDiffEl = document.getElementById("queueDiff");
  const queueEmptyNote = document.getElementById("queueEmptyNote");
  const fillRemainingBtn = document.getElementById("fillRemainingBtn");
  const clearQueueBtn = document.getElementById("clearQueueBtn");

  state.ambientQueue = []; // [{ id, name, durationSec }], built fresh each session — not persisted
  let ambientQueuePos = 0;

  function formatDuration(sec){
    if(sec == null || isNaN(sec)) return "—:—";
    const m = Math.floor(sec/60), s = Math.round(sec%60);
    return m + ":" + String(s).padStart(2,"0");
  }

  function renderAmbientTrackList(){
    ambientTrackSelect.innerHTML = "";
    if(!state.ambientTracks.length){
      const opt = document.createElement("option");
      opt.value = ""; opt.textContent = "No files loaded yet";
      ambientTrackSelect.appendChild(opt);
      return;
    }
    const placeholder = document.createElement("option");
    placeholder.value = ""; placeholder.textContent = "Add a track to this session's queue…";
    ambientTrackSelect.appendChild(placeholder);
    const bundledGroup = document.createElement("optgroup");
    bundledGroup.label = "Bundled samples";
    const userGroup = document.createElement("optgroup");
    userGroup.label = "Your files";
    state.ambientTracks.forEach((track, i) => {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = track.name + (i === state.ambientIndex && ambientPlaying ? " ▶" : "");
      (track.source === "bundled" ? bundledGroup : userGroup).appendChild(opt);
    });
    if(bundledGroup.children.length) ambientTrackSelect.appendChild(bundledGroup);
    if(userGroup.children.length) ambientTrackSelect.appendChild(userGroup);
    ambientTrackSelect.value = "";
  }

  ambientTrackSelect.addEventListener("change", async () => {
    const idx = parseInt(ambientTrackSelect.value, 10);
    if(isNaN(idx) || !state.ambientTracks[idx]) return;
    await addToQueue(state.ambientTracks[idx].id);
    ambientTrackSelect.value = ""; // reset so the same or another track can be added again
  });

  // Loads the current library (bundled + whatever's been added via Settings)
  // fresh on every page load, so changes made on Settings show up here too.
  (async function loadAmbientTracksOnStartup(){
    try{
      state.ambientTracks = await loadTrackList();
    }catch(e){ console.warn("Could not load ambient track library:", e); }
    if(state.ambientIndex === -1 && state.ambientTracks.length) state.ambientIndex = 0;
    renderAmbientTrackList();
    window.dispatchEvent(new Event("vibrosomatics:ambient-ready"));
  })();

  ambientModeRow.addEventListener("click", (e) => {
    const pill = e.target.closest(".pill");
    if(!pill) return;
    [...ambientModeRow.children].forEach(c => c.classList.remove("active"));
    pill.classList.add("active");
    state.ambientMode = pill.dataset.mode;
    if(ambientPlaying) playAmbientTrack(state.ambientIndex, false); // restart current with new mode's loop behavior
  });
  ambientShuffleSwitch.addEventListener("click", () => {
    state.ambientShuffle = !state.ambientShuffle;
    ambientShuffleSwitch.classList.toggle("on", state.ambientShuffle);
  });
  ambientFilterSwitch.addEventListener("click", () => {
    state.ambientFilterOn = !state.ambientFilterOn;
    ambientFilterSwitch.classList.toggle("on", state.ambientFilterOn);
    if(ambientHighpass && ctx){
      ambientHighpass.frequency.setTargetAtTime(state.ambientFilterOn ? 140 : 20, ctx.currentTime, 0.1);
    }
  });
  ambientVolumeSlider.addEventListener("input", () => {
    state.ambientVolume = parseFloat(ambientVolumeSlider.value);
    ambientVolumeVal.textContent = state.ambientVolume.toFixed(0);
    if(ambientGain && ctx) ambientGain.gain.setTargetAtTime(state.ambientVolume/100, ctx.currentTime, 0.1);
  });

  const AMBIENT_CROSSFADE_SEC = 1.4;

  function stopAmbientSource(){
    if(ambientSource){
      ambientSource.onended = null;
      try{
        const g = ambientTrackGain;
        if(g && ctx){
          g.gain.cancelScheduledValues(ctx.currentTime);
          g.gain.setValueAtTime(g.gain.value, ctx.currentTime);
          g.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.08);
        }
        const src = ambientSource;
        setTimeout(() => { try{ src.stop(); }catch(e){} }, 100);
      }catch(e){}
      ambientSource = null;
      ambientTrackGain = null;
    }
    ambientPlaying = false;
    setLuminousSuppressed(false);
  }

  // Shared by playback and by the queue (which needs a track's real duration
  // the moment it's added, not just right before it plays).
  async function decodeTrackIfNeeded(track){
    if(track.buffer) return track.buffer;
    if(!ctx) buildGraph();
    try{
      if(track.source === "bundled"){
        track.buffer = await decodeBundledTrack(ctx, track);
      } else if(track.synced){
        const blob = await fetchSyncedTrackBlob(track.id);
        if(blob){
          const arr = await blob.arrayBuffer();
          track.buffer = await ctx.decodeAudioData(arr);
        }
      } else if(track.blob){
        const arr = await track.blob.arrayBuffer();
        track.buffer = await ctx.decodeAudioData(arr);
      }
      if(track.buffer) applyEdgeFade(track.buffer, 0.03);
    }catch(err){
      console.warn("Could not decode track:", track.name, err);
    }
    return track.buffer || null;
  }

  // ---------- Session queue ----------
  async function addToQueue(trackId){
    const track = state.ambientTracks.find(t => t.id === trackId);
    if(!track) return;
    const buffer = await decodeTrackIfNeeded(track);
    state.ambientQueue.push({ id: track.id, name: track.name, durationSec: buffer ? buffer.duration : null });
    renderQueue();
  }

  function removeFromQueue(i){
    state.ambientQueue.splice(i, 1);
    ambientQueuePos = 0;
    renderQueue();
  }

  function moveQueueItem(i, dir){
    const j = i + dir;
    if(j < 0 || j >= state.ambientQueue.length) return;
    const tmp = state.ambientQueue[i];
    state.ambientQueue[i] = state.ambientQueue[j];
    state.ambientQueue[j] = tmp;
    ambientQueuePos = 0;
    renderQueue();
  }

  async function fillRemainingTime(){
    const targetSec = sessionMinutes > 0 ? sessionMinutes * 60 : null;
    if(!targetSec || !state.ambientTracks.length) return;
    let totalQueued = state.ambientQueue.reduce((sum,q) => sum + (q.durationSec || 0), 0);
    const queuedIds = new Set(state.ambientQueue.map(q => q.id));
    // prefer tracks not already queued; once those run out, allow repeats
    // rather than stopping short of the target
    const candidates = state.ambientTracks.filter(t => !queuedIds.has(t.id)).concat(state.ambientTracks);
    for(const track of candidates){
      if(totalQueued >= targetSec) break;
      const buffer = await decodeTrackIfNeeded(track);
      const dur = buffer ? buffer.duration : 0;
      if(dur <= 0) continue;
      state.ambientQueue.push({ id: track.id, name: track.name, durationSec: dur });
      totalQueued += dur;
    }
    renderQueue();
  }

  function updateQueueTotals(){
    const totalQueued = state.ambientQueue.reduce((sum,q) => sum + (q.durationSec || 0), 0);
    const targetSec = sessionMinutes > 0 ? sessionMinutes * 60 : null;
    queueTotalLabel.textContent = "Queued: " + formatDuration(totalQueued) + (targetSec != null ? " / " + formatDuration(targetSec) : "");
    if(targetSec != null){
      const pct = Math.min(100, (totalQueued / targetSec) * 100);
      queueBarFill.style.width = pct + "%";
      queueBarFill.style.background = totalQueued >= targetSec ? "var(--green)" : "var(--amber)";
      const diff = targetSec - totalQueued;
      queueDiffEl.style.display = "inline";
      queueDiffEl.textContent = diff > 0 ? formatDuration(diff) + " short" : "covered";
    } else {
      queueBarFill.style.width = "0%";
      queueDiffEl.style.display = "none";
    }
  }

  function renderQueue(){
    queueListEl.innerHTML = "";
    queueEmptyNote.style.display = state.ambientQueue.length ? "none" : "block";
    state.ambientQueue.forEach((q, i) => {
      const row = document.createElement("div");
      row.className = "queue-row";
      const name = document.createElement("span");
      name.className = "queue-name";
      name.textContent = (i+1) + ". " + q.name + "  ·  " + formatDuration(q.durationSec);
      const actions = document.createElement("span");
      actions.className = "queue-actions";
      const up = document.createElement("span"); up.textContent = "▲";
      up.addEventListener("click", () => moveQueueItem(i, -1));
      const down = document.createElement("span"); down.textContent = "▼";
      down.addEventListener("click", () => moveQueueItem(i, 1));
      const remove = document.createElement("span"); remove.className = "queue-remove"; remove.textContent = "✕";
      remove.addEventListener("click", () => removeFromQueue(i));
      actions.appendChild(up); actions.appendChild(down); actions.appendChild(remove);
      row.appendChild(name); row.appendChild(actions);
      queueListEl.appendChild(row);
    });
    updateQueueTotals();
  }

  fillRemainingBtn.addEventListener("click", fillRemainingTime);
  clearQueueBtn.addEventListener("click", () => {
    state.ambientQueue = [];
    ambientQueuePos = 0;
    renderQueue();
  });

  // Crossfades: the outgoing track keeps playing while it fades out, overlapping
  // with the new track fading in, instead of a hard stop-then-start.
  async function playAmbientTrack(index, crossfade){
    if(!ctx || !state.ambientTracks.length) return;
    const track = state.ambientTracks[index];
    if(!track) return;

    setLuminousSuppressed(!!track.hasEmbeddedLight);

    await decodeTrackIfNeeded(track);
    if(!track.buffer) return;

    const prevSource = ambientSource;
    const prevGain = ambientTrackGain;
    const fadeTime = crossfade ? AMBIENT_CROSSFADE_SEC : 0.15;

    const src = ctx.createBufferSource();
    src.buffer = track.buffer;
    const trackGain = ctx.createGain();
    trackGain.gain.setValueAtTime(0, ctx.currentTime);
    trackGain.gain.linearRampToValueAtTime(1, ctx.currentTime + fadeTime);
    src.connect(trackGain); trackGain.connect(ambientHighpass);

    if(state.ambientMode === "single"){
      src.loop = true;
    } else {
      src.onended = () => { if(ambientPlaying && ambientSource === src) advanceAmbientTrack(); };
    }
    src.start();
    ambientSource = src;
    ambientTrackGain = trackGain;
    ambientPlaying = true;
    ambientNowPlaying.style.display = "block";
    ambientNowPlaying.textContent = "Now playing: " + track.name + (state.ambientQueue.length ? " (queue " + (ambientQueuePos+1) + "/" + state.ambientQueue.length + ")" : "");
    renderAmbientTrackList();

    if(prevSource && prevGain){
      prevSource.onended = null;
      prevGain.gain.cancelScheduledValues(ctx.currentTime);
      prevGain.gain.setValueAtTime(prevGain.gain.value, ctx.currentTime);
      prevGain.gain.linearRampToValueAtTime(0, ctx.currentTime + fadeTime);
      setTimeout(() => { try{ prevSource.stop(); }catch(e){} }, fadeTime*1000 + 150);
    }
  }

  // Resolves a queue position to the corresponding library index (tracks are
  // shared objects — the queue just orders/selects which ones play, so
  // decoded buffers are never duplicated).
  function libraryIndexForQueuePos(pos){
    const id = state.ambientQueue[pos]?.id;
    if(!id) return -1;
    return state.ambientTracks.findIndex(t => t.id === id);
  }

  function playQueueFromStart(crossfade){
    if(!state.ambientQueue.length) return;
    ambientQueuePos = 0;
    const idx = libraryIndexForQueuePos(0);
    if(idx === -1) return;
    state.ambientIndex = idx;
    playAmbientTrack(idx, crossfade);
  }

  function advanceAmbientTrack(){
    if(state.ambientQueue.length){
      if(state.ambientShuffle && state.ambientQueue.length > 1){
        let nextPos;
        do{ nextPos = Math.floor(Math.random() * state.ambientQueue.length); } while(nextPos === ambientQueuePos);
        ambientQueuePos = nextPos;
      } else {
        ambientQueuePos = (ambientQueuePos + 1) % state.ambientQueue.length;
      }
      const idx = libraryIndexForQueuePos(ambientQueuePos);
      if(idx === -1) return;
      state.ambientIndex = idx;
      playAmbientTrack(idx, true);
      return;
    }
    // no queue built — fall back to cycling the whole library, same as before
    if(!state.ambientTracks.length) return;
    let next;
    if(state.ambientShuffle && state.ambientTracks.length > 1){
      do{ next = Math.floor(Math.random()*state.ambientTracks.length); } while(next === state.ambientIndex);
    } else {
      next = (state.ambientIndex + 1) % state.ambientTracks.length;
    }
    state.ambientIndex = next;
    playAmbientTrack(state.ambientIndex, true);
  }

  // ---------- Check-in: mood before/after + session summary ----------
  const moodRow = document.getElementById("moodRow");
  const moodLabel = document.getElementById("moodLabel");
  const sessionSummaryEl = document.getElementById("sessionSummary");
  const progressStatsEl = document.getElementById("progressStats");
  let lastSessionRecordId = null;

  moodRow.addEventListener("click", (e) => {
    const pill = e.target.closest(".mood-pill");
    if(!pill) return;
    [...moodRow.children].forEach(c => c.classList.remove("active"));
    pill.classList.add("active");
    const val = parseInt(pill.dataset.mood, 10);
    if(summaryVisible){
      state.moodAfter = val;
      renderSessionSummary();
      if(lastSessionRecordId) updateSessionHistoryMood(lastSessionRecordId, val);
    } else {
      state.moodBefore = val;
    }
  });

  // ---------- Presets: Solfeggio pairings (built-in) + User Defaults (saved, exportable) ----------
  const presetNameInput = document.getElementById("presetName");
  const solfeggioSelect = document.getElementById("solfeggioSelect");
  const userPresetSelect = document.getElementById("userPresetSelect");
  const userPresetDeleteBtn = document.getElementById("userPresetDeleteBtn");

  SOLFEGGIO_TONES.forEach(tone => {
    const opt = document.createElement("option");
    opt.value = String(tone.hz);
    opt.textContent = tone.label;
    solfeggioSelect.appendChild(opt);
  });

  // Divides a Solfeggio tone down by octaves until it lands inside the Low
  // engine's range — same pitch class, just grounded into sub-bass territory.
  function octaveDownInto(hz, min, max){
    let f = hz;
    while(f > max) f = f / 2;
    while(f < min) f = f * 2;
    return Math.round(f * 10) / 10;
  }

  solfeggioSelect.addEventListener("change", () => {
    const hz = parseFloat(solfeggioSelect.value);
    if(!hz) return;
    const lowHz = octaveDownInto(hz, 20, 120);
    fireInput(els.high.carrierSlider, hz);
    fireInput(els.low.carrierSlider, lowHz);
    solfeggioSelect.value = "";
  });

  function snapshotPreset(){
    return {
      engines: {
        low: { ...state.engines.low },
        high: { ...state.engines.high },
      },
      activeTab: state.activeTab,
      combineOn: state.combineOn,
      driftOn: state.driftOn, driftDepth: state.driftDepth, driftRate: state.driftRate,
      emdrOn: state.emdrOn, emdrSound: state.emdrSound, emdrBpm: state.emdrBpm,
      emdrVolume: state.emdrVolume, emdrReverbDepth: state.emdrReverbDepth,
      noiseType: state.noiseType, noiseLevel: state.noiseLevel,
      ambientVolume: state.ambientVolume, ambientMode: state.ambientMode, ambientShuffle: state.ambientShuffle,
      ambientFilterOn: state.ambientFilterOn,
      arcMode: state.arcMode, breathPattern: state.breathPattern,
      breathSoundOn: state.breathSoundOn, breathSoundVolume: state.breathSoundVolume,
      endingStyle: state.endingStyle, sessionMinutes: sessionMinutes,
      ambientQueue: state.ambientQueue.map(q => ({ id: q.id, name: q.name, durationSec: q.durationSec })),
    };
  }

  function fireInput(el, value){
    el.value = value;
    el.dispatchEvent(new Event("input"));
  }

  function applyPreset(data){
    if(!data) return;

    if(data.engines){
      ENGINE_KEYS.forEach(key => {
        const ed = data.engines[key];
        if(!ed) return;
        selectEngineBand(key, ed.currentBand || "alpha");
        fireInput(els[key].carrierSlider, ed.carrier);
        fireInput(els[key].beatSlider, ed.beatBase);
        fireInput(els[key].volumeSlider, ed.volume);
        fireInput(els[key].balanceSlider, ed.balance);
        [...els[key].toneModeRow.children].forEach(c => c.classList.toggle("active", c.dataset.mode === (ed.toneMode || "binaural")));
        setEngineToneMode(key, ed.toneMode || "binaural");
        state.engines[key].muted = !!ed.muted;
      });
      muteLowSwitch.classList.toggle("on", state.engines.low.muted);
      muteHighSwitch.classList.toggle("on", state.engines.high.muted);
      updateEngineGains();
    }

    if(data.activeTab){
      state.activeTab = data.activeTab;
      [...engineTabRow.children].forEach(c => c.classList.toggle("active", c.dataset.tab === data.activeTab));
    }
    state.combineOn = !!data.combineOn;
    combineSwitch.classList.toggle("on", state.combineOn);
    updatePanelVisibility();
    updateEngineGains();

    state.driftOn = !!data.driftOn;
    driftSwitch.classList.toggle("on", state.driftOn);
    fireInput(driftDepthSlider, data.driftDepth);
    fireInput(driftRateSlider, data.driftRate);

    state.emdrOn = !!data.emdrOn;
    emdrSwitch.classList.toggle("on", state.emdrOn);
    [...emdrSoundRow.children].forEach(c => c.classList.toggle("active", c.dataset.sound === data.emdrSound));
    state.emdrSound = data.emdrSound || "drum";
    fireInput(emdrSpeedSlider, data.emdrBpm);
    fireInput(emdrVolumeSlider, data.emdrVolume);
    fireInput(emdrReverbSlider, data.emdrReverbDepth);

    [...noiseRow.children].forEach(c => c.classList.toggle("active", c.dataset.noise === data.noiseType));
    state.noiseType = data.noiseType || "off";
    applyNoiseType();
    fireInput(noiseLevelSlider, data.noiseLevel);

    [...ambientModeRow.children].forEach(c => c.classList.toggle("active", c.dataset.mode === data.ambientMode));
    state.ambientMode = data.ambientMode || "playlist";
    state.ambientShuffle = !!data.ambientShuffle;
    ambientShuffleSwitch.classList.toggle("on", state.ambientShuffle);
    state.ambientFilterOn = !!data.ambientFilterOn;
    ambientFilterSwitch.classList.toggle("on", state.ambientFilterOn);
    if(ambientHighpass && ctx){
      ambientHighpass.frequency.setTargetAtTime(state.ambientFilterOn ? 140 : 20, ctx.currentTime, 0.1);
    }
    fireInput(ambientVolumeSlider, data.ambientVolume);

    const arcOn = (data.arcMode || "off") !== "off";
    [...arcRow.children].forEach(c => c.classList.toggle("active", c.dataset.arc === (data.arcMode || "off")));
    state.arcMode = data.arcMode || "off";
    ENGINE_KEYS.forEach(key => {
      els[key].bandRow.classList.toggle("disabled-control", arcOn);
      els[key].beatRow.classList.toggle("disabled-control", arcOn);
    });
    arcStatusEl.style.display = arcOn ? "block" : "none";
    if(arcOn) arcStartedAt = Date.now();

    [...breathRow.children].forEach(c => c.classList.toggle("active", c.dataset.breath === (data.breathPattern || "off")));
    state.breathPattern = data.breathPattern || "off";
    state.breathSoundOn = !!data.breathSoundOn;
    breathSoundSwitch.classList.toggle("on", state.breathSoundOn);
    fireInput(breathSoundVolumeSlider, data.breathSoundVolume !== undefined ? data.breathSoundVolume : 30);
    if(ctx && breathSoundGain){
      breathSoundGain.gain.setTargetAtTime(state.breathSoundOn ? state.breathSoundVolume/100 : 0, ctx.currentTime, 0.1);
    }

    [...endingRow.children].forEach(c => c.classList.toggle("active", c.dataset.ending === (data.endingStyle || "fadeout")));
    state.endingStyle = data.endingStyle || "fadeout";

    if(data.sessionMinutes !== undefined){
      sessionMinutes = data.sessionMinutes;
      [...timerRow.children].forEach(c => c.classList.toggle("active", parseInt(c.dataset.min, 10) === sessionMinutes));
    }

    // Restore the saved ambient queue too, dropping any tracks that no
    // longer exist in the library (e.g. a user upload that got removed).
    state.ambientQueue = (data.ambientQueue || []).filter(q => state.ambientTracks.some(t => t.id === q.id));
    ambientQueuePos = 0;
    renderQueue();
  }

  function renderPresetList(){
    userPresetSelect.innerHTML = "";
    if(!state.presets.length){
      const opt = document.createElement("option");
      opt.value = ""; opt.textContent = "No presets saved yet";
      userPresetSelect.appendChild(opt);
      return;
    }
    const placeholder = document.createElement("option");
    placeholder.value = ""; placeholder.textContent = "Choose a preset…";
    userPresetSelect.appendChild(placeholder);
    state.presets.forEach((p, i) => {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = p.name;
      userPresetSelect.appendChild(opt);
    });
  }

  userPresetSelect.addEventListener("change", () => {
    const idx = parseInt(userPresetSelect.value, 10);
    if(isNaN(idx) || !state.presets[idx]) return;
    applyPreset(state.presets[idx].data);
    userPresetSelect.value = "";
  });

  function savePresetsToDB(){
    dbPut("presets", state.presets, "all");
  }

  userPresetDeleteBtn.addEventListener("click", () => {
    const idx = parseInt(userPresetSelect.value, 10);
    if(isNaN(idx) || !state.presets[idx]) return;
    state.presets.splice(idx, 1);
    renderPresetList();
    savePresetsToDB();
  });

  const presetImageInput = document.getElementById("presetImageInput");
  const presetImagePreview = document.getElementById("presetImagePreview");
  let pendingPresetImage = null; // data URL, or null if none chosen

  presetImageInput.addEventListener("change", () => {
    const file = presetImageInput.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      pendingPresetImage = reader.result;
      presetImagePreview.style.backgroundImage = `url(${pendingPresetImage})`;
      presetImagePreview.style.display = "block";
    };
    reader.readAsDataURL(file);
  });

  document.getElementById("presetSaveBtn").addEventListener("click", () => {
    const name = presetNameInput.value.trim() || ("Preset " + (state.presets.length + 1));
    state.presets.push({ id: makeId(), name, data: snapshotPreset(), imageDataUrl: pendingPresetImage });
    presetNameInput.value = "";
    pendingPresetImage = null;
    presetImageInput.value = "";
    presetImagePreview.style.display = "none";
    renderPresetList();
    savePresetsToDB();
  });

  document.getElementById("presetExportAllBtn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state.presets, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "vibrosomatics-presets.json";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  document.getElementById("presetImportFile").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if(!file) return;
    try{
      const text = await file.text();
      const imported = JSON.parse(text);
      if(Array.isArray(imported)){
        state.presets = state.presets.concat(imported);
        renderPresetList();
        savePresetsToDB();
      }
    }catch(err){
      console.warn("Could not import presets:", err);
    }
    e.target.value = "";
  });

  (async function loadPresetsFromDB(){
    const all = await dbGet("presets", "all");
    if(Array.isArray(all) && all.length){
      state.presets = all;
      renderPresetList();
    }
    window.dispatchEvent(new Event("vibrosomatics:presets-ready"));
  })();

  // ---------- EMDR bilateral pan: soft percussion synthesis ----------
  function makeReverbImpulse(ctx, duration, decay){
    const rate = ctx.sampleRate;
    const length = Math.floor(rate * duration);
    const impulse = ctx.createBuffer(2, length, rate);
    for(let ch=0; ch<2; ch++){
      const data = impulse.getChannelData(ch);
      for(let i=0;i<length;i++){
        data[i] = (Math.random()*2 - 1) * Math.pow(1 - i/length, decay);
      }
    }
    return impulse;
  }

  function playDrum(pan, time){
    const osc = ctx.createOscillator(); osc.type = "sine";
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(58, time + 0.16);
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 900;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, time);
    amp.gain.exponentialRampToValueAtTime(0.9, time + 0.008);
    amp.gain.exponentialRampToValueAtTime(0.0001, time + 0.3);
    const panner = ctx.createStereoPanner(); panner.pan.setValueAtTime(pan, time);
    osc.connect(lp); lp.connect(amp); amp.connect(panner);
    panner.connect(emdrDryBus); panner.connect(emdrSendBus);
    osc.start(time); osc.stop(time + 0.35);
  }

  function playShaker(pan, time){
    const dur = 0.18;
    const len = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for(let i=0;i<len;i++) data[i] = (Math.random()*2 - 1) * (1 - i/len);
    const src = ctx.createBufferSource(); src.buffer = buffer;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 3200; bp.Q.value = 0.6;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, time);
    amp.gain.exponentialRampToValueAtTime(0.7, time + 0.006);
    amp.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    const panner = ctx.createStereoPanner(); panner.pan.setValueAtTime(pan, time);
    src.connect(bp); bp.connect(amp); amp.connect(panner);
    panner.connect(emdrDryBus); panner.connect(emdrSendBus);
    src.start(time); src.stop(time + dur + 0.02);
  }

  function playBell(pan, time){
    const fundamental = 520;
    const osc1 = ctx.createOscillator(); osc1.type = "sine"; osc1.frequency.value = fundamental;
    const osc2 = ctx.createOscillator(); osc2.type = "sine"; osc2.frequency.value = fundamental * 2.4;
    const g2 = ctx.createGain(); g2.gain.value = 0.15;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2600;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, time);
    amp.gain.exponentialRampToValueAtTime(0.8, time + 0.02);
    amp.gain.exponentialRampToValueAtTime(0.0001, time + 0.9);
    const panner = ctx.createStereoPanner(); panner.pan.setValueAtTime(pan, time);
    osc1.connect(amp);
    osc2.connect(g2); g2.connect(amp);
    amp.connect(lp); lp.connect(panner);
    panner.connect(emdrDryBus); panner.connect(emdrSendBus);
    osc1.start(time); osc1.stop(time + 0.95);
    osc2.start(time); osc2.stop(time + 0.95);
  }

  function playEmdrHit(pan, time){
    if(state.emdrSound === "shaker") playShaker(pan, time);
    else if(state.emdrSound === "bell") playBell(pan, time);
    else playDrum(pan, time);
  }

  function armNextEmdrHit(){
    emdrNextHitTime = ctx.currentTime + 0.1;
  }

  const EMDR_LOOKAHEAD = 2.0;   // seconds of hits to queue up each wake
  const SCHED_WAKE_MS = 150;    // how often the scheduler wakes to top up the queue
  let emdrTimerId = null;

  function emdrScheduler(){
    if(!running || !state.emdrOn){ emdrTimerId = null; return; }
    while(emdrNextHitTime < ctx.currentTime + EMDR_LOOKAHEAD){
      playEmdrHit(emdrSide, emdrNextHitTime);
      emdrSide *= -1;
      emdrNextHitTime += 60 / state.emdrBpm;
    }
    emdrTimerId = setTimeout(emdrScheduler, SCHED_WAKE_MS);
  }

  let driftTimerId = null;

  function driftTick(){
    if(!running){ driftTimerId = null; return; }
    driftPhaseTime += SCHED_WAKE_MS/1000;
    luminousPhaseTime += SCHED_WAKE_MS/1000;

    let sharedWander = 0;
    if(state.driftOn){
      const ratePerSec1 = state.driftRate / 60;
      const ratePerSec2 = (state.driftRate * 1.7) / 60;
      sharedWander = state.driftDepth * (0.6*Math.sin(2*Math.PI*ratePerSec1*driftPhaseTime) +
                                          0.4*Math.sin(2*Math.PI*ratePerSec2*driftPhaseTime + 1.3));
    }

    if(state.arcMode !== "off"){
      const arc = ARCS[state.arcMode];
      const fromB = BANDS[arc.from], toB = BANDS[arc.to];
      const durationMs = sessionMinutes > 0 ? sessionMinutes*60000 : 20*60000;
      const progress = Math.min(1, (Date.now() - arcStartedAt) / durationMs);
      const arcBeatBase = fromB.def + (toB.def - fromB.def) * progress;
      const clampMin = Math.min(fromB.min, toB.min);
      const clampMax = Math.max(fromB.max, toB.max);
      arcStatusEl.textContent = arc.label + ": " + fromB.label + " → " + toB.label + " (" + Math.round(progress*100) + "%)";
      ENGINE_KEYS.forEach(key => {
        const e = state.engines[key];
        e.beatBase = arcBeatBase; // both engines follow the same arc target together
        const next = Math.min(clampMax, Math.max(clampMin, e.beatBase + sharedWander));
        if(Math.abs(next - e.beatCurrent) > 0.0005){
          e.beatCurrent = next;
          applyEngineFrequencies(key);
        }
      });
    } else {
      ENGINE_KEYS.forEach(key => {
        const e = state.engines[key];
        const b = BANDS[e.currentBand];
        const next = Math.min(b.max, Math.max(b.min, e.beatBase + sharedWander));
        if(Math.abs(next - e.beatCurrent) > 0.0005){
          e.beatCurrent = next;
          applyEngineFrequencies(key);
        }
      });
    }
    updateLuminousModulation();
    driftTimerId = setTimeout(driftTick, SCHED_WAKE_MS);
  }

  // kept for the canvas visualizer only — safe to throttle/pause when the tab is hidden
  function driftLoop(){ /* deprecated: visuals now handled by drawScope, audio timing by driftTick/emdrScheduler */ }

  document.addEventListener("visibilitychange", () => {
    if(document.visibilityState === "visible" && ctx && ctx.state === "suspended"){
      ctx.resume();
    }
  });

  if(navigator.mediaSession){
    navigator.mediaSession.setActionHandler("play", () => { if(!running) start(); });
    navigator.mediaSession.setActionHandler("pause", () => { if(running) stop(); });
  }
  function updateMediaSession(){
    if(!navigator.mediaSession) return;
    try{
      const lowLabel = "Low " + BANDS[state.engines.low.currentBand].label;
      const highLabel = "High " + BANDS[state.engines.high.currentBand].label;
      const activeLabel = state.combineOn ? (lowLabel + " + " + highLabel) : (state.activeTab === "low" ? lowLabel : highLabel);
      navigator.mediaSession.metadata = new MediaMetadata({
        title: "VibroFlō",
        artist: activeLabel,
        album: "Binaural session"
      });
      navigator.mediaSession.playbackState = running ? "playing" : "paused";
    }catch(e){ /* MediaMetadata unsupported — non-fatal */ }
  }

  // ---------- Scope ----------
  const canvas = document.getElementById("scope");
  const cctx = canvas.getContext("2d");
  function sizeCanvas(){
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * devicePixelRatio;
    canvas.height = rect.height * devicePixelRatio;
  }
  window.addEventListener("resize", sizeCanvas);

  const scopeWrap = document.getElementById("scopeWrap");
  const scopeMaximizeBtn = document.getElementById("scopeMaximizeBtn");
  scopeMaximizeBtn.addEventListener("click", () => {
    const isMax = scopeWrap.classList.toggle("maximized");
    scopeMaximizeBtn.textContent = isMax ? "⤡" : "⤢";
    scopeMaximizeBtn.title = isMax ? "Restore" : "Maximize";
    // wait for the CSS height transition to finish before resyncing canvas resolution
    setTimeout(sizeCanvas, 320);
  });

  let orbRadii = { lowL: 0, lowR: 0, highL: 0, highR: 0 };

  function getRms(analyser){
    const n = analyser.fftSize;
    const data = new Float32Array(n);
    analyser.getFloatTimeDomainData(data);
    let sum = 0;
    for(let i=0;i<n;i++) sum += data[i]*data[i];
    return Math.sqrt(sum/n);
  }

  function drawOrb(cx, cy, r, color){
    if(r < 1) return;
    const grad = cctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, color + "cc");
    grad.addColorStop(0.6, color + "55");
    grad.addColorStop(1, color + "00");
    cctx.fillStyle = grad;
    cctx.beginPath();
    cctx.arc(cx, cy, r, 0, Math.PI*2);
    cctx.fill();
  }

  function getBreathPhase(){
    const key = state.breathPattern;
    if(key === "off" || !BREATH_PATTERNS[key]) return null;
    const phases = BREATH_PATTERNS[key];
    const total = phases.reduce((s,p) => s + p.dur, 0);
    const t = (Date.now()/1000) % total;
    let acc = 0;
    for(const p of phases){
      if(t < acc + p.dur){
        const localFrac = (t - acc) / p.dur;
        return {
          name: p.name,
          frac: p.from + (p.to - p.from) * localFrac,
          localFrac,
          isHold: p.from === p.to,
          isInhale: p.name.toLowerCase().includes("in"),
        };
      }
      acc += p.dur;
    }
    return null;
  }

  function drawScope(){
    requestAnimationFrame(drawScope);
    updateLuminousFollowMusic();
    const w = canvas.width, h = canvas.height;

    // soft violet wash background
    cctx.fillStyle = "#150f28";
    cctx.fillRect(0,0,w,h);
    const wash = cctx.createRadialGradient(w/2,h/2,0,w/2,h/2,Math.max(w,h)*0.6);
    wash.addColorStop(0, "rgba(74,58,122,0.25)");
    wash.addColorStop(1, "rgba(21,15,40,0)");
    cctx.fillStyle = wash;
    cctx.fillRect(0,0,w,h);

    const breath = getBreathPhase();
    if(breath){
      const minR = h*0.20, maxR = h*0.42;
      const targetR = minR + (maxR-minR) * breath.frac;
      breathRingRadius += (targetR - breathRingRadius) * 0.06;
      cctx.beginPath();
      cctx.arc(w/2, h/2, breathRingRadius, 0, Math.PI*2);
      cctx.strokeStyle = "rgba(179,161,255,0.4)";
      cctx.lineWidth = 2 * devicePixelRatio;
      cctx.stroke();
      cctx.fillStyle = "rgba(212,201,255,0.7)";
      cctx.font = `${12*devicePixelRatio}px ui-rounded, system-ui, sans-serif`;
      cctx.textAlign = "center";
      cctx.fillText(breath.name, w/2, h*0.16);
    }

    if(ctx && breathInhaleGain && breathExhaleGain){
      let inhaleTarget = 0, exhaleTarget = 0;
      if(state.breathSoundOn && breath && !breath.isHold){
        const envelope = Math.sin(Math.PI * Math.min(1, Math.max(0, breath.localFrac)));
        if(breath.isInhale) inhaleTarget = envelope; else exhaleTarget = envelope;
      }
      breathInhaleGain.gain.setTargetAtTime(inhaleTarget, ctx.currentTime, 0.15);
      breathExhaleGain.gain.setTargetAtTime(exhaleTarget, ctx.currentTime, 0.15);
    }

    const lowOn = running && isEngineAudible("low");
    const highOn = running && isEngineAudible("high");

    if(!running){
      orbRadii.lowL *= 0.9; orbRadii.lowR *= 0.9; orbRadii.highL *= 0.9; orbRadii.highR *= 0.9;
      if(!breath){
        cctx.fillStyle = "rgba(169,155,207,0.55)";
        cctx.font = `${13*devicePixelRatio}px ui-rounded, system-ui, sans-serif`;
        cctx.textAlign = "center";
        cctx.fillText("— resting —", w/2, h/2);
      }
      return;
    }

    if(lowOn && audioEngines.low.analyserL){
      const tL = 22*devicePixelRatio + getRms(audioEngines.low.analyserL) * h * 1.3;
      const tR = 22*devicePixelRatio + getRms(audioEngines.low.analyserR) * h * 1.3;
      orbRadii.lowL += (tL - orbRadii.lowL) * 0.12;
      orbRadii.lowR += (tR - orbRadii.lowR) * 0.12;
    } else {
      orbRadii.lowL *= 0.9; orbRadii.lowR *= 0.9;
    }
    if(highOn && audioEngines.high.analyserL){
      const tL = 22*devicePixelRatio + getRms(audioEngines.high.analyserL) * h * 1.3;
      const tR = 22*devicePixelRatio + getRms(audioEngines.high.analyserR) * h * 1.3;
      orbRadii.highL += (tL - orbRadii.highL) * 0.12;
      orbRadii.highR += (tR - orbRadii.highR) * 0.12;
    } else {
      orbRadii.highL *= 0.9; orbRadii.highR *= 0.9;
    }

    if(lowOn && highOn){
      drawOrb(w*0.14, h/2, orbRadii.lowL, els.low.colorL);
      drawOrb(w*0.38, h/2, orbRadii.lowR, els.low.colorR);
      drawOrb(w*0.62, h/2, orbRadii.highL, els.high.colorL);
      drawOrb(w*0.86, h/2, orbRadii.highR, els.high.colorR);
    } else if(lowOn){
      drawOrb(w*0.34, h/2, orbRadii.lowL, els.low.colorL);
      drawOrb(w*0.66, h/2, orbRadii.lowR, els.low.colorR);
    } else if(highOn){
      drawOrb(w*0.34, h/2, orbRadii.highL, els.high.colorL);
      drawOrb(w*0.66, h/2, orbRadii.highR, els.high.colorR);
    }
  }

  // ---------- Transport ----------
  const powerBtn = document.getElementById("powerBtn");
  const powerLabel = document.getElementById("powerLabel");
  const statusPill = document.getElementById("statusPill");
  const statusText = document.getElementById("statusText");

  function start(){
    if(running) return;
    if(!ctx) buildGraph();
    if(ctx.state === "suspended") ctx.resume();
    running = true;
    fadingOut = false;
    driftPhaseTime = 0;
    setNavBackgroundMode(true, "session");
    document.getElementById("backgroundModeNote").style.display = "block";
    ENGINE_KEYS.forEach(key => { applyEngineFrequencies(key); applyEngineMix(key); });
    updateEngineGains();
    applyNoiseType();
    applyNoiseLevel();
    masterGain.gain.cancelScheduledValues(ctx.currentTime);
    masterGain.gain.setValueAtTime(0, ctx.currentTime);
    masterGain.gain.linearRampToValueAtTime(1, ctx.currentTime + Math.max(0.1, luminousPrefs.fadeInSeconds));

    sessionEndsAt = sessionMinutes > 0 ? Date.now() + sessionMinutes*60000 : null;
    state.wakeWindowMs = sessionMinutes > 0 ? Math.min(180000, sessionMinutes*60000*0.3) : 0;
    timerInterval = setInterval(tickTimer, 1000);
    tickTimer();

    if(state.arcMode !== "off") arcStartedAt = Date.now();
    sessionStartedAt = Date.now();
    summaryVisible = false;
    sessionSummaryEl.style.display = "none";
    moodLabel.textContent = "How are you feeling right now?";
    state.moodBefore = null; state.moodAfter = null;
    [...moodRow.children].forEach(c => c.classList.remove("active"));

    powerBtn.classList.add("on");
    powerLabel.textContent = "STOP";
    statusPill.classList.add("live");
    statusText.textContent = "Flowing";

    driftTick();

    if(state.emdrOn){
      emdrSide = -1;
      armNextEmdrHit();
      emdrScheduler();
    }
    if(state.luminousOn) startLuminous();
    if(state.screenStrobeOn) startScreenStrobeSequence();
    if(!ambientPlaying){
      if(state.ambientQueue.length){
        playQueueFromStart(false);
      } else if(state.ambientTracks.length){
        if(state.ambientIndex === -1) state.ambientIndex = 0;
        playAmbientTrack(state.ambientIndex, false);
      }
    }
    updateMediaSession();
    saveLastSetup();
  }

  function fadeOut(seconds){
    fadingOut = true;
    if(ctx){
      masterGain.gain.cancelScheduledValues(ctx.currentTime);
      masterGain.gain.setValueAtTime(masterGain.gain.value, ctx.currentTime);
      masterGain.gain.linearRampToValueAtTime(0, ctx.currentTime + seconds);
    }
  }

  function fadeUp(seconds){
    fadingOut = true;
    if(ctx){
      masterGain.gain.cancelScheduledValues(ctx.currentTime);
      masterGain.gain.setValueAtTime(masterGain.gain.value, ctx.currentTime);
      masterGain.gain.linearRampToValueAtTime(1, ctx.currentTime + Math.max(0.1, seconds));
    }
  }

  function renderSessionSummary(){
    const moodEmojis = {1:"😖",2:"😕",3:"😐",4:"🙂",5:"😄"};
    let moodLine = "";
    if(state.moodBefore || state.moodAfter){
      moodLine = "<br>Mood: " + (state.moodBefore ? moodEmojis[state.moodBefore] : "—") + " → " + (state.moodAfter ? moodEmojis[state.moodAfter] : "—");
    }
    sessionSummaryEl.innerHTML = "<b style=\"color:var(--text);\">Session complete</b><br>" +
      sessionSummaryEl.dataset.duration + " min · " + sessionSummaryEl.dataset.band + moodLine;
  }

  // ---------- Local session history + progress stats ----------
  // Personal reflection only — a rolling local log, no accounts, no names,
  // nothing clinical. A named, recallable client history is a different,
  // more sensitive feature reserved for the subscription tier later.
  async function logSessionToHistory(record){
    try{ await dbPut("sessionHistory", record); }catch(e){ console.warn("Could not log session history:", e); }
  }

  async function updateSessionHistoryMood(id, moodAfter){
    try{
      const existing = await dbGet("sessionHistory", id);
      if(existing){
        existing.moodAfter = moodAfter;
        await dbPut("sessionHistory", existing);
      }
    }catch(e){ console.warn("Could not update session history mood:", e); }
    renderProgressStats();
  }

  async function computeProgressStats(){
    const records = await dbGetAll("sessionHistory");
    if(!records.length) return null;
    const weekAgo = Date.now() - 7*24*60*60*1000;
    const thisWeek = records.filter(r => new Date(r.date).getTime() >= weekAgo);
    const shifts = records.filter(r => r.moodBefore && r.moodAfter).map(r => r.moodAfter - r.moodBefore);
    const avgShift = shifts.length ? (shifts.reduce((a,b) => a+b, 0) / shifts.length) : null;
    const bandCounts = {};
    records.forEach(r => { bandCounts[r.bandDesc] = (bandCounts[r.bandDesc] || 0) + 1; });
    const mostUsedEntry = Object.entries(bandCounts).sort((a,b) => b[1]-a[1])[0];
    return {
      totalSessions: records.length,
      thisWeekCount: thisWeek.length,
      avgShift,
      mostUsed: mostUsedEntry ? mostUsedEntry[0] : null,
    };
  }

  async function renderProgressStats(){
    const stats = await computeProgressStats();
    if(!stats){ progressStatsEl.style.display = "none"; return; }
    const shiftText = stats.avgShift !== null
      ? (stats.avgShift > 0 ? "+" : "") + stats.avgShift.toFixed(1)
      : "—";
    progressStatsEl.style.display = "block";
    progressStatsEl.innerHTML = "<b style=\"color:var(--text);\">Your progress</b><br>" +
      stats.thisWeekCount + " session" + (stats.thisWeekCount === 1 ? "" : "s") + " this week" +
      " · avg mood shift " + shiftText +
      (stats.mostUsed ? " · most used: " + stats.mostUsed : "");
  }

  function stop(){
    if(!running) return;
    running = false;
    fadingOut = false;
    setNavBackgroundMode(false, "session");
    document.getElementById("backgroundModeNote").style.display = "none";
    if(ctx){
      masterGain.gain.cancelScheduledValues(ctx.currentTime);
      masterGain.gain.setValueAtTime(masterGain.gain.value, ctx.currentTime);
      masterGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.6);
    }
    clearInterval(timerInterval);
    timerInterval = null;
    sessionEndsAt = null;
    remainingEl.textContent = "—:—";
    powerBtn.classList.remove("on");
    powerLabel.textContent = "START";
    statusPill.classList.remove("live");
    statusText.textContent = "Resting";
    if(rafId) cancelAnimationFrame(rafId);
    if(emdrTimerId){ clearTimeout(emdrTimerId); emdrTimerId = null; }
    if(driftTimerId){ clearTimeout(driftTimerId); driftTimerId = null; }
    stopLuminous();
    stopScreenStrobe();
    stopAmbientSource();
    ambientNowPlaying.style.display = "none";
    renderAmbientTrackList();

    if(sessionStartedAt){
      const durationMin = Math.max(1, Math.round((Date.now() - sessionStartedAt) / 60000));
      let bandDesc;
      if(state.arcMode !== "off"){
        const arc = ARCS[state.arcMode];
        bandDesc = arc.label + " (" + BANDS[arc.from].label + " → " + BANDS[arc.to].label + ")";
      } else if(state.combineOn){
        bandDesc = "Low " + BANDS[state.engines.low.currentBand].label + " · High " + BANDS[state.engines.high.currentBand].label;
      } else {
        const key = state.activeTab;
        bandDesc = (key === "low" ? "Low " : "High ") + BANDS[state.engines[key].currentBand].label;
      }
      sessionSummaryEl.dataset.duration = durationMin;
      sessionSummaryEl.dataset.band = bandDesc;
      sessionSummaryEl.style.display = "block";
      summaryVisible = true;
      moodLabel.textContent = "How do you feel now?";
      [...moodRow.children].forEach(c => c.classList.remove("active"));
      renderSessionSummary();

      lastSessionRecordId = makeId();
      logSessionToHistory({
        id: lastSessionRecordId,
        date: new Date().toISOString(),
        durationMin,
        bandDesc,
        moodBefore: state.moodBefore,
        moodAfter: null,
      });
      renderProgressStats();
    }
    sessionStartedAt = null;
    updateMediaSession();
    saveLastSetup();
  }

  powerBtn.addEventListener("click", () => running ? stop() : start());

  // ---------- Init ----------
  sizeCanvas();
  updatePanelVisibility();
  ENGINE_KEYS.forEach(key => {
    selectEngineBand(key, "alpha");
    els[key].carrierVal.textContent = els[key].carrierSlider.value;
    els[key].beatVal.textContent = parseFloat(els[key].beatSlider.value).toFixed(1);
    els[key].volumeVal.textContent = els[key].volumeSlider.value;
  });
  driftDepthVal.textContent = parseFloat(driftDepthSlider.value).toFixed(1);
  driftRateVal.textContent = parseFloat(driftRateSlider.value).toFixed(1);
  noiseVal.textContent = noiseLevelSlider.value;
  emdrSpeedVal.textContent = emdrSpeedSlider.value;
  emdrVolumeVal.textContent = emdrVolumeSlider.value;
  emdrReverbVal.textContent = emdrReverbSlider.value;
  ambientVolumeVal.textContent = ambientVolumeSlider.value;
  breathSoundVolumeVal.textContent = breathSoundVolumeSlider.value;
  renderAmbientTrackList();
  renderQueue();
  drawScope();
  renderProgressStats();
  initTour();
  onBroadcastStopAll(() => { if(running) stop(); });

  // Restore whatever was running last time, so a returning visit opens where
  // you left off instead of the defaults every time. Applied before the
  // quick-start params below, so an explicit link from Home still wins.
  const LAST_SETUP_KEY = "vibrosomatics_last_setup";
  (function restoreLastSetup(){
    const saved = localStorage.getItem(LAST_SETUP_KEY);
    if(!saved) return;
    try{ applyPreset(JSON.parse(saved)); }catch(e){ console.warn("Could not restore last setup:", e); }
  })();
  function saveLastSetup(){
    try{ localStorage.setItem(LAST_SETUP_KEY, JSON.stringify(snapshotPreset())); }catch(e){ /* storage full/unavailable — non-fatal */ }
  }

  // Quick-start from the Home page:
  //   /session.html?preset=focus|winddown|deeprest|energize  → selects that Session Arc
  //   /session.html?solfeggio=528                            → applies that tone pairing
  //   /session.html?ambient=<track id>                       → pre-selects that ambient track
  // Each just triggers the same control a manual tap would — no separate
  // "preset" data model to keep in sync with the real controls. The banner
  // below is purely visual confirmation that the tap from Home actually
  // landed, since otherwise the only sign is a slider having moved somewhere
  // further down the page.
  const quickStartBanner = document.getElementById("quickStartBanner");
  let quickStartHideTimer = null;

  function showQuickStartBanner(message){
    quickStartBanner.innerHTML = `<b style="color:var(--green);">✓ Ready</b> — ${message}, loaded from Home.`;
    quickStartBanner.style.display = "block";
    clearTimeout(quickStartHideTimer);
    quickStartHideTimer = setTimeout(() => {
      quickStartBanner.style.display = "none";
    }, 9000);
  }

  (function applyQuickStartParams(){
    const params = new URLSearchParams(location.search);
    const preset = params.get("preset");
    if(preset && ARCS[preset]){
      const pill = arcRow.querySelector(`[data-arc="${preset}"]`);
      if(pill){
        pill.click();
        showQuickStartBanner(`${ARCS[preset].label} arc selected`);
      }
    }
    const solfeggioHz = params.get("solfeggio");
    if(solfeggioHz){
      const tone = SOLFEGGIO_TONES.find(t => String(t.hz) === solfeggioHz);
      solfeggioSelect.value = solfeggioHz;
      solfeggioSelect.dispatchEvent(new Event("change"));
      showQuickStartBanner(tone ? tone.label : (solfeggioHz + " Hz pairing"));
    }
  })();

  // Ambient tracks load asynchronously, so the ?ambient= param is applied
  // once the library has actually finished loading.
  window.addEventListener("vibrosomatics:ambient-ready", () => {
    const ambientId = new URLSearchParams(location.search).get("ambient");
    if(!ambientId) return;
    const idx = state.ambientTracks.findIndex(t => t.id === ambientId);
    if(idx === -1) return;
    state.ambientIndex = idx;
    renderAmbientTrackList();
    showQuickStartBanner(`"${state.ambientTracks[idx].name}" queued up`);
  }, { once: true });

  // A custom Home tile: /session.html?loadPreset=<id> restores the entire
  // saved setup in one shot — engines, drift, EMDR, arc, and the ambient
  // queue all together, not just a single control like the other quick-start
  // params. Waits for both the preset list and the ambient library to have
  // finished loading, since the queue restore needs the library present.
  function tryLoadPresetFromUrl(){
    const id = new URLSearchParams(location.search).get("loadPreset");
    if(!id) return;
    const preset = state.presets.find(p => p.id === id);
    if(!preset) return;
    applyPreset(preset.data);
    showQuickStartBanner(`"${preset.name}"`);
  }
  let presetsReady = false, ambientReadyForPreset = false;
  window.addEventListener("vibrosomatics:presets-ready", () => {
    presetsReady = true;
    if(ambientReadyForPreset) tryLoadPresetFromUrl();
  }, { once: true });
  window.addEventListener("vibrosomatics:ambient-ready", () => {
    ambientReadyForPreset = true;
    if(presetsReady) tryLoadPresetFromUrl();
  }, { once: true });
