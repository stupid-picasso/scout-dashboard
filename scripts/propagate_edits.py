#!/usr/bin/env python3
"""
propagate_edits.py — mechanically propagate edits made to Scout Dashboard.dc.html
(the single source of truth) into the other three deployed files:

  - Scout Dashboard Standalone.dc.html   (plain text file, same JS/template dialect)
  - index.html                           (bundled: JSON-embedded template + resource manifest)
  - Scout Dashboard.html                 (bundled, same as index.html)

WHY THIS EXISTS
----------------
Every prior session this repo was edited by hand-writing find/replace pairs for
each of the 4 files. That process produced two real, shipped bugs in one
session: a whole feature (GitHub Drive-trigger methods) silently failed to
propagate because the anchor text didn't match the bundle's slightly different
attribute convention (sc-camel-on-click vs onClick), and a self-referential
replacement duplicated a chunk of template markup on a second pass. Both bugs
were only caught by manually diffing every file against dc.html after the fact.

This script automates that same diff-and-verify discipline: it computes the
ACTUAL changed regions between two snapshots of dc.html (not hand-reconstructed
strings), tries several normalized match strategies against each target file,
and — critically — refuses to guess. A hunk that doesn't match exactly once in
a target file is reported and left unpatched, rather than silently applying a
near-miss (which is exactly how the duplication bug happened last time).

USAGE
-----
  # Before editing dc.html, snapshot it:
  python3 scripts/propagate_edits.py snapshot

  # ... edit "Scout Dashboard.dc.html" and pokemon-mechanics.js as needed ...

  # Then propagate + verify + bump version in one step:
  python3 scripts/propagate_edits.py apply

  # Or just verify current state without changing anything:
  python3 scripts/propagate_edits.py verify

The snapshot lives at .propagate_baseline/ — a plain copy of the two source
files at the point propagate.py last ran successfully. It is COMMITTED to the
repo (not gitignored) so a fresh session/clone can diff from exactly where
the last one left off. Running `apply` diffs against that baseline, patches
the other 3 files, then updates the baseline to the new state.
"""
import sys
import os
import re
import json
import gzip
import base64
import difflib
import subprocess

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASELINE_DIR = os.path.join(REPO, '.propagate_baseline')
DC_HTML = os.path.join(REPO, 'Scout Dashboard.dc.html')
STANDALONE_HTML = os.path.join(REPO, 'Scout Dashboard Standalone.dc.html')
INDEX_HTML = os.path.join(REPO, 'index.html')
BUNDLE_HTML = os.path.join(REPO, 'Scout Dashboard.html')
MECHANICS_JS = os.path.join(REPO, 'pokemon-mechanics.js')
SW_JS = os.path.join(REPO, 'sw.js')

BUNDLE_FILES = [INDEX_HTML, BUNDLE_HTML]

# ---------------------------------------------------------------------------
# Text normalization — the known cosmetic differences between dc.html's own
# authoring conventions and what earlier bundling passes left in the bundled
# files. New matches should be ADDED here as they're discovered, not worked
# around ad hoc in a one-off script, so every future run benefits.
# ---------------------------------------------------------------------------
NORMALIZATIONS = [
    (re.compile(r'\bonClick='), 'sc-camel-on-click='),
    (re.compile(r'\bsc-camel-on-click='), 'onClick='),
    (re.compile(r'\bonChange='), 'sc-camel-on-change='),
    (re.compile(r'\bsc-camel-on-change='), 'onChange='),
    (re.compile(r'&ldquo;'), '\u201c'),
    (re.compile(r'\u201c'), '&ldquo;'),
    (re.compile(r'&rdquo;'), '\u201d'),
    (re.compile(r'\u201d'), '&rdquo;'),
    (re.compile(r'&hellip;'), '\u2026'),
    (re.compile(r'\u2026'), '&hellip;'),
]


def read(path):
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()


def write(path, text):
    with open(path, 'w', encoding='utf-8') as f:
        f.write(text)


