# Manager plan: UI polish, security basics, sign-in and first-run

Written 2026-11-17. Status: **plan only, nothing executed.** The managing session had no tool to spawn workers, so the three worker prompts below are written to be pasted as-is into one worker each, strictly in order (all three edit the same single-file app; never run two at once).

Inputs read: `PROJECT_HANDOFF.md`, `docs/research/ui-polish-audit.md` (all), `docs/research/launch-readiness.md` (all), `scripts/qa/qa_lib.js` (Firebase stand-in), `scripts/qa/qa_e2e_e.js` (SCAN), `scripts/build_bundles.py`.

Line numbers in the reports drift; workers must search by symbol name.

## Facts that shape the plan (checked in the tree)

- The repo was clean on `claude/new-session-7rgriq` at `c10fa0c` when this was written.
- `data/pokemon_import.json`, `data/appraisal_import.json`, `logs/a`, `logs/import-log-2026-08-04T18-10-11-253Z.json` are tracked. No `LICENSE`, `SECURITY.md`, `CONTRIBUTING.md`, `firestore.rules`.
- `data/pokemon_import.json` is fetched by the app from `raw.githubusercontent.com/.../main/` ("import from server"), written by `extract.yml` / `extract-iv.yml`, un-ignored on purpose in `.gitignore:14,17`, and mocked (route-fulfilled, so the file itself is not needed) in `qa_e2e_b.js:996`.
- The cloud blob writes `updatedAt: Date.now()` (a number). The report's rules require `updatedAt == request.time` plus a 30 s gap, while the client pushes after 150 ms / 1.2 s. Rules and client are coupled.
- Private-mode secret leak: `buildCloudBlob` spreads `githubToken/geminiKey/geminiKeys/apiEndpoint` when `_secretsLocalOk === false`.
- `qa_lib.js` stand-in: one fake `auth` object that auto-signs-in `qa-user` (`qa@example.test`) 30 ms after `onAuthStateChanged`; no providers, no popup, no linking. It also sets `window.__noImportGate = true` by init script; the same pattern can switch a first-run overlay off for existing tests.
- Suite E `SCAN` already measures tap targets (counting the 44 px `::before` strip), overflow, tiny text and unnamed controls on 9 screens at one width.
- Recorded owner decisions the audit reverses (workers must not treat these as accidents):
  - Light theme amber accent `#9a4a06` (handoff "Unslop pass", v53.262). The task brief lists "accent colour differing between themes" as a defect, so blue wins in both themes.
  - Tab bar order Today, Home, Roster, PvP, Recs, More (handoff "Bottom bar order"), and QA helpers route `HOME`/`RECS` through the bar. Audit fix 22 moves Home. See decision D2.
  - Sentence case is a runtime layer because some capital labels are logic keys (verdicts, grades, tags), and QA reads the source wording through `window.__keepCaps`. Fix 23 must change display strings only, never keys.
  - Handoff says global CSS gives controls "a 44 px minimum". The brief's hard lesson overrides: tap size comes from the invisible `::before` strip; visible controls stay small.
  - Classic scrolling is the default; shell mode stays opt-in. Do not touch the scroll model.

## Decisions fixed in advance (so a worker does not have to guess)

- D1. Same blue accent in both themes, with the audit's contrast-corrected values (section 5c). No brand-yellow variant.
- D2. Fix 22: every More row gets an icon and rows are grouped; tab order becomes Today, Roster, PvP, Recs, More with Home reachable as the first row of More, labelled "Settings". `s.go('HOME')` in `qa_lib.js` and `smoke_render.js` is re-routed through More. This is the one owner-visible navigation change; call it out in the PR body so the owner can veto.
- D3. Visible button height 36 px (filled/tinted) with the existing 44 px `::before` strip; chips keep their current visible height.
- D4. Fix 18 in task 1 is the actionable empty state only (one primary "Import roster" button, no zero stats, no table headers). The guided first-run flow is task 3.
- D5. Audit section 8 item 11 (pixel snapshot regression) is not built: it is not in the owner's list and is flaky across machines. Everything else in section 8 is built.
- D6. Conformance checks ship at zero tolerance or with a short, named allow-list in the test file. "Baseline equals today's count" is not acceptable.
- D7. Task 2 keeps cloud snapshots off the launch path: metadata index in the user doc, bodies fetched only on restore, clock persisted. `updatedAt` moves to a server timestamp and every reader of it accepts both number and timestamp. The 30 s throttle stays in `firestore.rules` only if the client queues pushes to respect it; otherwise the rule is written without the throttle and DEPLOY.md says why. Client ships first, rules deploy second (owner).
- D8. Personal data: `git rm` the two import JSON files and both `logs/` files, drop the `.gitignore` exceptions, and gate "import from server" and the workflow-dispatch controls behind an owner-mode setting (off by default) that takes the repo `owner/name` from settings instead of the hard-coded one. The extraction workflows keep working for the owner because they `git add -f`. No history rewrite.
- D9. Admin-by-email is removed from the client (`ADMIN_EMAILS`, `migrateStatsAndSprites`, `refreshCloudGameData`) and from the README rules copy, together with the owner's email address.
- D10. CSP is injected by `scripts/build_bundles.py` / `build_index.js` into generated files, never hand-edited into `index.html`. It includes the popup `frame-src` entries now so task 3 does not reopen it.
- D11. Task 3 shows the first-run overlay when `localStorage['scout.firstRun.v1']` is absent; the QA harness sets `window.__noFirstRun = true` by init script and dedicated tests turn it on.
- D12. No Firestore migration. Local-first IndexedDB is noted as the next step only.

