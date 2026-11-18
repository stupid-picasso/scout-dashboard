# Untangle survey dc-4: `Scout Dashboard.dc.html` lines 16500-21871

Read-only survey. Line numbers are in `Scout Dashboard.dc.html` at d697877 unless a file is named. Area content: tail of `fetchEvoData` (16500), evolve and event-evolve logic, dust planning, two AI "ensure/request" jobs, triage, GBL/cup/feed logic, chat context, gesture code, snapshots/log, then `renderVals` (19126) and `renderValsInner` (19131-21866): one 2,735-line function whose `return {}` (20487-21865) is a flat view-model of about 700 keys.

Measured in the range (grep): 29 hand-built `name + (form ? ' (form)' : '')` strings; 39 `makeSpriteRefByDex`, 30 `dsTypeColor`, 38 `charAt(0)` initials; 14 title-case regexes; 15 empty `catch` blocks (24 `catch` total); 155 `var(--` token strings plus 11 hex literals and 8 `'white'`/`'#fff'` inside logic; 524 comment lines; 13 lines over 400 chars; 31 `x: this.state.x || ''` pass-through keys; 13 `stopPropagation` guards; 25 `this.mechanics &&` / `!m ||` guards.

## 1. Problems list

H = hidden link, N = needless link, S = surplus. IDs are used by section 3.

