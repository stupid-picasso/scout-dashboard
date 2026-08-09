repo: stupid-picasso/scout-dashboard
branch: main

## Last sync
date: 2026-08-09T00:00:00Z

### Updated in this project
- **Move database + real DPS ranking.** The app read move NAMES off the detail screen but had no damage numbers, so the attacker board could only rank on raw stats. New on-demand AI lookup collects every distinct move name on the roster, fetches raid stats (type/power/energy/duration) in batches of 40, and stores them in `moveDB` — localStorage, `SYNC_KEYS` and the cloud blob. It is manual and one-time on purpose: move stats change only when Niantic rebalances. The prompt instructs the model to OMIT moves it is not confident about rather than guess, so coverage legitimately stops short of 100%, and a record missing any of kind/power/energy/duration is rejected rather than stored half-filled. `CLEAR ROSTER` no longer wipes it — it is game reference data, not roster data.
- **`pokemon-mechanics.js` gained the damage layer:** GO's own type chart (1.6 / 0.625 / 0.390625, not the main-series numbers), `STAB_MULTIPLIER`, `typeMultiplier`, `moveDamage` (Niantic's formula) and `cycleDps` — one full fast-move/charge-move cycle at level 50, best of the two charge moves, STAB applied, against a constant reference defence that cancels out of the ordering. Returns null rather than a number when either move is missing, which is the signal to fall back to the stat score. The type chart is unused so far; it is what a raid-counters feature would need.
- **Eight roster features.** New ATTACKERS tab (best 4 per type, labelled DPS / DPS + stats / stats only per type so the basis is never implied); power-up cost panel in the detail sheet (stardust/candy/XL to the Great cap, Ultra cap, L40 and L50, with lucky/shadow/purified multipliers and an affordability check against logged inventory); dominated-duplicates list on Recommendations (same species+form, every IV equal or lower, no higher level, not lucky/shadow/favorited — safe to act on without weighing anything); DATA CONFIDENCE panel on Collection Intel (measured vs solver-guessed, with a jump to the roster filtered to those needing appraisal, plus lucky/shadow/purified/favorite/hundo/nundo counts); WHAT CHANGED receipt after each import listing the CP/HP/IV values it overwrote; roster filter chips; type-aware search; and sorts by best league rank and by IV floor (ascending — a low floor is the prize under a CP cap).
- **Full power-up cost curve** added to `pokemon-mechanics.js` as a GENERATED BLOCK, run-length encoded from pogoapi's `pokemon_powerup_requirements` — the same source `_DUST_TIER_START_LEVEL` comes from. Levels 40+ bill XL Candy, kept as its own column rather than converted.
- **`pogo_extract.py`: a read timeout was killing whole runs.** A `requests.ReadTimeout` on batch 10 of 74 escaped uncaught and took the process down, discarding the nine batches already read. `call_gemini` now wraps both POSTs and converts any transport failure into `GeminiError(transient=True)`, which flows into the existing rotate-and-retry path; transient failures cool that model/key pair for 15s only (not the 60s/daily treatment a 429 gets) so the rotation moves on rather than hammering the endpoint that just timed out. Added a last-resort per-batch `except Exception` — nothing should reach it, but a single bad batch must never cost 70 good ones. `REQUEST_TIMEOUT_S` 90 → 180; ten tone-mapped 1080px frames plausibly exceeded the old ceiling.
- Mirrored into `Scout Dashboard Standalone.dc.html`, rebuilt `index.html` + `Scout Dashboard.html`, `sw.js` cache `scout-v22`.
- **Open, not yet fixed:** scene-detect returned 0 frames at threshold 0.3 and fell back to 8fps sampling — 1500 frames, only 526 after dedup, 74 batches, draining both keys' daily quota. The dedup is the weak link (a strong reduction is expected on mostly-static footage); tone-mapped HDR frames differ slightly frame to frame even on a static screen. Candidate fixes: loosen the dedup threshold, lower fallback fps to 3–4, or drop scene-threshold to 0.1.

## Previous sync
date: 2026-08-08T15:10:00Z

### Updated in this project
- **iPhone PWA motion + touch layer.** `viewport-fit=cover` was missing from the viewport meta, so every `env(safe-area-inset-*)` in the app resolved to 0 — with `apple-mobile-web-app-status-bar-style: black-translucent` that put content under the notch. Fixed, and the detail sheet now pads for the home indicator. Added the touch behaviours a home-screen app needs and a browser normally hides: no tap-highlight flash, no long-press callout or text selection on chrome, `touch-action: manipulation` (removes the 300ms tap delay), press-down feedback on cards/tabs/import buttons, momentum + contained scrolling on the tab strip and detail sheet, and no page rubber-band. On phone widths the detail sheet now rises from the bottom edge with square bottom corners on an iOS spring curve, instead of fading in centred.
- Existing motion (stagger-in, shimmer skeletons, sheet rise, reduced-motion guard) was already in place and kept; this pass added the touch/press layer around it.

