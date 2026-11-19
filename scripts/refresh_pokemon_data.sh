#!/usr/bin/env bash
# Weekly Pokemon data refresh: update pokemon-mechanics.js, then rebuild the deployed bundles (and bump the version tag)
# when that file changed. The bundles embed pokemon-mechanics.js, so committing the one without the other leaves
# test_bundles_current.py red on the next push. ci_push.sh re-runs this on a fresh checkout when the push is rejected.
set -eu
python3 scripts/update_pokemon_data.py
if git diff --quiet -- pokemon-mechanics.js; then
  echo "pokemon-mechanics.js unchanged; bundles left as they are"
else
  python3 scripts/build_bundles.py --bump
fi
