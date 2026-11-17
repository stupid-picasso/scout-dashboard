# Manager review 1: Task 1 (UI polish), HEAD 522b420

Reviewed independently against `docs/research/manager-plan.md` (Task 1), `docs/research/ui-polish-audit.md` and `docs/research/worker1-status.md`. No product or test file was edited. Mutations ran in a clone under `/tmp/mut`; the baseline was checked in a clone at `c10fa0c` under `/tmp/base`.

## Verdict: FIX FIRST

The pass is real work, not a metric trick: inline sizes, radii and durations were codemodded in the source, the light theme is the same blue as dark, the toast is readable and sits at the bottom, PvP no longer breaks words, roster names no longer truncate, and all suites pass. The app looks clearly better than the "before" set, especially in light.

It is not ready to merge, for three reasons:

1. **The new More menu cannot be scrolled, so destinations are unreachable on a phone** (regression introduced by this change; see punch list 1).
2. Several visible defects remain at 320 and 390, some of them in states no check covers (select mode, sheets, the five More destinations that are not in `SCREENS`).
3. Five of the audit's S2 fixes are untouched or half done, and the Today page is still about 11 screens long. The app does not yet read as premium on Today, Settings and Recs.

## Suite results (my own runs, one at a time)

| Suite | Result |
|---|---|
| `qa_run.js a` | 80 passed, 0 failed, 0 skipped |
| `qa_run.js b` | 170 passed, 0 failed, 0 skipped |
| `qa_run.js c` | 99 passed, 0 failed, 0 skipped |
| `qa_run.js d` | 30 passed, 0 failed, 0 skipped |
| `qa_run.js e` | 26 passed, 0 failed, 0 skipped (9 old + 17 UIQ results) |
| `test_roster_logic.js` | 191 passed, 0 failed |
| `test_ranking.js` | 86 passed, 0 failed |
| `smoke_render.js` | 34 ok lines, "smoke passed", exit 0 |
| `test_bundles_current.py` | 0 failed |
| `test_rank_reference.js`, `test_pvp_sim.js`, `test_max.js`, `test_cp_recovery.js` | 11521 passed; exit 0; 17 passed; 14 passed |
| Python (venv): gemini_pool, extract_pipeline, postprocess, evolution_branches, tier_trends, event_moves, promo_codes | 40 passed; 29 passed; 51 passed; the other four report "0 failed"; all exit 0 |

## Mutation checks (in `/tmp/mut`, bundles rebuilt with `build_bundles.py`)

| Mutation | Expected | Result |
|---|---|---|
| `.ios-toast` colour back to `#fff` | contrast test fails | **UIQ-04-light fails** (ratio 1.00 on the load toast and the Undo toast). Dark still passes, which is correct. |
| `button,[role=button]{min-height:44px !important}` | height guard fails | **UIQ-12 fails** with 356 hits ("chip too tall: Copy 44" ...). |

Both new tests are real. Limit of UIQ-12 (read from the code, not mutated): the 40 px limit applies only to pill-radius controls; any other button passes up to 48 px, and controls wider than 300 px, with an image, with two or more block children, or filling their parent are exempt.

## Source greps

- `min-height:44px`: 57 occurrences before, 10 now: 8 inline on text inputs, and two CSS rules for inputs, textareas and `select`. None on a button or chip. The `select` part predates the worker (same rule at `c10fa0c`), so the Sort picker is still 44 px high; UIQ-12 does not look at selects. Not a regression; optional to bring it to 36 px.
- `#9a4a06`: gone from the source and from `index.html`.
- `.ios-toast` uses `color:var(--ink-900)`.
- Inline font sizes: 20 distinct values before (11 to 34 px, including 11.5, 12.5, 13.5, 14.5); now 12, 13, 15, 17, 22, 28, 32, plus three strays (18 px once, 20 px twice).
- Radii: about 20 distinct values before; now 6, 10, 14, 20, pill, 50%.
- Durations: about 35 distinct values before; now mostly 0.1/0.16/0.24/0.36/0.52 s, with strays left in the source (.9s, 1.5s, 1.6s, 2.6s, 620ms, 140ms, 120ms, 75ms, 34ms, and `micPulse 1.2s infinite` set from JS without `data-ambient`).
- `[style*=` override selectors: 71 before, 45 now. `!important`: 70 before, 64 now.
- Off-grid spacing still in inline styles: 14 px (55 times), 5 px (11), 7 px (9), 18 px (6), 9 px (4), 22 px (2, including the header `margin-bottom:22px`). UIQ-03 only checks card padding and gap, so these pass.

