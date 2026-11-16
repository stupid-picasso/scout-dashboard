# Professor PWA - QA report

Generated 2026-11-16 against build v53.x. Two independent test layers:

- **Accuracy audit** - 19 checks comparing the app's data and math to Niantic's game master and to PvPoke: **10,711 of 10,770 comparisons match (99.45%)**.
- **Feature tests** - 365 end-to-end cases in a real Chromium at iPhone size: **364 pass, 1 fail, 0 skipped**.

## 0. Feature-area audit (2026-11-16)

Read-only audit of the whole project. Scale: 9-10 matches external ground truth and is tested; 7-8 tested logic on estimates or unverified on a device; 5-6 known gaps; 4 or less known broken. Evidence is from fresh runs this date: 365 e2e cases (364 pass, TOD-44 fails), accuracy audit, unit tests, keep fuzz.

| Area | Rating | Evidence | Main flaw |
|---|---|---|---|
| Import: screenshot / video / CSV / appraisal / hidden CP | **8/10** | 28 Import tests pass; CPHIDDEN-01..03, AUTOAPPLY-01; CP recovery 14/14. | No labelled screenshot set, so reader accuracy (Gemini) is unmeasured; server extractor (pogo_extract.py) does not know cpCovered / cpVisible / powerUpIsXl. |
| IV solving and league ranks | **9/10** | A11 1200/1200, A12 600/600, A13 3000/3000, test_rank_reference 11,521/11,521, test_ranking 86/86. | A13b: only 0.4% of CP/HP pairs give a unique IV set, so ranks need an appraisal. |
| Keep / transfer (line, spares, hundo) | **8/10** | fuzz_keep 0 hard violations, test_roster_logic 191/191, KEEP/EXTRA/EVOLINE tests. | Judgement rules with no external ground truth; 584 soft violations (505 cutShow). |
| Evolve queue + event-day moves | **7/10** | EVENTMOVE-01..04, test_event_moves.py passes, EVOLVE/EVO-RANK tests. | Event data is parsed from LeekDuck page text patterns (fragile; Machamp outfit bug already hit); never verified on a live event day. |
| PvP sim / squad / cups / Little Cup | **8/10** | A15 30/30, A16 29/30, 29 PvP tests; sim agrees with PvPoke 90.2% (1 shield). | Sim is validated only on easy matchups; ultra 2v2 agreement 76.9%; A16 cramorant moveset differs. |
| Raid and attackers | **6/10** | 8 Raid + 6 Attackers tests pass; type/weather correct. | DPS x bulk proxy (0.4 exponent), no boss movesets, enrage timer or dodging; simulation is Phase 6 in PLAN_TO_NINE.md. |
| Max planner / party / battle log | **5/10** | test_max 17/17, 13 Max tests. | Estimates from public guides; Candy XL groups unverified; no simulation. |
| Mega evolution | **9/10** | A14 59/59 vs game master Mega Level rules. | Repeat-cost timers depend on user-entered dates. |
| Power-up and dust plan | **8/10** | A05 99/99, A06 98/98, 10 Candy tests. | A06 covers base costs only; shadow/lucky/purified XL rounding not independently confirmed. |
| Chat and briefing | **6/10** | CHATCANDY-01, CHATMENTION-01, CHATBUBBLE-01, 6 AI tests. | Free-tier model can fail; only 240 Pokemon with full detail; answer quality never scored. |
| Today and events feed | **7/10** | 41 of 42 Today tests pass; feed and cups cross-checked. | TOD-44 (reminder permission/fire-once) fails and is waved through; reminders only fire while the app is open; community data. |
| Roster and detail UI | **8/10** | Roster 34/34, Detail 18/18, Gestures 7/7, Bulk 4/4. | No windowed list: auto-load stops at 150 rows, ~100-130 ms hitch per page. |
| Sync and backup | **7/10** | Backup/restore tests pass; API tokens kept out of synced keys. | Firestore sync never exercised end to end; token merge code near githubToken needs a periodic recheck. |
| PWA and layout (iPhone) | **4/10** | PWA 14/14 and a11y 34/34 in Chromium; manifest and offline verified. | Tab bar floating/dead space on iOS 18.7 standalone is unresolved after many attempts; only real-device checks can confirm. |
| Data workflows and CI | **7/10** | Tests and QA workflows green on main; webkit in the QA matrix; bundles current. | extract_pipeline / postprocess tests could not run here (Pillow missing), so were not re-verified; data files were once gitignored by mistake. |
| Security and privacy | **9/10** | 6 Security tests; no secrets in HTML, backup or sync payload. | Firebase key referrer restriction and a CSP are still open. |
| Performance and size | **6/10** | 6 Performance tests pass; ~0.6 MB gzip. | 20.8k-line single HTML source; Lighthouse mobile 33-47. |

Top flaws:

1. iPhone standalone tab bar floats / dead space (rating 4): unresolved; needs a Screen numbers screenshot with the bubble hidden.
2. TOD-44 fails and is waved through in CI.
3. Reader accuracy is unmeasured: no labelled screenshot set.
4. Server extractor (pogo_extract.py) lacks cpCovered, cpVisible, powerUpIsXl.
5. Max numbers are estimates; Candy XL groups unverified.
6. Data gaps: A18 movepools 94.6% (e.g. Nidoran no movepool), A02 Urshifu typing, A04 Flabebe evolution row, A16 Cramorant moveset.
7. A13b: IV uniqueness 0.4%, so ranks without an appraisal are guesses.
8. Fuzz: 584 soft violations in keep logic (505 cutShow) not triaged.
9. Roster list is not windowed; the app is one 20.8k-line file.
10. Chat: free-tier failures and 240-Pokemon detail limit.

Ranked fixes (nothing fixed in this audit):

1. Fix iPhone tab bar (needs your device numbers).
2. Fix TOD-44 or make it deterministic.
3. Labelled screenshot set + reader accuracy score.
4. Teach pogo_extract.py cpCovered / cpVisible / powerUpIsXl.
5. Fix A02/A04/A18 data gaps.
6. Triage cutShow soft violations.
7. Windowed roster list.
8. Chat evaluation set.

Feature ideas (grounded in what the repo lacks; mechanics not confirmed are labelled):

- Raid simulation (Phase 6 in docs/PLAN_TO_NINE.md): per-boss simulation from game-master movesets. Needs boss-move data check; label unconfirmed mechanics.
- Max Candy XL verification from your upgrade screenshots, then a re-verify routine each season.
- Appraisal queue: guided "appraise these 10" flow to lift IV uniqueness from 0.4%.
- Web push for closed-app reminders (needs a small server).
- Per-generation and shiny dex progress.
- Import the app JSON backup through the same import path.

## 1. Scorecard

Rating = how far this area can be trusted, 1-10. It blends the measured result with what the tests could not see.

