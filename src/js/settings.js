import { loadTrackList, addUserFile, removeUserTrack } from "./ambient-library.js";
import { renderNav } from "./nav.js";

renderNav("settings");

const fileInput = document.getElementById("settingsFileInput");
const libraryList = document.getElementById("libraryList");
const embeddedLightSwitch = document.getElementById("embeddedLightSwitch");
let embeddedLightChecked = false;

embeddedLightSwitch.addEventListener("click", () => {
  embeddedLightChecked = !embeddedLightChecked;
  embeddedLightSwitch.classList.toggle("on", embeddedLightChecked);
});

let tracks = [];

function render(){
  libraryList.innerHTML = "";
  if(!tracks.length){
    libraryList.innerHTML = `<div class="callout">No files yet — add some below.</div>`;
    return;
  }
  tracks.forEach(track => {
    const row = document.createElement("div");
    row.className = "track-row";
    row.style.marginBottom = "6px";

    const name = document.createElement("span");
    name.className = "track-name";
    name.textContent = track.name + (track.hasEmbeddedLight ? " 💡" : "");

    const actions = document.createElement("span");
    actions.style.display = "flex";
    actions.style.gap = "10px";
    actions.style.alignItems = "center";

    const badge = document.createElement("span");
    badge.textContent = track.source === "bundled" ? "Bundled" : "This device only";
    badge.style.fontSize = "10px";
    badge.style.fontFamily = "var(--mono)";
    badge.style.color = track.source === "bundled" ? "var(--muted)" : "var(--amber)";
    actions.appendChild(badge);

    if(track.source === "user"){
      const del = document.createElement("span");
      del.className = "track-remove";
      del.textContent = "✕";
      del.addEventListener("click", async () => {
        await removeUserTrack(track.id, track.synced);
        await refresh();
      });
      actions.appendChild(del);
    }

    row.appendChild(name);
    row.appendChild(actions);
    libraryList.appendChild(row);
  });
}

async function refresh(){
  tracks = await loadTrackList();
  render();
}

fileInput.addEventListener("change", async (e) => {
  const files = [...e.target.files];
  if(!files.length) return;
  for(const file of files){
    await addUserFile(file, embeddedLightChecked);
  }
  fileInput.value = "";
  embeddedLightChecked = false;
  embeddedLightSwitch.classList.remove("on");
  await refresh();
});

refresh();