### Hidden links (copies of logic/values, implicit protocols)
- H1 Roster record -> view-model of a Pokemon is rebuilt 29+ times: `displayName`/`spriteRef`/`badgeColor`/`initial` at 19213, 19381, 19402, 19441, 19481, 19525, 19551, 19569, 19613, 19632, 19644, 19658, 19670, 19692, 19698, 20298, 20341, 20828, 21249, 21269, 21316, 21339, 21351, 21390, 21424, 21455, 21514, 21551, 21629. Variants differ silently: `' (form)'` vs `' · form'` vs `' FORM'` (21456), `charAt(0)` vs `(name||'?')`.
- H2 "Is shadow" has two spellings: `isShadow(p)` (8514, 32 uses here) vs inline `p.shadowPurified === '1' || === 1` at 18388, 19216, 19303, 19843, 19932, 20005. Same for the flag list Lucky/Shadow/Favorite/Shiny: 17363, 17365, 17387, 18214, 19216, 19843, 20005 (labels differ: `Shiny?` vs `Shiny (unconfirmed)`).
- H3 League id <-> CP cap <-> display label is re-derived: `cp===1500?'great':...` at 17867, 17898, 17987; `capOf` 19882; `[['GREAT',1500],['ULTRA',2500]]` 19968; labels `'GREAT <=1500'` 19424; `mechanics.LEAGUE_CAPS` already exists (used 17278, 19856). `lk==='ultra'?'Ultra':'Great'` appears 7 times (17881, 18002, 18125, 18168, 18238, 21253, 21321). Master/little are silently missing from some (18125 team name, 19401).
- H4 Tier order `{S:0,A:1,B:2,C:3}` re-declared at 16745, 18095 (twice inline), 18152, 19344 (unused); the weight `1 - 0.12*min(tierRank,4)` is duplicated at 16755 and 16880. `pvpAssess` already returns `tierRank`. Tier colour function declared 19359 and 20079.
- H5 TM type table (`fastTM/chargedTM/eliteFastTM/eliteChargedTM`, labels, fast/elite predicates) in 17397, 17420, 17434-17441, 17447, 20137-20138, 20619-20626 and `useTM` 18947.
- H6 Thresholds restated as prose or second copies: transfer rule iv<51 and rank<70 in `buildOptimizePlan` 18298, in `transferPool` 19549 (also adds `!hasRaidRole`, so the two "transfer candidate" lists disagree) and in the text at 19597; borderline 58/78 at 19567; triage 70/70 at 17536-17537; PvP-ready "90%+ on S/A/B" text at 18194, 18370, 20697, 19318; dust-candidate `rank>=90, tierRank<=2` at 17291 and 19458; grade thresholds "TOP 98%, EXCELLENT 95%, GOOD 92%" hard-coded in prose at 20802 beside `gradeEffects()`; "500 CP" at 21294 vs 16861; `hasRaidRole` "within 90%" in prose 18205; chat prompt numbers 90/150/4/40/260 in code (18468, 18481, 18347-18348, 18328) and again in prompt text (18485, 18487, 18496, 18334).
- H7 Gemini quota constants: 1,500/day and 10/min at 16516 (pacing `7000/keyCount`), 20917-20920, 20954, 18507; error taxonomy by regex on message text: 16523, 16571, 18506-18512, 21741 (`^(TOO BIG|error:)` on `syncStatus`). The producers (`completeWithRetry`, sync code) are elsewhere, nothing ties the strings.
- H8 Evolution precedence "REAL table over evoTable" implemented twice: `evoRecordFor` 16664-16675 and `evolveQueue` 17086 (comment at 17082 says "same precedence"). `eventEvolveOpps` memo key (16963) omits `evoTable`, `ivOverrides`, `addedPokemon`; stale up to a minute.
- H9 `detailPoke` is a copy of a roster record, so every writer must patch it by hand: 13339, 14450, 14949, 18929, 18937 (`closeDetail` 18956 resets 7 related keys by hand; also 7001, 4842).
- H10 Persistence protocol is by convention: transfer-queue writes do `setState(.., ()=>{saveTriage(); pushCloud()})` at 17559, 17566, 17574, 17701, 17705; `setEvoPick` uses `clearDerivedCaches(); queueCloudPush()` (17597); `evolvePokemon` uses `clearTimeout(_pushTimer); pushCloud()` (17692); `saveTeam/tallyTeam/removeTeam/addEvent/removeEvent/logSnapshot` (18130-18141, 18073-18084, 19011) call nothing and rely on a separate sync-key list at 4745/5658.
- H11 Render-time side effects: `renderValsInner` calls `mechanics.setPvpMaxLevel(...)` at 20336 (global in another module); `dustPlan` -> `ensureCandyAiDecisions` (17237) can start a network request from render; `evolveQueue` sets `this._evolveSkipped/_evolveHeld` (17108-17109) which the view-model reads at 21245; `this._failedFrames`, `this._lastVideoFrames`, `this._aiLog`, `this._diag` (21200, 21531-21539) are instance fields read in render with counters in state as re-render triggers.
- H12 `installDerivedCache` (15163-15185, outside range) monkey-patches ~20 of this range's methods by name list (15170); invalidation is "whole state minus the UI-key set at 15142" plus a 60 s clock tick; arguments keyed by `Array.length` only. Adding a method needs the list; adding a UI-only state key needs the set; `dustPlan(budget, csv)` 17190 is keyed by `String(arg)`.
- H13 Tests bind to source text: `scripts/test_roster_logic.js:745` and 886 rebuild methods from exact signature strings (`'leagueTopSpecies(cp, n, cup, mega, tableKey)'`, `'megaReadyPicks(n, cp)'`) and stub dependencies (`ctx.cupBuildRows = () => []` with the comment "pre-existing gap"). Renaming/re-signaturing any method in this range breaks them with no pointer from the source.
- H14 Overlay/tab registries are implicit: `chatBubbleShow` ANDs 12 overlay flags (21830); `statusBanner` hides on `moreOpen||selectMode` (20504); tab names/labels in `barDefs`/`moreDefs` 20458-20475, `ICON` 20441, chat label map 21839, `chatScreenLine`, `goToTab`; `frStep1..6` + `/6` (21691-21693) vs `firstRunNext`; `isMobile = width<640` (20352) vs CSS media queries; `ROSTER_SWIPE_REVEAL=136` (18735) must equal the width of action buttons in the row template (no link); `aria-label^="Transfer"` selector at 18807 must match template labels.
- H15 Escape levels differ: `'\\n'`/`'\\u2014'` produce literal backslash text in the model prompt (16586-16595, 17393) and in a user-visible warning (21762); sibling strings use `\n`/`\u2014` (17396, 17399). Script is plain text (type="text/x-dc"), so no unescape layer exists.
- H16 Two rosters: coverage/clear-warning code reads `this.state.roster` (20906, 21023, 21028, 21045, 21055) while everything else reads `effectiveRosterForMatch()`; the sendChat comment at 18378 documents the bug this causes (added Pokemon invisible).
- H17 `localStorage` keys `scout.feed.v1`, `scout.eventmoves.v1`, `scout.bubble`, `scoutTrace` are literal strings in 17756, 17769, 17776, 17779, 21835, 18751 with no registry; fallback host/repo `raw.githubusercontent.com/stupid-picasso/scout-dashboard` literal at 17761 (CSP/sw/no-new-hosts guards depend on it).
- H18 `evolutionItems` key list (20729) must match `itemKey` names from game data (16696) and the 11 `onEvoItem*` handlers (20736-20746) and the template inputs and state default.
- H19 Segmented-control rendering carries colour tokens in logic: `bg/fg` pairs with `'#fff'`, `'white'`, `'#0060c8'` (20796, 20799, 21472-21474, 21451, 21545), hex in `vdColors` (19898-19901), `'#bf5af2'` 19096, `'#8a2be2'` 19932, `'#1c1c1e'` 19919, `'20px 20px 0 0'` and `'14px 14px 0 0'` radii (20513, 19260). A token or radius change needs edits in JS (UIQ-01/02 pins live in CSS).

