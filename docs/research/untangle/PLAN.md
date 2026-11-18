# Untangle plan (consolidated from the 7 surveys)

Extras chosen by the owner: Comments, Tests. Approach: list first, wait for approval, then staged PRs (one per stage, CI green before each merge). Nothing here is changed yet.

Sources: `dc-1.md` .. `dc-4.md` (Scout Dashboard.dc.html by line range), `mechanics-build.md`, `python-pipeline.md`, `tests.md`. Counts across the 7 reports: about 276 problems, about 190 special cases, about 150 comment candidates, 50 test items (most are fixes, few removals). All claims are from reading the code; only SEC-03 and MAX-02 were mutation-tested. Line numbers refer to base d697877.

## Where the surveys agree (the real structure of the mess)

| # | Root cause (one fix) | Seen in | Risk |
|---|---|---|---|
| A | The same fact is written in several places: the list of persisted keys exists 6 times (SYNC_KEYS, EMPTY_USER_DATA, applyRemote patch, buildCloudBlob, PACKED_KEYS, firestore.rules) and the lists already disagree (`ocrAutoApply` watched but never saved; sign-out leaves moveDB, evoTable, chat, transferQueue... on screen) | dc-1 F1, dc-2 #1, dc-3 F1 | medium |
| B | League caps / tier order / power-up costs / CP and HP formulas re-spelled 14+, 10+, 7 times; unknown league silently falls through to Great League | mechanics #2 #3, dc-2 #2, dc-4 #3 | medium |
| C | No single write path for a Pokémon edit: 12 pasted push tails, 8-9 pasted "pin an IV spread" blocks, 6 sites skip cache clearing, a frozen `detailPoke` copy patched by hand at 5 sites | dc-2 #4, dc-3 F1 F2, dc-4 #5 | medium, mechanical first step |
| D | Build has two version counters, a retired 717-line `propagate_edits.py` (about 450 dead lines) plus 2.8 MB `.propagate_baseline/`; `--check` does not compare the embedded mechanics blob | mechanics #1 | low-medium |
| E | Dead code and stale or wrong comments everywhere (empty functions, unreachable branches, 7 dead keyframes, about 150 restating comments, 9 misplaced) | all | low, mechanical |
| F | Python: about 560 lines of dead Tesseract-era code; 9 copies of marker-replace; 10 hard-coded game-master URLs; reader schema written 5 times and already differing | python-pipeline | low (deletion) to medium |
| G | Import and AI client: 3 copies of the AI job pattern, errors classified by regex over message text, fake HTTP 599, three prompts with separate field lists | dc-3 F3 F4, dc-4 #4, python #3 #5 | high |
| H | `renderValsInner` is one 2,735-line function building every screen on every render; Pokémon card block rebuilt 29+ times | dc-4 #1 #2 | high |
| I | Keep/transfer reasons are display strings classified by regex (`isSoftKeep`, `generic`); the transfer-safety gate depends on text | dc-2 #3 | high (data-loss class) |
| J | CSS: 53 attribute selectors and 142 `!important` match inline style text; several inline values are dead | dc-1 F2 | high, large |
| K | Tests: "find the React fiber, climb to logic" pasted about 85 times; 640 fixed sleeps; 4 copies of the tab label map (already drifted: PERF-02 clicks a label that no longer exists); report-only gates that would pass | tests | low-medium |

## Real bugs found along the way (fix first, each with a regression test)

