// The Flō Builder — a guided way to create a session without meeting all 45+
// controls on the Session page at once. It doesn't introduce any new session
// capability; it writes exactly the same preset shape the Session page's own
// "save" produces, so anything built here loads and behaves identically.
//
// The ordering principle is intent before mechanics: the first answer sets
// sensible defaults for everything downstream, so every later step is a tweak
// rather than a decision made cold.

import { renderNav } from "./nav.js";
import { dbGet, dbPut, makeId } from "./db.js";
import { BANDS, ARCS } from "./constants.js";

renderNav("index");

// Each goal maps to a starting band, a glide target if the user picks "glide,"
// and the ending style that actually makes sense for it — waking up from a
// sleep session with a fade-up would be wrong, for instance.
// arc / ending values here are the exact keys the Session page already uses
// (ARCS in constants.js, and the endingRow pills) — not invented labels, so a
// Flō loads through the identical code path as any other saved preset.
const GOALS = {
  focus:    { label: "Focus",     band: "beta",  arc: "focus",    ending: "fadeout", engine: "high", note: "Beta — alert, engaged attention. Good for work that needs sustained concentration." },
  relax:    { label: "Relax",     band: "alpha", arc: "winddown", ending: "fadeout", engine: "high", note: "Alpha — calm but awake. The everyday unwinding range." },
  sleep:    { label: "Sleep",     band: "delta", arc: "deeprest", ending: "fadeout", engine: "low",  note: "Delta — deep rest. Slowest of the five bands." },
  winddown: { label: "Wind down", band: "alpha", arc: "winddown", ending: "fadeout", engine: "low",  note: "Starts calm and settles further — built to hand you off to sleep." },
  energize: { label: "Energize",  band: "theta", arc: "energize", ending: "sunrise", engine: "high", note: "Climbs from relaxed toward alert — the reverse of a wind-down." },
};

const state = {
  step: 1,
  goal: null,
  minutes: 30,
  arc: "off",
  ending: "fadeout",
  engine: "high",
  noise: "off",
  drift: true,
  music: false,
  breath: false,
  light: false,
};

const TOTAL_STEPS = 5;

const stepEls = [...document.querySelectorAll(".flo-step")];
const progressEl = document.getElementById("floProgress");
const backBtn = document.getElementById("floBackBtn");
const nextBtn = document.getElementById("floNextBtn");
const skipBtn = document.getElementById("floSkipBtn");

function renderProgress(){
  progressEl.innerHTML = Array.from({ length: TOTAL_STEPS }, (_, i) =>
    `<div class="flo-dot${i + 1 === state.step ? " active" : ""}${i + 1 < state.step ? " done" : ""}"></div>`
  ).join("");
}

