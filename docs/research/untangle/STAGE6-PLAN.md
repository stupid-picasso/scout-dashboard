# Stage 6 plan: import and AI client (for owner approval; nothing changed yet)

Base: main 7a0f5f6. Sources: dc-3.md (P15-P27, F3, F4, T1), dc-4.md (N8, N10, H15, redesign D), python-pipeline.md (G, reader contract), `data/schema/reader_fields.json` (divergences recorded in stage 5).
Risk: high. This is the live Gemini path and the import path (largest code path). Rule for every step below: behaviour-preserving unless listed under "Behaviour changes", each as its own PR, CI green on both browsers before merge, manager re-verifies.

## What is wrong today
1. `callGeminiWithKey` (~190 lines) does request build, model rotation, cooling, thinking-ladder retries, search fallback, JSON retry, timeout, quota parsing and error classification at once. A timeout is a fake HTTP status 599. Errors are classified by regex over message text.
2. Three AI jobs (TM recs, candy decisions, evolution data) and chat each re-implement signature + busy guard + prompt + parse + catch. Two parse with a greedy regex.
3. The detail field list is written three times (video prompt, paste prompt, appraisal prompt) and already differs (`type` vs `type1/type2`, `powerUpDust` vs `powerUpStardust`, `shiny`, `sizeClass`, `purified`).
4. `runVideoPipeline` (~250 lines) mixes prompt choice, batching, retry, merge, validation and receipt building.
5. Known bugs: `extractFrames` seek loop never records frame positions (scroll stitching only works in the playback fallback); import receipt cannot see solved or recovered CPs.
6. Tests GEM-01, GEM-02, GEMPARK-01 reach into private fields via the React fiber, so any refactor breaks them although behaviour is unchanged.

## Steps (each its own PR, in this order)
**6.0 Characterization first (tests only, no app change).**
- Rewrite GEM-01/02/GEMPARK-01 against an injected `fetch` stub at route level in `qa_lib.js` (assert only which model URLs were requested and in what order), so they survive 6a.
- Add stub-based tests for each error outcome: daily quota, per-minute rate limit, hung request, rejected key, model gone, malformed JSON, truncated output. These record TODAY'S user-visible message for each.
- Record (golden) the import receipt and the roster produced from the existing fixtures for video, paste, screenshot, appraisal. No real Gemini calls anywhere (free tier only; stubs).
**6a Gemini client (F4).** Typed outcomes `ok | rateLimited | hung | rejectedKey | modelGone | other` replace regexes and status 599; one model list source (drop the second fallback list); one cooldown table; named timeout constants; delete dead branches. Same URLs, same order, same user-facing text (6.0 goldens prove it).
**6b AI job runner (dc-4 D).** `runAiJob({key, signature, build, parse, apply})` with the busy guard, signature de-dupe, one `extractJsonArray` (replaces the greedy regex), typed error to message mapping. Convert TM recs, candy decisions, evolution data, then chat. Fix the literal `\n` / `—` prompt escapes in the same pass only if stage 0 did not already (check first).
**6c Import stages, extract-only (F3).** Split into `readFrames`, `askModel`, `normalizeReads`, `reconcile`, `solve`, `commit` with typed hand-offs; one field-alias table. No output change (goldens from 6.0 must stay byte-identical).
**6d Behaviour changes (need reproduction first, each its own PR, owner sees before/after):**
- video seek positions: reproduce on a real recording, then record positions so stitching works in the seek path;
- receipt sees solved and recovered CPs.
**6e Reader contract alignment (owner decision needed, see below).** One field list shared by the three prompts, generated from `reader_fields.json`; prompt text changes alter model output, so this goes last and is compared on saved real recordings (owner provides) before shipping.

## Decisions I need from you
1. Dust field name: keep `powerUpStardust` (app prompts) or `powerUpDust` (extractor)? Default: app name wins, extractor renamed, app keeps reading both.
2. 6d: OK to change behaviour (stitching, receipt) in separate PRs after I reproduce them? Default: yes, each shown to you first.
3. 6e: do you have 2-3 recordings I can compare before/after? Without them I stop after 6d.
4. Is `saveTeam` "Great team" for Little/Master teams to be fixed (still open from stage 3)?

## Not in this stage
Per-screen view models, keep reasons as objects, CSS roles, account lifecycle, sheet mechanism (stage 7, own plans). Confidence-definition change and bar-reader merge (python G, needs real-frame fixtures first).

## Safety
Gemini free tier only; no real API in tests; no secrets in repo; no real Firebase or Cloudflare. If a golden changes, the step stops and I report it instead of editing the golden.
