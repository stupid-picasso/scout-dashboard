#!/usr/bin/env bash
# ci_push.sh - commit generated files and push them to the shared branch, surviving a race with other data workflows.
#
#   scripts/ci_push.sh [--regen "CMD"] "COMMIT MESSAGE" PATH...
#
# Stages PATH... (files or directories; a git-ignored path is only added when .gitignore allow-lists it), commits once, then
# pushes HEAD to $CI_PUSH_BRANCH. When the push is rejected because the branch moved, it does NOT rebase generated output
# (that can only conflict): it records what this run's commit changed, hard-resets onto the latest remote, lays the same files
# back down (or, with --regen, re-runs CMD on the fresh checkout, for files that other workflows also edit), recommits and
# pushes again. After the last attempt it exits non-zero. Nothing is swallowed.
#
# Environment (all optional): CI_PUSH_BRANCH (main), CI_PUSH_REMOTE (origin), CI_PUSH_ATTEMPTS (5), CI_PUSH_SLEEP (seconds
# added per attempt, default 3).
set -u

REGEN=""
if [ "${1:-}" = "--regen" ]; then REGEN="$2"; shift 2; fi
MSG="${1:-}"; shift || true
if [ -z "$MSG" ] || [ "$#" -eq 0 ]; then
  echo "usage: ci_push.sh [--regen CMD] MESSAGE PATH..." >&2
  exit 2
fi
BRANCH="${CI_PUSH_BRANCH:-main}"
REMOTE="${CI_PUSH_REMOTE:-origin}"
ATTEMPTS="${CI_PUSH_ATTEMPTS:-5}"
PAUSE="${CI_PUSH_SLEEP:-3}"

git config user.name >/dev/null 2>&1 || git config user.name "github-actions[bot]"
git config user.email >/dev/null 2>&1 || git config user.email "github-actions[bot]@users.noreply.github.com"

git add -A -- "$@" || exit 1
if git diff --cached --quiet; then
  echo "ci_push: nothing to commit"
  exit 0
fi
git commit -q -m "$MSG" || exit 1

attempt=1
while :; do
  if git push "$REMOTE" "HEAD:$BRANCH"; then
    echo "ci_push: pushed on attempt $attempt"
    exit 0
  fi
  if [ "$attempt" -ge "$ATTEMPTS" ]; then
    echo "::error::ci_push: could not push to $BRANCH after $attempt attempts"
    exit 1
  fi
  echo "ci_push: push rejected (attempt $attempt of $ATTEMPTS); re-applying this run's output onto the latest $BRANCH"
  STAGE="$(mktemp -d)"
  : > "$STAGE/deleted.txt"
  # What this run's commit changed: added/modified files are copied out, deletions are listed.
  git diff-tree --no-commit-id --name-status -r -z HEAD > "$STAGE/changes.bin" || exit 1
  python3 - "$STAGE" <<'PY' || exit 1
import os, subprocess, sys
stage = sys.argv[1]
parts = open(os.path.join(stage, 'changes.bin'), 'rb').read().split(b'\0')
i = 0
while i + 1 < len(parts):
    status, path = parts[i].decode(), parts[i + 1].decode()
    i += 2
    if status.startswith('D'):
        open(os.path.join(stage, 'deleted.txt'), 'a').write(path + '\n')
    else:
        dest = os.path.join(stage, 'files', path)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        with open(dest, 'wb') as f:
            f.write(subprocess.check_output(['git', 'show', 'HEAD:' + path]))
PY
  git fetch "$REMOTE" "$BRANCH" || { echo "::error::ci_push: fetch failed"; exit 1; }
  git reset -q --hard FETCH_HEAD || exit 1
  if [ -n "$REGEN" ]; then
    bash -c "$REGEN" || { echo "::error::ci_push: regeneration failed"; exit 1; }
  else
    if [ -d "$STAGE/files" ]; then cp -R "$STAGE/files/." . || exit 1; fi
    while IFS= read -r gone; do
      if [ -n "$gone" ]; then rm -f -- "$gone"; fi
    done < "$STAGE/deleted.txt"
  fi
  rm -rf "$STAGE"
  git add -A -- "$@" || exit 1
  if git diff --cached --quiet; then
    echo "ci_push: the remote already has this output"
    exit 0
  fi
  git commit -q -m "$MSG" || exit 1
  sleep $((attempt * PAUSE))
  attempt=$((attempt + 1))
done
