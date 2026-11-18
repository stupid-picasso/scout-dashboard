# Untangle survey dc-3: `Scout Dashboard.dc.html` lines 11000-16500

Read-only survey at commit d697877. Nothing in source, tests or generated files was changed. All line numbers are in `Scout Dashboard.dc.html` unless a path is given. Range covers: file save/backup/delete-account, the Gemini client, video/screenshot/paste import, appraisal bar measuring, CP recovery, the import merge, appraisal solve, move editing, reminders/promo/push, Max planner, derived cache, bulk/transfer strings, Best IV and Ditto pages, keeper review, tags, power-up/purify, manual IV, evolution lookup start.

Evidence note: every commit touches the one source file, so file-level co-change counts say nothing. Pickaxe counts instead: `git log -S'this._pushTimer); this.pushCloud()'` finds 1 commit (the 15 copies arrived together, then spread by pasting); `-S'topFps.push'` and `-S'AI_NO_CREDIT'` both resolve to the single commit 93f268d (history is squashed, so the divergence between the two frame loops cannot be dated). The strongest evidence is the repeat count of each copied block, given per item.

Constraints a fix must respect (these are enforced, so they are not problems):
- `scripts/test_roster_logic.js` extracts source by exact text: `pokeSig(p) {`, `isRemoved(p, removedSet) {`, `moveOptionsByKind(kind) {`, `shinyPatch(item, prior) {`, `closeDetail() {`, `evoRecordFor(p) {`, `evoInfoFor(p) {`, `chainCandyCost(p) {`, `needsAppraisal(p) {`. Renaming or re-signaturing any of these breaks it silently only at run time (it throws, so loudly, but late).
- `scripts/push_config.js:8` regex-parses `PUSH_CONFIG() { return { workerUrl: '...', vapidPublicKey: '...'` from line 14715 and `scripts/test_push_config.js` guards it. The one-line single-quoted form is a contract.
- `qa_e2e_b.js` swaps `l.completeWithRetry`, `l.fileToVisionJpeg`, `l.fetchWithDeadline`, `l.geminiRotation`, `l._modelCool`, `l._geminiTimeoutMs`, `l._aiLog` and calls `buildTransferBatches`, `buildKeeperBatches`, `transferCandidates`, `tagGroups`, `tagsVals`, `maxPlanner`, `maxParty`, `importCheck`, `mergeVideoImport`, `withEvoRanks`, `evoChainNames`, `storageWarning`, `keeperOverrideOf` by name; `qa_e2e_c.js` calls `reminderItems`, `checkReminders`, `promoRedeem`, `icsLines`, `installHintShown`, `raidBossTarget`, `maxBossNames`. Public method names in this range are test API.
- `scripts/test_no_dangerous_sinks.js` strips `//` full-line comments only. Do not introduce innerHTML, eval, document.write.
- CSP/no new network hosts: the Gemini host (11443, 11453, 11567) and raw.githubusercontent.com (12703, 13160) are the only external calls here.
- No model identifiers in files: the Gemini fallback lists at 11514-11515 already carry them (pre-existing; cite, do not copy). A fix that touches those lines should move them into one named constant in `pokemon-mechanics.js` or drop them.

## 1. Problems list

Format: `Pn. [Hidden link | Needless link | Surplus] site: what.`

### Cloud save and persistence
- P1. Hidden link. 11235, 14114, 14136, 14299, 15203, 15261, 15338, 15369, 16242, 16313, 16360, 16429 (12 in range, 15 in file): `try { clearTimeout(this._pushTimer); this.pushCloud(); } catch (e) {}`. `componentDidUpdate` (4748-4772) already queues a debounced push (`queueCloudPush`, 1.2 s, 5494-5503) for every SYNC_KEYS change; these tails are a second, hand-chosen "flush now" decision per action, repeated by paste. Nothing says which actions must flush and which may wait: `setShinyConfirmed` 14450, `toggleMaxCapable` 14949, `bulkFavourite` 15272, `logMaxBattle` 15021 rely on the debounce, `setNoEvolve` 15908 calls `queueCloudPush` by hand though componentDidUpdate does it. The try/catch swallows nothing real (`pushCloud` returns early without a user).
- P2. Hidden link. 16491 `markRemainingNoEvolution` and 14113/14135 call `pushCloud` through a bare lambda with no clearTimeout, so a pending debounce still fires a second push.
- P3. Hidden link. 7 per-key device stores each write `localStorage` with their own try/catch and their own read at start-up (cross-range): `scout.importHold.v1` 13370/13375, `scout.keeperOverrides.v1` 15762/15770, `scout.tagnames.v1` 15939, `scout.tags.v1` 15945, `scout.protect.v1` 16021, `scout.savedViews.v1` 15277, `scout.promo.redeemed.v1` 14670, plus `scout.push.v1` 14727-14729, `scout.remind.*` 14572-14581, `scout.hint.install` 14465/14470, `scout.hint.swipe` 15320-15325. 30 `try { localStorage.setItem` sites in the file. Adding a persisted key means three edits (setState key, write site, load site) with no registry.
- P4. Hidden link. 15142 `MEMO_UI_KEYS` lists ~60 UI-only state keys by string. A new UI-only key that is not added silently invalidates every derived cache on each keystroke (a performance cliff, not a failure). The list also names keys of other ranges (`bestIvQuery`, `dtSel`, `krVisible`, `pushBusy`).
- P5. Hidden link. 15166-15184 `installDerivedCache` replaces 20 methods by a string list (15170); `typeof orig !== 'function'` skips a renamed one silently, so a rename loses the cache with no signal. The cache key turns arrays into `'a' + length` (15176), and holds one entry per method (15180). Probable real bug: `maxAttackers` is wrapped (15170) and `maxPlanner` calls it once per boss with different type lists of equal length (15103), as does `maxParty` (15003, with `400`); two bosses with two types each produce the same key `a2` and deps, so the second boss gets the first boss's attackers. No test covers two bosses of equal type count (MAX-10 `qa_e2e_c.js:98` checks one button only).
- P6. Needless link. 15752 `keeperOverrideOf` (called from render paths and from `transferCandidates` 15421) schedules `setTimeout(...migrateKeeperOverrides)` as a side effect of a getter, guarded by `_koMigrating`; one-off legacy-data migration is welded into a read.

