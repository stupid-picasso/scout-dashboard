#!/usr/bin/env python3
"""scripts/ci_push.sh against real local git repositories (a bare "origin" and clones). It must: push a clean change; survive another
clone pushing first (re-apply this run's files onto the new main instead of rebasing, keeping the other push's files); re-apply a
deletion; re-run a --regen command on the fresh checkout; and, when the push keeps being rejected, exit NON-ZERO after exactly the
configured number of attempts (the old extract-auto loop ended with exit 0 after five failures)."""
import os, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HELPER = os.path.join(ROOT, 'scripts', 'ci_push.sh')
ENV = dict(os.environ, GIT_AUTHOR_NAME='t', GIT_AUTHOR_EMAIL='t@example.invalid', GIT_COMMITTER_NAME='t',
           GIT_COMMITTER_EMAIL='t@example.invalid', CI_PUSH_SLEEP='0', GIT_CONFIG_GLOBAL=os.devnull, GIT_CONFIG_SYSTEM=os.devnull)
fails = []


def check(name, ok, detail=''):
    print(('ok   ' if ok else 'FAIL ') + name + ('' if ok else '  ' + str(detail)[:400]))
    if not ok:
        fails.append(name)


def git(cwd, *a):
    return subprocess.run(['git'] + list(a), cwd=cwd, env=ENV, capture_output=True, text=True, check=True).stdout


def write(cwd, rel, text):
    p = os.path.join(cwd, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, 'w').write(text)


def read(cwd, rel):
    p = os.path.join(cwd, rel)
    return open(p).read() if os.path.exists(p) else None


def push(cwd, *args, **env):
    e = dict(ENV, CI_PUSH_BRANCH='main', **env)
    return subprocess.run(['bash', HELPER] + list(args), cwd=cwd, env=e, capture_output=True, text=True)


def world(d):
    origin = os.path.join(d, 'origin.git')
    subprocess.run(['git', 'init', '-q', '--bare', '-b', 'main', origin], env=ENV, check=True)
    seed = os.path.join(d, 'seed')
    git(d, 'clone', '-q', origin, seed)
    git(seed, 'checkout', '-q', '-b', 'main')
    write(seed, 'data/a.json', 'a0\n')
    write(seed, 'data/gone.json', 'x\n')
    write(seed, '.gitignore', 'data/*.json\n!data/a.json\n!data/gone.json\n!data/b.json\n!data/other.json\n')
    git(seed, 'add', '-A')
    git(seed, 'commit', '-q', '-m', 'seed')
    git(seed, 'push', '-q', 'origin', 'main')
    return origin


def clone(d, origin, name):
    c = os.path.join(d, name)
    git(d, 'clone', '-q', '-b', 'main', origin, c)
    return c


with tempfile.TemporaryDirectory() as d:
    origin = world(d)

    # 1. clean push
    c1 = clone(d, origin, 'c1')
    write(c1, 'data/a.json', 'a1\n')
    r = push(c1, 'msg one', 'data/')
    check('a clean change is pushed', r.returncode == 0 and read(clone(d, origin, 'v1'), 'data/a.json') == 'a1\n', r.stdout + r.stderr)

    # 2. nothing to commit is success
    r = push(c1, 'msg none', 'data/')
    check('no change is a successful no-op', r.returncode == 0 and 'nothing to commit' in r.stdout, r.stdout + r.stderr)

    # 3. another clone pushed first: same file differs AND a different file was added there
    c2 = clone(d, origin, 'c2')
    c3 = clone(d, origin, 'c3')
    write(c3, 'data/a.json', 'a-from-other\n')
    write(c3, 'data/other.json', 'other\n')
    git(c3, 'add', '-A'); git(c3, 'commit', '-q', '-m', 'other'); git(c3, 'push', '-q', 'origin', 'main')
    write(c2, 'data/a.json', 'a-from-c2\n')
    write(c2, 'data/b.json', 'b\n')
    os.remove(os.path.join(c2, 'data', 'gone.json'))
    r = push(c2, 'msg race', 'data/')
    v = clone(d, origin, 'v2')
    check('a lost race is retried and succeeds', r.returncode == 0 and 'attempt 2' in r.stdout, r.stdout + r.stderr)
    check('the retried push keeps this run\'s generated files over the older remote copy', read(v, 'data/a.json') == 'a-from-c2\n' and read(v, 'data/b.json') == 'b\n')
    check('the retried push keeps files the other push added', read(v, 'data/other.json') == 'other\n')
    check('the retried push re-applies this run\'s deletion', read(v, 'data/gone.json') is None)

    # 4. --regen re-runs on the fresh checkout, so it builds on what the other push left
    c4 = clone(d, origin, 'c4')
    c5 = clone(d, origin, 'c5')
    write(c5, 'data/other.json', 'other2\n')
    git(c5, 'add', '-A'); git(c5, 'commit', '-q', '-m', 'bump other'); git(c5, 'push', '-q', 'origin', 'main')
    write(c4, 'data/a.json', 'stale-a\n')
    r = push(c4, '--regen', 'echo regenerated-on-$(cat data/other.json) > data/a.json', 'msg regen', 'data/a.json')
    v = clone(d, origin, 'v3')
    check('--regen output is built on the latest remote', r.returncode == 0 and read(v, 'data/a.json') == 'regenerated-on-other2\n', r.stdout + r.stderr + str(read(v, 'data/a.json')))

# 5. permanent rejection: a pre-receive hook refuses every push. Must fail non-zero after exactly N attempts.
with tempfile.TemporaryDirectory() as d:
    origin = world(d)
    hook = os.path.join(origin, 'hooks', 'pre-receive')
    open(hook, 'w').write('#!/bin/sh\necho x >> "%s/rejections"\necho rejected >&2\nexit 1\n' % d)
    os.chmod(hook, 0o755)
    c = clone(d, origin, 'c')
    write(c, 'data/a.json', 'new\n')
    r = push(c, 'msg doomed', 'data/', CI_PUSH_ATTEMPTS='3')
    n = len(open(os.path.join(d, 'rejections')).read().split())
    check('a push that is always rejected exits non-zero', r.returncode != 0, r.returncode)
    check('it tried exactly the configured number of times', n == 3, n)
    check('the failure is announced as a workflow error', '::error::' in r.stdout, r.stdout)

# 6. bad usage
r = subprocess.run(['bash', HELPER], capture_output=True, text=True, env=ENV)
check('no arguments is a usage error', r.returncode == 2)

print('%d failed' % len(fails))
sys.exit(1 if fails else 0)
