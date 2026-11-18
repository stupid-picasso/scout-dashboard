# Untangle survey dc-1: `Scout Dashboard.dc.html` lines 1-5500

Scope: head and CSP (1-33), `<style>` (34-391), markup templates (396-4292), class script start: props, `state`, `componentDidMount`, accessibility, device copy, Firebase boot, sign-in, first run, secrets, `applyRemote` (4293-5500). Read-only survey at d697877. Line numbers are of the source file at that commit. "x-range" marks a link whose other end is outside 1-5500.

Method: whole style block and script range read; markup region read at the structural level (sheets, first run, sign-in, nav, all top-level `sc-if`) plus scripted counts over all 3,896 markup lines (inline styles, tokens, handlers, z-index, dead bindings).

## 1. Problems list

Kinds: H = hidden link, N = needless link, S = surplus.

### Tokens and CSS (34-391)
- P1 H `204-222` and `226-242`: the light palette is written twice, byte for byte (the media-query copy and the `[data-theme=light]` copy). PROJECT_HANDOFF already says "edit both". Nothing enforces it.
- P2 H `229` vs `4547-4553, 7252-7258`: `applyTheme` hardcodes `theme-color` `#f2f2f5` / `#0b0b0d`, and the head has `#000000` (line 22). The real page colours are `--bg` `#0c1b1f` / `#eef5ea` (182, 206). The browser chrome colour no longer follows the tokens (x-range 7252).
- P3 H `--r-pill` is used 107 times but defined only in `ds/tokens/radii.css`, not in the "ONE source of truth" token block (168-203). Same for `--shadow-pop` (478, 2504) and `--border-card`. `--r-sm` (10px) and `--r-lg` (20px) here silently override `ds/` values (8px, 22px). The `--type-grass/-fire/...` set exists only in the light blocks (218-219); dark takes them from `ds/tokens/colors.css`. The source file cannot be understood or changed without the `ds/` files.
- P4 H `1053`: `var(--ios-orange, #d97706)`. `--ios-orange` is defined nowhere, so a fixed hex is used in both themes. 38 hex and 32 `rgba/oklch` literals sit in inline styles (markup), outside tokens.
- P5 S 32 tokens are defined and never read through `var()`: `--s-1..--s-6`, `--t-display..--t-num` (8), `--r-xs`, `--dur-sheet`, `--dur-slow`, `--ease-in-out`, `--e0`, `--info`, `--pink`, `--warn`, `--surface`, `--accent-on-fill`, `--amber-text`, `--cyan-text`, `--green-text`, `--type-bug/-grass/-ground/-ice/-normal/-rock/-steel`. The type scale and spacing scale exist only as numbers in comments (172-175) and in the test constants (qa_e2e_e.js:23-26 `SIZES`, `RADII`, `MOTION_MS`). 2,244 inline styles hardcode `font:13px`, `padding:8px`, `border-radius:10px` instead.
- P6 S/N alias layers with identical values: `--ink-900` and `--ink-700` are both `--text` (198, 72 uses of -700); `--ink-600/-500` both `--text-2`; `--ink-400/-300` both `--text-3`; `--surface-card` = `--surface` = `--surface-1`; `--r-lg` = `--r-xl` (177); `--surface-muted` = `--surface-3` = `--muted`; `--grass-500/-600/-700` all `--good` (200) except light `--grass-500` (221). Names from three eras (`--ios-*`, `--grass-*`, `--ink-*`) all alive; 94 `ios-` occurrences in a design that "replaced the iOS design layer" (163).
- P7 H `163` + `scripts/build_bundles.py:22`: the build finds the style block by the English phrase "iOS design layer" in a comment. The comment says that layer was replaced. Keep the phrase (project rule), but it is a hidden link carried by prose.
- P8 H 53 attribute selectors `[style*="..."]` and 142 `!important` (248-272, 282, 301-306, 347, 362-363, 376). CSS restyles markup by matching the serialised inline style string (comment 247). Edit an inline style in markup and the matching rule stops matching, silently.
  - `305-306`: inline `color:var(--type-electric)` renders as `--ink-900`; inline `background:var(--type-electric)` renders as accent fill. Markup says yellow, screen shows white or teal.
  - `255`: inline field styles (`padding:8px 8px;border-radius:6px;border:1px solid`, 30 copies at markup) are overridden with `!important` to a 999px capsule. The inline radius/border/padding are dead.
  - `282` matches only the three scrims containing `blur(6px)` (550, 676, 691) and replaces their inline `background:oklch(12% .. /.82)` with `rgba(0,0,0,.45)`. The inline background is dead. The import-sheet and More scrims (519, 534) use `blur(8px)` and `.4/.5` and are not matched.
  - `267, 268, 269, 306, 347, 358` restate the same accent-fill rule six times; `271` and `272` split one rule.