### Item identity and the "detail sheet is a frozen snapshot" workaround
- P7. Hidden link / root cause. `state.detailPoke` is a copy taken when the sheet opens, so every writer must also patch it: 13339, 14295-14297, 14450, 14949, 16309-16311, 16356-16358 (6 sites, each with the same `dp && dp.idx === p.idx ? { detailPoke: {...dp, ...patch} }` expression). Comments at 14237-14240 and 14289-14292, 16305-16310 describe the same bug class. A seventh writer forgets and the sheet shows stale data.
- P8. Hidden link. `ivOverrides` patch idiom `const ov = {...this.state.ivOverrides}; ov[idx] = {...ov[idx], ...patch}` repeated 11 times in range (13335, 13407, 14066, 14131, 14259, 14446, 14944, 15270, 16281, 16340, 16405), five of them without the `|| {}` guard (13407, 14066, 14131, 14446, 16405), so a null `ivOverrides` crashes only on those paths.
- P9. Hidden link. The "family candy record or make one from `familyCandyFor`" lambda `inv[key] || (() => { const f = this.familyCandyFor(p); return { name: p.name, candy: f.candy != null ? f.candy : 0, xlCandy: f.xlCandy }; })()` is pasted at 15257, 15366, 16234, 16271, 16336 (5 in range and file); 13673-13685 writes the same record shape by hand.
- P10. Hidden link. The "pin an IV spread" block (`ivAvg`, `great/ultra/little: { rankPct, evolvesTo }`, Little Cup gated by `littleCupEligible`) exists at 13566-13577, 13944-13956, 14047-14057, 16404-16416 in range and at 6566, 9640, 10784, 17646 elsewhere: 8 copies. Each adds fields (`ivMeasured`, `ivManual`, `ivArbitrated`, `apprStars`) on top, and each guards `evolvesTo` by hand. Reported once; cross-range ends: 6566, 9640, 10784, 17646.
- P11. Hidden link. The review-row literal `{ name: rec.name, matchName: rec.name, cp: item.cp, hp: item.hp, iv, ivCount }` appears 8 times in 13938-14058.
- P12. Hidden link. `rangeOf` (14003-14007) and `rng` (13537-13541) are the same min/max-over-candidates function; `ORDER = { TOP: 0, ... }` appears twice in 15652 and 15657.
- P13. Surplus. `removedIdsWithout` 14189-14194 filters `id !== sig`, but nothing writes `sig:` ids into `removedIds` (`isRemoved` 14422 is idx-only; the only `'sig:'` literal is the constructor at 14412). The `pokeSig` use that remains is duplicate detection at 10674 (cross-range).
- P14. Surplus. `isRemoved(p, set)` 14422-14424 is `set.has(p.idx)`, kept only because `test_roster_logic.js:93` extracts it. `moveDamageFor` 14339-14343 is a pass-through of `lookupMove`; `moveDamageLine(p, name)` 14397 never uses `p` (callers 17340, 20106-20108).

### Gemini client
- P15. Needless link / hidden link. `callGeminiWithKey` 11491-11679 (190 lines) does request building, model rotation, per-model cooling (`_modelCool` key `key|model`), thinking-ladder retries, grounded-search fallback, JSON-mime retry, timeout stub (`status 599`), quota parsing, rpm learning (`_geminiRpm` 11643) and error classification in one body. Cooling is tracked twice: per key (`_keyCooldown`, 11399-11409, `callGemini` 11344-11366) and per key+model (`_modelCool`, 11649-11651, 11607); each reads the other's error text by regex (`/429|rate limit/`, 11356; `/429/` 11677), so a wording change in one error message changes the other layer's behaviour.
- P16. Hidden link. Rate pacing state is spread over `_rateBackoff` 11818/11829/11855, `_geminiRpm` 11643/11820, `_lastAiCallAt` 11862-11866, `RATE_INTERVAL_MS` 11810, `effectiveInterval` 11816, used from 3 callers (11791, 11802, 12164, 12420, 12453, 12468).
- P17. Surplus. `completeWithRetry` 11713-11763: the `window.claude.complete` branch (11718) is a host-preview hook with no caller in source; the credit-exhaustion branch (11753-11757, `AI_NO_CREDIT`, `aiOutOfCredit` 11707/11755/20868, `noCredit` 12404/12427/12454/12464/12469/12513/12523) is for the removed paid gateway (comment 11722-11724 says so); the `attempts` parameter has 12 callers and none passes it (grep of callers: all single-argument).
- P18. Surplus. `item.ivSource === 'model-guess'` 13887 is never set anywhere in source or scripts.
- P19. Surplus. `_geminiTimeoutMs` (11429, 11561, 11564) is assigned only by `qa_e2e_b.js:1705-1718`; production never sets it. `GEMINI_REQ_VERSION` 11683 is a manual build marker used only in one error string (11667).
- P20. Surplus / stale. 11065 `build: 'v52.9'` in the cloud backup header; the build bump (`scripts/build_bundles.py`) does not touch it, the app is at v53+. The header's build field is therefore wrong for every backup.
- P21. Hidden link. Gemini fallback lists 11514-11515 name models; `geminiRotation` 11436-11469 and `geminiClassify` 11414-11418 hold the live rule. Two sources of "which models".

