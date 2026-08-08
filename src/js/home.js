import { ARCS, SOLFEGGIO_TONES, BANDS } from "./constants.js";
import { getBundledTracks } from "./sample-library.js";
import { gradientFor } from "./card-art.js";
import { renderNav } from "./nav.js";
import { brandHeroHTML } from "./logo.js";
import { dbGet, dbPut } from "./db.js";

renderNav("index");
document.getElementById("brand-hero-root").innerHTML = brandHeroHTML();

function capitalize(s){ return s.charAt(0).toUpperCase() + s.slice(1); }

// Deterministic week number so "Featured This Week" actually rotates without
// needing a backend — same formula every visitor sees, changes every Monday.
function getISOWeek(date){
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

// Custom tiles can carry a real uploaded image; everything else still gets
// the deterministic generated gradient.
function artStyle(item){
  if(item.image) return `background-image:url(${item.image}); background-size:cover; background-position:center;`;
  return `background:${gradientFor(item.seed)};`;
}

function cardHTML({ href, badge, title, desc, size, image, seed }){
  const item = { image, seed };
  if(size === "hero"){
    return `
      <a href="${href}" class="hero-card">
        <div class="hero-art" style="${artStyle(item)}">
          <span class="hero-badge">${badge}</span>
        </div>
        <div class="hero-text">
          <div class="hero-title">${title}</div>
          <div class="hero-desc">${desc}</div>
        </div>
      </a>`;
  }
  return `
    <a href="${href}" class="session-card">
      <div class="card-art" style="${artStyle(item)}">
        <span class="card-badge">${badge}</span>
      </div>
      <div class="card-text">
        <div class="card-title">${title}</div>
        <div class="card-desc">${desc}</div>
      </div>
    </a>`;
}

function renderRow(root, { title, sub, items }){
  if(!items.length) return;
  const section = document.createElement("div");
  section.className = "row-section";
  section.innerHTML = `
    <div class="row-header"><h3>${title}</h3></div>
    ${sub ? `<div class="row-sub">${sub}</div>` : ""}
    <div class="card-row">${items.map(i => cardHTML({ ...i, size: "card" })).join("")}</div>
  `;
  root.appendChild(section);
}

// "My Sessions" is the one row built from data you can actually change —
// every other row (Arcs, Solfeggio, Ambient, bundled tracks) is fixed
// content, so it stays on the plain renderRow above. This one needs its own
// path: an Edit toggle that switches tiles from "tap to load" links into
// "tap to rename, or delete" controls, with rename/delete actually writing
// back to the same presets store the tiles are read from.
let savedPresets = [];
let mySessionsEditing = false;

function renderMySessionsRow(root){
  const existing = root.querySelector('[data-row="my-sessions"]');
  if(existing) existing.remove();

  const items = savedPresets.filter(p => p.id);
  if(!items.length && !mySessionsEditing) return;

  const section = document.createElement("div");
  section.className = "row-section";
  section.dataset.row = "my-sessions";
  section.innerHTML = `
    <div class="row-header">
      <h3>My Sessions</h3>
      ${(items.length || mySessionsEditing) ? `<span class="row-edit-btn" id="mySessionsEditBtn">${mySessionsEditing ? "Done" : "Edit"}</span>` : ""}
    </div>
    <div class="row-sub">Built by you — tap to load the whole setup, tones and music together</div>
    <div class="card-row" id="mySessionsCardRow"></div>
  `;
  root.appendChild(section);

  const cardRow = section.querySelector("#mySessionsCardRow");
  if(!items.length && mySessionsEditing){
    cardRow.innerHTML = `<div class="row-sub" style="padding:0;">Nothing saved yet.</div>`;
  } else {
    items.forEach(p => cardRow.appendChild(buildMySessionCard(p, root)));
  }

  const editBtn = section.querySelector("#mySessionsEditBtn");
  if(editBtn){
    editBtn.addEventListener("click", () => {
      mySessionsEditing = !mySessionsEditing;
      renderMySessionsRow(root);
    });
  }
}

function buildMySessionCard(preset, root){
  const wrap = document.createElement(mySessionsEditing ? "div" : "a");
  wrap.className = "session-card";
  if(!mySessionsEditing) wrap.href = `/session.html?loadPreset=${encodeURIComponent(preset.id)}`;

  const art = document.createElement("div");
  art.className = "card-art";
  art.setAttribute("style", artStyle({ image: preset.imageDataUrl, seed: preset.id }));
  art.innerHTML = `<span class="card-badge">Mine</span>`;

  if(mySessionsEditing){
    const del = document.createElement("span");
    del.className = "card-delete-btn";
    del.textContent = "✕";
    del.title = "Delete this session";
    del.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      savedPresets = savedPresets.filter(p => p.id !== preset.id);
      await dbPut("presets", savedPresets, "all");
      renderMySessionsRow(root);
    });
    art.appendChild(del);
  }
  wrap.appendChild(art);

  const text = document.createElement("div");
  text.className = "card-text";

  if(mySessionsEditing){
    const input = document.createElement("input");
    input.className = "card-title-input";
    input.type = "text";
    input.value = preset.name;
    input.maxLength = 60;
    input.addEventListener("click", (e) => e.preventDefault());
    input.addEventListener("change", async () => {
      const newName = input.value.trim();
      if(!newName){ input.value = preset.name; return; }
      if(newName === preset.name) return;
      preset.name = newName;
      await dbPut("presets", savedPresets, "all");
    });
    text.appendChild(input);
  } else {
    const titleEl = document.createElement("div");
    titleEl.className = "card-title";
    titleEl.textContent = preset.name;
    text.appendChild(titleEl);
  }

  const desc = document.createElement("div");
  desc.className = "card-desc";
  desc.textContent = describePreset(preset.data || {});
  text.appendChild(desc);

  wrap.appendChild(text);
  return wrap;
}