- P9 H `288` and `290` + `20685`: `.app-root:not(.tab-today) .stat-strip{display:none}` hides the stat strip (markup 469-475) on every other tab; `.no-roster:is(.tab-today,.tab-roster,.tab-pvp,.tab-recommend) [role=main] > :not([data-empty-state])` hides all tab content except one empty-state child. Four classes `tab-*` exist only in a string built at 20685 and in these selectors. Markup `rosterEmpty` blocks (706, 2316, 3010, 3541) must put the empty state as a direct child of `[role=main]` (705, 2315 ...) or it is hidden too. The stat strip's data is computed and rendered on every tab, then hidden.
- P10 S dead CSS: keyframes `flipIn` (67), `cardPop` (68), `sheenSweep` (71), `auraBreathe` (72), `ambientDrift` (74), `spritePop` (95), `heroSpin` (153) are used nowhere. The `@media (hover:none){}` block at 147-149 is empty (comment 146 above it). `heroFloat/heroShadow/heroPop/scanSweep` (150-157) have no use outside their own definition (count 1 in markup+script means the name appears once; verify before deleting).
- P11 S duplicated rules: `:focus-visible` at ~108 (2px) and 276 (3px) and 364; `::-webkit-scrollbar` 61 (9px) and 311 (0); `html{background}` at 36, 112, 244, 340; `body{background}` at 32, 245, 340; `.ui-btn-tint` at 292 and 348; `.om-press` / press rule at 74-75 (`button:not(.om-press)`), 121, 135, 278-279 (three press systems, comment 119 says "one press rule").
- P12 N motion values are literals: `0.24s`, `0.36s`, `0.52s`, `cubic-bezier(.22,1,.36,1)` repeated across 37-110, while `--dur-*` and `--ease-*` (179-180) are used in only a few rules. The JS side repeats them again at 20518-20520 (`sheetUp .36s cubic-bezier(.32,.72,0,1)`), which equals `--dur-sheet` and `--ease-spring` by copy only. UIQ test constant `MOTION_MS` (qa_e2e_e.js:27) is a third copy.

### Markup (396-4292)
- P13 H three sheet/scrim recipes, eight modal bodies: chat 489-491, More 518-520, import sheet 533-535, file fallback 549-551, first run 566-567, confirm 675-677, carry prompt 690-692, detail sheet 2502-2504 (x-range owner of detail). Each carries its own scrim (blur 6/8/28px, three alphas), radius (`var(--r-xl)`, `20px`, `{{ sheetRadius }}`), animation (`sheetUp .24s`, `.36s`, vm `sheetAnim`), padding and max-width 560. z-index values form an unwritten ladder: 20, 30, 40, 45, 46, 50, 52, 53, 58, 59, 60, 62, 65, 68, 70 (CSS 297), 80, 90. Choosing a layer means reading every other.
- P14 H `4842-4846` (x-link to P13): Escape closes only detail, confirm and first run. The chat sheet (491), import sheet (535) and file fallback (551) are `aria-modal` dialogs with no Escape path, and line 4845 calls `closeConfirm` for any dialog. Every new dialog must be added to this if-chain by hand. Only first run handles the system back gesture (5314-5318).
- P15 H `4778-4856` `enhanceAccessibility`: a MutationObserver over `document.body` patches markup after render: adds `role=button` and `tabindex` to any `[style*="cursor: pointer"]` (4804), derives `aria-label` from `innerText` (4810), invents field labels from the previous sibling (4786-4795). Cause: 174 `<div onClick>` against 154 `<button onClick>` in markup (e.g. 587-588, 663-664, 1437). The a11y of a control depends on matching the inline style string `cursor: pointer` (P8).
- P16 S/H sign-in UI exists twice: first run 579-593 and settings 1409-1431 (email field, password field, SIGN IN, CREATE ACCOUNT, error). Differences are accidental ("Use email" vs "Use email instead", `ui-btn-fill` vs `ui-btn-tint`, settings shows `authNotice` and a help line, first run does not). A fix to one (for example showing `authNotice`) misses the other; CSS `381-382` styles only the settings copy.
- P17 S 373 `sc-if` and 170 `sc-for` carry 543 `hint-placeholder-*` attributes (about 20 KB of source). `support.js` mentions them twice; the runtime does not need them to render. Verify against `support.js` before removing (design-tool hint only).
- P18 H tab identity is written in five places: `barDefs/moreDefs` (20470-20475), 14 `isX: tab === '...'` booleans (20537-20554), `goToTab`, `rootEmptyClass` (20685), and `tab-*` selectors (P9). Adding a tab needs all five.
- P19 N layout is decided in three places with three thresholds: JS `isMobile = viewportWidth < 640` (20352), CSS `@media (min-width:700px)` (55), `(max-width:520px)` (324), `(max-width:360px)` (294, 335). Between 640 and 700 the JS says desktop paddings (`40px`) while CSS says phone width.
- P20 H `viewportWidth` has two writers with different meanings: `window.innerWidth` (4638, 4719 resize handler) and the root element's content-box width via ResizeObserver (4715-4721, `contentRect` excludes padding, 28px less). Near 640 the two disagree and the second setState (needs > 4px difference) flips `isMobile` back and forth.
- P21 S view-model keys with no markup use: `headerWrap`, `headerActionsBasis`, `syncLabelWidth` (20528-20530, x-range), `needsFirebaseConfig`, `firebaseConfigDraft`, `onFirebaseConfigChange`, `saveFirebaseConfig`, `firebaseConfigError`, `hasFirebaseNoUser` (21657-21662, x-range).
- P22 S `data-props` personality / accentColor / density (4293-4297) and their consumers (19142-19147, 19322-19323, 19609-19610, 20526-20527; x-range): the PWA never passes props, so `hype`, `deadpan`, the 5-colour `TOKEN_BY_ACCENT` map and the compact density branch are unreachable in the product. No test refers to them.
- P23 N `stat-strip`, `ios-nav`, `ios-toast`, `ios-icon-btn` are rendered by classes defined only in this CSS and used by name in tests (`SCAN` in qa_e2e_e.js, `qa_lib.js` helpers); renaming `ios-*` (P6) needs the tests changed too (x-range).