### Import pipeline
- P22. Hidden link. `extractFrames` copies the capture logic twice and the two copies diverge: `capture()` 11979-11993 pushes `topFps`/`botFps`; the seek loop 12053-12072 does not (it pushes only `frames` and `thumbs`). `stitchScrollPairs` 12173-12174 returns early unless `topFps.length === frames.length`, so scroll-pair stitching (and the "N scroll pairs stitched" label, 12332) only ever works in the playback fallback, never in the normal seek path. Likewise the seek wait is written twice (`seekTo` 11995-12000 and the inline Promise 12018-12023, 6000 ms vs 4500/budget), and the black-frame test twice (11980-11983, 12057-12060). Merging them changes behaviour (enables stitching), so it is not mechanical.
- P23. Hidden link. The JSON field schema of a scanned Pokemon is written three times: video prompt 12355-12376, paste prompt `importPromptText` 12728-12751, appraisal prompt 13703-13714 (a different, smaller schema). The first two list the same ~45 fields in two spellings (`"type"` in the video prompt, `"type1"/"type2"` in the paste prompt) and the same Mega, Max, CP-covered and shiny rules; `normalizePastedItems` 12651-12673 and `maxPatch` 14900-14914 and `noteMaxParticles` 14917-14922 and `normalizeAppraisalItems` 13123-13153 then accept camelCase and snake_case spellings of each field. A new field is a six-place edit.
- P24. Hidden link. `measureAppraisalBarsTrack` 12787-12889 and `measureAppraisalBarsWarm` 12899-12996 repeat: canvas read (12790, 12902), luminance histogram and white point (12793-12796, 12905-12908), `minChroma`/`warmAt` (12798-12799, 12910, 12922), `med`, band grouping, and the final `raw -> ivs -> drift > 0.35` rejection (12884-12888, 12991-12995), ~45 duplicated lines. Orphaned comment 12768-12771 describes `normalizeAppraisalItems` (13084) but sits above the measuring comment.
- P25. Hidden link. `runVideoPipeline` 12340-12593 (250 lines): prompt choice, batching (12381-12398), two-pass retry (12452-12476), duplicate merge by name+CP (12490-12501), diagnostics, validation, receipt building (12568-12577), error rewriting. Its receipt reads `_solvedCount` from the validated items (12575) but `mergeVideoImport` writes `_solvedCount`, `matchedForm`, `cp` onto copies made by `coalesceFragments` (13234-13254, `kept.push({ ...item })`), so the receipt cannot see them: `_solvedCount` is always null there (probable bug; verify with a CP-hidden import).
- P26. Hidden link. `mergeVideoImport` 13394-13692 (300 lines) mixes: logging, fragment coalescing, CP recovery, the import gate, form detection, roster matching, IV solving across candidate bases with a level filter, rank patch, ambiguous-range handling, override merge, new-record construction, candy and type tables. The solve loops (13506-13518) duplicate `solveAndApplyAppraisal` 13984-13987 and the unrestricted fallback in 13992-13995; `baseStatCandidates` is called from 5 places (13476, 13560, 13271, 13355, 13920/13982).
- P27. Hidden link. Match identity (name+CP+HP, form-tiered) is in `mergeVideoImport` (13457-13466), `mergeAppraisalImport` 14072-14073 (name or dex, CP, HP, no form tier), `holdTransfer` etc. use idx. Two definitions of "same Pokemon" within one import path.
- P28. Hidden link. Two "fits some level" checks: `importCheck` 13354-13363 (brute force over CPM levels) and `saveManualIv` 16384-16399 (same loop plus a closest-level search); both also exist in `pokemon-mechanics.js` (`solveIVs`, `cpCandidatesFor`).
- P29. Hidden link. Server import twin: `importFromServer` 12702-12726 and `importIvFromServer` 13159-13182 are the same fetch, parse, merge, flash-message shape, and both hard-code the repo `stupid-picasso/scout-dashboard` (12703, 13160). The manager plan (D8) already marks these for owner-mode gating; the hard-coded owner name is also a hidden link to `.github/workflows/extract*.yml`.
- P30. Needless link. 14658-14660 `promoRedeem` reports a link refusal through `themeToast` and `_themeToastTimer` (the theme button's toast).
- P31. Hidden link. `evoBranchMap` 13740-13750 is a hand-typed species list inside a method (rebuilt on every call, 13771), while `evoBranchTable` 16674+ is generated from `EVOLUTION_BRANCHES` (game master, generated block). Two sources of "who branches"; `evoChainNamesRaw` 13771-13780 merges both. Game data in UI code.

### Notices, timers, clipboard
- P32. Hidden link. "Show a message, clear it after N ms" is written by hand with its own timer field 11025, 11238, 11250, 11295, 11299, 12695, 12721, 12759, 14626, 14660, 15194, 11485: 12 sites, 11 timer fields (`_fileCopyTimer`, `_csvNoticeTimer`, `_csvExportTimer`, `_pasteSummaryTimer`, `_serverImportSummaryTimer`, `_promptCopyTimer`, `_promoCopyTimer`, `_themeToastTimer`, `_undoTimer`, `_aiLogTimer`, `_copiedT` cross-range). `csvError` is also the message slot for notification refusals (14705, 14708).
- P33. Hidden link. Clipboard copy with fallback exists 4 times: `copyFileFallback` 11019-11030 (no fallback at all if clipboard is missing), `copyImportPrompt` 12754-12766, `promoCopy`+`promoCopyFallback` 14625-14641 (execCommand), and the shared `copyText` at 6578 (cross-range) which already does the job. Three of four are copies of it.
- P34. Hidden link. iOS and standalone detection: `installHintShown` 14456-14467 and `pushEnv` 14718-14723 each carry their own `/iPhone|iPad|iPod/ || MacIntel+touch` and standalone test.
- P35. Hidden link. Mega-rest walk over `megaEnergyInventory` is written twice: `reminderItems` 14558-14564 and `pushSyncMega` 14817. The promo/event/Mega reminders in `reminderItems` and the Worker's push triggers are one concept in two places; the filter at 14573 (`!(pushOn && /^(pc|ev|mr):/.test(id))`) is the only link and is a regex on id prefixes.
- P36. Surplus / speculative. Push alerts 14713-14837: ~125 lines that do nothing while `PUSH_CONFIG()` is empty (14715, by design until the owner deploys). It is also the only place with its own env/store/post/prefs layer; it is guarded by test_push_config and test_push_*.mjs, so it is kept, but the dead-until-configured code lives in the same class as the app.

### Search strings (transfer, keepers, tags)
- P37. Hidden link. The "isolation search string" algorithm (name & CP & stars sets, `matched`, `textOf`, `clean`, greedy fill, manual fallback, `MAX = 90`) exists three times: `buildTransferBatches` 15452-15508, `buildKeeperBatches` 15982-16011, `isolationStrings` 15871-15897. The semantics of the game's search (comment 15448-15451, "checked on a real account") live in all three; the NOT suffix is added only in the first. Cross-range: `copyText` callers.
- P38. Hidden link. The "covered by the protect string" predicate is written twice: 15557 and 16028 (both mention shiny, lucky, purified, species class, 4 stars); a change to the protect string 16072 must touch both and the string itself.
- P39. Hidden link. Best IV page and Ditto page are one browse-and-detail screen twice: `bestIvVals` 15614-15683 and `dittoVals` 15686-15722 repeat the species filter, owned count, rows with sprite, "showing N", More button, form chips, shadow chips, copies list. The species-name suffix strip regex is written three times with different lists (15569, 15641, 15701). Chip colours differ for no reason (`var(--ios-blue)` 15662 vs hard-coded `#0060c8` 15711-15712), which also bypasses the type/colour tokens that the UIQ checks watch.
- P40. Hidden link. User-facing "rule" text repeats thresholds that live in other functions: `whyLine` 14846-14855 (90, 60, 51, 70, 58, 78, 80), `computeRecommendation` 16438-16453 (95, 90, 85, 70, 60, 51), and the Recs lists / `buildOptimizePlan` (cross-range). The comment at 14839-14841 claims they "match exactly"; nothing enforces it.
- P41. Surplus. Dead ternaries: 16115 `bulkCoverageColor: cov.missing > 0 ? 'var(--ink-700)' : 'var(--ink-700)'`, 16133 `kindColor: b.softN ? 'var(--ink-700)' : 'var(--ink-700)'`, 15968 `statusColor` with both non-up-to-date branches `--ink-500`. 14927 `const base = m && m.gmaxFor ? null : null;` (unused). 15973 `canDone: g.members.length > 0 && !upToDate || (st.stale)` (precedence-only).
- P42. Hidden link. Candy-on-transfer (+1 candy, optional +1 XL) is written at 15254-15259 (`bulkTransferNow`) and 15364-15367 (`transferPokemon`).
- P43. Hidden link. Defensive "method exists" guards on methods that always exist: `this.haptic && this.haptic('light')` 13338, 15020 (2 vs 35 unguarded calls), `this.queueCloudPush && this.queueCloudPush()` 13339, `this.closeAnyRosterSwipe && ...` 15207 (defined at 6 places). They hide a missing-method bug rather than surface it.
- P44. Needless link. `evoChainNames` 13752-13767 caches on `this._evoChainCache` keyed by table identity, `withEvoRanks` 13804 on `_evoRankCache`, `effectiveRosterForMatch` 13848 on `_effRoster`, `copyKeyMap` 15732 on `_ckList`, `tagGroups` 15829 on `_tagCache`, `bestIvList` 15568, `bestIvRanges` 15585: seven hand-rolled caches next to a generic one (`installDerivedCache`); `effectiveRosterForMatch` is in the generic list (15170) and also caches itself.

## 2. Special cases

Format: `Sn. site: the special case (kind) and the requirement it hides.`
- S1. 11140, 11148, 11159, 11165, 11169, 11171, 11181: seven swallowed exceptions in `deleteAccountNow`. Requirement: the delete is best effort per step with an honest final message. Keep the structure, replace empty catches by a recorded `failedSteps` list.
- S2. 11235, 14114, 14136, 14299, 15203, 15261, 15338, 15369, 16242, 16313, 16360, 16429: 12 swallowed push exceptions (P1).
- S3. 11466 `catch` on live model listing: "offline: fall back to built-in list" (legitimate, keep as named fallback).
- S4. 11457 `catch { return true }` in the countTokens liveness probe: unknown means alive.
- S5. 11431 timeout stub `status: 599` (11574): a fake HTTP status for a timeout, read at 11604 and in diagnostics. Requirement: a typed result for "no answer".
- S6. 11587-11602: three chained `if (res.status === 400 ...)` retries with different parameters (thinking rung, search off, JSON mime) plus 429 with search (11594-11598): a retry ladder written as sequential ifs.
- S7. 11616 hard-coded 30 s body timeout, 11561 90 s image deadline +30 s/image up to 240 s, 11564 `x4` of observed latency (never under 30 s), 11607 180 s hang parking, 11596 1 h search-off, 11439 3 h model-list refresh, 11406 60 s cool-down: 8 timing constants with no names.
- S8. 11759 `await sleep(1200 * 2^i)` retry backoff and 11849 `wait + 250`, 11892 `100 ms x 15` poll for `videoWidth`, 11890 swallowed `play()`, 13066 `setTimeout(0)` repaint yield: sleeps standing in for events.
- S9. 11718 `if (window.claude && window.claude.complete)`: one host-environment value (P17).
- S10. 11753-11757 `AI_NO_CREDIT` and 12427 `if (bMsg === 'AI_NO_CREDIT')`: string-compared sentinel for a removed provider.
- S11. 12003-12014 and 12030: "seeking works" probe at the middle (4500 ms) and "6 consecutive seek failures switch strategy": heuristics for iPhone HEVC recordings (kept: real requirement, but magic numbers).
- S12. 12101 `rate = remaining > 240 ? 8 : remaining > 90 ? 6 : 4` playback speed tiers.
- S13. 12160-12162 `0.6` dedupe keep ratio and `/5` frames per batch duplicated from 12385 `MAX_FRAMES_PER_BATCH = 5` and 12160 `* 3` fps duplicated from 12321 `fps: 3`: the cost estimate re-states the pipeline's constants.
- S14. 12297 `est.requests > 12` threshold for the cost warning.
- S15. 12493 duplicate key for items with null CP includes `cpCovered/hp/cpVisible` (an `if` for one shape).
- S16. 12640 `catch (e) {}` per salvaged JSON object (legitimate salvage; keep and name it).
- S17. 12659-12670: 12 one-field alias lines in `normalizePastedItems` (snake_case to camelCase), each an `if` for one upstream spelling.
- S18. 13238 `if (item.cp != null || item.cpCovered === true)`: CP-hidden items bypass fragment folding. 13402 `window.__noImportGate`: QA-only flag in production code; 13381 `_gateBypass` flag set around `mergeVideoImport` by `acceptHeld`.
- S19. 13348 `.some(w => w.length > 2 && ...)` accepts "Alolan Raichu" / "Mega Mewtwo X" by partial word; 13350 `cp > 5200` literal.
- S20. 13399-13400 inline block with a try/catch whose comment says "leave the read as it is"; 13395-13396 two swallowed calls on every import.
- S21. 13438-13445 type-driven form detection, `mechanics.completeTypes` repair, `itemForm !== 'normal'` special-casing at 13446, 13457, 13644, 13623.
- S22. 13686 `hasRegionalForms` excluded from the type table: one rule for one table.
- S23. 13553 swallowed solver exception "unsolvable".
- S24. 13600-13601 two bare `ivNote` outcomes keyed by `ambiguousMatch` and `ivMeasured || ivManual`.
- S25. 13887 `'model-guess'` (P18).
- S26. 14192 `id !== sig` (P13).
- S27. 14464-14466: `installHintShown` returns `true | 'open-in-safari' | false` (three-valued boolean) with `inApp` and ternary-in-return; the `nav` and `standalone` parameters exist only for QA (14455 comment: "injectable for tests").
- S28. 14718 `pushEnv(nav, sa)` same test-only parameters.
- S29. 14545-14550 swallowed everything in `reminderItems`; 14572, 14577-14578, 14581, 14583 five swallowed exceptions in `checkReminders`; 14606, 14610-14611, 14619, 14622, 14629, 14639, 14663, 14670, 14701, 14707, 14710 eleven in the promo/reminder code.
- S30. 14727-14729, 14735, 14753-14754, 14765, 14767, 14789, 14791, 14799, 14809, 14822: 11 swallowed exceptions in the push code ("push is optional").
- S31. 15328 two chained `setTimeout`s (900, 400 ms) to animate the swipe hint; 15324 reduced-motion special case.
- S32. 15310-15312 auto-load stops at 150 rows: a limit working around full-list re-render cost.
- S33. 15417-15429 soft/hard keep split, `fromLine <= 25` borderline and 15460 `.slice(0, 600)`, 15453 `MAX = 90` (three copies, P37), 16043 `BUFFER = 150, LOW = 50`, 16040 `1075` default capacity, 16055 `STALE_DAYS = 3`: constants of the game's rules inline.
- S34. 15752-15753 legacy keeper-override migration (P6). 15556 `real` regex of keep reasons matched against display text (a regex over human strings: a reason reworded elsewhere silently drops from `keeperCandidates`).
- S35. 15569-15570 `strip` regex of 28 form suffixes; 15578 forms list `['alola', 'galarian', 'hisuian', 'paldea']`; 15641 shorter strip (P39).
- S36. 15901, 15908, 16021 swallowed exceptions around cache clearing.
- S37. 16072-16080 `useSize ? 'xxl,xxs & !xxl' : '3*,4* & !4*'`: NOT-operator self-test string chosen by whether any XXS exists.
- S38. 16205 `if (why.length && !/^\W*keep/i.test(said))` overrides the model's answer with a canned sentence: a guard that protects the "AI advises, user confirms" rule (keep).
- S39. 16291-16301 power-up: `pinned` level or only the running counter (two modes).
- S40. 16393 `bestDiff = -1` sentinel inside a loop to stop preferring later levels.
- S41. 16491 `() => this.pushCloud()` (P2).

## 3. Redesign (decision log)

Ordered by leverage (problems removed). Each fix is written as if today's requirements were known.

- F1. One "change a Pokemon" write path: `patchMon(idx, patch, { push })` that copies `ivOverrides`, merges, clears derived caches, and refreshes the open detail sheet from the live record; the detail sheet then reads `monWithOverrides(idx)` (14427) instead of a frozen copy, and the cloud flush policy is one parameter instead of a pasted try/catch. Removes 6 detail-poke patches, 11 override copies, 12 push tails and the guarded/unguarded split.
  - P1: 11235, 14114, 14136, 14299, 15203, 15261, 15338, 15369, 16242, 16313, 16360, 16429
  - P2: 14113, 14135, 16491
  - P7: 13339, 14295, 14450, 14949, 16309, 16356 (and the comments 14237-14240, 14289-14292, 16305-16310)
  - P8: 13335, 13407, 14066, 14131, 14259, 14446, 14944, 15270, 16281, 16340, 16405
  - P43: 13338, 13339, 15020, 15207
  - S2, S41
- F2. One `spreadFields(rec, base, ivs, { level, shadow })` in the mechanics layer that returns `ivAvg`, `great/ultra/little` ranks and level fields, used by merge, appraisal solve, measured pin, manual IV, evolve and import (8 sites, 4 here). Pair it with one `reviewRow(rec, item, iv, count)` and one `rangeOf(cands)`.
  - P10: 13566-13577, 13944-13956, 14047-14057, 16404-16416 (cross-range 6566, 9640, 10784, 17646)
  - P11: 13938-14058
  - P12: 13537, 14003, 15652, 15657
  - P28: 13354-13363, 16384-16399 (use `cpCandidatesFor`/`solveIVs`)
- F3. Split the import into named stages with typed hand-offs: `readFrames` (extractFrames, one capture function and one seek function), `askModel(batches)` (batching, pacing, retry queue), `normalizeReads(items)` (single field-alias table; one schema constant shared by the video prompt and the paste prompt, generated from the same field list), `reconcile(items, roster)` (coalesce, CP recovery, gate, match), `solve(item, bases)` (one base-candidate loop with level filter and unrestricted fallback), `commit(plan)`. Receipt rows are built from the reconcile output, so `_solvedCount` and recovered CPs reach it.
  - P22 (needs a decision: enable stitching in seek mode, or delete stitching)
  - P23: 12355-12376, 12728-12751, 12651-12673, 14900-14922, 13123-13153
  - P25, P26, P27
  - S13, S15, S17, S21, S23, S24
- F4. Gemini client as a small state machine in its own module section: `GeminiPool` owning keys, models, one cooldown table keyed `key|model` (the per-key layer becomes "all models of the key cooling"), pacing, thinking-rung memory, timeouts as named constants, typed outcomes (`ok | rateLimited(daily) | hung | rejectedKey | modelGone | other`) instead of regexes over message text and a fake status 599. `completeWithRetry` loses its dead branches.
  - P15, P16, P17, P19, P21
  - S5, S6, S7, S8, S9, S10, S3, S4
  - P18 and S25 (delete `'model-guess'`)
  - P20 (derive the backup build tag from the build, or drop the field)
- F5. One isolation-string builder `isolationBatches(items, roster, { allowed, suffix, maxLen, phase })` and one shared predicate `protectedByString(p)`; transfer, keeper and tag strings call it.
  - P37: 15452-15508, 15871-15897, 15982-16011
  - P38: 15557, 16028
  - P42 (plus F6)
  - S33 (rule constants into a named block), S37
- F6. One `candyRecordFor(p)` and one `adjustCandy(p, delta)`; transfer, bulk transfer, power-up, purify and manual save use them.
  - P9: 15257, 15366, 16234, 16271, 16336
  - P42: 15254-15259, 15364-15367
- F7. One browse-and-detail screen builder for Best IV and Ditto, parameterised by the league card source; name-strip regex and form list move to one helper; chip colours come from tokens.
  - P39: 15614-15722
  - S35
- F8. One `flash(key, value, ms)` notice helper with a single timer map, one `copyToClipboard(text, key)` (the existing `copyText` 6578), one `isIosStandalone(nav)`; message slots separated from `csvError` and `themeToast`.
  - P30, P32, P33, P34: 11025, 11238, 11250, 11295, 11299, 12695, 12721, 12759, 14626, 14658-14660, 15194
  - S27, S28
- F9. A persisted-key registry: `PERSISTED = { importHold: 'scout.importHold.v1', ... }` with one `persist(key)` and one load loop, plus UI-key declaration at the state initialiser (`ui: true`) so `MEMO_UI_KEYS` is derived, and the derived cache declared where each method is defined (`@memo` style registration) with a key function that hashes array contents, not length.
  - P3, P4, P5 (including the probable `maxAttackers` collision), P44
  - S34 (move legacy migration to the load step, remove P6), P6
- F10. Appraisal bar reader as one function with two classifiers (`trackAt` / `warmAt`) sharing white point, band grouping and validation.
  - P24: 12787-12996
- F11. Move game data out of the UI class: `evoBranchMap` into the generated branch data, the promo reminder and Mega-rest walks into one `dueReminders()` used by both local reminders and push; one iOS test.
  - P31, P35, P36 (leave push guarded as is)
- F12. Delete dead code and wrappers: `model-guess` (13887), `sig:` filter (14192), `base = ... ? null : null` (14927), `moveDamageFor` (14339) with the unused `p` in `moveDamageLine` (14397), `isRemoved` wrapper only if `test_roster_logic.js` is changed with it, dead ternaries (16115, 16133, 15968), `attempts` parameter, `GEMINI_REQ_VERSION`.
  - P13, P14, P18, P41; S26
- F13. Make the server-import pair one `importFromRepoFile(name, handler)` and take owner/repo from settings (matches manager-plan D8).
  - P29: 12702-12726, 13159-13182
- F14. Rule text and thresholds from one table: `whyLine`, `computeRecommendation`, Recs lists and `buildOptimizePlan` read `RULES = { evolveMinIv: 60, ... }`.
  - P40: 14842-14857, 16438-16453

## 4. Comments to remove (restate the code)

Checked by grep across `scripts/`, `.github/`, `docs/research/manager-plan.md`: none of these phrases is read by a test or the build. The `// ...` lines are also not used by `test_no_dangerous_sinks.js` except to be skipped. Keep list at the end.
- C1. 11242-11247 exportCsv "Must be the merged/synced list ..." (restates `effectiveRosterForMatch`).
- C2. 11269-11275 candy-stock paragraph (restates `candyStockFor`).
- C3. 11916-11919 "Small grayscale fingerprint ..." and 11946-11947, 11959-11961 band-fingerprint story (restate the 16x32 canvas and band fractions).
- C4. 12328-12331 "Extraction is the slow half ..." (restates the `idbPut` call).
- C5. 12341-12345 "Spread prior state and do NOT touch frameThumbs ..." (change history).
- C6. 12480-12482 and 12483 two comments over one `if (!failedBatches)`.
- C7. 12503-12506 "Commit the diagnostics BEFORE the zero-result throw ..." (history; the order is visible).
- C8. 12553-12554 "Save immediately, then show what landed ...".
- C9. 13414-13416 and 13451-13456 (history of `removedIdsWithout` and species-name fallback).
- C10. 13469-13473, 13479-13489, 13499-13504, 13510-13512, 13520-13524, 13531-13536 solver narrative (restates the loops); keep only "levels 41+ are omitted from the stardust table until source-confirmed" (data outside code).
- C11. 13580-13585, 13594-13595, 13604-13606 narrative above `ivPatch`/`changes`.
- C12. 14104-14111 `pushCloud` after `setState` essay (disappears with F1; the fact "setState is async" stays as one line).
- C13. 14289-14292, 16305-16310, 14237-14240 "frozen snapshot" paragraphs (disappear with F1).
- C14. 14415-14421 `isRemoved` history (the same history is already in `test_roster_logic.js` header).
- C15. 14330-14354: three stacked comment blocks over `moveDamageFor`/`bestRaidMoveset`; the first ("Real single-hit damage against a generic reference defender") describes behaviour the code no longer has (it returns raw move stats), so it is wrong, not just redundant. Replace by one line on `bestRaidMoveset`.
- C16. 14151-14154 "Stable identity for a removal ..." sits above `spreadText` (wrong function); move to `removedIdsWithout` or delete.
- C17. 16246-16257 `applyPowerUp` and 16317-16324 `applyPurify` long preambles (restate the arithmetic below); 16372-16375, 16419-16423 `saveManualIv`.
- C18. 15310-15311 (restates `< 150`); 15416-15417 and 15462-15463 partly restate `soft`/`skipFav` locals.
- C19. 11765-11766 and 11798-11799, 11825-11827 (restate method bodies).
- Keep: 11044-11045 (tap authorisation), 11126-11128 (order of deletion, not enforced by code), 11290 (Excel BOM), 11738-11739 (CSP reason), 12063-12064 (meaning of 7.0), 13256-13265 `cpAssess` background (but move the stray "Import check" lines 13256-13259 to `importCheck` at 13342), 14196-14202 (select option exactness), 14538-14540 (iOS cannot wake the app), 14713-14714 (owner set-up), 15342-15346 (iOS confirm), 15448-15451 (game search semantics), 12768-12771 should move to `normalizeAppraisalItems`.

## 5. Tests to remove or fix

I read the T blocks at the hit lines; test ids below are from `scripts/qa/qa_e2e_b.js` and `qa_e2e_c.js` plus the node tests. No UIQ-*, PWA-*, SEC/CSP/SRI test is proposed.
- T1. `qa_e2e_b.js` GEM-01 (208), GEM-02 (246), GEMPARK-01 (1702): rewrite, do not remove. They walk the React fiber to reach `logic` and swap `fetchWithDeadline`, `geminiRotation`, `_modelCool`, `_geminiTimeoutMs`, `_aiLog`, `_modelMs`, `_geminiModelIdxVision`; they break on any F4 refactor although behaviour is unchanged. Rewrite against an injected `fetch` (route-level stub in `qa_lib.js`) asserting only which model URLs were requested. Behaviour guarded nowhere else, so they stay.
- T2. `qa_e2e_b.js` PARSE-01 (1167): same internals coupling (`l.completeWithRetry`, `l.fileToVisionJpeg` replaced). Rewrite through the route stub.
- T3. `qa_e2e_b.js` chat-context tests at 1514-1534, 1584 stub `completeWithRetry` to capture the prompt: outside this range's functions but coupled to P17; keep and re-point with T1.
- T4. `qa_e2e_c.js` TOD-45 (115): asserts static copy "Reminders appear while the app is open" is present; it cannot catch a behavioural bug (the behaviour is TOD-43/44). Weak but cheap and guards an honest-limits statement; recommend fold into TOD-44 rather than delete.
- T5. `qa_e2e_c.js` TOD-23 (116): "no page errors after the whole Today session"; guards `s.errors` that every other test already checks per session. Duplicate of the generic error assertion; candidate to remove if each suite already ends with an errors check (verify in `qa_run.js` before removal).
- T6. Missing test (add, do not remove): MAX-10 (`qa_e2e_c.js:98`) checks one boss; add two bosses with equal type counts to expose P5. Missing test for P22: stitching in seek mode (assert `stitchedPairs` > 0 on a seekable fixture or decide to drop the feature).
- T7. `test_roster_logic.js` pokeSig/isRemoved block (92-125): a real guard (the Gyarados duplicate-signature bug), keep; if `isRemoved` is inlined (F12) re-point the extraction to the surviving method and keep the data shape.
- T8. Waits: `await s.page.waitForTimeout(300|400|900)` after `s.call(...)` at `qa_e2e_b.js` 113, 167-183, 279-283, 314, 324, 354, 1638-1645 stand in for "state updated". They are flaky-prone sleeps, not wrong tests; replace by `s.state()` polling (fix, not removal). Same for 1843 (900 ms for the keeper migration, P6).
- No test in the range was found that cannot fail or that repeats the implementation outright; the weakest are T4 and T5. Tests that fail without a real bug: none observed in this survey (no suite was run).

## 6. Ranked fix plan

Rank by problems plus special cases removed. Size is rough lines of source touched. "Mechanical" means behaviour-preserving without a decision.

| Rank | Fix | Removes | Risk | Guarding tests | Mechanical? | Size |
|---|---|---|---|---|---|---|
| 1 | F1 `patchMon` + flush policy + live detail sheet | P1 P2 P7 P8 P43, S2 S41 (~35 items) | med (cloud push timing; detail sheet reads) | qa_e2e_b CAN-04, MAX-05, BULK-01, KEEPKEY-01, TAGS-01; qa_e2e_d (restore, push); test_roster_logic closeDetail | Step 1 mechanical (helper replaces tails, same timing); step 2 (live detail sheet) behavioural | ~250 lines out |
| 2 | F3 import stages (receipt fix, one solve loop, schema constant) | P22 P23 P25 P26 P27, S13 S15 S17 S21 S23 S24 | high (largest code path; P22 and P25 change behaviour) | qa_e2e_b IMPCHK-01, CAN-04, MAX-05, GEM tests, PARSE-01, qa_e2e_a, test_cp_recovery, test_roster_logic | Extract-only steps mechanical; enabling stitching and the receipt fix are not | ~700 lines moved |
| 3 | F4 Gemini pool and typed outcomes | P15 P16 P17 P18 P19 P20 P21, S3-S10 | high (live API behaviour) | GEM-01, GEM-02, GEMPARK-01 (need T1 rewrite first), test_gemini_pool.py is the Python twin only | Dead-code removal (P17, P18, P19, P20) mechanical; rest not | ~300 lines |
| 4 | F2 `spreadFields` / `reviewRow` / `rangeOf` | P10 P11 P12 P28 (8+8+2 copies) | low-med | qa_e2e_b CAN-04, AUDIT-REG-01, IMPCHK-01, test_ranking | Mechanical | ~120 lines out |
| 5 | F5 isolation-string builder + protect predicate | P37 P38 P42, S33 S37 | med (guards a real-account safety property) | KEEPFAV-01, NEG-01, TAGS-01, qa_e2e_b 1086-1163, fuzz_keep.js | Mechanical if output strings compared before/after on the QA fixture | ~110 lines out |
| 6 | F9 persisted-key registry, derived UI keys, hashed cache keys | P3 P4 P5 P6 P44, S34 | med (P5 fix changes results for the better) | qa_e2e_b KEEPKEY-01, qa_scale.js, MAX tests | Registry mechanical; cache key fix behavioural | ~150 lines |
| 7 | F8 `flash`, `copyText`, `isIosStandalone` | P30 P32 P33 P34, S27 S28 | low | qa_e2e_c TOD-44, PROMO-*, PWA-13, URL-02 | Mechanical | ~80 lines out |
| 8 | F6 `candyRecordFor` | P9 P42 | low | qa_e2e_b CAN-*, power-up tests | Mechanical | ~40 lines out |
| 9 | F7 Best IV / Ditto screen builder | P39 S35 | low-med (UIQ colour/type pins: use tokens only) | UIQ-01/02, qa_e2e_e scans | Mechanical | ~90 lines out |
| 10 | F10 one bar reader | P24 | med (image reads) | qa_e2e a/b appraisal fixtures | Mechanical if outputs are compared on fixtures | ~50 lines out |
| 11 | F12 dead-code deletion | P13 P14 P18 P41, S26 | low | test_roster_logic (isRemoved) | Mechanical | ~30 lines |
| 12 | F13 server-import pair (with manager-plan D8) | P29 | med (data flow, owner mode) | qa_e2e_b:996 mock, workflows tests | Not mechanical (D8 decision) | ~40 lines |
| 13 | F14 rule table | P40 | low | qa_e2e_b Recs tests | Mechanical | ~40 lines |
| 14 | F11 reminders/push alignment, evo branch data | P31 P35 P36 | med | test_push_*, TOD-43/44, test_roster_logic evo tests | Not mechanical | ~60 lines |

Suggested order: F12 and F2 and F6 and F8 first (mechanical, low risk), then F1, F5, F9, then the T1 test rewrite, then F4 and F3 (behavioural and high risk, one stage per commit).

## Counts

Problems P1-P44 = 44. Special cases S1-S41 = 41. Comment candidates C1-C19 = 19. Test candidates T1-T8 = 8 (T6 is an addition; 2 rewrite-couplings, 2 weak, 1 keep, 1 wait fix, 1 missing-test note, 1 coupled-chat note).
