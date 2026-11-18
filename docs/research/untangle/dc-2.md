# Untangle survey: dc-2 (`Scout Dashboard.dc.html` lines 5500-11000)

Read-only survey. Base d697877. All line numbers are in `Scout Dashboard.dc.html` unless a path is given. The range is the middle of the one `LogicClass`: cloud sync and snapshots, size/keep/grade logic, bulk-update checks, tools (rename/search), CSV import, type and move lookups, PvP and raid logic, Mega, sprites, screenshot (vision) import, settings parsing, file saving.

Evidence from tests/scripts that constrains any refactor:
- `scripts/test_roster_logic.js` extracts methods by exact signature text (`extractMethodBody(SRC, 'needsAppraisal(p) {')`, lines 92, 204, 338, 436, 498, 641, 667). Renaming a method or changing its parameter list in this file breaks those tests.
- `scripts/test_firestore_rules.js:9-20` parses the getters `PACKED_KEYS`, `CLOUD_META_KEYS`, `RESTORE_EXCLUDED_KEYS` by the text `  get NAME() {` up to `\n  }\n`. `scripts/test_roster_logic.js:604` does the same for `SYNC_KEYS`, `SYNCED_STATE_KEYS`, `PACKED_KEYS` (credential absence check).
- `scripts/qa/qa_e2e_*.js` reach the logic object through `__reactFiber` and call methods by name (`s.call('formMismatchOf', ...)`, `keepFull`, `sizeProtected`, `lzPack`, `pvpTeamFor`, `squadWhy`, `dominatedDuplicates`, `renameFor`...). Method names are a public interface to tests.
- `scripts/qa/qa_e2e_e.js:577` scans the source for banned animation durations; `scripts/test_no_dangerous_sinks.js` scans for DOM sinks (whole-line `//` comments are stripped first). `build_bundles.py:22` searches for 'iOS design layer' (outside my range).

## 1. Problems list

H = hidden link, N = needless link, S = surplus.

### Cloud sync and snapshots (5494-6000)
1. H. The synced-key list is written out six times: `applyRemote` patch (5440-5463), `SYNCED_STATE_KEYS` (5652), `PACKED_KEYS` (5675), `buildCloudBlob` raw (5769-5777), `SYNC_KEYS()` (4742), and `firestore.rules` allowedKeys. Only a UI warning (`syncKeyDriftWarning`, 21758) and tests notice drift; the comment at 5647 admits the lists "had already drifted". `chatMessages` is in SYNCED_STATE_KEYS but not SYNC_KEYS, so `clearChat` (9342) must push by hand.
2. H. `CLOUD_META_KEYS` (5671) is a copy of two fields that also live in `firestore.rules`; the comment says "firestore.rules must list them too".
3. H. 54 explicit `queueCloudPush()` / `pushCloud()` calls (grep: 19 + 35) sit in setState callbacks, though `componentDidUpdate` (4748-4770) already pushes whenever a SYNC_KEYS reference changes. Callers are inconsistent: `bulkSaveTypeNow` (6530) pushes, `saveResources` (9182), `saveBagCapacity` (9215), `setMegaField` (9958) do not and rely on the automatic path; `applyMegaEvolve` (9820), `saveEvolutionItems` (9207), `fetchMoveData` (7797) call `pushCloud()` directly, bypassing the 1.2 s debounce.
4. H. `pushCloud` (5824-5991, 167 lines) does build, size-measure, shed, report and write in one body; the shed order, the 1 MB limit, the per-key accounting and the retry timer can only be understood together. `blobBytes` (5860) and `sizeOf` (5857) both measure bytes; local `sizeOf` shadows the method `sizeOf(p)` at 6007.
5. H. `_deleting` is checked 8 times in snapshot code (5545, 5550, 5567, 5582, 5599, 5605) because delete-account ordering is enforced by scattered guards instead of one gate on the snapshot chain.
6. N. `lzPack`/`lzUnpack` (5718-5762) and `chunkString` (5688) are a generic codec embedded in the UI class with no dependency on state; `qa_e2e_b.js:391` reaches them through the React fiber.
7. S. `getPacked`/`setPacked` (5887-5899) re-implement unpack/pack of one key; `unpackCloudBlob` (5802) and `buildCloudBlob` (5767) already do it.
8. H. Snapshot clock lives in three places: `_lastSnapshotAt`, localStorage `scout.snapAt.<uid>` (5531), Firestore `lastSnapshotAt`; reconciled by `Math.max` at 5481 (outside) and 5565.

