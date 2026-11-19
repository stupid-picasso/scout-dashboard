# Stop committing the generated bundles: build them in CI (plan only)

Base: origin/main 8ffe767. Nothing here is implemented. Line cites are to that commit.

## 0. Findings that change the framing (read first)

**0.1 The 1.42 GiB is not mostly the bundles.** Measured on this clone (`git rev-list --objects --all | git cat-file --batch-check`, on-disk delta sizes; blobs total 1,502 MiB):

| What | MiB | Share |
|---|---|---|
| `data/debug_bars/*.png` (1,190 blobs) | 1,182 | 79% |
| `index.html` + `Scout Dashboard.html` + `Scout Dashboard Standalone.dc.html` (all refs) | 83.7 + 82.8 + 34.2 = 201 | 13% |
| `.propagate_baseline/dc.html` | 6.2 | 0.4% |
| source `Scout Dashboard.dc.html` (stays committed) | 27.7 | 2% |

The `debug_bars` blobs are reachable from **only two refs**: `origin/pvpoke-data-20261014` and `origin/pvpoke-data-20261021` (stale weekly-PR branches, 520 commits, 89 `debug_bars` files in the tip tree). They are not reachable from `origin/main`, `origin/claude/new-session-7rgriq`, any local branch, or the other four `pvpoke-data-*` branches. `git merge-base origin/main origin/pvpoke-data-20261014` prints nothing: **no common ancestor**, so main's history was already rewritten once after 2026-10-21 and these branches are the pre-rewrite leftovers. Same measurement on `origin/main` alone: 254 MiB of blobs, of which the generated bundles plus baseline are 60 MiB (24%).

Consequence: untracking the bundles saves roughly a quarter of main-only history (about 60 MiB, growing about 0.5 MiB per app commit; they changed in 106 of 272 commits), and does nothing for the 1.18 GiB. The real size fix is a ref deletion (section 5). The bundles are still worth untracking for the other reasons: no 3 x ~2 MB diffs and merge conflicts in every PR, no stale-bundle CI failures, and `update-pokemon-data.yml` committing `pokemon-mechanics.js` to main (line 43-47) without rebuilding the embedded copy today.

**0.2 The build is not reproducible from a clean checkout.** `build_bundles.py` takes the *existing committed bundles as input*: `build_bundle_text(dc, bundle_src)` keeps everything outside the template tag (615,566 B: manifest, ext_resources, page_order, boot code) and the template head (13.7 KB) from the old file (lines 51-58); `build_standalone_text` keeps the old file's 101 KB head (lines 61-64); `main()` reads both existing files (line 72). `build_index.js` then reads `Scout Dashboard.html` (line 104). If the bundles are untracked, `build_bundles.py` fails on a fresh checkout. So the plan needs a small committed **skeleton** per bundle (section 2.1). This is the largest piece of work.

**0.3 Bot data commits must trigger a deploy, and a `push` workflow will not do that.** Evidence from the Actions API: the built-in "pages build and deployment" workflow (workflow id 323113187, 758 runs, event `dynamic`, about 35 s each) runs after bot pushes made with `GITHUB_TOKEN`, including `[skip ci]` ones: run 756 (head "Refresh events and GBL feed (2026-11-18)"), 735 and 733 ("Auto-extract ... [skip ci]"). A custom `on: push` workflow does **not** fire for `GITHUB_TOKEN` pushes (GitHub rule: only `workflow_dispatch` and `repository_dispatch` are exempt), and `[skip ci]` suppresses it too. The app reads Pages-served data files with relative URLs: `data/promo_codes.json` (dc.html:14718), `data/event_moves.json` (:17890), `data/feed_check.json` (:17895), and `data/feed.json` first (:9398-9401, raw.githubusercontent only as fallback). So without an explicit deploy trigger in the bot workflows, promo codes and event moves on the live site would go stale. Section 2.3.

