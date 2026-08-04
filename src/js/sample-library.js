// Loads the bundled sample-audio manifest (public/audio/samples/manifest.json)
// and exposes the entries to the ambient library. Actual decoding is lazy —
// a sample's audio isn't fetched/decoded until it's actually selected to play,
// same principle as the on-demand decode already used for IndexedDB-restored
// user uploads. Bundled samples are tagged source:"bundled" so the ambient
// library can tell them apart from source:"user" tracks (bundled ones aren't
// offered for deletion, and re-seeding on app update won't duplicate them).

const MANIFEST_URL = "/audio/samples/manifest.json";

let manifestPromise = null;

export function loadManifest(){
  if(manifestPromise) return manifestPromise;
  manifestPromise = fetch(MANIFEST_URL)
    .then(res => {
      if(!res.ok) throw new Error("manifest fetch failed: " + res.status);
      return res.json();
    })
    .then(list => Array.isArray(list) ? list : [])
    .catch(err => {
      console.warn("Could not load bundled sample manifest:", err);
      return [];
    });
  return manifestPromise;
}

// Returns track-list-shaped entries: { id, name, tags, source:"bundled", file }
// Note: no `buffer` yet — decoded lazily by the ambient library right before
// first playback, exactly like restored IndexedDB tracks.
export async function getBundledTracks(){
  const manifest = await loadManifest();
  return manifest.map(entry => ({
    id: "bundled:" + entry.id,
    name: entry.name,
    tags: entry.tags || [],
    source: "bundled",
    file: entry.file,
    buffer: null,
  }));
}

export async function decodeBundledTrack(ctx, track){
  const res = await fetch(track.file);
  if(!res.ok) throw new Error("sample fetch failed: " + res.status);
  const arrayBuffer = await res.arrayBuffer();
  return await ctx.decodeAudioData(arrayBuffer);
}