### Size, keep check, grades (6001-7700)
9. H. Species grouping key `p.dex + '_' + (p.form || '')` is rebuilt inline at 6049, 6061, 6084, 7484, 7548, 7634, 8300, 8905 and as `dex|form` at 9146.
10. H. "Which copy is better" is four different comparators: `sizeBestIdx` (6053: sure, ivAvg, cp), `leagueCopyBeats` (7307: rank, ivAvg, cp, idx), `extraCopyOf` `better` (7507, 7524: ivAvg*1000+cp/100), `keepContext` sort (7085), plus `tradeAdvice` (8910) and `dominatedDuplicates` (9157).
11. H. Keep reasons are display strings, and soft/hard/generic classification is a regex over their text: `isSoftKeep` (7442) and `generic` (7591) must match the strings produced at 7540-7589, 7408, 7126, 7149. Editing a reason's wording silently changes keep behaviour.
12. H. `cutScoreRows` (7628-7683) re-states the keep reasons as score weights (lucky/favorite/shiny/size/nondo 100000 at 7668-7672) next to `keepFull` (7534-7598); a new reason must be added to both. `keepFull(p, ctx)` is also called twice per row (7680).
13. H. Keep thresholds are scattered magic numbers: iv 90 (7554), 80 (7557, 7585, 7586, 7666, 7667), 93 (7525), 97 (7665), 0.92 (7406), 70 (8897), 12 (8889).
14. H. Little Cup is a special league in many functions: `gradeLimits(lk === 'little' ? null : tier)` 7192, topPct table 7196, `toOf` 7323, `leagueIndexOf` chain 7345, `leagueListFor` 7362, `pvpFormName` 8265, `littleCupEligible` 8524. League descriptors do not exist.
15. H. League caps: `{ great: 1500, ultra: 2500, little: 500 }` fallback literal at 6034, 7386, 8230; the cap-to-league mapping `l.cp === 1500 ? 'great'...` at 7106, 8249; preset caps 1500/2500/500 at 6667-6669; text "under 1500 CP" at 8586-8587; `leagueBand` floors 8229. `mechanics.LEAGUE_CAPS` is read without fallback at 8581.
16. H. Memo caches have no registry: `_fm` 6316, `_bulkFit` 6290, `_bulkBadge` 6374, `_staleRk` 7055, `_keepCtx` 7082 (plus ad-hoc props `lb`, `leagueIdx`, `cupKeeps`, `extraCopies`, `cacheFull`, `float`, `sizeBest` on the context object), `_cutSum` 7688, `_gradeFx` 7287, `_gradeCache` 7178, `_raidCache` 8152, `_simMuCache` 8353. `clearDerivedCaches` (9377) lists only five of them; the rest rely on dep keys that each reimplement (`_fm` key omits pvpMaxLevel, `_gradeCache` includes it).
17. S. Guards for methods that exist: `this.freshRank ? ... : null` 7072, 8287; `!this.gradeStanding` 7046.
18. S. `needsAppraisal` (8096-8103): both branches return true after the `isFinite` test; the second comment describes the same result.
19. S. `hasTierData` (8276) is true for every league key ever passed, so `tierRank = 2.5` (8282) is unreachable.
20. H. `leagueIndexOf` (7344-7352) and `leagueListFor` (7362-7366) compute `steps`/`aff`/`toName` twice.
21. H. Base-stat lookup `(form && BASE_STATS_BY_FORM[dex_form]) || BASE_STATS[dex]` is copied at 6288, 6322, 6401, 6546, 7147, 7166, 7461, 7698, 9635; `baseStatsOf(p)` (8074) already exists. Evolved-dex lookup `String(to).toLowerCase() === String(p.name).toLowerCase() ? p.dex : resolveDexByName(to)` at 7118, 7164, 7146, 7460.
22. H. The "ivs of a Pokemon" test `[p.atkIV, p.defIV, p.staIV].every(Number.isFinite)` at 7457, 7559, 7575-7584, 7696; `ivsOf` (8082) exists. IV average `(a+b+c)/45*100` at 6556, 6844 (rounded to 0.1), 8780, 10194 (rounded), 10775: rounding differs between producers.
23. H. "PvP ready" (rank >= 90 and tierRank <= 2) is defined at 8384, 8490, 8870, 8435 (text), plus 80 at 8309.