### Script start, boot, auth (4293-5500)
- P24 H four lists of "what is synced" that disagree:
  - `SYNC_KEYS` 4743-4745: has `ocrAutoApply`, lacks `chatMessages`.
  - `buildCloudBlob` 5769-5780 (x-range 5767): has `chatMessages`, lacks `ocrAutoApply`.
  - `applyRemote` patch 5433-5464: has `chatMessages`, lacks `ocrAutoApply`, so `ocrAutoApply` is watched for change but never saved or restored.
  - `EMPTY_USER_DATA` 5152-5164: lacks `moveDB`, `evoTable`, `candyAiDecisions`, `chatMessages`, `triageKeep`, `transferQueue`, `trainerLevel`, `dustReserve`, `ocrAutoApply`. After sign-out (5203) or account switch (5190) those keep the previous account's values on screen. A switch is protected only because `applyRemote` later overwrites them; the sign-out path and the carry prompt (5281) wait with the old values showing. DATA-03 (qa_e2e_d.js:462-471) asserts roster and addedPokemon only.
  - `state` defaults 4300-4523 repeat the same shapes a fifth time.
- P25 H default objects copied: `resources` 4448, 4449, 5157, 5449; `evolutionItems` 4450, 5161, 5450; `cutTarget` 300 at 4455, 5160, 5453; `pvpMaxLevel` 50 at 4457, 5160, 5454. Adding one TM or stone type means editing each.
- P26 H secret field list written twice: `['githubToken','geminiKey','geminiKeys','apiEndpoint']` at 4885 and `SECRET_CLOUD_FIELDS` 5380; the stored set at 5368 is a third list (without `apiEndpoint`).
- P27 H account switch resets by hand: `forgetAccount` 5169-5177 plus 5190, 5199-5203 set about 25 underscore fields (`_carry`, `_carryRemote`, `_hydrated`, `_dirtyUntilPush`, `_writeInFlight`, `_writeGen`, `_lastBlobBytes`, `_lastSnapshotAt`, `_snapIndex`, `_docExists`, `_lastSyncSig`, `_lastSyncRefs`, `_pendingCred`, `_pendingEmail`, `_pendingProvider`, `_deleting`, `_localSaveOff` ...). A new sync flag that is not added there leaks across accounts. The flags live on `this`, invisible to the state list.
- P28 H boot ordering is by timers and comments: `authSettled` must run before `restoreLocalSnapshot` (comment 4947-4948), enforced by `setTimeout(...,6000)` (4582) and `setTimeout(...,0)` (4952); `restoreLocalSnapshot` toggles `_hydrated` true then `setTimeout(..., 400)` resets it (4903-4905). Seven independent launch timers: 900 (4571), 3500 (4570), 4000 (4577), 5000 (4574), 6000 (4568), 6000 (4582), 9000 (4575).
- P29 S ~45 hand-written `try { localStorage... } catch (e) {}` reads/writes in `componentDidMount` (4545-4578), one per key; 39 empty `catch (e) {}` in 4293-5500. About 35 distinct `scout.*` keys across the file, several read and written from 3-4 sites (`scout.firstRun.v1` 4x, `scout.secrets.v1` 4x, `scout.carryPending` 3x).
- P30 S `waitForGlobal` 4527-4537: generic (`prop`, `evt` parameters) for one caller (4628), and does both an event listener and a 50 ms poll for up to 30 s. `pokemon-mechanics.js:6065` dispatches the event; the `window[prop]` check before listening already covers a late listener, so the poll adds nothing except a 30 s ceiling (x-range).
- P31 H update detection twice: `controllerchange` (4589) and a fetch of `sw.js` parsed with `/scout-v(\d+)/` (4599). The second depends on the cache name format written by `build_bundles.py --bump` / `propagate_edits.py:694-697` (x-range); nothing tests the pair.
- P32 H three separate `visibilitychange` listeners in boot (4576, 4591, 4602) plus 5243; `componentWillUnmount` 4702-4713 clears none of `_remindTimer` (4573), `_buildTimer` (4603), the visibility, popstate (5317), touch (4686-4689) or MutationObserver (4817, 4837) subscriptions. Harmless while the root never unmounts; a hidden rule that it never does.
- P33 S dead config path: `onFirebaseConfigChange` 4979, `saveFirebaseConfig` 4983-5005, state `firebaseConfigDraft` 4483 / `firebaseConfigured` 4482 (read only by dead keys), `new Function` rationale comment 4987-4989. No markup reads any of it (P21).
- P34 S write-only or unread state: `authLink` (declared 4488, written 5040, 5107, 5203, never read), `ocrHp` (4427, declared only), `firebaseConfigError` (set at 4957, 4962, 4966, 4974, 4999-5003 but displayed nowhere). If the Firebase SDK fails to load (offline first launch, blocked host) the user sees nothing until they tap sign-in and get the generic "not ready" text.
- P35 N sign-in error handling: `startSocial` 5025-5027 and `linkProvider` 5079-5081 each wrap `signInWithPopup` in try/catch and `.catch` for the same handler; the "Sign-in is not ready" message is written three times with different wording (5021, 5133, 5140); `signIn` and `signUp` (5132-5144) differ only in the SDK method. `handleAuthError` 5031-5058 is a code-to-message if-chain with a branch per code.
- P36 N `restoreLocalSnapshot` (4892-4908) calls `applyRemote(blob)` is reused for the device copy and then undone by the 400 ms reset (4902-4905): `applyRemote` has two jobs (apply remote vs apply device) selected by a timer rather than a parameter. `applyRemote(raw, opts)` already takes `opts` (5409) for secrets only.
- P37 H `5188` one-line pending-carry restore reaches into `scout.carryPending` and `localCopyKey(null)` directly; the same two keys are removed in `dropPlainCopy` 5207 and set in `offerCarry` 5216. Four sites share one protocol (carry flag + plain key) with no single owner.
- P38 N `setUiZoom` 4860-4864 sets non-standard `document.documentElement.style.zoom`; the QA scans (UIQ) measure sizes under it. Two preset lists `zoomChoices` (21474) and `frZooms` (21700) repeat `[1, 1.15, 1.3, 1.5, 2]` and `uiZoom` bounds `1..2` at 4578 and 4861 (x-range for lists).
- P39 N `enhanceAccessibility` Escape handler (4840-4847) and `closeConfirm` couple the a11y layer to state names `detailPoke`, `pendingConfirm`, `firstRunOpen`, `carryPrompt` (P14); a UI layer that should be generic imports the volatile app state.
- P40 H CSP: line 5 is generated by `scripts/build_index.js` (CSP array at 21-35, `OTHER_PAGES` includes the source itself) but sits in the hand-edited "single source". Not enforced against hand edit except `test_csp.js` reading the built `index.html`. Low risk, listed for completeness.

