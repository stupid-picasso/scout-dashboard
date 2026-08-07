repo: stupid-picasso/scout-dashboard
branch: main

## Last sync
date: 2026-08-06T06:40:00Z

### Updated in this project
- **New appraisal-recording import workflow.** The screen-recording importer now has a DETAIL / APPRAISAL mode toggle. Appraisal mode reads star tier + which stat bars are completely full (via the vision model, not OCR — it judges only "full vs not full", never a partial-bar number), matches each reading to an existing record by name + CP + HP, and passes the appraisal hint to `solveIVs` to pin the exact spread. It never creates new Pokémon.
- Collisions (two records sharing name+CP+HP) are flagged with a one-tap "which one?" picker rather than silently overwriting; unmatched readings and appraisal↔CP/HP contradictions are surfaced in the receipt.
- New logic on the DC: `appraisalPrompt`, `mergeAppraisalImport`, `solveAndApplyAppraisal`, `appraisalHintFromItem`, `effectiveRosterForMatch`, `recordDistinguisher`, `applyAppraisalPick`, `skipAppraisalCollision`. Reuses the existing `filterByAppraisal` hint support in `pokemon-mechanics.js` (no mechanics change).
- Rebuilt `index.html` and `Scout Dashboard.html` from `Scout Dashboard Standalone.dc.html`; canonical source is `Scout Dashboard.dc.html`. Build tag `2026-08-06-appraise`; `sw.js` cache bumped to `scout-v7`.

## Previous sync
date: 2026-08-06T05:15:00Z

### Updated in this project
- **The CP multiplier table was wrong.** The hand-written `CPM` read 0.828917 at level 40 where the real GAME_MASTER value is 0.7903, drifting further the higher the level — so every CP, HP and IV figure the app ever produced was computed from fabricated multipliers. The workflow's first run replaced it with the real table, verified against Bulbapedia anchors at levels 1/5/10/15/20/25/30/35/40.
- pogoapi's cp_multiplier endpoint stops at level 45, and a wholesale replace therefore DELETED levels 45.5–51, leaving maxed Pokémon with no multiplier at all. The generator now measures the table's constant final step (+0.0025 per half level from level 40 up, confirmed from the returned data) and extends to `MAX_LEVEL_SEARCH`, and warns instead of truncating if that step is not constant.
- Stardust tiers now cover levels 41–49 (11000/12000/13000/14000/15000) from the same source — the earlier hand-typed values were wrong and had been removed.
- Re-verified against the 165-record import: all 152 records solve, averaging 22.5 candidate spreads.
- Rebuilt `index.html` and `Scout Dashboard.html`; `Scout Dashboard Standalone.dc.html` regenerated from the live source (it was a stale fork). Build tag `2026-08-06-cpm`.

## Previous sync
date: 2026-08-06T03:05:37Z