### Bulk update and tools (6149-6760)
24. H. Regional form keys repeat in `formKeyOf` (6302), `bulkFormLabel` (6272), `bulkFormOptionsFor` (6279), `renameFor` letters (6594), `searchMatchCount` (6649), the search form chips (6717).
25. H. The 18 type names are literal lists at 6419, 6716, 7773; `TYPE_COLORS` keys (7826) and `allTypes()` (8654) hold the same set. Type string parse `split('/').map(trim)` and capitalise at 7859, 7914, 7934, 8123, 8510, 8676, 7981, 8052, 10489, `capitalizeName` 10165.
26. H. Writing one Pokemon override is a 4-step recipe pasted 9 times: `offerUndo` + spread `ivOverrides[p.idx]` + setState + callback `{queueCloudPush; clearDerivedCaches; recalculateAllRanks}` at 6179, 6248, 6262, 6355, 6530, 6573, 8797, 8804, 8824. The callback contents differ per site (6530 and 6573 skip `clearDerivedCaches` although they change the form/type that caches depend on).
27. H. The "re-solve IVs after the base stats changed" patch exists in `bulkPickFormNow` (6551-6562), `lookalikePatch` (8776-8783) and `solveIv`/`applySolvedIv` (10755-10857); league rank patch (`great/ultra/little` + `littleCupEligible`) in 6564-6570, 9640-9646, 10782-10784, 10854-10857. IV range from candidates: `rng` 6559, `rangeOf` 10756.
28. H. `bulkChecks` (6381-6514) is the list of checks; `bulkBadge` (6372-6379) re-lists the same checks' pending functions; the comment at 6269 says "Add a check by returning another entry from bulkChecks()" which is false. The checks are reordered by array index `[checks[2], checks[3], checks[0], checks[1], checks[4]]` (6513); the template picks a check by discriminator flags `isFormCheck/isTypeCheck/isCostumeCheck`, missing on two entries (6500, 6506).
29. N. Row view-model fields (`cp`, `hp`, `ivText`, `spriteRef`, `initial`, `onSkip`) built four times in `bulkChecks` (6392, 6421, 6443, 6465) and again at 6619, 6702, 9039, 9083, 9110; `showMore` +12 five times; page size 12 hard-coded at 6417 and 6451 while `bulkVisible` is state.
30. H. `searchStringFromBuilder` (6627) and `searchMatchCount` (6645) parse names/flags separately; preset flags `legendary`, `mythical`, `costume`, `evolve`, `purified` (6665-6670, 6714) are emitted in the string but have no evaluator in `get` (6650), so the match count ignores them.
31. S. `applySearchPreset` (6664-6672) repeats the full empty state in 7 objects; `mkChip(…, extra)` (6713) never uses `extra`; `saveTriage()` (6767) is an empty method still called from 17559-17705.
32. H. `costumeNorm` (6191) is a name normaliser; check whether a shared one exists before adding another (`normName`-style helpers elsewhere in the file).

### CSV and import (6795-7014, 10130-10990)
33. H. `parseCSV` positional columns (6846-6856) mirror Poke Genie's 47-column layout with skipped indices (17, 31-32, 39-40); nothing names the layout. `emptyLeague` literal at 6833, 10232-10234, 10260 duplicates `emptyLeague()` (7025).
34. S. `parseCSV(text, issues)` takes `issues` that nothing passes (6820, 6891); `genie = A || B && A` (6829) repeats its own condition.
35. H. `parseCSV` sets `this._csvMode` as a side effect (6862) that other code reads.
36. N. Three undo mechanisms: `offerUndo` (17 callers), `_importUndo` (6916, 6939, 6s timer 6936 vs 3.2 s 6945) and `lastImport.revert` (6169).
37. H. Two confirmation mechanisms for destructive acts: `askConfirm` and the armed two-tap `clearArmed` (6976-6985, 12 s timer).
38. H. `confirmClearRoster` (6987-7014) lists the fields to wipe by hand; its comment (6973) says it keeps candy and type inventories, but it clears `candyInventory` and `typeTable` (6996-6997).
39. S. `preprocessImage` (10135-10162) builds a 2x contrast-boosted canvas only for the preview (10528-10530); the vision call uses `fileToVisionJpeg` (10281). Both copy the same FileReader-to-Image block (10136-10146, 10282-10292).
40. H. A vision field travels through four vocabularies: prompt camelCase (10328-10335), record snake_case (10370-10386), `buildPokemonRecord` (10186), `ocrParsed` (10586), then `logMegaScans` accepts both (9924, 9927, 9930, 9932, 9940).
41. N. Production code branches on QA-only globals: `window.__noPrefetch` (10411), `window.__noImportGate` (10658), `window.__keepCaps` (7209, 9852).
42. S. `handleScreenshotUpload` keeps `text = '[read by ...]'` and `readerUsed = 'vision'` (10547-10548) from the removed OCR fallback; `rawText` and `readerUsed` are constants.
43. H. Whole-int parse reimplemented at 9184, 9203, 9217, 9728, 10944 while `parseWhole` (10937) exists for two callers; the 500000000 limit appears twice (10945, 10956).
44. H. `fileFallback: {filename, text, preview}` object built at 6580, 6581, 10994, 11010.