### Needless links
- N1 `renderValsInner` builds the view-model of every screen on every render. Un-gated: `evolveQueue`, `eventEvolveOpps`, `triageQueue`, `dustAllocator`, `actionableDexGaps`, `megaWorth` (twice, 21455/21466), `gblWeeks` (twice, 21479/21480), `feedEvents` (3x, 21481/21482/21492), `scanQueue` (3x, 21512-21528), `buildOptimizePlan` (19605), `growthCharts`, detail sheet. Only four tabs use the existing gate pattern (`...(tab==='x' ? this.xVals() : {})` 20544-20555, `refreshVals`/`briefingVals`/`pushVals` 20944-21491). Memoisation (H12) papers over it.
- N2 View-model is the only way to reach the template, so every handler gets a 1:1 key: `onResource*` x6 (20721-20726), `onEvoItem*` x11, `onOcr*` x12 (20888-20899), `onManual*` (19268-19271), `x: this.state.x || ''` x31, boolean pairs `ivEditOpen/ivEditClosed` (19261-19262), `clearArmed/clearNotArmed`, `tabAppraisalWeight/Color/Rule` + `tabEvo*` (20202-20207), `hasX`/`xHas` (about 60).
- N3 `gblWeeks` (17976-18042) builds display cards, colour strings and sentences inside a logic function, in one 70-line object expression; `squadNote` (18031) builds a string only to regex it back out of itself, then `squadLine` (18036) builds the same string again.
- N4 `dustPlan(budgetOverride, skipCsv)` (17190): the two parameters exist for one caller (`dustAllocator` 17318); `skipCsv` is a comma string round-tripped through `split`. `dustAllocator` recomputes the budget from `dustReserve/stardustBalance` (17275-17276) as `dustPlan` does (17193-17195).
- N5 `evolveValueOf` (16872) mixes scoring, prose (`why`, `capNote`) and CP-cap simulation; callers need only `value/iv/bonus` but must carry `why`, `overCap`, `capNote`, `measured`.
- N6 Callers depend on strings from `leagueBestFor`: `/Little Cup/` test (17005), `replace(/ \(.*$/,'')` (16908).
- N7 Triage/evolve/dust/event all pull `keepContext` + `keepReasons` separately (16979, 17107, 17280, 18210, 18297, 18343, 18451, 19548) with their own lazy variants (16978-16979 and a redundant re-assignment at 16999).
- N8 `sendChat` (18375-18519) is one function: context assembly (10 IIFEs), 2,000-char inline system prompt (18496), call, error classification (18506-18512). It reaches into `chatScreenLine`, `candyRecFor`, `leagueLeaders`, `dominatedDuplicates` directly.
- N9 Three bespoke touch-gesture engines (`sheetRef` 18578, `triageSwipeRef` 18651, `bindRosterSwipe` 18766) each with their own axis lock (8 px), velocity thresholds, `cubic-bezier` strings (8 occurrences), transform/opacity resets and timeouts that must match CSS durations (210 ms vs `.32s` at 18630-18635, 180 ms vs `.22s` at 18661-18672).
- N10 AI jobs: `ensureTmAiRecommendations`/`requestTmAiRecommendations` (17370-17458) and `ensureCandyAiDecisions`/`requestCandyAiDecisions` (17461-17513) and `fetchEvoData`/`fetchEvoBatch` (16494-16583) each re-implement signature+busy-guard+prompt+parse+catch; the first two parse with `/\[[\s\S]*\]/` + `JSON.parse` (17415, 17490) while `extractJsonArray` (12601, repairs fences/truncation) exists and is used by the third.
- N11 Fetch-JSON-with-localStorage-cache is written three times in `loadFeed` (17754-17786) plus `promoLoad`.

