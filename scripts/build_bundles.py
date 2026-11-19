#!/usr/bin/env python3
"""
build_bundles.py - generate the deployed bundles from the single source, `Scout Dashboard.dc.html`.

  python3 scripts/build_bundles.py            write Scout Dashboard Standalone.dc.html, Scout Dashboard.html and index.html
  python3 scripts/build_bundles.py --check    exit 1 if any of them is not what this would write
  python3 scripts/build_bundles.py --bump     bump the version tag (vNN.MM) and sw.js cache name first

How it works. The dashboard's own <style> block is byte-identical in the source and in the bundle, and everything after
</helmet> is the same markup and class script apart from a few dialect rules (onClick -> sc-camel-on-click, <select> ->
<sc-raw-select>, character references stored as characters). So a bundle is: its own fixed head (design-system CSS and
resources, kept from the existing file) + the source's <style> block + the source's body with the dialect rules applied.
pokemon-mechanics.js is re-embedded into the bundle, and index.html is derived by build_index.js.
"""
import base64, gzip, json, os, re, subprocess, sys, html as _html

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DC_HTML = os.path.join(REPO, 'Scout Dashboard.dc.html')
STANDALONE_HTML = os.path.join(REPO, 'Scout Dashboard Standalone.dc.html')
BUNDLE_HTML = os.path.join(REPO, 'Scout Dashboard.html')
MECHANICS_JS = os.path.join(REPO, 'pokemon-mechanics.js')
SW_JS = os.path.join(REPO, 'sw.js')
BUNDLE_FILES = [BUNDLE_HTML]
INDEX_HTML = os.path.join(REPO, 'index.html')   # written by build_index.js
# Every tracked file a --bump run can change (the data-refresh workflows commit exactly these; scripts/test_workflow_data.py checks them).
BUMP_OUTPUTS = [DC_HTML, STANDALONE_HTML, BUNDLE_HTML, INDEX_HTML, SW_JS]

MARK = 'iOS design layer'
ENTITY = re.compile(r'&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]+);')
KEEP_ENT = ('lt', 'gt', 'amp', 'quot', 'apos', 'nbsp', '#160')


def dialect(t):
    """Source dialect -> bundle dialect."""
    t = ENTITY.sub(lambda m: m.group(0) if m.group(1).lower() in KEEP_ENT else _html.unescape(m.group(0)), t)
    t = re.sub(r'\bonClick=', 'sc-camel-on-click=', t)
    t = re.sub(r'\bonChange=', 'sc-camel-on-change=', t)
    t = re.sub(r'\bonKeyDown=', 'sc-camel-on-key-down=', t)
    t = re.sub(r'<select\b', '<sc-raw-select', t)
    t = t.replace('</select>', '</sc-raw-select>')
    t = re.sub(r'(<(?:input|img)\b[^>]*?)\s*/>', r'\1>', t)
    return t


def style_span(t):
    i = t.index(MARK); s0 = t.rfind('<style>', 0, i); e = t.index('</style>', i) + len('</style>')
    return s0, e


def new_template(dc, old_tpl):
    ds, de = style_span(dc); ts, te = style_span(old_tpl)
    head = old_tpl[:ts] + dc[ds:de] + old_tpl[te:old_tpl.index('</helmet>')]
    rest = dialect(dc[dc.index('</helmet>'):]).replace('<script type="text/x-dc" data-dc-script data-props=', '<script type="text/x-dc" data-dc-script="" data-props=', 1)
    return head + rest


def build_bundle_text(dc, bundle_src):
    st = bundle_src.find('<script type="__bundler/template">')
    a = bundle_src.find('>', st) + 1; b = bundle_src.find('</script>', a)
    old = json.loads(bundle_src[a:b])
    tpl = new_template(dc, old)
    raw = re.sub(r'</([sS][cC][rR][iI][pP][tT])', r'<\\u002F\1', json.dumps(tpl))
    assert json.loads(raw) == tpl
    return bundle_src[:a] + '\n' + raw + '\n' + bundle_src[b:]


