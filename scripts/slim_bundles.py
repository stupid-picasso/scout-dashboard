#!/usr/bin/env python3
"""Shrinks the two offline bundles (index.html, Scout Dashboard.html) and fixes their <helmet>.

Run after `propagate_edits.py apply`; idempotent. What it does:
  1. Drops the Devanagari Poppins @font-face blocks and their embedded woff2 files. The app is
     English only, and those five files were ~240 KB of the download.
  2. Replaces the embedded apple-touch-icon with the current icons/apple-touch-icon.png (180 px).
  3. Makes the <helmet> head tags match the source: <html lang>, one theme-color, one apple-touch-icon,
     the page title, and the iPhone startup (splash) images.
"""
import base64, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUNDLES = ['Scout Dashboard.html']  # index.html is derived from it (scripts/build_index.js)
SPLASH = [  # (css width, css height, pixel ratio, file)
    (440, 956, 3, 'icons/splash/1320x2868.png'), (402, 874, 3, 'icons/splash/1206x2622.png'),
    (430, 932, 3, 'icons/splash/1290x2796.png'), (393, 852, 3, 'icons/splash/1179x2556.png'),
    (428, 926, 3, 'icons/splash/1284x2778.png'), (390, 844, 3, 'icons/splash/1170x2532.png'),
    (375, 812, 3, 'icons/splash/1125x2436.png'), (414, 896, 3, 'icons/splash/1242x2688.png'),
    (414, 896, 2, 'icons/splash/828x1792.png'), (375, 667, 2, 'icons/splash/750x1334.png')]
THEME = '#000000'


def splash_links():
    return ''.join('<link rel="apple-touch-startup-image" media="(device-width: %dpx) and (device-height: %dpx) and (-webkit-device-pixel-ratio: %d) and (orientation: portrait)" href="%s">\n' % (w, h, r, f) for w, h, r, f in SPLASH)


def slim(path):
    src = open(path, encoding='utf-8').read()
    ms = src.find('<script type="__bundler/manifest">'); ms = src.find('>', ms) + 1; me = src.find('</script>', ms)
    ts = src.find('<script type="__bundler/template">'); ts = src.find('>', ts) + 1; te = src.find('</script>', ts)
    manifest = json.loads(src[ms:me]); tpl = json.loads(src[ts:te])
    notes = []
    # 1. Devanagari fonts
    drop = []
    def kill(m):
        u = re.search(r'url\("([^"]+)"\)', m.group(0))
        if u: drop.append(u.group(1))
        return ''
    tpl = re.sub(r'/\* devanagari \*/\s*@font-face \{[^}]*\}\s*', kill, tpl)
    # Poppins Italic is never used by the app (no italic styles or <em>), so its files are dead weight too.
    tpl = re.sub(r'/\* [\w-]+ \*/\s*@font-face \{[^}]*font-style: italic;[^}]*\}\s*', kill, tpl)
    for u in drop:
        if u in manifest and u not in tpl: del manifest[u]
    if drop: notes.append('dropped %d unused font files' % len(drop))
    # 2. apple-touch-icon
    m = re.search(r'<link rel="apple-touch-icon" href="([0-9a-f-]{36})">', tpl)
    if m and m.group(1) in manifest:
        data = base64.b64encode(open(os.path.join(ROOT, 'icons/apple-touch-icon.png'), 'rb').read()).decode()
        if manifest[m.group(1)]['data'] != data:
            manifest[m.group(1)]['data'] = data; notes.append('refreshed apple-touch-icon')
    # 3. helmet tags
    h0 = tpl.find('<helmet>'); h1 = tpl.find('</helmet>')
    head = tpl[h0:h1]
    head = re.sub(r'<meta name="theme-color" content="[^"]*">\s*', '', head)
    head = re.sub(r'<link rel="apple-touch-startup-image"[^>]*>\s*', '', head)
    first_icon = head.find('<link rel="apple-touch-icon"')
    # keep only the first apple-touch-icon
    rest = re.sub(r'<link rel="apple-touch-icon"[^>]*>\s*', '', head[first_icon + 10:]) if first_icon >= 0 else ''
    head = head[:first_icon + 10] + rest if first_icon >= 0 else head
    head = head.replace('<link rel="manifest" href="./manifest.json">', '<link rel="manifest" href="./manifest.json">\n<meta name="theme-color" content="%s">\n%s' % (THEME, splash_links()), 1)
    if '<title>Professor</title>' not in head:
        head = head.replace('<helmet>\n', '<helmet>\n<title>Professor</title>\n', 1)
    new_tpl = tpl[:h0] + head + tpl[h1:]
    new_tpl = re.sub(r'<html(?![^>]*\blang=)([^>]*)>', r'<html lang="en"\1>', new_tpl, count=1)
    if new_tpl != tpl: notes.append('helmet normalised')
    def esc(v):
        return re.sub(r'</([sS][cC][rR][iI][pP][tT])', r'<\\u002F\1', json.dumps(v))
    out = src[:ms] + '\n' + json.dumps(manifest) + '\n' + src[me:ts] + '\n' + esc(new_tpl) + '\n' + src[te:]
    open(path, 'w', encoding='utf-8').write(out)
    return notes


if __name__ == '__main__':
    for b in BUNDLES:
        print(b, '-', '; '.join(slim(os.path.join(ROOT, b))) or 'already slim')
