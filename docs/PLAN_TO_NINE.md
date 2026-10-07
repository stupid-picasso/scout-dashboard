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

## Status (v53.142)
Automated suite: 211 end-to-end cases + 15 axe/keyboard cases, all passing; roster logic 191, ranking 71.

| Phase | State |
|---|---|
| 1 Foundations | Done (axe, Lighthouse with gzip like GitHub Pages, WebKit option, CI workflow) |
| 2 Accessibility | Done: axe clean on every screen, select mode and detail; Lighthouse a11y 100 |
| 3 Import / Roster / Gestures | Done except two items not measured: 2,000-row 16 ms/frame target, WebKit touch run |
| 4 Detail / Recs / Log / Today | Done: named prev/next, "why" lines, undo, daily snapshot, growth charts, log export/import, raid-boss one-tap, .ics, reminders (foreground only) |
| 5 PWA | Done in code: maskable/any icons, 180 px opaque touch icon, 10 splash sizes, install steps, Professor manifest. Needs your Home Screen check (docs/DEVICE_CHECKS.md) |
| 5 Performance | Partial: Lighthouse mobile 24 -> 47 (gzip-fair baseline 36). Transfer 2.1 MB -> 0.67 MB, FCP 3.9 s, LCP 5.2 s, TBT 1.2 s, TTI 7.0 s. Target of 90 / TTI < 3 s NOT met |
| 6 Raid sim / Home | Not started (raid simulation deferred by you) |

Why performance stops near 50: the app is shipped through a generated unpacker that decodes everything, then an in-browser template compiler builds the UI (profile: unpacker 340 ms, template compile 160 ms, style/layout ~1 s at 4x CPU). Mechanics data itself is cheap (about 40 ms). Further gains need a different build (precompiled templates, code split per tab, Firebase loaded on idle), which is a re-architecture, not tuning.

## Performance rewrite, step 1 (v53.145)
- Profile of one trivial state change at 500 Pokemon: 45 ms, of which 44 ms was `renderVals` recomputing every tab's analysis (attacker board, buddy plan, raid roles, data quality, dust plan...). Those only depend on data, so they are now cached against every non-UI state value (`installDerivedCache`, `memoDeps`); species/dex lookups in `pokemon-mechanics.js` are memoised. Result: 45 -> 14 ms per state change (the rest is React).
- Roster page-load hitch at 500 and 2,000 rows: 150-270 ms -> 100-130 ms. Scrolling loaded rows holds p50 16.7 ms. A true virtual list is still not done.
- First load: unchanged by this step. A/B of the previous and current build under identical conditions gave the same time to ready (~4.1 s at 4x CPU on a busy host). Lighthouse scores in this sandbox drift between 33 and 47 with host load; compare builds only side by side.
- What is left on first load is the delivery format: ~2 s of 4x-CPU "program" time (parsing the 1.3 MB mechanics script, support runtime, React) plus the in-browser template compile. Next options, each needing your go-ahead: (a) precompile the template to JS at build time instead of in the browser; (b) split mechanics by tab and load PvP/Mega/cup tables on first use; (c) load Firebase on idle.