### Surplus
- S1 Dead fields/functions: `megaLine` (18037; also builds `"[object Object]"` because `picks` are objects), `scanLine`/`scanColor`/`scanBg` (19909, 19910, 19920; no template use), `readerLine` (19754, empty), `tierOrder` (19344), `hour` (19606), `token` key in `todayChips` (21217), `calloutLine` + `callouts` (19317-19324, 20534; template count 0), `mergedForCounts` duplicate of `roster` (19835), `statRings` colour call `accent(75, 0.15)` passes arguments to a zero-arg function (19846, 20660-20661), `r.name.replace(/ \(Shadow\)$/, ' (Shadow)')` is the identity (18009), `megaReadyPicks` (17890; used only by `test_roster_logic.js:897`), `typeData.btn` vs `buttonLabel` (20580-20581), `|| null` after `.map` (20627), `spriteRef: (() => {})` (21373), `picked.indexOf(r) < 0 && !picked.some(...)` double test (17266), `try { clearTimeout(...) } catch` (17694, 17692; `clearTimeout` cannot throw), `hasReady: true` (20693), duplicate `KEEP`/`EVOLVE` colour entries (19896-19897).
- S2 Debug scaffolding shipped: `_swipeTrace` (18749, 8 call sites, localStorage flag `scoutTrace`).
- S3 `megaReadyPicks` pass-through wrapper (17890); `get ROSTER_SWIPE_REVEAL()` getter for a constant (18735); `this.evolvesToName ? ... : null` guard on own method (17474).
- S4 Speculative generality: props `personality`/`density`/`accentColor` (4294-4296, 19141-19147; affect only the greeting text and two padding values, accent palette of 5 hex values mapped to tokens 19141); `leagueDefs`, `checklistDefs`, `ICON`, `barDefs/moreDefs`, `VIDEO_STAGES`, `evolutionItems` keys allocated per render.
- S5 Manual event planner (`addEvent/removeEvent/setEventDraft/eventSpeciesVerdict` 18068-18117, view-model 21499-21511) with a stale header "there is no event feed to read" while `loadFeed` (17754) and `feedEvents` (18045) exist. Check whether the planner is still wanted.
- S6 `typeof out === 'string' ? out : out.content` (17414, 17489) guards an unknowable return type of `completeWithRetry`.
- S7 25 defensive `this.mechanics && ...` guards: `mechanics` is a module loaded before the component (394).

## 2. Special cases

