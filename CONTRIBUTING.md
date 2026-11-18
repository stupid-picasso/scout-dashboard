# Contributing

## Build and test

```bash
npm install
python3 -m venv /tmp/venv && /tmp/venv/bin/pip install -r requirements.txt   # for the Python tests
python3 scripts/build_bundles.py --bump     # after editing "Scout Dashboard.dc.html": rebuilds the bundles and index.html
node scripts/test_ranking.js && node scripts/test_roster_logic.js && node scripts/test_firestore_rules.js
node scripts/smoke_render.js
QA_OUT=/tmp/qa-a.json node scripts/qa/qa_run.js a      # suites a b c d e, one at a time
python3 scripts/test_bundles_current.py
```

Edit the source file `Scout Dashboard.dc.html`, never the generated bundles or `index.html`. CI runs the same checks
(`.github/workflows/test.yml`, `qa.yml`).

## Rules

* No real account data in a pull request: no roster exports, backups, logs, or screenshots that show a trainer name, friend code
  or location. Use the synthetic fixtures under `scripts/fixtures/`.
* Never paste a key or token (Gemini, GitHub, Firebase service accounts) into code, an issue, a test or a commit message.
  Tests use obviously fake values.
* Do not add `innerHTML`, `document.write` or `eval(`; the regression test fails on them.
* Nothing may contact the real Firebase project from tests. Cloud behaviour is tested against the in-memory stand-in in
  `scripts/qa/qa_lib.js`.
* By contributing you agree your contribution is licensed under the project's MIT licence (see `LICENSE`).
