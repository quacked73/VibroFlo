// Luminous safety gate: shown every single time Luminous Sync is turned on
// (not just once) since flashing-light risk is a per-use concern, not a
// one-time orientation item. Declining leaves the feature off.
//
// Each acknowledgment is timestamped and saved locally (see the note at the
// bottom of the warning itself) — this is deliberately disclosed rather than
// concealed. A record nobody was told about is weaker legal protection than
// one plainly acknowledged: it undermines rather than supports an
// informed-consent position if it's ever actually examined. It's kept out of
// the main flow (not surfaced or pushed at the person afterward), just not
// hidden in the sense of undisclosed.
//
// Worth being honest about a real limit here: this is a local record on the
// person's own device, not a tamper-proof server-side log. It documents that
// the warning was shown and accepted at a given time — it can't prove what
// happened after that.

import { dbPut, makeId } from "./db.js";

export function showLuminousWarning(onConfirm, onDecline){
  const overlay = document.createElement("div");
  overlay.className = "tour-modal-overlay";
  overlay.innerHTML = `
    <div class="tour-modal" style="max-width:420px;">
      <div class="tour-modal-title">Before you turn this on</div>
      <div class="tour-modal-sub" style="color:var(--text); font-weight:600;">
        This sends a signal that can drive flashing lights on connected hardware (like a MindPlace Kasina or similar device).
      </div>
      <div class="tour-modal-sub">
        Flashing light between roughly 10&ndash;25Hz is the range most associated with triggering seizures in people with
        photosensitive epilepsy. <b>Do not use this feature</b> if you or anyone in your family has a history of seizures,
        epilepsy, or light sensitivity, without talking to a doctor first. Stop immediately if you feel unusual — dizzy,
        disoriented, or unwell.
      </div>
      <div class="tour-modal-sub" style="font-size:11px;">
        For safety, your confirmation below is timestamped and saved on this device only — nothing is sent anywhere.
      </div>
      <div class="tour-modal-footer" style="justify-content:space-between;">
        <div class="timer-btn" id="luminousWarnDecline" style="cursor:pointer; background:transparent;">Not now</div>
        <div class="timer-btn tour-modal-ok" id="luminousWarnConfirm">I understand, continue</div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector("#luminousWarnConfirm").addEventListener("click", async () => {
    overlay.remove();
    try{
      await dbPut("luminousAcknowledgments", { id: makeId(), acknowledgedAt: new Date().toISOString() });
    }catch(e){ console.warn("Could not save Luminous acknowledgment:", e); }
    onConfirm();
  });
  overlay.querySelector("#luminousWarnDecline").addEventListener("click", () => {
    overlay.remove();
    if(onDecline) onDecline();
  });
}
