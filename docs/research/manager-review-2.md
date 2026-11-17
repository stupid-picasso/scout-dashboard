# Manager review 2: UI polish pass 2, HEAD 2ff93c7

Independent check of worker 2's claim that all 16 items of `manager-review-1.md` are closed (commits 7489bb3..2ff93c7). No app or test file was edited. Mutations ran in copies under `/tmp/mut2_13`, `/tmp/mut2_15`, `/tmp/mut2_16`; my own Playwright walk is in `/tmp/mr2/walk` (script and screenshots, `walk.json` has every measurement).

## Verdict: PASS-WITH-FIXES

All 16 punch-list items hold on the live page at 320/390/402/768 in both themes, all suites pass, and the three new tests I mutated fail on the old behaviour. The remaining defects below are small; none blocks merge on its own, but 1 to 3 should be fixed in the same branch.

## Suites (my runs, one at a time)

| Suite | Result |
|---|---|
| `build_bundles.py --check` | up to date, exit 0 |
| `test_bundles_current.py` (venv) | 0 failed |
| `qa_run.js a / b / c / d / e` | 81/0/0, 170/0/0, 99/0/0, 30/0/0 (axe), 44/0/0 (passed/failed/skipped) |
| `test_roster_logic.js`, `test_ranking.js` | 191 passed; 86 passed |
| `test_rank_reference.js`, `test_pvp_sim.js`, `test_max.js`, `test_cp_recovery.js` | 11521 passed; exit 0 (90.9% vs 88% min); 17 passed; 14 passed |
| `smoke_render.js` | smoke passed, exit 0 |

Note: `QA_OUT=/tmp/qa` (a directory) crashes `qa_run.js` with EISDIR after the suite has run, so the results are lost. `QA_OUT` must be a file path (`/tmp/qa/e2e_a.json`).

## Punch list, checked on the live page

| # | Item | Result (measured) |
|---|---|---|
| 1 | More menu scrolls | PASS. `overflow-y:auto`, `overscroll-behavior:contain`. At 320x568 content 654 in a 428 box: a CDP touch swipe moves it 0 -> 226, the wheel too, last row fully inside, page does not scroll. 390/402/768: the menu fits without scrolling. Screens `dark320_more.png`, `light320_more_scrolled.png`. |
| 2 | Bubble over sheets | PASS. Hidden with More, detail, select, chat open at all widths and themes (`chatBubbleShow` conditions). |
| 3 | Roster rows | PASS. No clipped or overflowing text in rows at any width, normal and select mode. Tags read "Mega max XS". See defect 4 for a dangling separator. |
| 4 | Contrast off-screen | PASS by suite e (scans now include Bulk, Best IV, Ditto, Keeper, Rename, detail top/end, select, chat, More, long-press). Light detail heart is now a visible SVG. |
| 5 | Chat sheet 320 | PASS. Content 17 px from both edges, padding 16. Close glyph off-centre (known). |
| 6 | Copy lint | PASS. No "Build dev" or "· free" in Settings `innerText` at any width; lint now runs on joined text. |
| 7 | Today | PASS. Collapsed tail: 2.97 / 1.87 / 1.78 / 1.51 viewports at 320/390/402/768; open: 8.2 at 390. No `order:` left in source. One stat strip. |
| 8 | Level picker / squad | PASS by UIQ-17 (not re-measured by me). |
| 9 | Tag case | PASS. `MEGA XXS` entries gone from `ALLOW_CAPS`. |
| 10 | Settings zoo | PASS on the listed points: no outlined buttons, rows with chevrons, one filled button ("Refresh everything"). See defects 1 and 6. |
| 11 | Prose walls | PASS by suite e caption rule (any heading size). |
| 12 | Show all / Mark done / headings | PASS by UIQ-18; "Show all 10" plain on Today. |
| 13 | Event card hierarchy | PASS visually: event title now outweighs its accent links; no lavender link (`dark390_today.png`). Sizes not measured. |
| 14 | 768 alignment | PASS. Main 104..664; `h1` left 104, last header button right 664; More menu 560 wide at x=104. Only element over 560: Roster filter chip scroller at 564 (intentional -2 px margin for focus rings). |
| 15 | Attackers / Log | PASS by UIQ-21 (not re-measured by me). |
| 16 | Strays | PASS. 18/20 px sizes, 22 px margin, 620ms gone. `micPulse 1.2s infinite` is now on a `data-ambient` button. 1.5s/1.6s/2.6s remain only on `data-ambient` hero elements. |

