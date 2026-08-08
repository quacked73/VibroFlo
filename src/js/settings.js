import { loadTrackList, addUserFile, removeUserTrack, updateTrackMetadata } from "./ambient-library.js";
import { renderNav } from "./nav.js";
import { downloadBackup, importBackup } from "./backup.js";

renderNav("settings");

const fileInput = document.getElementById("settingsFileInput");
const libraryList = document.getElementById("libraryList");
const addFormatSelect = document.getElementById("addFormatSelect");
const exportBackupBtn = document.getElementById("exportBackupBtn");
const importBackupInput = document.getElementById("importBackupInput");
const backupStatus = document.getElementById("backupStatus");

const FORMAT_LABELS = {
  none: "None",
  auto: "Auto-detect",
  audiostrobe: "AudioStrobe",
  spectrastrobe: "SpectraStrobe",
  lumasonic: "Lumasonic",
};

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
    row.style.marginBottom = "10px";
    row.style.flexWrap = "wrap";
    row.style.gap = "8px";

    const name = document.createElement("span");
    name.className = "track-name";
    name.textContent = track.name + (track.lightFormat && track.lightFormat !== "none" ? " 💡" : "");

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

    // Editable per-track — getting this wrong (or forgetting to set it) at
    // add-time shouldn't mean living with it forever. Works the same for
    // bundled and user-added tracks, even though they're stored differently
    // underneath (updateTrackMetadata handles that difference).
    const formatSelect = document.createElement("select");
    formatSelect.className = "field-input";
    formatSelect.style.fontSize = "11px";
    formatSelect.style.padding = "4px 8px";
    Object.entries(FORMAT_LABELS).forEach(([value, label]) => {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = label;
      if((track.lightFormat || "none") === value) opt.selected = true;
      formatSelect.appendChild(opt);
    });
    formatSelect.addEventListener("change", async () => {
      await updateTrackMetadata(track, { lightFormat: formatSelect.value });
      await refresh();
    });
    actions.appendChild(formatSelect);

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
    await addUserFile(file, addFormatSelect.value);
  }
  fileInput.value = "";
  addFormatSelect.value = "none";
  await refresh();
});

function showBackupStatus(text){
  backupStatus.textContent = text;
  backupStatus.style.display = "block";
}

exportBackupBtn.addEventListener("click", async () => {
  await downloadBackup();
  showBackupStatus("Backup downloaded.");
});

importBackupInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  importBackupInput.value = "";
  if(!file) return;
  try{
    const text = await file.text();
    const data = JSON.parse(text);
    const result = await importBackup(data);
    const skippedNote = result.ambientTrackMetaSkipped > 0
      ? ` (${result.ambientTrackMetaSkipped} more track edit(s) in the file were skipped — those tracks' audio isn't present on this device)`
      : "";
    showBackupStatus(
      `Imported: ${result.presets} preset(s), ${result.sessionHistory} session history entr${result.sessionHistory === 1 ? "y" : "ies"}, ` +
      `${result.bundledOverrides} bundled-track edit(s), ${result.ambientTrackMeta} uploaded-track metadata update(s)${skippedNote}, and Luminous settings.`
    );
    await refresh();
  }catch(e){
    showBackupStatus("Couldn't read that file — make sure it's a backup exported from VibroFlō.");
  }
});

refresh();