## 2. Special cases (code for one situation)

- SC1 `4373` `todayTailOpen` initial value reads `window.__todayTailOpen` (QA flag in product code); `4295` `window.__noFirstRun` (5295); both are test hooks the product consults.
- SC2 `4545-4578` one `try/catch` per localStorage key (about 45 swallowed exceptions); `4551-4559` each with its own validation branch.
- SC3 `4568-4582` the seven startup timers (P28).
- SC4 `4905` `setTimeout(... _hydrated = false, 400)`: waits and hopes `applyRemote` has settled.
- SC5 `4952` `setTimeout(() => restoreLocalSnapshot(), 0)` defers one tick so ordering works.
- SC6 `4533-4535` 50 ms poll with 600-try ceiling.
- SC7 `4842-4846` per-dialog Escape branches; `4845` fallback `closeConfirm()`.
- SC8 `4811` label only when text length is at most 80; `4791` previous-sibling text under 60 chars.
- SC9 `5036` two auth codes treated as "not an error"; `5037, 5045, 5050-5056` one branch per code (9 codes); `5093-5098` per-link-error branches.
- SC10 `5188` special pending-carry restore branch after the page was closed with the question open.
- SC11 `5454` `[40, 50, 51].includes(remote.pvpMaxLevel)`: allowed values written inline; `5457, 5462, 5463` three fields fall back to current state while others fall back to a constant.
- SC12 `5415` `_unpackFailed` early return (the one case where remote is ignored).
- SC13 `5262-5263` and `5275`: listener skips `hasPendingWrites`, `document.hidden`, `_cloudUid !== uid`.
- SC14 `143` forces `font-size:17px !important` on inputs under `hover:none` (iOS zoom workaround; outside fact, keep but note it fights `255`).
- SC15 `134` `touch-action:pan-y !important` for swipe rows (outside fact).
- SC16 `4861` zoom clamps; `4654-4655` PTR thresholds as magic numbers.
- SC17 CSS `330-331, 361` `.rg-cell` special-cases the roster grid cell row.
- SC18 `1053` colour fallback `#d97706` for undefined token (P4).