## Mutation checks (old behaviour put back, bundles rebuilt, `UIQ_ONLY`)

| Test | Mutation | Result |
|---|---|---|
| UIQ-13 | `overflow:hidden` after `overflow-y:auto` on the More menu | 3/3 fail: "overflow-y is hidden; rows reached by wheel 6 of 10; wheel did not move the menu; touch swipe did not move the menu" at 320x568 |
| UIQ-15 | roster second line `nowrap; overflow:hidden; text-overflow:ellipsis` | 2/2 fail: 37 clipped at 320, 30 at 390 |
| UIQ-16 | `todayTailOpen: true` by default | fails: "Today is 8.2 viewports" (UIQ-16b also fails because its click then closes the tail) |

All three bite. Worker's report of these proofs is accurate.

## Regressions

- Events (with "Remind me" and calendar links) and GO Battle League stay above the fold on Today. Promo codes moved into the collapsed tail ("More on Today"): reachable in one tap, and new-code reminders still come from `reminderItems`, but the list is no longer visible by default. Acceptable; owner should know.
- Nav: Settings is the first More row under "Account"; tab bar is Today/Roster/PvP/Recs/More. BOOT-04 and `s.go('HOME')` route through it.
- Tap targets at 390 (Today, Roster, PvP): every visible control is 24 px or more tall except "What to build for this cup" (defect 5). Removing the 44 px min-height did not create other small targets.
- axe suite d: 30/30.
- Test changes since 550ed24: INT-02, TOD-22, LOG-01, KEY-01 are locator changes with the same assertion strength (LOG-01 is stricter: it needs a dated row containing 64). BOOT-01b is new. No `expect` removed.

## Defects (numbered, for the worker)

1. **Empty "Don't spend dust on" card on Settings.** `Scout Dashboard.dc.html` line ~1934, the `digest.avoidList` card has no empty state; with the fixture it renders a 22 px heading over an empty box beside "Stardust priority". Screenshot `/tmp/mr2/walk/light390_settings_2.png`. Fix: hide the card when the list is empty, or one line of empty text. Both cards also use `border-radius:10px` while other cards use 14 px.
2. **"press SET" copy in the detail sheet.** Detail sheet candy row: "No candy count yet: scan it or type it above and press SET" while the button reads "Set". `/tmp/mr2/walk/dark390_detail.png`. The sentence-case layer does not reach prose; reword the source.
3. **Light theme detail chips lose their fill.** "4286 CP", "XS" and "#376" are filled chips in dark and plain text in light. Compare `/tmp/mr2/walk/dark390_detail.png` with `light390_detail.png`.
4. **Dangling separator in roster rows at 320.** When the type wraps, the line ends with "15 / 15 / 15 ·" and "Steel" starts the next line. `/tmp/mr2/walk/light320_roster.png`. UIQ-15's dash rule does not catch the middot. Fix: keep the dot with the type (`white-space:nowrap` on dot plus type).
5. **"What to build for this cup ▾" summary is 15 px tall** (GBL league details on Today, `summary` in `details[data-cup-build]`), 12 px 700 tracked: under the 24 px target minimum and off the heading style. Pre-existing feature (26d549c), not a regression of this pass.
6. **Chat bubble still covers list content** (not an overlay, so outside punch item 2): Roster CP at 390 light (`light390_roster.png`, "CP 30..."), PvP rank at 320 (`dark320_pvp.png`, "93.2%"). Fix: bottom padding on `[role=main]` equal to bubble height plus gap, or tuck the bubble on scroll.
7. **Chat close button glyph off-centre at 320** (`light320_chat.png`). Already in the worker's not-done list.

Owner notes, not defects: Settings still opens with a date, counters and "Planning" before any setting (about 5 viewports at 390); `QA_OUT` must be a file (see Suites).

## Were any worker claims false?

No. Every claim I checked held: the More menu, bubble, roster rows, Today length and order, copy lint, 768 geometry, strays, and the mutation proofs for UIQ-13/15/16. Items 8, 11, 15 were accepted on the suite's word plus code reading, not re-measured.
