# Manager review 4: review-3 fixes (Job 1) and Task 2 part 2 (D, E, F, G, H, K), HEAD 6b0e219

I checked worker 5's commits `d7bc2a4`, `82cd3c8` and `6b0e219` myself (diff against `fe5b35a`). I edited no app or test file. I ran the mutations in a copy of the tracked tree (scratchpad `mut/`, `node_modules` symlinked, bundles rebuilt after each edit, then restored; `build_bundles.py --check` and `cmp index.html` came back identical afterwards). `git status` was clean before I wrote this file. Firebase was never contacted. Cloud tests use the stand-in. The real SDK bytes were served to the browser from local files, and every googleapis/firebaseapp request was aborted. Personal data files are kept, as the owner decided.

## Verdict: PASS-WITH-FIXES

- **Job 1:** all six review-3 defects are fixed, and each new test fails when its fix is reverted.
- **Part 2:** D, E, F, G, H and K are present and work.
- **Suites:** every suite passes, and all eight mutations are caught.
- **Defects:** none blocks merging. Defect 1 is a CI gap that predates this work but now matters, because the new security tests live in suite d.

## Suites (my runs, one at a time, `QA_OUT` = file)

| Suite | Result (review 3 had) |
|---|---|
| `qa_run.js a / b / c / d / e` | 81, 171, 102, 47, 62 passed; 0 failed, 0 skipped (81, 171, 99, 43, 62). c adds URL-01, URL-02, XSS-01. d adds SYNC-12, SYNC-13, DATA-04, DATA-05. |
| `test_roster_logic.js`, `test_ranking.js` | 192 passed; 86 passed |
| `test_firestore_rules.js` | 35 passed, 0 failed (was 26) |
| `smoke_render.js` | passed |
| `test_bundles_current.py`, `build_bundles.py --check` | 0 failed; up to date |
| New: `test_csp.js` | ok [chromium]; WebKit skipped (not installed here) |
| New: `test_sri.js`, `SRI_VERIFY=1 test_sri.js` | ok (static); ok (hashes verified against the network) |
| New: `test_no_dangerous_sinks.js`, `test_tracked_tree.js` | ok (8 patterns); clean (223 files, 2 hashes) |
| New: `test_workflows.py`, `test_promo_codes.py` | 0 failed (9 workflows); 0 failed |
| Other test.yml tests (`rank_reference`, `pvp_sim`, `max`, `cp_recovery`, Gemini pipeline, tier trends, event moves) | all pass |

No existing test line was removed or loosened in part 2 (`git diff d7bc2a4..HEAD -- scripts/qa ...` has no `-` lines).

## Mutations (in the copy; each target passed unmutated first)

| Mutation | Result |
|---|---|
| `icsLines`: `one()` no longer strips control characters | URL-01 FAIL "a field kept a line break" |
| `icsLines`: `okLink = link` (https check removed) | URL-01 FAIL "link accepted: javascript:alert(1)" |
| `safePromoUrl`: prefix and hostname checks removed | URL-02 FAIL "accepted {code: GOODCODE1, link: javascript:alert(1)}" |
| `openDetail` puts the Pokemon's strings into a `div.innerHTML` | XSS-01 FAIL "script ran: window.__xss = 1"; `test_no_dangerous_sinks` FAIL at that line |
| `deleteAccountNow`: `await this._snapChain` removed | DATA-04 FAIL "left in the cloud after delete: scoutUsers/qa-user/snapshots/…" |
| `pushCloud`: the new `clearTimeout(this._pushTimer)` removed | SYNC-12 FAIL "direct push: writes 2, reads 2" |
| `firestore.rules`: `&& stampOk()` removed from `allow update` | `test_firestore_rules` FAIL "update rule calls stampOk()" (review-3 defect 5 closed) |
| `build_index.js`: `api.github.com` dropped from `connect-src` | `test_csp` FAIL (connect-src violation on the workflow dispatch) |

## Job 1: review-3 defects

1. **Fixed.** `verifiedIdentity()` uses `token.get('email_verified', false) == true`, and the test asserts it. The Playground step 6e covers the GitHub-without-claim case.
2. **Fixed.**
   - (a) A banner sits on line 3.
   - (b) The Playground checks are step 6, run on the draft. Publish is step 7.
   - (c) The checks say to use provider google.com with `updatedAt` = request time, and there is a positive check (6d).
   - (d) The rollback claim is conditional on step 1's copy.
   - The quota note says one write plus one read per edit.