## 3. Redesign (decision log)

Ranked by problems removed. Each fix: risk, guard tests, mechanical?, size.

- **F1. One field table for everything persisted: `{ name, default, sync, packed, secret }`.** `SYNC_KEYS`, `buildCloudBlob`, `applyRemote`'s patch, `EMPTY_USER_DATA`, the `state` defaults, the secret-field lists and the `resources`/`evolutionItems` defaults are all derived from it. Fixes the `ocrAutoApply` and `chatMessages` mismatch, the stale-account fields after sign-out, and makes a new synced field a one-line change.
  - P24 four lists disagree (4743, 5152, 5433, 5769).
  - P25 default objects copied 3-4 times (4448-4450, 5157, 5161, 5449-5450, 4455, 5160, 5453).
  - P26 secret list written 3 times (4885, 5368, 5380).
  - SC11 mixed fall-back rules at 5454-5463.
  - P27 (part) hand-reset flags can be reduced to `fields.filter(sync).forEach(reset)`.
  - Risk: med (cloud schema compatibility: keep `chatMessages` slice(-60) and `PACKED_KEYS`; do not rename stored keys; add `ocrAutoApply` to the blob as a decision, not by accident). Guards: SYNC-01/02, DATA-01..03, AUTH-*, `test_roster_logic.js`, `test_firestore_rules.js`. Extend DATA-03 to assert chat and `moveDB` are empty after sign-out. Mechanical: the derivation yes; the `ocrAutoApply` decision is behaviour. Size: M (about 150 lines touched, 5 spots).

- **F2. Style roles as classes, then delete the attribute-selector overrides.** Define `.card`, `.chip`, `.field`, `.btn-fill`, `.btn-tint`, `.btn-plain`, `.section-label`, `.scrim`, `.sheet`, `.icon-btn` once in CSS; markup uses the class and keeps only layout inline. The `[style*=]` rules, the `!important` pile and the dead inline declarations go. Do it one role at a time, screenshot-diffing with `scripts/qa/ui_shots.js`.
  - P8 53 selectors and 142 `!important`, including dead inline radius/background (255, 282, 305-306).
  - P11 duplicated rules (focus, scrollbar, html/body background, ui-btn-tint, press) fall out when each role has one rule.
  - P12 motion literals replaced by `--dur-*` / `--ease-*` inside the role rules.
  - P5 (part) the type/spacing tokens finally get consumers; remaining unused tokens deleted.
  - P6 alias layers collapse to one name per value (after F2 nothing needs `ink-700` vs `ink-900`).
  - P4 inline hex/rgba move into role classes or tokens (`--ios-orange` becomes `--warn`).
  - P23 `ios-*` class names renamed together with the test locators.
  - Risk: high (visual regressions; 2,244 inline styles, 1,222 distinct). Guards: UIQ-01/02 (radii/type pins), UIQ-07..29, UIQ checks on every screen, `smoke_render.js`, PWA-12 size (index.html at most 1.7 MB: classes should shrink it by about 100 KB of inline style). Mechanical: role-by-role yes (class swap plus delete rule), rendering diff must be zero at 390 and 320 in both themes. Size: L (4 to 6 stages).

