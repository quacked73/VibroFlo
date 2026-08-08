// Shared math for every Luminous light mode — the audio-based AudioStrobe
// signal (session.js) and the phone-screen flicker mode both pull from
// here, so the two never behave subtly differently from each other.

export const LUMINOUS_FLOOR = 7.84;  // Schumann resonance — below this, a flash reads as a slow blink, not a pulse
export const LUMINOUS_CEILING = 50;  // matches Gamma's own ceiling in this app

// Delta and Theta run below the floor on their own. Rather than flash too
// slowly to feel coherent, step the rate up by a whole-number multiple until
// it lands inside the window — an octave-like relationship that stays
// mathematically tied to the real target state instead of an arbitrary
// number. Alpha/Beta/Gamma already sit inside the window, so they pass
// through unchanged.
export function bestFitLuminousRate(engineRate){
  if(engineRate >= LUMINOUS_FLOOR && engineRate <= LUMINOUS_CEILING) return engineRate;
  if(engineRate < LUMINOUS_FLOOR){
    let mult = Math.max(1, Math.ceil(LUMINOUS_FLOOR / engineRate));
    let candidate = engineRate * mult;
    while(candidate > LUMINOUS_CEILING && mult > 1){ mult--; candidate = engineRate * mult; }
    return candidate >= LUMINOUS_FLOOR ? candidate : LUMINOUS_FLOOR;
  }
  let div = Math.max(1, Math.ceil(engineRate / LUMINOUS_CEILING));
  return Math.max(LUMINOUS_FLOOR, Math.min(LUMINOUS_CEILING, engineRate / div));
}

// A slow, smooth, deterministic wander — two sine waves at slightly
// different, non-round rates so the pattern never quite repeats. Same shape
// used for both eye-drift-offset and brightness-variation, just with
// different constants so the two never move in lockstep with each other.
function twoSineWander(phaseTime, rate1, rate2, phase2){
  return 0.6*Math.sin(2*Math.PI*rate1*phaseTime) + 0.4*Math.sin(2*Math.PI*rate2*phaseTime + phase2);
}

export function computeEyeDriftOffset(phaseTime, eyeDriftPercent){
  if(!eyeDriftPercent) return 0;
  const depth = (eyeDriftPercent/100) * 0.6; // up to ~0.6Hz apart at 100%
  return depth * twoSineWander(phaseTime, 0.05, 0.083, 2.1);
}

export function computeBrightnessWander(phaseTime, brightnessVarPercent){
  if(!brightnessVarPercent) return 0;
  const depth = (brightnessVarPercent/100) * 0.35;
  return depth * twoSineWander(phaseTime, 0.037, 0.061, 3.4);
}

// How much of the Eye Drift ceiling actually gets used — calm and unified
// for the slower, deeper bands; fuller and more dynamic for the faster,
// more alert ones.
const BAND_DRIFT_SCALE = { delta: 0.2, theta: 0.4, alpha: 0.7, beta: 1, gamma: 1 };
export function driftScaleForBand(band){
  return BAND_DRIFT_SCALE[band] !== undefined ? BAND_DRIFT_SCALE[band] : 1;
}