## Changes to existing tests

| Test | Change | Judgement |
|---|---|---|
| BOOT-01 | visible text threshold lowered from 300 to 80 characters; two new assertions added (empty-state title and "Import roster") | A lowered threshold. Justified by the new empty state and compensated by the new assertions. Acceptable, but it is a loosening the worker did not report as one. |
| BOOT-02 | version now looked up on Home | Follows fix 5. Fine. |
| BOOT-04 | tab order `Today,Roster,PvP,Recs,More`; "Settings" added to the More list | Follows the nav decision; same strictness. It finds menu items by text, so it does not notice that two of them are off-screen and unreachable. |
| IMP-12 | regex `^.*0 Pokemon loaded$` became `(^|\D)0 Pokemon loaded$` | A fix, not a loosening: the old pattern only worked because the version string followed the count; without it "800 Pokemon loaded" would have matched. |
| `rowsOf` (suite b) | `children.length >= 4` became `>= 3` | Follows the 3-column PvP row. Still returns real rows: 20 Great, 11 Ultra, 1 Little, 20 Master; CP is still a plain number. Fine. |
| THEME-01 | background RGB values updated to the new tokens | Fine. |
| `qa_lib.js`, `smoke_render.js` | HOME routed through More by `aria-label` | Fine. No removed check: the version check moved after navigation. |
| `test_roster_logic.js` | `ctx.cupBuildRows = () => []` stub | The "pre-existing gap" claim is **true**: at `c10fa0c` the file crashes with `TypeError: this.cupBuildRows is not a function`, and it crashes the same way at HEAD without the stub. CUPBUILD-01 in suite b still runs the real function. |

No `expect` was removed, no test was skipped or deleted.

Exemptions inside the new UIQ checks (not hidden, but they should be known):
- Scans run on the nine `SCREENS` at 390 only. Bulk update, Best IV, Ditto ranking, Keeper review, Rename & search, the detail sheet, select mode, the chat sheet and the More menu are never scanned.
- UIQ-07 (widths) runs with `feed:false`, so the events and GBL cards are not width-tested. I ran `EDGE` with the feed at 320 and 768 on Today, PvP and Home: clean.
- UIQ-09 tests each text node on its own. "Build dev" is rendered as two nodes, so the ban never fires; `^free$` never matches "· free". Runs containing a digit and the promo card are skipped by the caps rule.
- UIQ-11 covers Today, Roster, PvP and Recs, not all nine screens.
- The pinned fixtures `ui_feed.json` and `ui_promo.json` are identical to today's `data/feed.json` and `data/promo_codes.json` (compared as JSON), so they hide nothing.
- The emoji rule only looks inside header, nav, buttons, chips and rows, so the sparkles emoji before "Shinies" and the glyph legend (star, diamonds, heart) on Collection intel pass. On the detail sheet (not scanned) the favourite button is a heart glyph, which the rule would flag.
- Infinite animations are allowed on `[data-ambient]`; the three hero twinkles on the detail sheet were given that attribute, so audit fix 21 ("float once") is met for the float but the twinkles still loop.
- Contrast skips disabled controls, `aria-hidden`, text with alpha under .3 and anything over a gradient.
- `ALLOW_CAPS` has 4 entries; `MEGA XXS` and `MEGA MAX XXS` cover a visible inconsistency (punch list 9).

## PUNCH LIST (must be fixed or finished before merge)

