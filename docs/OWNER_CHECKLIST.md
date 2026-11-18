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
