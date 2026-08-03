// Generates a deterministic soft gradient "cover art" background for a card,
// seeded from its id/name so the same item always looks the same. Keeps
// everything within the app's existing purple/lavender/rose palette rather
// than pulling in photography we don't have rights to use.

const HUES = [
  ["#4a3a7a", "#7d5fb8"], // deep violet → lavender
  ["#3a2a5e", "#b3a1ff"], // dark violet → lavender accent
  ["#5b2a54", "#f2b8d8"], // plum → rose
  ["#2a3a5e", "#9fd8ff"], // indigo → soft cyan
  ["#4a2a3a", "#ffd59e"], // wine → warm gold
  ["#2a4a4a", "#a1e8d8"], // deep teal → soft mint
];

function hashString(str){
  let h = 0;
  for(let i=0;i<str.length;i++){
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function gradientFor(seed){
  const h = hashString(String(seed));
  const [c1, c2] = HUES[h % HUES.length];
  const angle = 30 + (h % 6) * 25;
  return `linear-gradient(${angle}deg, ${c1} 0%, ${c2} 100%)`;
}
