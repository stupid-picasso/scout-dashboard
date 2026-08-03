repo: stupid-picasso/scout-dashboard
branch: main

## Last sync
date: 2026-08-03T11:56:35Z
commit: d629b9849074

### Updated in this project
- Confirmed the repo now carries the corrected file (the earlier `>`→`?` corruption is gone) — a stale message text on device means a cached build, not a bad push.
- Gemini pacing is now self-tuning: the 429 body states the real per-minute quota for the model actually served, so `_geminiRpm` is read from it and `effectiveInterval` paces to that instead of assuming 10 rpm. `gemini-flash-latest` aliases a Gemini 3 model whose free-tier limit can be lower, which guarantees a 429 wall on a long import.
- `_groqFailed` latch now clears in `setGroqKey`, `setGeminiKey` and on every screenshot upload, so a newly saved key is tried immediately instead of after a reload.
- Groq model list replaced with `qwen/qwen3.6-27b` + `qwen/qwen3-vl-32b-instruct`; all four previous vision models are decommissioned. Retired-model errors no longer report as a rejected key.

## Previous sync
date: 2026-08-03T07:27:22Z
commit: b1f5fec9f67c

### Updated in this project
- ⚠ The pushed copy of `Scout Dashboard.dc.html` at b1f5fec is corrupted: three `>` characters became `?` (`r._solvedCount ? 1`, `rev.filter(r =? ...)`), a JS syntax error that stops the logic class parsing — which is why an import read 24 Pokémon with zero solved IVs. Re-upload needed.
- Fixed a duplicate `ivColor` key in the receipt rows (the second silently overrode the solved-IV colouring).
- Ambiguous IV solves now take the median candidate by total IV instead of `cands[0]`; solveIVs returns level-ascending, so the first match was systematically the lowest-level, lowest-IV option.

## Previous sync
date: 2026-08-03T02:49:02Z

### Updated in this project
- Video/paste imports now solve IVs from CP + HP using `mechanics.solveIVs` — the same brute-force solver the screenshot path runs behind SOLVE IV. The detail screen never prints IVs, but base stats + exact CP + exact HP pin the spread down mathematically, so the appraisal screen is no longer required for a usable result.
- Solved level is written to `lvlMin`/`lvlMax`; receipt marks solved spreads (`✓` unique, `≈` ambiguous) and counts them in the header.
- Merge now runs before the receipt is built so it reports solved values, not the model's nulls.

## Previous sync
date: 2026-08-02T18:22:17Z
commit: 38172cdd1dd0

### Updated in this project
- Extracted video frames are now held for 30 minutes (rather than 90 seconds) when an import fails for lack of AI credit — the remedy is "go and get a Gemini key", which takes longer than the old retry window, and re-extracting is minutes of work.
- The no-credit message now states how many frames are being held and points at both remedies (paste a key, or sign in to restore the synced one).

## Sync history

### 2026-08-02T17:15:50Z

### Updated in this project
- Video extraction picks its strategy with a probe seek: files that don't seek reliably (iPhone screen recordings have sparse keyframes) are read by PLAYING the video at 4–8× and capturing frames as they decode, so there is no keyframe hunting and nothing to time out. Removes the need to re-encode before importing.
- Mid-run fallback: six consecutive slow seeks switches to playback, resuming at the stalled timestamp with the remaining frame budget — restarting at 0 re-captured the span seeking had already read (dedupe only compares against the previous kept frame) and could breach the 600-frame cap.
- Individual slow seeks are now skipped rather than fatal; only wholesale seek failure aborts.
- Verified against repo commit 29d777480a82: the string "Video seek timed out" is absent from the pushed source, so that error on-device is a stale cached build (GitHub Pages CDN or the installed PWA), not the repo.

## Sync history

### 2026-08-01T21:57:09Z
commit: b7ec03018f46

