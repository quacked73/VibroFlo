// Generic IndexedDB helper. Works identically in a desktop browser tab, an
// Android WebView, and an iOS WebView — no platform-specific code needed.
// This is why IndexedDB (not the Capacitor Filesystem plugin) is the right
// storage layer for a single codebase that targets all three.

const DB_NAME = "vibrosomaticsDB";
const DB_VERSION = 4; // v4 adds bundledOverrides (user edits to bundled-track metadata, since the manifest itself is a static file the app can't rewrite)
const STORES = ["presets", "ambientTracks", "sessionHistory", "luminousAcknowledgments", "bundledOverrides"];

let dbPromise = null;

export function openDB(){
  if(!window.indexedDB) return Promise.reject(new Error("indexedDB unavailable"));
  if(dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if(!db.objectStoreNames.contains("presets")) db.createObjectStore("presets");
      if(!db.objectStoreNames.contains("ambientTracks")) db.createObjectStore("ambientTracks", { keyPath: "id" });
      if(!db.objectStoreNames.contains("sessionHistory")) db.createObjectStore("sessionHistory", { keyPath: "id" });
      if(!db.objectStoreNames.contains("luminousAcknowledgments")) db.createObjectStore("luminousAcknowledgments", { keyPath: "id" });
      if(!db.objectStoreNames.contains("bundledOverrides")) db.createObjectStore("bundledOverrides", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export async function dbGet(store, key){
  try{
    const db = await openDB();
    const req = db.transaction(store, "readonly").objectStore(store).get(key);
    return await new Promise(resolve => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    });
  }catch(e){ return undefined; }
}

export async function dbGetAll(store){
  try{
    const db = await openDB();
    const req = db.transaction(store, "readonly").objectStore(store).getAll();
    return await new Promise(resolve => {
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  }catch(e){ return []; }
}

export async function dbPut(store, value, key){
  try{
    const db = await openDB();
    const tx = db.transaction(store, "readwrite");
    key === undefined ? tx.objectStore(store).put(value) : tx.objectStore(store).put(value, key);
  }catch(e){ console.warn(`IndexedDB write to "${store}" failed:`, e); }
}

export async function dbDelete(store, key){
  try{
    const db = await openDB();
    db.transaction(store, "readwrite").objectStore(store).delete(key);
  }catch(e){ console.warn(`IndexedDB delete from "${store}" failed:`, e); }
}

export function makeId(){
  return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : ("id" + Date.now() + Math.random().toString(36).slice(2));
}