3. **Fixed.**
   - `deleteAccountNow` sets `_deleting`, then awaits `_snapChain` before listing.
   - `takeSnapshot` re-checks `_deleting` after the write and inside the prune loop.
   - `writeSnapshotMeta` returns when `_deleting` is set, both before and after its write. A meta write already in flight is part of the chain, so it lands before `userRef.delete()` and cannot re-create the document.
   - DATA-04 proves it (see the mutations).
4. **Fixed.** The message now reads "Some backups may already be deleted; your roster and sign-in are still there". `snapshotIndex` is rewritten without the ids already deleted. DATA-05 checks the message, the count and the index.
5. **Fixed.** The test asserts the call sites `allow update:… && stampOk()` and `verifiedIdentity()…updateKeysOk()`, that the create rule requires `request.time`, and that `updateKeysOk` calls `scrubOk()`. The mutation is caught.
6. **Fixed.**
   - `pushCloud` clears `_pushTimer` once it has decided to write.
   - Every return after that point (TOO BIG) sets `_dirtyUntilPush`. The blob is built from current state, so the cleared debounce cannot lose an edit.
   - SYNC-12 pins one write and at most one read for both the debounced path and a direct push.
   - DEPLOY.md now has the cost note.

## Part 2

- **D. URL validation.** I tried hostile inputs against the shipped functions.
  - `icsLines`: `javascript:`, `JAVASCRIPT:`, CRLF + `ATTENDEE`, U+2028, tab, quote and `\n` text are all dropped. No field keeps a line break, and the UID is reduced to `[A-Za-z0-9._-]`. Any https host is still accepted, as the spec allows.
  - `safePromoUrl`: `javascript:`, another host, `store.pokemongo.com.evil`, `store.pokemongo.com@evil` and http are all refused. A CRLF or `/../` inside a link that is on the store host is accepted. That is harmless for `window.open`, because the hostname is checked after parsing.
  - `update_promo_codes.redeem_link`: rejects `javascript:`, CRLF and fullwidth digits, but accepts a trailing newline (defect 2).
- **E. CSP.**
  - `build_index.js` injects the meta tag right after `<meta charset>`. Only `index.html` gets it; that is the deployed file.
  - I loaded the built page over local http with every external request aborted. It produced no violation, and the service worker reached `active`.
  - The external hosts it requested are the same as the `fe5b35a` page: PokeAPI sprites and gstatic firebase. The one 404 (`{{ m.spriteRef }}`, an unrendered template) is the same on the old page.
  - The policy covers the features that need the network:
    - Gemini, Firestore and Auth: `*.googleapis.com`.
    - GitHub raw and the API (feed, import from server, workflow dispatch): `test_csp` routes these and counts the hits.
    - Sprites: `img-src` allows raw.githubusercontent.com.
    - Fonts: system fonts only. The `ds/` Google Fonts import is not in the bundle.
    - PvPoke: its data ships in `data/`.
    - React and Babel fallback: unpkg with SRI (`support.js` cdn.ts). The SECURITY.md claim is accurate.
    - Sign-in: the Firebase auth iframe is on the `authDomain` (`pokemon-professor.firebaseapp.com`, which matches `frame-src`), and gapi comes from apis.google.com. The Google/GitHub popup itself is not exercised; SECURITY_CHECKS row 13 is right to call it unverified.
  - **Dropping `apiEndpoint` is acceptable.** The plan allowed it, it had no UI row, and it was an exfiltration path. Dead state remains (defect 5).
- **F. SRI.**
  - The three sha384 values match my own fetch with curl and openssl through the proxy, and `SRI_VERIFY=1` passes.
  - gstatic sends `access-control-allow-origin: *`, so `crossorigin=anonymous` works.
  - In Chromium, the real SDK bytes served under integrity load: `firebase.apps.length == 1`, and auth and firestore are present. One appended byte gives "Failed to find a valid digest" and leaves `firebase` undefined.
  - The harness hook (`qa_lib.js` integrity setter) is documented. SYNC-13 asserts that all three values and `crossOrigin` are requested.