## Previous sync
date: 2026-08-08T14:30:00Z

### Updated in this project
- **Screenshot appraisal import.** New IMPORT APPRAISAL button runs the same bar measurement in the browser, at the image's full resolution (the vision-model copy is downscaled, which is fine for reading digits and fatal for measuring a bar edge). Matches on name+CP+HP like the server path and never creates Pokemon.
- **Two colour bugs found by testing against a real screenshot.** The warm test required `r >= g >= b`, true of the gold fill in a tone-mapped video frame (120,107,78) but false of the red Attack bar (232,171,178) where blue sits above green - so red and pink bars were rejected outright and a screenshot of them measured nothing at all. Now measured against the lower of green and blue. Separately, the trainer avatar's face sits level with the Attack bar, so that row's last warm run landed far to the right, the bar overshot its own reconstructed width and was discarded; rows are now trimmed at the first jump wider than a segment gap. Both fixes applied to `pogo_extract.py` as well, where the video path had been avoiding them by luck.
- **Scale.** 211 Pokemon imported from the collection recording; 159 appraisal readings, all with exact measured IVs. Identification batching holds (142 batched calls for 1013 frames).
- Conflicting duplicate sightings are arbitrated client-side: the server emits every measured spread as `ivCandidateSets`, and `applyMeasuredIv` pins whichever reproduces the recorded CP and HP, falling back to the picker only when more than one fits.

## Previous sync
date: 2026-08-08T13:45:00Z

### Updated in this project
- **Measured IVs now reach the roster cards.** Four separate bugs sat between a correct measurement and a correct card, each masking the next: (1) `Scout Dashboard Standalone.dc.html` — the only file the phone runs — was missing `applyMeasuredIv`, `measuredSpreadOrder` and the `ivSource === 'bar-measure'` branch, so the import JSON was read and the measured spread discarded in favour of the CP/HP solver; (2) `ivOverrides` were applied to `roster` but `addedPokemon` was spread in raw, so Pokemon created by the video import could be written to and never read back; (3) the cloud listener replaced `ivOverrides` wholesale, letting a snapshot written before the import undo it — now merged, with a measured entry outranking an unmeasured remote one; (4) the post-import `pushCloud()` ran on the line after `setState`, uploading pre-import state and pulling it straight back — now fired from the setState callback. Verified: Absol 14/15/15 · 98%, all 50 rows measured.
- **Card spreads carry a ✓ when the value came from a bar measurement** rather than the CP/HP solver, so a failed pin is visible on the phone instead of inferred from the numbers.
- **CP and HP cannot validate an IV read.** Absol at CP 1438 / HP 106 has 11 legal spreads, including both the correct 14/15/15 and the wrong 14/10/13 the solver defaults to. Only the bar measurement separates them — which is why a measured spread must be pinned, never re-derived.

## Previous sync
date: 2026-08-08T13:05:00Z

### Updated in this project
- **The measured IVs were correct for two runs before this; the app was throwing them away.** `Scout Dashboard Standalone.dc.html` — the file `index.html` is bundled from, and the only one the phone runs — had `normalizeAppraisalItems` but was missing `applyMeasuredIv`, `measuredSpreadOrder` and the `ivSource === 'bar-measure'` branch. It read the import JSON, dropped the measured spread, and fell back to the CP/HP solver, which for Absol at CP 1438 / HP 106 has 11 legal spreads and simply picks the median: 14/15/15 came back out as 12/12/13. Every review row saying "no stars · no full bars" was the giveaway — the hint path running with no hint. The three methods were ported verbatim from the maintained `Scout Dashboard.dc.html`, `index.html` was rebuilt, and `sw.js` moved to `scout-v10` so the PWA picks the new bundle up. Result: 50 read, 50 pinned, all `· measured`.
- **Fixed the low-IV read at source.** `measure_appraisal_bars_warm` had a span filter (`> W*0.08`) that discarded any bar shorter than about 3.4/15; with the real bars gone the trio search matched the Pokemon sprite and the animating UI instead and reported confident nonsense — which is why high-IV Pokemon read correctly for weeks while low ones did not. Aron went from a reported 15/3/3 to a measured 2/7/1 (one frame reads 2.000/7.000/1.000). Bands are now clustered by left edge before any structure search, width comes from segment geometry alone (the old `max(observed fill)` floor turned the longest visible bar into a false 15/15 reference), and the drift ceiling tightened 0.45 → 0.35.
- **Duplicate sightings resolve by drift.** Where two frames of one individual disagree, the lower-drift frame wins when it is near-exact and clearly better; otherwise both spreads are carried as candidates and flagged `ivConflict` for the client picker, with the frames written to `data/debug_bars/`.
- **Identification batched 81 calls → ~11.** Name/CP/HP was one Gemini request per sighting carrying a single image, which burned the per-minute cap in seconds and then the daily one. Frames now go up 8 at a time and come back indexed, with per-frame fallback for any batch that fails or returns the wrong count.
- Verified against the 51-Pokemon recording: Absol 14/15/15 (matches known truth), Aron 2/7/1, Charmander 14/15/15, Cleffa 14/15/14, Chimecho 7/0/11, Cranidos 6/10/0.

