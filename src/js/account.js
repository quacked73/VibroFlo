// Account layer — currently a no-op stub.
//
// The Lite ($2.99) release ships without accounts, subscriptions, or
// cross-device sync — that's a deliberate product decision, not a gap.
// This module keeps the exact same function signatures that
// ambient-library.js and settings.js already call, so nothing else needs
// to change: everything here just behaves as "always signed out," which
// means presets and the audio library stay local to each device — exactly
// the Lite behavior.
//
// To bring real accounts back for the subscription tier later:
//   1. npm install @clerk/clerk-js
//   2. Replace the bodies below with the real Clerk + account-API calls
//      (fill in a real CLERK_PUBLISHABLE_KEY and API_BASE)
// Nothing calling into this module needs to change when that happens.

export function initAccount(mountElementId){
  const mountEl = document.getElementById(mountElementId);
  if(mountEl) mountEl.style.display = "none";
  return Promise.resolve();
}

export async function isSignedIn(){
  return false;
}

export async function fetchServerPresets(){ return null; }
export async function saveServerPreset(){ return null; }
export async function deleteServerPreset(){ /* no-op */ }

export async function fetchServerTracks(){ return null; }
export async function uploadServerTrack(){ return null; }
export async function deleteServerTrack(){ /* no-op */ }
export async function fetchServerTrackAudio(){ return null; }
