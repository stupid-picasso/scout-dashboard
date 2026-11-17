# Manual security checks

Checks that cannot run automatically (they need a real Firebase project, a real key or a real device). Do them before you
invite testers. The automated ones are in `scripts/test_firestore_rules.js` and `scripts/qa/qa_e2e_d.js` (SYNC-0x, DATA-0x).

| # | Check | How | Expect |
|---|---|---|---|
| 1 | Live rules equal the repository | Console > Rules, compare with `firestore.rules` | identical |
| 2 | Cross-user read denied | Rules Playground: `get /databases/(default)/documents/scoutUsers/OTHER` as your uid | denied |
| 3 | Shared collections not writable | Playground: `create /gameData/x` and `/sprites/x` as your uid | denied |
| 4 | Unknown field refused | Playground: `update /scoutUsers/YOU` with `{evil: 1}` | denied |
| 5 | Credentials cannot be written | Playground: `update` with `{geminiKey: "x"}` | denied (deleting the field is allowed) |
| 6 | Snapshot id pattern | Playground: `create .../snapshots/abc` | denied; a 13-digit id with only `reason`, `createdAt`, `pokemonCount`, `data` is allowed |
| 7 | Gemini key header | Settings > keys: paste a real key, press the key check, then import one screenshot | works; devtools Network shows no `key=` in any request URL, only the `x-goog-api-key` header |
| 8 | Delete my account (real project) | Use a throwaway account: add a roster, take a snapshot, Settings > Delete my account | console shows no `scoutUsers/<uid>` document or snapshots and no user in Authentication |
| 9 | Delete with an old sign-in | Same, but wait more than 5 minutes after signing in | the app says to sign in again and deletes nothing |
| 10 | Shared device | Account A signs out, account B signs in on the same browser | B sees none of A's Pokemon; devtools > Application > Local Storage has no `scout.local.v1.<A's uid>` |
| 11 | Quota | Firebase console > Usage after one launch of a signed-in account | about 1 document read per launch, no writes unless data changed |

Keys stay per device: `scout.secrets.v1` is not cleared by signing out (it is a device setting), only by "Delete my account",
the existing remove-keys buttons, or clearing site data. On a shared device, remove the keys before handing it over.
