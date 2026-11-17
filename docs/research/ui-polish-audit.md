# Professor: UI polish audit and plan

Method: Playwright + Chromium, 390x844 @2x, dark and light, fixture roster (64 Pokemon), real `data/feed.json` and `data/promo_codes.json` injected, sentence-case display layer ON (the real user experience). Also 320x700 and 768x1024. Runtime measurements were taken from the live DOM on 9 screens (`/tmp/ui-audit/measure.json`). No product file was edited. Line numbers refer to `Scout Dashboard.dc.html` (the build input; `index.html` is generated).

The 10 copied screenshots are in `docs/research/ui-audit/` (names below). The complete set (every screen in both themes, full-page, 320/768, states) is in `/tmp/ui-audit/` and is session-local, so it will not survive; the copied ten are the durable references.

| Copied file | Shows |
|---|---|
| `01_dark_empty_today_first_run.png` | Empty roster Today (stat zeros, GBL, no first-run guidance) |
| `02_dark_today_toast_over_header.png` | Toast over the title; Today top |
| `03_dark_today_gbl_events_slices.png` | GBL nested cards and events (3 slices) |
| `04_dark_today_evolve_cards_slices.png` | Evolve-now "Why:" walls and misaligned sprite (3 slices) |
| `05_dark_roster_truncated_names_slices.png` | Roster rows with truncated names |
| `06_dark_home_button_zoo_slices.png` | Home: mixed button/label/link styles |
| `07_dark_320px_pvp_table_broken.png` | 320px: Today, Roster, PvP table collapse |
| `08_light_toast_invisible_text.png` | Light theme: toast with unreadable text |
| `09_dark_detail_sheet_scrolled.png` | Detail sheet scrolled (moves, PvP sets, replace dialog, promo card) |
| `10_dark_roster_filter_swipe_longpress_select.png` | Roster filter, swipe, long-press sheet, select bar |


Uncertain / not covered (stated honestly):
- Second capture round (`r2_*` in `/tmp/ui-audit/`) added: promo card (dark/light), the "Replace your roster?" confirm, the detail sheet scrolled through Moves / League rankings / Weak to / Evolution chain, and light-theme More, chat, select and detail. The promo card renders (`data-promo-card`, line 643) only when `promoCodes` state is set; under `file://` the fetch fails, so QA (`qa_e2e_c.js:127-129`) injects it with `s.set`. I did the same. The `importSheet` (line 433) only renders rows after a real import with `lastImport.rows`; my fixture import has none, so that sheet was not seen (not audited).
- 320px: Home and Attackers captured (`r2_320_*`); Raid via the More menu timed out in my script once (it worked for Attackers right after), so I treat it as script flake, not a product bug. Not re-verified.
- First-run: there is no distinct onboarding screen I could trigger. Evidence: no `welcome`/`onboard` string in the file; `__noImportGate` only disables a QA import gate (lines 10105, 12782); `installHintHidden` (line 4026) is an "add to home screen" hint, which I did not see in Chromium (it is probably iOS-Safari-only; unverified). So item 21 is "no first-run guidance I could find", not "proven absent".
- Shell mode (`html.shell`, lines 45-52) is an opt-in "app scrolling (experiment)" toggle (line 8626, `localStorage scout.shell`); I audited the default classic mode. The findings about copy, tokens and layout are mode-independent; toast/header geometry and fixed-bar behaviour could differ in shell mode (not tested).
- The contrast script is noisy (gradients and sprite fallback letters read as 1.4; an `sr-only` label was flagged), so contrast items come from token arithmetic plus the specific confirmed bug below.
- Apple HIG URLs are cited from memory and were not fetched; I removed claims about named apps I could not verify.

---

## 1. Verdict in one paragraph

The foundation is better than typical AI output: real SF system font, true-black grouped-surface dark theme, hairline separators, 44pt tap strips, a spring curve, press states, pull-to-refresh, haptics, a count-up, reduced-motion handling and safe-area padding all exist. What reads as "unfinished / generated" is not the colour palette, it is (1) **how the system is enforced**, (2) **content density and prose**, and (3) **layout bugs at the edges**. The iOS look is applied as a late "design layer" of `!important` attribute selectors over ~thousands of inline styles (lines 150-275 (the iOS design layer)), so every element still carries its original ad-hoc font size, radius and colour and the layer fights it. The result is a coherent first impression and an inconsistent second look. The Today tab is roughly 9,000 CSS px of stacked cards (full page 18,024 px at 2x; `dark_390_01_today_full.png`), with paragraph-length helper text above almost every section, and the header's stat strip is repeated on every tab.

## 2. What reads as AI slop or unfinished, and why

