#!/usr/bin/env python3
"""Static checks on the data-writing workflows (no network, no YAML library). Each one pins a bug that only showed on the runner:

  H17  update-pokemon-data.yml must rebuild the bundles (build_bundles.py --bump) wherever it commits pokemon-mechanics.js.
  H18  every file a workflow `git add`s or hands to ci_push.sh by literal path must not be git-ignored (that add fails).
  H19  the outputs update_pokemon_data.py writes are the ones the workflow reads, and base-stat fixes and table refreshes are
       counted separately.
  H24  every workflow that pushes generated data does it through scripts/ci_push.sh (no private push loops), and that
       helper's exit status reaches the step (nothing after it swallows a failure).
  H25  every scripts/test_* file is run by test.yml (or is on the explicit excluded list below, with a reason).
"""
import glob, os, re, shlex, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'scripts'))
WF = os.path.join(ROOT, '.github', 'workflows')
fails = []


def check(name, ok, detail=''):
    print(('ok   ' if ok else 'FAIL ') + name + ('' if ok else '  ' + str(detail)[:300]))
    if not ok:
        fails.append(name)


def wf(name):
    return open(os.path.join(WF, name), encoding='utf-8').read()


def code(text):
    return '\n'.join(l for l in text.split('\n') if not l.lstrip().startswith('#'))


# ---- H24: one push helper -------------------------------------------------------------------------------------------
PUSHERS = ['extract-run.yml', 'extract-auto.yml', 'update-events-gbl.yml', 'update-pokemon-data.yml', 'benchmark-models.yml']
for name in PUSHERS:
    t = code(wf(name))
    check('H24 %s commits through scripts/ci_push.sh' % name, 'scripts/ci_push.sh' in t)
    # a bare `git push` / `git pull --rebase` outside the helper is a private push loop; the PR branch push (origin "$BRANCH") is not
    own = [l.strip() for l in t.split('\n') if re.search(r'\bgit (push\b(?! origin "\$BRANCH")|pull\b)', l)]
    check('H24 %s has no private push or pull loop' % name, not own, own)
    check('H24 %s does not mask a failure after the helper' % name, not re.search(r'ci_push\.sh[^\n]*(\|\||;\s*true)', t))

# ---- H23: extract.yml and extract-iv.yml are thin callers of one reusable workflow, with the trigger surface the app and the owner use
dc = open(os.path.join(ROOT, 'Scout Dashboard.dc.html'), encoding='utf-8').read()
app_files = re.search(r"workflowFile = isAppraisal \? '([\w.-]+)' : '([\w.-]+)'", dc)
app_inputs = re.search(r"inputs: \{([^}]*)\}", dc[dc.index('runGithubWorkflow'):])
check('H23 the app dispatches the two caller files by name', app_files and sorted(app_files.groups()) == ['extract-iv.yml', 'extract.yml'], app_files and app_files.groups())
sent = sorted(re.findall(r'(\w+):', app_inputs.group(1))) if app_inputs else []
callee = wf('extract-run.yml')
callee_inputs = re.search(r'workflow_call:\n    inputs:\n(.*?)\n    secrets:', callee, re.S).group(1)
callee_names = set(re.findall(r'^      (\w+):\s*$', callee_inputs, re.M))
for name, mode, folder in (('extract.yml', 'detail', 'videos'), ('extract-iv.yml', 'appraisal', 'appraisal_videos')):
    t = wf(name)
    dispatch = re.search(r'workflow_dispatch:\n    inputs:\n(.*?)\n\npermissions:', t, re.S)
    declared = set(re.findall(r'^      (\w+):\s*$', dispatch.group(1), re.M)) if dispatch else set()
    check('H23 %s calls the reusable workflow with mode %s' % (name, mode), re.search(r'uses: \./\.github/workflows/extract-run\.yml', t) and re.search(r'mode: %s\s*$' % mode, t, re.M))
    check('H23 %s keeps every dispatch input the app sends (%s)' % (name, ', '.join(sent)), set(sent) <= declared and declared == {'drive_link', 'fresh_import', 'fps', 'scene_detect', 'scene_threshold'}, declared)
    check('H23 %s still triggers on pushes to %s/' % (name, folder), "'%s/*.mp4'" % folder in t and "'%s/*.mov'" % folder in t)
    check('H23 %s declares the shared concurrency group, the reusable one does not' % name, 'group: pogo-data-commit' in t and 'concurrency' not in code(callee))
    check('H23 %s grants the job write access and no wider' % name, re.search(r'    permissions:\n      contents: write[^\n]*\n    uses:', t) and 'pull-requests' not in t)
    passed = set(re.findall(r'^      (\w+): \$\{\{', t.split('with:')[1].split('secrets:')[0], re.M))
    check('H23 %s passes only inputs the reusable workflow declares, and the two Gemini secrets' % name, passed <= callee_names and 'GEMINI_API_KEY_ONE: ${{ secrets.GEMINI_API_KEY_ONE }}' in t and 'GEMINI_API_KEY_TWO: ${{ secrets.GEMINI_API_KEY_TWO }}' in t, passed - callee_names)
