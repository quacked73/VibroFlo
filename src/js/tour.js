// One-time orientation modal: shown once on a person's very first visit,
// explains what everything is FOR before it explains what each control does,
// then gives a per-section rundown. Dismissed with one "Got it." Nothing is
// gated or hidden — every control is available immediately.

const INTRO = "VibroFlō uses sound and gentle vibration to help shift how you feel — into steadier focus, calmer relaxation, or toward sleep. It works through tones your brain and body respond to, layered with optional rhythm and music. You don't need to understand any of the terms below to use it — pick a mood from Home, or just hit Start here and see how it feels. This rundown is here for whenever you're curious what each part actually does.";

const TOUR_ITEMS = [
  { title: "Presets", desc: "Quick-load a Solfeggio pairing or one of your own saved sessions anytime — no need to rebuild a setup from scratch." },
  { title: "Engines", desc: "Work on Low or High one at a time, or turn on Combine to play both together." },
  { title: "Session Arc", desc: "Gradually shifts you from one state to another over the session — like easing from alert focus into calm — instead of holding one tone the whole way through." },
  { title: "Low Engine", desc: "Low, felt-more-than-heard tones — the kind used with vibroacoustic tables, or just for a deep, physical sense of calm through headphones." },
  { title: "High Engine", desc: "Higher tones in the classic \"binaural beat\" range you may have heard of. Needs headphones to work as intended." },
  { title: "Variability Drift", desc: "Adds a subtle, natural wander to the tone so it doesn't feel robotic or locked rigidly in place." },
  { title: "EMDR Bilateral Pan", desc: "An alternating left-right sound some people use to help process stressful or anxious thoughts, inspired by a talk-therapy technique of the same name. Entirely optional — leave it off if you just want the tones." },
  { title: "Masking Bed", desc: "Soft background noise to cover the tone in shared or open spaces, if you'd rather it not be noticeable to people nearby." },
  { title: "Ambient Layer", desc: "Real recordings — waves, birds, and more — you can layer underneath the tone work, or queue up as its own thing." },
  { title: "Session Length", desc: "Set how long this runs and how it should end — a gentle fade out, or a slow fade up if you're using this to wake." },
  { title: "Check-in", desc: "A quick mood tap before and after each session — builds a simple picture over time of what's actually helping." },
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
      <div class="tour-modal-title">What this is, and how it works</div>
      <div class="tour-modal-sub">${INTRO}</div>
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