## Previous sync
date: 2026-08-08T03:41:06Z

### Updated in this project
- **The appraisal recording is HDR, and that was the whole bug.** The video is tagged `bt2020nc / smpte2084 / bt2020`; ffmpeg was decoding PQ code values straight to PNG, so every frame arrived crushed into 0-137 — white card at 129, gold bar fill at (120,107,78). Both bar readers threshold on ratios of a 255 white point with the 255 baked in, so the fill missed `mx > 120` by one count and `chroma > 45` by three. Months of threshold tuning were aimed at a signal that had already been destroyed upstream. `extract_frames` now probes the colour transfer with ffprobe and runs a zscale/tonemap HDR→BT.709 chain when the source is PQ or HLG, falling back cleanly if libzimg is absent, and `_warn_if_crushed` reports peak luminance so this is visible immediately rather than surfacing as a threshold failure. Peak went 137 → 255; measurement went 0/20 frames → 36/36.
- **New primary reader `measure_appraisal_bars_warm`.** Finds bars by fill WARMTH (r − b) instead of luminance darkness — the fill is barely darker than its card but strongly warmer, and darkness-thresholding locked onto the team-leader avatar sharing the row. All thresholds now scale by `_frame_white_point`, so one set of constants fits a clean screenshot and a crushed frame. Bar width comes from segment geometry (3 segments + 2 gaps) with the widest observed fill as a floor.
- **Fixed a 2.5× width error in the structural reader.** `_bar_groups` accepted 2-run groups and treated each run as one segment; when encoding blurred a segment gap away, `seg_w` doubled and a true 15 read as 6. Scale is now taken only from rows showing all three segments, and a fill extending past the reconstructed width rejects the frame instead of returning a confident wrong answer.
- **Duplicate sightings no longer resolve silently.** `_resolve_duplicate_sightings` collapses agreeing repeats but merges disagreeing ones into a single entry carrying every measured value as a candidate, flagged `ivConflict` for the client picker, with the conflicting frames written to `data/debug_bars/`.
- Verified end-to-end on the reference recording, reproduced identically at fps 6 and fps 8: Absol 14/15/15 (matches known truth), Aipom 13/11/6, Arbok 10/9/9, Arcanine 10/14/13, Abra 4/11/5 and 8/12/13. Every raw value within 0.18 of an integer.
- `.github/workflows/extract-iv.yml` now commits `data/debug_bars/` alongside the import JSON.

## Previous sync
date: 2026-08-07T00:00:00Z

### Updated in this project
- **Tesseract removed everywhere.** Gone from the app: the `tesseract.js` CDN `<script>` in the helmet, `loadTesseract`, `runOCR`, `findPokemonName` and the whole `parsePokemonText` regex layer (fuzzy CP badge matching, stardust-leak guards, XL-candy heuristics). Screenshot import is now vision-only — a failed read surfaces as an error instead of quietly writing a misread record. Gone from Python: `pytesseract` import, `ocr_image()`, the requirement, and the `tesseract-ocr` apt step in both workflows. `--image` now goes through the same Gemini reader as `--video` and writes JSON (the 61-column CSV row mapper cannot represent that schema).
- **Groq removed as second engine.** `callGroq`, `GROQ_MODELS`, `setGroqKey`, the `_groqFailed` latch, the Settings FALLBACK · GROQ panel, the key in `SYNC_KEYS`/localStorage/Firestore sync, the usage row and the `· GROQ` badge. `completeWithRetry` is now gateway (if configured) → Gemini, and a rejected Gemini key is terminal since nothing sits behind it. `waitForKeyCooldown` no longer short-circuits on a Groq key.
- **Ensemble bar measurement.** `measure_appraisal_bars()` fuses three independent reads per bar — whole-bar fill fraction, per-segment fill referenced to the segment's own boundaries, and a median across up to 5 rows from the band's middle 60%. Agreement means certainty; disagreement emits ranked per-stat alternates. `applyMeasuredIv` now uses CP/HP as an *arbiter* over those alternates rather than a pure veto, labelling corrected reads "measured (CP/HP-corrected)". Verified on both test screenshots: Ho-Oh 15/15/12, Absol 14/15/15, methods agreeing to 3 decimals.
- Rebuilt `index.html` + `Scout Dashboard.html` from `Scout Dashboard Standalone.dc.html`; canonical source `Scout Dashboard.dc.html`. Build tag `2026-08-07-gemini-only`; `sw.js` cache `scout-v9`.

