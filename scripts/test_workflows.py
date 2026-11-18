#!/usr/bin/env python3
"""Static checks on .github/workflows/*.yml (no network, no YAML library needed).

Fails on: a workflow with no permissions block; a top-level write permission; pull_request_target or workflow_run;
an untrusted expression (inputs.*, github.event.*, github.head_ref, step outputs) inside a run: block (it must go through env: and be
used as a quoted shell variable); a pull_request workflow that reads a secret other than GITHUB_TOKEN.
"""
import glob, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UNTRUSTED = re.compile(r'\$\{\{\s*(inputs\.|github\.event|github\.head_ref|steps\.[\w-]+\.outputs)')
fail = 0


def bad(f, msg):
    global fail
    fail += 1
    print('FAIL %s: %s' % (os.path.basename(f), msg))


def run_blocks(lines):
    """Yield (line number, text) of every line that belongs to a run: step (inline or block)."""
    i = 0
    while i < len(lines):
        m = re.match(r'^(\s*)(?:- )?run:\s*(.*)$', lines[i])
        if not m:
            i += 1
            continue
        indent, rest = len(m.group(1)), m.group(2)
        if rest and rest not in ('|', '>', '|-', '>-', '|+', '>+'):
            yield i + 1, rest
            i += 1
            continue
        i += 1
        while i < len(lines) and (not lines[i].strip() or len(lines[i]) - len(lines[i].lstrip()) > indent):
            yield i + 1, lines[i]
            i += 1


def check(f):
    text = open(f, encoding='utf-8', newline='').read().replace('\r\n', '\n')
    lines = text.split('\n')
    code = '\n'.join(l for l in lines if not l.lstrip().startswith('#'))
    if re.search(r'^\s*pull_request_target\b', code, re.M):
        bad(f, 'uses pull_request_target')
    if re.search(r'^\s*workflow_run\b', code, re.M):
        bad(f, 'uses workflow_run')
    top = re.search(r'^permissions:\s*(.*)$', code, re.M)
    jobs = code.split('\njobs:', 1)[-1]
    job_names = re.findall(r'^  ([\w-]+):\s*$', jobs, re.M)
    job_perm = len(re.findall(r'^    permissions:', jobs, re.M))
    if not top and job_perm < len(job_names):
        bad(f, 'no permissions block (top level or on every job)')
    if top:
        block = re.search(r'^permissions:[^\n]*\n((?:[ \t]+[^\n]*\n)*)', code + '\n', re.M)
        body = (top.group(1) + '\n' + (block.group(1) if block else ''))
        if re.search(r'write', body) or re.search(r'write-all', body):
            bad(f, 'top-level permissions grant write; give write only to the job that commits')
    for n, l in run_blocks(lines):
        if l.lstrip().startswith('#'):
            continue
        if UNTRUSTED.search(l):
            bad(f, 'line %d puts an untrusted expression in a run block (move it to env:): %s' % (n, l.strip()[:90]))
    if re.search(r'^\s*pull_request\b', code, re.M):
        extra = [s for s in re.findall(r'secrets\.(\w+)', code) if s != 'GITHUB_TOKEN']
        if extra:
            bad(f, 'a pull_request workflow reads secrets: ' + ', '.join(sorted(set(extra))))


def selftest():
    """The checker itself must catch the three things it exists for."""
    import tempfile
    cases = {
        'inputs in run': 'name: x\non: workflow_dispatch\npermissions:\n  contents: read\njobs:\n  a:\n    steps:\n      - run: |\n          echo "${{ inputs.x }}"\n',
        'no permissions': 'name: x\non: push\njobs:\n  a:\n    steps:\n      - run: echo hi\n',
        'pull_request_target': 'name: x\non:\n  pull_request_target:\npermissions:\n  contents: read\njobs:\n  a:\n    steps:\n      - run: echo hi\n',
    }
    for name, body in cases.items():
        global fail
        before = fail
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, 'w.yml')
            open(p, 'w').write(body)
            import io, contextlib
            with contextlib.redirect_stdout(io.StringIO()):
                check(p)
        caught = fail > before
        fail = before
        if not caught:
            bad('selftest', 'the checker did not catch: ' + name)


files = sorted(glob.glob(os.path.join(ROOT, '.github', 'workflows', '*.yml')))
if not files:
    bad('workflows', 'no workflow files found')
for f in files:
    check(f)
selftest()


def qa_gates_suite_d(text):
    """qa.yml must run suite d in a step that is not continue-on-error (the SYNC, STANDIN and DATA tests live there)."""
    steps = re.split(r'\n      - ', text)
    return any(re.search(r'qa_run\.js[^\n]*\bd\b', st) and 'continue-on-error' not in st and 'QA_ONLY' not in st for st in steps)


qa = os.path.join(ROOT, '.github', 'workflows', 'qa.yml')
if os.path.exists(qa) and not qa_gates_suite_d(open(qa, encoding='utf-8').read()):
    bad(qa, 'suite d (SYNC, STANDIN, DATA tests) is not run in a gating step')
if qa_gates_suite_d('jobs:\n  a:\n    steps:\n      - name: x\n        continue-on-error: true\n        run: node scripts/qa/qa_run.js d\n'):
    bad('selftest', 'the suite-d check accepted a continue-on-error step')
print('%d failed (%d workflows)' % (fail, len(files)))
sys.exit(1 if fail else 0)
