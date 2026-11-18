# Push notifications while the app is closed: plan (task 28)

Plan only. No app code, no deploy, no contact with Firebase or Cloudflare. Standing rules apply (free tiers, no secrets in repo, no model identifiers, never write to real Firebase).

## 0. Today
- Local reminders exist: `checkReminders()` / `reminderItems()` in `Scout Dashboard.dc.html`; permission asked after a tap ("Turn on reminders"); shown via `registration.showNotification`. They fire only while the app runs.
- `sw.js` has install/activate/fetch only. No `push` or `notificationclick` handler. Registered in `index.html`.
- `manifest.json`: `display: standalone`, `start_url ./`, `scope ./`.
- Hosting: GitHub Pages (static). No server of our own (PRIVACY.md: "no server of its own, no analytics").
- Data: `data/feed.json` (`events[]` id/name/type/start/end/link, `gbl[]`), `data/promo_codes.json` (`code, name, rewards, expires, expired, verified`), `data/event_moves.json` (`moves[]` eventId, species, to, move, kind, graceHours, start, end). All refreshed by GitHub Actions.

## 1. Platform facts
| Fact | Source |
|---|---|
| iOS/iPadOS 16.4+: Web Push only for a web app added to the Home Screen; manifest `display` standalone or fullscreen | https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/ |
| Permission request must follow a direct user interaction (tap) | same |
| Delivery via APNs; no Apple Developer membership needed; allow `*.push.apple.com` if egress is filtered | same |
| Uses Push API, Notifications API, service workers; feature-detect, do not sniff | same |
| Safari accepts `userVisibleOnly: true` only; every push must show a notification or permission can be revoked | Apple docs page; fetch returned no body, so from memory: VERIFY before build (https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers) |
| VAPID (RFC 8292, ES256 JWT, `exp` <= 24 h), payload encryption aes128gcm (RFC 8291/8188), ~4 KB | https://www.rfc-editor.org/rfc/rfc8292 , https://www.rfc-editor.org/rfc/rfc8291 (from memory, not fetched) |
| 404/410 from the push service = subscription dead, delete it | RFC 8030 (from memory) |
| EU: Home Screen web app behaviour changed under the DMA; availability varies by iOS version | unverified; owner to test on a real EU-region device or accept "may not work" |

Consequences: the install-first gate is unavoidable; show the opt-in only when `matchMedia('(display-mode: standalone)')` or `navigator.standalone` is true. In a browser tab on iOS show "Add to Home Screen first" (the existing first-run note does this). No silent/background sync pushes: every push shows a banner.

## 2. Architecture
```
GitHub Actions refresh feed.json/promo_codes.json/event_moves.json (already exist)
        |  (public JSON on Pages)
Cloudflare Worker "professor-push"  (cron every 15 min + fetch handler)
   - POST /subscribe, /unsubscribe, /schedule   (CORS: Pages origin only)
   - cron: read feeds, compute due notifications, send Web Push to KV subscriptions
        |
Apple / Google / Mozilla push services  ->  sw.js `push` -> showNotification
```
Sender: Cloudflare Worker using Web Crypto (VAPID ES256 signing and RFC 8291 encryption are doable in Workers; a small dependency-free module of about 150 lines, or a pinned vendored lib). Alternative with no Cloudflare account: a GitHub Actions cron sending from a runner with a repo secret. Weaker timing (best-effort, often delayed), and the subscription store would still need a home. Recommend the Worker.

Payload: small encrypted JSON (`{t,b,tag,url}`, under 500 B). Fallback if encryption is a problem: payloadless push plus SW fetching `/next` from the Worker; still must show a notification, and iOS behaviour for empty pushes is unverified, so do not choose this first.

