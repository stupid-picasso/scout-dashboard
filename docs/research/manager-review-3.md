# Manager review 3: Task 2 part 1 (A, B, C, I), HEAD 93974d5

Independent check of worker 4's "Security basics part 1" (diff `fe5b35a..93974d5`). No app or test file was edited. Mutations ran in a copy of the repo (scratchpad `mut/`, `node_modules` symlinked, bundles rebuilt after each source edit); the real tree was never touched and `git status` was clean before this file. Nothing contacted Firebase: all cloud checks use the stand-in in `scripts/qa/qa_lib.js`.

## Verdict: PASS-WITH-FIXES

The rules match C-1 with the agreed changes (no throttle, verified identity, scrub keys delete-only). Every client write fits the rules. SYNC-05..11 and DATA-01..03 assert exact numbers. All suites pass, and all four mutations make the right tests fail for the right reason. Defects 1 to 4 should be fixed on this branch before the owner deploys the rules. None of them blocks merging the client.

## Suites (my runs, one at a time, `QA_OUT` = file)

| Suite | Result |
|---|---|
| `qa_run.js a / b / c / d / e` | 81/0/0, 171/0/0, 99/0/0, 43/0/0, 62/0/0 (passed/failed/skipped) |
| `test_roster_logic.js`, `test_ranking.js` | 192 passed; 86 passed (exit 0) |
| `test_firestore_rules.js` | 26 passed, 0 failed |
| `smoke_render.js` | smoke passed, exit 0 |
| `test_bundles_current.py`, `build_bundles.py --check` | 0 failed; up to date (exit 0) |

## Mutations (in the copy, reverted)

| Mutation | Result |
|---|---|
| `geminiKey: s.geminiKey` added to `buildCloudBlob` raw | SYNC-03 FAIL "a secret was written to the cloud (document or snapshot)". SYNC-01 FAIL "nothing written" (the stand-in refused the create). `test_firestore_rules` 3 FAIL. |
| `snapshotIndex` / `rosterJson` / `maxBattles` dropped from `allowedKeysList` | `test_firestore_rules` FAIL "missing: <key>" each time. With `snapshotIndex` dropped, the stand-in's SYNC-06 also FAILs (the index write is refused). Adding a key nobody writes also fails (stale-entry check). |
| Launch reads `gameData/meta` in `onAuthChange` | SYNC-05 FAIL `{"gameData":1,...}`. `test_firestore_rules` FAIL "does not read gameData". |
| `&& stampOk()` removed from `allow update` | **not caught**: `test_firestore_rules` still passes 26/26 (defect 5). |
| `verifiedIdentity()` removed from update / `|| true` / `allow get: if signedIn()` | caught by `test_firestore_rules`. |

Probe (scratch script, stand-in, listener attached, 9 s per case), writes / reads on `scoutUsers`:

| Case | Writes | Reads |
|---|---|---|
| debounced edit (`queueCloudPush`) | 1 | 1 |
| `clearTimeout(_pushTimer); pushCloud()` (how most call sites do it) | 1 | 1 |
| `setState(..., () => this.pushCloud())` without clearing the timer | 2 | 2 |

There is no write loop. The second write in the last case is the 1.2 s debounce firing after the direct push. That is pre-existing: the same 13 non-clearing call sites (e.g. ~7351, ~16965) exist at `fe5b35a`. The extra read per write is new: it is the echo of the server timestamp (defect 6).

## 1. `firestore.rules`, line by line

