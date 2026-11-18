# Survey: python-pipeline

Area: `pogo_extract.py` (3081 lines), `gemini_pool.py` (only where pogo_extract depends on it), `scripts/update_*.py`, `scripts/import_*.py`, `scripts/benchmark_models.py`, `scripts/record_tier_trends.py`, `scripts/verify_feed_official.py`, `.github/workflows/*.yml`, data file shapes in `data/`, and the link to the import code in `Scout Dashboard.dc.html` (app). Read-only survey at commit d697877. Personal data files were read for field names only.

## 1. Problems list

H = hidden link, N = needless link, S = surplus.

### Pogo_extract output <-> app import code (hidden links)

- H1. Prompt/schema copies. The reader schema is written out five times: `pogo_extract.py:1153` (VIDEO_IMPORT_PROMPT), `:1245-1256` (frame prompt derived from it with `.replace`), app `Scout Dashboard.dc.html:12355` (runVideoPipeline), `:12731` (importPromptText), `:10332` (screenshot reader), plus `:13703` appraisalPrompt vs `pogo_extract.py:1258` APPRAISAL_PROMPT. They already diverge: the app asks `powerUpStardust`, `shiny`, `shinyIcon`; Python asks `powerUpDust` and has no `shiny`/`shinyIcon`. Yet `_FLAG_KEYS` (`pogo_extract.py:996`) lists `"shiny"` as if it were in the schema.
- H2. Field alias bridge lives only in the app: `:13274` and `:13399` map `powerUpDust` <-> `powerUpStardust`; nothing in Python or a test says that. `scripts/test_postprocess.py:153` uses `powerUpDust`, `scripts/qa/qa_e2e_b.js:1637` uses `powerUpStardust`; no test crosses the two.
- H3. Dead alias layer in the app: `normalizePastedItems` (`:12651-12662`) and `normalizeAppraisalItems` (`:13100-13150`) accept `type_1/type_2`, `xl_candy`, `fast_move`, `charged_move_1`, `attack_iv`, `appraisal_attack_bar`, `pokemon_name`, `is_perfect`... These are the old 61-column CSV names (`CSV_FIELDS`, `pogo_extract.py:21`). Python stopped emitting them (comment `pogo_extract.py:3055-3060`). Nothing ties the two lists, so neither can be deleted safely.
- H4. Identity key (name + CP + HP). `pogo_extract.py:2590` `_video_merge_key`, `:2596` `_appraisal_merge_key` (byte-identical), `main()` `:2951` `key_of_appraisal` and `:3023` `key_of` (same lowercase name, cp, hp), app `mergeAppraisalImport` `:14068-14080` (cp+hp+dex-or-name), `coalesceFragments` `:13221` (name + hp), Python `absorb_cpless` `:951` (name + hp). Comment says "the same triple the client matches on". Five copies of one rule, three of them with a different treatment of null CP (`"?"` in the merge keys, `None` in `main`'s keys, so two covered-CP Pokemon with equal HP collapse in `main` but not in the key).
- H5. Post-processing duplicated across languages: Python `absorb_cpless` (`:951`) + `drop_sparse` (`:981`) vs app `coalesceFragments` (`:13221`) + `importCheck` gate (`:13257`, `:13408`). Same intent (fold CP-less fragments, drop unusable reads), different thresholds (Python keeps rows with candy or two+ identity fields; app discards no-CP rows unless `cpCovered`). A change to one silently changes what the other sees.
- H6. Confidence/drift thresholds scattered: Python `:1416` (0.25), `:1418` (0.45), `:1530` (0.2), `:1782` and `:1990` (`"high" if drift < 0.2`), `:2309` (0.10 and 0.08 in `_resolve_duplicate_sightings`); app `:12887` and `:12994` (reject at 0.35), `:13030` (`barConfidence = drift < 0.2`). Python's `barConfidence` is never read by the app (only copied through at `:13150`).
- H7. Emitted-but-never-read fields: `ivConflict` (`pogo_extract.py:2338`), `barRaw`, `barSegmentRaw`, `barMethod` (`:2165-2168`), `_framePath`. The app has zero references. Worse, the Python log says a conflict is "flagged for manual pick, not pinned" (`:2328`) but the app pins any `ivSource === 'bar-measure'` item via `applyMeasuredIv` (`:13093`) and arbitrates with CP/HP using `ivCandidateSets` (`measuredSpreadOrder`, `:13960`). The conflict flag (22 of 111 records in the committed `data/appraisal_import.json` carry it, by field count only) changes nothing in the app.
- H8. Scaffolding leak: `i` (batch position, `APPRAISAL_ID_BATCH_PROMPT` `:1552`) is not stripped in `run_appraisal_pipeline` (`:2158` `it = dict(got[0])`); it is present on 109 of 111 records in `data/appraisal_import.json`.
- H9. Bar-measuring algorithm exists in two languages: Python `measure_appraisal_bars` (`:1328`), `_structural` (`:1660`), `_warm` (`:1854`), `_any` (`:1998`); app `measureAppraisalBarsTrack` (`:12787`), `measureAppraisalBarsWarm` (`:12899`). The app comment at `:13264` region says "same algorithm as the server-side reader". Three Python readers + a fallback chain, no appraisal fixture, no test beyond "returns one result per frame" on blank images (`scripts/test_extract_pipeline.py:206`).
- H10. Output file names/URLs: `data/pokemon_import.json` and `data/appraisal_import.json` are written by `main()` (`:2931`, `:3008`), deleted by `extract.yml`/`extract-iv.yml` ("Reset import file"), fetched by the app at `:12703` and `:13160` via a hard-coded raw.githubusercontent URL, and exempted in `.gitignore`. Four places, no test.
- H11. Run mode switching by prompt identity: `run_gemini_video_ocr` decides `frame_mode`/`video_mode` with `prompt is VIDEO_FRAME_PROMPT` (`:2685-2686`) and the second-opinion tier with `prompt is VIDEO_IMPORT_PROMPT` (`:2790`). `main()` uses the frame prompt by default (`:2996`), so the verify pass (`:2790-2830`, about 40 lines plus `gemini_pool.suspicion`/`pick_replacement`) never runs unless `PER_FRAME=0` is set; no workflow sets it.

### Dead code and duplicated tables in pogo_extract (surplus)

- S1. Tesseract-era text parser chain is unreachable from `main()`: `parse_pokemon_text` (`:784`), `extract_moves` (`:636`), `preprocess_image` (`:614`), `crop_card_region` (`:624`), `record_to_csv_row` (`:1084`), `deduplicate_records` (`:1070`), `CSV_FIELDS` (`:21`), `REGEX_PATTERNS` (`:42`), `FAST_MOVES` (`:71`), `CHARGED_MOVES` (`:88`), `MOVE_TYPES` (`:125`), `LEGENDARY_DEX`/`MYTHICAL_DEX` (`:358-365`), unused imports `csv`, `shutil` (`:9`), `ImageEnhance` (`:15`). About 270 lines plus ~160 lines of tables. `NAME_TO_DEX` (`:195`, ~160 lines, Gen 1-5 only) is kept alive only by `find_pokemon_name` (`:840`) and `_all_species_names` (`:865`), which then re-reads `pokemon-mechanics.js` for the real list (`:865-880`); the module comment admits the Gen 5 table is wrong.
- S2. `GEMINI_MODELS` (`:1151`) has no user (comment says "for the appraisal paths and the benchmark"; neither uses it).
- S3. `_video_merge_key` == `_appraisal_merge_key` (`:2590`, `:2596`).
- S4. Unused constants: `BATCH_PACE_S` (`:1296`), `GEMINI_MODELS`; benchmark `MODEL_RE` (`scripts/benchmark_models.py:19`) still lists the 2.5 generation that pogo_extract comment `:1140` says is dropped.
- S5. `main()` has three near-identical sections: the appraisal merge (`:2940-2970`) and video merge (`:3012-3045`) are the same "load existing, key, replace-or-append, write" loop with a different key function name; the `--image` branch (`:3055-3075`) is a third writer.
- S6. `test_ocr.py` (repo root) tests a pasted copy of the regex table, not `pogo_extract.py`, and is not in CI.
- S7. Stray tracked files: `data/.a`, `logs/a` (1-byte), `data/compare/run42_pokemon_import.json` and `run42b_pokemon_import.json` (not referenced by any script, test or doc), `logs/import-log-2026-08-04T18-10-11-253Z.json`.

### Needless links

- N1. `run_gemini_video_ocr` (`:2674-2900`, 230 lines) does eleven jobs and takes `merge`, `shared`, `strict` flags that only the appraisal-identification caller (`_identify_frames` `:2181`) understands. It also owns gender detection, mega-dot detection, debug dumps and the verify tier. Appraisal and detail-screen imports differ only in prompt, merge key and post-processing, but are fused through a parameter list.
- N2. Module-level mutable state used as a cache across calls: `_SHARED_POOL`/`_SHARED_LOCK` (`:2605`), `_THINK_RUNG` (`:2458`), `_STATS_CACHE` (`:390`), `_DEBUG_DIR_READY` (`:2251`), `_NAME_LOWER` (`:861`, populated with a `global`). Tests reach in and clear them (`scripts/test_extract_pipeline.py:130`, `:192`).
- N3. Import-time script coupling: `scripts/import_evolution_branches.py:18` imports `ITEM_LABELS`, `pretty_name` from `import_evolution_data.py`, a one-shot printer script; `import_movepool_data.py:50` and `import_purify_data.py:61` instead copy `NAME_OVERRIDES`/`pretty_name` with the comment "kept in sync deliberately rather than imported".
- N4. `benchmark_models.py` imports `pogo_extract` for `discover_models`, `extract_frames`, `get_gemini_keys`, `GeminiError`, `VIDEO_IMPORT_PROMPT` (`:18`, `:64`); the benchmark therefore measures the non-default prompt, not the one production uses (`VIDEO_FRAME_PROMPT`).
- N5. `record_tier_trends.py:70` shells out to `git show HEAD:pokemon-mechanics.js` to get the "old" tiers, so it only works inside a checkout and only when run before any commit.

### Data-update chain (hidden links)

- H12. Generated-block insertion order is an implicit call order. When a block is missing each script inserts after another script's end marker: SIZE_DATA after MEGA_LEVEL_DATA (`import_size_data.py:75`), SPECIES_CLASS after SIZE_DATA (`import_species_class.py:41`), EVOLUTION_BRANCHES after SPECIES_CLASS (`import_evolution_branches.py:75`), TIER_TRENDS after EVOLUTION_BRANCHES (`record_tier_trends.py:65`, with `assert ... "run import_evolution_branches.py first"`), SPECIES_FAMILY after SPECIES_GM (`import_mega_levels.py:131`), PVP_TIER before `function pvpTierFor(` (`import_pvp_tier_data.py:180`). `update-pvpoke-data.yml` runs `record_tier_trends` before `import_evolution_branches`, which only works because the blocks already exist.
- H13. The "replace block between markers" routine exists nine times: `import_species_class.py:37`, `import_size_data.py:71`, `import_evolution_branches.py:71`, `import_mega_levels.py:121-132`, `import_pvp_tier_data.py:173`, `import_pvpoke_gamemaster.py:142`, `record_tier_trends.py:62`, plus `update_pokemon_data.py:194` `replace_block` (different marker style: first `const CPM = {` to `\n};`). Marker text `// GENERATED BLOCK: X (script) - do not hand-edit` is also a format convention that nothing validates.
- H14. The GAME_MASTER URL is a literal in ten scripts (`grep latest/latest.json`: evolution_branches, evolution_data, mega_data, mega_levels, move_data, movepool_data, purify_data, size_data, species_class, update_events_gbl); the weekly workflow downloads the full file four times (mega_levels, size_data, species_class, evolution_branches) plus once per six hours for events. Fetch helpers: `fetch_gamemaster` x4, `get`/`fetch`/`get_text`/`fetch_json`/`fetch_bytes` x7, with five different `User-Agent` values or none and four different timeouts (30/60/120/180, none on `import_evolution_data.py:105`, `import_mega_data.py:51`, `import_purify_data.py:57`, `import_movepool_data.py:79`).
- H15. Five legacy generators print JS to stdout for a human to paste into `pokemon-mechanics.js`: `import_move_data.py:168-185` ("Paste its contents ... and add AUTHORITATIVE_MOVES to the export list"), `import_mega_data.py`, `import_evolution_data.py`, `import_movepool_data.py`, `import_purify_data.py`. They feed `AUTHORITATIVE_MOVES`, `MEGA_EVOLUTION_COSTS` (`pokemon-mechanics.js:4710`), `REAL_EVOLUTION_TABLE` (`:4147`), `MOVEPOOL_TABLE` (`:2618`), `PURIFY_COST_TABLE` (`:1586`). No workflow, no test, no marker: those tables go stale and nothing says so. `MEGA_EVOLUTION_COSTS` and `MEGA_LEVEL_DATA` (generated by `import_mega_levels.py`) now hold the same facts from two sources.
- H16. Tier thresholds `S>=90, A>=75, B>=55` and "keep matchups when score >= 55" live in `import_pvp_tier_data.py:80-84, :112`; the app's grading reads `tier` only (`pokemon-mechanics.js:5303-5320`). `CUP_FILES` (`import_pvp_tier_data.py:62-70`) names cups (`laic2027`, `willpower`, ...) by hand, and `update_events_gbl.py:178` `pvpoke_table(name, cp, mega)` guesses which one a weekly league name maps to; a new cup needs both edited.
- H17. `update-pokemon-data.yml:43` commits `pokemon-mechanics.js` straight to main without running `build_bundles.py`; `update-pvpoke-data.yml` does run it (`--bump`). The next push then fails `test_bundles_current.py` (the commit is `[skip ci]`, so main is red only later). Same gap for the PR path at `:71`.
- H18. `.gitignore` ignores `data/*.json` and allow-lists five files. Workflows `git add` files that are ignored and untracked: `benchmark-models.yml:77` (`data/benchmark_models.json`) and `update-pokemon-data.yml:71` (`data/new_pokemon.json`); `git check-ignore` confirms both are ignored. `git add` exits non-zero on an ignored path, so the benchmark commit step and the new-Pokemon PR step fail (the PR step after it has already created the branch).
- H19. `stat_fixes` workflow output (`update_pokemon_data.py:327`) is `stat_fixes + mech_table_fixes`, so a CPM-table refresh is reported as "base-stat corrections" in the commit message and gates the auto-commit.
- H20. Feed shape (`data/feed.json`: `events[]`, `gbl[].leagues[].cup{types,allow,ban,caught,level,src,caughtWindowUnknown}`, `pvpoke`, `rules`) is produced by `update_events_gbl.py:204-285` and consumed by the app at `:9382`, `:17760`, `:18004`; fixtures `scripts/fixtures/ui_feed.json`, `push_feed.json` are separate hand copies; `worker/` also reads it. Shape change = four places, no schema.
- H21. The app fetches `data/feed.json` in two places (`:9382` and `:17760`), each with its own URL list.
- H22. Secret naming: workflows map `secrets.GEMINI_API_KEY_ONE/TWO` to env `GEMINI_API_KEY_1/2` in four workflows; `pogo_extract.get_gemini_keys` (`:2364`) also accepts `GEMINI_API_KEY`. Repeated mapping, nothing checks them together.

### Workflow duplication and push strategies

- H23. `extract.yml` (191 lines) and `extract-iv.yml` (190 lines) differ only in folder name, flag (`--video`/`--appraisal`), output file, and artifact path (diff is ~40 lines). `extract-auto.yml` repeats the extraction invocation a third time. Fixing the Drive download or the push logic needs two or three edits.
- H24. Seven different "commit and push generated data" loops: `extract.yml:170` (reset to origin/main and re-copy), `extract-iv.yml:164` (same, single file), `extract-auto.yml:81-82` (`git pull --rebase -X theirs`, loop ends silently after five failures, exit 0), `update-events-gbl.yml:49-50` (single `pull --rebase`, no retry), `update-pokemon-data.yml:49-54` (fetch + rebase, which can conflict on `pokemon-mechanics.js`), `benchmark-models.yml:81-82` (`pull --rebase || true`, silent), `update-pvpoke-data.yml` (PR branch, `--force`). `extract.yml:4` comment says concurrent pushes "caused an unresolvable rebase conflict" and fixes it in two files only. Concurrency groups are also not uniform (`pogo-data-commit`, `update-events-gbl`, `update-pvpoke-data`, none for update-pokemon-data although it also writes `pokemon-mechanics.js` that `update-pvpoke-data` rewrites).
- H25. The test command list is typed in `test.yml:30-60`, `update-pvpoke-data.yml` ("accuracy tests" loop), the manager-plan standing rules and `PROJECT_HANDOFF.md`. Nothing checks that a new `scripts/test_*` file is in any of them (today every file is listed: verified by script).
- H26. `extract-auto.yml` does not reset the import file between sessions, while `pogo_extract.py:2936-2939` and `:3009-3011` assume "the workflow deletes this file before the first video of a fresh session", so the auto workflow accumulates across six-hourly runs by design the Python comment does not know about.

### Special cases / needless links elsewhere in the area

See section 2 for the full special-case list.

## 2. Special cases

Each is code that exists for one situation instead of following from the design.

Swallowed exceptions (`except` that continues silently or with a print):
- `pogo_extract.py:447` (sharpness failure keeps first frame), `:514` (peak luma returns None), `:505` (ffprobe failure assumes SDR), `:669-670` and `:718-720` (cv2 missing returns `[]`/None: the mega-dot and gender hints silently vanish; `requirements.txt` installs opencv, tests do not require it), `:1344`, `:1676`, `:1866` (each bar reader returns None on any error), `:2073` and `:2083-2086` (diagnostics and parallel measuring fall back), `:2198`, `:2219` (a failed identification becomes None and the group is "skipped"), `:2267` (debug dir cleanup), `:2332`, `:2543`, `:2558` (`discover_models`/`probe_dead_models` treat a network error as "no information"), `:2665` (any preflight exception counts the lane as usable), `:2729`, `:2739` (mega-dot / gender failures), `:2830`, `:2839` (diagnostics dumps), `:2948`, `:3020` (unreadable existing import file treated as empty, so a corrupt file is silently overwritten).
- `scripts/update_pokemon_data.py:102` (`_max_level_search` returns 51.0), `:243`, `:255` (CPM/dust refresh failure keeps old table, printed as WARNING, exit 0), `:307` (sprite fetch failure).
- `scripts/update_events_gbl.py:228` (formats unavailable), `:234` (game master unavailable: leagues are emitted without cups), `:283` (unreadable old file treated as changed).
- `scripts/update_event_moves.py:119` (page failure keeps previous rows), `scripts/update_promo_codes.py:122-128` (Pocket Gamer failure reuses old rows), `scripts/verify_feed_official.py:66`, `:89` (`sys.exit(0)` "never break the workflow"), `scripts/import_pvp_tier_data.py:146` (a missing cup file is skipped).
- Workflows: `update-events-gbl.yml:34,37,40` (`continue-on-error` on three data steps), `qa.yml:48,56` (WebKit timing and axe report-only), `extract-auto.yml` (`gdown ... || true`; push loop that can end without success), `benchmark-models.yml:82`, `update-pokemon-data.yml:80` (`|| echo "PR may already exist"` hides every `gh pr create` failure).

Ifs for one value / one caller:
- `pogo_extract.py:2790` second-opinion tier only for `VIDEO_IMPORT_PROMPT`; `:2685-2686` mode by prompt identity; `:2709` workers `4 if frame_mode else 2`; `:3004` (`out_path.endswith(".csv")` redirect to `pokemon_import.json`); `:3068` (`.csv` -> `.json` rewrite for `--image`); `:2996` `PER_FRAME == "0"`; `:2649` `PREFLIGHT == "0"`; `:2225` `ID_WORKERS`; `:2709` `GEMINI_WORKERS`; `:2086` `len(frames) > 40` before parallel measuring.
- `import_evolution_data.py` branch special-case `if pokemon_id in ("POLIWHIRL", "SLOWPOKE")` (item branch preferred); `NAME_OVERRIDES` (18 entries) duplicated in three scripts.
- `import_size_data.py:25` `FORMS = {"alola","galarian","hisuian","paldea"}` (other regional forms silently dropped by `key_for` returning None); `import_species_class.py:34` `len(out) < 100` guard; `import_mega_levels.py` `n < 3` skip and `if n == 4` Super Max special case; `record_tier_trends.py` `< 100` guard.
- `update_events_gbl.py:30-35` `league_cp` returns 1500 for any unknown cup name; `:44-50` `len(t) > 8` and `f.get('cup') not in ('mega',)` title match; `:15` `KEEP_TYPES`; `:204` slices `[:8]`, `[:6]`.
- Thresholds that are magic numbers: `pogo_extract.py:418` `threshold=4.0`, `:455` `ratio=2.5, lookback=2, min_frames=4`, `:1290-1296` batch/budget constants, `:1312-1315` bar geometry fractions, `:1508` `METHOD_AGREE_TOL`, `:2787-2797` `score >= 3`, `min(16, 6*lanes)`.

Retries and sleeps:
- `update-pvpoke-data.yml` `retry()` with `sleep $((attempt*20))` per import (the upstream "times out now and then"); five push-retry loops listed in H24; `pogo_extract.py:2495-2500` thinking-ladder retry on HTTP 400 (`_THINK_RUNG`); `gemini_pool.run_batches` retry/`sleep` (`gemini_pool.py:170`, `max_attempts=len(lanes)*6` at `pogo_extract.py:2769`); `benchmark_models.py:86` `time.sleep(gap)`.

Disabled / report-only tests:
- `qa.yml:44-48` PERF-01 on WebKit excluded from the gate via `QA_SKIP` and run separately with `continue-on-error` and `TODO task #31`; `qa.yml:54-56` axe checks `continue-on-error`. (Owned by QA area; listed because workflows are in scope.)

## 3. Redesign (decision log)

Ordered by leverage (problems solved).

- **A. One "reader contract" for the extractor, written once and used by both languages.** Create `data/schema/reader_fields.json` (or `scripts/reader_schema.json`) listing each field, type, the aliases the app accepts, and which prompt (detail, appraisal) it belongs to. Python builds `VIDEO_IMPORT_PROMPT`'s schema line and `_FLAG_KEYS`/`_SCALAR_KEYS`/`_IDENTITY_FIELDS` from it; a node/python test asserts the app prompt strings (`:12355`, `:12731`, `:10332`) contain exactly the same field names, and that every field Python can emit is read by the app or is on an explicit "diagnostic only" list. Delete the snake_case alias layer once the schema says Python never emits it.
  - H1 five prompt copies diverge (`powerUpDust`/`powerUpStardust`, `shiny`)
  - H2 alias bridge only in app (`:13274`, `:13399`)
  - H3 dead snake_case aliases (`:12651-12662`, `:13100-13150`)
  - H7 `ivConflict`, `barRaw`, `barSegmentRaw`, `barMethod`, `_framePath` emitted, never read
  - H8 `i` scaffolding leaks into `appraisal_import.json`
  - H10 file names and URLs in four places
  - H20 feed shape in four places (same mechanism: schema file plus a test; do feed as a second step)
  - H21 two feed fetch sites in the app
- **B. Delete the dead Tesseract-era chain and the one-copy duplicates in `pogo_extract.py`.** Remove `parse_pokemon_text`, `extract_moves`, `preprocess_image`, `crop_card_region`, `record_to_csv_row`, `deduplicate_records`, `CSV_FIELDS`, `REGEX_PATTERNS`, move/type tables, `LEGENDARY_DEX`/`MYTHICAL_DEX`, `GEMINI_MODELS`, `BATCH_PACE_S`, unused imports; make `find_pokemon_name`/`_all_species_names` read `DEX_NAMES` from `pokemon-mechanics.js` only and drop `NAME_TO_DEX`; collapse `_video_merge_key`/`_appraisal_merge_key`/`key_of`/`key_of_appraisal` into one `identity_key(item)`; delete `test_ocr.py`.
  - S1, S2, S3, S4, S6
  - H4 (the four Python copies of the key; the app's copies stay and the schema test from A pins the rule)
  - the `NAME_TO_DEX` Gen-5 comment at `:866` (the "table is wrong" admission goes away)
- **C. Split `run_gemini_video_ocr` and `main()` along the real seams: read (frames -> raw items), clean (per-prompt post-processing), write (merge into an import file).** `read_frames(frames, prompt, ...)` returns raw items and is the only code that talks to the pool; `postprocess_detail(items)` and `postprocess_appraisal(items)` are plain functions; `merge_into_file(path, items, key)` replaces the two copies in `main()` and the `--image` writer. The mode is an explicit argument (`kind="detail"|"frame"|"appraisal-id"`), not `prompt is X`; the verify tier is either wired to the default path or deleted (decision needed: it has not run in production by default).
  - H11 mode by prompt identity; verify tier dead by default
  - N1 `merge`/`shared`/`strict` params for one caller
  - S5 three writers in `main()`
  - N2 module-global caches become fields of a small `Session` object that tests construct (no `px._SHARED_POOL.clear()`)
  - Special cases `:2709` `4 if frame_mode else 2`, `:3004`, `:3068`, `:2996`
- **D. One shared module for the data scripts: `scripts/gm_lib.py`.** Provides `fetch_json(url, timeout, retries)` (one User-Agent, one retry policy, replaces the workflow `retry()` shell function), `game_master()` (downloads once per process, honours a local path argument and an env cache path so the weekly run downloads one time), `replace_block(src, name, body, after=None)` and `read_block`, `pretty_name`/`NAME_OVERRIDES`. Declare block order once as a list (`BLOCK_ORDER = ["SPECIES_GM", "SPECIES_FAMILY", "MEGA_LEVEL_DATA", "SIZE_DATA", ...]`) so each script inserts after its predecessor from the list instead of naming another script's marker, and a test asserts every block in `pokemon-mechanics.js` is on the list in that order.
  - H12 insertion order is an implicit call order
  - H13 replace-block routine x9
  - H14 GAME_MASTER literal x10, downloaded 4x per weekly run, five fetch helpers, inconsistent timeouts
  - N3 `import_evolution_branches` importing a printer script; copied `NAME_OVERRIDES`
  - N5 `record_tier_trends` shelling out to git (pass the previous source in by file path; workflow already has the checkout)
  - Special cases: swallowed exceptions in the import scripts become one policy ("keep old data, exit 0 with a warning annotation" or "fail") chosen per data source in one place
- **E. Turn the five paste-by-hand generators into marker blocks written by the same machinery, or delete them.** Decide per table: `MEGA_EVOLUTION_COSTS` is superseded by `MEGA_LEVEL_DATA` (delete `import_mega_data.py` after checking `megaEvolveCostFor` readers); `REAL_EVOLUTION_TABLE`, `MOVEPOOL_TABLE`, `PURIFY_COST_TABLE`, `AUTHORITATIVE_MOVES` get `GENERATED BLOCK` markers and join the weekly workflow, or are marked "frozen, last generated <date>" in the file.
  - H15 five stdout-paste generators, stale tables, two mega-cost sources
  - the "Paste its contents..." instruction at `import_move_data.py:182`
- **F. One reusable workflow for "extract a recording and commit the result", and one push helper.** `.github/workflows/extract.yml` takes `mode: detail|appraisal` (or a composite action `.github/actions/commit-data`) with the reset-and-reapply push logic that already exists; `extract-auto` calls it per new file; `update-events-gbl`, `benchmark-models`, `update-pokemon-data` use the same helper; every data-writing workflow shares the `pogo-data-commit` concurrency group. Add `python3 scripts/build_bundles.py --bump` to `update-pokemon-data.yml` (or have it open a PR like pvpoke does). Fix `.gitignore` or `git add -f` for `benchmark_models.json` and `new_pokemon.json`.
  - H23, H24 (seven push loops, silent failures), H26
  - H17 auto-commit without a bundle rebuild
  - H18 `git add` of ignored files (two failing steps)
  - Special cases `|| true` (gdown, `pull --rebase`), `|| echo "PR may already exist"`
  - H25 (derive the CI test list from a single `scripts/run_tests.sh` or `tests.json` that `test.yml` and `update-pvpoke-data.yml` both call; add a check that every `scripts/test_*` is in it)
  - H22 secret mapping stated once in the reusable workflow
- **G. Define confidence once, in Python, and let the app consume it.** Constants `DRIFT_CLEAN = 0.2`, `DRIFT_REJECT = 0.35` in the schema file from A (or in a tiny shared JSON read by both); the app stops recomputing `barConfidence` (`:13030`) and the Python `ivConflict`/`barConfidence` either drive an app behaviour (show the picker when `ivConflict`) or are removed. Reduce the three Python bar readers to the ones a fixture proves are needed: add two real appraisal frames (screenshot and tone-mapped video frame, cropped to the bars, no personal data) as fixtures, record which reader wins on each, then delete the readers that never win. Keep the JS `Track` and `Warm` readers aligned with the survivors, tested on the same fixtures through the existing node harness.
  - H6 thresholds scattered
  - H7 conflict flag contradicts app behaviour (the log text at `pogo_extract.py:2328` is wrong today)
  - H9 bar algorithm duplicated and untested
  - H16 (tier thresholds move into the same shared constants file)
- **H. Cleanup that needs no design.** Delete tracked strays (`data/.a`, `logs/a`, `data/compare/*`); rename `stat_fixes` output to `data_fixes` and count the two kinds separately (H19); `datetime.utcnow()` -> timezone-aware in the four update scripts; switch `benchmark_models.py` to the production prompt and drop `MODEL_RE`'s 2.5 entry (N4).
  - S7, H19, N4, S4

## 4. Comments to remove

Candidates only; keep any comment that explains an outside fact (Gemini quota behaviour, Niantic/PvPoke formats, HDR/PQ values).

- `pogo_extract.py:4-5` module docstring "CRITICAL FIX: Word boundaries..." and `:41` "# CRITICAL FIX: Single backslash..." (history of a fix in dead code; goes with S1).
- `pogo_extract.py:~1283-1289` (the paragraph above `MAX_FRAMES_PER_BATCH`: history of the old 180000 budget, restates the constants).
- `pogo_extract.py:~2097-2113` (inside `run_appraisal_pipeline`: "Calibration is done... The 0.25 threshold fired on healthy runs..." history; the code is `if not hits:`). Also the duplicated `if not hits:` pair there.
- `pogo_extract.py:2186-2188` docstring sentence "because the old one-after-another loop made the IV import spend most of its 40+ minutes waiting" (history).
- `pogo_extract.py:~2928-2935` and `:~3000-3011` comments narrating what the merge loop does line by line (the reset-before-first-video fact is outside the code and must stay once, in the shared writer).
- `pogo_extract.py:2596-2599` `_appraisal_merge_key` comment repeats the one above it; goes with S3.
- `pogo_extract.py:1136-1150` comment block about the 2.5 models: keep the 404 fact, drop "GEMINI_MODELS is kept as the union..." (false today).
- `pogo_extract.py:~3052-3060` ("--image goes through the same Gemini reader as --video. It used to run Tesseract...") history; the `--image` writes JSON-only fact is in the next code lines.
- `scripts/test_extract_pipeline.py:106` "# frames: 45 tiny images -> 5 batches of 10 ... -> 5 batches" restates `range(45)` and the constant.
- `scripts/benchmark_models.py` docstring lines restating the argparse help.
- Do NOT remove: the `// GENERATED BLOCK ... do not hand-edit` markers (scripts regex on them), `pogo_extract.py:862` `_POSITIVE_FLAGS` rationale, HDR explanation in `extract_frames`, the "Meltan -> Metang" explanation at `:866` (until NAME_TO_DEX is deleted), `test_workflows.py` selftest strings, anything the `scripts/test_*` or `build_bundles.py` greps.

## 5. Tests to remove or fix

No test guarding a UIQ-*, PWA-*, SEC, CSP or SRI rule is proposed for removal. `scripts/test_workflows.py` (permissions, untrusted `${{ }}` in `run:`, suite-d gating) is a security/design guard and stays.

Remove:
- `test_ocr.py` (repo root, not in CI): tests a pasted copy of the regex table (even differing from the real one: `\bCP` vs `CP`); cannot fail on any change to `pogo_extract.py`. Nothing else is guarded by it; the parser it copies is dead code (S1). Also references in `github.md:117`.
- `scripts/test_postprocess.py:159-162` "per-frame prompt carries them too": `VIDEO_FRAME_PROMPT` is derived from `VIDEO_IMPORT_PROMPT` by string replace (`pogo_extract.py:1256`), so it cannot fail independently of the line above it. The surviving line should become the schema-contract test (fix A), not a substring check.
- `scripts/test_extract_pipeline.py:190` `check("one shared pool, models listed once", len(px._SHARED_POOL) > 0 ...)`: asserts an internal global; the behaviour (models listed once per run) is not observed. Replace with a count of `ListModels` calls on the fake `requests.get`.

Fix (they pass but guard less than they claim):
- `scripts/test_extract_pipeline.py:206` "parallel bar measuring returns one result per frame": blank white frames, so every reader returns None; it checks the pool plumbing, not measurement. Add real fixtures (fix G); the plumbing check can stay.
- `scripts/test_postprocess.py:144-148` gender tests use three fixtures where the two `*_male` ones are near duplicates of one another (shieldon/salandit/sableye all expect "M"); one female fixture is missing, so a regression that returns "M" always passes the screenshot cases (the synthetic-symbol cases at `:151-156` do guard it, but only when the DejaVu font exists on the runner: otherwise they silently do not run).
- `scripts/test_*.py` each define their own `check()` (5 variants: `test_postprocess`, `test_extract_pipeline`, `test_promo_codes`, `test_event_moves`, `test_tier_trends`/`test_evolution_branches`); not a bug, but one 10-line helper removes the surplus.

Missing (not removals; the risk the other fixes carry):
- No test of `measure_appraisal_bars*`, `run_appraisal_pipeline`, `_resolve_duplicate_sightings`, `main()` merge, or any import script's block writer (`import_*` have no test; `test_evolution_branches.py` and `test_tier_trends.py` cover two). Fixes B, C, D, G must add characterization tests first.
- Already guarded elsewhere and not duplicated: bundle currency (`test_bundles_current.py`), workflow security (`test_workflows.py`), pool scheduling (`test_gemini_pool.py`), event-move and promo parsers (`test_event_moves.py`, `test_promo_codes.py`).

## 6. Ranked fix plan with risk

| Rank | Fix | Problems solved | Risk | Guarding tests | Mechanical? | Size |
|---|---|---|---|---|---|---|
| 1 | D shared `gm_lib.py` (fetch once, block replace, block order, names) | H12, H13, H14, N3, N5, ~12 swallowed exceptions in import scripts | med (rewrites each import script; a bad regex corrupts `pokemon-mechanics.js`) | `scripts/test_evolution_branches.py`, `test_tier_trends.py`, `test_bundles_current.py`, `test_ranking.js`, `test_rank_reference.js`, plus new golden test: run each script on a small saved game-master fixture and diff the block | yes per script, behaviour-preserving if golden output is checked first | ~400 lines removed, ~120 added |
| 2 | F reusable extract workflow + push helper + bundle rebuild + ignore fixes | H17, H18, H22, H23, H24, H25, H26, `|| true` cases | med (cannot be exercised locally; mistakes show only on the runner) | `scripts/test_workflows.py` (must keep passing), `test_bundles_current.py`; add a dry-run `act`-free test that every data-writing workflow shares the concurrency group | mostly mechanical, but the push helper behaviour must be chosen (reset-and-reapply) | ~350 YAML lines removed |
| 3 | A reader contract (schema file + prompt/alias test) | H1, H2, H3, H7, H8, H10, H20, H21 | med (touches app source; prompt text changes alter model output) | new schema test; `qa_e2e_b.js` import tests (`:1637`), `test_postprocess.py`, `test_extract_pipeline.py`, `test_roster_logic.js`, `smoke_render.js`, suites a-e | first step mechanical: add the test that records today's divergences, then align | ~150 lines app, ~80 Python |
| 4 | B delete dead extractor code and duplicates | S1-S4, S6, H4 (Python copies) | low (verified no references except `test_ocr.py`; unused-name scan above) | `test_postprocess.py`, `test_extract_pipeline.py`, `test_gemini_pool.py`, `test_workflows.py` | yes, pure deletion plus one rename | ~560 lines removed |
| 5 | C split `run_gemini_video_ocr`/`main()` | H11, N1, N2, S5, 6 special cases | high (core of the video import; verify tier decision changes output) | `test_extract_pipeline.py` (runs 1-5, preflight, identification), `test_postprocess.py`, `test_gemini_pool.py` | no; do B first, then extract functions one at a time | ~300 lines moved, ~80 removed |
| 6 | G one confidence definition, fixture-backed bar readers | H6, H7 (log text wrong today), H9, H16 | high (exact IV pinning; wrong threshold pins a wrong IV) | needs new real-frame fixtures and tests first; then `test_extract_pipeline.py`, app suites for appraisal import | no | ~700 Python lines removed if two readers are dropped; unknown until fixtures decide |
| 7 | E stale paste-generators: wire or delete | H15 | low for deletion of `import_mega_data.py` after checking `megaEvolveCostFor` use; med for wiring the rest (changes tables) | `test_ranking.js`, `test_roster_logic.js`, `test_rank_reference.js`, QA accuracy audit | wiring: no; deletion: yes | ~400 lines removed |
| 8 | H misc cleanup (strays, `stat_fixes` naming, `utcnow`, benchmark prompt) | S7, H19, N4, S4 | low | `test_workflows.py`, the update scripts' tests | yes | ~30 lines, 5 files deleted |

Order of work: 4 first (smallest risk, shrinks every later diff), then 1, 2, 3 in parallel (disjoint files), then add fixtures, then 5 and 6.

## Counts

- Problems: 26 hidden-link/needless-link/surplus entries (H1-H26 are 26 items, N1-N5 are 5, S1-S7 are 7) = 38 numbered problems.
- Special cases: 5 groups; about 50 individual sites (swallowed exceptions 33, ifs/params 20, magic numbers 6, retries/sleeps 6, disabled/report-only 4).
- Comment candidates: 10.
- Test candidates: 3 to remove, 3 to fix, plus the missing-coverage list.