def normalized_variants(text):
    """Yield (variant_text, ops) pairs — the original plus every combination
    of the known cosmetic substitutions, each paired with the exact sequence
    of (pattern, repl) operations used to build it. Tracking the ops (not
    just the resulting text) is what lets the caller replay the identical
    transformation on new_hunk instead of guessing which direction to
    translate it — text alone is ambiguous once substitutions can run in
    either direction. Small hunks only (exponential in distinct substitutions
    that actually appear)."""
    variants = [(text, [])]
    for pattern, repl in NORMALIZATIONS:
        if not pattern.search(text):
            continue
        new_variants = []
        for v, ops in variants:
            new_variants.append((v, ops))
            if pattern.search(v):
                new_variants.append((pattern.sub(repl, v), ops + [(pattern, repl)]))
        variants = new_variants
        if len(variants) > 32:
            break  # bail out rather than blow up; caller will report no-match
    seen = set()
    out = []
    for v, ops in variants:
        if v not in seen:
            seen.add(v)
            out.append((v, ops))
    return out


def apply_ops(text, ops):
    for pattern, repl in ops:
        text = pattern.sub(repl, text)
    return text


def find_unique(haystack, needle):
    """Return (count, first_index) of needle in haystack."""
    count = haystack.count(needle)
    idx = haystack.find(needle) if count else -1
    return count, idx


# ---------------------------------------------------------------------------
# Diffing dc.html old -> new into a list of hunks, each with enough context
# to be a unique anchor. difflib gives us opcodes; adjacent non-equal ops are
# merged, and a fixed number of context lines are pulled in from the
# surrounding equal blocks on each side.
# ---------------------------------------------------------------------------
CONTEXT_LINES = 2


def compute_hunks(old_text, new_text):
    old_lines = old_text.splitlines(keepends=True)
    new_lines = new_text.splitlines(keepends=True)
    sm = difflib.SequenceMatcher(a=old_lines, b=new_lines, autojunk=False)
    opcodes = sm.get_opcodes()

    hunks = []
    i = 0
    while i < len(opcodes):
        tag, i1, i2, j1, j2 = opcodes[i]
        if tag == 'equal':
            i += 1
            continue
        # Merge consecutive non-equal opcodes separated by tiny equal runs
        # (fewer than 2*CONTEXT_LINES lines) into one hunk, since two
        # anchors that close wouldn't be independently unique anyway.
        start = i
        end = i
        while end + 1 < len(opcodes):
            nxt = opcodes[end + 1]
            if nxt[0] == 'equal' and (nxt[2] - nxt[1]) < CONTEXT_LINES * 2:
                if end + 2 < len(opcodes) and opcodes[end + 2][0] != 'equal':
                    end += 2
                    continue
            break
        block = opcodes[start:end + 1]
        old_start = block[0][1]
        old_end = block[-1][2]
        new_start = block[0][3]
        new_end = block[-1][4]

        ctx_before_start = max(0, old_start - CONTEXT_LINES)
        ctx_after_end = min(len(old_lines), old_end + CONTEXT_LINES)
        new_ctx_before_start = max(0, new_start - CONTEXT_LINES)
        new_ctx_after_end = min(len(new_lines), new_end + CONTEXT_LINES)

        old_hunk = ''.join(old_lines[ctx_before_start:ctx_after_end])
        new_hunk = ''.join(new_lines[new_ctx_before_start:new_ctx_after_end])
        if old_hunk != new_hunk:
            hunks.append((old_hunk, new_hunk))
        i = end + 1
    return hunks