### Moves, types, PvP, raid, Mega (7712-9996)
45. N. `TYPE_COLORS()`, `TYPE_ICONS()`, `TYPE_TINT_PCT()`, `BADGE_WHITE_TYPES()`, `BADGE_FILL_OVERRIDE()` (7824-7856) are methods returning fresh object literals per call (8 call sites); constants dressed as methods. Colours `#20242b` (7873, 7880), `#9a8b7c`/`#b0a294` (7915, 7921), `#e5484d`, `#ffffff` (6425, 6620, 6713, 6728), `#1c1c1e` (6694) are inline hex in logic.
46. H. `fetchMoveData` (7749), `fetchTypeData` (8026) and `costumeFromShots` (6214) are the same batch-AI-lookup loop (batch, `completeWithRetry`, `extractJsonArray`, failed counter, status/busy/error state keys). `fetchMoveData` persists per batch, `fetchTypeData` only at the end. Validation bounds `power > 400 || energy > 100 || durationMs < 300 || > 6000` (7787) are unexplained.
47. H. `squadWhy` (8421-8451) "mirrors that function's filters in the same order" as `pvpTeamFor` (8381-8388); `rating < 500` at 8405, 8408, 8444, 8446; squad size/16 candidates magic.
48. H. `powerUpPlan` computes the "short on stardust/candy/XL" list twice (8561-8563, 8596-8598); the league-cap text "1500 CP" is typed next to `LEAGUE_CAPS`.
49. N. `attackerBoard` (8991-9127) builds the same member row three times (9039, 9083, 9110); `tidy` is defined at 8447, 8970, 8994.
50. S. `dupSpread` (9132) duplicates `rowSpread` (7996); its comment ("the Standalone build does not have spreadText") is false now that bundles are generated.
51. S. `fixFixedBars()` (9228) has an empty body; called at 9283, 9301 (a 250 ms timeout around a no-op).
52. S. `makeSpriteRef(url)` (9998) has one caller (21185); `ringGeom` and `threeQuarterRingGeom` (10108-10121) differ only by the arc fraction.
53. N. `makeSpriteRefByDex` checks `el.dataset.heroHome` (10098), a flag set by `makeHeroSpriteRef` (10054, 10059): two refs coordinate through DOM data attributes. Sprite hosts `raw.githubusercontent.com/PokeAPI/sprites` literal at 10049 and 10091.
54. H. GitHub repo slug `stupid-picasso/scout-dashboard` and hosts are literals at 9382, 9686 (and 12703, 13160, 17761 outside); the CSP `connect-src` must list them (`test_csp.js`).
55. N. `runGithubWorkflow(kind)` (9674-9717) is a function with a boolean-ish parameter used by two pass-through wrappers (9719-9720); state is duplicated per kind (`driveWorkflowBusy`/`...AppraisalBusy`, links, errors, summaries, timers via ternaries 9678-9681, 9702).
56. N. `dataQualityIssues` 'cpfit' (8873) classifies `importCheck(p)` messages by regex over their wording (`/do not fit any level|more than .* can have|IVs must be whole|outside what a Pokemon/`).
57. H. `refreshEverything` (9397-9476): the step list `defs` (9401) and the sequential `step()` calls use the same keys by hand; five `await wait(60|80|1200)` pauses; `gap()` passes unbound methods and calls them with `.call(this)`.
58. H. `cutTarget` default 300 repeated at 5453, 7605, 9447, 9729.
59. S. `megaEvolveInfoFor` (9749-9790) declares `function everDoneNote` after the `return`, used before its declaration.
60. H. `reloadFeedNow` (9381-9395) hard-codes two feed URLs and a swallowed fallback; feed loading elsewhere duplicates the URL list.
61. N. `showLayoutInfo` (9231-9265, 35 lines) is a one-off iOS diagnostic reachable by a hidden 900 ms long-press on the chat bubble (9310); sets `scout.shell`/`scout.bubble` keys.
62. H. `chatScreenLine` (9327) keeps its own tab-name map (`TAB`), a copy of the tab list.
63. H. Settings persistence: `try { localStorage.setItem('scout.X', ...) } catch (e) {}` at 5533, 6067, 6074, 7275, 7280, 9261-9262, 9321, 9583, 9619, 9390; the key names are read back in the constructor (outside range) with no shared table.
64. H. Timed-notice pattern (`clearTimeout(t); setState; t = setTimeout(clear, N)`) with a private timer field per notice: `_copiedT` 1600 (6579), `_themeToastTimer` 1800 (7268), `_csvNoticeTimer` 6000/3200 (6936, 6945), `_clearArmTimer` 12000 (6979), `_recalcSummaryTimer` 9000 (9651), `_driveWorkflow*Timer` 9000 (9702), `_stardustSavedTimer` 1800 (10964), `_rcT` 2600.
65. N. `installSentenceCase` (7208-7249) is a 40-line runtime text rewriter with word lists and four regexes, existing because labels are authored in capitals and also used as logic values (verdicts, grades, tags); `rowTag` (9851) is a second special case for the same reason.

Count: 65 problems.

## 2. Special cases (code for one situation)

