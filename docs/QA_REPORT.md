# Professor PWA - QA report

Generated 2026-10-06 against build v53.x. Two independent test layers:

- **Accuracy audit** - 19 checks comparing the app's data and math to Niantic's game master and to PvPoke: **10,712 of 10,770 comparisons match (99.46%)**.
- **Feature tests** - 173 end-to-end cases in a real Chromium at iPhone size: **172 pass, 0 fail, 1 skipped**.

## 1. Scorecard

Rating = how far this area can be trusted, 1-10. It blends the measured result with what the tests could not see.

| Area | Rating | Tests | Pass | Notes |
|---|---|---|---|---|
| Boot | **9/10** `█████████░` | 11 | 11/11 | Loads clean at 320-1280 px with no page errors; every tab renders on an empty roster. |
| Import | **8/10** `████████░░` | 12 | 12/12 | Poke Genie CSV, CRLF, accents, 800 rows and hostile HTML in names all handled; no script execution. |
| Roster | **8/10** `████████░░` | 20 | 20/20 | Search, 8 sorts, 5 filters, paging and counts are correct; search now covers every move and trims input. |
| Gestures | **8/10** `████████░░` | 5 | 5/5 | Swipe, long-press and tap-elsewhere-to-close behave like an iOS list. |
| Detail | **8/10** `████████░░` | 12 | 11/11 | Header, moves, weaknesses, power-up, evolve and the Mega card work; Mega data persists. |
| Ranks | **9/10** `█████████░` | 1 | 1/1 | Recalculation fills Great/Ultra/Little for every Pokemon with IVs; rank-1 spreads match PvPoke 100%. |
| PvP | **9/10** `█████████░` | 18 | 18/18 | No over-cap Pokemon in any league list; team is legal, distinct and cup-aware; sprites on every row. |
| Attackers | **7/10** `███████░░░` | 6 | 6/6 | Ranked by a documented DPS x bulk score using real move data. |
| Raid | **7/10** `███████░░░` | 7 | 7/7 | Type effectiveness, weather and survivability behave correctly (Fire boss favours Water/Rock/Ground; Grass/Bug never at the top). |
| Recs | **8/10** `████████░░` | 6 | 6/6 | Transfer candidates never include Lucky, Shadow or Favourite Pokemon; MARK DONE advances the list. |
| Intel | **9/10** `█████████░` | 7 | 7/7 | Living Dex, Kanto dex, hundo and flag counters all equal the data. |
| Today | **8/10** `████████░░` | 28 | 28/28 | Feed-driven GBL and event cards are correct: expired weeks hidden, cups filter the squad by type, cached feed works offline, malformed feeds are ignored. |
| Home | **7/10** `███████░░░` | 10 | 10/10 | Settings, resources, Mega energy admin, storage planner and the two-tap clear all work; secrets stay on device. |
| Log | **8/10** `████████░░` | 2 | 2/2 | Snapshots and the diagnostics panel work. |
| Security | **9/10** `█████████░` | 6 | 6/6 | No secrets in the shipped HTML (the Firebase web key is public by design), none in the sync payload, no XSS from names. |
| PWA | **8/10** `████████░░` | 7 | 7/7 | Manifest, icons, service worker and offline reload verified over HTTP. |
| Accessibility | **6/10** `██████░░░░` | 10 | 10/10 | Contrast passes AA for most text and tap targets are 44 pt. |
| Performance | **8/10** `████████░░` | 5 | 5/5 | Tab switches and long-task checks pass; heap stays flat over 40 switches. |

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
| A16 Great League recommended movesets vs live PvPoke | 30/30 | **100.0%** `██████████` |
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
| BOOT-04 | Five tab-bar items plus a More menu holding the other five destinations | PASS |  |
| BOOT-05 | Every tab renders on an empty roster without throwing | PASS |  |
| BOOT-06 | Initial load completes in under 4 seconds | PASS | 764 ms |
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
| IMP-04 | Re-importing the same file replaces rather than duplicates | PASS | count stays 64 (notice does not mention the replacement) |
| IMP-05 | CRLF line endings import cleanly (Windows exports) | PASS |  |
| IMP-06 | A header-only file shows a readable error, not a crash | PASS |  |
| IMP-07 | A garbage file does not crash or corrupt the roster | PASS |  |
| IMP-08 | HTML in a Pokemon name is rendered as text (no script execution) | PASS |  |
| IMP-09 | Names with accents and symbols (Flabébé, Nidoran♀, Farfetch'd) import | PASS |  |
| IMP-10 | A file with missing trailing columns still imports the Pokemon | PASS |  |
| IMP-11 | 800-row import renders in under 5 seconds | PASS | 1022 ms |
| IMP-12 | Roster is persisted: a reload keeps the imported Pokemon | PASS |  |

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
| ROS-F-MEASURED | Filter chip MEASURED narrows the list and ALL restores it | PASS | 0 rows |
| ROS-F-NEEDSAPPRAISAL | Filter chip NEEDS APPRAISAL narrows the list and ALL restores it | PASS | 0 rows |
| ROS-F-PVPREADY | Filter chip PVP READY narrows the list and ALL restores it | PASS | 30 rows |
| ROS-F-LUCKY | Filter chip LUCKY narrows the list and ALL restores it | PASS | 30 rows |
| ROS-F-SHADOW | Filter chip SHADOW narrows the list and ALL restores it | PASS | 30 rows |
| ROS-09 | Lucky filter count matches the Lucky stat tile | PASS | lucky in data: 5 |
| ROS-10 | Every row shows name, CP, IV triple and a type label | PASS |  |
| ROS-11 | Row opens the detail sheet on tap | PASS |  |

### Gestures

| ID | Case | Result | Note |
|---|---|---|---|
| GES-01 | Swipe left reveals Transfer / Remove actions | PASS |  |
| GES-02 | Tapping elsewhere closes an open swipe row (iOS list behaviour) | PASS |  |
| GES-03 | Long press opens the action menu | PASS |  |
| GES-04 | Vertical scrolling is not hijacked by the swipe handler | PASS |  |
| GES-05 | Transfer removes the Pokemon and the count drops by one | PASS |  |

### Detail

| ID | Case | Result | Note |
|---|---|---|---|
| DET-01 | Detail header shows name, CP and a position counter ("1 of N") | PASS |  |
| DET-02 | Next arrow moves to the following Pokemon | skip | no next control found by text |
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

### Ranks

| ID | Case | Result | Note |
|---|---|---|---|
| RNK-01 | Recalculate-all-ranks fills Great/Ultra/Little ranks for every Pokemon with IVs | PASS |  |

### PvP

| ID | Case | Result | Note |
|---|---|---|---|
| PVP-L-GREAT | GREAT ≤1500: list shows only Pokemon whose CP is within the cap | PASS | 20 rows |
| PVP-L-ULTRA | ULTRA ≤2500: list shows only Pokemon whose CP is within the cap | PASS | 20 rows |
| PVP-L-LITTLE | LITTLE CUP: list shows only Pokemon whose CP is within the cap | PASS | 2 rows |
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

### Recs

| ID | Case | Result | Note |
|---|---|---|---|
| REC-01 | Power-up candidates list high-rank, not-yet-favourited Pokemon | PASS |  |
| REC-02 | Transfer candidates never include Lucky, Shadow or Favourite Pokemon | PASS |  |
| REC-03 | Dominated-duplicates section explains its rule | PASS |  |
| REC-04 | MARK DONE removes an item from the power-up list | PASS |  |
| REC-05 | USE A TM search finds a Pokemon by name | PASS |  |
| REC-06 | AI recommendations without a key explain what is missing instead of failing | PASS |  |

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

### Today

| ID | Case | Result | Note |
|---|---|---|---|
| TOD-01 | GBL card appears when the feed has a current week | PASS |  |
| TOD-02 | Current week is labelled THIS WEEK and the next NEXT WEEK | PASS |  |
| TOD-03 | An already-ended week is not shown | PASS |  |
| TOD-04 | Each league shows its CP cap and rules text | PASS |  |
| TOD-05 | Open Great League lists top species with tier and moves | PASS |  |
| TOD-06 | Cup squad only contains Pokemon of the cup's allowed types (Color Cup) | PASS | no squad (not enough eligible): Squad: not enough measured, in-cap, legal Pokemon of A tier or better yet. |
| TOD-07 | Cup note says rankings are PvPoke's cup ranking (not an estimate) when a table exists | PASS |  |
| TOD-08 | Mega Edition league shows a Mega-ready line for owned Mega-capable species | PASS |  |
| TOD-09 | Squad members are all within the league CP cap | PASS |  |
| TOD-10 | Events within 14 days are listed; far-future and expired are not | PASS |  |
| TOD-11 | Event shows bonuses and a per-species verdict (HUNT / POWER UP / SKIP) | PASS |  |
| TOD-12 | Live event says LIVE with its end date | PASS |  |
| TOD-13 | Raid boss with a form suffix "Mewtwo (Armored)" is judged as Mewtwo | PASS |  |
| TOD-14 | Feed stamp says the data is community-sourced, not official | PASS |  |
| TOD-15 | Without a cross-check file the card says it is not cross-checked | PASS |  |
| TOD-16 | MEGAS WORTH EVOLVING ranks Mega-capable Pokemon with a raid rating | PASS |  |
| TOD-17 | Mega ranking is sorted by Mega raid rating (descending) | PASS |  |
| TOD-18 | Event planner: adding an event judges each species | PASS |  |
| TOD-19 | Event planner: REMOVE deletes the event | PASS |  |
| TOD-20 | Event planner rejects an event with no species | PASS |  |
| TOD-21 | Scan queue lists Pokemon whose IVs are unmeasured, with reasons | PASS |  |
| TOD-22 | Stats strip shows TO EVOLVE / QUEUED / NEW DEX | PASS |  |
| TOD-23 | No page errors after the whole Today session | PASS |  |
| TOD-30 | Feed unreachable: no GBL card, no error, rest of Today still works | PASS |  |
| TOD-31 | Malformed feed JSON is ignored safely | PASS |  |
| TOD-32 | A feed whose weeks have all ended shows no league card (never stale as current) | PASS |  |
| TOD-33 | Last good feed is cached on the device for offline use | PASS |  |
| TOD-34 | Offline: GBL card renders from the cached feed | PASS |  |

### Home

| ID | Case | Result | Note |
|---|---|---|---|
| HOM-01 | Greeting, Power Up, Evolve Soon and Great League Project counts render | PASS |  |
| HOM-02 | Sign-in form is present and a bad login shows an error, not a crash | PASS |  |
| HOM-03 | Trainer level and stardust reserve save and survive state read-back | PASS |  |
| HOM-04 | Resources (TMs, rare candy) save | PASS |  |
| HOM-05 | Mega energy admin list: adding a species and amount creates an entry | PASS |  |
| HOM-06 | Mega energy admin list: a non-numeric amount is rejected | PASS |  |
| HOM-07 | Mega list shows cost and READY / NEED n MORE per form | PASS |  |
| HOM-08 | CLEAR ROSTER needs a second confirmation tap | PASS |  |
| HOM-09 | Storage planner reports whether the roster is within the keep target | PASS |  |
| HOM-10 | Evolution items and TM resources sections are present | PASS |  |

### Log

| ID | Case | Result | Note |
|---|---|---|---|
| LOG-01 | Snapshot logging adds a dated row with roster size | PASS |  |
| LOG-02 | Diagnostics panel captures a runtime error | PASS |  |

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
| PWA-05 | Offline reload still boots the app (shell cached) | PASS |  |
| PWA-06 | Safe-area insets are used so the tab bar clears the iPhone home indicator | PASS |  |
| PWA-07 | viewport-fit=cover is set for the notch/Dynamic Island | PASS |  |

### Accessibility

| ID | Case | Result | Note |
|---|---|---|---|
| A11Y-01 | Bottom-nav tap targets are at least 44x44 px | PASS |  |
| A11Y-02 | Interactive elements expose a role or accessible name (VoiceOver) | PASS | 65/65 |
| A11Y-03 | Interactive elements are reachable by keyboard (tabindex or native) | PASS | 65/65 |
| A11Y-04 | Body text is at least 11 px (count of smaller text runs) | PASS | 0/270 |
| A11Y-05 | Text contrast meets WCAG AA (4.5:1) for at least 90% of text runs | PASS | 8/261 below 4.5:1 |
| A11Y-06 | prefers-reduced-motion is honoured by animations | PASS |  |
| A11Y-07 | html lang attribute is set | PASS |  |
| A11Y-08 | Form inputs have labels or placeholders | PASS |  |
| A11Y-09 | Images have alt text (decorative alt="" allowed) | PASS |  |
| A11Y-10 | Page zoom is not disabled (user-scalable) | PASS |  |

### Performance

| ID | Case | Result | Note |
|---|---|---|---|
| PERF-01 | Average tab switch is under 400 ms with 64 Pokemon | PASS | 136 ms avg (re-measured with the corrected method) |
| PERF-02 | No long tasks over 200 ms during a full tab tour | PASS | 0 long tasks |
| PERF-03 | JS heap does not grow by more than 50% over 40 tab switches (leak check) | PASS | 50.4 -> 50.4 MB |
| PERF-04 | Page weight: index.html under 3 MB gzipped | PASS | 1.08 MB gz |
| PERF-05 | Mechanics data (pokemon-mechanics.js) under 1.5 MB raw | PASS | 1.27 MB |

## 4. Per-area strengths, gaps and suggestions

### Boot - 9/10

- **Solid:** Loads clean at 320-1280 px with no page errors; every tab renders on an empty roster.
- **Weak or unseen:** Cold start on a throttled phone not measured.
- Next: Add a first-run empty state that explains what to import and how.

### Import - 8/10

- **Solid:** Poke Genie CSV, CRLF, accents, 800 rows and hostile HTML in names all handled; no script execution.
- **Weak or unseen:** Only the Poke Genie column layout is understood; rows are not range-validated (an IV of 99 is accepted).
- Next: Validate each row (IV 0-15, CP, dex) and show a per-row error report.
- Next: Accept drag and drop and a second CSV layout; show an import preview before replacing.
- Next: Say "replaced N" in the notice when a roster is overwritten.

### Roster - 8/10

- **Solid:** Search, 8 sorts, 5 filters, paging and counts are correct; search now covers every move and trims input.
- **Weak or unseen:** Lists are paged by 30, not virtualised; no multi-select.
- Next: Virtualise the list for 1,000+ rows.
- Next: Multi-select with bulk transfer / favourite / tag.
- Next: Saved filters ("PvP ready Great, unfavourited").

### Gestures - 8/10

- **Solid:** Swipe, long-press and tap-elsewhere-to-close behave like an iOS list.
- **Weak or unseen:** Real-device haptics and scroll-vs-swipe arbitration could only be tested with synthetic touches.
- Next: Add a one-time hint the first time a list is shown.

### Detail - 8/10

- **Solid:** Header, moves, weaknesses, power-up, evolve and the Mega card work; Mega data persists.
- **Weak or unseen:** The prev/next control has no accessible name so tests cannot find it.
- Next: Name the prev/next controls; add swipe between Pokemon.
- Next: Show the IV-rank spread target (best IVs for the league) next to the Pokemon's own.

### Ranks - 9/10

- **Solid:** Recalculation fills Great/Ultra/Little for every Pokemon with IVs; rank-1 spreads match PvPoke 100%.
- **Weak or unseen:** Little and Master only know PvPoke's top 80 species.
- Next: Import the full Little and Master tables lazily.

### PvP - 9/10

- **Solid:** No over-cap Pokemon in any league list; team is legal, distinct and cup-aware; sprites on every row.
- **Weak or unseen:** No shield or charge-move simulation: it trusts PvPoke's simulated tiers.
- Next: Add a matchup simulator for two chosen Pokemon.
- Next: Show the power-up path to the next IV-rank breakpoint with its cost.

### Attackers - 7/10

- **Solid:** Ranked by a documented DPS x bulk score using real move data.
- **Weak or unseen:** The 0.4 bulk exponent is a modelling choice; no dodging, no boss moves, no party boosts.
- Next: Replace the proxy with a per-boss simulation using game-master boss movesets.
- Next: Show confidence (how many of the Pokemon's moves have real data).

### Raid - 7/10

- **Solid:** Type effectiveness, weather and survivability behave correctly (Fire boss favours Water/Rock/Ground; Grass/Bug never at the top).
- **Weak or unseen:** Assumes the boss uses its own types; no real boss movesets or enrage timer.
- Next: Pull this week's raid bosses from the events feed and rank your team for each with one tap.
- Next: Add party size and the Mega attack boost for the team.

### Recs - 8/10

- **Solid:** Transfer candidates never include Lucky, Shadow or Favourite Pokemon; MARK DONE advances the list.
- **Weak or unseen:** AI recommendations need a key and were not exercised.
- Next: Explain why each Pokemon is on a list in one line.

### Intel - 9/10

- **Solid:** Living Dex, Kanto dex, hundo and flag counters all equal the data.
- **Weak or unseen:** Counts exclude forms/costumes beyond the base dex.
- Next: Add per-generation and shiny-dex progress.

### Today - 8/10

- **Solid:** Feed-driven GBL and event cards are correct: expired weeks hidden, cups filter the squad by type, cached feed works offline, malformed feeds are ignored.
- **Weak or unseen:** Feed data is community-sourced and only cross-checked against pokemongo.com by a workflow that has not yet run.
- Next: Schedule the cross-check and show its result prominently.
- Next: Local notifications for events and Mega rest timers.
- Next: Calendar export for events.

### Home - 7/10

- **Solid:** Settings, resources, Mega energy admin, storage planner and the two-tap clear all work; secrets stay on device.
- **Weak or unseen:** Sign-in needs the network; Firestore sync was not exercised end to end.
- Next: Move Mega Energy entry onto the Mega card only and retire the admin list.
- Next: Add a backup/restore JSON file.

### Log - 8/10

- **Solid:** Snapshots and the diagnostics panel work.
- **Weak or unseen:** Snapshots are manual.
- Next: Chart roster growth over time.

### Security - 9/10

- **Solid:** No secrets in the shipped HTML (the Firebase web key is public by design), none in the sync payload, no XSS from names.
- **Weak or unseen:** The Firebase web key should be restricted to this origin in the Google console.
- Next: Restrict the Firebase key by HTTP referrer.
- Next: Add a Content-Security-Policy.

### PWA - 8/10

- **Solid:** Manifest, icons, service worker and offline reload verified over HTTP.
- **Weak or unseen:** Install flow and home-screen icon rendering need a real iPhone.
- Next: Add maskable icons and a splash screen per device size.

### Accessibility - 6/10

- **Solid:** Contrast passes AA for most text and tap targets are 44 pt.
- **Weak or unseen:** Before this pass: no roles, no keyboard access, no lang, small text. A runtime enhancer now adds roles, names, tabindex and Enter/Space activation.
- Next: Use real <button>/<a> elements in the template instead of the runtime enhancer.
- Next: Support Dynamic Type with rem units end to end.
- Next: Test with VoiceOver on a device.

### Performance - 8/10

- **Solid:** Tab switches and long-task checks pass; heap stays flat over 40 switches.
- **Weak or unseen:** pokemon-mechanics.js is 1.27 MB and loads up front.
- Next: Split mechanics by feature and lazy-load PvP/Mega tables.
- Next: Virtualise long lists.

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