Each is a requirement the design never named.
1. 16511-16516 sleep `7000/keyCount` between evo batches (rate limit pacing, see H7).
2. 16523 regex on error text decides "rate limited"; 16571 regex on error text decides "truncated, halve the batch" (and depth<4 retry, 16572).
3. 16535 drop species whose target is not a known dex (AI made-up names).
4. 16700-16701 hand-written Eevee name tricks and Tyrogue IV rule; 16711 `key==='tyrogue'`; 16713 `key !== 'eevee'`; 16722/16740 `key !== 'burmy'` form exception (duplicated check); 16726 Hitmonlee/Hitmonchan/Hitmontop names; 16586-16595 prompt text "Wurmple" at 17586.
5. 16928, 16931, 16951 swallowed exceptions in `eventMoveWorth`; 17878 second `cup.ban` check that `cupAllowsSpecies` already performs; 17872 `if (!cup || tableKey)`.
6. 17005 `rep.lk !== 'little'` skip rule; 17023 "last evolution of a CD line" rule; 17024 "the announced move wins".
7. 17247 `isContested && decision === 'powerup'` yields evolve claim; 17509-17511 AI failure falls back silently and `_candyAiSig` stays set so it never retries until the data changes.
8. 17597, 17692, 17694, 18556, 18759-18763, 18870, 18978, 19077, 19373-19379, 19379, 18491, 17759, 17769, 17776, 17779, 19034: 15 empty/near-empty `catch` blocks in this range.
9. 17363 weights 90/70 and level>=35 repeated as a filter and as a score (same predicate twice).
10. 17888-17895 `ck = cp>=10000 || !cp ? 10000 : cp`; 17896 `'cup:mega@'+ck` then fallback `'mega'`.
11. 18157 drift rule `>=2` power-ups; 18174 score floor 150.
12. 18635 `setTimeout(closeDetail, 210)`, 18672 `180`, 18832 long-press 480 ms, 18775-18776 constants; 21009 minute bucketing.
13. 19260 `'14px 14px 0 0'` row radius when manual IV box is open; 20512-20521 per-breakpoint sheet radius/animation strings.
14. 19322-19323, 19609-19610 personality string rewrites (`'.'->'!'` + uppercase; "Data follows").
15. 20336 sync mechanics module from state in render.
16. 20810/20825 default cut target 300 twice; 20762 `REC_BUFFER=50`, 20773 `max(20, ...)`.
17. 20917-20920 per-key quota arithmetic; 21741 sync alert regex.
18. 21200 `canRetryVideo` reads two instance fields.
19. 21245 `_evolveSkipped/_evolveHeld`.
20. 21563 vs 21629: effectiveness label ladder copied three times; third copy lacks `DOUBLE RESISTED` (21629, `<= 0.65` merges two bands).
21. 21615 note with "Nov 2026" date; 21580 hard-coded Max Particle rules.
22. `chatMentionLines` call wrapped in try/catch (18491); `localStorage` try/catch x7.
23. 18388 shadow count via raw check, 18399 hundo/nundo and 18397 Kanto 1..151 re-derived (also 20288-20293).

## 3. Redesign (decision log)

Ordered by leverage (problems removed).

- **A. One Pokemon-card view-model helper, plus small shared formatters (`formName`, `titleCase`, `leagueName`, `plural`, `pct`, `stop(fn)`).** Returns `{displayName, spriteRef, badgeColor, initial}` once; every list adds its own fields.
  - H1 (29 sites, 19213-21629)
  - title-case lambdas: 16870, 17882, 17922, 17925, 18019, 18090, 18185, 18252, 19368, 19399, 19408, 19479, 20047, 20078, 20893 (14)
  - H3 `Ultra/Great` ternaries (7 sites)
  - N2 `(e && e.stopPropagation) e.stopPropagation()` x13 (19268-19285, 19654, 19667, 20349)
  - `fmt`/`toLocaleString` duplicates 19831, 20375, 20952, 21575
- **B. Constants module in `pokemon-mechanics.js` (single source) for league ids/caps/labels, tier order+weight, TM types, flag set, thresholds (transfer, borderline, pvp-ready, keep grades), chat caps, Gemini quotas.** Prose that quotes a threshold is built from the constant.
  - H3, H4, H5, H6, H7 (quota half), H18
  - 16745, 16755, 16880, 18095, 18152, 19344 (tier)
  - 17867, 17898, 17987, 19424, 19882, 19968 (leagues)
  - 18298 vs 19549 vs 19597 divergent transfer lists become one `transferCandidates(roster, {strict})`
  - 20802 grade prose, 21294 500 CP
  - 18328, 18347, 18468, 18481, 18485-18496 chat caps and prompt numbers
  - H2 flags: one `protectFlags(p)` replacing 17363/17365/17387/18214/19216/19843/20005; all raw `shadowPurified` checks use `isShadow` (6 sites)