1. `pvpAssess` 2.5 tier rank for `!hasTierData` (8276, 8282): unreachable.
2. `needsAppraisal` second `return true` (8100-8102).
3. `gradeLimits('little' ? null : tier)` 7192; little topPct table 7196.
4. `tierRank > 2` / `a.rank < 90` repeated as inline rules (8384, 8434-8435).
5. Count-up: `Math.abs(to-from) > 1e7` bail-out and the CSS-counter branch `om-count-real` (6115-6120, 6141).
6. `bulkAnimateOut` margin `-12px`, `setTimeout(commit, 340)` tied to CSS transition `.26s + .06s` (6155-6161).
7. `jumpToSection` retry `setTimeout(...,80)` when the section is not mounted and `setTimeout(...,240)` smooth-scroll fallback (6774, 6784).
8. `parseCSV` Genie detection `header.length >= 40` (6829); `lvlMax: num(...) || num(g('lvlMin'))` (6841).
9. `validateImportRows` limits cp 10-10000, hp 1-1000, level 1-51, dex 1200 (6875-6882).
10. `onFileChange` receives a fake event `{ target: { files: [f] } }` from the drop handler (6969).
11. Swallowed exceptions: `queueCloudPush` wrapped in `try {} catch (e) {}` at 6179, 6248, 6262, 6355, 6530, 6573, 8797, 8804, 8824, 9207, 9820; plus 5525, 5533, 5548, 5570, 5605, 6118, 6293, 7182, 8692, 9264, 9276, 10564.
12. Retry/sleep: `pushCloud` quota retry 10 min (5981), debounce 1200 (5503), 150 (5474); `generateBriefing` waits `cooldown + 1500` when cooldown <= 90000 and message matches `/rate-limited|rate limit|cooling|429/` (9569-9571); `recalculateAllRanks` `setTimeout(30)` (9653); `refreshEverything` waits 60/80/1200 (9407-9450); `sizeShell` polled every 500 ms (9286); `generateBriefing` via `refreshAllShortcut` `setTimeout(350)` (9617); `closeChatBubble` 250 (9301).
13. `window.__keepCaps` (7209, 9852), `__noPrefetch` (10411), `__noImportGate` (10658): test hooks in production.
14. `solveIv` falls back to an unfiltered solve when the dust filter empties the result (10730-10736); `dustIgnored` flag leaks into three result shapes.
15. `logMegaScans`: dual naming `megaEnergyX`/`mega_energy_x`, `dotsFilled`/`level`, `mega_rest` for form 1 only (9924-9940).
16. `typeOf` skips the name table for species with regional forms (8110, 8118); `lookalikeOf` cheap pre-check list (8766).
17. `sizeTagOf` extreme-wins rule and `sizeClass` fallback (6019-6025).
18. `isSoftKeep` and `generic` regex special lists (7442, 7591).
19. `keepFull` favourite: soft if app-favourited and `!selfProtect`, else hard (7543).
20. `chunkString` surrogate-pair guard (5704-5707) and `lzPack` dictionary cap 65535 (5730): keep, these follow from Firestore limits.
21. `slim` shed keeps empty league objects instead of deleting keys (5917): a render-path crash workaround.
22. `getComputedStyle` for CSS-variable type colours in `dsBadge` (7889-7891).
23. `bestDpsFor`, `bestRank` etc. use `|| 0` fallbacks for missing league objects (7072).
24. `megaEvolveInfoFor` cost precedence of three sources (9764-9771).
25. `recoverItemCp` wrapped in try/catch "keep the read" (10564); `autoApplyOcr` wrapped (10613).
26. `fixFixedBars` retired no-op (9228).
27. `showLayoutInfo` long-press trigger (9310).
28. `reloadFeedNow` two-URL fallback with swallowed error (9382-9392).
29. `generateBriefing` removes bullets that mention transfer words unless the Pokemon passed the keep check (9575-9579).
30. `refreshEverything` skips fill steps with no AI key (9430).

Count: 30 special cases.

## 3. Redesign (decision log)

- **One `SYNC_SCHEMA` table (key, packed?, default, restore?, live?) from which `SYNC_KEYS`, `SYNCED_STATE_KEYS`, `PACKED_KEYS`, `RESTORE_EXCLUDED_KEYS`, the `applyRemote` patch, the `buildCloudBlob` raw object and the drift warning all derive; keep the getter names (tests parse them) as one-line views over the table; add a test that every table key is in `firestore.rules`. Then let `componentDidUpdate` be the only push trigger.**
  - 5440-5463, 5652, 5675, 5769-5777, 4742 six copies of the key list (problem 1, 2).
  - 54 explicit `queueCloudPush()`/`pushCloud()` calls and the inconsistent subset that skips it (problem 3, special case 11 for the 11 swallowed ones).
  - `chatMessages` outside SYNC_KEYS forcing `clearChat` to push by hand (9342).
  - `CLOUD_META_KEYS` copy of rules fields (problem 2).
  - 21758 drift warning becomes unnecessary (kept as a test).
- **Split `pushCloud` into `buildBlob`, `fitToLimit(blob)` (history trim, derived-number slim, size report) and `write(blob)`; move the LZ codec and `chunkString` to a pure module with no `this`; run snapshots on one chain object that owns `_deleting`.**
  - `pushCloud` 167 lines (problem 4), `getPacked/setPacked` (7), codec inside class (6), eight `_deleting` guards (5), three snapshot clocks (8), quota retry timer (special case 12).
