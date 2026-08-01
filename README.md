# Scout Dashboard

A Progressive Web App (PWA) for Pokémon GO players to track their collection, calculate IV/PvP rankings, and bulk-import Pokémon data from screenshots or screen recordings using OCR.

## Features

- **Roster Management** — Track all your Pokémon with CP, HP, IVs, moves, and PvP ranks
- **Client-Side OCR** — Import screenshots directly in the browser using Tesseract.js
- **Video Import** — Extract frames from screen recordings and OCR them in-browser
- **Voice Commands** — "Talk to Professor" using Web Speech API
- **Cloud Sync** — Firebase Auth + Firestore sync across devices
- **PvP Analysis** — Great/Ultra/Master league rank calculations
- **Daily Checklist** — Track your daily Pokémon GO tasks
- **Optimize Plan** — Get power-up and evolution recommendations
- **Offline-First** — Service worker caches all assets for offline use

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Design Components (`.dc.html`) + `support.js` runtime |
| PWA | Service Worker (`sw.js`), Web App Manifest |
| OCR | Tesseract.js (client-side, loaded from jsDelivr CDN) |
| Video | FFmpeg + Tesseract (server-side via GitHub Actions) |
| Sync | Firebase Auth + Firestore (compat SDK 10.12.2) |
| Storage | localStorage |

## Quick Start

```bash
git clone https://github.com/stupid-picasso/scout-dashboard.git
cd scout-dashboard

# Serve locally — any static server. Must be HTTP, not file://
python -m http.server 8000
# open http://localhost:8000
```

`index.html` is the PWA entry point. It is a Design Component page: it loads
`support.js`, then mounts `Scout Dashboard.dc.html` via `<dc-import>`. There is
**no build step** — edit the `.dc.html` files directly and reload.

### Data loading order

1. `src/sample-data.js` loads first and sets `window.POKEMON_DATA` (5 demo Pokémon).
2. If `pokemon-data.js` exists (your real scans — gitignored, never committed) it
   overrides the sample data.
3. Once signed in, Firestore roster overrides both.

So a fresh clone always renders with demo data instead of an empty screen.

### Video → CSV pipeline (GitHub Actions)

1. Record your Pokémon GO screen (iOS Screen Recording works best)
2. Upload the MP4 to `videos/` and push:
   ```bash
   git add videos/my-recording.mp4
   git commit -m "Add screen recording"
   git push origin main
   ```
3. `.github/workflows/extract.yml` fires on `videos/*.mp4` / `*.mov` and:
   - Extracts frames with FFmpeg
   - OCRs each frame with Tesseract
   - Parses fields into `data/pokemon_<name>.csv`, merged into `data/pokemon.csv`
   - Commits the CSV back with `[skip ci]`
4. Download `data/pokemon.csv` and load it in the app via **SYNC CSV**.

Can also be triggered manually from the Actions tab (`workflow_dispatch`).

> **Note:** `videos/*.mp4` must stay out of `.gitignore` or the workflow will
> never trigger — git silently drops the file and no push event matches the path.

### Local video extraction

```bash
pip install -r requirements.txt
# Also needs ffmpeg and tesseract on PATH
python pogo_extract.py --video videos/recording.mp4 --out data/pokemon.csv --fps 6
```

## File Structure

```
scout-dashboard/
├── index.html                    # PWA entry — DC page, mounts the dashboard
├── Scout Dashboard.dc.html       # Main app (roster, PvP, OCR import, sync)
├── IV CP HP Guide.dc.html        # Reference card
├── Scout PWA Simulator.dc.html   # Dashboard inside an iPhone frame, for desktop testing
├── support.js                    # Design Component runtime
├── pokemon-mechanics.js          # CP, IV, PvP, stat-product calculations
├── ios-frame.jsx                 # iOS device chrome (used by the simulator)
├── src/
│   └── sample-data.js            # Demo roster fallback (safe to commit)
├── pokemon-data.js               # Your real scans — GITIGNORED, never committed
├── icons/                        # PWA icons (192, 512, maskable, apple-touch)
├── sprites/                      # 1025 Pokémon sprites
├── videos/                       # Upload MP4s here to trigger extraction
├── data/                         # CI output (CSV) — gitignored
├── .github/workflows/extract.yml # Video → CSV automation
├── manifest.json                 # PWA manifest
├── sw.js                         # Service worker (cache scout-v3)
├── pogo_extract.py               # Video → CSV extractor
└── requirements.txt              # pytesseract, Pillow
```

## Firebase

The app ships with the `pokemon-professor` project config baked into
`Scout Dashboard.dc.html` (`initFirebase()`). Sign in with email/password —
the same credentials on every device sync the same roster.

Firestore rules:

```
match /scoutUsers/{uid} {
  allow read, write: if request.auth != null && request.auth.uid == uid;
}
match /gameData/{doc} {
  allow read: if request.auth != null;
  allow write: if request.auth != null &&
    request.auth.token.email in ['abhi.patel@gmail.com','admin@scout.app'];
}
```

## Security Notes

- **Never commit `pokemon-data.js`** — it holds your real scan data. It is gitignored.
- The Firebase web API key is public by design; access is controlled by Firestore
  rules and Auth, not by key secrecy. Still, keep rules tight.

## License

MIT
