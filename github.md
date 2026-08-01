repo: stupid-picasso/scout-dashboard
branch: main

## Last sync
date: 2026-07-31T23:52:32Z

### Updated in this project
- Rewrote `index.html` as a real DC page (`support.js` + `<dc-import name="Scout Dashboard">`) — the old fetch-and-mount bootstrap probed `window.DC.mount` / `window.mountDC` / `window.compileTemplate`, none of which exist, so it dumped raw template source instead of rendering.
- Removed `videos/*.mp4` and `videos/*.mov` from `.gitignore` — they silently blocked every video push, so the `extract.yml` path trigger never fired.
- Hardened `sw.js` (cache `scout-v3`): per-asset `cache.add()` instead of `addAll`, so a missing icon no longer aborts service-worker install. Also bypasses jsDelivr.
- Generated the manifest's missing icons (`icon-192.png`, `icon-512.png`, `icon-maskable.png`) from the 512×512 `apple-touch-icon.png`.
- Copied `src/sample-data.js` in as the demo-roster fallback, loaded from `index.html`'s helmet before the dashboard mounts.
- Rewrote `README.md` to match the real flat repo layout (DC files at root, not `src/`) and documented the data-loading order and the gitignore/workflow trap.

## Screen map
| Screen / file | Built from |
| --- | --- |
| `index.html` (PWA entry) | `index.html`, `support.js`, `src/sample-data.js` |
| Scout Dashboard | `Scout Dashboard.dc.html`, `pokemon-mechanics.js`, `pokemon-data.js` (gitignored) |
| IV / CP / HP reference | `IV CP HP Guide.dc.html` |
| Desktop device preview | `Scout PWA Simulator.dc.html`, `ios-frame.jsx` |
| Video → CSV pipeline | `.github/workflows/extract.yml`, `pogo_extract.py`, `requirements.txt` |
| Offline shell | `sw.js`, `manifest.json`, `icons/` |