# ---------------------------------------------------------------------------
# Applying one hunk to one plain-text file.
# ---------------------------------------------------------------------------
def apply_hunk_to_text(text, old_hunk, new_hunk, label):
    count, idx = find_unique(text, old_hunk)
    if count == 1:
        return text.replace(old_hunk, new_hunk), None
    if count == 0:
        for variant, ops in normalized_variants(old_hunk)[1:]:
            c2, _ = find_unique(text, variant)
            if c2 == 1:
                # Replay the SAME substitution sequence that turned old_hunk
                # into this matching variant, applied to new_hunk instead —
                # so the replacement lands in this file's own dialect rather
                # than dc.html's.
                new_variant = apply_ops(new_hunk, ops)
                return text.replace(variant, new_variant), None
        return text, f"[{label}] NOT FOUND (0 matches, incl. normalized variants): {old_hunk[:90]!r}"
    return text, f"[{label}] AMBIGUOUS ({count} matches) — skipped, needs manual review: {old_hunk[:90]!r}"


def apply_hunks_to_plain_file(path, hunks):
    text = read(path)
    errors = []
    for old_hunk, new_hunk in hunks:
        text, err = apply_hunk_to_text(text, old_hunk, new_hunk, os.path.basename(path))
        if err:
            errors.append(err)
    write(path, text)
    return errors


def apply_hunks_to_bundle(path, hunks):
    src = read(path)
    start = src.find('<script type="__bundler/template">')
    if start == -1:
        return [f"[{os.path.basename(path)}] no __bundler/template block found"]
    tag_end = src.find('>', start) + 1
    end = src.find('</script>', tag_end)
    decoded = json.loads(src[tag_end:end])

    errors = []
    for old_hunk, new_hunk in hunks:
        decoded, err = apply_hunk_to_text(decoded, old_hunk, new_hunk, os.path.basename(path))
        if err:
            errors.append(err)

    new_raw = json.dumps(decoded)
    new_raw_escaped = re.sub(r'</([sSbBoOdDyY]+)', lambda m: '<\\u002F' + m.group(1), new_raw) \
        if False else re.sub(r'</([sS][cC][rR][iI][pP][tT])', r'<\\u002F\1', new_raw)
    reparsed = json.loads(new_raw_escaped)
    if reparsed != decoded:
        return errors + [f"[{os.path.basename(path)}] ROUND-TRIP MISMATCH after re-encoding — not written"]
    if '</script' in new_raw_escaped.lower():
        return errors + [f"[{os.path.basename(path)}] unescaped </script found after encoding — not written"]

    new_src = src[:tag_end] + "\n" + new_raw_escaped + "\n" + src[end:]
    write(path, new_src)
    return errors


# ---------------------------------------------------------------------------
# pokemon-mechanics.js: on dc.html / Standalone.dc.html it's a plain relative
# <script src="./pokemon-mechanics.js"> reference — nothing to do, the file
# on disk is already the update. On the two bundles it's compressed and
# base64-embedded in the ext_resources manifest, keyed by a UUID, and has to
# be re-embedded by hand whenever the source file changes.
# ---------------------------------------------------------------------------
def reembed_mechanics_js_if_changed(baseline_mechanics_path):
    if not os.path.exists(baseline_mechanics_path):
        return ["[mechanics] no baseline pokemon-mechanics.js to diff against — skipping re-embed check"]
    old = read(baseline_mechanics_path)
    new = read(MECHANICS_JS)
    if old == new:
        return []

    new_bytes = new.encode('utf-8')
    notes = []
    for path in BUNDLE_FILES:
        src = read(path)
        start = src.find('<script type="__bundler/manifest">')
        if start == -1:
            notes.append(f"[{os.path.basename(path)}] no manifest block found")
            continue
        tag_end = src.find('>', start) + 1
        end = src.find('</script>', tag_end)
        manifest = json.loads(src[tag_end:end])

        target_uuid = None
        for uuid, entry in manifest.items():
            if entry.get('mime') != 'application/javascript':
                continue
            try:
                raw = base64.b64decode(entry['data'])
                dec = gzip.decompress(raw)
                if dec.decode('utf-8', 'ignore') == old:
                    target_uuid = uuid
                    break
            except Exception:
                continue
        if not target_uuid:
            notes.append(f"[{os.path.basename(path)}] could not find the embedded pokemon-mechanics.js blob to replace (baseline content not found in manifest) — check manually")
            continue

        compressed = gzip.compress(new_bytes, compresslevel=9)
        manifest[target_uuid]['data'] = base64.b64encode(compressed).decode('ascii')
        new_manifest_json = json.dumps(manifest)
        new_src = src[:tag_end] + "\n" + new_manifest_json + "\n" + src[end:]
        write(path, new_src)
        notes.append(f"[{os.path.basename(path)}] re-embedded pokemon-mechanics.js ({len(old)} -> {len(new)} bytes source)")
    return notes


