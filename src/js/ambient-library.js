// Shared data layer for the ambient audio library. Both session.js (the
// player — picks a track and plays it) and settings.js (the manager — adds
// and removes files) read/write through this same module, so the library is
// consistent no matter which page you're on. Nothing here touches an
// AudioContext — decoding is left to whichever page actually plays a track.
//
// Signed in: source of truth is the account API (R2 + D1) — same library
// on every device. Signed out: falls back to the original per-device
// IndexedDB behavior, unchanged from before accounts existed.

import { dbGetAll, dbPut, dbDelete, makeId } from "./db.js";
import { getBundledTracks } from "./sample-library.js";
import { isSignedIn, fetchServerTracks, uploadServerTrack, deleteServerTrack, fetchServerTrackAudio } from "./account.js";

// lightFormat: "none" | "auto" | "audiostrobe" | "spectrastrobe" | "lumasonic"
// "none" — no real embedded signal, Screen Mode uses the synthetic tone-engine flicker
// "auto" — has a real signal, but let the decoder figure out which codec via detection
// a specific codec — skips detection entirely and locks straight to that one, for
// tracks where the format is already known and there's no reason to guess
//
// Older records only have the boolean hasEmbeddedLight — this derives the
// equivalent lightFormat from it so nothing already saved breaks.
function normalizeLightFormat(rec){
  if(rec.lightFormat) return rec.lightFormat;
  return rec.hasEmbeddedLight ? "auto" : "none";
}

// Returns the full library: bundled samples first, then anything the user
// has added. Each entry: { id, name, source: "bundled"|"user", blob?, buffer:null, synced?, lightFormat, tags }
export async function loadTrackList(){
  const bundled = await getBundledTracks();
  const overrides = await dbGetAll("bundledOverrides");
  const overrideMap = new Map(overrides.map(o => [o.id, o]));
  const bundledWithOverrides = bundled.map(track => {
    const o = overrideMap.get(track.id);
    if(!o) return { ...track, lightFormat: normalizeLightFormat(track) };
    return {
      ...track,
      name: o.name ?? track.name,
      tags: o.tags ?? track.tags,
      lightFormat: o.lightFormat ?? normalizeLightFormat(track),
    };
  });

  if(await isSignedIn()){
    const serverTracks = await fetchServerTracks();
    if(serverTracks){
      const userTracks = serverTracks.map(rec => ({
        id: rec.id, name: rec.name, buffer: null, source: "user", synced: true,
        tags: rec.tags || [], lightFormat: normalizeLightFormat(rec),
      }));
      return bundledWithOverrides.concat(userTracks);
    }
    // server fetch failed even though signed in — fall through to local as a safety net
  }

  const userRecords = await dbGetAll("ambientTracks");
  const userTracks = userRecords.map(rec => ({
    id: rec.id, name: rec.name, blob: rec.blob, buffer: null, source: "user", synced: false,
    tags: rec.tags || [], lightFormat: normalizeLightFormat(rec),
  }));
  return bundledWithOverrides.concat(userTracks);
}

export async function addUserFile(file, lightFormat){
  if(await isSignedIn()){
    const result = await uploadServerTrack(file);
    if(result){
      return { id: result.id, name: result.name, buffer: null, source: "user", synced: true, lightFormat: lightFormat || "none" };
    }
    // upload failed — fall through to local so the file isn't just lost
  }
  const id = makeId();
  await dbPut("ambientTracks", { id, name: file.name, blob: file, lightFormat: lightFormat || "none" });
  return { id, name: file.name, blob: file, buffer: null, source: "user", synced: false, lightFormat: lightFormat || "none" };
}

export async function removeUserTrack(id, synced){
  if(synced || await isSignedIn()){
    await deleteServerTrack(id);
    return;
  }
  await dbDelete("ambientTracks", id);
}

// Edits a track's metadata after the fact — the whole point being that
// getting a format tag wrong (or forgetting to set one) at add-time
// shouldn't mean living with it forever. Works for both user-uploaded
// tracks (updates the record directly) and bundled ones (stored as a
// separate override, since the manifest itself is a static file this code
// can't rewrite).
export async function updateTrackMetadata(track, changes){
  if(track.source === "bundled"){
    const current = (await dbGetAll("bundledOverrides")).find(o => o.id === track.id) || { id: track.id };
    await dbPut("bundledOverrides", { ...current, ...changes });
    return;
  }
  const record = { id: track.id, name: track.name, tags: track.tags, lightFormat: track.lightFormat, ...changes };
  if(track.blob) record.blob = track.blob;
  await dbPut("ambientTracks", record);
}

// A synced track has no local blob/buffer yet — this fetches the actual
// audio bytes from the API right before it's needed, same lazy-decode
// pattern already used for tracks restored from local IndexedDB.
export async function fetchSyncedTrackBlob(id){
  return await fetchServerTrackAudio(id);
}
