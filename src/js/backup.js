// Exports/imports the user's local customizations as one portable JSON
// file — presets, bundled-track format-tag edits, uploaded-track metadata,
// session history, and Luminous preferences. Deliberately does NOT include
// the luminousAcknowledgments safety log: that's meant to be a trustworthy
// record of what actually happened on this specific device, and letting it
// round-trip through an editable export file would undermine the one thing
// it's for.
//
// Also deliberately does not include the actual audio bytes of
// locally-uploaded files — those can be large enough to make a "backup"
// impractical to email or carry between devices. This exports track
// metadata (name, tags, light-signal format) so those settings survive a
// transfer, but the audio itself still needs to be re-added on the new
// device if it isn't already there. Cloudinary-hosted tracks don't have
// this problem at all, since they're already centrally accessible from
// anywhere — that's the better answer for anything you want to move
// between devices painlessly.

import { dbGet, dbPut, dbGetAll } from "./db.js";
import { getLuminousPrefs, saveLuminousPrefs } from "./luminous-prefs.js";

const BACKUP_VERSION = 1;

export async function exportBackup(){
  const [presets, sessionHistory, bundledOverrides, ambientTracks] = await Promise.all([
    dbGet("presets", "all"),
    dbGetAll("sessionHistory"),
    dbGetAll("bundledOverrides"),
    dbGetAll("ambientTracks"),
  ]);

  // Metadata only — never the audio blob itself.
  const ambientTrackMeta = ambientTracks.map(({ id, name, tags, lightFormat }) => ({ id, name, tags, lightFormat }));

  return {
    backupVersion: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    presets: presets || [],
    sessionHistory,
    bundledOverrides,
    ambientTrackMeta,
    luminousPrefs: getLuminousPrefs(),
  };
}

export async function downloadBackup(){
  const data = await exportBackup();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const stamp = new Date().toISOString().slice(0, 10);
  a.download = `vibroflo-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Merges rather than wipes-then-replaces, so importing on a device that
// already has some of its own local data doesn't destroy it. Presets are
// the one exception — since they're stored as a single list rather than
// individual records, importing merges by preset id within that list
// instead of at the database-record level.
export async function importBackup(data){
  if(!data || typeof data !== "object") throw new Error("Not a valid backup file");

  if(Array.isArray(data.presets) && data.presets.length){
    const existing = (await dbGet("presets", "all")) || [];
    const byId = new Map(existing.map(p => [p.id, p]));
    for(const p of data.presets) byId.set(p.id, p);
    await dbPut("presets", [...byId.values()], "all");
  }

  for(const entry of data.sessionHistory || []){
    await dbPut("sessionHistory", entry);
  }
  for(const override of data.bundledOverrides || []){
    await dbPut("bundledOverrides", override);
  }
  let ambientMetaApplied = 0;
  if((data.ambientTrackMeta || []).length){
    const existingTracks = await dbGetAll("ambientTracks");
    for(const meta of data.ambientTrackMeta){
      // Only updates a track that already exists locally — a metadata-only
      // record with no audio behind it would just be a broken entry.
      const existing = existingTracks.find(t => t.id === meta.id);
      if(existing){
        await dbPut("ambientTracks", { ...existing, name: meta.name, tags: meta.tags, lightFormat: meta.lightFormat });
        ambientMetaApplied++;
      }
    }
  }
  if(data.luminousPrefs){
    saveLuminousPrefs(data.luminousPrefs);
  }

  return {
    presets: (data.presets || []).length,
    sessionHistory: (data.sessionHistory || []).length,
    bundledOverrides: (data.bundledOverrides || []).length,
    ambientTrackMeta: ambientMetaApplied,
    ambientTrackMetaSkipped: (data.ambientTrackMeta || []).length - ambientMetaApplied,
  };
}
