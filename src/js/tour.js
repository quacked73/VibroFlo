// First-run guided tour: on someone's very first visit, each section (except
// Breath Pacer, which is always visible) is introduced one at a time with a
// short "what/why" and a Continue button. Once you've clicked through every
// section once, the tour never appears again — everything just stays
// unlocked from then on. This is deliberately NOT a gate that reappears or
// blocks interaction on return visits; it's a one-time orientation only.

const TOUR_STEPS = [
  { id: "tour-presets", title: "Presets", desc: "Quick-load a Solfeggio pairing or one of your saved combinations here anytime — no need to rebuild a setup from scratch." },
  { id: "tour-engines", title: "Engines", desc: "Work on Low or High one at a time, or turn on Combine to play both together." },
  { id: "tour-arc", title: "Session Arc", desc: "Lets the session glide from one band to another automatically over time, instead of holding one frequency the whole way through." },
  { id: "lowPanel", title: "Low Engine", desc: "20–120Hz — felt as much as heard. This is what drives a vibroacoustic table." },
  { id: "highPanel", title: "High Engine", desc: "100Hz–1kHz — the classic binaural tone range. Needs headphones to work as intended." },
  { id: "tour-drift", title: "Variability Drift", desc: "Adds a natural wander to the beat frequency so it doesn't feel locked rigidly in place." },
  { id: "tour-emdr", title: "EMDR Bilateral Pan", desc: "A soft percussive tap that sweeps left to right, layered over whatever tones are playing." },
  { id: "tour-masking", title: "Masking Bed", desc: "Pink or white noise to soften the tone — useful in shared or open spaces." },
  { id: "tour-ambient", title: "Ambient Layer", desc: "Layer in real recordings — waves, birds, and more — underneath the tone work." },
  { id: "tour-transport", title: "Session Length", desc: "Set how long this runs and how it should end — a gentle fade out, or a slow fade up if you're using this to wake." },
  { id: "tour-checkin", title: "Check-in", desc: "A quick mood tap before and after each session — this is what builds your progress stats over time." },
];

const STORAGE_KEY = "vibrosomatics_tour_step"; // a number as a string, or "done"

export function initTour(){
  if(localStorage.getItem(STORAGE_KEY) === "done") return; // fully unlocked already, nothing to do

  const saved = localStorage.getItem(STORAGE_KEY);
  const step = saved ? parseInt(saved, 10) : 0;
  renderStep(step);
}

function renderStep(step){
  TOUR_STEPS.forEach((s, i) => {
    const el = document.getElementById(s.id);
    if(!el) return;
    if(i < step){
      el.classList.remove("tour-hidden");
      removeIntro(el);
    } else if(i === step){
      el.classList.remove("tour-hidden");
      showIntro(el, s, () => advance(step));
    } else {
      el.classList.add("tour-hidden");
    }
  });
}

function showIntro(el, stepData, onContinue){
  removeIntro(el); // avoid duplicates if this section re-renders
  const intro = document.createElement("div");
  intro.className = "callout tour-intro";
  intro.innerHTML = `<b>${stepData.title}</b><br>${stepData.desc}<br><br>`;
  const btn = document.createElement("span");
  btn.className = "timer-btn tour-continue-btn";
  btn.textContent = "Got it — continue";
  btn.style.cursor = "pointer";
  btn.addEventListener("click", onContinue);
  intro.appendChild(btn);
  el.prepend(intro);
}

function removeIntro(el){
  const existing = el.querySelector(".tour-intro");
  if(existing) existing.remove();
}

function advance(prevStep){
  const next = prevStep + 1;
  if(next >= TOUR_STEPS.length){
    localStorage.setItem(STORAGE_KEY, "done");
    TOUR_STEPS.forEach(s => {
      const el = document.getElementById(s.id);
      if(el){ el.classList.remove("tour-hidden"); removeIntro(el); }
    });
  } else {
    localStorage.setItem(STORAGE_KEY, String(next));
    renderStep(next);
  }
}