function showStep(n){
  state.step = n;
  stepEls.forEach(el => {
    el.style.display = Number(el.dataset.step) === n ? "block" : "none";
  });
  backBtn.style.visibility = n === 1 ? "hidden" : "visible";
  skipBtn.style.display = n === TOTAL_STEPS ? "none" : "block";
  nextBtn.textContent = n === TOTAL_STEPS ? "Save to Home" : "Next";
  // Step 1 is the one question the rest genuinely depends on, so it's the
  // only one that can't be skipped past without an answer.
  nextBtn.classList.toggle("disabled", n === 1 && !state.goal);
  if(n === 3) renderBandNote();
  if(n === TOTAL_STEPS) renderSummary();
  renderProgress();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderBandNote(){
  const g = GOALS[state.goal];
  if(!g) return;
  const band = BANDS[g.band];
  document.getElementById("floBandNote").innerHTML =
    `<b style="color:var(--text);">${band.label} — ${band.sub}</b><br>${g.note}`;
}

function renderSummary(){
  const g = GOALS[state.goal];
  const bits = [
    `${g.label}, ${state.minutes} minutes`,
    state.arc === "auto" ? `gliding ${ARCS[g.arc].label.toLowerCase()}` : `holding ${BANDS[g.band].label}`,
    state.engine === "combine" ? "both engines" : `${state.engine === "low" ? "Low" : "High"} engine`,
  ];
  if(state.noise !== "off") bits.push(`${state.noise} background`);
  if(state.drift) bits.push("natural drift");
  if(state.music) bits.push("music underneath");
  if(state.breath) bits.push("breath pacer");
  if(state.light) bits.push("light sync");
  document.getElementById("floSummary").textContent = bits.join(" · ") + ".";

  const nameInput = document.getElementById("floName");
  if(!nameInput.value.trim()){
    nameInput.placeholder = `${g.label} · ${state.minutes} min`;
  }
}

// Generic single-choice pill row wiring — every choice row on this page
// behaves the same way, so they share one handler.
function wireChoiceRow(id, attr, onPick){
  const row = document.getElementById(id);
  if(!row) return;
  row.addEventListener("click", (e) => {
    const pill = e.target.closest(".pill");
    if(!pill) return;
    [...row.children].forEach(c => c.classList.remove("active"));
    pill.classList.add("active");
    onPick(pill.dataset[attr]);
  });
}

function wireSwitch(id, onToggle){
  const el = document.getElementById(id);
  if(!el) return;
  el.addEventListener("click", () => {
    const on = !el.classList.contains("on");
    el.classList.toggle("on", on);
    onToggle(on);
  });
}

wireChoiceRow("floGoalRow", "goal", (v) => {
  state.goal = v;
  const g = GOALS[v];
  // Seed the downstream defaults from the goal, and reflect them in the UI
  // so later steps open already showing what was chosen for them.
  state.ending = g.ending;
  state.engine = g.engine;
  syncPill("floEndingRow", "ending", state.ending);
  syncPill("floEngineRow", "engine", state.engine);
  nextBtn.classList.remove("disabled");
});

function syncPill(rowId, attr, value){
  const row = document.getElementById(rowId);
  if(!row) return;
  [...row.children].forEach(c => c.classList.toggle("active", c.dataset[attr] === value));
}

wireChoiceRow("floLengthRow", "min", (v) => { state.minutes = parseInt(v, 10); });
wireChoiceRow("floArcRow", "arc", (v) => { state.arc = v; });
wireChoiceRow("floEndingRow", "ending", (v) => { state.ending = v; });
wireChoiceRow("floEngineRow", "engine", (v) => { state.engine = v; });
wireChoiceRow("floNoiseRow", "noise", (v) => { state.noise = v; });

wireSwitch("floDriftSwitch", (on) => { state.drift = on; });
wireSwitch("floMusicSwitch", (on) => { state.music = on; });
wireSwitch("floBreathSwitch", (on) => { state.breath = on; });
wireSwitch("floLightSwitch", (on) => {
  state.light = on;
  // The warning belongs at the moment of choosing, not as a surprise modal
  // later — though the session itself still asks for explicit confirmation
  // before any light actually starts.
  document.getElementById("floLightWarning").style.display = on ? "block" : "none";
});

// Builds the exact same shape session.js's own snapshotPreset() produces, so
// a Flō loads through the identical code path as a preset saved from the
// Session page. Anything not set here is deliberately left at the Session
// page's own defaults rather than guessed at.
function buildPresetData(){
  const g = GOALS[state.goal];
  const band = g.band;
  const beat = BANDS[band].def;
  const engineDefaults = (b) => ({
    currentBand: b,
    carrier: 200,
    beatBase: BANDS[b].def,
    volume: 50,
    balance: 0,
    toneMode: "binaural",
    muted: false,
  });

  const low = engineDefaults(band);
  const high = engineDefaults(band);
  if(state.engine === "low") high.muted = true;
  if(state.engine === "high") low.muted = true;

  return {
    engines: { low, high },
    activeTab: state.engine === "low" ? "low" : "high",
    combineOn: state.engine === "combine",
    driftOn: state.drift, driftDepth: 15, driftRate: 3,
    emdrOn: false, emdrSound: "tap", emdrBpm: 60, emdrVolume: 40, emdrReverbDepth: 30,
    noiseType: state.noise, noiseLevel: state.noise === "off" ? 0 : 25,
    ambientVolume: 40,
    ambientMode: "playlist",
    ambientShuffle: state.music,
    ambientFilterOn: false,
    arcMode: state.arc === "auto" ? g.arc : "off",
    breathPattern: state.breath ? "box" : "off",
    breathSoundOn: state.breath, breathSoundVolume: 30,
    endingStyle: state.ending,
    sessionMinutes: state.minutes,
    ambientQueue: [],
    luminousOn: state.light,
  };
}

async function saveAndGoHome(){
  const g = GOALS[state.goal];
  const nameInput = document.getElementById("floName");
  const name = nameInput.value.trim() || `${g.label} · ${state.minutes} min`;

  let presets = [];
  try{
    const stored = await dbGet("presets", "all");
    if(Array.isArray(stored)) presets = stored;
  }catch(e){
    console.warn("Could not read existing sessions:", e);
  }
  presets.push({ id: makeId(), name, data: buildPresetData(), imageDataUrl: null });
  await dbPut("presets", presets, "all");
  window.location.href = "/index.html";
}

nextBtn.addEventListener("click", async () => {
  if(nextBtn.classList.contains("disabled")) return;
  if(state.step === TOTAL_STEPS){
    nextBtn.classList.add("disabled");
    nextBtn.textContent = "Saving…";
    await saveAndGoHome();
    return;
  }
  showStep(state.step + 1);
});

backBtn.addEventListener("click", () => {
  if(state.step > 1) showStep(state.step - 1);
});

skipBtn.addEventListener("click", () => {
  if(!state.goal) return; // step 1 still needs an answer before defaults mean anything
  showStep(TOTAL_STEPS);
});

showStep(1);