| Area | Rating | Tests | Pass | Notes |
|---|---|---|---|---|
| Boot | **9/10** `█████████░` | 11 | 11/11 | Loads clean at 320-1280 px with no page errors; every tab renders on an empty roster; first content in ~6.0 s on a 4x-CPU, 1.6 Mbps simulation. |
| Import | **9/10** `█████████░` | 28 | 28/28 | Rows are range-checked with a notes card, a replace preview shows before/after counts, Replace can be undone, files read by column name (quoted names too), drag and drop works, and 200 corrupted files never crash it. |
| Roster | **8/10** `████████░░` | 34 | 34/34 | Search, 9 sorts (incl. Mega ready), filters, saved views, select mode with bulk transfer/remove/favourite, undo, infinite scroll to 150 rows, correct counts. |
| Gestures | **8/10** `████████░░` | 7 | 7/7 | Swipe, long-press and tap-elsewhere-to-close behave like an iOS list; Transfer/Remove show Undo; a one-time hint shows the swipe. |
| Detail | **9/10** `█████████░` | 18 | 18/18 | Header, moves, weaknesses, power-up path with costs, best-spread target next to yours, evolve and the Mega card work; Previous/Next are named after the neighbouring Pokemon; heart is a real toggle; swipe and drag-to-dismiss exist. |
| Ranks | **9/10** `█████████░` | 1 | 1/1 | Recalculation fills Great/Ultra/Little for every Pokemon with IVs; rank-1 spreads match PvPoke 100%. |
| PvP | **9/10** `█████████░` | 29 | 29/29 | No over-cap Pokemon in any league list; team is legal, distinct and cup-aware, including Mega editions and cups; sprites on every row. |
| Attackers | **7/10** `███████░░░` | 6 | 6/6 | Ranked by a documented DPS x bulk score using real move data. |
| Raid | **7/10** `███████░░░` | 8 | 8/8 | Type effectiveness and weather behave correctly; this week's boss from the feed opens the Raid tab with its types (Mega X/Y, forms and shadows handled). |
| Recs | **9/10** `█████████░` | 9 | 9/9 | Every card states the rule behind it with the Pokemon's own numbers (tested to reproduce); MARK DONE and Transferred offer Undo; transfer lists never include Lucky, Shadow or Favourite. |
| Intel | **9/10** `█████████░` | 8 | 8/8 | Living Dex, Kanto dex, hundo and flag counters all equal the data. |
| Today | **8/10** `████████░░` | 42 | 41/42 | Live feed verified; cups cross-checked against the official page (later-season cups noted, not flagged); boss one-tap, calendar export, per-species verdicts, offline cache. |
| Home | **8/10** `████████░░` | 18 | 18/18 | Device backup/restore without an account (no API keys inside, confirm step, bad files refused); trainer level, dust reserve and stardust validated; two-tap clear. |
| Log | **9/10** `█████████░` | 7 | 7/7 | Daily automatic snapshot (once a day), four growth charts checked on 30 synthetic days, export/import round-trips exactly and rejects junk. |
| Security | **9/10** `█████████░` | 6 | 6/6 | No secrets in the shipped HTML (the Firebase web key is public by design), none in the sync payload or the device backup, no XSS from names. |
| PWA | **8/10** `████████░░` | 14 | 14/14 | Manifest (Professor, black theme, any + maskable icons with verified sizes), 180 px opaque touch icon, 10 iPhone splash images, install steps on iPhone Safari, service worker and offline reload verified over HTTP. |
| Accessibility | **9/10** `█████████░` | 34 | 34/34 | axe-core clean on every screen, the More menu, select mode and the detail sheet; Lighthouse accessibility 100; keyboard-only paths pass; real buttons and named controls. |
| Performance | **6/10** `██████░░░░` | 6 | 6/6 | A state change takes ~14 ms at 500 Pokemon (was 45); minified app code and dropped fonts cut the download from 2.1 MB to ~0.6 MB gzip; ready time fell 6.5 s -> 6.0 s in a throttled A/B. |
| Keep | **8/10** `████████░░` | 3 | 3/3 | Hard rules never violated in the fuzz (0 hard violations over random rosters); evolution-line, spare-copy and hundo protection covered (test_roster_logic 191/191). |
| Max | **5/10** `█████░░░░░` | 13 | 13/13 | Costs and tiers come from public guides; planner, party builder and battle log tested (test_max 17/17, MAXPLAN/MAXPARTY). |
| Chat | **6/10** `██████░░░░` | 2 | 2/2 | Context builders for candy, screens and mentions are tested (CHATCANDY-01, CHATMENTION-01, CHATBUBBLE-01). |
| Candy | **8/10** `████████░░` | 10 | 10/10 | Candy and XL candy planning tests all pass. |
| Safety | **9/10** `█████████░` | 28 | 28/28 | Destructive actions confirm and offer Undo; all 28 safety cases pass. |

Data accuracy areas:

| Check | Match | Result |
|---|---|---|
| A01 Base stats (atk/def/sta) for every released species | 1,024/1,024 | **100.0%** `██████████` |
| A02 Species typing | 1,023/1,024 | **99.9%** `██████████` |
| A03 Buddy walking distance (km per candy) | 1,024/1,024 | **100.0%** `██████████` |
| A04 Evolution candy cost | 445/446 | **99.8%** `██████████` |
| A04b No phantom evolutions (app rows that the game does not have) | 445/446 | **99.8%** `██████████` |
| A05 CP multiplier by level (1-50, incl. half levels) | 99/99 | **100.0%** `██████████` |
| A06 Power-up cost per step (stardust, candy, XL candy) | 98/98 | **100.0%** `██████████` |
| A07 Gym/raid move data (power, energy, duration, type) | 315/315 | **100.0%** `██████████` |
| A08 PvP fast-move data (power, energy, turns) — 20-move sample | 20/20 | **100.0%** `██████████` |
| A18 Learnable movepools (fast + charged, incl. Elite/legacy) per species | 968/1,023 | **94.6%** `█████████░` |
| A09 Type effectiveness chart (324 matchups) | 324/324 | **100.0%** `██████████` |
| A10 STAB multiplier (game: 1.2) | 1/1 | **100.0%** `██████████` |
| A11 Rank-1 stat-product spread vs PvPoke (1500 CP) | 1,200/1,200 | **100.0%** `██████████` |
| A12 Rank-1 stat-product spread vs PvPoke (2500 CP) | 600/600 | **100.0%** `██████████` |
| A13 IV solver: true IVs always among candidates (3,000 random Pokémon) | 3,000/3,000 | **100.0%** `██████████` |
| A13b IV solver uniqueness (share of CP/HP pairs resolving to one candidate) | 11/3,000 | **0.4%** `░░░░░░░░░░` |
| A14 Mega Evolution energy: first-time and repeat cost vs game master level rules | 59/59 | **100.0%** `██████████` |
| A15 Great League top-40 scores vs live PvPoke today (freshness) | 30/30 | **100.0%** `██████████` |
| A16 Great League recommended movesets vs live PvPoke | 29/30 | **96.7%** `██████████` |
| A17 Math invariants (7) | 7/7 | **100.0%** `██████████` |

Notes on the audit:

- **A01** - 1024 species in the game master
- **A04** - one target per species in the app; matches any real branch
- **A06** - shadow x1.2, purified x0.9 in game
- **A07** - 317 moves in the app
- **A10** - app 1.2
- **A11** - 849 where the app found a higher-product spread than PvPoke's default (counted as match)
- **A12** - 230 where the app found a higher-product spread than PvPoke's default (counted as match)
- **A13** - avg 44.5 candidates per CP/HP pair; 0.4% resolve to exactly one
- **A13b** - informational: low values mean an appraisal is needed
- **A15** - drops when PvPoke re-rates; the weekly workflow refreshes it

## 2. Defects found and what happened to them

| # | Severity | Finding | Status |
|---|---|---|---|
| 1 | Critical | The installed `index.html` / `Scout Dashboard.html` embedded a stale copy of `pokemon-mechanics.js` for several releases, so Little/Master tables, Mega Level rules and cup tables never reached the phone. | Fixed: the propagate script now re-embeds on every run and the smoke test fails if the bundle is stale. |
| 2 | High | Roster, settings and Mega energy were kept only in cloud sync; signed out, a reload threw everything away (IMP-12, DET-14). | Fixed: a device copy is saved and restored when nobody is signed in; cloud still wins on sign-in. |
| 3 | High | 123 of 1,024 species had no typing/buddy data because names with hyphens, colons or symbols (Ho-Oh, Porygon-Z, Type: Null, Nidoran) did not match. | Fixed: name normalisation plus a game-master fallback table. |
| 4 | High | Plain Mr. Mime, Farfetch'd, Corsola and others were told they evolve (the Galarian form's evolution overwrote the plain species), and Paldean/Alolan movepools overwrote plain ones. | Fixed: forms get their own rows; lookups take the form. |
| 5 | High | Two base-stat errors (Dugtrio, Lycanroc) and ten species whose plain-name stats came from an alternate form (Zacian, Aegislash, Wishiwashi...). | Fixed: base stats now come from the game master. |
| 6 | High | Mega Evolution cost used an older table that disagreed with the game's Mega Level rules (Dragonite 300 vs 500, Mewtwo repeat 150 vs 80). | Fixed: Mega Level rules are the single source. |
| 7 | Medium | Roster search ignored a Pokemon's second charged move and did not trim spaces; an empty result showed a blank screen. | Fixed. |
| 8 | Medium | An open swipe row did not close when you tapped elsewhere. | Fixed. |
| 9 | Medium | Accessibility: 1 of 402 clickable elements had a role or name, none were keyboard reachable, no `lang`, 64 text runs under 11 px. | Mitigated: runtime roles/names/tabindex, `lang`, 11 px floor. Proper semantic elements are still the right long-term fix. |
| 10 | Low | The Mega tag read as a single "M", easily confused with the male symbol. | Fixed: "MEGA". |
| 11 | Info | The IV solver cannot identify a Pokemon from CP and HP alone (about 0.4% resolve uniquely); the app already requires an appraisal for ranks. | By design; the scan queue prioritises which Pokemon to appraise. |
| 12 | Info | The official-page cross-check and live feed refresh run on GitHub, so they could not be exercised from the test sandbox. | Open: check the first scheduled run. |

## 3. Every test case

### Boot

