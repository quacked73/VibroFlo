// Cross-tab "stop everything" signaling. Separate browser tabs are
// separate JavaScript environments that can't normally reach into each
// other — BroadcastChannel is the real, standard browser API built
// specifically for same-site, cross-tab messaging like this. Same-origin
// only, nothing leaves the browser.

const CHANNEL_NAME = "vibroflo-luminous-control";
let channel = null;

function getChannel(){
  if(!channel && "BroadcastChannel" in window){
    channel = new BroadcastChannel(CHANNEL_NAME);
  }
  return channel;
}

// Tells every other open tab of this site to stop whatever's running.
export function broadcastStopAll(){
  const ch = getChannel();
  if(ch) ch.postMessage({ type: "stop-all" });
}

// Registers a callback for when another tab broadcasts a stop. Safe to
// call even if BroadcastChannel isn't supported — it just never fires.
export function onBroadcastStopAll(callback){
  const ch = getChannel();
  if(!ch) return;
  ch.addEventListener("message", (e) => {
    if(e.data?.type === "stop-all") callback();
  });
}