## Standing rules (included in every prompt below)

```
READ FIRST: /home/user/scout-dashboard/PROJECT_HANDOFF.md (especially "One source, generated bundles", "Unslop pass", "Bottom bar order", "Tab bar: back to classic scrolling", "Audit follow-up").
EDIT ONLY the sources: `Scout Dashboard.dc.html` and `pokemon-mechanics.js`. index.html and the other bundles are generated.
BUILD: python3 scripts/build_bundles.py after every source edit (--bump only for the final shipping build); python3 scripts/test_bundles_current.py must pass.
TESTS, all must pass before any commit:
  node scripts/qa/qa_run.js a | b | c | d | e   (one at a time, in the background, QA_OUT=/path/x.json, poll with short sleeps; no foreground command over 10 minutes)
  node scripts/test_roster_logic.js ; node scripts/test_ranking.js ; node scripts/smoke_render.js
  the Python tests listed in .github/workflows/test.yml (python3 -m venv /tmp/venv && /tmp/venv/bin/pip install -r requirements.txt)
  e2e tests pin PvPoke tiers via scripts/fixtures/pvp_tiers_pinned.json.
  A failing test can contaminate later ones: re-run before calling it a regression. Never skip, disable or weaken a test. Updating a locator because a label was renamed is allowed; removing an assertion is not.
  A 30-second "auto mode classifier gave no verdict" Bash error is transient: retry the same command.
PROJECT RULES: terse user-facing text; the AI advises and the user confirms; Gemini free tier only; no paid services; imports only from screenshots, recordings and CSV; nothing that violates Niantic's Terms of Service; never weaken TLS; no secrets in the repo; classic scrolling stays the default; never contact or write to the real Firebase project.
NEVER put a model identifier in code, comments, PR titles or PR bodies.
Work in stages. After each stage: build, run the suites, and make a LOCAL commit on claude/new-session-7rgriq so the work is resumable. Do not push, open a PR or merge: the manager verifies first.
Append a short section for this task to PROJECT_HANDOFF.md.
Finish only when every acceptance check passes. Report: files changed, each acceptance check with its evidence, test counts per suite, anything not done and why.
```

---

## Task 1: UI polish

**Goal.** All 30 ranked fixes of `docs/research/ui-polish-audit.md` section 6 and the design system of section 5, enforced by automated checks in `scripts/qa/qa_e2e_e.js`.

**Risks.**
- The largest risk is a blanket CSS rule that fixes a metric and wrecks the look (the 44 px lesson). Every global rule must be checked on screenshots.
- A codemod over about 1,000 inline `font:`/`border-radius`/padding values can change layout everywhere; run it per stage and look.
- Renamed labels and the moved Home tab break locators in suites a-d and `smoke_render.js`.
- Worker context exhaustion: the task is large; stages with local commits make it resumable. If the first worker runs out, a second one continues from the last stage commit with the same prompt plus "stages 1..N are done".
- Removing the runtime sentence-case layer could expose capitals that are logic keys.

**Worker prompt (paste as-is, after the standing rules):**