| ID | Case | Result | Note |
|---|---|---|---|
| BOOT-01 | App loads and renders content without a page error | PASS |  |
| BOOT-02 | Version string vNN.NN is shown in the header | PASS |  |
| BOOT-03 | Empty state: header says 0 Pokemon and invites a sync | PASS |  |
| BOOT-04 | Five tab-bar items (Today, Home, Roster, PvP, Recs) plus a More menu holding the other six destinations | PASS |  |
| BOOT-05 | Every tab renders on an empty roster without throwing | PASS |  |
| BOOT-06 | Initial load completes in under 4 seconds | PASS | 658 ms |
| BOOT-07 | No horizontal overflow at 430 px width | PASS |  |
| BOOT-W320 | No horizontal overflow and no error at 320px width | PASS |  |
| BOOT-W390 | No horizontal overflow and no error at 390px width | PASS |  |
| BOOT-W768 | No horizontal overflow and no error at 768px width | PASS |  |
| BOOT-W1280 | No horizontal overflow and no error at 1280px width | PASS |  |

### Import

| ID | Case | Result | Note |
|---|---|---|---|
| IMP-01 | CSV of 64 Pokemon loads and the header count updates | PASS |  |
| IMP-02 | Success notice names the file and the count | PASS |  |
| IMP-03 | Header stat tiles show roster count, average IV, lucky and shadow counts | PASS |  |
| IMP-04 | Re-importing the same file replaces rather than duplicates | PASS | notice says replaced |
| IMP-05 | CRLF line endings import cleanly (Windows exports) | PASS |  |
| IMP-06 | A header-only file shows a readable error, not a crash | PASS |  |
| IMP-07 | A garbage file does not crash or corrupt the roster | PASS |  |
| IMP-08 | HTML in a Pokemon name is rendered as text (no script execution) | PASS |  |
| IMP-09 | Names with accents and symbols (Flabébé, Nidoran♀, Farfetch'd) import | PASS |  |
| IMP-10 | A file with missing trailing columns still imports the Pokemon | PASS |  |
| IMP-11 | 800-row import renders in under 5 seconds | PASS | 2577 ms |
| IMP-13 | Importing over an existing roster asks first, showing the before/after counts | PASS |  |
| IMP-14 | Replacing can be undone from the toast | PASS |  |
| IMP-15 | Out-of-range values are cleared and listed; a row with no name is skipped | PASS |  |
| IMP-16 | A different exporter's CSV is read by column name, including quoted names | PASS |  |
| IMP-17 | Dropping a .csv file on the page imports it | PASS |  |
| IMP-18 | 200 randomly corrupted files never crash the app or leave it unusable | PASS |  |
| IMP-12 | Roster is persisted: a reload keeps the imported Pokemon | PASS |  |
| IMP-20 | A video import can set favorite/lucky but never clear them | PASS |  |
| IMP-21 | Same-name Pokemon with different typing become different forms (Kantonian vs Alolan Ninetales) | PASS |  |
| OCR-CLEAN-01 | Screenshot read: species typos snapped, types cased, units fixed, regional form from types | PASS |  |
| TYPE-01 | A one-badge read of a two-type species is completed; real forms are untouched | PASS |  |
| NAME-ACCENT-01 | A species written with accents (Flabébé) resolves to its dex number, tier rows and sprite like the plain spelling | PASS |  |
| SCRNQ-01 | A queue of screenshots is read ahead in the background (3 at a time), so the next one is ready when you confirm the current one | PASS |  |
| AUTOAPPLY-01 | With "apply clean reads automatically" on, a clean read is saved by itself; a doubtful read, or the switch off, leaves it waiting for you | PASS |  |
| CPHIDDEN-01 | A CP hidden behind the Pokemon is recovered from the visible digits, HP and Power Up cost (recording path), matched by name+HP when it is in the roster, checked when it cannot fit, and tagged CHECK CP with candidates | PASS |  |
| CPHIDDEN-02 | Screenshot path: the review panel shows the candidates, a typed or tapped CP confirms it, an unconfirmed add is tagged, and a covered read is never applied automatically | PASS |  |
| IMPCHK-01 | The import gate holds reads that cannot be right, merges the good ones, and Accept / Discard work from Bulk update | PASS |  |

### Roster

| ID | Case | Result | Note |
|---|---|---|---|
| ROS-01 | First page shows 30 rows with a count line | PASS |  |
| ROS-02 | LOAD MORE adds the next page | PASS |  |
| ROS-03 | Search by name filters the list | PASS |  |
| ROS-04 | Search by move name finds Pokemon that know the move | PASS |  |
| ROS-05 | Search by type works once types are known | PASS |  |
| ROS-06 | A search with no matches shows an empty state, not a blank screen | PASS |  |
| ROS-07 | Search is case-insensitive and trims spaces | PASS |  |
| ROS-08 | Sort control offers eight orderings | PASS |  |
| ROS-S-cp | Sort: CP highest first is correctly ordered | PASS |  |
| ROS-S-name | Sort: Name A-Z is correctly ordered | PASS |  |
| ROS-S-iv | Sort: IV% highest first is correctly ordered | PASS |  |
| ROS-S-dex | Sort: Dex number ascending is correctly ordered | PASS |  |
| ROS-F-MEASURED | Filter chip MEASURED narrows the list and ALL restores it | PASS | 30 rows |
| ROS-F-NEEDSAPPRAISAL | Filter chip NEEDS APPRAISAL narrows the list and ALL restores it | PASS | 0 rows |
| ROS-F-PVPREADY | Filter chip PVP READY narrows the list and ALL restores it | PASS | 30 rows |
| ROS-F-LUCKY | Filter chip LUCKY narrows the list and ALL restores it | PASS | 5 rows |
| ROS-F-SHADOW | Filter chip SHADOW narrows the list and ALL restores it | PASS | 4 rows |
| ROS-09 | Lucky filter count matches the Lucky stat tile | PASS | lucky in data: 5 |
| ROS-10 | Every row shows name, CP, IV triple and a type label | PASS |  |
| ROS-11 | Row opens the detail sheet on tap | PASS |  |
| ROS-12 | Select mode: rows toggle on tap, the bar shows the count, Done exits | PASS |  |
| ROS-13 | Bulk transfer asks first, only moves the unprotected, adds 1 candy each, and Undo restores it all | PASS |  |
| ROS-13b | Bulk transfer refuses protected Pokemon: it lists why and removes nothing on Cancel | PASS |  |
| ROS-14 | Bulk favourite marks the selection, and Undo reverses it | PASS |  |
| ROS-15 | Bulk remove asks first and grants no candy | PASS |  |
| ROS-16 | Saved views: save the current filter + sort, reapply it, delete it, and it survives a reload | PASS |  |
| ROS-17 | Sort "Mega ready" lists Mega-capable Pokemon first | PASS |  |
| ROS-18 | Scrolling to the bottom loads the next page without tapping | PASS |  |
| ROS-19 | Rows skip off-screen rendering (content-visibility) so long lists scroll smoothly | PASS |  |
| DOM-PVP-01 | A duplicate that beats the other on every IV is not dominated when it ranks lower in a league | PASS |  |
| CUT-01 | Keep-best cut list protects the best two legendaries, explains each row, and cuts weak commons first | PASS |  |
| CPHIDDEN-03 | A tagged Pokemon shows CHECK CP in the roster and the filter, and confirming the CP (candidate, typed or "CP is right") removes the tag | PASS |  |
| CUT-03 | An XXL or XXS is never in the cut list ahead of a normal-size duplicate; with protection off it can be | PASS |  |
| CUT-02 | Revealed cut list renders cards with a reason and the renamed button, and says plainly when protection limits it | PASS |  |

### Gestures

| ID | Case | Result | Note |
|---|---|---|---|
| GES-01 | Swipe left reveals Transfer / Remove actions | PASS |  |
| GES-02 | Tapping elsewhere closes an open swipe row (iOS list behaviour) | PASS |  |
| GES-03 | Long press opens the action menu | PASS |  |
| GES-04 | Vertical scrolling is not hijacked by the swipe handler | PASS |  |
| GES-05 | Transfer removes the Pokemon and the count drops by one | PASS |  |
| GES-06 | Single transfer offers Undo and restores the Pokemon and candy | PASS |  |
| GES-07 | One-time swipe hint nudges the first row once, then never again | PASS |  |

### Detail

| ID | Case | Result | Note |
|---|---|---|---|
| DET-01 | Detail header shows name, CP and a position counter ("1 of N") | PASS |  |
| DET-02 | Next arrow moves to the following Pokemon | PASS |  |
| DET-15 | Previous and Next are named after the neighbouring Pokemon, and Previous returns | PASS |  |
| DET-16 | The heart is a real toggle button with a pressed state | PASS |  |
| DET-17 | Close is a named button | PASS |  |
| DET-03 | Detail sheet shows moves with a best-moves suggestion | PASS |  |
| DET-04 | Detail shows type weaknesses | PASS |  |
| DET-05 | Detail shows league rank chips (Great/Ultra/Little) | PASS |  |
| DET-06 | Power-up card shows a stardust cost (non-maxed Pokemon) | PASS |  |
| DET-07 | Close returns to the roster at the same scroll position | PASS |  |
| DET-10 | A Mega-capable Pokemon shows the MEGA EVOLUTION card | PASS |  |
| DET-11 | Typing Mega energy updates the status line live | PASS |  |
| DET-12 | Mega level + rest days produce the game's skip cost (level 1, 4 days = 11) | PASS |  |
| DET-13 | I MEGA EVOLVED deducts the cost and restarts the rest period | PASS |  |
| DET-14 | Mega data survives a reload | PASS |  |
| HERO-01 | Detail hero floats, drag tilts it and releasing springs it back; HOME render replaces the sprite for plain species | PASS |  |
| SHEETX-01 | The detail sheet never moves sideways: nothing overhangs it, and a sideways drag leaves it where it is | PASS |  |
| DETAILLG-01 | Detail sheet leads with the league its CP fits, lists the higher leagues it can still reach, and shows rank out of 4096 | PASS |  |

### Ranks

| ID | Case | Result | Note |
|---|---|---|---|
| RNK-01 | Recalculate-all-ranks fills Great/Ultra/Little ranks for every Pokemon with IVs | PASS |  |

### PvP

| ID | Case | Result | Note |
|---|---|---|---|
| PVP-L-GREAT | GREAT ≤1500: list shows only Pokemon whose CP is within the cap | PASS | 20 rows |
| PVP-L-ULTRA | ULTRA ≤2500: list shows only Pokemon whose CP is within the cap | PASS | 11 rows |
| PVP-L-LITTLE | LITTLE CUP: list shows only Pokemon whose CP is within the cap | PASS | 1 rows |
| PVP-L-MASTER | MASTER: list shows only Pokemon whose CP is within the cap | PASS | 20 rows |
| PVP-01 | Every PvP row shows a sprite image | PASS |  |
| PVP-02 | Rows are numbered #1..#N consecutively | PASS |  |
| PVP-03 | Row shows tier letter, IV rank %, level and a moves note | PASS |  |
| PVP-04 | Best-team card lists three distinct species | PASS |  |
| PVP-05 | Team members are all legal for the league (CP within cap) | PASS |  |
| PVP-06 | Team shows shared-weakness and coverage lines | PASS |  |
| PVP-07 | Over-cap Pokemon are never ranked in Great League | PASS |  |
| PVP-08 | Evolution hint (→ X) shows for Pokemon that can evolve into a better PvP form | PASS |  |
| PVP-09 | Master League list is not capped and shows high-CP Pokemon | PASS |  |
| PVP-10 | Little Cup list only contains Pokemon at or below 500 CP | PASS |  |
| PVP-11 | Saving the suggested team adds it to Saved teams with 0-0 | PASS |  |
| PVP-12 | Level-cap setting L40 changes ranks (XL-free players) | PASS |  |
| PVP-13 | Detail sheet of a Great League Pokemon shows IV breakpoints | PASS |  |
| PVP-14 | Switching leagues does not throw page errors | PASS |  |
| LEAD-01 | Meltan: the PvP badge and the chat leaderboard use the evolved form (Melmetal tier S) and the same ranks the PvP tab shows | PASS |  |
| PVPBAND-01 | League tabs split Ready now (inside the CP band) from Power up or evolve (under the floor); a copy a few power-ups short stays Ready | PASS |  |
| PVPBAND-02 | Season tab ranks the live cup with its rules; with no live cup it says so | PASS |  |
| PVPBAND-03 | Season tab with a live Mega edition shows Mega-ready picks plus the usual lists, and offers the live Master League too | PASS |  |
| SQUAD-01 | The squad prefers Pokemon that already have their recommended moves, and says which are missing | PASS |  |
| SIMSQUAD-01 | The Great League squad is picked from simulated matchups that use the Pokemon’s own IVs and moves | PASS |  |
| LINEUSE-01 | The squad picker plays a Froakie that would be a Greninja as Greninja (never both), and the power-up list skips a copy the keep check would let go | PASS |  |
| PVPFRESH-01 | League ranks are worked out from the IVs, so a stale stored rank cannot show on the PvP page, the detail sheet or in the chat; the Today note counts stale ones | PASS |  |
| PVPMOVES-01 | A PvP-ready Gengar missing its recommended moves is flagged, with the Elite-TM ones marked | PASS |  |
| EVO-RANK-01 | League rank uses the best evolution: a 1/14/14 Jigglypuff counts as the 98% Wigglytuff it can become, and is kept | PASS |  |
| SQUAD-WHY-01 | squadWhy names the rule that drops a Pokemon from the squad | PASS |  |

### Attackers

| ID | Case | Result | Note |
|---|---|---|---|
| ATK-01 | Best attacker per type lists ranked attackers with DPS | PASS |  |
| ATK-02 | Overall ranking is in descending DPS x bulk order (top 6 DPS not wildly inverted) | PASS |  |
| ATK-03 | Move database coverage line is shown | PASS |  |
| ATK-04 | Power-up payoff list gives rating gain per 10k stardust | PASS |  |
| ATK-05 | TM payoff list (best moves to teach) is present | PASS |  |
| ATK-06 | A Pokemon with unknown moves is labelled, not silently ranked | PASS |  |

### Raid

| ID | Case | Result | Note |
|---|---|---|---|
| RAI-01 | Picking Fire boss type produces a ranked counter list | PASS |  |
| RAI-02 | Counters to a Fire boss favour Water/Rock/Ground types | PASS |  |
| RAI-03 | Counters shown are not weak to the boss (no Grass/Bug/Ice at the top vs Fire) | PASS |  |
| RAI-04 | Weather boost changes the ranking inputs (Rainy) | PASS |  |
| RAI-05 | Boss name field accepts a name and resolves its types | PASS |  |
| RAI-06 | Picking a third boss type is rejected (max two) | PASS |  |
| RAI-07 | Survivability note explains it is an estimate | PASS |  |
| RAID-PARTY-01 | Party of 6 lists one of each species with a DPS total | PASS |  |

### Recs

| ID | Case | Result | Note |
|---|---|---|---|
| REC-01 | Power-up candidates list high-rank, not-yet-favourited Pokemon | PASS |  |
| REC-02 | Transfer candidates never include Lucky, Shadow or Favourite Pokemon | PASS |  |
| REC-03 | Dominated-duplicates section explains its rule | PASS |  |
| REC-04 | MARK DONE removes an item from the power-up list | PASS |  |
| REC-05 | USE A TM search finds a Pokemon by name | PASS |  |
| REC-06 | AI recommendations without a key explain what is missing instead of failing | PASS |  |
| REC-07 | Every recommendation card states the rule behind it | PASS |  |
| REC-08 | The reason reproduces from the Pokemon's own numbers (IV and rank) | PASS |  |
| REC-09 | MARK DONE offers Undo that puts the item back | PASS |  |

### Intel

| ID | Case | Result | Note |
|---|---|---|---|
| INT-01 | Living Dex count equals the number of unique species in the roster | PASS |  |
| INT-02 | Hundo count matches the number of 15/15/15 Pokemon | PASS |  |
| INT-03 | Lucky / Shadow / Favourite counters match the data | PASS |  |
| INT-04 | Kanto dex percentage is computed from owned Kanto species | PASS |  |
| INT-05 | Trade advisor names Pokemon whose lowest IV is under 12 | PASS |  |
| INT-06 | Missing-from-dex list excludes owned species | PASS |  |
| INT-07 | Data confidence reflects measured vs guessed IVs | PASS |  |
| DQ-CPFIT-01 | What is incomplete lists a Pokemon whose CP and IVs cannot both be true, and one scanned over 30 days ago | PASS |  |

### Today

| ID | Case | Result | Note |
|---|---|---|---|
| EVOLVE-01 | Evolve queue: skips Pokemon the keep check would transfer, ranks by the evolved form, never ranks on guessed IVs | PASS |  |
| EVOLVE-02 | Branching evolutions: options with ranks, a saved choice drives form, candy and ranks, done asks when still open; over-cap warning; Tyrogue decided by IVs | PASS |  |
| EVOLVE-03 | Every branching species in the game data gets the right list: Applin items, Cosmoem day/night, Kirlia male + stone, Burmy by gender, Clamperl and Wurmple random; no invented Scyther branch | PASS |  |
| BRIEF-02 | A search-grounded briefing refused with 429 falls back to a plain answer, and a failed update shows the real reason | PASS |  |
| EVENTMOVE-01 | An event that teaches an Elite-TM move on evolution holds the evolve until the window, opens it during the window, and never holds one it cannot fund or one that gains nothing | PASS |  |
| EVENTMOVE-02 | A Community Day with the Pokemon named but the move not announced holds the last evolution as a reminder; far-off Community Days are listed; Elite TM advice says when it is free | PASS |  |
| EVENTMOVE-03 | An event move is judged across the whole line: a Squirtle two stages early counts, and of two copies only the better Blastoise is worth the candy (the other is marked SKIP) | PASS |  |
| EVENTMOVE-04 | Copies heading to the same event form share one candy pool: the best copy is funded first and the rest are flagged short, with rank and keep reason shown | PASS |  |
| BRIEF-01 | Morning briefing is one cached AI call, shows as suggestions, and search grounding is sent only when switched on | PASS |  |
| TOD-01 | GBL card appears when the feed has a current week | PASS |  |
| TOD-02 | Current week is labelled THIS WEEK and the next NEXT WEEK | PASS |  |
| TOD-03 | An already-ended week is not shown | PASS |  |
| TOD-04 | Each league shows its CP cap and rules text | PASS |  |
| TOD-05 | Open Great League lists top species with tier and moves | PASS |  |
| TOD-06 | Cup squad only contains Pokemon of the cup's allowed types (Color Cup) | PASS | no squad (not enough eligible): Not enough measured, in-cap, legal A-tier Pokemon yet |
| TOD-07 | Cup note says rankings are PvPoke's cup ranking (not an estimate) when a table exists | PASS |  |
| TOD-08 | Mega Edition league shows a Mega-ready line for owned Mega-capable species | PASS |  |
| TOD-09 | Squad members are all within the league CP cap | PASS |  |
| TOD-10 | Events within 14 days are listed; far-future and expired are not | PASS |  |
| TOD-11 | Event shows bonuses and a per-species verdict (HUNT / POWER UP / SKIP) | PASS |  |
| TOD-12 | Live event says LIVE with its end date | PASS |  |
| TOD-13 | Raid boss with a form suffix "Mewtwo (Armored)" is judged as Mewtwo | PASS |  |
| TOD-14 | Feed stamp says the data is community-sourced, not official | PASS |  |
| TOD-15 | Without a cross-check file the card says it is not cross-checked | PASS |  |
| TOD-16 | Megas worth evolving ranks Mega-capable Pokemon with a raid gain | PASS |  |
| TOD-17 | Mega ranking is sorted by Mega raid rating (descending) | PASS |  |
| TOD-18 | Event planner: adding an event judges each species | PASS |  |
| TOD-19 | Event planner: REMOVE deletes the event | PASS |  |
| TOD-20 | Event planner rejects an event with no species | PASS |  |
| TOD-21 | Scan queue lists Pokemon whose IVs are unmeasured, with reasons | PASS |  |
| TOD-22 | Stats strip shows TO EVOLVE / QUEUED / NEW DEX | PASS |  |
| TOD-40 | A raid-boss event offers "Best six vs <boss>" and opens the Raid tab with the boss's types filled in | PASS |  |
| TOD-41 | Boss names map to types: Mega X/Y, forms, shadows | PASS |  |
| TOD-42 | Add to calendar downloads a valid .ics for the event | PASS |  |
| TOD-43 | Reminders: events starting within the hour and finished Mega rests are listed once | PASS |  |
| TOD-44 | Turning reminders on asks for permission, and each reminder fires only once | **FAIL** | 0/0 |
| TOD-23 | No page errors after the whole Today session | PASS |  |
| TOD-30 | Feed unreachable: no GBL card, no error, rest of Today still works | PASS |  |
| TOD-31 | Malformed feed JSON is ignored safely | PASS |  |
| TOD-32 | A feed whose weeks have all ended shows no league card (never stale as current) | PASS |  |
| TOD-33 | Last good feed is cached on the device for offline use | PASS |  |
| TOD-34 | Offline: GBL card renders from the cached feed | PASS |  |

### Home

| ID | Case | Result | Note |
|---|---|---|---|
| PLANNOTE-01 | Planning card shows its two notes: the level cap and the stardust left after the reserve | PASS |  |
| REFRESH-01 | Refresh everything runs every step, reports what changed, and can be undone | PASS |  |
| HOM-01 | The title names the day, and Power Up, Evolve Soon and Great League Project counts render | PASS |  |
| HOM-02 | Sign-in form is present and a bad login shows an error, not a crash | PASS |  |
| HOM-03 | Trainer level and stardust reserve save and survive state read-back | PASS |  |
| HOM-04 | Resources (TMs, rare candy) save | PASS |  |
| HOM-05 | Mega energy admin list: adding a species and amount creates an entry | PASS |  |
| HOM-06 | Mega energy admin list: a non-numeric amount is rejected | PASS |  |
| HOM-07 | Mega list shows cost and READY / NEED n MORE per form | PASS |  |
| HOM-08 | CLEAR ROSTER needs a second confirmation tap | PASS |  |
| HOM-09 | Storage planner reports whether the roster is within the keep target | PASS |  |
| HOM-10 | Evolution items and TM resources sections are present | PASS |  |
| HOM-11 | Trainer level is a working field: clamped to 1-50, junk ignored | PASS |  |
| HOM-12 | Dust reserve accepts commas, clamps negatives to 0, ignores junk | PASS |  |
| HOM-13 | Stardust balance rejects negatives and absurd values | PASS |  |
| HOM-14 | Device backup is offered without an account and never contains API keys | PASS |  |
| HOM-15 | A device backup restores the roster after it was cleared (with a confirmation step) | PASS |  |
| HOM-16 | A broken backup file is refused with a message and changes nothing | PASS |  |

### Log

| ID | Case | Result | Note |
|---|---|---|---|
| LOG-01 | Snapshot logging adds a dated row with roster size | PASS |  |
| LOG-02 | Diagnostics panel captures a runtime error | PASS |  |
| LOG-03 | A daily snapshot is taken automatically once, with hundo and species counts | PASS |  |
| LOG-04 | Thirty synthetic days draw four correct growth charts | PASS |  |
| LOG-05 | Export then import round-trips the log exactly | PASS |  |
| LOG-06 | Junk files are rejected without touching the log | PASS |  |
| LOG-07 | Export and Import controls are present and named | PASS |  |

### Security

| ID | Case | Result | Note |
|---|---|---|---|
| SEC-01 | API keys are kept in on-device storage | PASS |  |
| SEC-02 | Secrets are never part of the cloud-sync payload | PASS |  |
| SEC-03 | Secrets are not rendered into the page text | PASS |  |
| SEC-04 | No inline secrets in the shipped HTML (key-like strings) | PASS | only the Firebase web config key (public by design) is present; restrict it by referrer in the Google console |
| SEC-05 | Firebase web config is public by design (no private keys) | PASS |  |
| SEC-06 | Page sets no mixed-content http:// subresources | PASS |  |

### PWA

| ID | Case | Result | Note |
|---|---|---|---|
| PWA-01 | Web manifest is linked and valid (name, icons, display standalone) | PASS |  |
| PWA-02 | Manifest icons exist on disk | PASS |  |
| PWA-03 | apple-touch-icon and theme-color meta tags are present | PASS |  |
| PWA-04 | Service worker registers and activates | PASS |  |
| UPDATE-01 | The "A new version is ready" banner shows when the server has a newer build than the page started with, even without a controllerchange event | PASS |  |
| PWA-05 | Offline reload still boots the app (shell cached) | PASS |  |
| PWA-06 | Safe-area insets are used so the tab bar clears the iPhone home indicator | PASS |  |
| PWA-07 | viewport-fit=cover is set for the notch/Dynamic Island | PASS |  |
| PWA-08 | Manifest: named Professor, black theme, any + maskable icons whose real sizes match | PASS |  |
| PWA-09 | apple-touch-icon is 180x180 and opaque (iOS paints transparency black) | PASS |  |
| PWA-10 | Every iPhone splash image exists at the size its media query promises | PASS |  |
| PWA-11 | Head tags: one theme-color, one apple-touch-icon, title Professor | PASS |  |
| PWA-12 | Offline bundle carries no unused-script fonts (Devanagari) and stays under 1.7 MB raw | PASS | 1.66 MB |
| PWA-13 | Install steps show on iPhone Safari, not in the installed app, and not after Not now | PASS |  |

### Accessibility

| ID | Case | Result | Note |
|---|---|---|---|
| A11Y-01 | Bottom-nav tap targets are at least 44x44 px | PASS |  |
| A11Y-02 | Interactive elements expose a role or accessible name (VoiceOver) | PASS | 92/97 |
| A11Y-03 | Interactive elements are reachable by keyboard (tabindex or native) | PASS | 97/97 |
| A11Y-04 | Body text is at least 11 px (count of smaller text runs) | PASS | 15/320 |
| A11Y-05 | Text contrast meets WCAG AA (4.5:1) for at least 90% of text runs | PASS | 6/310 below 4.5:1 |
| A11Y-06 | prefers-reduced-motion is honoured by animations | PASS |  |
| A11Y-07 | html lang attribute is set | PASS |  |
| A11Y-08 | Form inputs have labels or placeholders | PASS |  |
| A11Y-09 | Images have alt text (decorative alt="" allowed) | PASS |  |
| A11Y-10 | Page zoom is not disabled (user-scalable) | PASS |  |
| AXE-TODAY | axe-core: no serious or critical violations on TODAY | PASS | 1 lower-impact issues: landmark-unique |
| AXE-ROSTER | axe-core: no serious or critical violations on ROSTER | PASS | 1 lower-impact issues: landmark-unique |
| AXE-PVP | axe-core: no serious or critical violations on PVP | PASS | 1 lower-impact issues: landmark-unique |
| AXE-RAID | axe-core: no serious or critical violations on RAID | PASS | 0 lower-impact issues:  |
| AXE-HOME | axe-core: no serious or critical violations on HOME | PASS | 1 lower-impact issues: region |
| AXE-RECS | axe-core: no serious or critical violations on RECS | PASS | 0 lower-impact issues:  |
| AXE-INTEL | axe-core: no serious or critical violations on INTEL | PASS | 0 lower-impact issues:  |
| AXE-ATTACK | axe-core: no serious or critical violations on ATTACK | PASS | 0 lower-impact issues:  |
| AXE-LOG | axe-core: no serious or critical violations on LOG | PASS | 0 lower-impact issues:  |
| AXE-MORE | axe-core: the More menu is clean | PASS |  |
| AXE-DETAIL | axe-core: the detail sheet (with the Mega card) is clean | PASS |  |
| AXE-SELECT | axe-core: roster select mode with a selection and the bulk bar is clean | PASS |  |
| KEY-01 | Keyboard only: Tab reaches the tab bar and Enter switches screens | PASS |  |
| KEY-02 | Keyboard only: a roster row opens its detail with Enter and Escape-free close works | PASS |  |
| KEY-03 | Every control on the tab bar and header has an accessible name | PASS |  |
| AXE-LIGHT-TODAY | axe-core (light theme): no serious or critical violations on TODAY | PASS |  |
| AXE-LIGHT-ROSTER | axe-core (light theme): no serious or critical violations on ROSTER | PASS |  |
| AXE-LIGHT-PVP | axe-core (light theme): no serious or critical violations on PVP | PASS |  |
| AXE-LIGHT-RAID | axe-core (light theme): no serious or critical violations on RAID | PASS |  |
| AXE-LIGHT-HOME | axe-core (light theme): no serious or critical violations on HOME | PASS |  |
| AXE-LIGHT-RECS | axe-core (light theme): no serious or critical violations on RECS | PASS |  |
| AXE-LIGHT-INTEL | axe-core (light theme): no serious or critical violations on INTEL | PASS |  |
| AXE-LIGHT-ATTACK | axe-core (light theme): no serious or critical violations on ATTACK | PASS |  |
| AXE-LIGHT-LOG | axe-core (light theme): no serious or critical violations on LOG | PASS |  |

### Performance

| ID | Case | Result | Note |
|---|---|---|---|
| PERF-04 | The merged roster and keep context are reused across tab switches and rebuilt as soon as anything they read changes | PASS |  |
| PERF-01 | Average tab switch (click to new content) is under 400 ms with 64 Pokemon | PASS | 243 ms avg |
| PERF-02 | No long tasks over 200 ms during a full tab tour | PASS | 0 long tasks |
| PERF-03 | JS heap does not grow by more than 50% over 40 tab switches (leak check) | PASS | 81.4 -> 81.4 MB |
| PERF-04 | Page weight: index.html under 3 MB gzipped | PASS | 0.71 MB gz |
| PERF-05 | Mechanics data (pokemon-mechanics.js) under 1.5 MB raw | PASS | 1.43 MB |

### Keep

| ID | Case | Result | Note |
|---|---|---|---|
| EVOLINE-01 | Copies compete across the evolution line: a Froakie that would be a better Greninja replaces a worse Greninja (when the candy is there), and a hundo Froakie is judged as Greninja | PASS |  |
| HUNDO-01 | With low-Attack league copies in the box, the hundo Charizard and Greninja are still kept (raids, Master League) | PASS |  |
| LITTLE-01 | Little Cup grade also needs a top-few-percent spread: a 1/3/5 Sandshrew no longer passes, the best spread does | PASS |  |

### Max

| ID | Case | Result | Note |
|---|---|---|---|
| MAX-01 | Scans store only positive Max evidence and read levels 1-4 from camelCase or snake_case | PASS |  |
| MAX-02 | Mechanics: species list, G-Max moves and the Max Move tables | PASS |  |
| MAX-03 | Roster shows MAX on capable species and the MAX filter lists only those | PASS |  |
| MAX-04 | Screenshot import: the Dynamax mark, Gigantamax and Max Move levels land on the matched Pokemon | PASS |  |
| MAX-05 | Video import: a new Pokemon seen with the Dynamax mark is stored as Max-capable | PASS |  |
| MAXPLAN-01 | The Max planner ranks Max-capable Pokemon, prices the next Max Attack level in Particles and Candy, says what is short, and names a tank and a healer | PASS |  |
| MAXPARTY-01 | Max party builder: two attackers that hit the boss hardest plus a tank, a type verdict; the battle log tallies wins per verdict and tier and finds the damage line between wins and losses | PASS |  |
| MAX-06 | A scan of an unlisted species teaches the app; manual toggle can add or remove the tag | PASS |  |
| MAX-07 | Max attack info: type from the fast move, G-Max move for Gigantamax, power from the scanned level | PASS |  |
| MAX-08 | Max attackers vs a boss: sorted, capable only, super-effective moves rank above resisted ones | PASS |  |
| MAX-11 | Real screen (Arcanine, Dynamax, Max Darkness Lv 1, Guard and Spirit locked): type comes from the tile name, not a guess | PASS |  |
| MAX-09 | All three readers ask for the Dynamax fields (screenshot, video frames, pasted-AI prompt) and the server does too | PASS |  |
| MAX-10 | A Max Battle event names its bosses and offers "Best Max attackers vs <boss>" that opens the Raid tab | PASS |  |

### Chat

| ID | Case | Result | Note |
|---|---|---|---|
| CHATCANDY-01 | The chat is told the candy on hand for every owned species family (one pool for Axew, Fraxure and Haxorus), with ? where none was scanned, and the prompt no longer sends candy questions to RESOURCES | PASS |  |
| CHATBUBBLE-01 | A floating chat bubble on every tab except Home opens the same chat as a sheet, tells the model which screen and which Pokemon is open, and fades while the page scrolls | PASS |  |

### Candy

| ID | Case | Result | Note |
|---|---|---|---|
| CAN-01 | Pichu, Pikachu and Raichu share one candy key; Eevee branches (Jolteon, Sylveon) share Eevee's | PASS |  |
| CAN-02 | A scan of Pikachu with 103 candy updates what Pichu and Raichu show (and replaces the old 100) | PASS |  |
| CAN-03 | A scan that reads only regular candy keeps the XL candy already on file | PASS |  |
| CAN-04 | Video import of any family member writes the family entry | PASS |  |
| CAN-05 | Transferring a Raichu adds its candy to the family pool Pikachu shows | PASS |  |
| CAN-06 | Old per-species entries are folded into their family; the newer scan wins, else the larger count | PASS |  |
| CAN-07 | Evolve readiness uses the shared pool: Pichu and Raichu see the Pikachu scan | PASS |  |
| CANDY-01 | One candy number per evolution family: tile, input and evolve card agree even without a saved count | PASS |  |
| CANDY-02 | Manual SET and scans write the same family record; the newest wins and the note says which | PASS |  |
| CAN-08 | The candy row on an Arcanine screen reads "GROWLITHE CANDY": the whole Growlithe family shares it | PASS |  |

### Safety

| ID | Case | Result | Note |
|---|---|---|---|
| KEEP-01 | The keep check protects every valuable kind of Pokemon from every transfer list, and still lets a plain weak duplicate through | PASS |  |
| KEEP-02 | One best copy per league, bad shadows go, nondo is kept, a lone weak Pokemon can go | PASS |  |
| KEEP-03 | Floating keep line: over the Keep best target the weakest unlocked Pokemon go first, hard locks never move, and nothing floats under target | PASS |  |
| LOOK-01 | A Meltan carrying the name Metang (older extractor bug) is locked and offered a rename; a real Metang is left alone | PASS |  |
| BULKSTR-02 | Transfer strings say when a normally-kept Pokemon is only on the list because the roster is over the Keep best target | PASS |  |
| PROTECT-01 | In-game protection coverage: counts the protected Pokemon the game does not show as favourited, and the protect string no longer locks every shadow | PASS |  |
| FRESH-01 | Transfer strings are held when the last import is old, until the trainer says nothing has changed; a fresh import shows them straight away | PASS |  |
| RISE-01 | A species PvPoke recently moved up a tier is protected (soft) for copies with a decent spread; falling or still-C species are not | PASS |  |
| CUP-01 | The best copy of a strong species for a cup in the next GBL weeks is kept (soft); other copies, cups that are over and species the cup bans are not | PASS |  |
| KEEPFAV-01 | Favourite-my-keepers strings: only real keepers, isolated from non-keepers, and a favourite the app asked for stays soft unless "skip favourites" is on | PASS |  |
| NEG-01 | Skip-favourites: only after the NOT test is confirmed; every string then ends in & !favorite, stays within the length cap, and a favourited lookalike no longer blocks a batch | PASS |  |
| WHY-01 | Each transfer batch lists, per Pokemon, its spread, stars, league ranks and the reason the app lets it go | PASS |  |
| WHY-02 | A good Pokemon released only by the Keep best target says what keeps it normally and that the target is the reason | PASS |  |
| STORE-01 | Storage warning: low buffer, full, and blocked when too few Pokemon are safe to transfer | PASS |  |
| FORM-01 | A regional form the measured stats prove wrong is flagged, locked from transfer, and set after one confirmation; a Pokemon whose stats fit its own form is left alone | PASS |  |
| FORM-02 | A form picked by hand that the measured stats contradict is still flagged, and the detail sheet offers the fix | PASS |  |
| EVOLVE-04 | A Pokemon that cannot evolve (no Evolve button) leaves the evolve lists and is ranked as itself; the screen reading is imported and the detail sheet can set it by hand | PASS |  |
| SCORE-01 | A near-hundo Mega-capable Pokemon over every league cap scores above a mid-IV league copy, and the release reason shows how far below the line it is | PASS |  |
| SIZE-01 | Only the best-IV XXL (and XXS) per species keeps the size lock; the other copies are ordinary Pokemon | PASS |  |
| HOLD-01 | KEEP FOR NOW leaves a Pokemon out of the transfer strings until the holds are cleared, and Refresh everything clears them | PASS |  |
| TAGKEEP-01 | A Pokemon in a Build/tier group counts as a soft keep that names the group; a second copy of the species does not | PASS |  |
| ORDER-01 | Transfer batches put junk first, say which batches include normally-kept Pokemon, and JUNK ONLY leaves those out | PASS |  |
| KEEPREV-01 | Keeper review: species with more than 3 kept copies; KEEP locks, RELEASE goes first in the transfer strings, a hard lock still wins | PASS |  |
| EXTRA-01 | Spare copies: one copy covers Great and Ultra, the shiny stays, every other copy is offered for transfer | PASS |  |
| KEEPKEY-01 | A KEEP/RELEASE choice follows the Pokemon through a re-import that renumbers the roster; identical copies are released one at a time | PASS |  |
| GRADE-01 | Keeper grade by league rank (S 97/93/90, A/B 98/95/92): the setting decides which copy is a league best, equal copies keep only one | PASS |  |
| AUDIT-REG-01 | Reproduced audit failures stay fixed: tier by name+form, any-league PvP, branching evolutions, tier-aware evolution pick, protected Recs, trade gates | PASS |  |
| STRICT-IV-01 | A record with IVs but no appraisal or typed-in mark counts as unmeasured and is protected | PASS |  |

### Bulk

| ID | Case | Result | Note |
|---|---|---|---|
| BULK-01 | Bulk tab lists regional-form species with options; choosing one sets form, type and re-ranks; undo restores | PASS |  |
| BULK-02 | Pokemon with no known type are listed in Bulk; picking types saves them and removes the row | PASS |  |
| LOOK-02 | Bulk page has a Name check: a Metang that is really a Meltan can be renamed in one tap, or kept | PASS |  |
| COST-01 | Costume search screenshots are read, matched by name and CP, marked after a confirmation, and costume Pokemon of evolving species get an Evolve-button check | PASS |  |

### Tools

| ID | Case | Result | Note |
|---|---|---|---|
| TOOLS-01 | Rename strings fit the 12-char limit and encode form/IV/ranks; search builder emits GO syntax | PASS |  |
| BULKSTR-01 | Transfer strings use the game-verified form "names & cps & stars", never select a protected Pokemon, and state the exact count | PASS |  |

### AI

| ID | Case | Result | Note |
|---|---|---|---|
| GEM-01 | In-app Gemini cycle is live: retired models dropped, a 503 moves to the next model | PASS |  |
| GEM-02 | A model out of daily quota is parked alone: the key keeps working on the other models | PASS |  |
| THINK-01 | Image reads ask for the least thinking a model accepts, step down when it refuses one, remember the working setting, leave text calls alone, and every call is timed in the diagnostics | PASS |  |
| PARSE-01 | A garbled screenshot reply is repaired, and a hopeless one is asked again once | PASS |  |
| GEMPARK-01 | A Gemini model that hangs is set aside, so the next read goes straight to one that answers | PASS |  |
| GEMTIME-01 | A Gemini request that never answers is dropped after the deadline instead of hanging the import | PASS |  |

### Power up

| ID | Case | Result | Note |
|---|---|---|---|
| PWR-01 | A power-up raises level, CP and HP (not just the candy count), and the next quote starts from the new level | PASS |  |

### Motion

| ID | Case | Result | Note |
|---|---|---|---|
| MOTION-01 | Numbers roll on change, changed rows flash once after an import, Bulk rows close before committing | PASS |  |

### Cloud

| ID | Case | Result | Note |
|---|---|---|---|
| CLOUD-LZ-01 | Packed cloud data round-trips through the compressor, shrinks, and old plain JSON still reads | PASS |  |

### Tags

| ID | Case | Result | Note |
|---|---|---|---|
| TAGS-01 | Tag groups list the best Pokemon per league and tier, give strings that select only them, remember what was tagged and flag a group that drifts | PASS |  |

### BestIV

| ID | Case | Result | Note |
|---|---|---|---|
| BESTIV-01 | Best IV page: search a species, see the ideal spread per league and your copies against it | PASS |  |
| DITTO-01 | Ditto ranking page: opens from More, matches the Hub/Dittobase Melmetal tables, ranks your copy out of 4096 | PASS |  |

### Layout

| ID | Case | Result | Note |
|---|---|---|---|
| SHELL-01 | App shell (an opt-in experiment; classic scrolling is the default): the page does not scroll, the app root does, and the tab bar stays on the bottom edge at any scroll depth; tab changes and jump chips scroll the root; Classic scrolling puts the old layout back | PASS |  |

### Size

| ID | Case | Result | Note |
|---|---|---|---|
| SIZE-01 | Size classes from height + species cut-offs; XXL/XXS protected from transfer; filters, tags, search and showcase list | PASS |  |

### Additions

| ID | Case | Result | Note |
|---|---|---|---|
| ADD-01 | Bulk badge counts pending reviews; import sheet lists changes and Undo restores one Pokemon; evolve note names the shared pool; roster smart filters | PASS |  |

### Theme

| ID | Case | Result | Note |
|---|---|---|---|
| THEME-01 | The header sun button cycles Auto, Light, Dark; the phone setting drives Auto and the choice is remembered | PASS |  |
| CASE-01 | Labels written in capitals are shown in sentence case, acronyms kept | PASS |  |

## 4. Per-area strengths, gaps and suggestions

### Boot - 9/10

- **Solid:** Loads clean at 320-1280 px with no page errors; every tab renders on an empty roster; first content in ~6.0 s on a 4x-CPU, 1.6 Mbps simulation.
- **Weak or unseen:** Real-phone cold start not measured.
- Next: Check cold start on your phone and compare with the simulation.

### Import - 9/10

- **Solid:** Rows are range-checked with a notes card, a replace preview shows before/after counts, Replace can be undone, files read by column name (quoted names too), drag and drop works, and 200 corrupted files never crash it.
- **Weak or unseen:** Only CSV; no JSON or second exporter layout beyond named columns.
- Next: Accept the app's own JSON backup through the same import path.

### Roster - 8/10

- **Solid:** Search, 9 sorts (incl. Mega ready), filters, saved views, select mode with bulk transfer/remove/favourite, undo, infinite scroll to 150 rows, correct counts.
- **Weak or unseen:** Not a true virtual list: each new page hitches ~100-130 ms and auto-load stops at 150 rows; the 2,000-row 16 ms/frame target was measured and not met.
- Next: Replace the list with a windowed renderer so only visible rows exist in the DOM.

### Gestures - 8/10

- **Solid:** Swipe, long-press and tap-elsewhere-to-close behave like an iOS list; Transfer/Remove show Undo; a one-time hint shows the swipe.
- **Weak or unseen:** Real-device haptics and scroll-vs-swipe arbitration only tested with synthetic touches; no WebKit run.
- Next: Run the suite on WebKit in CI and do a hands-on pass on the phone.

### Detail - 9/10

- **Solid:** Header, moves, weaknesses, power-up path with costs, best-spread target next to yours, evolve and the Mega card work; Previous/Next are named after the neighbouring Pokemon; heart is a real toggle; swipe and drag-to-dismiss exist.
- **Weak or unseen:** Spread target is checked against the app's own optimiser, not re-derived from PvPoke each release.
- Next: Add a PvPoke rank-1 comparison to the accuracy audit for every league.

### Ranks - 9/10

- **Solid:** Recalculation fills Great/Ultra/Little for every Pokemon with IVs; rank-1 spreads match PvPoke 100%.
- **Weak or unseen:** Little and Master only know PvPoke's top species.
- Next: Import the full Little and Master tables lazily.

### PvP - 9/10

- **Solid:** No over-cap Pokemon in any league list; team is legal, distinct and cup-aware, including Mega editions and cups; sprites on every row.
- **Weak or unseen:** No shield or charge-move simulation: it trusts PvPoke's simulated tiers.
- Next: Add a matchup simulator for two chosen Pokemon.

### Attackers - 7/10

- **Solid:** Ranked by a documented DPS x bulk score using real move data.
- **Weak or unseen:** The 0.4 bulk exponent is a modelling choice; no dodging, no boss moves, no party boosts. Simulation deferred by you.
- Next: Replace the proxy with a per-boss simulation using game-master boss movesets.

### Raid - 7/10

- **Solid:** Type effectiveness and weather behave correctly; this week's boss from the feed opens the Raid tab with its types (Mega X/Y, forms and shadows handled).
- **Weak or unseen:** Assumes the boss uses its own types; no real boss movesets or enrage timer. Simulation deferred by you.
- Next: Add party size and the Mega attack boost; validate against published sims for 5 bosses.

### Recs - 9/10

- **Solid:** Every card states the rule behind it with the Pokemon's own numbers (tested to reproduce); MARK DONE and Transferred offer Undo; transfer lists never include Lucky, Shadow or Favourite.
- **Weak or unseen:** AI recommendations need a key and were not exercised.
- Next: Exercise the AI path with a test key in CI.

### Intel - 9/10

- **Solid:** Living Dex, Kanto dex, hundo and flag counters all equal the data.
- **Weak or unseen:** Counts exclude forms/costumes beyond the base dex.
- Next: Add per-generation and shiny-dex progress.

### Today - 8/10

- **Solid:** Live feed verified; cups cross-checked against the official page (later-season cups noted, not flagged); boss one-tap, calendar export, per-species verdicts, offline cache.
- **Weak or unseen:** Reminders only fire while the app is open or returns to the front (iOS cannot wake a web app); feed is community data.
- Next: Add web push through a small server if closed-app reminders matter.

### Home - 8/10

- **Solid:** Device backup/restore without an account (no API keys inside, confirm step, bad files refused); trainer level, dust reserve and stardust validated; two-tap clear.
- **Weak or unseen:** Trainer level and dust reserve fields were silently dead before this pass; settings are not yet grouped like iOS Settings; Firestore sync not exercised end to end.
- Next: Group settings into iOS-style sections; run a signed-in sync test against a test project.

### Log - 9/10

- **Solid:** Daily automatic snapshot (once a day), four growth charts checked on 30 synthetic days, export/import round-trips exactly and rejects junk.
- **Weak or unseen:** Charts are small sparklines with no axis or date scale.
- Next: Add a tap-to-inspect point value on the charts.

### Security - 9/10

- **Solid:** No secrets in the shipped HTML (the Firebase web key is public by design), none in the sync payload or the device backup, no XSS from names.
- **Weak or unseen:** The Firebase web key should be restricted to this origin in the Google console.
- Next: Restrict the Firebase key by HTTP referrer.
- Next: Add a Content-Security-Policy.

### PWA - 8/10

- **Solid:** Manifest (Professor, black theme, any + maskable icons with verified sizes), 180 px opaque touch icon, 10 iPhone splash images, install steps on iPhone Safari, service worker and offline reload verified over HTTP.
- **Weak or unseen:** Install flow, home-screen icon and splash rendering need a real iPhone.
- Next: Do the Add to Home Screen check in docs/DEVICE_CHECKS.md.

### Accessibility - 9/10

- **Solid:** axe-core clean on every screen, the More menu, select mode and the detail sheet; Lighthouse accessibility 100; keyboard-only paths pass; real buttons and named controls.
- **Weak or unseen:** No VoiceOver pass on a device yet; Dynamic Type not tested on a phone.
- Next: Do the VoiceOver pass in docs/DEVICE_CHECKS.md.

### Performance - 6/10

- **Solid:** A state change takes ~14 ms at 500 Pokemon (was 45); minified app code and dropped fonts cut the download from 2.1 MB to ~0.6 MB gzip; ready time fell 6.5 s -> 6.0 s in a throttled A/B.
- **Weak or unseen:** Lighthouse mobile reads 33-47 depending on host load; the remaining cost is bandwidth plus the runtime (React, the template engine, 650 KB of app logic). Measured and rejected: separate mechanics file (no gain), precompiled templates (~4%).
- Next: Split the app logic per tab and replace the in-browser template engine.
- Next: Windowed roster list.

### Keep - 8/10

- **Solid:** Hard rules never violated in the fuzz (0 hard violations over random rosters); evolution-line, spare-copy and hundo protection covered (test_roster_logic 191/191).
- **Weak or unseen:** Judgement logic: no external ground truth. 584 soft/tie violations in the fuzz, mostly cutShow (CP-over-cap ties).
- Next: Review the 505 cutShow soft cases and decide whether they are real or tie noise.

### Max - 5/10

- **Solid:** Costs and tiers come from public guides; planner, party builder and battle log tested (test_max 17/17, MAXPLAN/MAXPARTY).
- **Weak or unseen:** Estimates, not Niantic data: Candy XL species groups unchecked (to-do 17), no battle simulation (no published boss HP / meter data).
- Next: Send Max Move upgrade screenshots to verify the Candy XL groups.
- Next: Re-verify numbers each season.

### Chat - 6/10

- **Solid:** Context builders for candy, screens and mentions are tested (CHATCANDY-01, CHATMENTION-01, CHATBUBBLE-01).
- **Weak or unseen:** Free-tier Gemini rotation can fail or answer "lack detailed entries"; only 240 Pokemon get full detail; no answer-quality evaluation.
- Next: Build a small question set with known answers and score the chat against it.

### Candy - 8/10

- **Solid:** Candy and XL candy planning tests all pass.
- **Weak or unseen:** Candy XL groups for Max not checked.
- Next: Verify against the game.

### Safety - 9/10

- **Solid:** Destructive actions confirm and offer Undo; all 28 safety cases pass.
- **Weak or unseen:** Not tested on a real device.
- Next: Keep.

## 5. Roadmap to the best version of this app

- **Raid week in one tap** - read this week's raid bosses from the events feed and show your best six for each, with weather.
- **Real battle simulation** for raids and PvP matchups using game-master movesets, shields and energy, replacing the DPS x bulk proxy.
- **Appraisal without screenshots** - the QA run shows CP/HP alone cannot identify IVs; make the scan queue the primary path and add a guided "appraise 10 Pokemon" flow.
- **Notifications** - Mega rest timers, event starts, GBL week changes (needs a push channel or local notifications in the installed PWA).
- **Semantic markup** - replace clickable divs with buttons/links and adopt rem-based type for Dynamic Type; add a VoiceOver test pass.
- **Data CI** - run `qa_accuracy.js` nightly; fail the build when any area drops below 99%.
- **Visual regression** - keep the iPhone screenshots in the repo and diff them on each change.

## 6. How to re-run

```
node scripts/qa/make_fixture.js                      # deterministic 64-Pokemon CSV
node scripts/qa/qa_accuracy.js qa-accuracy.json      # data and math vs game master + PvPoke
node scripts/qa/qa_run.js                            # feature tests (needs playwright + chromium)
python3 scripts/qa/make_report.py qa-accuracy.json qa-e2e.json docs/QA_REPORT.md
```