## Previous sync
date: 2026-08-06T07:30:00Z

### Updated in this project
- **Removed the in-app appraisal video reader** (the DETAIL/APPRAISAL toggle) — it failed on Gemini rate limits in the field ("No batch reached the AI"). Replaced with a second server-side step: **SERVER-SIDE IV IMPORT → IMPORT IV FROM SERVER**. It fetches `data/appraisal_import.json`, matches each reading to an existing record by name + CP + HP, and pins the exact IV via `mergeAppraisalImport`. Collisions get a one-tap picker; unmatched/contradiction readings are surfaced. New client methods: `importIvFromServer`, `normalizeAppraisalItems` (tolerant of `maxed[]` or per-bar booleans). The solver side (`mergeAppraisalImport`, `solveAndApplyAppraisal`, `filterByAppraisal`) was kept from the previous session and now feeds from JSON instead of the in-app vision pipeline.
- **`pogo_extract.py` gained an `--appraisal` mode.** Reuses the existing Gemini batching/model-rotation infra (parameterized `run_gemini_video_ocr(prompt, merge_key)`), reads star tier + full bars only (new `APPRAISAL_PROMPT`, never a partial-bar number), merges by name+CP+HP, and writes `data/appraisal_import.json`.
- **New workflow `.github/workflows/extract-iv.yml` ("Extract IV Ratings").** Mirrors `extract.yml` but calls `--appraisal`; triggers on `appraisal_videos/*` pushes or a Drive-link `workflow_dispatch`, and auto-commits `data/appraisal_import.json`. Uses the same `GEMINI_API_KEY_ONE/TWO` secrets.
- Rebuilt `index.html` + `Scout Dashboard.html` from `Scout Dashboard Standalone.dc.html`; canonical source `Scout Dashboard.dc.html`. Build tag `2026-08-06-ivserver`; `sw.js` cache `scout-v8`.

## Previous sync
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

- Any app change must go into `Scout Dashboard Standalone.dc.html` and be re-bundled to `index.html`, with `sw.js`'s cache name bumped — editing `Scout Dashboard.dc.html` alone does nothing on the phone. Keep both files in step; they drifted once and cost a full debugging session.

## Screen map
| Screen / file | Built from |
| --- | --- |
| `index.html` (PWA entry) | `index.html`, `support.js`, `src/sample-data.js` |
| Scout Dashboard | `Scout Dashboard.dc.html`, `pokemon-mechanics.js` |
| Attackers / DPS ranking + move database | `Scout Dashboard.dc.html` (`fetchMoveData`, `bestDpsFor`, `attackerBoard`), `pokemon-mechanics.js` (`cycleDps`, `moveDamage`, `TYPE_CHART`) |
| Power-up cost planning | `pokemon-mechanics.js` (`_POWERUP_RUNS`, `powerUpCostBetween`, `maxLevelUnderCap`), `Scout Dashboard.dc.html` (`powerUpPlan`) |
| IV / CP / HP reference | `IV CP HP Guide.dc.html` |
| Desktop device preview | `Scout PWA Simulator.dc.html`, `ios-frame.jsx` |
| Diagnostic log | `src/scout-log.js`, `logs/` |
| Roster import payload | `data/pokemon_import.json` |
| Weekly base-stat + mechanics-table refresh | `scripts/update_pokemon_data.py`, `.github/workflows/update-pokemon-data.yml` |
| Video → CSV pipeline | `.github/workflows/extract.yml`, `pogo_extract.py`, `requirements.txt` |
| Appraisal video → measured IVs | `.github/workflows/extract-iv.yml`, `pogo_extract.py`, `data/appraisal_import.json`, `data/debug_bars/` |
| IV import into the roster (phone) | `Scout Dashboard Standalone.dc.html` → bundled to `index.html`; `sw.js` cache name must be bumped per deploy |
| Offline shell | `sw.js`, `manifest.json`, `icons/` |