# ---------------------------------------------------------------------------
# Verification: marker-count comparison (every identifier/string literal that
# is new in dc.html's diff must appear the same number of times in every
# other file), then a JS syntax check on all four.
# ---------------------------------------------------------------------------
def extract_markers(old_hunk, new_hunk, old_full_text):
    """Tokens that are genuinely NEW in new_hunk — absent from the ENTIRE old
    file, not merely absent from the hunk's own small context window. Common
    words (border, padding, roster...) are used hundreds of times throughout
    a file this size; checking only the 2-line hunk context for "already
    existed" is too weak a filter — such a word can easily be absent from
    that narrow window by chance while still being globally ubiquitous,
    producing exactly the false-positive noise this function exists to
    avoid. Requiring zero occurrences in the WHOLE old file is the actual
    signal: something a marker for "this identifier/string never existed
    anywhere before this edit," which is what should be verified everywhere."""
    new_tokens = re.findall(r"[A-Za-z_][A-Za-z0-9_]{3,}", new_hunk)
    STOPWORDS = {'this', 'const', 'return', 'null', 'true', 'false', 'style', 'color',
                 'background', 'font', 'display', 'flex', 'value', 'name', 'state'}
    seen = set()
    markers = []
    for t in new_tokens:
        if t in seen or t in STOPWORDS or len(t) <= 4:
            continue
        seen.add(t)
        if old_full_text.count(t) == 0:
            markers.append(t)
    return sorted(markers)[:40]


def get_decoded_bundle(path):
    src = read(path)
    start = src.find('<script type="__bundler/template">')
    tag_end = src.find('>', start) + 1
    end = src.find('</script>', tag_end)
    return json.loads(src[tag_end:end])


def verify_markers(hunks, old_full_text):
    dc = read(DC_HTML)
    standalone = read(STANDALONE_HTML)
    bundles = {}
    for path in BUNDLE_FILES:
        try:
            bundles[path] = get_decoded_bundle(path)
        except Exception as e:
            print(f"  COULD NOT DECODE {os.path.basename(path)}: {e}")

    all_markers = set()
    for old_hunk, new_hunk in hunks:
        all_markers |= set(extract_markers(old_hunk, new_hunk, old_full_text))

    problems = []
    for marker in sorted(all_markers):
        dc_count = dc.count(marker)
        sa_count = standalone.count(marker)
        if dc_count != sa_count:
            problems.append(f"  {marker:30s} dc.html={dc_count:3d}  Standalone={sa_count:3d}  <-- MISMATCH")
        for path, decoded in bundles.items():
            b_count = decoded.count(marker)
            if dc_count != b_count:
                problems.append(f"  {marker:30s} dc.html={dc_count:3d}  {os.path.basename(path)}={b_count:3d}  <-- MISMATCH")
    return problems


def extract_class_body_js(text):
    m = re.search(r'class Component extends DCLogic \{.*?\n\}\n', text, re.S)
    if not m:
        return None
    return 'class Component {\n' + m.group(0).split('{', 1)[1]


def node_check(js_text, label):
    tmp = f'/tmp/_propagate_check_{abs(hash(label))}.js'
    write(tmp, js_text)
    result = subprocess.run(['node', '--check', tmp], capture_output=True, text=True)
    ok = result.returncode == 0
    return ok, result.stderr


