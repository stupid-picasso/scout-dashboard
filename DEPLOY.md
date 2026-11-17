# Deploying the Firestore rules (owner checklist)

> **Read first: the moment these rules are live, every unverified email/password account (yours included) becomes
> read-only.** It can still read, export and delete; saves fail with "Missing or insufficient permissions". Step 3 says how to
> avoid that. Do not publish before you have done step 3.

Nothing in this repository deploys anything. These steps are for you, the owner, at the Firebase console or with the Firebase CLI.
The rules in `firestore.rules` and the app are coupled: **ship the client first, then the rules.** Deploying the rules first would
refuse every write from the installed apps (they still send a number in `updatedAt`).

## Before you start

1. **Read the live rules and save a copy.** Firebase console > Firestore Database > Rules. Copy the text into a file outside
   the repository (for example `live-rules-YYYY-MM-DD.txt`). This is your roll-back.
2. **List the keys of a real document and compare.** Console > Firestore Database > Data > `scoutUsers` > your own document.
   Write down every field name. Each one must be in `allowedKeysList()` of `firestore.rules`, or in `scrubKeysList()` (old
   credentials, delete only). A field that is in neither means that part of the app was never written by this version: find
   out why before going on. Do the same for one snapshot under `scoutUsers/<uid>/snapshots`: only `reason`, `createdAt`,
   `pokemonCount`, `data` are allowed.
3. **Decide about email/password accounts. This step can lock users out.** The rules accept a write only from a Google or GitHub
   sign-in or from an email address that is verified. Today the app signs in with email/password only, has no "verify my email"
   step, and Google/GitHub sign-in does not exist yet. So **the moment the rules are deployed, every email/password account
   that is not verified becomes read-only** (it can still read, export and delete; saves fail with "Missing or insufficient
   permissions"). Pick one before step 7 (Publish):
   * deploy the rules only after the sign-in change (Google/GitHub) has shipped and your own account uses it; or
   * mark the existing accounts verified from your machine with the Admin SDK
     (`getAuth().updateUser(uid, { emailVerified: true })`) for people you know; they must sign out and in again so the new
     token carries the claim; or
   * accept unverified accounts: change the body of `verifiedIdentity()` to `return true;` (and say so in PRIVACY.md). The
     trade-off: anyone can then create accounts with addresses they do not own and write to Firestore.
   I could not verify from here whether the console offers a "mark verified" button; do not rely on it.
4. **Check the old admin is gone.** The old rules (the copy you saved in step 1) may name addresses as admins with
   `token.email in [...]`. Console > Authentication > Users: if any of those addresses is an account you do not control (an
   address nobody has signed up with yet is the danger, because anyone could register it), delete it. The new rules have no
   admin by email.

## Ship

5. **Ship the client first.** Merge and publish this version of the app (GitHub Pages), then wait for the installed apps to
   update (the service worker updates the shell on the next launch; give it a few days, or at least until your own phone and
   browser show the new build number in Settings > About).
6. **Put the new rules in as a draft and test them BEFORE you publish.** Console > Firestore Database > Rules: paste the text
   of `firestore.rules` into the editor but do not press Publish yet. The Rules Playground (the "Rules playground" button in
   that editor) runs against the draft in the editor, not against what is live. Run these checks (each simulates a *write*
   or *get* with "Authenticated" on; set the provider to `google.com` for 6a to 6d, because an email/password user who is
   unverified is denied for that reason alone and would make a denial look like a pass):
   * 6a. `get` of `scoutUsers/<someone else's uid>` while authenticated as your uid: **denied**.
   * 6b. `update` of `gameData/baseStats`: **denied**.
   * 6c. `update` of `scoutUsers/<your uid>` with the field `evil: 1` and `updatedAt` set to the request time: **denied**
     (it is the unlisted key that should be the reason, which is why provider and timestamp must be right).
   * 6d. Positive check: `update` of `scoutUsers/<your uid>` with only `trainerLevel: 40` and `updatedAt` set to the request
     time: **allowed**. If that is denied, do not publish.
   * 6e. Same as 6d but with a provider of `github.com` and a token that has no `email_verified` claim: **allowed** (this is
     the case that depends on `.get('email_verified', false)`). If the Playground cannot build such a token, skip it and
     watch the first GitHub sign-in after publishing.
   If the Playground will not let you set `updatedAt` to the exact request time, the positive check may be denied for that
   reason only; in that case treat step 7's live checks as the positive test and keep your saved copy ready.
7. **Publish.** Press Publish in the console, or with the CLI from this folder:
   `firebase deploy --only firestore:rules --project <your-project-id>`.
   Then sign in on a device with the new client and check: the roster loads, an edit shows "saved", Settings shows the snapshots,
   and a device that is signed out can still read nothing.

## Roll back

If sign-in works but saving fails ("error: Missing or insufficient permissions"), paste the copy from step 1 back into the
console and publish. Nothing else needs to change in the client. (Whether the new client also works under the old rules depends on what those rules
were: step 1's copy is the only evidence, and I have not seen it. If they allow writes with a server timestamp and the new
snapshot index field, it does; if you are unsure, test with a throwaway account before relying on it.)

## The credential scrub window

Older builds could upload the Gemini key, a custom endpoint or a GitHub token to the user document. The new client deletes those
fields on its next save, and `scrubKeysList()` lets that delete through (writing them is refused). Once every installed client is
the new one (a few weeks), remove `scrubKeysList()` and the `.concat(scrubKeysList())` part of `updateKeysOk()` and publish
again. The same goes for the legacy plain keys (`roster`, `addedPokemon`, ...) at the end of `allowedKeysList()`: they are only
there so the client can delete them from old documents.

## What is deliberately not in the rules

* **No 30-second write throttle.** The app pushes after 150 ms to 1.2 s on purpose and does not queue writes; a throttle in the
  rules would make normal use fail unless the client delayed saves for up to 30 s. It also does not bound the daily quota
  (2,880 writes a day per account still fit). Cost to know: every save is a write plus one read, because the server timestamp comes back to the open page through the listener; that is about 1 write and 1 read per edit, no loop. What bounds abuse is the key allow-list, the verified-identity check, no client
  writes to shared collections, snapshots limited to a 13-digit id, and (to do) App Check and a budget alert.
* **No Firestore reads of `gameData` or `sprites`.** The app ships its own tables and sprites. The two collections stay
  read-only in the rules so an old client still works; you can delete them from the console when no old client is left.
  To change shared data later, use an Admin SDK script on your machine, never the client.

## Other console settings (not code)

* Restrict the Firebase web API key to the app's domain (Google Cloud console > APIs & Services > Credentials).
* Add a budget alert and, once on the Blaze plan, a cap.
* Authentication > Settings: authorised domains list only your Pages domain; turn email-enumeration protection on.
* GitHub: turn on secret scanning with push protection; Actions default token read-only.