### Updated in this project
- Import fix — blank rows: a frame that caught the detail screen mid-scroll produced a same-Pokémon record with no CP badge. The roster match keys on name + CP, so those fragments matched nothing and landed as their own empty rows (5 of 20 in run #15). `coalesceFragments()` now folds each one into the full sighting it came from and discards whatever still has no CP; the receipt reports both counts. On the current 165-record import: 8 folded, 3 dropped.
- Import fix — regional forms: the solver only ever used `BASE_STATS[dex]`, so Galarian Farfetch'd (174/114/141) was solved against Kantonian stats (124/115/141) and matched ZERO spreads. `baseStatCandidates()` now tries every known form for the dex and keeps the first that actually explains the CP and HP; the winning form is recorded on the item and reused for the PvP ranking. This also fixed Hisuian Growlithe and Galarian Mr. Mime in the same import.
- Verified the solver against the full 165-record import: every record now solves except Indeedee, which is absent from `DEX_NAMES` entirely — the weekly updater's new-Pokémon PR path will add it.
- Answered "where do PokeGenie/CalcyIV get their data": Niantic's GAME_MASTER, mirrored raw by `PokeMiners/game_masters` and republished as clean JSON slices by pogoapi.net. The updater now regenerates BOTH mechanics tables from it — `CPM` (from `cp_multiplier.json`) and `_DUST_TIER_START_LEVEL` (from `pokemon_powerup_requirements.json`, deriving tier boundaries from the per-half-level costs rather than assuming 4 half-levels per tier). Both are marked GENERATED BLOCK in `pokemon-mechanics.js`.
- IV solve fix: the manual SOLVE IV path never used the Power Up stardust cost — only the video-import path did. The Appraisal Hint panel now takes the next Power Up cost plus lucky/shadow/purified toggles, shows the level band it implies, and passes it to `solveIVs` as a level filter. A cost that contradicts CP/HP is ignored with an explanation rather than failing the solve.
- `_DUST_TIER_START_LEVEL` verified against Bulbapedia for levels 1–40.5. The level 41+ tiers (12000/15000/19000/22000/25000) were unverifiable and disagree with community totals, so they are removed — a wrong tier filters the solve to the wrong levels and discards the true spread; with them absent a 41+ cost fails the tolerance check and falls back to an unrestricted solve.
- Pulled the full current `main` (tree `448339469ed1`): dashboard, mechanics, PWA shell, sample data and diagnostic-log module all refreshed from the repo.
- New weekly data pipeline imported: `scripts/update_pokemon_data.py` + `.github/workflows/update-pokemon-data.yml` refresh base stats from pogoapi.net every Monday 09:00 UTC — plain stat corrections auto-commit to `main`, brand-new dex numbers (name + stats + fetched sprite) go out as a review PR instead.
- New `data/pokemon_import.json` (77 KB roster import payload) and `logs/import-log-2026-08-04T18-10-11-253Z.json`.
- New repo-bootstrap helpers: `setup.sh` and `test_ocr.py`.

## Previous sync
date: 2026-08-03T23:46:53.709Z

### Updated in this project
- Engine order is now strict: Gemini is drained completely before Groq is ever called. A per-minute 429 is waited out (up to 40 rounds per batch, keys cycled); Groq is reached only when `msUntilKeyFree() <= 0`.
- `geminiOnly` replaced by `groqFallback` (default true, `scout_groq_fallback_v1`). Settings → AI ENGINE toggle reads FALLBACK ON / FALLBACK OFF.
- `waitForKeyCooldown()` no longer short-circuits when a Groq key exists.
- 1-frame `groqOnly` batch sizing applies only after Gemini is truly out for the day.

## Sync history

### 2026-08-03T20:27:53Z
- Gemini-only mode added; a Gemini 429 treated as a WAIT rather than a failure (key cycling + cooldown sleep).

### 2026-08-03T13:05:00Z
- Per-engine batch sizing (3 frames Gemini / 1 frame Groq); 413 "tokens per minute" batches re-read one frame at a time; new `src/scout-log.js` on-device diagnostic log exported from Settings.

### 2026-08-03T11:56:35Z
commit: d629b9849074
- Gemini pacing self-tunes from the 429 body; `_groqFailed` latch clears on key save; Groq model list replaced with the qwen3 vision models.

### 2026-08-03T07:27:22Z
commit: b1f5fec9f67c
- Fixed corrupted `>`→`?` characters in the pushed dashboard; ambiguous IV solves take the median candidate.

### 2026-08-03T02:49:02Z
- Video/paste imports solve IVs from CP + HP via `mechanics.solveIVs`; receipt marks solved spreads.

### 2026-08-02T18:22:17Z
commit: 38172cdd1dd0
- Extracted video frames held 30 minutes on credit failure; clearer no-credit message.

### 2026-08-02T17:15:50Z
- Video extraction probes seek reliability and falls back to playback capture at 4–8×.

### 2026-08-01T21:57:09Z
commit: b7ec03018f46
- Minimal `generationConfig` on first Gemini attempt; 400s fall through to the next model candidate.

### 2026-08-01T20:18:15Z
commit: 3e4163234c63
- `geminiKey` added to `SYNC_KEYS()` so it rides the Firestore user-doc sync.

### 2026-08-01T14:44:46Z
commit: 711a5c4c20a4
- JSON response mime type, 4096 output-token floor, `thinkingBudget = 0`; finish reasons reported by name.

### 2026-08-01T14:17:27Z
- OpenAI-compatible gateway option added to AI ENGINE; Gemini model cascade; real vision errors surfaced.

### 2026-08-01T05:45:39Z
- Screenshot import reads via vision first with Tesseract fallback; CP misread and roster-match label fixed.

### 2026-08-01T00:32:05Z
- Dense video sampling (3 fps, 32-frame cap) with perceptual dedupe; request batching replaces frame decimation.

### 2026-07-31T23:52:32Z
- `index.html` rewritten as a real DC page; `sw.js` hardened; PWA icons generated; README rewritten for the flat layout.

## Screen map
| Screen / file | Built from |
| --- | --- |
| `index.html` (PWA entry) | `index.html`, `support.js`, `src/sample-data.js` |
| Scout Dashboard | `Scout Dashboard.dc.html`, `pokemon-mechanics.js` |
| IV / CP / HP reference | `IV CP HP Guide.dc.html` |
| Desktop device preview | `Scout PWA Simulator.dc.html`, `ios-frame.jsx` |
| Diagnostic log | `src/scout-log.js`, `logs/` |
| Roster import payload | `data/pokemon_import.json` |
| Weekly base-stat + mechanics-table refresh | `scripts/update_pokemon_data.py`, `.github/workflows/update-pokemon-data.yml` |
| Video → CSV pipeline | `.github/workflows/extract.yml`, `pogo_extract.py`, `requirements.txt` |
| Offline shell | `sw.js`, `manifest.json`, `icons/` |
