// Pure data — no DOM, no audio context. Safe to import from anywhere.

export const BANDS = {
  delta: { label:"Delta", sub:"0.5–4 Hz · deep rest", min:0.5, max:4,  def:2 },
  theta: { label:"Theta", sub:"4–8 Hz · relaxed",     min:4,   max:8,  def:6 },
  alpha: { label:"Alpha", sub:"8–13 Hz · calm focus",  min:8,   max:13, def:10 },
  beta:  { label:"Beta",  sub:"13–30 Hz · alertness",  min:13,  max:30, def:20 },
  gamma: { label:"Gamma", sub:"30–50 Hz · high engage",min:30,  max:50, def:40 },
};

export const ARCS = {
  focus:    { label:"Focus",     from:"beta",  to:"alpha" },
  winddown: { label:"Wind-down", from:"alpha", to:"theta" },
  deeprest: { label:"Deep Rest", from:"theta", to:"delta" },
  energize: { label:"Energize",  from:"theta", to:"beta"  },
};

export const BREATH_PATTERNS = {
  "simple": [
    { name:"Breathe in",  dur:4, from:0, to:1 },
    { name:"Breathe out", dur:4, from:1, to:0 },
  ],
  "exhale": [
    { name:"Breathe in",  dur:4, from:0, to:1 },
    { name:"Breathe out", dur:6, from:1, to:0 },
  ],
  "478": [
    { name:"Breathe in",  dur:4, from:0, to:1 },
    { name:"Hold",        dur:7, from:1, to:1 },
    { name:"Breathe out", dur:8, from:1, to:0 },
  ],
  "box": [
    { name:"Breathe in",  dur:4, from:0, to:1 },
    { name:"Hold",        dur:4, from:1, to:1 },
    { name:"Breathe out", dur:4, from:1, to:0 },
    { name:"Hold",        dur:4, from:0, to:0 },
  ],
  "coherent": [
    { name:"Breathe in",  dur:5, from:0, to:1 },
    { name:"Breathe out", dur:5, from:1, to:0 },
  ],
};

// The nine commonly-cited Solfeggio tones. Labels are the conventional names
// used in audio/music software for these frequencies — descriptive labels,
// not a therapeutic claim.
export const SOLFEGGIO_TONES = [
  { hz:174, label:"174 Hz — Foundation" },
  { hz:285, label:"285 Hz — Restoration" },
  { hz:396, label:"396 Hz — Liberation" },
  { hz:417, label:"417 Hz — Change" },
  { hz:528, label:"528 Hz — Transformation" },
  { hz:639, label:"639 Hz — Connection" },
  { hz:741, label:"741 Hz — Awakening" },
  { hz:852, label:"852 Hz — Clarity" },
  { hz:963, label:"963 Hz — Unity" },
];

export const ENGINE_KEYS = ["low", "high"];