- **Make a `League` descriptor table `{key, cp cap, floor, slack, name, hasTiers, hasEvolvedForm, gradeTable}` and read every league fact from it (and from `mechanics.LEAGUE_CAPS`).**
  - Problems 14, 15, 19, 23 (the Little special cases, three cap fallbacks, cap-to-league maps, preset caps, band floors), special cases 1, 3, 4.
- **Keep reasons become objects `{code, text, kind: 'hard'|'soft', generic, score}`; `isSoftKeep`, `generic` regex, and `cutScoreRows` weights read the kind/score fields; thresholds live in one `KEEP_RULES` constant.**
  - Problems 11, 12, 13, special cases 18, 19; `keepFull` called twice (12).
- **One `speciesKey(p)`, one `betterCopy(a, b, {league})` comparator, one `baseStatsOf(p)` (+ `evolvedDex(p, lk)`), one `ivsOf(p)`/`ivAvgOf(ivs)`; delete the inline copies.**
  - Problems 9, 10, 20, 21, 22 and the rounding difference of IV averages.
- **A single `ivOverrideWrite(idxs, patch, {undo, recompute})` that does undo, merge, setState, cache clear and optional rank recalc; a `rankPatch(p, base, ivs)` and `solvedIvPatch(base, cands)` used by bulk, lookalike, recalculate and solve paths.**
  - Problems 26, 27 and the missing `clearDerivedCaches` at 6530, 6573; swallowed `queueCloudPush` (special case 11).
- **A cache registry: `this.caches.register(name, depsFn)` with `clearDerivedCaches` clearing all.**
  - Problem 16.
- **Bulk checks as data: `{key, title, blurb, pending(), row(p), onPick, order}`; badge, list, order and "show more" all come from the array; one `rowVM(p)` builder shared with Roster/Tools/Attackers boards.**
  - Problems 28, 29, 49 (three attacker-board row copies), 31 (preset objects: defaults + override), 30 (one parsed search model used by both string and count).
- **One `typeNames()` (from `TYPE_CHART`) and one `cap()`/`parseTypes()`; type palette tables become module constants with the colours as tokens.**
  - Problems 25, 45.
- **One `batchAiLookup({items, batchSize, prompt, accept})` returning `{got, failed}`.**
  - Problem 46 (moves, types, costume screenshots), plus consistent per-batch persistence.
- **One `squadEligibility(p, league)` returning `{ok, reason, rank}`; `pvpTeamFor` and `squadWhy` both call it; the "PvP ready" rule is a function.**
  - Problems 23, 47 and special case 4.
- **One notice/timer service `notice(key, ms)`, one `Settings.set(key, value)` that persists to localStorage with one key table, one `parseWhole`, one `saveFile`/`fileFallback`.**
  - Problems 43, 44, 63, 64, special case 12.
- **Make the machine-readable labels separate from the display labels (`label` vs `code`); then delete `installSentenceCase`, `rowTag` caps rewriting and the `__keepCaps` hook.**
  - Problem 65, special case 13 (one of three hooks); matches the plan's Fix 23 direction.
- **Delete dead code and wrappers.**
  - `fixFixedBars` (51), `saveTriage` (31), `makeSpriteRef` single caller (52), `dupSpread` (50), `mkChip.extra` (31), `parseCSV` `issues` and redundant `genie` clause (34), `needsAppraisal` second branch (18), `hasTierData` (19), `freshRank` guards (17), `everDoneNote` hoist (59), `preprocessImage` preview boost (39), `readerUsed`/`rawText` (42), `capLevel` single use (8580), `runVideoWorkflow`/`runAppraisalWorkflow` wrappers (55).
- **Collapse the three undo paths and two confirm paths into `offerUndo`/`askConfirm`.**
  - Problem 36, 37, 38 (stale clear-roster comment).
- **Parameterise workflow dispatch with a per-kind state object; one `REPO`/hosts constants block checked against the CSP.**
  - Problems 54, 55, 60.
- **Name the Poke Genie layout (`GENIE_COLUMNS`), one `emptyLeague()`, one vision field map (camel to snake) in one table.**
  - Problems 33, 35, 40, special case 15.
- **Test hooks: replace `window.__noPrefetch`/`__noImportGate` with an injectable option set in the QA harness through state or a documented debug flag object.**
  - Problem 41.

## 4. Comments to remove (restate code, or stale)

Checked: no test or script greps for these (test_no_dangerous_sinks strips whole-line comments only; `build_bundles.py` searches 'iOS design layer' outside the range).