def build_standalone_text(dc, old):
    """The standalone file is the source with its own head tweaks: keep its head, take the source's style block and body."""
    ds, de = style_span(dc); ts, te = style_span(old)
    return old[:ts] + dc[ds:de] + old[te:old.index('</helmet>')] + dc[dc.index('</helmet>'):]


def read(path):
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()


def write(path, text):
    with open(path, 'w', encoding='utf-8') as f:
        f.write(text)


def get_decoded_bundle(path):
    src = read(path)
    start = src.find('<script type="__bundler/template">')
    tag_end = src.find('>', start) + 1
    end = src.find('</script>', tag_end)
    return json.loads(src[tag_end:end])


def extract_class_body_js(text):
    m = re.search(r'class Component extends DCLogic \{.*?\n\}\n', text, re.S)
    if not m:
        return None
    return 'class Component {\n' + m.group(0).split('{', 1)[1]


def node_check(js_text, label):
    tmp = f'/tmp/_build_check_{abs(hash(label))}.js'
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


def sync_embedded_mechanics(fix=True):
    """Make sure each bundle embeds EXACTLY the current pokemon-mechanics.js.

    The baseline-diff re-embed above silently skips when the embedded copy has drifted
    from the baseline, which shipped stale mechanics in the bundles for several
    releases. This compares the embedded blob to the real file every time and (with
    fix=True) replaces it. Returns a list of problems left unfixed."""
    new = read(MECHANICS_JS)
    problems = []
    for path in BUNDLE_FILES:
        src = read(path)
        start = src.find('<script type="__bundler/manifest">')
        if start == -1:
            problems.append(f"[{os.path.basename(path)}] no manifest block found")
            continue
        tag_end = src.find('>', start) + 1
        end = src.find('</script>', tag_end)
        manifest = json.loads(src[tag_end:end])
        target = None
        for uuid, entry in manifest.items():
            if entry.get('mime') != 'application/javascript':
                continue
            try:
                dec = gzip.decompress(base64.b64decode(entry['data'])).decode('utf-8', 'ignore')
            except Exception:
                continue
            if 'window.PokemonMechanics = {' in dec:
                target = (uuid, dec)
                break
        if not target:
            problems.append(f"[{os.path.basename(path)}] embedded mechanics blob not found")
            continue
        if target[1] == new:
            continue
        if not fix:
            problems.append(f"[{os.path.basename(path)}] embedded mechanics is STALE (differs from pokemon-mechanics.js)")
            continue
        manifest[target[0]]['data'] = base64.b64encode(gzip.compress(new.encode('utf-8'), compresslevel=9)).decode('ascii')
        write(path, src[:tag_end] + "\n" + json.dumps(manifest) + "\n" + src[end:])
        print(f"  [{os.path.basename(path)}] embedded mechanics was stale; re-embedded ({len(target[1])} -> {len(new)} bytes)")
    return problems


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
    check = '--check' in sys.argv
    if '--bump' in sys.argv and not check:
        bump_all_versions()
    dc = read(DC_HTML)
    outs = [(BUNDLE_HTML, build_bundle_text(dc, read(BUNDLE_HTML))), (STANDALONE_HTML, build_standalone_text(dc, read(STANDALONE_HTML)))]
    bad = 0
    for path, text in outs:
        if check:
            if read(path) != text: print('out of date:', os.path.basename(path)); bad += 1
        else:
            write(path, text); print('wrote', os.path.basename(path), len(text), 'bytes')
    if not check:
        errs = sync_embedded_mechanics(fix=True)
        for e in errs: print(e); bad += 1
        r = subprocess.run(['node', os.path.join(REPO, 'scripts', 'build_index.js')], capture_output=True, text=True); print(r.stdout.strip() or r.stderr.strip())
        for p in verify_syntax(): print(p); bad += 1
    else:
        r = subprocess.run(['node', os.path.join(REPO, 'scripts', 'build_index.js'), '--check'], capture_output=True, text=True); print((r.stdout + r.stderr).strip()); bad += r.returncode != 0
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