1. Literal `—` and `\n` text sent in model prompts and shown in a user warning (dc-4: 16586-16595, 17393, 21762).
2. Coverage code reads `state.roster` instead of the merged roster, so added Pokémon are missed (dc-4: 20906, 21023-21055).
3. Transfer rule (IV under 51, rank under 70) in two lists that disagree (dc-4: 18298 vs 19549).
4. `installDerivedCache` keys arrays by length, so two bosses with equal type counts share a cached result (dc-3: 15176, 15103).
5. `extractFrames` seek loop never records frame positions, so scroll stitching only works in the playback fallback (dc-3: 12053-12072). Needs reproduction before fixing.
6. Video import receipt cannot see solved or recovered CPs (dc-3: 12575). Needs reproduction.
7. Sign-out / account switch leaves 8 synced fields on screen (dc-1).
8. `firebaseConfigError` is never read, so an SDK load failure is invisible (dc-1).
9. One comment says confirmClearRoster keeps inventories but it clears them (dc-2: 6973 vs 6996).
10. Workflows: `update-pokemon-data.yml` commits mechanics without rebuilding bundles; two workflows `git add` gitignored files; `extract-auto.yml` can fail to push and stay green; second-opinion pass in pogo_extract never runs in the default mode.
11. Appraisal conflict handling (Skarmory 15/15/15): fix worker already running; python log says "not pinned" but the app pins.

## Proposed stages (one PR each, CI green before merge)

0. **Bug fixes** (items 1-4, 7-9 above), each with a regression test that fails first. Small PRs.
1. **Deletion and comments** (E, F-deletions): dead code, dead Tesseract chain and `test_ocr.py`, retired `propagate_edits.py` and `.propagate_baseline/`, restating comments (kept: anything a test or script greps, e.g. "iOS design layer"). Mechanical, bundles unchanged apart from size.
2. **Test infrastructure** (K): `s.logic(fn)` helper, shared node test support, one navigation map, unique test ids, wait-for-destination in `go()`, flip the axe/KEY step to gating (all 26 pass on Chromium; WebKit KEY-01 still fails so WebKit stays report-only), make `qa_accuracy` fail, tighten the Lighthouse floor.
3. **Constants** (B): one LEAGUES table, one power-up cost table, tier order, thresholds.
4. **Write paths and persistence schema** (A, C): `patchMon`, `spreadFields`, one sync-schema table plus a test that all lists agree, live detail sheet.
5. **Python and workflows** (F, rest): `gm_lib.py`, one extract workflow, the workflow bugs, reader contract plus test.
6. **Import and AI client** (G): after characterization tests.
7. **High risk, each needs its own approval and plan:** I (keep reasons as objects), H (per-screen view models), J (CSS roles), account-lifecycle object, sheet mechanism.

Every stage: behavior-preserving except the listed bug fixes; full suites on Chromium and WebKit; index.html stays under 1.7 MB (about 11 KB headroom today, so stages 1 and 3 help); radii/type pins untouched; one PR per stage, manager verifies before merge.

## Tests extra: nothing is removed without your explicit OK

Candidates from `tests.md` (verdict, action proposed):

| Test | Why | Proposal |
|---|---|---|
| SEC-03 | `|| true`; mutation still passes | FIX (it is a security guard), do not delete |
| ATK-06 | `|| true` | fix or remove |
| GES-04 | `expect(true)` | remove |
| ROS-09 | no assertion | fix |
| PVP-14 | only reads errors from earlier tests | remove |
| HOM-03, HOM-04 | set state then read it back | remove |
| PERF-04 (2nd copy in suite c) | implied by PWA-12 | remove the duplicate id |
| SIZE-01 (duplicate id) | two tests share an id | rename |
| MAX-02 | same bug as test_max.js | remove (duplicate) |
| smoke_render sprite check and 3 duplicate checks | duplicate GES-01/03, DET-10 | remove |
| `test_ocr.py`, `test_postprocess.py:159-162`, `test_extract_pipeline.py:190` | dead code / cannot fail independently / asserts a global | remove |
| PERF-01, PERF-02, PERF-03, BOOT-06, IMP-11 | wall-clock or noise | rework, not remove |
| SEC-01, LOG-02, HOM-08, TOD-09, DATA-03 | too weak | strengthen |

Mutation proof is only done for SEC-03 and MAX-02. Before any removal the worker must run a mutation of the behavior the test claims to guard and show it still passes.

## Decisions needed from the owner

1. Approve stages 0-5 as listed (6 and 7 come back with their own plans)?
2. Test removals: approve the list above as a whole, or pick?
3. Order: bug fixes and deletions first (recommended), then infrastructure.