- Owner-only `scoutUsers/{uid}`: `get` only (a `list` over the collection is denied), plus `create`, `update` and `delete` behind `isOwner(uid)`. Snapshots: `read, delete` for the owner; `create` needs the owner, a verified identity, `id.matches('[0-9]{13}')` and `hasOnly` the four keys; `update: if false`. `gameData` and `sprites` are read-only. Catch-all deny. No `token.email`.
- `create`: `keys().hasOnly(allowedKeysList())` and `updatedAt == request.time`. `update`: `diff(resource.data).affectedKeys().hasOnly(allowed + scrub)`, then `scrubOk()` (a scrub key may be absent or unchanged; writing a new one errors on the missing `resource.data.<k>`, so it is denied), then `stampOk()` (only a changed `updatedAt` is checked, so old numeric documents stay writable).
- IDOR walk: B get/set on `scoutUsers/A` denied (isOwner). B on `scoutUsers/A/snapshots/*` denied. Unlisted key on create or update denied. `geminiKey` written denied (scrubOk). A client-clock `updatedAt` denied (stampOk; create requires the server time). Snapshot id `abc`, an extra snapshot key, or a rewrite of an existing snapshot are denied. Signed-out access is denied everywhere. The stand-in mirrors all of this, and STANDIN-01 exercises it.
- The real client writes, walked against the rules:
  - `pushCloud` (merge set with packed `*Json` keys, `FV.delete()` of the plain legacy keys, `updatedAt` serverTimestamp, scrub deletes): create and update both allowed.
  - `writeSnapshotMeta` adds the server stamp only when `!_docExists`, so create is allowed; the update has no `updatedAt` and is allowed.
  - `scrubCloudSecrets` writes deletes only and is allowed.
  - `takeSnapshot` uses the id `String(Date.now())`, 13 digits, and is allowed.
  - Delete-account reads, lists and deletes are not gated by verification.
  - I found no other write site (grep of `this.db.` / `.collection(`): `10606` is the manual cloud-backup `get`.
- Syntax (`concat`, `diff().affectedKeys()`, `hasOnly`/`hasAny`, `in`, `matches`, `token.firebase.sign_in_provider`) is valid rules v2 as far as I can see from reading. **I read the rules; I did not compile them (no emulator).** One semantic point rests on the error-tolerant `||` (defect 1).

## 2. Client diffs

- `buildCloudBlob`: no secret fields (the `_secretsLocalOk` branch is gone). `updatedAt` stays a number for the device copy, backups and snapshot bodies; `pushCloud` overwrites it with `serverTimestamp()`.
- `applyRemote` records `_remoteSecrets` and adopts none of them. It builds `snapshots` from `snapshotIndex` (no body read). On first hydrate, the clock is `max(localStorage, lastSnapshotAt)`.
- `autoSnapshot`/`takeSnapshot` are serialised through `_snapChain`. They write the body, then the index and clock, then delete the entries that dropped out, by id (`pruneSnapshots`/`loadSnapshots` were folded in and are gone).
- `restoreSnapshot` reads one body. `ensureSnapshotIndex` does a one-time listing for accounts made before the index.
- `subscribeCloudDoc`/`attachCloudListener` are visibility-gated and idempotent. `onAuthChange` no longer calls `checkMigrationStatus`/`loadMechanicsFromCloud`. On an account switch, `forgetAccount` resets timers, flags and the uid's device copy. `resolveSpriteSrc` uses shipped files only.
- Exact numbers: SYNC-05 compares the whole counter object to `{userReads:1, userWrites:0, gameData:0, sprites:0, snapR:0, snapW:0, snapD:0, deletes:0}` (reload and a new browser). SYNC-06 expects snapshots w1/r0/d0 and user r1/w1 with keys exactly `lastSnapshotAt,snapshotIndex`, then w1/d1/r0 with five stored. SYNC-07 expects 1 body read before and after confirm. SYNC-08 expects listener counts 1/0/1/1 and reads 1/0/1. SYNC-10 expects 3 reads then 0. DATA-01 expects snapshot reads = deletes = nSnap and the order snapshot < doc < deleteUser. All of these are `===` checks. Tests that do not pin counts: SYNC-09 (status, state and device copy), SYNC-11 (scrub result, nothing adopted), DATA-02 (file contents), DATA-03 (state and storage), and SYNC-01, which is still `writes.length >= 1` (unchanged from before). SYNC-09 and SYNC-11 have no natural count to assert, so this is acceptable. SYNC-01 is covered by the probe above and by defect 6.
- Sign-out isolation: DATA-03 covers A out then B in, B in without A signing out, and a signed-out reload.

## 3. Secrets

`git grep` finds the owner's address in no tracked file; it survives only in git history (old README). `admin@scout.app`, `ADMIN_EMAILS`, `migrateStatsAndSprites`, `refreshCloudGameData` and `checkMigrationStatus` appear only in `docs/research/*`, `PROJECT_HANDOFF.md` (prose naming the removed functions), `DEPLOY.md` (`token.email in [...]` as prose) and the test's own regex. Generated bundles are clean. Against the literal bar ("only docs/research hits") the result is **not met**. The extra hits are function names in `PROJECT_HANDOFF.md` prose, the guard regex in `scripts/test_firestore_rules.js`, and `token.email in [...]` as an instruction in `DEPLOY.md`. None holds an address or live code, so I judge them harmless. The Gemini key is sent only as an `x-goog-api-key` header on the three `generativelanguage` calls (lines ~10994, 11004, 11118); there is no `key=` in any URL. GEM-KEY-01 asserts this. The custom-endpoint path (`fetch(this.state.apiEndpoint`, ~11295) sends only `Content-Type` and the body, never the key.