def verify_syntax():
    problems = []
    dc = read(DC_HTML)
    js = extract_class_body_js(dc)
    ok, err = node_check(js, 'dc.html')
    if not ok:
        problems.append(f"  Scout Dashboard.dc.html: SYNTAX ERROR\n{err}")

    for path in BUNDLE_FILES:
        try:
            decoded = get_decoded_bundle(path)
            js = extract_class_body_js(decoded)
            ok, err = node_check(js, os.path.basename(path))
            if not ok:
                problems.append(f"  {os.path.basename(path)}: SYNTAX ERROR\n{err}")
        except Exception as e:
            problems.append(f"  {os.path.basename(path)}: could not check ({e})")

    ok, err = node_check(read(MECHANICS_JS), 'mechanics')
    if not ok:
        problems.append(f"  pokemon-mechanics.js: SYNTAX ERROR\n{err}")

    return problems


def run_ranking_tests():
    test_path = os.path.join(REPO, 'scripts', 'test_ranking.js')
    if not os.path.exists(test_path):
        return []
    result = subprocess.run(['node', test_path], capture_output=True, text=True, cwd=REPO)
    if result.returncode != 0:
        return [f"  test_ranking.js FAILED:\n{result.stdout}{result.stderr}"]
    return []


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------
def cmd_snapshot():
    os.makedirs(BASELINE_DIR, exist_ok=True)
    write(os.path.join(BASELINE_DIR, 'dc.html'), read(DC_HTML))
    write(os.path.join(BASELINE_DIR, 'mechanics.js'), read(MECHANICS_JS))
    print(f"Baseline saved to {BASELINE_DIR}")


def cmd_apply(bump_version=True):
    baseline_dc = os.path.join(BASELINE_DIR, 'dc.html')
    baseline_mechanics = os.path.join(BASELINE_DIR, 'mechanics.js')
    if not os.path.exists(baseline_dc):
        print("No baseline found. Run 'snapshot' before making edits next time.")
        print("Proceeding by treating the CURRENT other-files state as the baseline")
        print("is not possible automatically — you'll need to snapshot once manually")
        print("(e.g. copy today's already-correct dc.html) before this can diff anything.")
        sys.exit(1)

    old_dc_text = read(baseline_dc)
    new_dc_text = read(DC_HTML)
    dc_changed = old_dc_text != new_dc_text
    mechanics_changed = os.path.exists(baseline_mechanics) and read(baseline_mechanics) != read(MECHANICS_JS)

    if not dc_changed and not mechanics_changed:
        print("No changes detected in Scout Dashboard.dc.html or pokemon-mechanics.js since the last snapshot — nothing to propagate.")
        return

    hunks = compute_hunks(old_dc_text, new_dc_text) if dc_changed else []
    if dc_changed:
        print(f"Found {len(hunks)} changed region(s) in Scout Dashboard.dc.html.\n")
    else:
        print("Scout Dashboard.dc.html unchanged; pokemon-mechanics.js changed.\n")

    all_errors = []

    if hunks:
        print("Applying to Scout Dashboard Standalone.dc.html ...")
        errs = apply_hunks_to_plain_file(STANDALONE_HTML, hunks)
        all_errors += errs
        print(f"  {len(hunks) - len(errs)}/{len(hunks)} hunks applied cleanly")

        for path in BUNDLE_FILES:
            print(f"Applying to {os.path.basename(path)} ...")
            errs = apply_hunks_to_bundle(path, hunks)
            all_errors += errs
            print(f"  {len(hunks) - len(errs)}/{len(hunks)} hunks applied cleanly")

    print("\nChecking pokemon-mechanics.js ...")
    notes = reembed_mechanics_js_if_changed(baseline_mechanics)
    if notes:
        for n in notes:
            print(f"  {n}")
    else:
        print("  unchanged")

    print("\n--- Marker verification ---")
    marker_problems = verify_markers(hunks, old_dc_text) if hunks else []
    if marker_problems:
        print(f"{len(marker_problems)} marker mismatch(es):")
        for p in marker_problems:
            print(p)
    else:
        print("All markers match across all files.")

    print("\n--- Syntax verification ---")
    syntax_problems = verify_syntax()
    if syntax_problems:
        for p in syntax_problems:
            print(p)
    else:
        print("All files pass node --check.")

    print("\n--- Ranking regression tests ---")
    test_problems = run_ranking_tests()
    if test_problems:
        for p in test_problems:
            print(p)
    else:
        print("test_ranking.js passes.")

    if all_errors:
        print(f"\n{len(all_errors)} hunk(s) could not be applied automatically:")
        for e in all_errors:
            print(f"  {e}")
        print("\nThese need manual review — the affected files are PARTIALLY patched.")
        print("Baseline was NOT updated. Fix the flagged spots by hand, then re-run.")
        sys.exit(2)

    if marker_problems or syntax_problems or test_problems:
        print("\nHunks applied but verification found problems above.")
        print("Baseline was NOT updated — investigate before shipping.")
        sys.exit(3)

    # Only advance the baseline once everything is clean, so a failed run
    # can be corrected and re-attempted from the same starting point.
    if bump_version and (dc_changed or mechanics_changed):
        bump_all_versions()
    # Baseline must reflect the FINAL on-disk state, including any version
    # bump above — capturing it beforehand would make the bump text itself
    # look like a spurious 1-line "change" on every subsequent run, forever.
    write(baseline_dc, read(DC_HTML))
    write(baseline_mechanics, read(MECHANICS_JS))
    print("\nAll files propagated and verified successfully. Baseline updated.")