// Turns one of your saved User Default presets into a short description —
// whatever arc it's using, or its Low engine's band if no arc is active.
function describePreset(data){
  if(data.arcMode && data.arcMode !== "off" && ARCS[data.arcMode]){
    const arc = ARCS[data.arcMode];
    return `${arc.label}: ${capitalize(arc.from)} → ${capitalize(arc.to)}`;
  }
  const band = data.engines && data.engines.low && data.engines.low.currentBand;
  if(band && BANDS[band]) return BANDS[band].label + " band";
  return "Custom session";
}

async function init(){
  const arcItems = Object.entries(ARCS).map(([key, arc]) => ({
    href: `/session.html?preset=${key}`,
    badge: "Arc",
    title: arc.label,
    desc: `${capitalize(arc.from)} → ${capitalize(arc.to)}`,
    seed: "arc:" + key,
  }));

  const solfeggioItems = SOLFEGGIO_TONES.map(t => {
    const [hzPart, namePart] = t.label.split(" — ");
    return {
      href: `/session.html?solfeggio=${t.hz}`,
      badge: "Solfeggio",
      title: hzPart,
      desc: namePart,
      seed: "sol:" + t.hz,
    };
  });

  let ambientItems = [];
  try{
    const bundled = await getBundledTracks();
    ambientItems = bundled.map(track => ({
      href: `/session.html?ambient=${encodeURIComponent(track.id)}`,
      badge: "Ambient",
      title: track.name,
      desc: (track.tags || []).slice(0, 2).join(" · "),
      seed: track.id,
    }));
  }catch(e){
    console.warn("Could not load bundled samples for Home:", e);
  }

  // Your own saved sessions — built on the Session page (dial in the tones,
  // add tracks to the queue, pick a cover image, hit "Save as User Default")
  // and they show up here automatically.
  try{
    const stored = await dbGet("presets", "all");
    if(Array.isArray(stored)){
      savedPresets = stored.filter(p => p.id); // older presets saved before this feature existed have no id — skip those
    }
  }catch(e){
    console.warn("Could not load your saved sessions for Home:", e);
  }

  // Featured hero rotates weekly across Arcs + Solfeggio pairings
  const featuredPool = [...arcItems, ...solfeggioItems];
  const featured = featuredPool[getISOWeek(new Date()) % featuredPool.length];
  document.getElementById("hero-card-root").innerHTML = cardHTML({ ...featured, size: "hero" });

  const rowsRoot = document.getElementById("rows-root");

  renderMySessionsRow(rowsRoot);

  const focusItems = [
    arcItems.find(i => i.href.includes("preset=focus")),
    solfeggioItems.find(i => i.title.startsWith("852")),
    solfeggioItems.find(i => i.title.startsWith("741")),
    ...ambientItems.filter(i => i.desc.includes("focus")),
  ].filter(Boolean);
  renderRow(rowsRoot, {
    title: "For Focus",
    sub: "When you need steady, alert attention for work or study",
    items: focusItems,
  });

  const relaxItems = [
    arcItems.find(i => i.href.includes("preset=winddown")),
    arcItems.find(i => i.href.includes("preset=deeprest")),
    solfeggioItems.find(i => i.title.startsWith("396")),
    solfeggioItems.find(i => i.title.startsWith("174")),
    ...ambientItems.filter(i => i.desc.includes("meditation") || i.desc.includes("water")).slice(0, 4),
  ].filter(Boolean);
  renderRow(rowsRoot, {
    title: "For Relaxation",
    sub: "When you want to unwind, ease anxiety, or settle in for sleep",
    items: relaxItems,
  });

  renderRow(rowsRoot, {
    title: "Session Arcs",
    sub: "Lets a session gradually shift you — like easing from alert focus into calm — automatically over time",
    items: arcItems,
  });

  renderRow(rowsRoot, {
    title: "Solfeggio Pairings",
    sub: "Specific tone frequencies some people use as part of a calming or focus routine",
    items: solfeggioItems,
  });

  renderRow(rowsRoot, {
    title: "Ambient Soundscapes",
    sub: "Real recordings — waves, birds, and more — to play under the tones",
    items: ambientItems.slice(0, 10),
  });
}

init();
