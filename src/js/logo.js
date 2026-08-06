// The VibroFlō app mark: a wave-circle icon (line-art, matches the original
// Flō brand treatment) paired with the "VibroFlō" wordmark. This is what
// represents the app everywhere — header, shared nav, favicon.
//
// companyMarkSVG() is a different, separate mark — the V+S double-sine-wave
// design (sound waves between the surfaces of a vibroacoustic table) that
// stands for VibroSomatics, the company. Kept here so it isn't lost, used
// sparingly wherever the company itself is credited, not as the app icon.

let instanceCount = 0;

// The app icon: a circle containing two wave lines — water/sound waves,
// matching Flō's original icon language.
export function appIconSVG(size = 28, color = "#f4f1ff"){
  instanceCount++;
  const clipId = "vfCircleClip" + instanceCount;
  return `
    <svg width="${size}" height="${size}" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="VibroFlō" role="img">
      <circle cx="60" cy="60" r="52" fill="none" stroke="${color}" stroke-width="7"/>
      <clipPath id="${clipId}"><circle cx="60" cy="60" r="52"/></clipPath>
      <g clip-path="url(#${clipId})" stroke="${color}" stroke-width="7" fill="none" stroke-linecap="round">
        <path d="M-10,46 Q5,31 20,46 T50,46 T80,46 T110,46 T140,46"/>
        <path d="M-10,68 Q5,53 20,68 T50,68 T80,68 T110,68 T140,68"/>
      </g>
    </svg>
  `;
}

// Kept for backward compatibility with earlier wiring — same as appIconSVG.
export function logoSVG(size = 28){
  return appIconSVG(size, "#f4f1ff");
}

// The full branded hero treatment — icon + wordmark on the diagonal
// blue-lavender-pink gradient. Meant for a splash moment (top of Home,
// top of About), not for repeated small header use.
export function brandHeroHTML(){
  return `
    <div class="brand-hero">
      ${appIconSVG(46, "#ffffff")}
      <div class="brand-hero-word"><span class="vibro">Vibro</span><span class="flo">Flō</span></div>
    </div>
  `;
}

// The VibroSomatics company mark — two intertwined sine waves between two
// bars (the table's surfaces), reading as a rotated "V" and "S". Separate
// from the app icon; use only where the company itself is being credited.
export function companyMarkSVG(size = 24){
  instanceCount++;
  const gradId = "vsBarGrad" + instanceCount;
  return `
    <svg width="${size}" height="${size}" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="VibroSomatics" role="img">
      <defs>
        <linearGradient id="${gradId}" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#b3a1ff"/>
          <stop offset="1" stop-color="#f2b8d8"/>
        </linearGradient>
      </defs>
      <rect x="8" y="8" width="48" height="6" rx="3" fill="url(#${gradId})"/>
      <rect x="8" y="50" width="48" height="6" rx="3" fill="url(#${gradId})"/>
      <path d="M16,14 C16,24 48,24 48,32 C48,40 16,40 16,50" stroke="#b3a1ff" stroke-width="5" stroke-linecap="round" fill="none"/>
      <path d="M48,14 C48,24 16,24 16,32 C16,40 48,40 48,50" stroke="#f2b8d8" stroke-width="5" stroke-linecap="round" fill="none"/>
    </svg>
  `;
}