def cmd_verify():
    baseline_dc = os.path.join(BASELINE_DIR, 'dc.html')
    if not os.path.exists(baseline_dc):
        print("No baseline to diff against — nothing to verify against a prior state.")
        print("Running syntax + regression checks only.\n")
        problems = verify_syntax()
        print("All files pass node --check." if not problems else '\n'.join(problems))
        test_problems = run_ranking_tests()
        print("test_ranking.js passes." if not test_problems else '\n'.join(test_problems))
        return
    old_text = read(baseline_dc)
    new_text = read(DC_HTML)
    hunks = compute_hunks(old_text, new_text)
    print("--- Marker verification ---")
    marker_problems = verify_markers(hunks, old_text)
    print("All markers match." if not marker_problems else '\n'.join(marker_problems))
    print("\n--- Syntax verification ---")
    syntax_problems = verify_syntax()
    print("All files pass node --check." if not syntax_problems else '\n'.join(syntax_problems))
    print("\n--- Ranking regression tests ---")
    test_problems = run_ranking_tests()
    print("test_ranking.js passes." if not test_problems else '\n'.join(test_problems))


def bump_all_versions():
    dc = read(DC_HTML)
    m = re.search(r'v(\d+)\.(\d+)', dc)
    if not m:
        print("Could not find a vXX.YY version tag to bump — skipping.")
        return
    major, minor = int(m.group(1)), int(m.group(2))
    old_tag = f"v{major}.{minor}"
    new_tag = f"v{major}.{minor + 1}"
    for path in [DC_HTML, STANDALONE_HTML] + BUNDLE_FILES:
        t = read(path)
        n = t.count(old_tag)
        write(path, t.replace(old_tag, new_tag))
        print(f"  {os.path.basename(path)}: {old_tag} -> {new_tag} ({n} occurrence(s))")

    if os.path.exists(SW_JS):
        sw = read(SW_JS)
        cm = re.search(r"scout-v(\d+)", sw)
        if cm:
            old_cache = f"scout-v{cm.group(1)}"
            new_cache = f"scout-v{int(cm.group(1)) + 1}"
            write(SW_JS, sw.replace(old_cache, new_cache))
            print(f"  sw.js: {old_cache} -> {new_cache}")
    print(f"\nVersion bumped: {old_tag} -> {new_tag}")


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in ('snapshot', 'apply', 'verify'):
        print(__doc__)
        sys.exit(1)
    cmd = sys.argv[1]
    if cmd == 'snapshot':
        cmd_snapshot()
    elif cmd == 'apply':
        cmd_apply()
    elif cmd == 'verify':
        cmd_verify()


if __name__ == '__main__':
    main()
