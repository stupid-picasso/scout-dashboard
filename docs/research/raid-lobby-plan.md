# Raid lobby / friend-code board: plan (task #29)

Plan only. No app code written. Date: 2026-11-18. External facts are marked [V] verified by fetch/search this session, or [U] unverified.

## 0. Recommendation

**Do not build it now.** Ship Phase 0 instead (Section 15): a link-out card plus a local "my friend code" field. Reasons:

1. It is the first feature that turns Professor from a private tool with owner-only data into a multi-user write surface. Spam, friend-code harvesting, minors, reports and moderation are all new, and the project has no server, no admin and no moderator.
2. The rules are not deployed yet (DEPLOY.md), and real Google/GitHub sign-in is untested against real providers. A public-write collection should not launch on unverified rules.
3. The free tier cannot absorb a popular board (Section 9). Success would break the app's own roster sync, which shares the same project quota.
4. Community tools already do it, with audiences and moderation (Section 12).

Revisit only if the owner has (a) deployed and verified the rules, (b) a small known user group (friends or a club, under about 100), and (c) accepts being the moderator. For that case the Phase 1 "club board" is the only version worth building.

## 1. What it is

A list of open remote raid lobbies: boss, tier, start time, slots and the poster's friend code, so other signed-in users can add the host and join. Players already do this in Discord and Reddit. In-game, remote joining works through friends or the invite group code [V by search snippet: Niantic help "Joining raids remotely", now https://scopelyexplore.helpshift.com/hc/faq/1176-joining-battles-remotely/ ; page body not read].

## 2. Minimum viable version (if ever built)