1. **Paragraph-as-UI.** Almost every card opens with 2-4 lines of explanatory prose before any content. Examples: "Scan these next" (line 527: "Everything worth scanning is measured. Ranked by how much a measured IV could change a decision, so low-value Pokemon never need a screenshot."), "Megas worth evolving" (548), Raid counters, Best attacker per type, Use a TM, Max planner (2867). This is the strongest "LLM wrote the UI" tell: explaining the feature instead of designing it to be self-evident. Premium apps keep a one-line caption at most, and put the rest behind an info affordance.
2. **"Why: ..." walls in Evolve now cards** (`dupNote`, built at line 20484, rendered at lines 849-850): "Why: Nidoqueen tier A in Ultra League, rank 97% . Best Great League copy . Evolving now makes it CP 2611, over the Great League cap of 1500 (its 96% rank there needs a lower level)." That is 5-7 lines of joined clauses per card, rendered at one weight and one colour (`04_dark_today_evolve_cards_slices.png`). It is correct data presented as a sentence dump. Needs structure (verdict chip + two facts) and a disclosure for the rest.
3. **Nested cards at three depths with different radii and inverted fills** (GBL section: page `#0f0f10` -> card `#19191b` r18 -> inner `#0a0a0b` r8-ish week panel -> league block). Card-in-card-in-card is a classic generated-dashboard pattern. The inner panels are *darker* than the outer card, which reads as holes, not elevation.
4. **Evolve-now card layout bug.** The sprite is vertically centred in a tall card while the title block is indented as if the sprite were top-left; the top-left of every card is empty and the sprite floats at the bottom-left (`04_...slices.png`, right column; also first card in `03`). Looks broken, not stylistic.
5. **Roster rows truncate the thing you scan for.** At 390 wide, name column loses to the oversized CP number: "Meta...", "Lati...", "Tyra...", "Blast...", "V..." while `CP 4286` takes ~100px (`05_...slices.png`). The 3rd line chip "Mega max XS" competes with the name. Name should win; CP should be smaller or move to line 2.
6. **Button zoo on Home** (`06_...slices.png`): filled blue capsule (Save, Refresh everything), outlined black rectangle (Import screenshot, Import screen recording), text-only blue link (Import appraisal, Export log), black full-width bars used as *labels* (AI engine . No key, Github access . Not set, Coverage . 64 Pokemon) that look like buttons but are not, different radii on each, and a purple text row (Server-side IV import) beside grey ones. Status lines, buttons and links are visually indistinguishable categories.
7. **Light theme has a different brand.** Dark accent is system blue `#0a84ff`; light accent is burnt orange/brown `#9a4a06` (`--ios-blue:#9a4a06`, line 194), so the same primary button, tab highlight, FAB and chips switch hue between themes (`m_light_a.png` vs `m_dark_a`). Combined with brown-orange "chat" FAB and brown "Refresh everything", light looks like a different app and the brown reads dated. The token is still *named* `--ios-blue`.
8. **Sunburst hero (white rays).** Pokemon detail header uses a `repeating-conic-gradient` rays pattern (line 2190) plus the floating sprite animation (`heroFloat 4.2s infinite`, line 147/2216). Sunburst rays are a common generic-template motif and an infinite float is distracting on a data sheet.
9. **ALL-CAPS and mixed casing leak through the sentence-case layer.** A runtime layer (line 6583) lowercases captions, but captions still appear caps in the long-press sheet ("REMOVE (mistake, no candy)", line 18026), "TAP TO RELOAD" (line 380), "REPLACE", "THIS WEEK . Tue, Nov 10..." in GBL, "POWER UP OR EVOLVE . gets you to 1500 CP", "YOU ASKED:". In source there are 100+ caps labels (FAST TM, ELITE CHARGED TM, YOUR SQUAD, ...). Inconsistent: some section headings are 19px sentence-case titles, some are 11px caps footnotes, some are 13px grey.
10. **Jargon and developer voice.** "Unverified DPS", "Hundos", "Dominated duplicates", "Form to c...", "evolution data one-off lookup, cached to your account", "Build dev", "Server-side IV import . free" ("free" as a label is a developer's cost note, not a user concept), "Run MOVE DATABASE on the Attackers tab", "needs 2 days" used as a deltas placeholder in Log. Some are fine for an expert audience, but the unit of polish is consistent vocabulary (see section 8).
11. **Header and stat strip repeated on every tab** (`stat-strip` line 369, header 301-330). The same 64 / 48.3% / 5 / 4 chips occupy ~110px at the top of Today, Roster, PvP, Raid, Home, Recs, Intel, Attackers and Log. On Roster you see "64 Roster" twice (chip + "30 of 64 shown"). The stat chips are clipped at the right edge ("4 Sha", "2 U") with no fade or snap cue.
12a. **LIGHT THEME TOAST TEXT IS INVISIBLE (confirmed bug).** `.ios-toast` hard-codes `color:#fff` (line 261) on `--toast-bg: rgba(255,255,255,.94)` in light (line 198). Result: a white pill with a green dot and no readable message; only the accent "Undo" is visible (`/tmp/ui-audit/light_390_f_toast.png`, `r2_light_detail_2.png`, `r2_light_chat.png`). Every success/error/undo message is unreadable in light mode. Fix: `color:var(--text)`.
12. **Toast overlaps the large title.** `.ios-toast` (line 261, top: safe-area + 8px) sits directly on top of "Professor" and the header action buttons, making the title ghost through the blur (`02_dark_today_toast_over_header.png`). The load toast also persists long enough to appear in ~15 of my captures. iOS convention: banner lives in the safe area *above* content, or a bottom toast above the tab bar with Undo.
13. **PvP table is not responsive** (line 2730): 5-column grid `22px 1fr 44px 74px 58px`. At 390 the name column is ~110px so "needs Thunder Shock" wraps to three lines and "Mandibuzz" breaks mid-word as "Mandibuz / z". At 320 it collapses completely, name is stacked one letter per line and CP overlaps (`07_dark_320px_pvp_table_broken.png`). This is the worst concrete layout break.
14. **Inconsistent tap-target visuals.** Segmented chips (Great/Ultra/Little), filter pills (All/Measured/Needs appraisal), L40/L50/L51, sort `<select>` (native look with a chevron), "Select" text button, "Show all 13" full-width solid blue, "Show all 12" lavender: seven styles for "pick one".
15. **Many things are cut off horizontally with no affordance:** stat strip, filter chips ("PvP ready" clipped), league chips ("Master" clipped), Mega-ready card carousel ("not logged" cards clipped). Clipping is fine only if the edge peek is deliberate (a consistent 16px leading inset, snap, and fade); here it reads as overflow.
16. **Select-mode action bar truncates its own count** "2 sele..." (`10_...select.png`), and puts four actions (All, Favourite, Transfer, Remove) in a bar over the tab bar with Transfer as the filled primary and Remove as a bare red word (lines 2204-2205).
17. **Empty states are terse and unactionable.** Roster empty: "Your roster is empty. Use SYNC CSV above to import your Pokemon." (line 19798): says "SYNC CSV above" but the control is an unlabeled upload icon in the header, and the word "SYNC" is not what the icon does. PvP empty: a table header over a single grey row "Nothing of yours is ranked for this league yet." No illustration, no primary button. Today with no roster still shows GBL and stat chips reading 0 / 0.0%.
18. **Chat sheet** (`09_...`): top-left title "Ask the professor / Screen: Today" is 12px grey, "New chat" and x are tiny, the sheet is ~35% height and not draggable-looking (no grabber), sends with a blue pill. Acceptable, but no grabber, no suggested prompts, empty body.
19. **More menu** (`09_...`): rows have icons only for some entries (Best IV, Ditto ranking, Keeper review have none, so the text is indented unevenly), and the red "6" badge on Bulk update plus on the tab-bar More; chevrons on every row; no grouping. It also renders in a dark card over a blurred scrim; the FAB sits on top of the menu.
20. **Tab bar** (line 3948): 6 items (Today, Home, Roster, PvP, Recs, More) with Home between Today and Roster. "Home" is actually settings/resources/imports, and "Today" has a sun icon. Two "home-like" tabs plus a badge on More. Conventionally the settings tab is last or in a profile affordance.
21. **No first-run experience.** An empty install shows the full Today page: stat chips at zero, "Scan these next", the GBL card (feed data), then Evolve etc. There is no welcome, no single obvious "Import your Pokemon" action. (Uncertain: I could not find a hidden welcome state in the source by grep for welcome/onboard.)
23. **Replace-roster dialog** (`06 -> r2_dark_import_replace.png`, line 6307): centered plain-text "Replace" and "Cancel" with equal weight; a destructive action should be red or at least visually distinct from Cancel, and the title should say what will be lost. The label is authored `REPLACE` (caps) then lower-cased by the runtime layer.
24. **Emoji in data rows and chrome:** moves list shows "100 (lightning emoji) cost" (energy), type emoji map `fire/water/electric` (line 7231), the Weak-to chips use type emoji (`r2_dark_detail_3.png`), alongside the SVG tab icons. This is the one place the icon families visibly mix.
25. **Detail sheet is long and dense** (`r2_dark_detail_*.png`): Moves, Best for PvP, Mega evolution inputs (four placeholder fields "energ / cost (optio / lev / of 4 / rest days" that truncate their own labels), native `<select>` boxes with caret for moves, Max battles card in purple. No sticky header or section index; back chevron is small. Native selects look like web forms inside an iOS-style sheet.
26. **320px header collision:** "Professor" (32px) runs under the first header button (`r2_320_ATTACK.png`), subtitle truncates to "64 Pokemon l...".
22. **Odd font weights:** `font:650` (40) and `font:750` (5) are used. On iOS the system font is variable so these may render as authored; on other platforms they snap. Uncertain whether it matters on the owner's device; consolidating to four weights is still a cleaner scale.

## 3. Measured facts (live DOM, 9 screens, 390 wide)

| Metric | Result | Meaning |
|---|---|---|
| Distinct computed font sizes | 17: 11, 11.5, 12, 12.5, 13, 13.5, 14, 15, 16, 17, 18, 19, 20, 24, 26, 30, 32 | no type scale; half-point sizes are accidents |
| Most-used size | 12px (1,293 text nodes), 13px (371), 12.5px (197), 14px (119) | body text is footnote-size; 12px is the "readability floor" CSS clamp (line 232) lifting 11/11.5 |
| Inline font-size authoring (source) | 11px x398, 11.5px x134, 12px x205, 12.5px x128, 13px x172 ... | the clamp rule exists because authors wrote 11px 398 times |
| Font weights in source | 500x46, 600x169, 650x40, 700x335, 750x5, 800x117 | 6 weights incl. two non-standard |
| Distinct border-radius values (computed) | 17: 2,3,4,5,6,7,8,9,10,12,14,16,18,99,999px,50% | cards use 18/16, buttons pill, inner panels 8-12, 5px chips |
| Radii in source | `var(--r-pill)` x158, `999px` x61, `50` x59, 8px x57, 5px x52, 10px x46, 12px x33, 16px x30, 14px x22 | pill is declared two ways |
| Box-shadows | ~10 distinct, mostly `0 6px 24px rgba(0,0,0,.35)`-style | card shadow is forced to `none !important` (line 222), so elevation = fill only; pops use ad-hoc values |
| Gradients | 13 `linear/radial-gradient` | hero rays, shimmer, rank bars |
| Transition/animation durations in source | .12s x26, .35s x16, .2s x8, .22s x7, .26s x5, .06s x5, .28s, .18s, .55s, .95s, 1s, 1.25s, 2.6s, 4.2s | 13 different durations; two curves for press (`cubic-bezier(.2,.8,.2,1)` at line 116 and `--ios-spring` at line 253) |
| Emoji / non-SVG glyphs in rendered text | check mark U+2713 (14), star U+2605 (10), U+2640 (3), sparkles (2), heart (1) | mild: text glyphs for lucky/favorite/shadow flags next to SVG tab icons; type-emoji map at line 7231 |
| SVG icons | 10-11 per screen (nav + header), 41 on roster | SVG family is consistent (stroke 1.9, round caps); glyph flags (star, diamond, heart) in the roster row `flags` string (line 18343) are the only mixed family |
| Safe-area usages | 15 `env(safe-area-inset-*)` | handled in header, toast, nav, update banner |
| Existing quality bar | pull-to-refresh (line 4328), `haptic('light')` (5895), CSS count-up (95-99) + JS countUp (5417), `prefers-reduced-motion` global clamp (line 155) | good; keep |
| 320px | Roster OK; PvP table broken; stat strip and chips clip (nothing wraps) | |
| 768px | single column stretched to 768 (no max-width), rows are fine, tables fine; looks like a stretched phone | acceptable for a phone-first PWA but an iPad install would look stretched |

Dead space vs density: Today is dense in text but wasteful in structure (section padding ~16-20px plus nested padding adds ~44px of inset on each side at 3 levels). Raid and Log are sparse and clean; the contrast between Log (1,688px full page) and Today (18,024px) is itself an IA signal: Today is a feed of everything.

## 4. Judgement against the criteria (by area)

**Type hierarchy.** Titles are consistent in intent (`650 19px display` for card titles, `700 32px` large title) but the middle of the hierarchy is a smear of 12/12.5/13/14/15 at weights 400-700, mostly grey `--ink-400/500`. Secondary text is `#a1a1a6`/`#8a8a90` at 12-13px on `#19191b`: AA-ish (about 6.5:1 and 5.2:1 by my arithmetic) but visually weak and long. Numbers use `tabular-nums` in places (roster spread, line 2124) but not everywhere (PvP CP column, stat strip). CP at 28px 700 in the roster competes with the name at 17px.

**Spacing.** Padding values seen: 6, 7, 8, 10, 12, 14, 16, 18, 20, 22 (header margin-bottom 22px at line 299), gaps 6/7/10/12. There is no 4/8 grid; 7px and 14px/22px are off-grid. Card inner padding 14 vs 16 vs 18 across sections.

**Colour.** Tokens exist (`--surface-*`, `--ink-*`, `--line-*`, `--ios-*`, `--tt-*`) and dark is restrained, a genuine strength. Weaknesses: (a) a purple/lavender secondary accent appears for unrelated things (Server-side IV import, Max attackers link, "Show all 12", New dex entries heading), (b) green is used as accent for both success (check, "+58%") and the "Evolve now" outline and "Hunt" label, (c) red for Transfer list heading, "Dominated duplicates", warnings and Remove, (d) yellow for GBL "S" badges (fine, tier colour), (e) light-theme overrides implemented by attribute selectors on inline hex values (lines 262-275: `[style*="color:#ff8a80"]`...), brittle and a maintenance trap.

**Cards/radius/shadow.** Card radius is forced to 18 via attribute selector (line 222), but inner panels and tables keep 8 (PvP table, line 2729) and 16 (Home sections, lines 1026, 2867). Buttons: pill or 12px or 8px. No elevation tiers.

**Icons.** SVG family consistent; flags in roster row use text glyphs (star, diamond, heart, sparkles) at 11px, and Pokemon-type emoji exist in a map (7231). Recommendation: either SF-style SVG for all or text for all.

**Density/alignment/truncation.** See slop items 5, 13, 15, 16. Also header subtitle "64 Pokemon loaded . v5..." truncates the version on every screen at 390 (line 314, `white-space:nowrap`), a version string being shown in the primary header at all is a developer artifact; the tab title row has the text "v53.327" always.

**Motion.** Strengths: press scale + opacity on `.om-press`, spring on sheets, stagger on lists (`om-stagger`), shimmer skeleton, reduced-motion clamp. Issues: 13 different durations; `.om-press:active` is defined twice (lines 117 and 253, the later wins: scale .96 + opacity .7 which dims whole cards too hard for large targets, `.om-tap` .985 is right); infinite hero float and heroTwinkle/pulse animations (`0 0 0 8px` pulse at the oklch box-shadow) run on the detail sheet; the `countUp` uses `@property --n`, which is fine on current iOS but verify on the owner's iOS version (uncertain). Reduced-motion clamps to .001ms rather than removing transforms; fine.

**Touch feedback / scroll / safe area.** Good (`-webkit-tap-highlight-color` off, `touch-action`, overscroll contained, 44px `::before` strips). The strip trick makes the *visible* control still ~28-36px (many chips measure 30px tall), so mis-taps next to dense chip rows are still likely: strips overlap in the 7px gaps (chips at gap 6-7px with strips 44px tall).

**Loading/skeleton/empty/error.** Skeleton exists (line 102). Error/empty copy is plain text, see item 17. No illustrations needed, but each empty state needs one primary action.

**Copy tone.** Mostly plain and specific, which is a strength, but: "Nothing is deleted." / "Re-checks ranks, moves, keep and transfer lists, squads and the briefing." (line 1028) is feature-dump; "Worth catching for a 90%+ IV rank spread."; the boilerplate "Everything worth..." Also inconsistent words: Roster / Pokemon / collection; Transfer / Remove / Skip / Hunt / Keep (verdict vocabulary is good but unexplained); "Recs" vs "Recommendations"; "Home" vs "Setup, sync and backup" vs "Settings". The app writes both "Pokemon" (most places) and "Pokémon" (Roster header, GBL table header).

**IA.** Today: no single hero. The first screenful for a returning user is stat chips + "Scan these next" explanatory card + "Megas worth evolving" list, while the *time-sensitive* things (events live now, GBL this week) are 1,400+px down. Roster: good; the primary action (Select) is a text button top-right; filters + sort + search take 3 rows before the first Pokemon (about 270px). Home: mixes dashboard counters (Power up 5 / Evolve soon 2 / Great league projects 62), refresh, settings, import, resources and candy inputs; "Great league projects 62" is a number that is almost the whole roster, which undermines the stat.

**Delight present vs missing.** Present: haptics hook, pull-to-refresh, long-press menu, swipe actions, count-up, undo on refresh ("Undo this refresh"), batch undo for imports. Missing / weak: toast-with-Undo for Transfer/Remove from swipe (it uses a confirm sheet), skeletons on feed load, number transitions when roster changes, sheet grabber/drag-to-dismiss affordance on chat/detail (detail has a back chevron only), list-to-detail shared-element transition, filter chip selection animation, tab-bar icon state animation, empty-state illustrations.

## 5. Design system proposal

Single root cause to fix: styles live inline per element and are normalised by `!important` attribute selectors. Do not rewrite all templates. Instead introduce real tokens + utility classes and migrate screen by screen, shrinking the override layer as you go.

### 5a. Type scale (SF system, 6 roles + 1 numeric)
| Token | Size/line | Weight | Use |
|---|---|---|---|
| `--t-display` | 32/36, -.025em | 700 | Large title only |
| `--t-title` | 22/28, -.012em | 650->**600** | Screen section/card titles (replaces 17/19/20/24/26/30) |
| `--t-headline` | 17/22 | 600 | Row titles, button labels |
| `--t-body` | 15/21 | 400 | Body and secondary prose (replaces 12.5/13/14/15 prose) |
| `--t-caption` | 13/18 | 400/500 | Metadata, chips |
| `--t-micro` | 12/16, +.02em | 600 | Badges only; never body |
| `--t-num` | tabular-nums, 28/32 | 700 | Hero numbers (CP, %) |
Rules: nothing between 12 and 13 other than these; weights allowed 400/500/600/700 only (drop 650, 750, 800). Min text 12px; body prose 15px.

### 5b. Spacing, radii, elevation
- Spacing: 4, 8, 12, 16, 24, 32 (`--s-1..--s-6`). Card padding 16; gap between cards 12; page gutter 16; section gap 24. Remove 6/7/10/14/18/20/22.
- Radii: `--r-xs:6px` (badges/tags), `--r-sm:10px` (inputs, chips), `--r-md:14px` (inner panels), `--r-lg:20px` (cards, sheet top corners; also add 20px to the scale below), `--r-pill:999px`. Retire 2,3,4,5,7,8,9,12,16,18 (map by nearest). Use `corner-shape`/continuous corners only if desired; not needed.
- Elevation: three tiers, fill-based in dark, shadow-based in light. `--e0` flat (page), `--e1` card, `--e2` popover/sheet. Dark: `--bg #0b0b0d` (e0), `--surface-1 #17171a` (e1 card), `--surface-2 #212125` (inner panel / popover), `--surface-3 #2b2b30` (pressed/selected); Light: `--bg #f2f2f5`, `--surface-1 #ffffff` + shadow `0 1px 2px rgba(0,0,0,.06), 0 8px 24px rgba(0,0,0,.08)`. Inner panels must be *lighter* (dark) or *sunken-tint* (light) than their card, never black holes. Max two nesting levels.

### 5c. Colour roles (exact values, replace the current duplicated token blocks)
Dark:
```
--bg:#0b0b0d; --surface-1:#17171a; --surface-2:#212125; --surface-3:#2b2b30;
--text:#f2f2f4; --text-2:#b4b4bb; --text-3:#8e8e96;   /* text-3 >=4.5:1 on surface-1 */
--line:rgba(255,255,255,.08); --line-strong:rgba(255,255,255,.16);
--accent:#0a84ff; --accent-fill:#0a64d6; --accent-text:#6cb2ff; --on-accent:#fff;  /* white on accent-fill 5.5:1; do NOT put white text on #0a84ff (3.65:1) */
--good:#4cc38a; --warn:#ffb340; --bad:#ff6961; --info:#6cb2ff;
```
Light (contrast checked with the same WCAG formula as the proposed test: text-3 `#62626a` is 5.5:1 on white and about 5:1 on `--bg #f2f2f5`; `#6e6e76` would only be 4.1:1 on `#e8e8ed`, so it was darkened; accent-fill `#0a64d6` with white is 5.5:1; dark `--text-3 #8e8e96` is 5.5:1 on surface-1 and 4.9:1 on surface-2; dark `--accent-text #6cb2ff` is 8:1; light `--accent-text #0a58be` is 6.7:1):
```
--bg:#f2f2f5; --surface-1:#ffffff; --surface-2:#f2f2f5; --surface-3:#e8e8ed;
--text:#16161a; --text-2:#55555c; --text-3:#62626a;
--line:rgba(0,0,0,.08); --line-strong:rgba(0,0,0,.16);
--accent:#0a64d6; --accent-fill:#0a64d6; --accent-text:#0a58be; --on-accent:#fff;
--good:#12703a; --warn:#8a5a00; --bad:#b3261e; --info:#0a58be;
```
Decision to take (owner's call): use the same blue in both themes. This removes the brown/orange light accent (slop item 7). If a distinct brand colour is wanted, pick one hue (e.g. electric yellow `#ffd60a` is on-brand with Pokemon) and use it for exactly one thing: the primary button fill with dark text `#16161a` in both themes (contrast of `#16161a` on `#ffd60a` is about 14:1). Keep blue only for links. Either choice works; mixing is the problem.
Semantic usage: green only = positive delta/ready; red only = destructive/warning; one secondary accent (remove lavender except as Dragon/Psychic type colours). Type colours remain only on type chips (derived tokens `--tt-*` kept).

### 5d. Icon rules
One family: 24-grid, 1.75 stroke, round caps, `currentColor`. Replace text glyph flags (star, diamond, heart, check) in `flags` (line 18343/18966) with 12-14px SVG badges (star = Lucky, diamond = Shadow, heart = Favorite). No emoji in UI chrome; type emoji map (line 7231) should be SVG type icons or removed. Tab icons filled when active, outlined otherwise (iOS convention).

### 5e. Motion tokens
```
--dur-press:100ms; --dur-fast:160ms; --dur-base:240ms; --dur-sheet:360ms; --dur-slow:520ms;
--ease-out:cubic-bezier(.2,.8,.2,1); --ease-spring:cubic-bezier(.32,.72,0,1); --ease-in-out:cubic-bezier(.4,0,.2,1);
```
Press: `transform:scale(.97)` on small controls, `.99` on cards/rows, no opacity dim on large surfaces; enter with `--dur-press` (100ms), release with `--dur-fast` (160ms). Sheets 360ms spring. Collapse 13 durations to these 5 tokens (`--dur-press`, `--dur-fast`, `--dur-base`, `--dur-sheet`, `--dur-slow`). Stop infinite animations (hero float, twinkle) after 1 cycle or on `prefers-reduced-motion` (already clamped) and when sheet is not in view. Numbers: count-up only on first appearance per session.

### 5f. Components to unify (the real consistency win)
`Button` (filled / tinted / plain, one height 44 or 36, one radius `--r-pill`), `Chip` (single-select, multi-select), `Card` (`--r-lg`, padding 16), `Row` (leading media 40, title 17/600, subtitle 13, trailing), `SectionHeader` (title + optional caption + action), `StatusLine` (non-interactive info row: no border, no button look, 13px `--text-2`), `Sheet` (grabber + title + close). Convert attribute-selector rules (lines 221-260) into these classes and delete the selectors as each screen migrates.

## 6. Ranked fixes (30 items: #0 is the urgent bug, then #1-#29 plus #30)

Severity: S1 = looks broken/embarrassing at release, S2 = reads unfinished/inconsistent, S3 = polish.

| # | Sev | Fix | Screens | Where | How (one line) |
|---|---|---|---|---|---|
| 1 | S1 | PvP table breaks at <=390 (name wraps mid-word, collapses at 320) | PvP | 2729-2735 grid `22px 1fr 44px 74px 58px` | Convert to rows: 2-line cell (name + moves, 13px), CP + tier badge right; or drop Level column under 420px with `@container`; add `overflow-wrap:normal; word-break:keep-all`. |
| 2 | S1 | Evolve-now card layout (sprite misaligned, empty top-left) | Today | card template around lines 840-850 (`row.dupNote` at 849-850; `candyLine` built at 19474) | Make card a 2-col grid `48px 1fr auto`, align-items start, sprite top-aligned; move "needed candy" to subtitle. |
| 0 | S1 | **Light-theme toast text is white on white (invisible)** | all (light) | `.ios-toast` line 261 `color:#fff`, `--toast-bg` light ~line 198 | Change to `color:var(--ink-900)`; add a QA contrast test on the toast in both themes (section 8 item 4). Ship first. |
| 3 | S1 | Toast covers the large title/header buttons | all | `.ios-toast` line 261, status banner 303 | Move to bottom above tab bar (`bottom: calc(nav + 12px)`), 3.2s auto-dismiss, add Undo action slot, `transform` slide. |
| 4 | S1 | Roster row name truncates ("Meta...") | Roster | row template lines 2110-2170 (name row, flags at 2123, CP block ~2168) | Reduce CP to the 22px `--t-title` size (600) and set `min-width:0` on name flex with `flex:1`; move chips (Mega max XS) to line 2; show full name up to 2 lines or tail-ellipsis only at >20 chars. |
| 5 | S1 | Header subtitle shows version and truncates on every tab | all | line 314 `... v53.327` | Move version to Home > About; subtitle shows only sync state ("Synced 2m ago") or nothing. |
| 6 | S2 | Prose above every card | Today, Raid, Attackers, Recs, Home | lines 527, 548, 798, 2867 etc. | Cap helper text at one line (`--t-caption`), put the rest into an info "i" sheet; audit all `font:11.5px/1.4 ... color:var(--ink-500)` blocks. |
| 7 | S2 | "Why: ..." sentence dumps | Today (Evolve now), Recs | `dupNote` (built at line 20484, rendered at 849-850) | Replace join with a verdict chip (e.g. "Best Great League copy") + 2 metrics; rest in a disclosure row. |
| 8 | S2 | Nested black panels inside cards | Today (GBL, Events), Raid, Recs | `--surface-sunken:#0a0a0b` (token line 172) used inline, e.g. line 457 | Use `--surface-2` (lighter), `--r-md`, max 2 levels; GBL: flatten "THIS WEEK" panel into a section header. |
| 9 | S2 | Light theme accent differs from dark | all (light) | tokens lines 183-215, hex overrides 262-275 | Use blue in both (or one brand hue in both); rename `--ios-blue` to `--accent`; delete the 20 inline-hex override selectors by moving those colours to tokens. |
| 10 | S2 | Stat strip repeated on every tab | all | `stat-strip` lines 369-376 | Show only on Today; or collapse into the large-title subtitle; stop horizontal clipping (wrap into 2 rows or 3-up grid). |
| 11 | S2 | Today is a 9,000px feed with the time-sensitive content last | Today | section order in Today template (~520-1000) | Reorder: (1) What to do now (1 card, 3 actions), (2) Live events, (3) GBL this week, (4) collapsed "More ideas" sections; add section jump chips or collapse by default. |
| 12 | S2 | Type scale sprawl (17 sizes, 6 weights) | all | inline `font:` everywhere; clamp rules lines 232-233 | Introduce `--t-*` classes/vars; codemod `font:11px`->caption etc.; keep clamp until migrated; lint (see section 8). |
| 13 | S2 | Radius sprawl (17 values) | all | inline `border-radius`, rule line 221 | Map to `--r-*`; replace the global attribute override (line 222) with `.card`. |
| 14 | S2 | Home: button/label/link zoo | Home | sections at 1026, 1075, 1269, 1625 (stardust/imports) | `StatusLine` for AI/Github/Coverage; `Button` filled for the one primary per card, tinted for secondary; Import options as a 3-row list with chevrons. |
| 15 | S2 | Select-mode bar truncates count, 4 equal-weight actions | Roster | bar at line 2175 | Show "2 selected" on a first row with Done; actions as icon+label tab-style bar; Remove behind a "..." menu with confirm. |
| 16 | S2 | Swipe/long-press use confirm sheet with caps/mixed casing, no Undo | Roster | 18023-18030 | Perform action immediately, show toast "Transferred Latios . Undo"; sentence-case labels ("Remove (mistake)"). |
| 17 | S2 | Empty states unactionable; "SYNC CSV above" wrong label | Roster, PvP, Recs, Today | 19798, 19809 | Centered icon + title + one primary button ("Import roster") that triggers the same file input; hide empty tables and the stat strip when `roster.length===0`. |
| 18 | S2 | No first-run guidance (see caveat in 'Uncertain') | Today (empty) | Today template at 520-640 gated on `roster.length` | Replace Today with a 3-step first-run (Import -> Scan IVs -> Done) until roster>0; link to the import flow. |
| 19 | S2 | Chip/segment/button variants for "pick one" | Roster, PvP, Home | filters, league chips, L40/50/51, Show all | One `Chip` component (selected=filled accent tint), one `Segmented` for <=4 options; "Show all N" becomes a plain text button, not the loudest element on the screen. |
| 20 | S2 | Sheet affordances | Chat, Detail, Import sheet, Long-press | More menu 419, import sheet 433-440, chat input 412 (no grabber element exists: grep `grabber` empty) | Add 36x5 grabber, drag-to-dismiss, header with title + close; consistent top radius `--r-lg`. |
| 21 | S2 | Detail hero: rays + infinite float | Detail | 2190, 147, 2216 | Replace with a flat tinted gradient from type colour at 12% -> surface; float only once on open. |
| 22 | S2 | Tab bar IA (Home next to Today) and More menu icons | all | 3948, 419-432, 19600-19603 | Order: Today, Roster, PvP, Recs, More; move Home content to a Settings row in More or profile button; give every More row an icon; group rows with headers. |
| 23 | S3 | Caps leakage and inconsistent label case | Today GBL, update banner, sheets | 6583 layer, labels "THIS WEEK", "TAP TO RELOAD", 18026 | Remove runtime case-transform; author sentence case in templates; make `ALL CAPS` only for `--t-micro` badges. |
| 24 | S3 | Horizontal scrollers lack peek/snap | stat strip, filters, Mega-ready | `.stat-strip` CSS line 286, chips, grids at 1798-1908 | `scroll-snap-type:x proximity`, `scroll-padding:16px`, trailing fade mask. |
| 25 | S3 | Press feedback tuned | all | 117, 253-254 | Delete duplicate rule; cards `.985` no dim; buttons `.97`, dim .85 max. |
| 26 | S3 | Spacing off-grid (7, 14, 18, 22) | all | inline | Replace with scale (codemod: 7->8, 14->16, 18->16, 22->24, 10->8/12). |
| 27 | S3 | Duplicate/ambiguous vocabulary | all | copy strings | Adopt glossary in section 8 and sweep. |
| 28 | S3 | 768px stretched phone layout | iPad | root container | `max-width:560px; margin:auto` on `.app-root` content, nav stays full width. |
| 29 | S3 | Numbers: tabular figures + count-up only once | PvP, Roster, stat | various | Apply `font-variant-numeric:tabular-nums` to a `.num` class; count-up first view only. |
| 30 | S3 | Contrast re-verify of `--ink-400/300` (#8a8a90) at 12-13px on `#19191b` and lifted type tints | all dark | tokens lines 171-176 | Raise `--text-3` to `#8e8e96` min and use `--text-2` for anything under 14px; run the contrast test (section 8). |

## 7. Order of work (each step shippable and testable)

1. **Layout fixes that cannot regress** (items 1, 2, 4, 5, 3): small, local, verified by screenshots at 320/390/768 and the existing `qa_e2e_e.js` overflow checks. Ship.
2. **Tokens, no visual change** (12, 13, 26 groundwork): add the `:root` tokens from 5a-5e beside the old ones; alias old names to new (`--ios-blue: var(--accent)`). Ship invisibly; run full QA.
3. **Colour unification** (9, 30): switch light accent, delete hex-override selectors by moving colours to tokens. Screenshot diff both themes. Ship.
4. **Component pass, one screen at a time**: Roster (15, 16, 19) -> Today (6, 7, 8, 10, 11) -> Home (14) -> PvP/Raid/Recs/Attackers. After each screen, remove the corresponding attribute-selector overrides. Ship per screen.
5. **Empty/first-run and sheets** (17, 18, 20, 21, 22): bigger behavioural change; ship behind the existing QA flows (import, first launch).
6. **Motion and polish** (23-25, 27-29): last, because they depend on the new tokens.
7. Keep each step guarded by the automated checks below so the system cannot decay again.

## 8. Automating polish checks (add to `scripts/qa/qa_e2e_a..e.js`, mainly `qa_e2e_e.js`)

`qa_e2e_e.js` already scans each screen for touch targets, overflow, tiny text and unnamed controls (`SCAN`, lines 6-30). Extend `SCAN` with the following; each returns a list and the test fails past a threshold that you ratchet down over time.

1. **Type-scale conformance** (S2): collect `getComputedStyle(el).fontSize` and `fontWeight` for visible text; assert sizes are a subset of `{12,13,15,17,22,28,32}` px and weights subset of `{400,500,600,700}`. Start with a baseline (currently 17 sizes, 6 weights) and fail if the count increases; ratchet to 0 non-conforming.
2. **Radius conformance:** every element with `border-radius` must be in `{6,10,14,20,999px,50%}`; fail on new values.
3. **Spacing conformance:** for cards (`[data-card]` or `section`) assert padding and gap are multiples of 4 and that nesting depth of `background`-filled boxes is <=2.
4. **Contrast (real):** compute WCAG ratio for every visible text node against the *composited* background (walk ancestors, alpha-blend over `--bg`, treat `background-image` gradients as "skip"). Require >=4.5:1 for text <18.66px or <700 weight, >=3:1 otherwise, in both themes (`colorScheme` option exists on `session`). Exclude `.sr-only`. My prototype in `/tmp/ui-audit/measure.js` is a starting point (it has false positives on gradients and sprite letter-fallbacks; handle those).
5. **One icon family:** assert no `U+1F300-1FAFF`/`U+2600-27BF` emoji in `innerText` of chrome (header, nav, buttons, chips, rows) and that all `svg` in nav/buttons share `stroke-width` in {1.75}. Allow-list `U+2713` until replaced.
6. **No truncation of primary text:** for rows (`[data-swipe-row]` and PvP rows) assert the name element has `scrollWidth <= clientWidth` for the first 20 fixture rows at 390 (fails today for "Metagross", "Latios"). Also fail if any word is broken mid-word (`overflow-wrap:anywhere` or one-char-per-line detection: element height > 3x line-height with <6 chars per line).
7. **Layout at widths:** run all `SCREENS` at 320, 390, 402, 768; assert `overflowX==0` and no element's right edge exceeds `innerWidth` (except marked scrollers `[data-scroller]`). 320 currently fails PvP.
8. **Toast/overlay collision:** open a toast and assert its bounding box does not intersect the header title or primary controls.
9. **Copy lint:** read all visible strings; fail on regex hits for `/^[A-Z0-9 \-\/]{8,}$/` outside an allow-list, on `v\d+\.\d+` in the header, on the words from a banned list ("SYNC CSV", "free" as a label, "Build dev"), on a screen with >2 lines of `--t-caption` prose directly under a title.
10. **Motion tokens:** parse `document.styleSheets` and inline `transition/animation` durations; assert each is in `{100,160,240,360,520}ms` or `infinite` only on `[data-ambient]`; assert no infinite animations on the detail sheet when `prefers-reduced-motion` (emulate via `page.emulateMedia({reducedMotion:'reduce'})`: all `getAnimations()` finished within 50ms).
11. **Visual regression:** Playwright `toHaveScreenshot`-style snapshots of the 9 screens x 2 themes at 390 with the pinned fixture, `maxDiffPixelRatio:0.002`; update deliberately.
12. **Empty-state contract:** with no roster, assert each screen shows exactly one visible primary button and no table header.

## 9. External references

Apple Human Interface Guidelines pages relevant to this plan (URLs from memory, **not fetched this session; verify before quoting**): Typography https://developer.apple.com/design/human-interface-guidelines/typography, Layout (safe areas) https://developer.apple.com/design/human-interface-guidelines/layout, Sheets https://developer.apple.com/design/human-interface-guidelines/sheets, Tab bars https://developer.apple.com/design/human-interface-guidelines/tab-bars, Color https://developer.apple.com/design/human-interface-guidelines/color, Motion https://developer.apple.com/design/human-interface-guidelines/motion, Accessibility https://developer.apple.com/design/human-interface-guidelines/accessibility. I have not verified specific numbers (tab count limits, exact minimum sizes) against these pages, so the recommendations above rest on the in-app evidence and the 44pt target the app already adopts, not on a quoted HIG rule. I deliberately make no claims about other named apps.

## 10. What to keep

True-black/graphite dark theme, SF font stack, 44pt tap strips, hairlines, swipe + long-press, pull-to-refresh, haptics, count-up, undo for refresh/import, sentence-case intent, safe-area handling, reduced-motion clamp, the sprite/tier-badge visual identity. These are the premium base; the plan removes noise on top of it rather than redesigning.
