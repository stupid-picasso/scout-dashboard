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
pokemon-mechanics.js is re-embedded by propagate_edits.py's helper, and index.html is derived by build_index.js.
This replaces patching the bundles hunk by hunk (propagate_edits.py), which let them drift from the source.
"""
import json, os, re, subprocess, sys, html as _html, importlib.util

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location('pe', os.path.join(REPO, 'scripts', 'propagate_edits.py'))
pe = importlib.util.module_from_spec(spec); spec.loader.exec_module(pe)

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


def main():
    check = '--check' in sys.argv
    if '--bump' in sys.argv and not check:
        pe.bump_all_versions()
    dc = pe.read(pe.DC_HTML)
    outs = [(pe.BUNDLE_HTML, build_bundle_text(dc, pe.read(pe.BUNDLE_HTML))), (pe.STANDALONE_HTML, build_standalone_text(dc, pe.read(pe.STANDALONE_HTML)))]
    bad = 0
    for path, text in outs:
        if check:
            if pe.read(path) != text: print('out of date:', os.path.basename(path)); bad += 1
        else:
            pe.write(path, text); print('wrote', os.path.basename(path), len(text), 'bytes')
    if not check:
        errs = pe.sync_embedded_mechanics(fix=True)
        for e in errs: print(e); bad += 1
        r = subprocess.run(['node', os.path.join(REPO, 'scripts', 'build_index.js')], capture_output=True, text=True); print(r.stdout.strip() or r.stderr.strip())
        for p in pe.verify_syntax(): print(p); bad += 1
    else:
        r = subprocess.run(['node', os.path.join(REPO, 'scripts', 'build_index.js'), '--check'], capture_output=True, text=True); print((r.stdout + r.stderr).strip()); bad += r.returncode != 0
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
