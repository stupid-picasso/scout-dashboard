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
| Frontend | Design Components (`.dc.html`) + Custom React-like runtime |
| PWA | Service Worker, Web App Manifest |
| OCR | Tesseract.js (client-side) |
| Video | FFmpeg (server-side via GitHub Actions) |
| Sync | Firebase Auth + Firestore |
| Storage | localStorage (roster), IndexedDB (future) |

## Quick Start

### Local Development

```bash
# 1. Clone the repo
git clone https://github.com/YOUR_USERNAME/scout-dashboard.git
cd scout-dashboard

# 2. Install Python deps (for video extraction)
pip install -r requirements.txt

# 3. Serve locally (any static server)
python -m http.server 8000
# or
npx serve .

# 4. Open http://localhost:8000
```

### Building index.html

The `index.html` in this repo is a **compiled bundle** produced by the Design Component system. To build it:

```bash
# If you have the DC bundler installed:
# dc-build src/Scout Dashboard.dc.html --out index.html

# Or use your existing workflow from the old repo.
```

**Do not edit `index.html` directly.** All changes should be made in `src/Scout Dashboard.dc.html` and then rebuilt.

### Video → CSV Pipeline (GitHub Actions)

1. Record your Pokémon GO screen (iOS Screen Recording works best)
2. Compress the video (optional but recommended)
3. Upload the MP4 to `videos/` folder and push:
   ```bash
   git add videos/my-recording.mp4
   git commit -m "Add screen recording"
   git push origin main
   ```
4. GitHub Actions automatically:
   - Extracts frames with FFmpeg
   - OCRs each frame with Tesseract
   - Parses fields into `data/pokemon.csv`
   - Commits the CSV back to the repo

### Local Video Extraction

```bash
python pogo_extract.py --video videos/recording.mp4 --out data/pokemon.csv --fps 6
```

## File Structure

```
scout-dashboard/
├── src/                          # Source files (edit these)
│   ├── Scout Dashboard.dc.html   # Main app
│   ├── pokemon-mechanics.js      # CP, IV, PvP calculations
│   ├── support.js                # DC runtime
│   ├── ios-frame.jsx             # iOS device chrome
│   ├── sample-data.js            # Demo data (5 fake Pokémon)
│   └── ...
├── data/                         # CI output (CSV from videos)
├── videos/                       # Upload MP4s here
├── icons/                        # PWA icons
├── .github/workflows/            # CI/CD
├── index.html                    # Compiled PWA entry (build, don't edit)
├── manifest.json                 # PWA manifest
├── sw.js                         # Service worker
├── pogo_extract.py               # Video→CSV extractor
└── requirements.txt              # Python dependencies
```

## Security Notes

- **Never commit `pokemon-data.js` with real scans.** Use `sample-data.js` for demos.
- **Never commit Firebase API keys.** Store them in environment variables or Firebase config panel.
- **Rotate keys immediately** if they were ever in a public repo.

## License

MIT
