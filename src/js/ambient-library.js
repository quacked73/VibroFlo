// Shared data layer for the ambient audio library. Both session.js (the
// player — picks a track and plays it) and settings.js (the manager — adds
// and removes files) read/write through this same module, so the library is
// consistent no matter which page you're on. Nothing here touches an
// AudioContext — decoding is left to whichever page actually plays a track.

import { dbGetAll, dbPut, dbDelete, makeId } from "./db.js";
import { getBundledTracks } from "./sample-library.js";

// Returns the full library: bundled samples first, then anything the user
// has added. Each entry: { id, name, source: "bundled"|"user", blob?, file?, buffer:null }
export async function loadTrackList(){
  const userRecords = await dbGetAll("ambientTracks");
  const userTracks = userRecords.map(rec => ({
    id: rec.id, name: rec.name, blob: rec.blob, buffer: null, source: "user",
  }));
  const bundled = await getBundledTracks();
  return bundled.concat(userTracks);
}

export async function addUserFile(file){
  const id = makeId();
  await dbPut("ambientTracks", { id, name: file.name, blob: file });
  return { id, name: file.name, blob: file, buffer: null, source: "user" };
}

export async function removeUserTrack(id){
  await dbDelete("ambientTracks", id);
}