- **C. Build the view-model per screen, only for the active screen.** Extend the existing `...(tab==='x' ? this.xVals() : {})` pattern to Today, PvP, Recs, Raid, Home, Import, detail sheet, first run; `renderValsInner` becomes shell + dispatch. Template names stay identical, so this is mechanical.
  - N1 (un-gated work incl. duplicate calls 21455/21466, 21479/21480, 21481/21482/21492, 21512-21528)
  - N2 trailing `|| ''` pass-throughs, boolean pairs, per-field handlers (collapse to `onField(key)` helpers where the template allows: resources, evo items, OCR fields, manual IV)
  - N3 (gblWeeks card building moves to `gblVals`)
  - S1 dead fields (`calloutLine`, `scanLine/Bg/Color`, `readerLine`, `hour`, `tierOrder`, `mergedForCounts`, `token`)
  - H14 `chatBubbleShow` becomes `overlayOpen()` shared with `statusBanner`; one tab registry feeds `barDefs`, `ICON`, chat label
  - H19 colour/radius strings: choice/segment lists (`pvpLevelChoices`, `gradeChips`, `candyLockChoices`, `protectChoices`, `zoomChoices`, `frZooms`, `frThemes`, `importModeOptions`, `leagueList`, `seasonPills`, `raidTypeChips`, `raidWeatherChips`, `rosterFilterChips`, `starOptions`, `dustModOptions`, `maxedOptions`, `stars` 21607) use one `choice(list, isOn, onPick)` that emits a state, and the template/CSS maps state to tokens (removes the 11 hex and 8 white/#fff from logic; guarded by UIQ-01/02)
  - 20494-20500 notice precedence chain becomes one notice slot (`csvError`, `themeToast`, `undoLabel`, `csvNotice`, `aiQuotaNote`); also removes `csvError` abuse for the log import error (19063)
- **D. One AI job runner: `runAiJob({key, signature, build, parse, apply})`** with busy guard, signature de-dupe, `extractJsonArray`, and a typed error (`kind: quota|key|network|truncated|other`) thrown by `completeWithRetry`.
  - N10 (three jobs), S6
  - H7 error taxonomy: 16523, 16571, 18506-18512 become `switch(e.kind)`
  - 17415/17490 naive parsers; 16516 pacing from the quota constant
  - H11 first half: AI start moves out of `dustPlan` (17237) into an effect after render
  - H15 prompts built in one file with real `\n` and `\u2014` (16586-16595, 17393, 21762)
- **E. Derived selectors take explicit inputs and are pure; `evolveQueue` returns `{rows, skipped, held}`; `detailPoke` becomes `detailIdx` + derived record.**
  - H11 (20336 effect in `componentDidUpdate`, 21245 counters, 21200/21531-21539 instance fields to state or a store)
  - H9 five patch sites + 18956 reset list
  - H8 single `evoTableMerged()` used by `evoRecordFor` and `evolveQueue`, memo key includes `evoTable`
  - N4 `dustPlan` gets `(budget, skipSet)` internal, public API takes none; N7 one lazy `keepContext` per render
  - H12 the name list becomes a decorator at definition (`@memo`) so a method cannot be forgotten
- **F. Gesture helper `dragAxis(el, {axis, commit, settle})`** with shared thresholds/easing constants, durations read from CSS custom properties.
  - N9 (18578, 18651, 18766), S2 `_swipeTrace` removed, S3 getter, H14 `136`/aria selector (read reveal width from the row element)
  - 18582-18589 settle workaround kept inside the helper
- **G. Persistence by declaration.** State keys carry `{sync, restore, localOnly}` once; one `commit(patch)` replaces the `saveTriage/pushCloud/queueCloudPush/clearTimeout` variants, and the sync/drift key lists (4745, 5658, 21758) derive from it.
  - H10 (10 `pushCloud`, 5 `saveTriage`, 3 `queueCloudPush` sites in range), 21758 drift warning becomes impossible
  - H17 `storage.get/set(key)` wrapper with try/catch once: 7 `localStorage` sites and 15 empty catches in range
  - N11 `loadJson(url, cacheKey, validate)` for feed/eventmoves/feed_check/promo
- **H. Cleanups that need no design:** remove dead fields (S1), identity no-op 18009, the unused `try/catch(clearTimeout)`, `megaLine`; move `megaReadyPicks` into the test; decide fate of the manual event planner (S5); repair `accent(75, .15)` arguments; consolidate "ivs all present" predicate (21024, 21031, 21047); `effLabel` ladder once (21563, 21623, 21629); tab-pair styles via helper (20202-20207).
  - S1, S2, S3, S5, special cases 20, 22
- **I. Event/evolve special cases as data.** Eevee/Tyrogue/Burmy rules (16700-16726) go to `EVOLUTION_BRANCHES` generation (`scripts/import_evolution_branches.py`) as `rule` fields, removing three hard-coded species names from the component.
  - special case 4; H8

## 4. Comments to remove

Remove only if the code reads without them. None of these is grepped by a test or the build (checked: `grep` of scripts/ for the phrases found only `iOS design layer`, which is outside this range). Candidates (restate code, narrate history, or are detached from the code they sit on):

Detached or misplaced (move or drop):
- 16768-16771 (describes `evolvesToName` body, sits above `evolveBlocked`)
- 16864-16868 (describes `evolveQueue`, sits above `evolveValueOf`)
- 17338-17349 (describes `tmAiCandidates`, sits above `bestGreatUltraRank`)
- 17577-17579 (describes `markEvolveDone`, sits above `askBranchPick`)
- 17709-17710 (describes `verdictFor`, sits above `buddyPlan`)
- 17802-17805 and 17847-17849 (swapped, describe `leagueTopSpecies`/`cupAllowsSpecies`)
- 18068 ("there is no event feed to read": false, a feed exists)
- 18573-18577 (mentions header arrows/navigation, belongs to `navigateDetail`)
- 18726 ("bindPullToRefresh() above": it is not above)

Restate code (remove):
- 16521-16522, 16549-16550, 16990 (end), 16996, 17001-17003 style one-liners; 17082-17086, 17116, 17118, 17123-17124, 17135-17136, 17140-17142, 17154-17155, 17159 (each says what the next line does)
- 17216-17221, 17244-17246, 17251 (narrate `dustPlan` body)
- 17358-17362, 17422-17424, 17428-17432 (narrate filter/verify)
- 18233-18235, 18305-18307, 18619-18620, 18627, 18667-18668, 18688, 18840, 18847, 18806
- 19151-19152, 19182-19183 (keep 19182: explains ascending order), 19329-19330, 19361, 19449, 19522
- 19879-19881, 19895, 19907-19908, 19911, 20194-20196, 20312-20314, 20354-20356, 20384-20386, 20414-20415, 20440, 20757-20760, 21140-21141, 21158-21159, 21214-21215, 21222-21224, 21234-21235, 21286-21287, 21380-21381, 21561-21562, 21716-21719

History or bug narration (the fix is in the code; remove):
- 18331-18334 ("used to"), 18405-18409, 18435-18443, 18470-18477, 18582-18584 (keep one line: Safari rasterises transformed text soft), 20141-20145, 21738-21740

Keep (explain something outside the code): 16503-16505 (Gemini output budget), 16511-16513 (10 req/min free tier), 16557-16558, 17748-17749 (feed written by workflow from mirrors), 18550-18552 (iOS Safari has no vibration), 18726-18734 (why window-level delegation, minus the "above" pointer), 18867-18869 (runtime may swap instance), 19278-19283 (iOS PWA `confirm`), 20034-20039 (HTML parser relocates `<option>`), 20515-20517 (Dynamic Island band), 21747-21757, 16984-16987 (event rules), 17011-17012.

Count: about 60 comment blocks (about 150 lines) are candidates; 9 are misplaced.

## 5. Tests to remove or fix

No test in this range's own gates (UIQ-*, PWA-*, SEC/CSP/SRI) is proposed for removal. Findings are about tests that touch this area:

- `scripts/test_roster_logic.js:745` extractor list and `:886`/`:897` `megaReadyPicks`: not a "remove", a fix. The test rebuilds methods from signature text and stubs a missing `cupBuildRows` (`ctx.cupBuildRows = () => []`, "pre-existing gap"). After redesign C/E (methods become modules) switch it to import real functions, then delete the extractor shim. Guarded elsewhere: `megaReadyData` behaviour is the same rows the Today cards use; keep the Sableye/Beedrill assertions (they guard a rule), re-point them at `megaReadyData(...).map(x => x.text)`.
- The "nothing short means no buddy row" and "km to finish" cases (`test_roster_logic.js:735-738`) overwrite `ctx.evoInfoFor` with a stub returning the same numbers the assertion checks: they test the stub arithmetic for `short x km`, which is the one line of `buddyPlan` (17742). Keep the km case, the second is the same code path as the first (duplicate): candidate to fold into one.
- No disabled/skipped tests were found by grep in the files covering this range (`test_roster_logic.js`, `test_ranking.js`, `test_max.js`, `test_event_moves.py`, `test_evolution_branches.py`, `qa_e2e_b.js`, `qa_e2e_c.js`); I did not run the suites (read-only survey). I could not identify tests that provably cannot fail without running mutation checks; recommend a mutation pass over `evolveQueue`, `dustAllocator`, `cupBuildRows`, `gblWeeks`, `chatMentionLines`, `verdictFor` before removing anything: those six functions have no direct unit test in `scripts/` (only `qa_e2e_b/c` through the UI, and `megaReadyData`/`cupAllows*` through `test_roster_logic.js`).

## 6. Ranked fix plan

| # | Fix | Problems removed | Risk | Guarded by | Mechanical? | Size |
|---|-----|------------------|------|------------|-------------|------|
| 1 | C. Per-screen view-model builders, gated by tab | N1, N2, N3, S1, H14, H19 part, special cases 13-14 | med (template key names must not change; render cost changes) | suites a-e, `smoke_render.js`, UIQ-01/02 | yes (move code, keep keys), do per screen | L, about 2,700 lines moved, about 12 steps |
| 2 | A. Card/format helpers | H1, title-case x14, ternaries x7, stopPropagation x13, fmt x4 | low | suites a-e, `test_roster_logic.js`, `smoke_render.js` | yes | M, about 200 sites, 1 step |
| 3 | B. Constants (leagues, tiers, TM, flags, thresholds, chat caps) | H2-H7, H18, special cases 9, 11, 16, 17 | med (thresholds must stay identical; the two transfer lists differ today, pick the stricter or keep both named) | `test_roster_logic.js`, `test_ranking.js`, `fuzz_keep.js`, qa b/c | partly: first move literals unchanged, later unify the two transfer lists | M |
| 4 | D. AI job runner and typed errors | N10, S6, H7, H15, H11 (AI half), special cases 1-2, 7 | med (network paths, error copy tests) | qa e2e with `pvp_tiers_pinned.json`, `test_gemini_pool.py`, `test_push_*` unaffected; add a test for each `kind` | partly | M |
| 5 | E. Pure selectors + `detailIdx` + merged evo table | H8, H9, H11, H12, N4, N5, N7 | high (detail sheet, caches, undo) | suites a-e, `test_roster_logic.js`, `test_max.js`, UIQ | no (behaviour-visible at edges) | L |
| 6 | G. Persistence by declaration + storage wrapper + `loadJson` | H10, H17, N11, 15 empty catches | med (sync/restore key lists, cloud writes) | `test_firestore_rules.js`, qa suite d (sync), snapshot restore tests | partly | M |
| 7 | F. Gesture helper | N9, S2, S3, H14 (136 px, aria selector) | med (device-only gestures; WebKit run covers touch) | qa e2e on Chromium and WebKit, swipe cases | partly | M |
| 8 | H. Dead-code and cleanup list | S1, S3, S4, S5 (needs owner decision), special cases 20, 22 | low | `test_bundles_current.py`, suites a-e (remove `megaReadyPicks` only with the test re-pointed) | yes | S |
| 9 | I. Evolution special cases as data | special case 4, H8 | low-med | `test_evolution_branches.py`, `test_roster_logic.js` | yes | S |
| 10 | Comment pass (section 4) | about 60 blocks | low | none needed; `index.html` size only drops (PWA-12) | yes | S |

Standing constraints for all steps: edit only the `.dc.html` and `pokemon-mechanics.js`; rebuild with `scripts/build_bundles.py`; `index.html` <= 1.7 MB (PWA-12: fixes 1, 2, 10 shrink it, 3, 4, 6 are size-neutral); no new network hosts (H17 keeps the one raw.githubusercontent fallback unchanged); radii/type-scale pins stay in CSS (fix 1 moves two radius strings out of JS).

Counts: 37 problems listed (19 hidden, 11 needless, 7 surplus, the surplus items containing 30+ individual dead items), 23 special cases, about 60 comment blocks (9 misplaced), 3 test items (0 removals proposed, 2 fixes, 1 duplicate to fold).
