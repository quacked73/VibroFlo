# VibroSomatics — web project

A four-page site: a browsable Home, the full Session console, a Settings page
for your audio library, and an About/Support page — sharing one CSS file and
a handful of small JS modules underneath.

## Pages

```
index.html      Home — hero "Featured This Week" card + browsable rows
                (Session Arcs, Solfeggio Pairings, Ambient Soundscapes,
                For Focus, For Relaxation). Every card links straight into
                Session with that setup pre-selected via a URL param
                (?preset=, ?solfeggio=, ?ambient=).

session.html    The full console — engines, EMDR, ambient player, breath
                pacer, presets, transport. Same engine as before.

settings.html   Audio library management — add/remove your own files;
                bundled samples are listed but can't be deleted here (edit
                the manifest instead).

about.html      Vibroacoustics/entrainment explainer (About tab) + FAQ and
                contact (Support tab).
```

## Shared modules (`src/js/`)

```
constants.js        BANDS, ARCS, BREATH_PATTERNS, SOLFEGGIO_TONES, ENGINE_KEYS
db.js                generic IndexedDB helper
sample-library.js    loads public/audio/samples/manifest.json
ambient-library.js   shared audio-library data layer (session.js + settings.js both use this)
card-art.js          deterministic gradient "cover art" generator for Home's cards
nav.js               renders the shared top nav on every page, highlights current page
session.js           the full engine (ported from the single-file build)
home.js               Home page rendering
settings.js           Settings page (library management)
about.js              About/Support tab switching
```

## Running it locally

```bash
npm install
npm run dev
```

Opens a dev server (usually `http://localhost:5173`). Navigate between pages
using the top nav — Home → Session → Settings → About.

```bash
npm run build
```

Builds all four pages into `dist/` (configured in `vite.config.js` via
`rollupOptions.input`) — that's what you deploy to VibroFlō.com or wrap with
Capacitor for Android/iOS.

## How Home's quick-start links work

Cards on Home don't carry a separate "preset" data structure — they're plain
links with a query param that Session reads on load and applies through the
exact same controls a manual tap would use:

- `/session.html?preset=focus` → clicks the matching Session Arc pill
- `/session.html?solfeggio=528` → applies that Solfeggio pairing
- `/session.html?ambient=<track id>` → pre-selects that ambient track (once
  the library finishes loading — the two coordinate via a small custom event)

## Adding your 20–30 sample MP3s

Same as before: drop files into `public/audio/samples/` matching the names in
`manifest.json`. They'll appear in Session's Ambient dropdown, Settings'
library list, and Home's "Ambient Soundscapes" row automatically — no code
changes needed.

## Storage

Presets and user-uploaded ambient tracks live in IndexedDB (`src/js/db.js`) —
identical behavior across a desktop browser tab, an Android WebView, and an
iOS WebView, so there's a single code path rather than platform branches.

## Wiring this into the Android/iOS build

Build (`npm run build`), then copy the `dist/` output into the Capacitor
project's `www/` folder in place of the old single file, and run
`npx cap copy` to sync it into the native project.
