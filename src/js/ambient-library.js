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

// Returns the full library: bundled samples first, then anything the user
// has added. Each entry: { id, name, source: "bundled"|"user", blob?, buffer:null, synced?, hasEmbeddedLight? }
export async function loadTrackList(){
  const bundled = await getBundledTracks();

  if(await isSignedIn()){
    const serverTracks = await fetchServerTracks();
    if(serverTracks){
      const userTracks = serverTracks.map(rec => ({
        id: rec.id, name: rec.name, buffer: null, source: "user", synced: true,
        hasEmbeddedLight: !!rec.hasEmbeddedLight,
      }));
      return bundled.concat(userTracks);
    }
    // server fetch failed even though signed in — fall through to local as a safety net
  }

  const userRecords = await dbGetAll("ambientTracks");
  const userTracks = userRecords.map(rec => ({
    id: rec.id, name: rec.name, blob: rec.blob, buffer: null, source: "user", synced: false,
    hasEmbeddedLight: !!rec.hasEmbeddedLight,
  }));
  return bundled.concat(userTracks);
}

export async function addUserFile(file, hasEmbeddedLight){
  if(await isSignedIn()){
    const result = await uploadServerTrack(file);
    if(result){
      return { id: result.id, name: result.name, buffer: null, source: "user", synced: true, hasEmbeddedLight: !!hasEmbeddedLight };
    }
    // upload failed — fall through to local so the file isn't just lost
  }
  const id = makeId();
  await dbPut("ambientTracks", { id, name: file.name, blob: file, hasEmbeddedLight: !!hasEmbeddedLight });
  return { id, name: file.name, blob: file, buffer: null, source: "user", synced: false, hasEmbeddedLight: !!hasEmbeddedLight };
}

export async function removeUserTrack(id, synced){
  if(synced || await isSignedIn()){
    await deleteServerTrack(id);
    return;
  }
  await dbDelete("ambientTracks", id);
}

// A synced track has no local blob/buffer yet — this fetches the actual
// audio bytes from the API right before it's needed, same lazy-decode
// pattern already used for tracks restored from local IndexedDB.
export async function fetchSyncedTrackBlob(id){
  return await fetchServerTrackAudio(id);
}