- **G. Workflows.**
  - All 9 workflows have top-level `contents: read`.
  - Every job that commits keeps job-level `contents: write`; update-pokemon-data and update-pvpoke-data also keep `pull-requests: write`.
  - I parsed every file with PyYAML. No `${{ }}` is left in any `run:` except the trusted `matrix.browser`, and each `IN_*` env sits on the step that uses it.
  - Triggers and crons are unchanged. There is no `pull_request_target` or `workflow_run`, and no secrets in qa.yml or test.yml.
  - The extract and extract-iv `git add -f data/*_import.json` flows and update-events-gbl's commit step are untouched.
  - `test_workflows.py` self-tests its three cases.
- **H. Files.**
  - LICENSE is MIT, plus a NOTICE excluding Pokemon names, sprites and game data.
  - The non-affiliation text is in README, PRIVACY.md and Settings > About.
  - The copyright holder, security contact and privacy contact are `<… the owner fills this in>` placeholders; no contact was invented.
  - The PRIVACY.md claims check out against the code: 5 snapshots, 60 chat messages, "Your data" section, secrets survive sign-out.
- **K. XSS guards.** `test_no_dangerous_sinks.js` covers 8 sinks and fails on a planted `innerHTML`. XSS-01 is real:
  - The markup reaches the roster state.
  - It is shown as text in the roster, the detail sheet and the chat sheet.
  - It fails when a sink is planted.
- **`test_tracked_tree.js`.**
  - It stores only SHA-256 hashes and scans 223 tracked text files outside `docs/research`.
  - HEAD has no copy of either address anywhere, including `docs/research`.
  - **Note:** one stored hash is an unsalted SHA-256 of the owner's old admin address. It can be confirmed by guessing, and the address itself is still in git history (`README.md` at `fe5b35a` and earlier). See defect 4.

## Defects

1. **`.github/workflows/qa.yml`, suite d step (Medium, CI gap, predates part 2).**
   - Suite d runs only as "Accessibility (axe) … `continue-on-error: true`", qa.yml's gate is `a b c e`, and test.yml does not run d at all.
   - So every security and sync test in d never fails CI: SYNC-01..13, STANDIN-01, DATA-01..05.
   - Fix: run d as a gating step (or move the SYNC and DATA tests to their own suite), and keep only the axe checks report-only.
2. **`scripts/update_promo_codes.py` `CODE_RE` / `redeem_link` (Low).**
   - `re.match` with `$` accepts a trailing `\n`, so `redeem_link('GOOD1\n')` returns a link that ends in a newline.
   - The app's `safePromoUrl` rejects such a code, so the impact is a junk entry in `data/promo_codes.json`.
   - Fix: use `CODE_RE.fullmatch` (or `\Z`), and add `'CODE\n'` to the hostile list in `test_promo_codes.py`.
3. **`scripts/qa/qa_e2e_c.js` URL-01 (Low).** The CRLF link case passes either when the link is dropped or when a `URL:https://…` line survives without whitespace. That OR is looser than the code under test, which drops it. Assert that it is dropped.
4. **`scripts/test_tracked_tree.js` `BANNED` and `PROJECT_HANDOFF.md` (Low, owner decision).**
   - The hash of the owner's old address is guessable, and the address is still in history.
   - The handoff line "gone from every tracked file outside `docs/research/` and the git history" reads as if history were clean. It is not; reword it.
   - The owner may drop the hash entry and keep only the `admin@` one.
5. **`Scout Dashboard.dc.html`, apiEndpoint leftovers (Low).**
   - `apiEndpoint` and `apiEndpointDraft` state, `onApiEndpointDraftChange`, and the load from `scout.secrets.v1` (≈4924) remain, although nothing uses them.
   - The scrub list must keep `apiEndpoint`; the rest can go.
6. **`promoRedeem` (Low, UX).** On a rejected link the Redeem button marks the code seen and silently does nothing. Hide the button, or say why, when `safePromoUrl(c)` is `''`.
7. **Not verified here:** WebKit (not installed; qa.yml runs it with `CSP_REQUIRE_WEBKIT=1`), real Google or GitHub popups under the CSP, and real Firestore and Gemini under the CSP and SRI. SECURITY_CHECKS rows 12-14 cover these for the owner.