- Sign-in required (Google/GitHub). Post: boss (picker from the app's own raid data), tier, start time (within the next 2 h), optional note (max 60 chars, no links), friend code.
- List: open lobbies, newest first, client filter by boss. Auto-expiry. Report button. Delete own post.
- No chat, no profiles, no ratings, no location, no push, no auto-join.
- The friend code is not in the list: it is fetched per lobby on a tap (Section 3), so a scraper needs one read per lobby.

## 3. Data model

Option A (recommended if built): Firestore, three collections.

```
raidLobbies/{hostUid}                 // doc id = poster's uid: one open lobby per user
  hostUid, hostName (<=20), boss, tier, startAt, slots (1..5), note (<=60),
  createdAt (server time), expiresAt (startAt + 30 min), status ('open'|'full'|'closed')
raidLobbies/{hostUid}/codes/{hostUid} // friend code kept apart so list queries never carry it
  code (12 digits), createdAt
raidReports/{id}                      // create-only from clients; nobody reads them in the app
  lobbyId, reporterUid, reason (enum), createdAt
```

Alternatives:
- B. Realtime Database: separate product with its own free limits (I recall a 100 simultaneous connection cap [U]); the repo's rules tests are Firestore-only. Rejected.
- C. Static JSON in the repo (like `data/feed.json`), owner-curated links only. No user-written data, no new risk. Fits the link-out fallback, not a live board.
- D. Own server or Cloud Functions: needs the Blaze plan (billing). Excluded by "free tiers only". Without functions there is no server-side rate limit, no moderation trigger, no scheduled cleanup: only rules and TTL.

## 4. Firestore rules (new; today owner-only, not deployed)

Today `firestore.rules` has owner-only `scoutUsers/{uid}`, read-only `gameData`/`sprites`, a catch-all deny, and `verifiedIdentity()` (verified email or google.com/github.com). Add before the catch-all (sketch, not final):

```
match /raidLobbies/{id} {
  allow get, list: if signedIn() && resource.data.expiresAt > request.time;
  allow create, update: if isOwner(id) && verifiedIdentity()
      && request.resource.data.hostUid == id
      && request.resource.data.keys().hasOnly([ ...allow-list... ])
      && request.resource.data.createdAt == request.time
      && request.resource.data.expiresAt > request.time
      && request.resource.data.expiresAt <= request.time + duration.value(3, 'h')
      && request.resource.data.note.size() <= 60 && !request.resource.data.note.matches('.*https?:.*')
      && (resource == null || request.time >= resource.data.createdAt + duration.value(60, 's'));
  allow delete: if isOwner(id);
  match /codes/{uid} {
    allow get: if signedIn() && verifiedIdentity();          // no list
    allow create, update: if isOwner(uid) && request.resource.data.code.matches('[0-9]{12}')
                          && request.resource.data.keys().hasOnly(['code','createdAt']);
    allow delete: if isOwner(uid);
  }
}
match /raidReports/{id} {
  allow create: if isOwner(request.resource.data.reporterUid) && verifiedIdentity()
                && request.resource.data.keys().hasOnly(['lobbyId','reporterUid','reason','createdAt']);
  allow read, update, delete: if false;     // owner reads in the console or an Admin SDK script
}
```

Limits to state honestly:
- Rules cannot count documents, so "one open lobby per user" is done by doc id = uid. The cooldown compares `request.time` with the old `createdAt`.
- Rules cannot rate-limit reads, send notifications or ban. Moderation = owner reads `raidReports` and deletes through an Admin SDK script run locally (same pattern as `gameData`).
- A `list` is allowed or denied as a whole: the client query must itself include `where expiresAt > now` and `limit(30)`, or the rule rejects it. Expired docs stay readable until TTL deletes them, so the client also filters.
- The exact rules syntax above has not been run in any emulator (none here); treat it as a draft.

### Testing with `scripts/test_firestore_rules.js`
That test is static (regex over `firestore.rules` and the app source) and the behavioural twin is the in-memory stand-in in `scripts/qa/qa_lib.js`; no emulator exists in this environment (PROJECT_HANDOFF "Tests for A"). Extend, do not replace:
1. Static: allow-lists for the three paths; assert no `list` on `codes`; `raidReports` read/update/delete false; every `allow create` on the new paths calls `verifiedIdentity()`; `createdAt == request.time` and an `expiresAt` upper bound are present; catch-all deny is still last; the app's post payload keys are a subset of the allow-list (same technique as `buildCloudBlob`). Add mutation checks (remove a clause, expect FAIL), as the existing table does.
2. Stand-in: teach `qa_lib.js` the new paths. Cases: another user's delete refused, extra key refused, client-clock `createdAt` refused, expired doc not listed, a lobby under another id refused, report read refused, cooldown refused. `cloud.stats` gives the read/write budget per scenario.
3. The stand-in re-implements the rules; it is not the rules engine. Real verification is the owner's Rules Playground checks (extend DEPLOY.md and `docs/SECURITY_CHECKS.md`) or the Firebase emulator on the owner's machine, never the real project. Emulator availability on the owner's machine: [U].

## 5. Abuse and moderation

| Risk | Control (free, rules-only) | Residual |
|---|---|---|
| Spam | sign-in + `verifiedIdentity()`; one lobby per uid; 60 s cooldown; length caps; no links in the note | A new Google account can post once more |
| Friend-code harvesting | code in a separate doc, no `list`, per-doc `get` needs sign-in, shown only after a tap | A scripted account can still read every code; only the 50k reads/day cap brakes it. Codes are already posted openly on Discord/Reddit |
| Minors | The game ToS bars children under 13 (16 EEA, 14 Korea) and requires parental consent for minors [V: https://explore.scopely.com/terms/pokemongo/en s3.6]; PRIVACY.md says "not meant for children under 13". No profiles, DMs, photos or free text beyond 60 chars. Age cannot be verified. | A stranger-contact surface; a reason to stay club-only |
| Reporting | create-only `raidReports`; owner reviews; "hide this poster" is local | Owner is the only moderator, no SLA |
| Harassment in the note | caps, no links, report | same |
| Expiry | Firestore TTL on `expiresAt`: deletion is typically within 24 h, expired docs still appear in queries until then, deletes count toward delete costs/quota, one TTL field per collection group [V: https://firebase.google.com/docs/firestore/ttl]. Plus the client filter and the rules check | One owner console step to create the policy |

No server means no auto-ban and no IP signal. The UI must say "posts are visible to every signed-in user".

## 6. Identity

- Google/GitHub uid, already merged; reuse `verifiedIdentity()` unchanged. GitHub accounts without a verified email are accepted by design in the current rules.
- **Anonymous auth: no.** A new uid per cache wipe makes spam free, and `verifiedIdentity()` correctly refuses it. Read-only anonymous browsing would add an auth mode the app does not have.
- Display name is a user-chosen label (<=20 chars). Never copy the provider's real name, email or photo.

## 7. Privacy (PRIVACY.md changes before launch)

A friend code identifies a Pokemon GO account and can be linked to a trainer name; treat it as personal data (my working assumption, not a legal conclusion). Changes:
- "What is stored" gets a row: lobby post (boss, time, note, display name, uid, friend code) in Firestore, readable by every signed-in user, kept until expiry plus TTL lag (up to about 24 h) [V TTL]; reports kept until the owner clears them.
- Warn: the code is visible to signed-in users; no real name, school or place in the note.
- Controls: delete your post any time; "Delete my account" must also delete `raidLobbies/{uid}`, its `codes` doc and the user's reports (extend the existing order); export includes the user's own post.
- Keep "crop screenshots first". Keep "no server, no analytics" true. Add "other users can read what you post".
- The privacy contact placeholder is still owner-fill. GDPR / children's-law review: owner's call [U].

## 8. Niantic/Scopely ToS risk (feeds parked task #30)

The ToS now lives at explore.scopely.com (301 from nianticlabs.com) [V]. Clauses read [V: https://explore.scopely.com/terms/pokemongo/en]: s3.1 treats "accessing Services in an unauthorized manner (including using modified or unofficial third party software)" and falsifying location as cheating; s6 bars automation, bots, crawlers and data mining against the Services, and collecting or sharing other users' personally identifiable information without permission; s5.3 users own responsibility for their User Content; s5.4 Trading Items must not go through third-party platforms.

**Safe (all must hold):**
- No location data of any kind: no coordinates, no gym or map, no geo filter. Remote lobbies only.
- No contact with the game's servers, no game login, no reading of the player's account, no scraping, no automation, no auto-add or auto-join, no overlay.
- Data is only what a user types or taps. Nothing is imported from the game. The player adds friends in the game by hand.
- User-posted codes only, each user posting their own. No listing of other people's codes, no exports of the codes.
- No money, no ads, no trade or gift brokering (s5.4).

**Excluded (risky):** coordinates or raid-location sharing, live raid scraping or scanner feeds (already excluded in community-pain-points.md), spoof-assisted remote raids, harvesting or exporting codes, "free pass" or trade brokering.

**Unverified:** I found no clause that explicitly permits or forbids a third-party friend-code board. Existing apps do it (Pokebattler Raid Party, https://apps.apple.com/app/id1499435805, [V by search snippet]), which suggests tolerance, but that is not a Niantic/Scopely statement. Owner/legal decision. For #30, list: location features, scanner feeds, account sync, any automatic action.

## 9. Free-tier cost (Spark)

Free daily: 50,000 reads, 20,000 writes, 20,000 deletes; 1 GiB stored; 10 GiB/month egress; reset around midnight Pacific [V: https://firebase.google.com/docs/firestore/quotas ; same figures on https://firebase.google.com/docs/projects/billing/firebase-pricing-plans]. Per project, so **shared with the existing roster sync** (1 write + 1 read per edit today).

My arithmetic, not measured:
- One-shot list of 30 lobbies = 30 reads; a realtime listener = 30 initial reads plus one read per changed doc per listener.
- 100 daily users opening the board 5 times = 15k reads, about a third of the day before roster sync.
- Several hundred users holding listeners open during a raid-day burst would pass 50k; Firestore then rejects requests until reset (Spark does not bill overage), which also breaks cloud sync.
- TTL deletes count toward the 20k delete quota.

Mitigations: no listeners (manual refresh, 60 s minimum between fetches), `limit(30)`, expiry filter, in-memory cache, code read on tap only, back off on `resource-exhausted`. Per-document write and concurrent-connection limits were not on the quota page [U]; one doc per user means no hot document. Verdict: viable for a small group, not an open public board.

## 10. UI

**Inside Raids, not a new tab.** The bar is Today, Home, Roster, PvP, Recs, More; Raid counters lives under More. A new tab spends scarce bar space on an optional social feature. Put a collapsed "Find a group" card at the top of Raid counters. Signed-out users see only the link-out card. Edit `Scout Dashboard.dc.html`, then `python3 scripts/build_bundles.py` (standing rules). Four-field post form; friend code validated as 12 digits; user text rendered with `textContent` only (`scripts/test_no_dangerous_sinks.js` stays green).

## 11. CSP

Current `connect-src` has `https://*.googleapis.com`, which already covers Firestore, and the auth frames are listed. No CSP change is needed for Firestore. Link-outs to Discord/Reddit are plain `<a target="_blank" rel="noopener noreferrer">` and are not governed by `connect-src`/`frame-src`; no embeds or widgets. `scripts/test_csp.js` gets no new allowed host; add an assertion that discord.com and reddit.com are NOT in the policy. Firestore transport fallbacks use the same Google hosts [U].

## 12. Alternatives: link out instead of building

1. Link-out card with an owner-curated list in `data/` (option C): Pokebattler Raid Party https://apps.apple.com/app/id1499435805 and PoGO RAID https://apps.apple.com/us/app/id1624433349 [V by search snippets]; the in-game invite group code and raid friend list [V by snippet]; large community Discords and Reddit raid communities [U: not checked; the owner must verify each is current and acceptable before listing]. Add a "not affiliated" line. Never auto-post anywhere.
2. A "my friend code" field in Settings with a copy button, local only, never uploaded: about half a day, no new risk.
3. A club-only board (Phase 1) for the owner's own group.

## 13. Tests

Rules tests per Section 4. App: new qa cases on the stand-in (post, expire, delete, report, signed-out view, quota backoff, no innerHTML sink); `test_csp.js` tightened as in Section 11; `test_no_dangerous_sinks.js` covers the new view; `smoke_render.js` renders the entry card; the account-deletion test is extended (lobby and codes removed). All existing suites (a-e, roster, ranking, rules, CSP) stay green; no test is weakened. Real-provider and real-rules behaviour stays untested here, as in the Task 3 notes.

## 14. Risks

- Public write surface on unverified, undeployed rules (highest). Mitigation: deploy and Playground-verify rules first.
- Single moderator, no ban tool, only delete.
- Quota exhaustion takes down roster sync. Mitigation: a second Spark project just for the board; whether the client handles two projects cleanly is [U].
- Minors and stranger contact; friend codes as personal data.
- ToS ambiguity (Section 8).
- Scope creep (chat, notifications, location): refuse all in v1.

## 15. Phased rollout and effort

Rough estimates, one developer, including tests and docs.

| Phase | Scope | Effort |
|---|---|---|
| 0 (recommended now) | Link-out card, local "my friend code" field, PRIVACY wording. No backend. | 1-2 days |
| 1 | Club board: rules, stand-in, tests, post/list/delete, TTL, account-deletion extension, PRIVACY update; readers limited to an owner-curated member list so strangers cannot read. Owner verifies in the Playground/emulator before any deploy. | 5-7 days |
| 2 | Open to all verified sign-ins: reports, moderation script, quota backoff, separate-project decision. Only after Phase 1 ran clean for weeks. | 4-6 days |
| 3 | Not planned: notifications, chat, ratings. | n/a |

## 16. Open questions for the owner

1. Build at all, or ship Phase 0 only? (Recommendation: Phase 0.)
2. Will you be the sole moderator and read reports? If not, no public board.
3. Is the audience a known club (Phase 1) or the public?
4. Comfort with friend codes as personal data and with the Scopely ToS question (input to #30)?
5. Rules still undeployed and real sign-in untested: block the feature until both are done?
6. Separate Firebase project for the board, to protect roster-sync quota?
7. Which community Discords/tools may be linked? They need checking by you.