## 4. `test_roster_logic.js` changes: justified

The old checks covered a design that was removed on purpose (deliverable C): scrub only after the device holds the keys, and the `scout.secretsScrubbed` flag. Now nothing is adopted from the cloud, so "never delete before the device holds them" no longer applies. The 3 old checks became 4 new ones:
- all four fields deleted (it now also asserts `geminiKey`);
- only the fields present are named;
- a clean document is never written;
- nothing is deleted when the document was never read.

This is not weaker. User-visible effect: a user whose key lived only in the cloud must enter it again. That is accepted by design and should be said in the PR body.

## Defects

1. **`firestore.rules`, `verifiedIdentity()`.** `request.auth.token.email_verified == true` errors when the claim is absent (for example, GitHub with no public email). The GitHub path then depends on the error-tolerant `error || true`. Harden it to `request.auth.token.get('email_verified', false) == true`, and have the owner check a GitHub-without-email token in the Playground. (Medium; read, not compiled.)
2. **`DEPLOY.md`.**
   - (a) The "unverified email/password accounts become read-only" warning is bold but sits in step 3. The opening paragraph warns only about client-first. Put a one-line banner at the top. Today that warning covers every account, including the owner's.
   - (b) The Rules Playground checks are step 7, after Publish in step 6. Move them before Publish; the Playground runs on the draft.
   - (c) The step-7 check "`evil: 1` is denied" passes for the wrong reason if the simulated user is the owner's unverified password account. Say to simulate provider `google.com` and include `updatedAt` = request time. Add one positive check (a legal update is allowed).
   - (d) "the new client works under the old rules too" is asserted although the live rules are unknown. Make it conditional on step 1.
3. **`Scout Dashboard.dc.html` `deleteAccountNow` / `takeSnapshot` / `writeSnapshotMeta`.**
   - Delete does not wait for `_snapChain`, and the steps after `takeSnapshot`'s `_deleting` check do not re-check it. A snapshot in flight can land after the listing. That orphan is allowed under the new rules too, because snapshot create does not need the parent document. Under the old rules, `writeSnapshotMeta` can also re-create the user doc.
   - Fix: `await this._snapChain` before listing, and return early in `writeSnapshotMeta` when `_deleting` is set. (Low-medium: breaks DATA-01's "no snapshots left" in a race.)
4. **`deleteAccountNow` partial failure.** If a snapshot delete fails partway, the message says "Nothing else was removed" although some snapshots are already gone, and `snapshotIndex` still lists them. Reword ("Some backups may already be deleted"), or rewrite the index. (Low.)
5. **`scripts/test_firestore_rules.js`.** Removing `&& stampOk()` from `allow update` is not caught; the regex `updatedAt == request.time` still matches the function body and the create rule. Assert `allow update:[^;]*stampOk\(\)` and `allow update:[^;]*scrubOk|updateKeysOk` as call sites. (Low.)
6. **Quota, `pushCloud` + listener.** With a server timestamp, every save comes back as one listener event: one billed read and a full `applyRemote` re-render. The old numeric stamp produced only a metadata change, which was not delivered. Measured 1 write + 1 read per edit, with no loop, but nothing pins it. Add a SYNC test "one edit = exactly 1 write, at most 1 read". Mention the cost in DEPLOY.md's quota note. (Low.)
7. **Observation, not a regression: `onAuthChange`.** Signing in to a brand-new account empties the screen (`applyRemote({})`) and now explicitly removes the signed-out device copy (`scout.local.v1`), so a roster built signed-out is lost. The old code overwrote it too, via `queueLocalSave`. Task 3's first-run flow should offer to upload the device roster on first sign-in.
8. **Observation: `scout.secrets.v1`.** It survives sign-out, so B on a shared device inherits A's Gemini key. This is documented in `docs/SECURITY_CHECKS.md` and outside D.2's stated scope (the local copy). It is acceptable for now; consider clearing it on an account switch in Task 3.