1. **More menu cannot scroll; destinations unreachable.** Where: the `role="menu" aria-label="More"` template: `overflow-y:auto` is followed by `overflow:hidden` in the same inline style, so the computed value is `hidden`. The menu now has 10 rows and 4 headers (content 774 px). Measured: at 390x844 "Collection intel" and "Progress log" are cut off; at 375x667 four rows; at 320x568 five rows. Tests pass because Playwright scrolls programmatically. Verify: new test at 390x844, 375x667 and 320x568 that the menu's computed `overflow-y` is `auto` or `scroll` and that every `[role=menuitem]` can be brought fully inside the menu box by a touch scroll; reduce row height so it fits 844 without scrolling if possible.
2. **Chat bubble covers content in the More menu and the detail sheet.** Where: the floating chat button versus `role="menu"` and the `Pokemon details` dialog. Seen at 320/390/768 in both themes (over the "Collection intel" chevron and "Progress log" row; over the stat rings and the "Set" button). Verify: with the More menu, detail sheet, chat sheet or select bar open, the bubble is hidden or does not intersect any `[role=menuitem]`, button or input (bounding-box test).
3. **Roster row second line is clipped, IVs included.** Where: roster row template (`data-row-name` row, the IV / type / league line). At 320 the IV line is 92 px wide for 145 px of content: types show as "Ps", "Fa", "Gra", "Roc". In select mode at 390 the type is cut ("Stee", "Drag", "Psychi"); in select mode at 320 the IVs themselves are cut ("15 / 15", "6 / 6 / 1"). At 390 the league tag shows "Ultr...", "U...", "Ul...". There is also a check mark on its own with no label (Mew, Groudon, Mr. Mime, Jellicent) and a trailing "· —". Verify: extend UIQ-06 so that no text element inside the first 20 `[data-swipe-row]` has `scrollWidth > clientWidth`, at 320 and 390, in normal and select mode; no row shows a lone check mark or a dangling dash.
4. **Contrast failures on screens the scan does not visit.** Found by running the worker's own `CONTRAST` there: Bulk update "Upload costume s..." is white on `#0a84ff` (3.65, and breaks the decision "white text only on `--accent-fill`"); Bulk update "Does not fit CP/..." 4.10; detail sheet type badges "Gh" 2.67, "Dk" 3.45, "x1.6" 3.36 (both themes); detail sheet light theme green on green tint 4.29 ("Earthquake" and its check mark). In light the favourite heart in the detail hero is nearly invisible. Verify: add Bulk update, Best IV, Ditto ranking, Keeper review, Rename & search, the detail sheet (scrolled through), select mode, chat sheet and More menu to the UIQ-01..05, 09, 10, 12 scans in both themes; zero failures.
5. **Chat sheet at 320 has no side padding.** Where: `aria-label="Ask the Professor"` dialog. The title "Ask the professor" starts at x=0 and the close button touches the right edge. Its padding is also 14 px (off-grid; `CONFORM` flags it when run on the sheet). Verify: at 320 the sheet's text is at least 16 px from both edges; padding is a multiple of 4.
6. **Copy lint does not catch what it bans, and the banned copy is still on screen.** Where: Settings (Home) shows "Build dev", "Server-side video import · free", "Server-side IV import · free", "Paste from any AI chat · free". `LINT`/UIQ-09 test single text nodes. Verify: lint the joined visible text of each element (`innerText`), ban `Build dev` and `· free`; remove or reword the labels (build tag belongs in About next to the version).
7. **Today (#11, #10): the long tail is not collapsed and the reorder is CSS-only.** Where: Today template; `order:-4/-3/-2` on three cards. Today is still about 11 viewport heights at 390 and 12 at 320. A second stat strip ("13 To evolve / 0 Queued / 12 New dex") is stranded in the middle of the page; "Scan these next" is a card that contains only prose; "64 recalculated" floats between cards. Visual order no longer matches DOM order (screen reader and keyboard order). Verify: with the fixture and feed at 390, Today's full height is at most 4 viewports with the tail sections collapsed by default behind one disclosure; no `order:` on Today sections (DOM order equals visual order); one stat strip.
8. **Level picker and squad empty text are crushed.** Where: "PvP ranks out of date?" card (label "Max level for PvP ranks", chips L40/L50/L51, note "40 = no XL Candy ...") and the GBL "Your squad" empty state ("Not enough measured, in-cap, legal A-tier Pokemon yet"). At 390 the label wraps to 4 lines beside the chips; at 320 both become one word per line. Verify: label above, chips on their own row, note below; at 320 no text block in these two places has fewer than 12 characters per line (add to the mid-word/one-word-per-line check).
9. **Roster tags mix cases.** Where: roster tag strings and the sentence-case layer: "Mega max XS" beside "Shadow MEGA XXS" and "Lucky MEGA MAX XXS". The `ALLOW_CAPS` entries `MEGA XXS` and `MEGA MAX XXS` hide this. Verify: tags render as "Shadow Mega XXS" / "Lucky Mega max XXS"; remove both entries from `ALLOW_CAPS`. Keeper review shows "RELEASE" and Rename & search "XXL/XXS/XL/XS" once those screens are scanned: fix or allow-list with a comment.
10. **Settings/Home button, label and link zoo (#14) is unchanged.** Where: Home sections (stardust/imports, AI engine, Github access, Coverage). Still: outlined black boxes used as labels, an outlined button beside a text link beside another outlined button, a lavender "Server-side IV import" row, a dark red "Reevaluate roster" bar, "Optimize my account" floating between cards, unlabelled-looking empty grey fields. Verify: status rows have no border or fill (13 px `--text-2`); import options are one list of rows with chevrons; at most one filled button per card; no lavender text outside type colours; screenshot review at 390 in both themes.
11. **Prose walls (#6) outside the nine fixed captions.** Where: Raid counters intro (8 lines), Recs "AI recommended picks" (8 lines), Max planner, Stardust spend, PvP "Shared weaknesses" list, Settings "Planning". `SECTION_CAPTIONS` only looks under titles of 17 px or more, so text under the 13 px coloured headings is never checked. Verify: the caption rule applies under any card heading regardless of size, on all scanned screens; zero captions over 2 lines (rest behind "More").
12. **"Show all" and section heading styles (#19, part).** Where: Today "Show all 13" is a filled accent pill, "Show all 12" a grey bar; Recs repeats a filled "Mark done" on every tile (20+ primaries on one screen); section headings are 22 px white on some cards and 13 px green, red or lavender on others (Evolve now, Transfer list, New dex entries, Stardust priority, Don't spend dust on). Verify: every "Show all N" uses `.ui-btn-plain`; "Mark done" uses `.ui-btn-tint`; card headings use one style (colour only for a status dot or chip); a test that no screen shows more than 3 `--accent-fill` buttons outside the tab bar.
13. **Event card hierarchy is inverted.** Where: Today events card. "Add to calendar", "Best six vs ..." links are 17 px blue while the event title is 13 px; "Best Max attackers vs Espurr" is lavender. Verify: links are 13 or 15 px `--accent-text`, event title 15 px 600; no lavender link.
14. **768 px (#28): header, overlays and one Settings card are off the content column.** Where: the `@media (min-width:700px)` rule and `.app-header`. The title starts about 40 px to the right of the cards' left edge and the header buttons end about 40 px short of the right edge; the More menu and the select bar span the full 768 while content is 560. On Settings the "Resources" card is about 690 px wide. Verify: at 768 the left edge of `header h1` and the right edge of the last header button match the `[role=main]` box within 1 px; More menu and select bar are at most 560 px wide and centred; no card inside `[role=main]` is wider than 560 px.
15. **Small-width data truncation on Attackers and Progress log.** Where: Attackers row templates (move line, rating-gain line) and the Progress log table header. At 320 the move names and the rating gain are cut with an ellipsis on nearly every row; the Log header cells overlap. Verify: at 320 and 390 no text element in an Attackers row has `scrollWidth > clientWidth` (wrap to a second line instead); Log header cells do not intersect each other (bounding boxes).
16. **Leftover strays the checks allow.** Inline font sizes 18 px (1) and 20 px (2); durations .9s, 1.5s, 1.6s, 2.6s, 620ms and `micPulse 1.2s infinite` set in JS; header `margin-bottom:22px` and the other off-grid margins listed above (#26 is unfinished and missing from the worker's not-done list). Verify: grep counts are zero, or each is on a `[data-ambient]` element; extend UIQ-03 to margins of cards and section headers.

## Judgement of the worker's partial or not-done items

| # | Item | Decision |
|---|---|---|
| 3 | Toast position, Undo, dismiss | **Acceptable.** Bottom, above the bubble and tab bar, Undo slot, 3.2 s for plain notices and 6 s for Undo toasts (the longer time for Undo is sensible). UIQ-08 covers collisions. |
| 6 | Prose above cards | **Needs work**: punch list 11. |
| 7 | "Why:" walls | **Acceptable.** The wall is behind a "Why this one" disclosure, which removes the slop. A verdict chip is optional polish. |
| 11 | Today order and length | **Needs work**: punch list 7. |
| 14 | Home zoo | **Needs work**: punch list 10. |
| 16 | Swipe/long-press ask first | **Acceptable.** Transfer safety rules require the confirm; Remove already offers Undo after the confirm (`offerUndo` in `openRosterActionMenu`). One label is still authored in capitals (`TRANSFER (+1 CANDY)`); the runtime layer should show it in sentence case, but I did not render the long-press sheet, so that is unverified. Changing the ask-first behaviour is an owner decision, not polish. |
| 19 | One chip component | **Partly needs work**: punch list 12 ("Show all", "Mark done"). Full chip unification can wait; heights are guarded. |
| 20 | Sheets | **Needs a small fix**: punch list 5. Grabbers without drag-to-dismiss are a weak affordance; acceptable for this merge if the close button stays, drag is optional polish. |
| 23 | Sentence case | **Acceptable approach** (keeping the runtime layer protects logic keys and QA locators), with punch list 9 fixed. |
| 27 | Vocabulary | **Needs work**: punch list 6. "Hundos" / "Hundo / nundo" remain on Log and Intel. Also "Pokémon" (Roster title, PvP header, storage) beside "Pokemon" (header subtitle, empty state) on the same screens; pick one. The tab says "Settings" but the page opens with a date and dashboard counters (follows the plan's decision; note for the owner). |
| 28 | 768 layout | **Needs a small fix**: punch list 14. The 560 px column itself works and is a clear improvement. |
| 29 | Count-up once | **Acceptable.** Tabular figures are global; count-up once per session is S3. |

Not in the worker's list but unfinished: #26 spacing (punch list 16) and the More menu regression from #22 (punch list 1).

## Optional polish (not blocking)

- Verdict chip plus two facts on the Evolve now card (#7).
- Drag-to-dismiss on chat and detail sheets (#20).
- Count-up only once per session (#29).
- GBL "Your squad" empty state: three dashed rings look like a loading placeholder; in light they almost vanish.
- Promo codes: six entries each with three buttons make a long block high on Today; collapse to the first two.
- Evolve now: the Eevee options list uses outlined boxes while its siblings are filled tiles.
- Settings resource fields are large empty grey blocks with no placeholder.
- Detail type chips show a two-letter code as an icon ("St", "Ps") beside the full name.
- Remaining 45 `[style*=...]` override selectors.
- Toast `bottom` is a fixed 150 px; tie it to the nav height.
- UIQ-12: apply the 40 px limit to non-pill chips too; run UIQ-07 with the feed on.

## Screenshot findings

Generated with `node scripts/qa/ui_shots.js <scratch>`: 136 files, dark and light, 320/390/402/768. I looked at sliced contact sheets (1x) of: dark 320 Today (first 10 of 12 screens), PvP, Roster, Home, Recs, Intel, Attackers (first 5 screens), Log and the states; dark 390 Today (all), Roster, Home (first 4 screens), Recs, Raid and all states; dark 768 Today (first 2 of 11 screens), Roster (first 2) and all states; light 390 Today (first 4 screens), PvP, Home and four states; light 320 More menu and empty states; light 402 four states; light 768 Home (first 2 screens), More menu and empty states. Not viewed: dark 402, Intel/Attackers/Log at 390, Raid at 320, most of 768 below the first two screens, and the detail sheet below its first screen. Treat those as unverified.

Honest overall judgement: Roster, PvP, the empty states, the toast, the tab bar and the light theme now look deliberate and consistent. Today, Settings and Recs still look generated: long stacked cards, prose paragraphs, many equal-weight blue buttons and coloured headings. The first impression is good; the second look is not yet premium.

Better than before:
- Light theme: same blue as dark, readable toast, clean white cards. The brown accent is gone.
- PvP at 390: no mid-word breaks; three columns read well. At 320 it holds together.
- Roster: full names at 390 and 320; CP is smaller and no longer fights the name.
- Toast: bottom, with Undo, clear of the title, buttons and tab bar.
- Tab bar: five items, no "Home"; More menu is grouped with an icon on every row.
- Empty states: one icon, one title, one button, identical on Today, Roster and PvP.
- Stat strip only on Today; the version is out of the header; 320 header no longer collides.
- Detail hero is flat with no rays; GBL panels are no longer black holes.

Defects seen (screen, size):
- More menu, 390x844 dark and light, and 320: the last rows are cut off and the menu does not scroll (punch 1). At 768x1024 all rows fit.
- More menu and detail sheet, all sizes: chat bubble on top (punch 2).
- Roster, 320: type clipped to two or three letters; lone check marks; tags wrap to three lines ("Mega / max / XXS") in select mode; IVs cut in select mode (punch 3).
- Roster, 390: league tag "Ultr...", "U..."; select mode cuts the type; the "PvP ready" filter chip is cut at the edge with only a 12 px fade.
- Roster, full-page shots at 320 and 390: a blank area before "Load 30 more". The DOM has all 30 rows contiguous, so I believe this is a full-page capture artefact, but I did not prove it.
- Today, 390 and 320: events card first (good) but it runs about two and a half screens before GBL; blue 17 px links dominate 13 px titles (punch 13); second stat strip mid-page, prose-only "Scan these next" card, stray "64 recalculated" (punch 7).
- Today, 390: "Max level for PvP ranks" wraps beside the chips; at 320 it is one word per line, as is the squad empty text (punch 8).
- Today, 320: the Mega-ready carousel and the stat strip are cut at the right edge; the fade is too small to read as "more".
- Today, both themes: lavender "Best Max attackers vs Espurr" link; green, red and lavender 13 px headings beside 22 px white ones (punch 12).
- Settings (Home), 390 and 320, both themes: the zoo from the audit is still there; "Build dev" and "· free" visible (punch 6, 10).
- Recs, 390: two-column grid of tiles each with a filled "Mark done"; 8-line "AI recommended picks" paragraph (punch 11, 12).
- Raid, 390: 8-line intro paragraph; Max planner rows are dense text.
- PvP, 320: move notes wrap to 3 to 6 lines in a narrow column ("1 CP under 1300: a few power-ups · needs Rock Blast"); readable, not broken. The "Shared weaknesses" block is a 15-line comma list.
- Chat sheet, 320: no side padding (punch 5).
- 768: header not aligned with the 560 column; More menu and select bar full width (punch 14). Otherwise the centred column looks right, in the shots viewed.
- Light, detail sheet: favourite heart nearly invisible on the light hero; empty squad rings nearly invisible.
- Progress log, 320: the table header columns run into each other ("RosterAvg IV%", "LuckyStardust"); the intro paragraph is squeezed into a narrow column beside the "+ Log snapshot" button; "Hundos" and "needs 2 days" are still there.
- Attackers, 320: almost every data line ends in an ellipsis ("Dragon Breath / Aura ...", "+164% rating (8.1 -> 13.6 DPS) · 1..."), so the moves and the gain are cut; 9-line intro paragraph; one heading reads "DPS x BULK + stats" while the others read "DPS x bulk".
- Collection intel, 320: sparkles emoji before "Shinies", a text-glyph legend (star, diamonds, heart), "Hundo / nundo", uneven tile grid with one orphan tile.
- Recs, 320: a single column of about 20 identical filled "Mark done" buttons.
- Settings (Home), 768 light: the "Resources" card and its 5-column field grid are wider than the 560 px column (about 690 px), so the page has two different widths.
- 402 light (states only): same as 390; nothing extra.

Regression or pre-existing (checked against the committed `before/` dark 390 set, states and Roster only):
- **Regression:** the More menu cut-off. Before, it had 9 rows and no headers and fitted.
- **Pre-existing, not fixed:** select-mode clipping (before was worse: names were cut to "M", "L"), the roster league tag "Ultr...", the chat bubble over the More menu and detail sheet, the squad empty text, and the blank area before "Load 30 more" in full-page roster shots (present before too; most likely a capture artefact, not proven).
- **Not compared with before:** the level picker wrap, the chat sheet padding at 320, the Log table header and the Attackers truncation. The codemod raised 11 to 12 px and 14 to 15 px, so these may be new; treat them as possible regressions.

## Were any worker claims false?

- No claim in `worker1-status.md` is false; its not-done list is honest but **incomplete** (#26 spacing, and the unreachable More rows, are missing).
- "No test was loosened" does not hold literally: BOOT-01's text threshold went from 300 to 80. It is compensated by new assertions.
- The handoff says the copy lint bans "Build dev" and "free": the check exists but cannot fire, and both are on screen.
- The handoff's "More rows have icons and group headers" is true, but the menu it describes is partly unreachable on a phone.
- The `cupBuildRows` "pre-existing gap" claim is true.