- **F3. One `Sheet` mechanism: a stack in state, one scrim, one z-index list.** `state.sheets = [{id, onClose, modal}]`; one scrim and one `.sheet` class (phone: bottom sheet; wide: centred); `--z-*` tokens in one CSS block; Escape and the back gesture close the top entry; focus return and trap stay in the generic layer, which no longer imports `detailPoke/pendingConfirm/firstRunOpen`.
  - P13 eight bespoke scrims/sheets and the z-index ladder.
  - P14 Escape gaps (chat, import sheet, file fallback) and back gesture only for first run (5314-5318).
  - P39 a11y layer coupled to app state names (4840-4847).
  - P12 (part) `sheetAnim`, `sheetRadius`, `sheetMaxH` strings in the view-model (20513-20520) become CSS.
  - SC7 per-dialog Escape branches; SC8 none.
  - Risk: med-high (focus and scroll lock behaviour on iOS WebKit). Guards: UIQ sheet scans (`STATES` DETAIL/CHAT/MORE), qa_e2e a/b/c sheet tests, smoke_render detail sheet. Mechanical: no (behaviour changes for Escape and back). Size: M-L.

- **F4. Real controls in markup, remove runtime patching.** Convert the 174 `<div onClick>` to `<button type="button">` (or `<label>`/`<summary>`), give inputs `aria-label` in markup; keep `enhanceAccessibility` only for dialog focus (moved into F3).
  - P15 a11y added after render by matching `cursor: pointer` and `innerText`.
  - P8 (part) one more selector that depends on inline style text.
  - SC8 length caps on derived labels.
  - Risk: med (default button styling resets exist at 274; `text-align`, `display` changes). Guards: UIQ unnamed/small-target scans, a11y tests in suite e. Mechanical: yes per element, with zero visual diff via F2 classes. Size: M (174 sites).

- **F5. Account lifecycle as one object.** A small `session` record `{uid, carry, carryRemote, pendingCred, hydrated, dirty, inFlight, gen, ...}` created fresh on each account change instead of about 25 fields reset by hand; `applyRemote(raw, {source: 'remote'|'device'})` so the device copy no longer needs the 400 ms un-hydrate; one `signInWith(provider)` that returns the promise (handles the sync throw once); error text from a code-to-message table; one `carry` module owning `scout.carryPending` and the plain key.
  - P27 25 flags reset by hand (5169-5177, 5190, 5199-5203).
  - P28 / SC4 / SC5 ordering by timers (4582, 4905, 4952).
  - P35 duplicated sign-in code paths and message wording (5021-5027, 5079-5081, 5132-5144).
  - P36 `applyRemote` doing two jobs.
  - P37 carry protocol across four sites (5188, 5207, 5216).
  - SC9, SC10.
  - Risk: high (data-loss class; carry and delete-account flows). Guards: SYNC-*, DATA-01..03, AUTH-01..07, carry tests (qa_e2e_d.js:670-705), `test_firestore_rules.js`. Mechanical: no. Size: M-L. Do after F1.

- **F6. One device-preferences loader and one storage wrapper.** `prefs = [{key, state, parse, valid}]`, a single `loadDevicePrefs()` for `componentDidMount`; `store.get/set/remove` that is the only place a storage exception is swallowed (with the "storage blocked" case in one comment); a `onForeground(fn)` registry replaces four `visibilitychange` listeners; one `startup` list replaces seven timers with explicit order.
  - P29 45 try/catch lines and about 35 scattered key strings (4545-4578).
  - P28 / SC3 seven startup timers (4568-4582).
  - P32 listeners and timers not cleaned up (4573, 4603, 4576, 4591, 4602, 5243).
  - SC2.
  - Risk: low-med. Guards: all suites (boot every test); `test_csp.js` boot; PWA tests. Mechanical: yes (behaviour-preserving, same keys). Size: M.

- **F7. Tokens: one block, no `ds/` dependence, themes declared once.** Move `--r-pill`, `--shadow-pop` and the `--type-*` set into the in-file token block; delete `ds/` links from the source `<helmet>` (the bundles keep their own head); make `applyTheme` always write `data-theme` (the media listener already exists at 4549) and put a 3-line pre-paint script in `<head>` so the first frame is right; remove the media-query copy of the light palette. Derive `theme-color` from `--bg`. Make the UIQ constants read the tokens instead of repeating numbers.
  - P1 light palette twice (204-243).
  - P2 `theme-color` literals stale (4553-4556, 7252).
  - P3 tokens defined only in `ds/` and overridden `--r-sm/--r-lg`.
  - P5 unused tokens (delete or consume).
  - P12 (part) UIQ `MOTION_MS`/`SIZES`/`RADII` copies (qa_e2e_e.js:23-27).
  - Risk: med (first-paint flash in Auto theme; bundle head is generated and keeps `ds/` CSS). Guards: UIQ-01/02, theme tests, PWA-12, `test_bundles_current.py`. Mechanical: palette dedupe yes, `applyTheme` change no. Size: S-M.