Restating or stale (remove):
- 5496-5497 "Mark dirty even before hydration" (restates 5498).
- 5585-5586 "Never snapshot an empty roster..." (restates 5587; the reason survives in the test name).
- 5608 "A failed snapshot must never block..." restates `return false`.
- 5622-5625, 5784-5792 field-by-field narration of pack/unpack.
- 5845-5850, 5859-5860, 5877-5886 restate `safeBlob`, `blobBytes`, shed order (the 1 MiB rationale at 5851-5856 stays, it is outside knowledge).
- 6001-6003 orphan comment about tab scrolling placed above the Size classes section.
- 6097-6099, 6148-6149 describe what the code does.
- 6264-6269 "Add a check by returning another entry" (false, problem 28).
- 6512 "Costume checks first" restates the array order.
- 6577 "Pokemon GO caps a nickname at 12 characters" is outside knowledge: keep.
- 6626, 6643-6644 restate the function names.
- 7016-7017, 7068-7071 restate.
- 7226-7227 mentions `PVP_BAND_SLACK`, a constant that does not exist (stale).
- 7710-7711 orphan "Base stats for a specific Pokemon..." above the Move database header (belongs to `baseStatsOf` at 8074, which has none).
- 8218-8225 and 8330-8340 blocks describing `pvpAssess` and `pvpTeamFor` sit above `leagueBand` and `pvpSimMu` (misplaced).
- 8470-8473 `isPvpWorthy` comment sits above `needsEliteTM`.
- 8626-8631 "Best attackers by type..." above `bestDpsFor` mixes two topics.
- 9129-9131 `dupSpread` rationale (false, bundles are generated).
- 9225-9228 `fixFixedBars` comment describes behaviour the empty body no longer has.
- 9345-9352 recalculateAllRanks comment sits above `setPvpMaxLevel`.
- 10133-10134 describes a removed binarisation.
- 10238-10242 "Debounced so a burst..." comment above `sanitizeRoster` for a method that no longer exists.
- 10404-10406 names `OCR_AHEAD`; the constant is `AHEAD` (10408).
- 10532-10536 describes removed OCR fallback (the "wrong record is worse than none" rule is real; keep one line).
- 6973-6975 contradicts `confirmClearRoster` (problem 38): fix or remove.

Keep (outside knowledge): 5639-5651 Firestore index limits, 5682-5687 byte cap, 5714-5717 LZ format, 5851-5856 1 MiB, 5947-5960 SDK throws synchronously and write/snapshot ordering, 6017-6019 extreme-size rule, 6629-6630 game search syntax, 7005-7009 stale-echo reasoning, 7092-7095, 7156-7158 grade rules, 8029-8030, 9267-9270 iOS window height, 10968-10973 iOS share sheet.

Count: 27 comment candidates (restating, stale, misplaced or contradicting).

## 5. Tests to remove or fix

Never remove: UIQ-*, PWA-*, SEC/CSP/SRI, SYNC-*, DATA-*, STANDIN-01.

1. `PERF-04` second definition (`qa_e2e_c.js:312`, "index.html under 3 MB gzipped"): cannot fail unless PWA-12 (`qa_e2e_c.js:279`, raw under 1.7 MB) already fails, since gzip never exceeds raw size by that margin. Guarded by PWA-12. Also a duplicate id of `PERF-04` at `qa_e2e_b.js:933` (keep that one; it guards the keep-context cache).
2. `SIZE-01` duplicate id (`qa_e2e_b.js:1066` and `2040`): two different tests with one id; result files keyed by id collide. Fix by renaming the second (e.g. SIZE-02). No behaviour removed.
3. `LOG-02` (`qa_e2e_c.js:320`): the assertion `/qa-diag-test|ERRORS?/i.test(t) || ...` passes on the panel's own "No errors recorded"/"recent error" text (diagSummary at 21536), so it cannot fail when the error capture is broken. Fix: assert on `qa-diag-test` only. Capture is otherwise unguarded.
4. `TOD-09` (`qa_e2e_c.js:62`): `if (!team) skip('no team')` makes it a no-op when the fixture yields no squad; the cap rule is also guarded by `PVPBAND-01` and `SQUAD-01` (`qa_e2e_b.js:839`, `1185`). Fix: assert a team exists for the fixture, then keep.
5. `HOM-08` (`qa_e2e_c.js:204`) checks only that the first tap does not clear; the confirm-then-clear path is not asserted in this test. Fix: add the second tap and the `roster.length === 0` assertion (behaviour is touched by `DATA-*` for cloud only).
6. `scripts/test_roster_logic.js:604` regex over `SYNC_KEYS + SYNCED_STATE_KEYS + PACKED_KEYS` text for credentials: overlaps `SYNC-03` (behavioural) and the `RESTORE_EXCLUDED_KEYS` check in `test_firestore_rules.js`; keep (security guard), but it must be rewritten to read the future schema table if redesign step 1 lands.
7. Tests tied to internals (rewrite to behaviour, do not delete): `test_roster_logic.js` extraction by exact signatures (lines 92-93, 204, 240-241, 338, 380, 412, 436, 498, 641, 667) and `qa_e2e_b.js` direct `l.keepFull(...)`, `formMismatchOf`, `sizeProtected`, `lzPack` calls; they will break on a refactor of method names with no behaviour change. Proposed fix: a thin `window.__logic` accessor in the QA harness instead of the React-fiber walk repeated at 1071, 1104, 1204... (about 45 copies).
8. `qa_e2e_b.js` `SIZE-01` (2040) bundles 8 behaviours in one test (sizeInfoFor, sizeProtected, verdictFor, dominatedDuplicates, showcase text, search string, renameFor); a failure does not say which broke. Split, no removal.

