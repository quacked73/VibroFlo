// Persisted Luminous behavior preferences — configured on the Luminous
// settings page, read by Session when a session actually starts. Plain
// localStorage rather than IndexedDB since these are a handful of small
// values, same pattern already used for "remember last setup" elsewhere.

const KEY = "vibrosomatics_luminous_prefs";

const DEFAULTS = {
  eyeDrift: 40,
  brightnessVar: 30,
  followMusic: false,
  fadeInSeconds: 10,       // shared by the AudioStrobe signal and the Screen Mode flicker
  screenBrightnessDefault: 70,
  countdownSeconds: 6,     // 5-15s range — time to get positioned before Screen Mode actually starts flickering
  sensitivity: 4,          // 1 (least) to 5 (most, the practical floor) — 4 is where detection already stood before this became adjustable
  flickerContrast: 60,     // 0-100. How hard the off-phase is driven to black. Higher = squarer, more distinct strobe; lower = softer pulse
  flickerDuty: 50,         // 10-90. Percent of each cycle the synthetic flicker is ON. Lower = shorter, more distinct flash against a longer dark phase
};

export function getLuminousPrefs(){
  try{
    const saved = JSON.parse(localStorage.getItem(KEY) || "{}");
    return { ...DEFAULTS, ...saved };
  }catch(e){
    return { ...DEFAULTS };
  }
}

export function saveLuminousPrefs(partial){
  const current = getLuminousPrefs();
  const next = { ...current, ...partial };
  try{ localStorage.setItem(KEY, JSON.stringify(next)); }catch(e){ /* storage full/unavailable — non-fatal */ }
  return next;
}