- **F8. Route table drives tabs, classes and empty states.** `ROUTES = [{key, label, icon, slot: 'bar'|'more', header}]`; `isX` booleans become `tab === key` derived from it; the no-roster state is decided in markup (`sc-if`) so CSS no longer hides siblings, and the stat strip moves inside the `isToday` block.
  - P9 `tab-*` classes and `.no-roster` hiding (288, 290, 20685).
  - P18 tab identity in five places.
  - P19 / P20 (part) layout thresholds: add one `matchMedia('(max-width:639px)')` as the only source of `isMobile`; delete the ResizeObserver writer (4715-4721); CSS breakpoints 700/520/360 documented next to it.
  - P21 dead layout keys `headerWrap`, `headerActionsBasis`, `syncLabelWidth`.
  - Risk: med. Guards: smoke_render (every tab), UIQ on nine screens plus EXTRA, qa a-e. Mechanical: route table yes; stat strip move and breakpoint unification are small behaviour changes. Size: M.

- **F9. Delete what the product never varies or reaches.**
  - P22 `data-props` personality/accentColor/density and consumers (4293-4297; 19142-19147, 19322-19323, 19609-19610, 20526-20527).
  - P33 / P21 Firebase config entry path (4979-5005, state 4482-4484, vm 21657-21662).
  - P34 `authLink`, `ocrHp`; `firebaseConfigError` gets a visible home (a sign-in card line) instead of being deleted (an SDK failure should be seen).
  - P10 seven dead keyframes (67, 68, 71, 72, 74, 95, 153) and the empty media block (147-149); hero keyframes after a use check.
  - P30 / SC6 `waitForGlobal` becomes `await window.PokemonMechanicsReady` (a promise set in `pokemon-mechanics.js:6065`, x-range).
  - P17 `hint-placeholder-*` after checking `support.js`.
  - Risk: low (dead code), P30 and P17 low-med. Guards: smoke_render, `test_csp.js`, all suites; `test_bundles_current.py` after build. Mechanical: yes. Size: S.

- **F10. One sign-in block.** Render the sign-in/email form once from a descriptor (`sc-for` over provider buttons plus a shared email form) and use it in first run and settings; `authNotice` shown in both.
  - P16 duplicated sign-in markup (579-593 vs 1409-1431).
  - SC9 (part) error display parity.
  - Risk: low. Guards: AUTH-01..07, first-run tests (data-firstrun), settings `data-signin-card`. Mechanical: yes if the runtime allows a repeated partial; otherwise generate by `sc-for`. Size: S.

- **F11 (small, independent). Keep build-found phrase in one place.** Replace prose-matching (P7) with a stable marker line in the style block that both the comment and `build_bundles.py:22` name; P40 add a header comment saying line 5 is generated. Risk: low (build + `test_bundles_current.py`). Size: XS. Requires editing `MARK`, so only after the manager agrees; the phrase "iOS design layer" must stay until then.

## 4. Comments to remove

Checked with grep: no test or script greps these strings (`scripts/` search for "Waits up to 30", "never overwrite the copy", "Rubber-band", "Firestore is the only" returned nothing). Keep line 163 ("iOS design layer", build marker), 30-33 and 48-51 (iOS viewport facts), 114-115, 134 comment block 122-133 (explains an iOS gesture fact), 138-141, 4617-4618, 4648-4650, 4888 (storage blocked), 4912-4913 (SRI, `test_sri.js` and SECURITY.md rely on it), 5011-5012, 5265-5274 (Firestore latency-compensation fact).

Remove (restate code, stale, or orphaned):
- `117-118` orphan: states an iOS fact but no rule follows; next comment `119` also has no rule below it (two comments, zero code).
- `146` over the empty `@media` block (147-149); goes with the block (F9).
- `265` "Primary action: system blue capsule." (orphan, no rule follows; the app is not "system blue" any more).
- `283` "Nav icons and the iOS toast" (restates the next rule; naming is stale).
- `4526` "Waits up to 30 s: ..." (goes with `waitForGlobal`, F9).
- `4540-4541` "Bound before anything else..." (workaround note; goes with F6 boot list, whose order makes it visible).
- `4631-4633` "Nothing is cached on this device..." (false: device copy exists, 4866-4908).
- `4659`, `4668-4669`, `4671` PTR comments that restate the line below ("Only arm...", "Nothing happens at all...", "Rubber-band...").
- `4876` "never overwrite the copy before it was read" (restates the guard).
- `4895-4896`, `4903-4904` (workaround for the 400 ms reset; goes with F5).
- `4987-4989`, `4998` (dead config path, F9).
- `5030` "A plain sentence and a next step for every failure..." (restates the function).
- `5036` "Closing the window is a choice, not an error." (restates the `return`).
- `5167-5168` forgetAccount header (restates the name; keep the "nothing of one account" intent in the F5 module name).
- `5403-5408` "Firestore is the only source of truth - nothing on this device is ever treated as authoritative": contradicts the device copy (4866-4908) and `_dirtyUntilPush` (5418-5431). Stale; replace by the F1 field table comment.

