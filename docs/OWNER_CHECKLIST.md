# Owner checklist: sign-in, rules and first launch

Things an agent cannot do. Nothing in the code has been tried against the real Google or GitHub sign-in: it was built and tested against an in-memory stand-in only. Do these in order.

## 1. Firebase console (project `pokemon-professor`)

1. Authentication > Sign-in method > Google > Enable. Set the support email. No secret to manage.
2. GitHub, create an OAuth App (not a GitHub App): GitHub > Settings > Developer settings > OAuth Apps > New OAuth App.
   - Homepage URL: the Pages URL, `https://stupid-picasso.github.io/scout-dashboard/`.
   - Authorization callback URL: `https://pokemon-professor.firebaseapp.com/__/auth/handler`.
   - Copy the Client ID and generate a Client secret.
3. Authentication > Sign-in method > GitHub > Enable, paste the Client ID and secret. The secret lives in Firebase only, never in the repo. The app requests no scopes.
4. Authentication > Settings > Authorized domains: add `stupid-picasso.github.io` (origin only, no path). Remove `localhost`.
5. Authentication > Settings > User account linking: note whether "Link accounts that use the same email" or "Create multiple accounts for each identity provider" is selected. The app handles both: with one account per email, a second provider's sign-in reports "this email already has an account" and the app links after the person signs in the old way. Write down which one is on.
6. Authentication > Settings: check that email enumeration protection is on (default for projects created from 2023-09-15).
7. Google Cloud console > APIs and services > Credentials: restrict the web API key to the Identity Toolkit, Token Service, Firestore and Firebase APIs and to the app's referrer (`https://stupid-picasso.github.io/*`). Never add the Generative Language API to it.
8. Deploy `firestore.rules` only after the client with sign-in has shipped and installed apps have updated, and follow `DEPLOY.md` step by step (read the live rules first, save a copy). Until then every unverified email and password account would be read-only under the new rules.

## 2. Real-device test script

Run each on a real device with the built app. Write the result next to each line.

| Device | Steps |
|---|---|
| iPhone, app installed to the Home Screen | **Needs a real-device test.** Whether a sign-in popup works from a Home Screen app is not established. Tap Continue with Google; tap Continue with GitHub. If the window does not open or the result does not come back, the app shows "Sign-in window did not open. Try again, open the app in your browser, or use email instead." Email and password must still work. If popups fail there: keep email and password, and plan email-link sign-in as a later change. |
| iPhone, Safari tab | Google popup, GitHub popup, sign out, sign in again, roster is the same. |
| Android, installed app | Same as the iPhone Safari row. |
| Desktop Safari, Chrome, Firefox | Same. Also allow popups once if the browser blocks the first one. |

For every device and provider also check:

1. Sign in, then Settings > Cloud sync shows who you are (email, name, or the provider id when GitHub hides the email, never "null").
2. Sign out and sign in again: the roster comes back.
3. On the existing email account (the owner's): sign in with email and password, tap Link Google (then Link GitHub). Confirm the roster is still there and Settings says "Signed in with email and password and Google". The uid in Firebase > Authentication > Users must be the same one as before.
4. Sign in with Google on a device that already has a roster built while signed out, with a Google account that has no data: the app asks before uploading it. Check both answers.
5. Settings > Your data > Export my data downloads a file; Delete my account and cloud data (asks twice) removes the user in Authentication and the document in Firestore.

## 3. Throwaway-project test (before inviting anyone)

Firebase's rules for "same email, different provider" were not verified. In a throwaway Firebase project (never the real one):

1. Create an email and password account on a gmail address and do not verify the email.
2. Sign in with Google on the same address.
3. Check in Authentication > Users: is it still one user with the same uid, and is the password provider still there? If the uid changed, the roster would look lost: do not invite anyone until the flow is understood.
4. Repeat with GitHub on the same address (GitHub is not a trusted email provider) and note the error the app shows.

## 4. Other

1. Fill in the contact address in `SECURITY.md` and `PRIVACY.md`.
2. GitHub repo settings: Actions default token read-only; secret scanning and push protection on.
3. The Gemini key stays on a device after sign-out on purpose (it is a device setting used signed out too). On a shared device use Settings > AI engine > Remove all, or Delete my account.

## 5. Push alerts while the app is closed (task 28)

**Built and tested only against stand-ins** (fake storage, fake network, a stubbed PushManager). Nothing has run on Cloudflare, with a real VAPID key, or on a real iPhone. Until you do the steps below the app shows Settings > Push alerts > "Not set up yet" and makes no network request for it. No Apple Developer account, no paid plan, no Firebase change.

1. **Cloudflare account.** Create a free account at cloudflare.com (no card needed for Workers Free). Dashboard > Workers & Pages: pick a workers.dev subdomain if it asks. Free limits that matter: 100,000 requests a day, 10 ms of CPU per run, 50 outside calls per run (the Worker counts them and stops early).
2. **Wrangler.** On your computer: `npm i -g wrangler`, then `wrangler login` (a browser sign-in).
3. **Storage.** `wrangler kv namespace create PUSH` and copy the id it prints into `worker/wrangler.toml` (`id = "..."`). The id is not secret.
4. **VAPID keys** (the sender's identity; make them on your computer, never in this repo): `npx web-push generate-vapid-keys`. It prints a public key (87 characters) and a private key (43 characters). The Worker reads exactly this format.
5. **Settings in `worker/wrangler.toml`:** `ALLOWED_ORIGIN` = the page origin only, for example `https://stupid-picasso.github.io` (no path, no trailing slash); `DATA_BASE` = where the data files are served, for example `https://stupid-picasso.github.io/scout-dashboard/data/`; `VAPID_PUBLIC_KEY` = the public key. Do not paste the private key here.
6. **Secrets** (stored by Cloudflare, never in the repo): from the `worker/` folder run `wrangler secret put VAPID_PRIVATE_KEY` and paste the private key, then `wrangler secret put VAPID_SUBJECT` and enter `mailto:` followed by your address.
7. **Deploy:** `cd worker && wrangler deploy`. Note the address it prints, `https://professor-push.<your-subdomain>.workers.dev`. The 15-minute timer is deployed with it and can take up to 15 minutes to start.
8. **Tell the app.** In `Scout Dashboard.dc.html` find `PUSH_CONFIG()` and fill both values between the single quotes: `workerUrl` (the address from step 7, origin only) and `vapidPublicKey` (the public key from step 4). Then `python3 scripts/build_bundles.py --bump`. The build adds exactly one entry to the page's Content-Security-Policy `connect-src`, that origin, and refuses anything that is not a plain https origin. If you ever edit the policy by hand instead, the entry is `https://professor-push.<your-subdomain>.workers.dev` appended to `connect-src` in `scripts/build_index.js` (no wildcard, no `https:`). Then run `node scripts/test_push_config.js` and `node scripts/test_csp.js`; both must pass. Publish Pages.
9. **Real iPhone (iOS 16.4 or later):** open the Pages address in Safari, Share > Add to Home Screen, open the app from its icon, Settings > Push alerts > Turn on > Allow > Send test. A banner should arrive with the app closed. Also run rows 15 and 16 of `docs/SECURITY_CHECKS.md`. In an ordinary Safari tab the row says "Add to Home Screen first": that is expected.
10. **First day:** the first run of the timer only records the promo codes already listed (it announces nothing). `wrangler tail` shows each run; check one run stays under the CPU limit (the Free plan allows 10 ms of CPU per run; if a run is stopped for CPU, lower `MAX_SENDS` in `worker/src/index.js`, or move to the paid plan, your call).
11. Fill the contact placeholder in `PRIVACY.md` if you have not. Do not rotate the VAPID key casually: it invalidates every subscription.

What to expect and what is not covered: about 40 alerts are sent per 15-minute run, so with many people subscribed some get an "event starts" alert late; the cap is 300 devices. Event times in the data have no time zone, so each device's own zone (sent at sign-up) is used. The Mega timer uses the rest time you logged in the app; the app has no official cooldown numbers yet, so none are built in.