No skipped/disabled tests found (`grep skip|xit|.only`: none besides a runtime `skip('no team')` helper and the CSP browser-missing SKIP).

Count: 8 test candidates (3 remove/fix-as-cannot-fail, 2 id collisions/weak, 3 brittle-coupling).

## 6. Ranked fix plan with risk

| # | Fix | Problems solved | Risk | Guarded by | Mechanical? | Size |
|---|---|---|---|---|---|---|
| 1 | One typed key/schema table for sync (derive 6 lists, drop redundant pushes) | 1, 2, 3, 8 (partly), special case 11 | med | SYNC-03/05/06/07/10, STANDIN-01, `test_firestore_rules.js`, `test_roster_logic.js:604`, DATA-* | Table: mechanical. Removing pushes: behaviour step, one site at a time | ~120 lines changed |
| 2 | League descriptor table + shared helpers (`speciesKey`, `betterCopy`, `baseStatsOf`, `ivsOf`) | 9, 10, 14, 15, 19, 20, 21, 22, 23 | med | GRADE-01, LITTLE-01, SIZE-01, SCORE-01, LINEUSE-01, DOM-PVP-01, `test_ranking.js`, `fuzz_keep.js` | Helper substitution mechanical; descriptor table needs care | ~300 lines |
| 3 | Keep reasons as objects (kind, generic, score) | 11, 12, 13 | high (keep check is the transfer-safety gate) | BULKSTR-*, HOLD-01, GRADE-01, AUDIT-REG-01, CUT-02/03, `qa/fuzz_keep.js` | Not mechanical | ~250 lines |
| 4 | `ivOverrideWrite` + `rankPatch` + `solvedIvPatch` | 26, 27, special case 11 | med | BULK-01/02, LOOK-01/02, COST-01, ADD-01, PWR-01 | Mostly mechanical per site | ~150 lines |
| 5 | Delete dead code and wrappers listed in the redesign | 17, 18, 19, 31, 34, 39, 42, 50, 51, 52, 59 | low | full suites a-e + smoke | Yes | ~120 lines removed |
| 6 | Remove stale/misplaced comments (section 4) | 27 comments | low | build + `test_bundles_current.py` | Yes | ~120 lines |
| 7 | Bulk checks as data | 28, 29, 30, 31, 49 | med | BULK-01/02, LOOK-02, COST-01, ADD-01 | Not mechanical | ~200 lines |
| 8 | `squadEligibility` shared by `pvpTeamFor` and `squadWhy` | 23, 47 | low-med | SQUAD-01, SQUAD-WHY-01, SIMSQUAD-01, TOD-06/09 | Mostly | ~60 lines |
| 9 | `batchAiLookup` | 46 | low-med | BULK-02 (types), COST-01, THINK-01 | Yes | ~80 lines |
| 10 | Notice/timer service + Settings.set + `parseWhole` + `saveFile` | 43, 44, 63, 64 | low | THEME-01, IMP-*, HOM-*, MOTION-01 | Mostly mechanical | ~150 lines |
| 11 | Split `pushCloud`, move LZ codec out of the class | 4, 5, 6, 7 | med-high (data-loss path) | SYNC-05/06/07/10, DATA-04/06, CLOUD-LZ-01 | Split is mechanical; `_deleting` gate is not | ~200 lines |
| 12 | Cache registry | 16 | low-med | PERF-04 (keep-context reuse), PVP/SQUAD tests | Mostly | ~60 lines |
| 13 | Separate label from code, delete `installSentenceCase`/`rowTag`/`__keepCaps` | 65, 41 (one hook) | high (all strings, QA locators) | CASE-01, UIQ-*, all locators | Not mechanical | large |
| 14 | One undo, one confirm for clear-roster/import | 36, 37, 38 | med | IMP-*, HOM-08, ROS-13 | No | ~100 lines |
| 15 | Test fixes (section 5) | test candidates 1-5, 8 | low | n/a | Yes | ~30 lines |
| 16 | Workflow dispatch per-kind state, REPO/host constants | 54, 55, 60 | low | `test_csp.js` | Yes | ~60 lines |

Leverage order (problems removed per fix): 1 (about 66 sites), 2 (about 55 sites), 3, 4, 5, 6.
