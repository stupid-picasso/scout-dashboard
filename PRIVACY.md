# Privacy

Professor is an unofficial fan-made tool. It is not affiliated with, endorsed by or sponsored by Niantic, Inc., Scopely, Nintendo,
Creatures Inc., GAME FREAK inc. or The Pokemon Company. Pokemon, Pokemon GO and character names are trademarks of their
respective owners. The app reads only what you show it (screenshots or recordings you import); it does not connect to the game's
servers, modify the game, automate play or track location.

This is plain-language information, not legal advice. Contact: `<PRIVACY CONTACT ADDRESS: the owner fills this in>`.

## What is stored, and where

| Data | Where | Notes |
|---|---|---|
| Your roster, settings, history, chat messages (last 60), backups (up to 5 snapshots) | On your device (`localStorage`); and, only if you sign in, in Google Cloud Firestore under your account | Game data; chat can contain whatever you type |
| Sign-in identity: email, user id, and name or avatar if Google/GitHub provide them; a password hash for email sign-in | Google Firebase Authentication | Authentication runs in the US |
| Gemini key, optional GitHub token | Your device only (`scout.secrets.v1`) | Never uploaded by Professor, never in a backup or export |
| Screenshots and video frames you import | Sent from your browser to Google's Gemini API with **your own key**; not stored by Professor | Can show a trainer name, friend code or location: crop first |
| Theme, zoom, reminder choices | Your device | |

Professor has no server of its own, no analytics and no ads. Google acts as processor for Firebase; the maintainer decides what is
stored. Data is kept until you delete it.

## The Gemini free tier, in plain words

If you use screenshot or recording import with a free Google AI Studio key, Google's terms for the free tier apply, not ours. As
we read them (check the current terms yourself): content you send may be used by Google to improve its products and may be read by
human reviewers; the free tier is for adults (18+); and it is **not offered to users in the EEA, the UK or Switzerland**. If
that applies to you, do not use AI import without a paid key. Everything else (manual entry, CSV import, rankings) works without
sending anything to Google.

## Your controls

* **Export my data:** Settings > Your data > Export my data saves your roster and settings as a file (no keys inside).
* **Delete my account and cloud data:** Settings > Your data > Delete my account and cloud data (asks twice). It deletes your
  snapshots, then your cloud document, then your sign-in, then this device's copy. If the sign-in is too old it asks you to sign
  in again first.
* Signing out removes the signed-in copy from the device.

Professor is not meant for children under 13, and the Gemini path is for adults.