check('H23 the reusable workflow rejects an unknown mode', 'unknown extract mode' in callee)
check('H24 extract-auto no longer ends a failed push with exit 0', 'for i in 1 2 3 4 5' not in wf('extract-auto.yml'))

# ---- H17: bundles rebuilt with the mechanics file --------------------------------------------------------------------
t = wf('update-pokemon-data.yml')
sh = open(os.path.join(ROOT, 'scripts', 'refresh_pokemon_data.sh'), encoding='utf-8').read()
check('H17 the refresh step runs build_bundles.py --bump when pokemon-mechanics.js changed',
      'update_pokemon_data.py' in sh and 'build_bundles.py --bump' in sh and 'git diff --quiet -- pokemon-mechanics.js' in sh)
check('H17 the workflow runs the refresh through that script', 'scripts/refresh_pokemon_data.sh' in t)
check('H17 the bundle builder has its dependency (terser) installed', 'npm install --no-save terser' in t)
import build_bundles
BUNDLE_FILES = sorted(os.path.relpath(f, ROOT) for f in build_bundles.BUMP_OUTPUTS)
check('H17 the bump outputs are the five files a bump rewrites', len(BUNDLE_FILES) == 5 and all(os.path.exists(os.path.join(ROOT, f)) for f in BUNDLE_FILES), BUNDLE_FILES)
for f in ('scripts/ci_push.sh', 'scripts/refresh_pokemon_data.sh'):
    check('%s is executable (workflows run it directly)' % f, os.access(os.path.join(ROOT, f), os.X_OK))
    check('%s is tracked as mode 100755' % f, subprocess.run(['git', 'ls-files', '-s', f], cwd=ROOT, capture_output=True, text=True).stdout.startswith('100755'))
direct = re.search(r'name: Commit and push[^\n]*\n(.*?)\n      - name:', t, re.S)
pr = re.search(r'name: Open PR[^\n]*\n(.*)', t, re.S)
for label, block in (('direct commit', direct), ('PR path', pr)):
    body = block.group(1) if block else ''
    check('H17 the %s stages pokemon-mechanics.js together with every bundle file' % label,
          'pokemon-mechanics.js' in body and all(f in body for f in BUNDLE_FILES), label)
check('H17 the direct commit re-runs the refresh on the latest main if the push is rejected', '--regen scripts/refresh_pokemon_data.sh' in t)

# ---- H18: no add of an ignored file ----------------------------------------------------------------------------------
def literal_paths(text):
    """Paths named in `git add ...` (without -f) and in ci_push.sh calls, with the shell words that are not literal paths dropped."""
    out = []
    for m in re.finditer(r'git add ([^\n]*)', code(text)):
        words = shlex.split(m.group(1).replace('\\', ' '), posix=True)
        if any(w in ('-f', '--force') for w in words):
            continue
        out += [w for w in words if not w.startswith('-')]
    for m in re.finditer(r'ci_push\.sh([^\n]*(?:\\\n[^\n]*)*)', code(text)):
        words = shlex.split(m.group(1).replace('\\\n', ' ').replace('\\', ' '), posix=True)
        if words and words[0] == '--regen':
            words = words[2:]
        out += words[1:]  # words[0] is the commit message
    return [w for w in out if '/' in w or w.endswith(('.json', '.js', '.html', '.md', '.txt'))]


