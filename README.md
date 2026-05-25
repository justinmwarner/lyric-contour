# Lyric Contour

A singer's view of the shape of a song. Paste an UltraStar `.txt` or AllKaraoke JSON
and see each phrase rendered as a pitch contour with the syllables sitting on the curve.

## Stack
- Vite + React 18
- Plain CSS, `localStorage` for the song library
- pnpm

## Develop
```
pnpm install
pnpm dev
```

## Build
```
pnpm build
pnpm preview
```

## Layout
- `src/main.jsx` — entry point
- `src/components/LyricContour.jsx` — top-level UI, library + editor state
- `src/components/Phrase.jsx` — one SVG phrase row
- `src/lib/parser.js` — UltraStar / AllKaraoke JSON parsing
- `src/lib/smoothPath.js` — Catmull-Rom-ish cubic Bézier path
- `src/lib/storage.js` — `localStorage` wrapper for the song library
- `src/sample.js` — Twinkle Twinkle sample
- `src/styles.css` — extracted styles