**0.4 Pages has failed before for deploy reasons.** Runs 746-752 failed (Jekyll choking on Liquid-looking braces in docs), fixed by `.nojekyll` (#82). An Actions deploy never runs Jekyll, so that class of failure disappears. Keep `.nojekyll` anyway (rollback to branch mode needs it; `scripts/test_tracked_tree.js` enforces it).

**0.5 CI is already shallow.** `grep -rn fetch-depth .github` finds nothing: every workflow uses `actions/checkout@v4` with the default depth 1. CI does not pay for history today. This also rules out "version = commit count" (needs `fetch-depth: 0`).

## 1. Target design

### Option A (recommended): GitHub Actions Pages deploy
New `.github/workflows/pages.yml`:
- Triggers: `push` to `main`, `workflow_dispatch`, `workflow_call` (so bot workflows can invoke it).
- `concurrency: {group: pages, cancel-in-progress: false}`.
- Job `build` (permissions `contents: read`): checkout (depth 1), setup-node 20, `npm ci` (terser is in package.json:15), `python3 scripts/build_bundles.py` (no `--bump`; see 2.2), stage `_site/` (see 2.4), `actions/configure-pages`, `actions/upload-pages-artifact`.
- Job `deploy` (`needs: build`, permissions `pages: write`, `id-token: write`, `environment: github-pages`): `actions/deploy-pages`.
- Pin actions by major version as the other workflows do.

### Option B: built output on a branch
Deploy job force-pushes an orphan single-commit branch (e.g. `pages-built`) with the built site; Pages stays on "Deploy from a branch" with that branch. Needs `contents: write` and a force push; the old built tips stay on GitHub's servers until GC, and every clone fetches one more branch (about 6 MB tip). Rollback is a branch-name flip.

| | A: Actions deploy | B: built branch |
|---|---|---|
| Free tier | Free for public repo (repo is public: .gitignore comment). Standard runners are free on public repos. Sites published by a custom workflow are not subject to the 10 builds/hour soft limit (verify in current docs; today 758 runs so far, about 6 h cron plus merges, nowhere near it). | Same, but stays under the soft limit for branch builds |
| Owner setting change | Yes (Source -> GitHub Actions), one dropdown | Yes (branch name) |
| Extra moving parts | `github-pages` environment, deploy-pages permissions | Force-push logic, second branch, GC residue |
| History bloat | None (artifacts expire) | Server-side only, clones see a tip |
| Rollback of a bad deploy | Re-run an older successful deploy run | Force-push the previous tip |
| Jekyll | Not involved | Still the built-in workflow (keep `.nojekyll`) |
| Bot triggers | Need explicit dispatch (0.3) | Need explicit dispatch too |

Recommendation: A. B is the documented fallback if the owner does not want to touch the Pages source dropdown.

## 2. What must change

### 2.1 Skeletons (blocker from 0.2)
- One-time script `scripts/make_skeletons.py` (run once by the implementer): write `scripts/skeleton/Scout Dashboard.html` = current bundle with the `__bundler/template` JSON truncated at `</helmet>` (the code only uses `old_tpl[:ts]`, the style span, and `old_tpl[te:index('</helmet>')]`, so a truncated template works with no change to `build_bundle_text`); write `scripts/skeleton/Scout Dashboard Standalone.dc.html` = current standalone truncated at `</helmet>`. Expected sizes: bundle skeleton about 0.7 MB (the manifest carries a gzip+base64 copy of `pokemon-mechanics.js` that `sync_embedded_mechanics` re-embeds on every build, propagate_edits.py:494-535), standalone skeleton about 0.14 MB. They change only when design-system resources or the head change.
- `build_bundles.py`: read the skeletons instead of the root bundles; write outputs to the repo root (same paths as today) so every test keeps working unchanged. Add `--out DIR` for the deploy stage. `--check` becomes "build to a temp dir and diff", used only locally.
- Verify before dropping the tracked files: build from the skeleton and compare byte-for-byte with the currently committed bundles. This is the acceptance gate for the whole plan. Caveat: the gzip header in the mechanics blob embeds a timestamp, so compare decoded content, not bytes, for that one entry (current `--check` already tolerates this because it compares the decoded blob).
- `scripts/build_index.js` also rewrites the CSP tag into the **source** `Scout Dashboard.dc.html` (lines 137, 165, 175) and into the other pages. Keep that behaviour; the committed source must still carry the current CSP tag. Replace `test_bundles_current.py` (5 lines; line 5 runs `--check`) with a check that (a) the build from skeletons succeeds and passes `verify_syntax()` (propagate_edits.py:455-478), (b) `build_index.js --check` finds no stale CSP in the source.
- Does anything still need `Scout Dashboard Standalone.dc.html`? It is not in `sw.js` SHELL_ASSETS; it is only CSP-tagged and read by `test_push_config.js:32`. Open question 3: if unused, drop it from the build and delete its skeleton (about 35 MiB of history growth gone and one less file).

### 2.2 Version bump
Constraints: `checkBuildUpdate` extracts `/scout-v(\d+)/` from the server's `sw.js` and shows "tap to reload" only if `n > this._swBase` (dc.html:4610-4615); the About line shows `vNN.MM` from the source (dc.html:2320); `qa_e2e_a.js:24` (BOOT-02) expects `/v53\.\d+/`.

Options:
1. **Keep the counters committed (recommended).** `sw.js` (`scout-v412`, line 1) and the `vNN.MM` tag in `Scout Dashboard.dc.html` stay in git; `build_bundles.py --bump` still edits them (propagate_edits.py:677-700), but `bump_all_versions` loses the Standalone/bundle replace loop (line 686) because those are build outputs now. Semantics unchanged: the number moves only when a person or bot decides the app changed. Diffs are a one-line change in an 8 KB and an already-tracked file. Monotonic by construction, always matches the regexp, and needs no history.
2. Derive in CI from `github.run_number` (+ constant offset). Monotonic per workflow, but: it moves on every deploy, so the 6-hourly feed bot would raise "tap to reload" for every user with no app change; the offset must be chosen at migration; unclear whether renaming the workflow file resets the counter; `sw.js` in git would carry a placeholder the tests must tolerate.
3. Commit count (`git rev-list --count`): needs `fetch-depth: 0` (the thing 0.5 avoids), and any history rewrite lowers it, which would silently disable update prompts (`n > base` false). Rejected.

Add one new CI gate (test, PR only): if any of `Scout Dashboard.dc.html`, `pokemon-mechanics.js`, `support.js`, `src/`, `ds/` changed relative to the base and `sw.js` CACHE_NAME did not, fail with "run build_bundles.py --bump". Today nothing enforces this (the bot at update-pokemon-data.yml:43 changes `pokemon-mechanics.js` with no bump); make it a warning first, gating later.
Rollback caveat (already true today): reverting a commit also reverts its counter, so clients that took the newer build see `n <= base` and get no prompt. Roll forward (revert + bump), never bare-revert an app change.

### 2.3 Workflows
- `test.yml`: replace step "Bundles match the source" (lines 62-64) with "Build bundles" (`python3 scripts/build_bundles.py`), and move it **before** "Content-Security-Policy over http://localhost" and "Smoke render" (both read `index.html`). `npm install` is already there (line 56).
- `qa.yml`: add the same build step after "Install tooling" (it has `npm install`, line 31-ish; python3 is on the runner, the build uses stdlib plus node/terser). Matrix runs on both browsers; building twice costs seconds.
- `update-pvpoke-data.yml`: the "Rebuild" step (lines 70-77) keeps `build_bundles.py --bump` when `pokemon-mechanics.js` changed (it still bumps `sw.js` and the source tag; `git add -u` at line 100ish then commits only tracked files, so the generated bundles never ride along because they are ignored). The report loop (line 82) swaps `test_bundles_current.py` for the new check.
- `update-events-gbl.yml`: after "Commit if changed" (pushes at the last line) add a deploy trigger. Two ways, pick one: (i) job `deploy: needs: update, uses: ./.github/workflows/pages.yml` with job-level `pages: write`, `id-token: write`, `contents: read`; (ii) final step `gh workflow run pages.yml --ref main` with job permission `actions: write` and `GH_TOKEN`. (i) is cleaner (no extra run, visible in one graph) but only if the commit step actually pushed (expose an output `changed`). `scripts/test_workflows.py` bans top-level write, `workflow_run` and `pull_request_target`; both options pass; job-level permissions are required.
- `update-pokemon-data.yml` (stat-fix auto-commit, lines 38-62): same deploy trigger, because it changes served app code.
- `extract.yml`, `extract-iv.yml`, `extract-auto.yml`, `benchmark-models.yml`: they commit `data/pokemon_import.json`, `data/appraisal_import.json`, benchmark files, all `[skip ci]`. The app fetches the imports from raw.githubusercontent.com (dc.html:12719, :13184), not Pages, so **no deploy needed**. (Today they do redeploy Pages as a side effect; that stops. Intended.)
- Concurrency groups: bots keep `pogo-data-commit` / `update-events-gbl`; deploy uses its own `pages` group. A deploy queued while another runs is held; a third replaces the queued one, which is what we want.

### 2.4 Which files go into the Pages artifact
Today Pages serves the whole repo. Phase 1 keeps behaviour: copy the repo to `_site/` excluding `.git`, `.github`, `.claude`, `.agents`, `node_modules`, `.propagate_baseline`, `scripts/skeleton`. Size: 82 MB of tree plus about 6 MB built, far below the 1 GB limit. Later, optional trim (docs 47 MB, scripts, worker, logs): only after checking the app and `sw.js` SHELL_ASSETS (sw.js:5-14) fetch nothing from them. The app fetches relative: `sw.js`, `data/*.json`, `support.js`, `pokemon-mechanics.js`, `src/sample-data.js`, `ds/`, `icons/`, `sprites/`, `manifest.json`, `IV CP HP Guide.dc.html`, `Scout Dashboard.dc.html`. `Scout PWA Simulator.dc.html` and the Standalone page are also served today (SECURITY.md:27 lists the CSP'd pages).
Same-origin path (`/scout-dashboard/`) and file layout are unchanged, so installed PWAs, the service-worker scope and `manifest.json` `start_url: "./"` are unaffected.

### 2.5 Everything that opens a built file (each needs the built file at repo root, i.e. a build first)
`index.html`:
- `scripts/smoke_render.js:6,15` (file:// or argv path)
- `scripts/qa/qa_lib.js:7,49,323` (base for suites a-e via `qa_run.js`)
- `scripts/qa/qa_e2e_c.js:31,243-245,249,253,264-267,279,299,303,312` (SEC-04..06, PWA-03..12, A11Y-06/10, PERF-04; `tplOf` decodes the bundler template)
- `scripts/qa/qa_lighthouse.js:8,22`
- `scripts/test_csp.js:14,25-26,46`
- `scripts/test_push_config.js:32-37` (also reads the Bundle and Standalone)

`Scout Dashboard.html`: `scripts/build_index.js:104,137`, `scripts/test_push_config.js:32`, legacy `scripts/slim_bundles.py:14`, `scripts/propagate_edits.py:66,72`.
`Scout Dashboard Standalone.dc.html`: `build_bundles.py:72`, `build_index.js:137`, `test_push_config.js:32`, `propagate_edits.py:64,686`.
`.propagate_baseline/`: only `propagate_edits.py:62,538-642` (snapshot/apply/verify). PROJECT_HANDOFF.md:559 already calls it retired. Remove the three tracked files and the three CLI commands; keep the helpers `build_bundles.py` imports (`read`, `write`, `sync_embedded_mechanics`, `bump_all_versions`, `verify_syntax`).
Unaffected (read the source or `sw.js`): `test_roster_logic.js:47`, `test_no_dangerous_sinks.js:5`, `test_sri.js:5`, `test_firestore_rules.js:9`, `push_config.js:5`, `test_tracked_tree.js` (git ls-files, `.nojekyll` check at line 36), `test_push_sw.mjs:10` (sw.js), `qa_e2e_b.js:2154`, `qa_e2e_e.js:577-632`, `qa_push.js:174`.
Add a friendly guard in `qa_lib.js`, `smoke_render.js`, `test_csp.js`, `qa_lighthouse.js`: if `index.html` is missing, print "run: python3 scripts/build_bundles.py" and exit 2.
Also add `index.html`, `Scout Dashboard.html`, `Scout Dashboard Standalone.dc.html` to `.gitignore` (root-anchored: `/index.html` etc.).

### 2.6 Local dev flow
`npm install` once; `python3 scripts/build_bundles.py` after any source edit (as today, but nothing to commit); `--bump` only for the shipping build (commits `sw.js` and the source tag). Preview with `python3 -m http.server`. Worker agents get the same rule: the Standing rules (manager-plan.md:44-45, "EDIT ONLY the sources ... BUILD ... test_bundles_current.py must pass") change to "build before running suites; the committed tree has no bundles". Fresh worktrees have no `index.html` until built (guard above).

### 2.7 Docs to update
- `PROJECT_HANDOFF.md:556-559` ("One source, generated bundles"): new workflow, skeletons, deploy, retired baseline; add a dated section.
- `DEPLOY.md` is the Firestore-rules checklist; its step 5 (line 226, "Merge and publish this version of the app (GitHub Pages)") stays true; add one line that "publish" is now the Pages workflow run, and where to see it. A separate short section "Publishing the app" (owner steps of section 3) belongs in `DEPLOY.md`.
- `README.md`, `CONTRIBUTING.md`, `SECURITY.md:11,27`, `docs/research/manager-plan.md` Standing rules.

## 3. Owner steps

Switch (after phase 2 below, when `pages.yml` is on main):
1. GitHub, repo `stupid-picasso/scout-dashboard` -> **Settings** (top tab).
2. Left sidebar, "Code and automation" -> **Pages**.
3. Under **Build and deployment**, **Source** dropdown: currently "Deploy from a branch" (main, / root). Choose **GitHub Actions**. There is no Save button; it applies at once.
4. Go to **Actions** -> "Deploy Pages" -> **Run workflow** (branch `main`). Wait for the green deploy; open the URL it prints (https://stupid-picasso.github.io/scout-dashboard/) and in Settings -> About check the build number.
5. Settings -> Environments -> `github-pages`: leave the default deployment branch rule (main only). Workflow dispatch from other branches is refused by design.

Keep the gap small: do step 3 and 4 back to back. The previous deployment should keep being served until the first Actions deployment replaces it, but I could not verify that from here; it is the first thing to test (on a throwaway fork before the real switch if the owner wants zero doubt).

Rollback: Settings -> Pages -> Source -> "Deploy from a branch" -> branch `main`, folder `/ (root)` -> Save. This only works while `main` still carries committed bundles (phases 1-2). After phase 3 (bundles untracked) branch mode would serve a tree without `index.html`. Rollback after phase 3: either re-run an older successful deploy from the Actions tab (preferred, no setting change), or revert the phase-3 commit, run the build, commit the three files, then flip the Source back.

## 4. Migration order (live site never down or stale)

- **Phase 0 (no risk, can be done today by the owner):** delete the two stale remote branches (section 5). No code change.
- **Phase 1 (additive PR, bundles still committed):** skeletons + `build_bundles.py` reading them + `--out`; new `test_bundles_skeleton.py` asserting the skeleton-built output equals the committed bundles (decoded compare). `pages.yml` added with `workflow_dispatch` only (no push trigger, so merging it cannot fail). Pages source unchanged; the old deploy keeps running. Exit: build-from-skeleton equals committed bundles on main.
- **Phase 2 (deploy switch, bundles still committed):** owner flips Source (section 3), runs the workflow once. Add `push` and `workflow_call` triggers; add the deploy trigger to the two bot workflows; verify with a manual run of "Update Events & GBL" that `data/feed_check.json` on the live site changes. Keep committed bundles and `test_bundles_current.py` for at least a week of bot cycles: they are the rollback.
- **Phase 3 (stop committing):** `git rm --cached` the three bundles and `.propagate_baseline/`; `.gitignore`; test.yml/qa.yml build step; version gate; docs; guards in QA scripts. Run the whole suite (qa_run a-e, smoke, CSP, roster, ranking, workflow test) on the PR; the PR deploys through the workflow only after merge.
- **Phase 4 (cleanup, optional):** trim the artifact, drop the Standalone page if unused, retire `slim_bundles.py` and the propagate CLI.

Order matters: the deploy switch (2) happens while bundles are still committed so rollback is one dropdown; untracking (3) happens only after the Actions deploy has proven itself.

## 5. The existing history

Untracking does not shrink it: every old blob stays in every existing clone and on GitHub.

- **Cheapest real fix (no rewrite):** the 1.18 GiB sits only under two stale branches. In GitHub (Branches) delete `pvpoke-data-20261014` and `pvpoke-data-20261021` after confirming no open PR uses them (list PRs; closed PRs keep a hidden `refs/pull/N/head` on GitHub, which clones do not fetch). Then fresh clones are about 250 MiB instead of 1.4 GiB. Existing clones: `git fetch --prune`, `git reflog expire --expire=now --all`, `git gc --prune=now`. The GitHub-side "repo size" may not drop until GitHub's own GC or a support request, because of the hidden pull refs.
- **History rewrite (`git filter-repo --path data/debug_bars --path index.html ... --invert-paths`): do NOT do it unless the owner explicitly asks.** Destructive and shared: it rewrites every commit hash from the first touched commit onward; needs a force push to `main` (and branch protection lifted); every existing clone, worktree and local branch (this repo has 17 local worktree branches) diverges and must be re-cloned or hard-reset; all open PRs and their review comments detach (PRs from stale bases cannot be rebased onto unrelated history); bot workflows that rebase on `origin/main` (update-events-gbl.yml last line, extract*.yml retry loops) break if a run is in flight during the push; Actions caches and artifacts keyed on SHAs, and any recorded "build vNN at SHA" references, become dangling; links and `Claude-Session` provenance in commit messages survive but the hashes in PROJECT_HANDOFF.md and docs do not; hidden `refs/pull/*` still keep the old objects on GitHub until support purges them, so the saving on the server is not guaranteed. This repo already appears to have been rewritten once (no merge base with the October branches), which is the strongest reason to avoid a second one. And it would remove at most the 201 MiB of bundles from main, about 13% of today's pack and nothing the branch deletion does not do better.
- **Other mitigations:** CI is already depth 1 (0.5), so Actions never downloads history; contributors and agents can `git clone --depth 1 --filter=blob:none` (partial clone) or `--single-branch`; `git clone --single-branch --branch main` already excludes the two stale branches for those who cannot wait for deletion.

## 6. Effort, risks, tests, rollout

Effort (one implementer who knows the repo): phase 1 about 1 day (skeleton script and equality test are the hard part), phase 2 about half a day plus owner steps and a week of observation, phase 3 about 1 day (many docs and QA guards), phase 4 half a day. Total about 3 days of work.

Risks:
1. Skeleton build differs from the committed bundle (hidden state in the old head). Mitigation: the equality test in phase 1; do not proceed otherwise.
2. Bot data commits not redeployed (0.3). Mitigation: explicit trigger plus a live check after the first bot cycle; also keep a daily scheduled `pages.yml` run as a safety net (cheap, no version bump under option 2.2.1).
3. A deploy that ships a broken app (today also true; deploy is ungated). Option: make `deploy` `needs` a smoke step in the build job (`smoke_render.js` + `test_csp.js` Chromium), about 2 minutes extra. Recommended, since the build now happens at deploy time.
4. Setting flip leaves a gap or an old deployment (unverified, section 3). Mitigation: fork test, back-to-back steps, rollback via dropdown.
5. Version counter not bumped, so installed apps never prompt. Same as today; the new gate fixes it.
6. Two agents/PRs both bump `sw.js` (conflict on one line, resolved by hand; today the conflict is in 2 MB bundles, strictly worse).
7. `build_index.js` writing into the source CSP tag makes the build non-pure; CI must not commit anything.

Tests to add: (a) skeleton-built output equals committed bundles (phase 1, then replaced by a pure build smoke), (b) build from a clean checkout in an empty directory succeeds (catches any hidden dependency on untracked files, the exact failure of 0.2), (c) version-gate described in 2.2, (d) workflow check in `test_workflows.py`: every workflow that commits to `main` and touches served files (`data/feed*.json`, `data/event_moves.json`, `data/promo_codes.json`, `pokemon-mechanics.js`, `sw.js`) must reference `pages.yml`, (e) `test_tracked_tree.js`: the three bundles must not be tracked after phase 3, and `.nojekyll` must stay, (f) a post-deploy probe step in `pages.yml`: fetch the deployed `sw.js` and `index.html` and assert `scout-v(\d+)` equals the committed counter and the CSP meta is present.

## Recommendation

Do phase 0 now (delete the two stale branches: biggest saving, no code; deletion is not undoable from GitHub's UI after the retention window, so confirm they are not wanted). Then implement A in phases 1-3, keeping the committed `sw.js` / `vNN.MM` counters, skeletons for the bundle heads, and explicit deploy triggers from the two bot workflows. Do not rewrite history.

## Open questions for the owner

1. Delete `origin/pvpoke-data-20261014` and `origin/pvpoke-data-20261021` (1.18 GiB, 83% of the clone)? Any open PR or wish to keep them?
2. OK to switch Pages Source to GitHub Actions (section 3), and are you fine with the rollback story (re-run an older deploy)?
3. Is `Scout Dashboard Standalone.dc.html` still used by anything outside the repo (the design host)? If not, drop it from the build.
4. Keep the version counter human/bot-bumped (recommended) or have CI stamp it (every deploy then prompts "tap to reload", including 6-hourly data refreshes)?
5. Should a failed smoke test block a deploy (recommended), or keep today's "always deploys" behaviour?
6. Trim the served files (docs 47 MB, scripts, worker) now or leave as-is?
7. Is main branch protection on? If a rule requires PRs, bot direct pushes would already fail, so presumably off; confirm before adding any new bot push.
8. Do you want a history rewrite at all (not recommended)? If yes, plan a freeze window and re-clone for everyone.