```
TASK: polish the UI of the Professor app so it reads as a premium, hand-made product. Implement everything in /home/user/scout-dashboard/docs/research/ui-polish-audit.md: read the whole file first. Section 6 is the list of 30 fixes (#0 to #30, there is no separate #... gap: count them), section 5 is the design system, section 7 is the order of work, section 8 is the automated checks. Line numbers in the audit have drifted: search by symbol or text.

HARD LESSON: an earlier blanket `min-height:44px !important` on all buttons made chips and pickers huge. Tap size is solved by the invisible ::before strip already in the CSS. Never grow a visible control to reach 44 px. Visible filled/tinted buttons are 36 px high; chips keep their current visible height.

DECISIONS ALREADY TAKEN
- Accent: the same blue in dark and light, using the exact token values in audit section 5c (white text only on --accent-fill #0a64d6, never on #0a84ff). Remove the amber light accent and the inline-hex override selectors by moving those colours to tokens. Light tokens are defined twice (`:root[data-theme="light"]` and the prefers-color-scheme block): edit both.
- Fix 22: tab bar becomes Today, Roster, PvP, Recs, More. Home moves to the first row of More, labelled "Settings". Every More row gets an icon; rows are grouped under headers. Re-route the HOME helper in scripts/qa/qa_lib.js and scripts/smoke_render.js through More.
- Fix 18: only the actionable empty state (centered icon, title, ONE primary "Import roster" button wired to the existing file input; no zero stat strip, no table headers). A guided first-run flow is a later task: do not build it.
- Fix 23: author sentence case in the display strings and stop the runtime case transform for chrome, but capitals that are logic keys (verdicts, grades, tags, state values) must not change. QA reads source wording with window.__keepCaps: keep that mechanism working or update locators, never delete assertions.
- Classic scrolling stays the default. Do not change the scroll model, the fixed tab bar positioning, or the chat bubble behaviour.
- Do not build the pixel-snapshot regression test (audit section 8 item 11). Build items 1-10 and 12.

STAGES (audit section 7). After each: build, look at screenshots, run suites a-e + smoke, local commit.
 0. BEFORE screenshots. Write scripts/qa/ui_shots.js (Playwright, deviceScaleFactor 2, reuse session() from qa_lib.js with the fixture roster scripts/fixtures/qa_roster.csv, real data/feed.json and data/promo_codes.json handed to state, sentenceCase on). It writes to a directory given as argv: every screen (TODAY, ROSTER, PVP, RAID, HOME, RECS, INTEL, ATTACK, LOG) full-page, plus detail sheet, More menu, chat sheet, a visible toast, select mode, and the empty-roster Today/Roster/PvP; in dark and light; at widths 320, 390, 402, 768. File names `<theme>_<width>_<screen>.png`. Run it into docs/research/ui-audit/before/ (commit only the 390 dark+light set and the 320 PvP shot; keep the rest in the scratch directory). Open them with the Read tool and compare with the audit's descriptions.
 1. Layout fixes: #0 toast colour in light, #1 PvP table at 390 and 320, #2 Evolve-now card grid, #3 toast moved to the bottom above the tab bar with an Undo slot and 3.2 s dismiss, #4 roster names never truncate at 390 for the fixture, #5 version string out of the header (move to Settings > About), 320 px header collision.
 2. Tokens with no visual change: add the :root tokens of 5a-5e (type, spacing, radii, elevation, colour roles, motion) beside the old ones and alias old names to new.
 3. Colour: #9 accent, #30 contrast, #8 inner panels lighter than their card (never black holes), max two nesting levels.
 4. Components, screen by screen: Roster (#15, #16, #19), Today (#6, #7, #8, #10, #11: reorder so "what to do now", live events and GBL this week come first and the long tail is collapsed), Home/Settings (#14: StatusLine vs Button vs list rows), then PvP/Raid/Recs/Attackers. Type scale #12, radii #13, spacing #26 are applied as each screen is migrated; remove the matching !important attribute-selector overrides as you go.
 5. Empty states and sheets: #17, #18 (as decided above), #20 grabber + close + consistent top radius, #21 flat hero and float once, #22.
 6. Motion and finish: #23, #24 (snap, scroll padding, trailing fade on horizontal scrollers; mark them data-scroller), #25 single press rule, #27 glossary sweep, #28 max-width 560 px content at 768, #29 tabular numerals and count-up once.
 7. AFTER screenshots into docs/research/ui-audit/after/ with the same script and the same commit subset. Look at every after image at 390 and 320 in both themes with the Read tool. Fix what looks wrong and re-shoot.

AUTOMATED CHECKS to add to scripts/qa/qa_e2e_e.js (extend SCAN and add tests; ids UIQ-xx). Each runs on all nine screens unless stated. Zero tolerance, or a short named allow-list constant at the top of the file with a comment per entry. A baseline equal to today's count is not acceptable.
 - Type scale: computed font sizes of visible text are in {12,13,15,17,22,28,32}; weights in {400,500,600,700}.
 - Radii: every non-zero border-radius is in {6,10,14,20} px, pill (>=999 px) or 50%.
 - Spacing: card padding and gap are multiples of 4; filled boxes nest at most 2 deep.
 - Real contrast in dark AND light: WCAG ratio of each visible text node against the composited background (walk ancestors, alpha-blend, skip gradients and .sr-only); >= 4.5 for normal text, >= 3 for large text. Include an open toast in both themes.
 - One icon family: no emoji (U+1F300-1FAFF, U+2600-27BF except an allow-listed U+2713 if still used) in header, nav, buttons, chips, rows; nav and button SVGs share one stroke width.
 - No name truncation: first 20 roster rows and all PvP rows at 390 have scrollWidth <= clientWidth on the name, and no mid-word breaks.
 - Widths 320, 390, 402, 768: overflowX == 0 on every screen and no element's right edge beyond innerWidth except inside [data-scroller].
 - Toast collision: an open toast's box does not intersect the header title, header buttons or the tab bar.
 - Copy lint: no all-caps runs of 8+ characters outside the allow-list, no v<digits>.<digits> in the header, none of "SYNC CSV", "Build dev", "free" as a stand-alone label; no more than 2 lines of caption prose directly under a section title.
 - Motion tokens: every transition/animation duration in the stylesheets and inline styles is one of 100, 160, 240, 360, 520 ms (infinite only on [data-ambient]); with reduced motion emulated, no animation is still running on the detail sheet after 50 ms.
 - Empty-state contract: with no roster, each screen shows exactly one visible primary button and no table header.
 - Keep the existing tap-target check exactly as strict as it is (strip-aware), and add: no visible button or chip is taller than 48 px (guards against the 44 px blanket regression).

ACCEPTANCE (all must hold)
 1. Each of the 30 fixes is done; your report has a 30-row table: fix number, what changed, where, and the screenshot or test that shows it.
 2. Suite e contains the checks above and passes; suites a, b, c, d pass; smoke_render, test_roster_logic, test_ranking, test_bundles_current and the Python tests pass. Report counts.
 3. Before and after screenshots exist at the paths above and you have looked at the after set.
 4. No visible control grew to hit 44 px; no test was skipped, deleted or loosened.
 5. PROJECT_HANDOFF.md has a "UI polish pass" section: tokens, component classes, the nav change, the new checks, what a future editor must use instead of inline sizes.
```

