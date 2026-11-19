#!/usr/bin/env python3
"""scripts/gm_lib.py and the data scripts built on it.

  1. Golden: each converted script, run on a small saved game master / PvPoke fixture against a stub pokemon-mechanics.js (block present
     and block missing), prints and writes byte-for-byte what the script produced before gm_lib existed (scripts/fixtures/gm/golden.json,
     generated from the scripts at commit f0c5bd7 with scripts/fixtures/gm/harness.py).
  2. gm_lib itself: replace_block, fetch_json retry policy, game_master caching / local file.
  3. No script keeps its own game-master URL or block-replace regex.
"""
import glob, io, json, os, re, subprocess, sys, tempfile, urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPTS = os.path.join(ROOT, 'scripts')
sys.path.insert(0, SCRIPTS)
sys.path.insert(0, os.path.join(SCRIPTS, 'fixtures', 'gm'))
import gm_lib
import harness

fails = []


def check(name, ok, detail=''):
    print(('ok   ' if ok else 'FAIL ') + name + ('' if ok else '  ' + str(detail)[:300]))
    if not ok:
        fails.append(name)


# ---- 1. golden ------------------------------------------------------------------------------------------------------
golden = json.load(open(os.path.join(SCRIPTS, 'fixtures', 'gm', 'golden.json'), encoding='utf-8'))
got = harness.run_all(SCRIPTS)
check('golden: the same cases are covered', sorted(got) == sorted(golden), set(got) ^ set(golden))
for k in sorted(golden):
    r, g = got.get(k), golden[k]
    diff = [f for f in g if not r or r[f] != g[f]]
    check('golden: %s is byte-identical to the pre-gm_lib output' % k, not diff, diff)
# the cases that insert a missing block really did insert it (a golden of "nothing happened" would prove nothing)
for k, name in (('species_class:SPECIES_CLASS', 'SPECIES_CLASS'), ('size_data:SIZE_DATA', 'SIZE_DATA'), ('evolution_branches:EVOLUTION_BRANCHES', 'EVOLUTION_BRANCHES'),
                ('mega_levels:MEGA_LEVEL_DATA', 'MEGA_LEVEL_DATA'), ('pvp_tier_data:PVP_TIER', 'PVP_TIER'), ('pvpoke_gamemaster:PVPOKE_GM', 'PVPOKE_GM'),
                ('record_tier_trends:TIER_TRENDS', 'TIER_TRENDS')):
    check('golden: %s inserts the missing block' % k, ('GENERATED BLOCK: %s (' % name) in got[k]['mechanics'], k)
check('golden: mega_levels inserts the missing SPECIES_GM and SPECIES_FAMILY', all('GENERATED BLOCK: %s (' % n in got['mega_levels:SPECIES_GM+SPECIES_FAMILY']['mechanics'] for n in ('SPECIES_GM', 'SPECIES_FAMILY')))

# ---- 2. gm_lib ------------------------------------------------------------------------------------------------------
b = gm_lib.block_text('X', 'x.py', 'const X = 1;')
check('block_text writes the marker form the real file uses', b == '// GENERATED BLOCK: X (x.py) — do not hand-edit\nconst X = 1;\n// END GENERATED BLOCK: X', b)
base = 'A\n\n' + gm_lib.block_text('P', 'p.py', 'const P = 0;') + '\n\nanchor()\n'
nb = gm_lib.block_text('X', 'x.py', 'const X = 2;')
check('replace_block replaces the named block only', gm_lib.replace_block(base, 'P', gm_lib.block_text('P', 'p.py', 'const P = 9;')).count('const P = 9;') == 1 and 'const P = 0;' not in gm_lib.replace_block(base, 'P', gm_lib.block_text('P', 'p.py', 'const P = 9;')))
check('replace_block inserts after another block', gm_lib.replace_block(base, 'X', nb, after='P') == 'A\n\n' + gm_lib.block_text('P', 'p.py', 'const P = 0;') + '\n\n' + nb + '\n\nanchor()\n')
check('replace_block inserts before an anchor', gm_lib.replace_block(base, 'X', nb, before='anchor()') == base.replace('anchor()', nb + '\n\nanchor()'))
for label, kw in (('a missing after-block', dict(after='NOPE')), ('a missing anchor', dict(before='nope()')), ('no place to insert', {})):
    try:
        gm_lib.replace_block(base, 'X', nb, **kw)
        check('replace_block raises for ' + label, False, 'no error')
    except ValueError:
        check('replace_block raises for ' + label, True)
check('replace_block is idempotent', gm_lib.replace_block(gm_lib.replace_block(base, 'X', nb, after='P'), 'X', nb, after='P') == gm_lib.replace_block(base, 'X', nb, after='P'))
check('a replacement containing backslashes is written literally', '\\n\\1' in gm_lib.replace_block(base, 'P', gm_lib.block_text('P', 'p.py', 'const P = "\\n\\1";')))

mech = open(os.path.join(ROOT, 'pokemon-mechanics.js'), encoding='utf-8').read()
in_file = [n for n in gm_lib.block_names(mech) if n in gm_lib.BLOCK_ORDER]
check('BLOCK_ORDER is the order of the blocks in pokemon-mechanics.js', in_file == gm_lib.BLOCK_ORDER, in_file)
unlisted = [n for n in gm_lib.block_names(mech) if n not in gm_lib.BLOCK_ORDER and n != 'POWERUP_RUNS']
check('every generated block in pokemon-mechanics.js is on BLOCK_ORDER', not unlisted, unlisted)