Count: 14 candidates (some are groups of 2 to 3 lines).

## 5. Tests to remove or fix

No test in this range guards nothing: none proposed for removal.
- Do not remove: `test_sri.js` (SEC/SRI guard, static unless `SRI_VERIFY=1`; no network by default), `test_csp.js`, UIQ-01..29, PWA-12, AUTH-*, DATA-*, SYNC-*, carry tests (qa_e2e_d.js:670-705).
- Fix 1: `qa_e2e_e.js:23-27` (`SIZES`, `WEIGHTS`, `RADII`, `MOTION_MS`) repeat the token numbers (173, 177, 179). They are the pins (UIQ-01/02) so they stay, but read from the stylesheet tokens so one edit moves both (F7). Behaviour already guarded: the same scan on all screens.
- Fix 2: DATA-03 (`qa_e2e_d.js:462-471`) asserts only roster/addedPokemon are empty after sign-out; add `chatMessages`, `moveDB`, `candyAiDecisions`, `triageKeep`, `transferQueue` (guards P24).
- Add (not remove): a unit test that every synced field appears in `SYNC_KEYS`, blob, patch and empty-user lists (becomes trivial after F1).
- Count: 0 removals, 2 fixes, 1 addition.

## 6. Ranked fix plan

| Rank | Fix | Problems and special cases removed | Risk | Guard | Mechanical | Size |
|---|---|---|---|---|---|---|
| 1 | F2 style roles as classes | P4, P5, P6, P8, P11, P12, P23 (7 problems) | high | UIQ-*, smoke, qa a-e, PWA-12 | yes per role | L |
| 2 | F1 field table | P24, P25, P26, SC11, P27 part (4 problems, 1 special case, plus a real stale-data gap) | med | SYNC, DATA, AUTH, roster tests | derivation yes | M |
| 3 | F5 account lifecycle object | P27, P28, P35, P36, P37, SC4, SC5, SC9, SC10 (5 problems, 4 special cases) | high | SYNC, DATA, AUTH, carry tests | no | M-L |
| 4 | F3 one Sheet mechanism | P13, P14, P39, P12 part, SC7 (4 problems, 1 special case, 3 dialogs without Escape) | med-high | UIQ sheet states, qa a-c | no | M-L |
| 5 | F8 route table and layout source | P9, P18, P19, P20, P21 part (5 problems; fixes breakpoint flapping) | med | smoke, UIQ, qa a-e | mostly | M |
| 6 | F9 delete unreachable code | P10, P17, P21, P22, P30, P33, P34, SC6 (7 problems, 1 special case) | low | smoke, csp, all suites | yes | S |
| 7 | F6 prefs loader and storage wrapper | P29, P32, P28 part, SC2, SC3 (3 problems, 2 special cases) | low-med | all suites | yes | M |
| 8 | F7 single token block, theme once | P1, P2, P3, P5 part, P12 part (4 problems) | med | UIQ-01/02, theme, PWA-12, bundles current | partly | S-M |
| 9 | F4 real controls | P15, P8 part, SC8 (2 problems, 1 special case) | med | UIQ small/unnamed scans | yes per element | M |
| 10 | F10 one sign-in block | P16 (1 problem) | low | AUTH, first-run tests | yes | S |
| 11 | F11 build marker | P7, P40 (2 problems) | low | build tests | yes | XS |

Suggested order: F9 first (free, shrinks the file), F1 (small, fixes a real gap), F7, F6, F8, then F2 stage by stage, with F3, F4, F5 each as their own branch behind the full suite.

Counts: 40 problems (P1-P40), 18 special cases (SC1-SC18), 14 comment candidates, 0 test removals (2 test fixes, 1 test addition).

Not looked at line by line: the body of the Today, Settings (`1288-2313`), Roster, PvP, Raid, Recs, Intel, Tools templates (about 3,300 lines); only structure, counts and sheet/sign-in blocks were read. Per-screen repeated markup (for example 31 copies of `display:flex;flex-direction:column;gap:8px`, 27 of `font:12px var(--font-display);color:var(--ink-300)`) is covered by F2, not listed individually.
