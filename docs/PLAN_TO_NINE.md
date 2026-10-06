# Plan: every area to 9/10

Status today (from `docs/QA_REPORT.md`): 9 = PvP, Intel, Boot, Ranks, Security. 8 = Import, Roster, Gestures, Detail, Recs, Today, Log, PWA, Performance. 7 = Raid, Attackers, Home. 6 = Accessibility.

**A 9 means:** every "Done when" check below passes in the automated suite, and the few things a sandbox cannot see (real iPhone, VoiceOver, live feed) have been checked by you once. Each area gets new test cases so the rating is evidence, not opinion.

## Phase 1 - Foundations that lift many areas at once (1 session)
| Work | Lifts | Done when |
|---|---|---|
| Add axe-core to the Playwright suite and fail on serious/critical issues | Accessibility | 0 serious/critical on all 9 screens |
| Run the whole suite on WebKit as well as Chromium (closest thing to iOS Safari available here) | Gestures, PWA, Roster | same pass rate on both engines |
| Lighthouse (mobile, throttled) in the suite: perf, a11y, PWA scores | Performance, PWA, Accessibility | perf >= 90, a11y >= 95, PWA all green |
| CI job running QA nightly + on every push; fail if any area drops | all | green badge in repo |

## Phase 2 - Accessibility 6 -> 9 (1-2 sessions; biggest refactor)
- Replace clickable divs with real `<button>`, `<a>`, `role="tablist"/"tab"` with `aria-selected`, `aria-pressed` on chips, `aria-live` toasts. Remove the runtime patch.
- Sheets: focus moves in, is trapped, returns to the opener; Esc closes.
- Type in `rem` so iOS Dynamic Type works; nothing clips at the largest size.
- Contrast: 100% of text >= 4.5:1 (today a few muted greys fail).
- Done when: axe clean, keyboard-only run through every feature passes, text stays usable at 200% size, reduced-motion verified.
- You: one VoiceOver pass on the phone (10 min); I give you a script.

## Phase 3 - Import, Roster, Gestures (2 sessions)
| Area | Gap | Work | Done when |
|---|---|---|---|
| Import 8->9 | Rows not range-checked; no preview; one CSV layout | Per-row validation + error report; preview "replace 64 with 80?"; drag and drop; JSON/generic CSV with column mapping; undo last import | 200 fuzzed files never crash; bad rows listed; undo restores |
| Roster 8->9 | Paged not virtual; no bulk actions | Virtual list (1,000+ rows at 60 fps); multi-select with bulk transfer/favourite; saved filters; sort by Mega readiness | 2,000 rows scroll < 16 ms/frame; bulk actions tested |
| Gestures 8->9 | No undo; no first-use hint; WebKit untested | Undo toast after transfer/remove; one-time hint; haptics wired everywhere; WebKit touch tests | undo works; same results on WebKit |

## Phase 4 - Detail, Recs, Log, Today (2 sessions)
| Area | Work | Done when |
|---|---|---|
| Detail 8->9 | Named prev/next + swipe between Pokemon; drag-to-dismiss sheet; target IV spread next to yours; power-up path with cost | all controls named; spread target matches PvPoke rank 1 |
| Recs 8->9 | One-line "why" on every recommendation from the actual rule; undo for MARK DONE; link to events | every item has a reason; reasons reproduce from data |
| Log 8->9 | Auto daily snapshot; growth charts (IV avg, hundos, dex); export | 30 synthetic days chart correctly; export round-trips |
| Today 8->9 | First live feed run verified; cross-check surfaced; **this week's raid bosses -> best six for each, one tap**; calendar export; local notifications for events and Mega rest timers | feed contract test against live data; boss list matches events; notification fires in test |

## Phase 5 - PWA and Performance (1-2 sessions)
- PWA: maskable icons, splash screens per iPhone size, update flow ("new version ready" already there, test it), install guidance. Done when Lighthouse PWA is green and you confirm install on your phone.
- Performance: split `pokemon-mechanics.js` (1.27 MB) by feature and lazy-load PvP/Mega/cup tables; rank recalculation in a Web Worker; keep first load < 1 MB JS. Done when mobile-throttled TTI < 3 s, no task > 100 ms, heap flat.

## Phase 6 - Raid, Attackers, Home (7 -> 9) (2-3 sessions; biggest modelling piece)
- Raid/Attackers: replace the DPS x bulk proxy with a simulation using game-master boss movesets, raid timer, dodging assumption, party size, weather and Mega boost. Validate against published sim results for 5 well-known bosses (needs outside reference numbers; I will say where I cannot confirm).
- Home: group settings the way iOS Settings does; retire the Mega admin list (the Mega card replaces it); backup/restore JSON; validate every field. Done when all settings have validation tests and a backup round-trips.

## Order and why
1 foundations -> 2 accessibility -> 3 import/roster/gestures -> 4 detail/recs/log/today -> 5 PWA/perf -> 6 raid/attackers/home. Phase 1 gives the proof tools for the rest; accessibility changes the markup everything else sits on, so it goes before the feature work.

## Decisions I need from you
1. OK to refactor clickable divs into real buttons? (Large but mechanical; I recommend yes.)
2. Raid simulation: full battle sim (best, longest) or a calibrated estimate (faster, still a clear step up)?
3. Notifications: OK to ask iOS permission for local notifications in the installed app?
4. Can you do two short real-device checks: VoiceOver and "Add to Home Screen" install?

## Not verifiable from here
Real iPhone rendering and SF font, VoiceOver, push/local notifications, the GitHub-run feed refresh and official-page cross-check, the AI screenshot/video readers (need your keys).