**Manager verification (do yourself, do not trust the report).**
1. `git diff --stat` and read the CSS token block, the toast rule, the PvP row template, the Evolve card template, the nav template, and every change to `scripts/qa/*.js`. In the test diff, search for removed `expect`, raised thresholds, `skip`, and the size of each allow-list.
2. Grep the source: `min-height:44px` must not appear on visible controls; `#9a4a06` gone; `color:#fff` not on `.ios-toast`; count of distinct `font:` sizes and radii should have collapsed.
3. Run suites a, b, c, d, e, smoke, roster logic, ranking, bundles check, Python tests yourself.
4. Run `ui_shots.js` yourself into a scratch directory and Read: dark and light at 390 for all nine screens, 320 PvP and Roster, 768 Today, toast in light, empty Today, detail sheet, More menu. Compare against the audit's slop list item by item.
5. Mutation check on two new tests: temporarily set the toast colour back to `#fff` and confirm the contrast test fails; add `min-height:44px` to chips and confirm the height guard fails. Revert.

---

## Task 2: security basics (no new login)

**Goal.** Launch-readiness sections B.5, C and D items that need no new sign-in method.

**Risks.**
- Breaking sync while changing `updatedAt`, snapshots and the listener. SYNC-01..04 must be extended before the code changes.
- Rules that lock real users out when the owner deploys them (numeric `updatedAt` in old documents, unlisted keys, throttle). Mitigated by the allow-list test and the client-first sequencing in DEPLOY.md.
- A CSP that passes under `file://` in QA but breaks on Pages; needs a served-over-http check.
- Removing the import JSON breaks "import from server" for the owner if the gating is wrong.
- SRI hash for gstatic files cannot be fetched if the sandbox blocks gstatic; fallback is the documented pin.

**Worker prompt (paste as-is, after the standing rules):**

