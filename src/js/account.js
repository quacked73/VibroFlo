// Account layer: Clerk handles identity, this module is the bridge between
// that and the account API Worker. Every page that needs to know "is
// someone logged in, and what have they saved" goes through here.
//
// Falls back gracefully everywhere: if Clerk hasn't loaded, or nobody's
// signed in, every function below just no-ops or returns an empty result —
// callers don't need their own "am I logged in" branching, this module
// absorbs that.

import Clerk from "@clerk/clerk-js";

// Set these once you have a real Clerk project + deployed Worker.
const CLERK_PUBLISHABLE_KEY = "pk_REPLACE_WITH_YOUR_CLERK_PUBLISHABLE_KEY";
const API_BASE = "https://api.vibroflo.com"; // wherever the account Worker ends up deployed

let clerk = null;
let clerkReady = null;

export function initAccount(mountElementId){
  clerk = new Clerk(CLERK_PUBLISHABLE_KEY);
  clerkReady = clerk.load().then(() => {
    const mountEl = document.getElementById(mountElementId);
    if(!mountEl) return;
    if(clerk.user){
      clerk.mountUserButton(mountEl);
    } else {
      clerk.mountSignIn(mountEl, { routing: "virtual" });
    }
  }).catch(err => {
    console.warn("Clerk failed to load — running signed-out:", err);
  });
  return clerkReady;
}

export async function isSignedIn(){
  if(clerkReady) await clerkReady;
  return !!(clerk && clerk.user);
}

async function authHeaders(){
  if(clerkReady) await clerkReady;
  if(!clerk || !clerk.session) return null;
  const token = await clerk.session.getToken();
  return token ? { Authorization: `Bearer ${token}` } : null;
}

async function apiFetch(path, options = {}){
  const headers = await authHeaders();
  if(!headers) return null; // not signed in — caller falls back to local storage
  const res = await fetch(API_BASE + path, {
    ...options,
    headers: { ...(options.headers || {}), ...headers },
  });
  if(!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
  return res;
}

// ---------- Presets ----------

export async function fetchServerPresets(){
  try{
    const res = await apiFetch("/api/presets");
    if(!res) return null; // signed out
    return await res.json();
  }catch(e){
    console.warn("Could not fetch server presets:", e);
    return null;
  }
}

export async function saveServerPreset(preset){
  try{
    const res = await apiFetch("/api/presets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(preset),
    });
    return res ? await res.json() : null;
  }catch(e){
    console.warn("Could not save preset to server:", e);
    return null;
  }
}

export async function deleteServerPreset(id){
  try{
    await apiFetch(`/api/presets/${encodeURIComponent(id)}`, { method: "DELETE" });
  }catch(e){
    console.warn("Could not delete server preset:", e);
  }
}

// ---------- Tracks ----------

export async function fetchServerTracks(){
  try{
    const res = await apiFetch("/api/tracks");
    if(!res) return null; // signed out
    return await res.json();
  }catch(e){
    console.warn("Could not fetch server tracks:", e);
    return null;
  }
}

export async function uploadServerTrack(file){
  try{
    const headers = await authHeaders();
    if(!headers) return null;
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(API_BASE + "/api/tracks", { method: "POST", headers, body: form });
    if(!res.ok) throw new Error(`upload failed: ${res.status}`);
    return await res.json();
  }catch(e){
    console.warn("Could not upload track to server:", e);
    return null;
  }
}

export async function deleteServerTrack(id){
  try{
    await apiFetch(`/api/tracks/${encodeURIComponent(id)}`, { method: "DELETE" });
  }catch(e){
    console.warn("Could not delete server track:", e);
  }
}

// Streams a synced track's audio for playback (R2 objects aren't public).
export async function fetchServerTrackAudio(id){
  const res = await apiFetch(`/api/tracks/${encodeURIComponent(id)}/audio`);
  return res ? await res.blob() : null;
}