## 3. Subscription storage
- A. Firestore `scoutUsers/{uid}`: rules are owner-only (`get/create/update/delete: isOwner`, no list, `hasOnly(allowedKeysList)`), not deployed. A Worker cannot read it without a service-account secret and a new rule/admin path; also requires sign-in for push; adds keys to the allow-list. Rejected.
- B. **Cloudflare KV (recommended)**: anonymous, no uid, no sign-in, no Firebase contact. Key `sub:<sha256(endpoint)>` -> `{endpoint, keys{p256dh,auth}, prefs{promo,events,mega}, tz, schedules[], createdAt, lastOk}`.
- C. No storage: impossible; the sender must know endpoints.

KV free limits (https://developers.cloudflare.com/kv/platform/limits/): 100k reads/day, 1k writes/day, 1 GB, 25 MiB per value; list/delete daily limits not stated on that page, check before build. Design: one `index` key holding all subs (rewritten only on subscribe/unsubscribe/prune), one `sent` key for dedupe ids (one write per tick that sends something). Cap subs (e.g. 300).

Never in repo: VAPID private key. The public key is public and goes in the client.

## 4. Triggers and data
| Notification | Trigger (computed in cron) | Source | Dedupe id | Lead |
|---|---|---|---|---|
| New promo code | code present, `!expired`, `verified` only (owner decision), not yet announced | `promo_codes.json` | `promo:<code>` | on first sight; first run seeds without sending |
| Promo expiring | `expires` within 24 h, `!expired`, `verified` only | same | `promoexp:<code>` | 24 h |
| Event starting | `events[].start` within lead; types per user prefs (community-day, raid-hour, pokemon-spotlight-hour, raid-day, max-battles, max-mondays, go-tour; `season` only if opted) | `feed.json` | `evt:<id>:start` | 60 min (CD/raid hour), 24 h (tour) |
| Event ending soon (optional) | `end` within 2 h | `feed.json` | `evt:<id>:end` | 2 h |
| Timed-research promo code | same as new promo code, when the reward text names Timed Research (owner decision: include); add a `kind: timed_research` flag in the data pipeline so the toggle can be separate | `promo_codes.json` (+ official source, see 14) | `promo:<code>` | on first sight |
| Event move reminder | `moves[]` entry at event start, names the move; `graceHours` for the window | `event_moves.json` | `mv:<eventId>:<species>` | event start |
| GBL week | `gbl[].start` boundary | `feed.json` | `gbl:<start>` | at start |
| Mega timer | user-specific: client posts `/schedule {fireAt,label}` when the user logs a Mega evolution (max 5 pending); Worker sends once at fireAt, then drops it | client state only | `mega:<id>` | user-chosen, e.g. 30 min before end |

Notes: Mega timers are the only per-user schedule; the server never touches the game. Event `start`/`end` in the feeds carry no zone (game events are local time); GBL entries carry `Z`. Worker must store each user's IANA zone and convert; test with fixtures. Stale feed (`fetchedAt` older than 48 h): send nothing "new", only already-queued reminders.

## 5. Service worker (sw.js, to implement)
- `push`: parse JSON in try/catch; always call `showNotification` (title fallback "Professor"); `tag` = dedupe id; `icon ./icons/icon-192.png`; `data:{url}`.
- `notificationclick`: close; `clients.matchAll` focus existing window else `openWindow(data.url || './')`; same-origin URLs only.
- `pushsubscriptionchange`: resubscribe and POST. iOS support patchy, so also on every app open compare `getSubscription().endpoint` with the stored one and re-POST when different.
- Bump `CACHE_NAME`; leave the fetch handler alone. Edit the sources, rebuild with `build_bundles.py`.

## 6. Opt-in UX
- Lives in More > Settings: row "Push alerts" off/on, toggles Promo codes / Events / Mega timers, "Send test". Existing "Turn on reminders" stays as the offline fallback; when push is on, local reminders for the same ids are skipped (shared `sent` ids) to avoid doubles.
- Never prompt on launch. Tap row -> one sentence ("Alerts come from a small server. It stores your device address and these choices.") -> `Notification.requestPermission()` inside that tap handler -> `pushManager.subscribe` -> POST.
- States: unsupported (hide; in an iOS browser tab show "Add to Home Screen first"), denied (explain the OS Settings path, no re-prompt loop), granted, error (Worker down: keep local reminders, retry on next open).
- Off = `unsubscribe()` + delete on the Worker. Terse sentence-case copy.

## 7. Quotas (free tier)
- Workers Free (https://developers.cloudflare.com/workers/platform/limits/): 100k requests/day; 10 ms CPU per HTTP and per cron invocation (network wait excluded); 50 subrequests per invocation; 5 cron triggers per account.
- Cron via `triggers.crons`, UTC, up to 15 min to propagate (https://developers.cloudflare.com/workers/configuration/cron-triggers/). Every 15 min = 96 runs/day, trivial.
- Binding limit is 50 subrequests: 3 feed fetches + KV ops + one push POST per subscriber, so about 35 sends per tick. Mitigate: chunk of 30 subs per tick with a cursor, only send on due items, cap enrolment. Fits under 100 users at a few alerts/day. Beyond that is an owner decision (paid plan is out of scope).
- 10 ms CPU: ES256 sign + AES-GCM per send is real CPU, not wait. Sign the VAPID JWT once per push-service origin per tick; measure in the spike (phase 0); this is the top technical risk.
- Push services have their own limits: honour 429 `Retry-After`; TTL 3600 for timed items, 86400 for promo.

## 8. Privacy
- Stored: push endpoint + keys, prefs, IANA zone, pending Mega fireAt + label. No uid, no roster, no IP, no analytics. The endpoint is a pseudonymous identifier; treat as personal data.
- Update PRIVACY.md: new table row ("Push subscription: Cloudflare KV; deleted on turn-off, on 404/410, and after 90 days without a successful send"); fix the "no server of its own" sentence; Cloudflare becomes a processor. Contact placeholder in PRIVACY.md is still unfilled. Mega label comes from a fixed list, never free text.
- Retention prune in cron. Settings "delete my data" also calls the Worker.
- Worker hardening: CORS to the Pages origin only; validate subscription endpoint is https on a known push host (`*.push.apple.com`, `fcm.googleapis.com`, `*.push.services.mozilla.com`, `*.notify.windows.com`) to prevent SSRF; body size cap; per-IP rate limit.

## 9. CSP (test_csp)
Current `connect-src 'self' blob: https://*.googleapis.com https://raw.githubusercontent.com https://api.github.com`. Add the exact Worker origin `https://professor-push.<owner-subdomain>.workers.dev` (no wildcard; `scripts/test_csp.js` rejects `*`, `https:`, `http:` in connect-src/frame-src/script-src). Push service hosts are contacted by the browser, not page JS: no CSP entry (and `fcm.googleapis.com` is already covered by `*.googleapis.com`). Extend the pre-check list in `test_csp.js`: Worker host present, still no wildcard; keep the blocked-host probe. The CSP meta is generated into `index.html` from the dc.html source: edit the source, rebuild.

## 10. Tests to add (nothing hits real services)
- `scripts/test_push_triggers.js`: pure logic module shared with the Worker; fixture feeds + fake clock: leads, dedupe, first-run seeding, zone conversion, expired skip, stale-feed skip.
- Worker handler test with in-memory KV and mocked fetch: subscribe validation (bad host, oversize, bad origin), 410 prune, 429 backoff, chunk cursor, subrequest count stays under 50.
- Crypto test: VAPID JWT verifies against the public key; RFC 8291 appendix vector round-trips.
- QA e2e (stand-in like `session({cloud})`): Settings row hidden when not standalone, shown when standalone; `requestPermission` is not called before the tap; mocked `PushManager`; denied copy; toggles persist; test-send posts to a stub.
- SW test (Chromium): synthetic `push` event always yields `showNotification`, even for empty or invalid data; `notificationclick` focuses/opens same-origin only.
- `test_csp.js` changes above. Wire all into `.github/workflows/test.yml`.
- Real iOS delivery cannot be automated: manual check added to `docs/SECURITY_CHECKS.md`.

## 11. Owner steps (exact)
1. Create a free Cloudflare account (no card needed for Workers Free).
2. `npm i -g wrangler`, then `wrangler login` (browser OAuth on the owner's machine).
3. `wrangler kv namespace create PUSH`; paste the printed id into `worker/wrangler.toml` (committed with a placeholder).
4. Generate VAPID keys locally: `npx web-push generate-vapid-keys`. Keep the private key out of the repo.
5. `wrangler secret put VAPID_PRIVATE_KEY`, `wrangler secret put VAPID_SUBJECT` (`mailto:<owner address>`). The public key goes in the client constants (committed; it is public).
6. Set `ALLOWED_ORIGIN` in `wrangler.toml` to the Pages origin.
7. `wrangler deploy`; note the `*.workers.dev` URL (pick a workers subdomain if none: dashboard > Workers & Pages). The cron deploys with it (`crons = ["*/15 * * * *"]`); wait up to 15 min.
8. Give Claude the Worker URL (never secrets) so the client constant and CSP entry are set; rebuild; publish Pages.
9. On a real iPhone (iOS 16.4+): open the Pages URL in Safari, Share > Add to Home Screen, open from the icon, Settings > Push alerts > on > Send test.
10. Fill the PRIVACY.md contact placeholder.
11. Never rotate the VAPID key casually: it invalidates every subscription.
No Apple Developer account, no paid plan, no Firebase change.

## 12. Risks
- iOS: Home Screen only; permission may be revoked if a push shows nothing; delivery best-effort; Focus silences it. Mitigate: always show, tag-dedupe.
- Free caps (10 ms CPU, 50 subrequests) with per-subscriber crypto. Spike first; fall back to batching or fewer sends.
- Community feed data (ScrapedDuck) can be wrong or late; a wrong promo push is user-visible. Maybe `verified` codes only.
- Zoneless event times: wrong-hour alerts. Fixture tests.
- New public write endpoint and CSP egress: spam/abuse. Origin check, host allow-list, caps.
- EU/DMA behaviour uncertain; Apple page not machine-verified here.
- Terms: notifications use public event/promo data and the user's own timers; nothing reads the game.
- Endpoint churn on iOS: re-sync on open.
- Double alerts with local reminders: shared ids.

## 13. Phases
0. Spike (0.5 d): Worker with a hard-coded test push to the owner's phone; measure CPU of sign + encrypt; confirm iOS behaviour for empty/invalid payloads. Go/no-go.
1. Client + SW (1.5 d): handlers, Settings row, subscribe flow, CSP, tests. Test-send only.
2. Worker triggers, promo + events (1.5 d): logic module, KV, cron, prune, tests.
3. Event moves + GBL (0.5 d).
4. Mega timers (1 d): `/schedule`, tie to the app's Mega log, tests.
5. Privacy docs, SECURITY_CHECKS, handoff section, a week on owner devices, then public (1 d).

Estimate: about 6 to 7 working days of agent work, about 1 hour of owner time, plus a real-device pass. Ship phases 0-2 first; stop if spike numbers fail.

## 14. Owner decisions (2026-11-18) and open items
Decided:
- Promo pushes: verified codes only.
- Timed-research promo codes are included (new row in section 4; needs the pipeline to flag them).
- Mega timer: derive from official Pokémon GO data, not only a user-logged expiry. Finding: no official machine-readable source exists (the game master has no timer data, and no official Niantic support page was found). Third-party sources agree the Mega form lasts 8 hours but disagree on cooldown by Mega Level (24-72 h vs days). TODO before building: read the official Niantic/Scopely Pokémon GO news or help page and take the numbers from there; until then the app keeps the user-logged time as the anchor (the app cannot see the game) and shows the official duration only once confirmed.
- Timed-research code source: official Pokémon GO sources only (confirm which page publishes codes; current `promo_codes.json` sources are listed in its `sources` field).
Still open:
1. Accept Cloudflare as a new processor and the PRIVACY.md change? (Alternative: no push, keep local reminders.)
2. Which event types notify by default?
3. Enrolment cap (300?) if free limits bind.
4. Any EU users to support? Needs a real-device test.