```
TASK: security and quota basics for opening the Professor app to the public, with no new sign-in method. Read /home/user/scout-dashboard/docs/research/launch-readiness.md fully (sections B.2, B.5, C, D). Line numbers have drifted: search by symbol. You have no Firebase access and must never contact, deploy to or write to the real Firebase project. All sync testing uses the in-memory stand-in in scripts/qa/qa_lib.js (session({cloud})). Every fix gets an automated test, or where that is impossible a documented manual check in docs/SECURITY_CHECKS.md.

DELIVERABLES
A. firestore.rules at the repo root: the corrected rules of section C-1 (owner-only scoutUsers/{uid}, snapshots subcollection, shared gameData and sprites read-only with write false, catch-all deny, no admin-by-email, diff().affectedKeys() on update, `is timestamp` guards). Require a verified identity for writes where the report says so: `request.auth.token.email_verified == true` OR sign-in provider google.com / github.com (write this as a function and explain the trade-off in a comment). Add firebase.json pointing at the rules file. Add DEPLOY.md: numbered owner checklist (read the live rules first and save a copy; list the keys of a live document and compare with the allow-list; ship the client first and wait for installed apps to update; then deploy; how to roll back; the scrub-field migration window). Do NOT deploy.
   The rules and the client are coupled: the client writes updatedAt: Date.now() and pushes after 150 ms / 1.2 s. Change the client to write a server timestamp and make every reader of updatedAt accept both a number and a timestamp. Keep the 30 s throttle in the rules ONLY if you add client-side queuing so normal use never violates it (and prove it with a test against a stand-in that enforces the same rule); otherwise leave the throttle out and say so in DEPLOY.md.
   Tests: (1) a Node test scripts/test_firestore_rules.js that parses firestore.rules and fails if any key that buildCloudBlob (and its packed *Json form, lastSnapshotAt, the snapshot-index field you add) can write is missing from allowedKeysList, or if the rules contain `token.email in`, or lack the catch-all deny; add it to .github/workflows/test.yml. (2) Extend the qa_lib.js stand-in so it rejects writes with keys outside the same allow-list (read from firestore.rules), rejects other users' paths, and denies gameData/sprites writes; all sync tests must pass against it.
B. Quota fixes (B.5 #1-#4), without breaking sync:
   1. Persist the snapshot clock (localStorage and lastSnapshotAt in the user doc) so autoSnapshot really waits 6 hours across launches.
   2. No snapshot body reads on launch: keep a small metadata index (id, reason, count, createdAt) in the user doc, load bodies only when the user restores; prune by id from the index without reading bodies.
   3. Remove checkMigrationStatus, loadMechanicsFromCloud and the Firestore branch of resolveSpriteSrc from the launch path (shipped data and local sprites only). Remove ADMIN_EMAILS, migrateStatsAndSprites, refreshCloudGameData and the owner's email from source and README.
   4. Gate the user-doc listener: attached only while the page is visible, detached on hidden, re-attached on visible; stop pushing per-user copies of shared tables that can be derived from shipped data if that is safe (if not, say why and leave them).
   Make the stand-in count reads, writes, deletes and bytes per collection. New tests in suite d: SYNC-05 a signed-in launch with a roster costs exactly 1 read of scoutUsers/{uid}, 0 reads of gameData, sprites and snapshots, 0 writes when the last snapshot is under 6 hours old (clock survives a reload); SYNC-06 a snapshot older than 6 hours writes exactly one and reads no bodies; SYNC-07 restore from a cloud snapshot still works and reads exactly one body; SYNC-08 the listener detaches when hidden and re-attaches when visible; SYNC-09 a resource-exhausted write shows a clear status and keeps working locally. SYNC-01..04 keep passing unchanged in meaning.
C. Secrets: remove the `_secretsLocalOk === false` branch in buildCloudBlob and the adoption of those fields in applyRemote; keep the one-time scrub of old documents. Extend SYNC-03 to cover private mode (localStorage throwing) and snapshots. Send the Gemini key in the x-goog-api-key header instead of the URL query if the existing tests and the custom-endpoint path allow it; otherwise document why not.
D. URL validation: ICS export accepts only https links and strips CR/LF from every field; promo code links open only when the code matches ^[A-Za-z0-9]{4,32}$ and the link starts with https://store.pokemongo.com/; scripts/update_promo_codes.py validates the code before building a link. Tests in suite c and scripts/test_promo_codes.py with hostile inputs (javascript:, a newline with an injected ICS property, another host).
E. Content-Security-Policy as a <meta> tag injected by the build (scripts/build_bundles.py / build_index.js) into the generated files, never hand-edited into index.html. Start from the draft in C-8, including the Firebase popup frame-src entries. 'unsafe-eval' and 'unsafe-inline' are required by the runtime (support.js new Function, the unpack bootstrap): document that limitation, what it does and does not protect against, and what would remove it, in SECURITY.md. All QA suites must pass with the CSP present. Add a test that serves the repo over http://localhost (a tiny Node static server inside the test), loads index.html in Chromium and WebKit, and asserts zero CSP violation events through launch, CSV import, opening the detail sheet and the chat sheet, and that a fetch to https://example.com is blocked. The custom apiEndpoint feature conflicts with connect-src: follow the report (drop it from the public build or gate it behind owner mode) and say which you did.
F. Firebase SDK supply chain: add integrity + crossOrigin to the three gstatic compat scripts if you can download them to compute sha384 (through the configured proxy, never weakening TLS); record the hashes and how to recompute them in SECURITY.md. If gstatic is unreachable, do not guess hashes: document the pin and the exact command for the owner. The QA route that replaces these files must keep working (a test double served with a different body would fail SRI: handle that explicitly, for example the harness strips the integrity attribute, and say so in a comment).
G. GitHub Actions: `permissions:` block on every workflow (contents: read by default, write only on the jobs that commit); every `${{ inputs.* }}` and other untrusted expression used in `run:` moved to `env:` and referenced as a quoted shell variable; confirm there is no pull_request_target or workflow_run and that secrets are not exposed to pull_request. Add scripts/test_workflows.py (run in test.yml) that fails on `${{ inputs`/`${{ github.event` inside a run block, on a workflow without permissions, and on pull_request_target.
H. Files: LICENSE (MIT for the code, with a NOTICE paragraph that Pokemon names, sprites and game data are not covered), SECURITY.md (how to report privately, supported version, the CSP and SRI notes, key handling), CONTRIBUTING.md (how to build and run QA, no real account data or screenshots with personal details, never paste keys), PRIVACY.md (adapt the text in C-12; say what is stored where, Google as processor, Gemini free-tier terms from C-15 in plain words, how to export and delete), and the non-affiliation notice from C-13 in README, PRIVACY.md and in the app (Settings > About, terse). Use a placeholder contact that the owner fills in; do not invent an address.
I. In-app data controls in Settings: "Export my data" (the existing full backup file) and "Delete my account and cloud data" (confirm twice; deletes snapshots, then the user doc, then the Auth user; on auth/requires-recent-login asks the user to sign in again; then clears scout.local.v1 and scout.secrets.v1 on the device). On sign-out also clear or namespace the local copy per uid so a second user on the same device does not see the first user's data (D.2). Tests against the stand-in: DATA-01 delete leaves no user doc, no snapshots, no auth user and no local copy; DATA-02 export contains the roster and no secrets; DATA-03 user A signs out, user B signs in, B never sees A's roster.
J. Personal data in the tree: first grep workflows, app and tests for every use of data/pokemon_import.json, data/appraisal_import.json and logs/. Then `git rm` those two JSON files and the tracked files under logs/ (never rewrite history), remove the .gitignore exceptions, and gate "import from server" and the workflow-dispatch controls behind an owner-mode setting that is off by default and takes the repository owner/name from settings instead of the hard-coded one. The owner's extraction workflows must still work (they use git add -f). Check scripts/fixtures/detail_screens/*.png with the Read tool for a trainer name or friend code and report what you see; do not remove them without evidence. Add a test that fails if the owner's email or those files reappear in the tracked tree.
K. Regression guard: a CI grep test that fails on innerHTML, dangerouslySetInnerHTML, document.write or eval( in `Scout Dashboard.dc.html`, and an e2e test that imports a roster whose names and notes contain `<img src=x onerror=window.__xss=1>` and asserts window.__xss stays undefined.

ACCEPTANCE
 1. Every deliverable A-K is present; the report maps each launch-readiness finding (C-1, C-2, C-5, C-6, C-7, C-8, C-9, C-10, C-12, C-13, C-17, C-18, C-19, C-21, B.5 #1-#4) to the change and its test or manual check. Items you could not do are listed with the reason.
 2. Suites a-e, smoke, roster logic, ranking, bundles check and all Python tests pass, including the new ones. Report counts.
 3. No request to the real Firebase project was made. No secret, personal email or personal roster is in the tracked tree.
 4. DEPLOY.md and docs/SECURITY_CHECKS.md exist and are exact enough for the owner to follow without reading code.
 5. PROJECT_HANDOFF.md has a "Security basics" section, including "next step: local-first IndexedDB, cloud sync opt-in (not done)".
```

**Manager verification.**
1. Read `firestore.rules` line by line against C-1 notes (a)-(g); walk the mental IDOR tests in note (e).
2. Read the diff of `buildCloudBlob`, `applyRemote`, `autoSnapshot`, `loadSnapshots`, `pruneSnapshots`, `subscribeCloudDoc`, `onAuthChange`, `resolveSpriteSrc`; confirm the read/write counts by running suite d and reading the SYNC-05..09 assertions (they must assert exact numbers, not "less than").
3. `git ls-files | grep -E 'pokemon_import|appraisal_import|^logs/'` is empty; `git grep -n` for the owner's email and `admin@scout.app` is empty outside the research reports.
4. Read every workflow diff; run `scripts/test_workflows.py`.
5. Run all suites yourself. Run the CSP test. Load the built `index.html` over a local http server once and read the console for violations.
6. Mutation checks: add `geminiKey` to the blob and confirm SYNC-03 and the stand-in reject it; remove a key from `allowedKeysList` and confirm `test_firestore_rules.js` fails. Revert.
7. Read the delete-account code path for ordering and for what happens when a step fails half-way.

---

## Task 3: sign-in and first-run

**Goal.** Google and GitHub sign-in by popup with email/password kept, account-linking handling, and a skippable guided first-run page (launch-readiness section A).

**Risks.**
- Nothing here can be verified against real providers by an agent. The owner checklist and the real-device test are the gate.
- iOS home-screen app popup behaviour is unknown (report: NOT VERIFIED). Email/password must remain a complete path and popup failures must say what to do.
- "Same email, different provider" behaviour is unverified, including whether the UID survives; the roster lives at `scoutUsers/{uid}`. The export/import path must be offered before any risky step.
- A first-run overlay on fresh storage would cover every existing e2e flow; the harness flag must be in place before the overlay ships.
- GitHub users can have a null email; every place that shows `user.email` needs a fallback.

**Worker prompt (paste as-is, after the standing rules):**

```
TASK: add Google and GitHub sign-in and a guided first-run page to the Professor app. Read /home/user/scout-dashboard/docs/research/launch-readiness.md section A fully (A.1-A.5b), plus C-12 and C-15. You cannot configure Firebase or test real providers and must never contact the real Firebase project: everything is built and tested against the in-memory stand-in in scripts/qa/qa_lib.js, which you extend. Search by symbol; line numbers have drifted.

PART 1: SIGN-IN
- New methods next to signIn/signUp: signInGoogle, signInGithub (no extra scopes: identity only), startSocial (auth.signInWithPopup), handleAuthError, linkProvider(providerId) (currentUser.linkWithPopup), unlink is not needed. Never use signInWithRedirect.
- Sign-in card: "Continue with Google" and "Continue with GitHub" buttons first, email/password under a collapsed "Use email instead" disclosure (kept fully working, in both the configured and the fork/unconfigured template blocks). Signed-in card: shows email, or displayName, or the provider uid when the email is null; "Link Google" / "Link GitHub" rows for providers not yet linked.
- Errors, each with a terse plain message and a next step, never a raw code:
  auth/account-exists-with-different-credential: keep the pending credential in memory only; show "This email already has an account. Sign in the way you did before, then we will link <provider>."; after the user signs in with the existing method call linkWithCredential(pending); if that fails, offer the safe path "Export a backup, sign in with the other method, import the backup" using the existing backup file. Before any link attempt, offer the backup.
  auth/credential-already-in-use and auth/email-already-in-use on linking: same safe path.
  auth/popup-blocked, auth/popup-closed-by-user, auth/cancelled-popup-request, auth/operation-not-supported-in-this-environment: "Sign-in window did not open. Try again, open the app in your browser, or use email instead."; closing the popup is not shown as an error.
  auth/network-request-failed and anything else: a generic retry message; the app keeps working signed out.
- A UID change must never silently look like data loss: if a sign-in lands on an account with an empty cloud document while this device holds a non-empty local roster from a different signed-in uid, do not overwrite either side; ask the user (keep this device's data / use the account's data), in line with "the app advises, the user confirms".
- Stand-in (qa_lib.js): firebase.auth.GoogleAuthProvider and GithubAuthProvider classes; signInWithPopup resolving a user with providerData; several accounts keyed by uid, shared between sessions like the fake Firestore; linkWithPopup, linkWithCredential, currentUser.delete; a test hook to script the next popup result (success as a given account, a named error code with an attached credential, a GitHub user with email null). Existing sessions must behave exactly as before by default (auto sign-in as qa-user when cloud is on).
- Tests (suite d, ids AUTH-01..): Google sign-in loads that account's roster; GitHub sign-in with null email shows a name, not "null"; email/password still works from the disclosure; account-exists error then sign-in with the old method links and keeps the SAME uid and roster; failed link offers the backup path and loses nothing; popup blocked shows the fallback and the app stays usable; popup closed shows no error; linking a second provider from the signed-in card; sign out then sign in as another account shows no data from the first; the empty-cloud versus local-roster prompt.

PART 2: FIRST-RUN PAGE
- A full-screen overlay shown when localStorage['scout.firstRun.v1'] is absent (wrapped in try/catch like the rest of the file), for signed-out users too. "Skip" is visible on every step and "Back" works; closing at any step stores progress; finishing or skipping sets the key; Settings has a "Welcome tour" row that reopens it. It must never trap the user: Escape, Skip and the system back gesture all leave it, and it never opens over an import in progress.
- Steps, terse text, using the design tokens and components from the UI polish pass (read the "UI polish pass" section of PROJECT_HANDOFF.md) and the existing handlers:
  1. Welcome: one sentence on what the app does; Continue with Google, Continue with GitHub, Use email, Continue without an account.
  2. Bring your Pokemon: screenshot import, screen recording, CSV, restore from a backup file. No "import from server".
  3. Look and feel: theme Auto/Light/Dark (setThemePref) and text size (setUiZoom) with a live preview.
  4. Optional AI reading: what the Gemini key is for; where to get a free one (https://aistudio.google.com/apikey); that the key stays on this device and is never uploaded by the app; that imported screenshots are sent to Google Gemini with the user's own key; that on the free tier Google may use them to improve its products; adults only; the free tier is not offered for users in the EEA, UK or Switzerland; nothing breaks if skipped. The key field is enabled only after an "I am 18 or older" confirmation.
  5. Reminders: explain, then ask for notification permission only after a tap; on iOS say it needs the Home Screen install.
  6. Privacy summary: what is stored where, Export my data, Delete my account and cloud data (the existing actions), link to PRIVACY.md, the non-affiliation notice.
- QA harness: add an init script `window.__noFirstRun = true` in session() so existing tests are unchanged, and a session option to turn the first-run on. Tests (ids FIRSTRUN-01..): fresh storage shows step 1; Skip on step 1 closes it and it does not come back after reload; each step's control changes the real setting (theme, zoom, key saved to local secrets only and absent from the cloud blob); the key field is disabled until the age box is ticked; Back and progress resume; reopening from Settings; signed-out completion; the overlay passes suite e's checks (contrast in both themes, widths 320/390/402/768, no overflow, type and radius conformance) and axe.
- Screenshots: extend scripts/qa/ui_shots.js to capture all six steps and the sign-in card in dark and light at 320 and 390 into docs/research/ui-audit/firstrun/, and look at them with the Read tool.

PART 3: OWNER DOCUMENTATION
Write docs/OWNER_CHECKLIST.md: exact numbered steps for what agents cannot do: Firebase console > Authentication > Sign-in method: enable Google; create a GitHub OAuth App (not a GitHub App) with homepage = the Pages URL and callback https://pokemon-professor.firebaseapp.com/__/auth/handler, paste client id and secret into the Firebase GitHub provider; Authentication > Settings > Authorized domains: add stupid-picasso.github.io, remove localhost; check the "one account per email" linking setting and email enumeration protection; restrict the API key; deploy firestore.rules per DEPLOY.md after the client has shipped; a real-device test script (iPhone installed to the Home Screen, Android installed app, desktop Safari/Chrome/Firefox: Google popup, GitHub popup, sign out and in, link a provider on the existing email account and confirm the roster is still there, delete account) with iOS home-screen popup behaviour marked "needs a real-device test" and the fallback if it fails (email/password, or email-link sign-in as a later change); a throwaway-project test for "unverified email/password account then Google with the same gmail address" before inviting anyone.

ACCEPTANCE
 1. All AUTH and FIRSTRUN tests exist and pass; suites a-e, smoke, roster logic, ranking, bundles check and Python tests pass. Report counts.
 2. Existing tests needed no weakening; the only harness change for them is the __noFirstRun flag.
 3. The first-run screenshots exist and you have looked at them in both themes.
 4. docs/OWNER_CHECKLIST.md exists; PROJECT_HANDOFF.md has a "Sign-in and first-run" section stating plainly what is untested against real providers.
 5. Regenerate docs/QA_REPORT.md: node scripts/qa/qa_accuracy.js <accuracy.json>; merge the five e2e outputs; python3 scripts/qa/make_report.py <accuracy.json> <merged e2e.json> docs/QA_REPORT.md.
```

**Manager verification.**
1. Read the diff of the auth methods and the error handler: pending credential held in memory only, no `signInWithRedirect`, no scopes requested, every error path leaves the app usable.
2. Read the stand-in diff: the default path for existing sessions is unchanged.
3. Run all suites. Read the AUTH tests to confirm the linking test asserts the same uid and roster.
4. Read the first-run screenshots (six steps, dark and light, 320 and 390): Skip visible on every step, no truncation, matches the polish tokens.
5. Manually drive one session with first-run on: skip at step 1, reload, confirm it stays closed.
6. Check the Gemini step wording against C-15 and that the key is absent from the cloud blob (SYNC-03 still passes).

---

## Shipping, per task (after manager verification)

1. `python3 scripts/build_bundles.py --bump`, then `python3 scripts/test_bundles_current.py`.
2. Commit on `claude/new-session-7rgriq` with the trailers supplied by the main session; `git push -u origin claude/new-session-7rgriq`.
3. PR to `main` (owner `stupid-picasso`, repo `scout-dashboard`), body ends with the generated-with line and the session URL; merge with method `merge` (on 405 wait 20 s and retry).
4. `git fetch origin main && git reset --hard origin/main && git push --force-with-lease origin claude/new-session-7rgriq`.
5. After task 3: regenerate `docs/QA_REPORT.md` and confirm `git status` is clean.

Note for whoever ships: the GitHub connector failed to connect in the planning session (its error said sessions are bound to their configured repositories). If it is still down, PRs cannot be opened by an agent; stop after the push and tell the owner.

## Owner checklist (cannot be done by agents)

1. Firebase console > Firestore > Rules: copy the live rules somewhere safe and compare with `firestore.rules` once task 2 has produced it.
2. Authentication > Users: check whether `admin@scout.app` is a registered user; delete it if it is not yours.
3. Authentication > Settings: email enumeration protection on; note the "user account linking" (one account per email) setting.
4. Authentication > Sign-in method: enable Google.
5. GitHub > Settings > Developer settings > OAuth Apps > New OAuth App: homepage `https://stupid-picasso.github.io/scout-dashboard/`, callback `https://pokemon-professor.firebaseapp.com/__/auth/handler`. Copy the client ID and secret into Firebase > Sign-in method > GitHub and enable it. Request no scopes. The secret never goes into the repo.
6. Authentication > Settings > Authorized domains: add `stupid-picasso.github.io`; remove `localhost`.
7. Google Cloud console > Credentials: restrict the web API key to Identity Toolkit, Token Service, Firestore and Firebase APIs, and to the app's referrer; never add the Generative Language API to it.
8. After the task 2 client has shipped and installed apps have updated: deploy `firestore.rules` following `DEPLOY.md`.
9. GitHub repo settings: Actions default token read-only; secret scanning and push protection on.
10. Real-device test: iPhone with the app installed to the Home Screen (popup behaviour unknown: needs a real-device test), Android installed app, desktop browsers; Google and GitHub popup, sign out and in, link a provider to the existing email account and confirm the roster is still there.
11. In a throwaway Firebase project: create an unverified email/password account on a gmail address, then sign in with Google on the same address; confirm the UID is unchanged before inviting anyone.
12. Fill in the contact address in `SECURITY.md` and `PRIVACY.md`.

## Not in this pass

- Local-first IndexedDB storage with opt-in cloud sync (next step after task 2's quota fixes).
- App Check, a dedicated origin or custom domain, splitting the user document, history clean-up of old bundles and personal files, strict CSP without `unsafe-eval` (needs a precompile build step and a host that sends headers).