class FakeResp(io.BytesIO):
    def __enter__(self): return self
    def __exit__(self, *a): return False


def with_urlopen(fn, body):
    import urllib.request
    real, calls = urllib.request.urlopen, []

    def fake(req, timeout=None):
        calls.append((getattr(req, 'full_url', req), dict(getattr(req, 'headers', {})), timeout))
        return fn(len(calls), req)
    urllib.request.urlopen = fake
    try:
        return body(), calls
    finally:
        urllib.request.urlopen = real


def flaky(n, req):
    if n < 3:
        raise OSError('reset')
    return FakeResp(b'{"ok": 1}')


(res, calls) = with_urlopen(flaky, lambda: gm_lib.fetch_json('https://example.invalid/a.json', timeout=7, retries=3, pause=0))
check('fetch_json retries a network failure and then succeeds', res == {'ok': 1} and len(calls) == 3, (res, len(calls)))
check('fetch_json sends one User-Agent and the timeout it was given', calls[0][1].get('User-agent') == gm_lib.USER_AGENT and calls[0][2] == 7, calls[0])


def always_fail(n, req):
    raise OSError('down %d' % n)


try:
    (_, calls) = with_urlopen(always_fail, lambda: gm_lib.fetch_json('https://example.invalid/b.json', retries=3, pause=0))
    check('fetch_json raises after the last retry', False, 'no error')
except OSError as e:
    check('fetch_json raises the last error after exactly `retries` tries', str(e) == 'down 3', str(e))


def not_found(n, req):
    raise urllib.error.HTTPError(getattr(req, 'full_url', req), 404, 'nf', {}, None)


cnt = []


def not_found_counted(n, req):
    cnt.append(1)
    return not_found(n, req)


try:
    with_urlopen(not_found_counted, lambda: gm_lib.fetch_json('https://example.invalid/c.json', retries=3, pause=0))
except urllib.error.HTTPError:
    pass
check('fetch_json does not retry a 404', len(cnt) == 1, len(cnt))


def serve_gm(n, req):
    return FakeResp(json.dumps([{'templateId': 'T%d' % n}]).encode())


gm_lib._GM.clear()
os.environ.pop(gm_lib.GAME_MASTER_ENV, None)
((a, b2), calls) = with_urlopen(serve_gm, lambda: (gm_lib.game_master(), gm_lib.game_master()))
check('game_master downloads once per process', a is b2 and len(calls) == 1 and calls[0][0] == gm_lib.GAME_MASTER_URL, len(calls))
with tempfile.TemporaryDirectory() as d:
    local = os.path.join(d, 'gm.json')
    json.dump([{'templateId': 'LOCAL'}], open(local, 'w'))
    gm_lib._GM.clear()
    (r1, calls) = with_urlopen(serve_gm, lambda: gm_lib.game_master(local))
    check('game_master reads a path argument without touching the network', r1 == [{'templateId': 'LOCAL'}] and not calls)
    gm_lib._GM.clear()
    os.environ[gm_lib.GAME_MASTER_ENV] = local
    (r2, calls) = with_urlopen(serve_gm, lambda: gm_lib.game_master())
    check('game_master honours $GAME_MASTER_FILE', r2 == [{'templateId': 'LOCAL'}] and not calls)
    gm_lib._GM.clear()
    cache = os.path.join(d, 'cache.json')
    os.environ[gm_lib.GAME_MASTER_ENV] = cache
    (r3, calls) = with_urlopen(serve_gm, lambda: gm_lib.game_master())
    check('$GAME_MASTER_FILE that does not exist yet receives the download', len(calls) == 1 and json.load(open(cache)) == r3, calls)
    gm_lib._GM.clear()
    (r4, calls) = with_urlopen(serve_gm, lambda: gm_lib.game_master())
    check('a second process reads that cache instead of downloading', r4 == r3 and not calls, calls)
os.environ.pop(gm_lib.GAME_MASTER_ENV, None)
gm_lib._GM.clear()

# ---- 3. no private copies -------------------------------------------------------------------------------------------
URL_ASSIGN = re.compile(r'''^\s*\w+\s*=\s*['"]https://raw\.githubusercontent\.com/PokeMiners''', re.M)
for f in sorted(glob.glob(os.path.join(SCRIPTS, '*.py'))):
    n = os.path.basename(f)
    if n in ('gm_lib.py', 'test_gm_lib.py'):
        continue
    t = open(f, encoding='utf-8').read()
    check('%s has no game-master URL of its own' % n, not URL_ASSIGN.search(t) and 'latest/latest.json"' not in t.replace('\n', ' ').split('"""')[-1])
    check('%s has no block-replace regex of its own' % n, 're.compile(r"// GENERATED BLOCK' not in t)

# ---- the shape guards still stop a game master that is too small -----------------------------------------------------
with tempfile.TemporaryDirectory() as d:
    open(os.path.join(d, 'pokemon-mechanics.js'), 'w').write(harness.stub())
    for script in ('import_species_class.py', 'import_size_data.py', 'import_evolution_branches.py'):
        r = subprocess.run([sys.executable, os.path.join(SCRIPTS, script), harness.GM_FILE], cwd=d, capture_output=True, text=True)
        check('%s refuses a game master with too few species' % script, r.returncode != 0 and 'keeping old data' in r.stderr and open(os.path.join(d, 'pokemon-mechanics.js')).read() == harness.stub(), r.stderr)

print('%d failed' % len(fails))
sys.exit(1 if fails else 0)
