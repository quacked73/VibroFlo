// One-time orientation modal: shown once on a person's very first visit,
// explains what every section does in a single popup, dismissed with one
// "Got it." Nothing is gated or hidden — every control is available
// immediately. This replaced an earlier version that made people click
// through eleven separate section-by-section gates just once, which
// testers correctly flagged as annoying even as a one-time thing.

const TOUR_ITEMS = [
  { title: "Presets", desc: "Quick-load a Solfeggio pairing or one of your saved combinations anytime — no need to rebuild a setup from scratch." },
  { title: "Engines", desc: "Work on Low or High one at a time, or turn on Combine to play both together." },
  { title: "Session Arc", desc: "Lets the session glide from one band to another automatically over time, instead of holding one frequency the whole way through." },
  { title: "Low Engine", desc: "20–120Hz — felt as much as heard. This is what drives a vibroacoustic table." },
  { title: "High Engine", desc: "100Hz–1kHz — the classic binaural tone range. Needs headphones to work as intended." },
  { title: "Variability Drift", desc: "Adds a natural wander to the beat frequency so it doesn't feel locked rigidly in place." },
  { title: "EMDR Bilateral Pan", desc: "A soft percussive tap that sweeps left to right, layered over whatever tones are playing." },
  { title: "Masking Bed", desc: "Pink or white noise to soften the tone — useful in shared or open spaces." },
  { title: "Ambient Layer", desc: "Layer in real recordings — waves, birds, and more — underneath the tone work." },
  { title: "Session Length", desc: "Set how long this runs and how it should end — a gentle fade out, or a slow fade up if you're using this to wake." },
  { title: "Check-in", desc: "A quick mood tap before and after each session — this is what builds your progress stats over time." },
];

const STORAGE_KEY = "vibrosomatics_tour_seen";

export function initTour(){
  if(localStorage.getItem(STORAGE_KEY) === "true") return;
  showModal();
}

function showModal(){
  const overlay = document.createElement("div");
  overlay.className = "tour-modal-overlay";
  overlay.innerHTML = `
    <div class="tour-modal">
      <div class="tour-modal-title">How this all works</div>
      <div class="tour-modal-sub">A quick rundown of everything on this page — nothing here is gated, jump around freely.</div>
      <div class="tour-modal-body">
        ${TOUR_ITEMS.map(item => `<div class="tour-modal-item"><b>${item.title}</b><span>${item.desc}</span></div>`).join("")}
      </div>
      <div class="tour-modal-footer">
        <div class="timer-btn tour-modal-ok" id="tourModalOk">Got it</div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    overlay.remove();
  };
  overlay.querySelector("#tourModalOk").addEventListener("click", dismiss);
  overlay.addEventListener("click", (e) => { if(e.target === overlay) dismiss(); });
}
