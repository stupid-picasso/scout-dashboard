# Untangle survey: tests and test harness

Area: scripts/qa/*.js, scripts/test_*.js|mjs|py, scripts/smoke_render.js, scripts/fixtures, and the CI steps that run them (.github/workflows/test.yml, qa.yml).
Read-only survey. Mutation evidence was produced in scratch copies outside the repo (git archive of HEAD, browser from /opt/pw-browsers); nothing in the repo was changed except this file.
Note: `.claude/skills/untangle-codebase/SKILL.md` does not exist in the worktree, so the format below follows the task text (Hidden link / Needless link / Surplus).

Size: 439 e2e tests (a 71, b 169, c 102 incl. qa_push 11, d 55, e 31 `T(` calls), 13 node/mjs test files, 8 python test files, smoke_render (21 checks), about 640 sleep/swallow sites.

## 1. Problems list

H = hidden link, N = needless link, S = surplus.

| # | Kind | Where | Problem |
|---|------|-------|---------|
| P1 | H/S | scripts/qa/qa_e2e_b.js (about 75 sites, e.g. 224, 262, 343, 389, 466, 761, 912, 1006 ... 1885), qa_e2e_c.js:52,155,329, qa_e2e_d.js:426, qa_e2e_e.js:618, qa_push.js:40, fuzz_keep.js:166,213, smoke_render.js:44 | The "walk every DOM node, find `__reactFiber*`, climb `.return` to `stateNode.logic`" snippet is pasted about 85 times. `qa_lib.js:347-349` already has it as `s.state/s.set/s.call` but offers no "run a function against logic in the page" form, so every test that needs one re-pastes it. A change to how the app exposes `logic` has to be made in 85 places. |
| P2 | H | qa_lib.js:334-335 (BAR/MORE + go), smoke_render.js:54-55, qa_e2e_d.js:6 and qa_e2e_e.js:6 (`SCREENS`), qa_e2e_c.js:310 (hand-written label map still lists `'Home'`) | Tab-bar and More-menu labels are encoded in 4 places. Already drifted: PERF-02 (qa_e2e_c.js:310) clicks the label 'Home', which no longer exists (Settings moved into More), so that step silently clicks nothing (`el && el.click()`). The manager-plan note "re-route HOME through qa_lib.js and smoke_render.js" confirms this is a known double edit. |
| P3 | H | qa_lib.js:46-57 (`webBase`), qa_e2e_c.js:28-35 (`serve`), test_csp.js:9-20 (`serve`+MIME), qa_lighthouse.js:5-17 | Four static file servers, four MIME maps (different content: .csv only in c, charset only in qa_lib, gzip only in lighthouse). |
| P4 | H | scripts/test_cp_recovery.js:9, test_max.js:9, test_push_config.js:10, test_push_sw.mjs:12, test_push_triggers.mjs:14, test_push_worker.mjs:18, test_ranking.js:66,77, test_roster_logic.js:67, test_firestore_rules.js:11, smoke_render.js:19 | Ten clones of `check(name, got, want)` with pass/fail counters. Output format and exit-code behaviour differ slightly between them. |
| P5 | H | test_cp_recovery.js:5-8, test_max.js:5-8, test_pvp_sim.js:15-18, test_rank_reference.js:15-18, test_ranking.js, test_roster_logic.js:49-57, test_push_sw.mjs, fuzz_keep.js:3-10, qa_accuracy.js:14-15 | The "load pokemon-mechanics.js into a vm context with a window stub" prologue is pasted 9 times (two more variants use `global.window`). |
| P6 | H | qa_lib.js:94-117 (`cloudDecide`) vs firestore.rules | The stand-in re-implements the Firestore rules by regex-scraping `firestore.rules` (`rulesLists`, qa_lib.js:85-92) and then re-codes the rule logic in JS. test_firestore_rules.js checks the key lists; STANDIN-01 (qa_e2e_d.js) checks the stand-in. Nothing runs the real rules (no emulator). The two re-implementations can agree with each other and both be wrong. Not enforced by the build. |
| P7 | H | qa.yml:42 vs :49 (`'^PERF-01$'` twice), qa.yml:54 vs :57 (`'^(AXE\|KEY\|THEME\|CASE)'` twice) | A skip regex and its complementary only-regex are typed twice in YAML. Change one and a test runs twice or never. |
| P8 | H | qa_e2e_c.js:410 (`require('./qa_push')()`), qa_e2e_d.js:724 (`require('./qa_e2e_e').__scans`), qa_e2e_e.js:683 | Suite c silently includes the PUSH tests; suite d imports suite e's scan functions. The suite letters in CI/handoff (`a b c e`, `d`) hide that d depends on e's file and c on qa_push. |
| P9 | H | qa_e2e_b.js:933 and qa_e2e_c.js:312 (`PERF-04`); qa_e2e_b.js:1066 and :2040 (`SIZE-01`) | Duplicate test ids. `QA_ONLY='^PERF-04$'` / `QA_SKIP` match two different tests; results JSON (make_report.py) keys by id. |
| P10 | H | qa_e2e_a.js:7 (`TYPES`), smoke_render.js:48 (typeTable literal), qa_e2e_c.js:42 | The species-to-type table injected before type-dependent tests is copied (a, smoke). |
| P11 | H | qa_lib.js:309-318 | `pinTiers` silently skips any species no longer in the tier tables (`if (t[sp])`) and swallows a read failure to console.error. A renamed species leaves a test unpinned with no signal (the "weekly tier drift" the pin exists to stop). |
| P12 | H | fuzz_keep.js:4 `REPO = '/home/user/scout-dashboard'` | Absolute path; breaks in any worktree or CI checkout. Also loads the stand-in via that path. Not in CI. |
| P13 | H | make_report.py:51 and RATINGS block | Hand-typed claims ("fuzz_keep 0 hard violations; all 584 soft cases triaged...") and 1-10 ratings baked into code; they do not follow the suites. |
| P14 | S | qa_lib.js:297-300 + init scripts (`__noImportGate`, `__noFirstRun`, `__todayTailOpen`, `__keepCaps`) | Four `window.__*` switches that production code honours only for tests (test hooks in shipped code). They are set in qa_lib.js:298-306 AND again in smoke_render.js:30. A fifth consumer (test_csp) goes through `session` so it is fine; smoke_render is the second place that must know the full list. |
| P15 | N | smoke_render.js (whole file, 21 checks) vs qa_e2e_a/b | A fourth browser harness (own launch, own go/load/typeTable/BAR/MORE) that predates qa_lib. Its checks duplicate e2e tests (see section 5). It stays useful only as the fast Chromium-only step in test.yml. |
| P16 | N | test.yml:63-65 and qa.yml:50-51 | `test_csp.js` runs on Chromium in both workflows on every push. |
| P17 | S | qa_lib.js `T()` score `sev` parameter (6th arg, qa_lib.js:15) | Severity strings ('critical','high','medium','normal') are recorded but nothing gates on them; only make_report.py prints them. |
| P18 | H | test_roster_logic.js:105-135 (`extractMethodBody(SRC, 'pokeSig(p) {')`, `'const byRank = [...roster]'`, `'.slice(0, 150);'`) | Tests slice source text out of `Scout Dashboard.dc.html` by literal signature. Any reformat or rename makes them throw (loud, good) but they are tied to the source text, not to behaviour. Header comment says "top-90" while the code slices 150 (stale). |

## 2. Special cases

Counts: waitForTimeout 640 sites (500ms x102, 300 x95, 400 x80, 1500 x51, 700 x49, 600 x38, 900 x32, 800 x26, 1200 x24, 2500 x18); per file: b 205, d 148, a 75, e 44, c 41, push 21, smoke 21, go_shots 17, ui_shots 18.

| # | Where | Special case |
|---|-------|--------------|
| S1 | qa_lib.js:337,338,343,345 | `go()`/`load()` sleep 350/600/500/700/500 ms after every click; every test inherits about 0.5-1 s of fixed sleep per navigation. These are the sleeps that paper over the app's render/animation timing rather than waiting for a condition. |
| S2 | qa_lib.js:338 | `.scrollIntoViewIfNeeded().catch(() => {})` swallows a missing tab. |
| S3 | qa_lib.js:312 | `waitForFunction(body text > 100).catch(() => {})` swallows a boot failure; the later test fails with a less useful message. |
| S4 | qa_lib.js:316 | pinTiers `catch (e) { console.error(...) }` (P11). |
| S5 | qa_lib.js:16-17 | `QA_ONLY` / `QA_SKIP` env regexes inside `T()`; qa.yml uses both (P7). |
| S6 | qa.yml:42 | `QA_SKIP='^PERF-01$'` on WebKit only (wall-clock 400 ms limit "at 403 ms on main", TODO task #31). |
| S7 | qa.yml:44-49 | Report-only step `continue-on-error: true` for PERF-01 on WebKit. |
| S8 | qa.yml:55-57 | Report-only axe step (`AXE`, `KEY`, `THEME`, `CASE`), comment "until the semantic-markup phase lands". Measured in a scratch copy at HEAD on Chromium: all 26 tests (AXE x22, KEY-01..03, THEME-01, CASE-01) pass. The phase has landed (DET-16/17 assert real buttons); the step is stale and can gate. |
| S9 | qa.yml:62 | Lighthouse floors `LH_MIN_PERF=20 LH_MIN_A11Y=85`: perf 20 cannot catch a regression. |
| S10 | qa.yml (accuracy step) / qa_accuracy.js:215,231 | `qa_accuracy.js` has no failing exit for low accuracy (only `process.exit(1)` on an exception). The CI step "Data accuracy audit" is report-only in effect. The live-PvPoke fetch failure is caught and recorded as a null `A15` row (also report-only) and needs the network (https.get raw, no timeout). |
| S11 | qa_accuracy.js:27 `QUIRKS`, quirkSeen | Per-species exclusions (urshifu, flabebe, type_null ...) from the comparison. |
| S12 | qa_accuracy.js:210 (A17) | `m.WEATHER_BOOST === 1.2 \|\| m.WEATHER_BOOST > 1`: the first operand is implied by the second. |
| S13 | test_csp.js:52 | Missing browser is a SKIP (exit 0) unless `CSP_REQUIRE_WEBKIT=1`; test.yml (no env) can pass with no browser checked. |
| S14 | qa_e2e_a.js:77 | `if (IS_WEBKIT) await b.evaluate(...)` in ROS-02: a different action on WebKit. |
| S15 | qa_lib.js:60-75 `touch()` | Chromium uses real CDP touch, WebKit synthesises events: the same test exercises two different code paths. |
| S16 | qa_lib.js:293-300, 316-318 | WebKit served over http, data/*.json aborted by default; Chromium on file://. The two browsers do not run the same load path. |
| S17 | qa_e2e_b.js:30,31,32,37,92; qa_e2e_c.js:62 | `skip('no team')`/`skip('none')` when the fixture produces no team or no card; the test passes as "skip" and the CI log shows no failure. Skips are tolerated in run.js (only fails on `fail`). |
| S18 | qa_e2e_b.js:66,80 | `if (!(await b.count())) skip('none')` for MARK DONE. |
| S19 | qa_e2e_c.js:310 | PERF-02 tolerates `n <= 2` long tasks and returns `-1`/skip when the API is missing; also clicks nonexistent 'Home' (P2). |
| S20 | qa_e2e_c.js:311 | PERF-03 calls `window.gc && window.gc()` but Chromium is launched without `--expose-gc` (qa_lib.js:32), so the gc call never happens; the 50 % heap bound is noise. |
| S21 | qa_e2e_a.js:28, :61; c:309 | Wall-clock assertions BOOT-06 (<4 s), IMP-11 (<5 s), PERF-01 (<400 ms avg) fail on a slow runner without a bug. |
| S22 | qa_e2e_b.js:1554 | `if (process.env.QA_DUMP)` writes a debug dump from a test. |
| S23 | qa_lib.js:21 `QA_NOTE`, qa_e2e_d.js:30 `QA_AXE_OUT`, qa_run.js:17 `QA_OUT` default `/tmp/qa/e2e.json` | Env knobs; qa_run.js:17 writes to `/tmp/qa` which must exist (the CI sets `QA_OUT`, local runs fail with ENOENT otherwise: I had to `mkdir /tmp/qa`). |
| S24 | qa_run.js:8-11 | A suite that throws is recorded as one `SUITE-x` failure and the following suites still run; and `if (!fs.existsSync(...)) continue;` silently ignores a misspelled suite letter (`qa_run.js z` passes with 0 tests). |
| S25 | qa_push.js:35-44 | Test-only stubs of `navigator.userAgent`/`standalone` and a re-implemented `withLogic` (P1). |
| S26 | test_gemini_pool.py:188 `pass`; test_extract_pipeline.py:83 `time.sleep(0.01)` | Bare `pass` in a test; a real 10 ms sleep. |

Report-only steps in CI (complete list): qa.yml "Tab-switch timing (WebKit, report-only)" (continue-on-error), "Accessibility (axe) - reports only" (continue-on-error), "Data accuracy audit" (no failing threshold), and Lighthouse perf floor 20.

## 3. Redesign (decision log)

Ranked by problems removed.

**F1. One page-logic helper in qa_lib (solves P1, S25, part of P10).**
Add `s.logic(fn, arg)` = `page.evaluate` of the fiber walk with `logic` passed to `fn` (and an `evaluateHandle` twin). Replace the ~85 pasted copies, qa_push `withLogic`, fuzz_keep and smoke_render. Behaviour preserving, mechanical (regex rewrite, `for (const e of document.querySelectorAll('*')) {...} ` to `l => {...}`). Risk low. Guarded by every e2e test (a failing rewrite fails loud). Size: about 85 call sites, net minus 400-600 lines.

**F2. One navigation map and one harness, smoke_render becomes a thin suite (solves P2, P10, P15, P16 partly, S1 partly).**
Export `NAV` (BAR/MORE/SCREENS) from qa_lib; suites d and e import `SCREENS`; fix PERF-02 to call `s.go`. Make smoke_render a 5-line caller of `session` + the few checks not covered elsewhere (section 5), or delete its duplicated checks. Risk low-medium (smoke is the only gate in test.yml that does not need WebKit). Guarded by suite a-e. Size small to medium.

**F3. Test-support module for node tests (solves P4, P5, partly P3, S12).**
`scripts/lib/testkit.js`: `loadMechanics()`, `check`, `serveRepo()`. Used by the 9 node tests and qa_lib/qa_e2e_c/test_csp/qa_lighthouse servers. Behaviour preserving; differences in MIME/gzip become options. Risk low. Guarded by the tests themselves. Size medium, about 150 lines removed.

**F4. Replace fixed sleeps with condition waits at the source (solves S1, S3, S21 partly, 640 sleep sites).**
Step 1: in `go()`/`load()` replace the five sleeps with a wait for the destination (`waitForFunction` on the active tab's aria/selected state or content change); this removes the sleeps for every test that routes through it. Step 2: convert per-test sleeps by a deterministic rule (sleep after click then read text -> `expect.poll`-style helper `s.until(fn)`). Risk medium (timing semantics, WebKit). Guarded by suites a-e run 3x on both browsers. Not mechanical in step 2. Size large; do step 1 only first.

**F5. Make CI gates say what they mean (solves P7, S6-S10, S13, S24).**
(a) Drop the report-only axe step: all 26 pass today; fold into the gating `d` step by deleting both QA_SKIP/QA_ONLY regexes (removes P7 second pair). (b) Give qa_accuracy a threshold exit (`ACC_MIN` per area, ratchet like LH) or remove the step from claims of being a gate; make the A15 network row report-only explicitly. (c) Raise Lighthouse perf floor to the measured value minus margin. (d) PERF-01: do task #31 or move the limit with evidence, then drop the WebKit skip/report step. (e) `qa_run.js`: unknown suite letter is an error; create the `QA_OUT` dir. (f) Drop test_csp from test.yml or from qa.yml chromium (P16). Risk low-medium (new gates can turn CI red; run once first). Guarded by CI itself. Size small.

**F6. Test ids unique and checked (solves P9).**
Make `T()` throw on a duplicate id (one line, qa_lib.js) and rename PERF-04 (c) to PERF-06 or merge into PWA-12, and the second SIZE-01 to SIZE-02. Risk low. Size tiny.

**F7. Remove or repair vacuous e2e tests (solves section 5 candidates).**
Fix SEC-03, ATK-06, ROS-09, GES-04, PVP-14 (give each a real assertion or drop it), delete HOM-03/HOM-04's tautology in favour of a reload round trip. Risk low-medium: SEC-03 and ATK-06 may reveal real behaviour once they can fail; confirm before landing. Size small.

**F8. Stand-in rule enforcement from the real rules file (solves P6).**
Either run the Firestore emulator in a CI job (new network dependency, so not recommended: "no new network hosts") or keep the regex scrape and add one table-driven test that feeds the same allow/deny cases to both the stand-in and a string-level parse of firestore.rules. Keep STANDIN-01. Risk low. Size small-medium.

**F9. Tooling hygiene (solves P11-P14, P17, P18, S22, S23).**
`fuzz_keep.js` use `path.join(__dirname, '..','..')`; make pinTiers fail on a pinned species that no longer exists (assert once per session); move test-only `window.__*` switches to one `TEST_FLAGS` init script exported by qa_lib and used by smoke_render; delete the frozen claims from make_report.py (generate or drop); drop `sev` or gate on it; delete the `QA_DUMP` branch. Risk low. Size small.

## 4. Comments to remove

Checked: no test or script greps for any of these (grep over scripts/ and .github for the phrases). None contains "iOS design layer".

- scripts/qa/qa_lib.js:10 `let current = null;` is dead code (no comment), delete the variable (surplus, not a comment).
- scripts/qa/qa_lib.js:20 `// Shared helpers for the QA suites...` line 1 header restates the file name; keep, one line only.
- scripts/qa/qa_lib.js:307 trailing `// tests feed synthetic reads; IMPCHK-01 turns the import gate on` is attached to the wrong line (belongs to `__noImportGate`, line 298). Misplaced; move or delete.
- scripts/qa/qa_run.js:2 `// Runs the QA suites and writes qa-e2e.json. Usage: ... [a|b|c ...]` is stale (default is `a b c`, output path is `QA_OUT`, suites go to e). Fix or delete.
- scripts/qa/qa_e2e_c.js:1 header `// QA suite C: Today (events + GBL + Mega), Home/settings, Log, security, PWA/offline, accessibility, performance.` does not mention PUSH (c:410) and the accessibility part moved to d. Stale; rewrite or delete.
- scripts/test_roster_logic.js:5-41 long "WHY THIS EXISTS" header is explanation of why (keep); the line "top-90-by-rank list" (about line 20) disagrees with the 150 slice at line ~130: fix the number.
- scripts/test_ranking.js:2-30 and test_rank_reference.js:2-12 headers explain intent (keep).
- scripts/smoke_render.js:2-9 header restates the check list (the checks are listed in code); keep first sentence only.
- scripts/test_no_dangerous_sinks.js:2-3 keep (rule statement).
- scripts/qa/make_report.py:4-6 restates the Usage line twice; keep one.
- scripts/qa/qa_accuracy.js:2-10 header lists data sources (keep: explains sources outside the code).
- Per-line section dividers `// ------------------------------------------------------------------ ATTACK` in qa_e2e_b.js (about 30) and qa_e2e_d.js:723 restate the area string passed as the 2nd argument of `T()`; candidates, low value.

Only 3-4 genuinely redundant comments in this area; the files are mostly code. Do not touch comments that carry a reason (qa_lib.js:44-45, 66-68, 82-84, 128-136, qa.yml:38-47).

## 5. Tests to remove or fix

Evidence column: M = mutation run in a scratch copy at HEAD (outside the repo); S = static proof (the assertion cannot be false).

| Test id | Verdict | Why it cannot catch a real bug | Behaviour already guarded elsewhere | Evidence |
|---|---|---|---|---|
| SEC-03 (qa_e2e_c.js:242) | FIX, keep as a SEC guard | `expect(!/secret/.test(text) \|\| true)` always passes. Also never sets a secret in its own session. Intent (secrets are not rendered) is real, so repair rather than delete: remove `\|\| true`, set the draft key first. | SEC-02 (not in blob), SEC-04 (not in shipped html) guard other leak paths, not rendering. | M: replaced the secret regex with `/Roster/` (present on screen) and kept `\|\| true`: the test still reports pass (`1 passed, 0 failed`). |
| ATK-06 (qa_e2e_b.js:49) | FIX or remove | `expect(/stat-only.../.test(text) \|\| true)`: cannot fail. | ATK-01..05 (ranking content). Nothing guards "unknown moves labelled". | S: the `\|\| true` makes the operand irrelevant. |
| GES-04 (qa_e2e_a.js:139) | REMOVE (or give a real scroll assertion) | `expect(true)`; it also uses `mouse.wheel`, which never fires the touch handlers it names. | GES-01..03/05 cover swipe; no test guards touch-scroll vs swipe. | S |
| ROS-09 (qa_e2e_a.js:108) | FIX | No assertion at all; click failure swallowed by `.catch(() => {})`; returns a note. Title promises "count matches Lucky tile". | INT-03 checks the Lucky counter against data. | S: `scan.js` found zero `expect(` in its body. |
| PVP-14 (qa_e2e_b.js:40) | REMOVE | Title says "Switching leagues", body only reads `s.errors` accumulated by earlier tests; does not switch anything. | PVP-09/10 switch leagues and the session-wide error check; BOOT-05, TOD-23 (c:116), PUSH-10 repeat the same session-wide error read. | S |
| HOM-03, HOM-04 (qa_e2e_c.js:199-200) | REMOVE (or reload round trip) | `s.set(patch)` then `s.state()`: reads React state back from React state. Fails only if setState is broken. Names claim "survive". | HOM-09/HOM-14..16 cover persistence; ROS-16, DET-14 reload round trips. | S |
| PERF-04 (qa_e2e_c.js:312) | REMOVE | "index.html under 3 MB gzipped" is implied by PWA-12 (raw under 1.7 MB; gzip is smaller than raw). Cannot fail unless PWA-12 already failed. Also a duplicate id of qa_e2e_b.js:933 (real PERF-04). | PWA-12 (qa_e2e_c.js:279, keep: a design rule). | S: gz size of a 1.7 MB html is below 1.7 MB by definition. |
| MAX-02 partial (qa_e2e_b.js:139-142) | TRIM, not remove | The `p`, `guard`, `spirit` assertions repeat test_max.js lines 10-15. The seed/gmaxFor/Max-move parts are not in test_max.js (keep those). | test_max.js ("guard", "spirit", attack power). | M: mutated `maxGuardHp` in pokemon-mechanics.js (scratch, rebuilt bundles): test_max.js FAILS (`guard got [0,0,40,60] want [0,20,40,60]`) AND MAX-02 FAILS (`guard/spirit`): both catch the same bug. |
| smoke_render "PvP rows carry a sprite" (smoke_render.js:126) | REMOVE check | `img[src*=sprites] ... \|\| ... img`: the second selector matches any `<img>`; effectively always true. | PVP-01 (every PvP row shows a sprite). | S |
| smoke_render swipe/long-press/Mega-card/rolling-CP/GBL/event checks (smoke_render.js:66-99,149-152) | REMOVE as duplicates (keep "no uncaught page errors", boot, mechanics, saved-team win) | Repeats GES-01, GES-03, DET-10, ROS rows, TOD GBL/event tests, run in a second, older harness. | e2e a/b/c on Chromium (qa.yml) | S (names map 1:1). Not mutation-tested; risk: smoke is the only gate for these in test.yml if qa.yml is skipped. |
| BOOT-01b / BOOT-05 (a:16,27) | KEEP one | Both "every screen renders, no page error"; BOOT-05 only reads `s.errors` after `s.go` over 9 screens. | BOOT-01b adds the 300-char content check. | S |
| SEC-01 (c:240) | FIX | Writes `scout.secrets.v1` itself then checks it is still there: fails only if the app wipes unknown keys on reload. Intent (keys live in localStorage, not cloud/elsewhere) is guarded by SEC-02, SYNC-03. | SYNC-03 | S |
| PERF-03 (c:311) | FIX or drop | `gc` never exposed (S20), 50 % bound on a noisy heap; can fail without a leak, will not catch a slow one. | none | S |
| PERF-01 (c:309) WebKit | FIX (already report-only) | Wall-clock; known flaky at the limit. | none | S (qa.yml comment states 403 ms on main) |
| BOOT-06, IMP-11 | FIX (soft) | Wall-clock bounds (4 s, 5 s) fail on a loaded runner with no bug. | none | S |
| PERF-02 (c:310) | FIX | Clicks 'Home' that no longer exists (P2) and tolerates 2 long tasks. | none | S |
| STANDIN-01 (d) | KEEP | Tests the test double, not the app, but it is the only guard that the double still enforces the rules the app-sync tests rely on (P6). | test_firestore_rules.js checks the lists only. | n/a |

Tests I looked at and kept because they guard a real behaviour or a rule: UIQ-01/02/03/05/06/08-12/16/18-22 (design rules), PWA-12, SEC-02/04/05/06, SYNC-*, AUTH-*, DATA-*, FIRSTRUN-*, test_sri.js, test_csp.js, test_no_dangerous_sinks.js, test_tracked_tree.js, test_firestore_rules.js, test_workflows.py, test_bundles_current.py, test_rank_reference.js (independent brute force), test_pvp_sim.js (agreement floor 0.88), snapshot-style test_ranking.js (declares itself a regression snapshot).

Not mutation-tested (no evidence offered, so not proposed for removal): all other e2e ids. The only runtime mutations I ran were SEC-03 and MAX-02/test_max.

Fixtures: all in use (grep). `qa_roster.csv` is generated by make_fixture.js from the engine's own CP formulas, so CP-cap assertions on it are circular with respect to `cpFor`; test_rank_reference.js is the independent check.

## 6. Ranked fix plan with risk

| Rank | Fix | Problems/special cases removed | Risk | Guarded by | Mechanical? | Size |
|---|---|---|---|---|---|---|
| 1 | F1 one `s.logic` helper | P1, S25, P10 part, about 85 sites | low | all e2e suites | yes | medium, minus 500 lines |
| 2 | F5 CI gates say what they mean (gate axe, ratchet accuracy/Lighthouse, unknown-suite error, one csp run) | P7, P16, S6-S10, S13, S24 | low-med (turns CI red if a hidden regression exists; axe passes today) | CI | yes | small |
| 3 | F4 step 1: wait for the destination in `go()`/`load()` | S1, S3, part of the 640 sleeps | medium | a-e x2 browsers, repeat 3x | mostly | small then large |
| 4 | F3 testkit (`check`, `loadMechanics`, `serveRepo`) | P3, P4, P5, S12 | low | the node tests | yes | medium |
| 5 | F2 one nav map, smoke_render slimmed | P2, P10, P15, S19 | low-med | a-e, smoke | partly | small-medium |
| 6 | F7 repair/remove vacuous tests | SEC-03, ATK-06, GES-04, ROS-09, PVP-14, HOM-03/04, PERF-04(c), smoke sprite check | low-med (SEC-03/ATK-06 may find real gaps) | n/a (they change tests) | no | small |
| 7 | F6 unique ids | P9 | low | suites | yes | tiny |
| 8 | F8 stand-in vs rules table test | P6 | low | STANDIN-01, test_firestore_rules | no | small |
| 9 | F9 hygiene (fuzz path, pinTiers assert, make_report claims, TEST_FLAGS, QA_DUMP) | P11-P14, P17, S22, S23 | low | suites | partly | small |

Counts: problems 18 (P1-P18), special cases 26 (S1-S26), comment candidates 3 real (qa_lib.js:307, qa_run.js:2, qa_e2e_c.js:1, plus the stale "top-90" number) and 1 dead variable, test candidates 17 rows in section 5 (9 remove/fix-vacuous, 1 trim, 7 soft/time-based or fix).