### Updated in this project
- `callGemini` now sends a minimal `generationConfig` (just `maxOutputTokens` + `temperature`) on the first attempt; `responseMimeType` and `thinkingConfig` are model-dependent and each can trigger a bare 400 `INVALID_ARGUMENT`, so they only go out on the retry.
- Any 400 now falls through to the next model candidate instead of aborting Gemini, so `2.5-flash` → `2.0-flash` → `1.5-flash` still get a chance after `gemini-flash-latest` (which now aliases a Gemini 3 model) rejects the request.
- Gemini errors are prefixed with a `GEMINI_REQ_VERSION` tag (`[g3]`) so a stale cached build on the phone is identifiable from the error text alone.

## Sync history

### 2026-08-01T20:18:15Z
commit: 3e4163234c63

### Updated in this project
- Added `geminiKey` to `SYNC_KEYS()` so the API key rides the existing Firestore user-doc sync — clearing site data (which wipes localStorage) no longer loses it, and it carries to other signed-in devices.
- `applyRemote()` adopts a remote key only when the local one is empty, so a locally-entered key is never clobbered by a stale one from another device; the adopted key is written back to `scout_gemini_key_v1` and mirrored into `geminiKeyDraft`.

## Sync history

### 2026-08-01T14:44:46Z
commit: 711a5c4c20a4

### Updated in this project
- Gemini vision returned truncated JSON ("Unterminated string"): the 900-token cap plus Flash models spending output budget on thinking. Now requests `responseMimeType: 'application/json'`, raises the floor to 4096 output tokens, and sets `thinkingConfig.thinkingBudget = 0` — with an automatic retry without `thinkingConfig` for older models that reject it.
- `MAX_TOKENS` / empty-candidate / safety-block finish reasons are now reported by name instead of surfacing as a JSON parse error.

## Sync history

### 2026-08-01T14:17:27Z

### Updated in this project
- Added an OpenAI-compatible gateway option (`callOpenAICompatible`) so a self-hosted OmniRoute, OpenRouter, Groq, or any `/v1/chat/completions` endpoint can serve vision requests. Images are sent as `image_url` data URLs; the old proxy branch only spoke Anthropic's format.
- AI ENGINE panel now has a gateway section (base URL, model, optional key), persisted to `scout_custom_base_v1` / `_model_` / `_key_`. Engine order: gateway → Gemini → Puter → on-device OCR.
- Gemini call now tries `gemini-flash-latest` → `2.5-flash` → `2.0-flash` → `1.5-flash` and caches the winner; hardcoding `gemini-2.5-flash` was failing silently.
- Vision failures now surface the real error in the OCR panel instead of a generic "vision unavailable".
- Fuzzy CP match for the stylized badge (`cr100` → 100) on the Tesseract fallback path.

## Sync history

### 2026-08-01T05:45:39Z

### Updated in this project
- Screenshot import now reads via Claude vision first (`readScreenshotWithVision` + `fileToVisionJpeg`), with Tesseract as fallback — Tesseract cannot read Pokémon GO's stylized `CP` badge or type chips.
- Fixed the CP misread: with the badge garbled, the fallback scanned all 3–5 digit numbers and took `148` out of `148,482` stardust. Comma-grouped numbers are now stripped before scanning, so an unreadable badge yields blank instead of a wrong value.
- Fixed "Matched to null in your roster." — the label keyed off `dex`, which dex-lookup sets without a roster match; now keys off `matchedIdx` and names the identified species instead.
- Verified `scout-dashboard-patches.js` in the repo root is dead code carrying a competing `buildPokemonRecord` and the broken `tessedit_char_whitelist` — recommended for deletion.

## Sync history

### 2026-08-01T00:32:05Z

### Updated in this project
- Replaced the video importer's fixed 6-frame sampling with dense sampling (3 fps, 32-frame cap) plus a 16×32 grayscale perceptual dedupe, so a pan across many Pokémon is no longer reduced to 2 readable ones. Measured on a real 12.9s / 1000×2176 recording: 37 distinct frames at 4 fps vs 6 before.
- Replaced the request-payload guard that halved the frame list until it fit (which decimated straight back to ~6 frames) with batching — frames are split into ≤180 KB requests, each parsed independently, and results merged on name+CP with non-null values preferred.
- Frame strip now reports "N DISTINCT FRAMES READ · N BATCHES" instead of a static label.

## Sync history

### 2026-07-31T23:52:32Z

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