def ignored(path):
    r = subprocess.run(['git', 'check-ignore', '-q', '--no-index', path], cwd=ROOT)
    return r.returncode == 0


seen = 0
for f in sorted(glob.glob(os.path.join(WF, '*.yml'))):
    for p in literal_paths(open(f, encoding='utf-8').read()):
        if p.startswith('$') or '$' in p:
            continue
        seen += 1
        # a directory is added with its ignored children skipped; only a named file that is ignored makes `git add` fail
        if p.endswith('/'):
            continue
        check('H18 %s: %s is not git-ignored' % (os.path.basename(f), p), not ignored(p))
check('H18 the scan found the benchmark and new-Pokemon files', seen >= 8, seen)
for p in ('data/benchmark_models.json', 'data/new_pokemon.json'):
    check('H18 %s is allow-listed in .gitignore' % p, not ignored(p))
check('H18 the allow-list does not un-ignore every data json', ignored('data/some_random_dump.json'))

# ---- H19: output names -----------------------------------------------------------------------------------------------
import update_pokemon_data as u

with tempfile.TemporaryDirectory() as d:
    mech = os.path.join(d, 'pokemon-mechanics.js')
    out = os.path.join(d, 'out.txt')
    src = open(os.path.join(ROOT, 'pokemon-mechanics.js'), encoding='utf-8').read()
    open(mech, 'w', encoding='utf-8', newline='\n').write(src)
    saved = (u.MECH_PATH, u.build_authoritative, u.build_cpm_block, u.build_powerup_block)
    try:
        u.MECH_PATH = mech
        _, base_stats, dex_names, _ = u.load_current()
        dex = sorted(base_stats)[0]
        wrong = [base_stats[dex][0] + 1, base_stats[dex][1], base_stats[dex][2]]
        u.build_authoritative = lambda: {dex: (dex_names[dex], wrong)}
        u.build_cpm_block = lambda: ('const CPM = {\n  1: 0.094\n};', 1)
        u.build_powerup_block = lambda: (u.POWERUP_START_MARKER + '\nconst _POWERUP_RUNS = [[1, 1, 1, 0]];\n' + u.POWERUP_END_MARKER, 1)
        os.environ['GITHUB_OUTPUT'] = out
        import io, contextlib
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            u.main()
    finally:
        u.MECH_PATH, u.build_authoritative, u.build_cpm_block, u.build_powerup_block = saved
        os.environ.pop('GITHUB_OUTPUT', None)
    written = dict(l.split('=', 1) for l in open(out).read().split())
    check('H19 one base-stat fix and two table refreshes are counted apart', written.get('base_stat_fixes') == '1' and written.get('table_fixes') == '2' and written.get('new_pokemon') == '0', written)
    check('H19 the old mixed output name is gone', 'stat_fixes' not in written, written)
read = set(re.findall(r'steps\.refresh\.outputs\.(\w+)', wf('update-pokemon-data.yml')))
check('H19 every output the workflow reads is one the script writes', read and read <= {'base_stat_fixes', 'table_fixes', 'new_pokemon'}, read)

# ---- H25: every test file is run in CI -------------------------------------------------------------------------------
EXCLUDED_FROM_TEST_YML = {
    'test_csp.js': 'needs Chromium and WebKit; run by qa.yml (checked below)',
}
test_yml = wf('test.yml')
for f in sorted(glob.glob(os.path.join(ROOT, 'scripts', 'test_*'))):
    b = os.path.basename(f)
    if b in EXCLUDED_FROM_TEST_YML:
        check('H25 %s is excluded from test.yml and run by qa.yml' % b, b in wf('qa.yml'))
    else:
        check('H25 %s is run by test.yml' % b, re.search(r'(?<![\w.])' + re.escape(b) + r'(?!\w)', code(test_yml)) is not None)

print('%d failed' % len(fails))
sys.exit(1 if fails else 0)
