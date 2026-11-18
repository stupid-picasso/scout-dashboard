#!/usr/bin/env node
// Builds the deployed index.html from the patched bundle `Scout Dashboard.html`.
//
// `Scout Dashboard.html` is what propagate_edits.py patches (its class script must stay
// byte-identical to the source so hunks keep applying). index.html is derived from it here:
// the app's class script (~650 KB with comments) is minified, which cuts ~80 KB of gzip
// transfer and a good share of parse time. Nothing else changes.
//
//   node scripts/build_index.js          write index.html
//   node scripts/build_index.js --check  exit 1 if index.html is not what this would write
const fs = require('fs'), path = require('path');
const { minify } = require('terser');
const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'Scout Dashboard.html'), OUT = path.join(ROOT, 'index.html');

// Content-Security-Policy for the deployed page, injected here (never hand-edited into index.html). GitHub Pages sends no
// headers, so it is a <meta> tag. 'unsafe-inline' and 'unsafe-eval' are required by the runtime (see SECURITY.md): this policy
// limits where code may load from and where data may be sent, it does not stop injected inline script.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://unpkg.com https://www.gstatic.com https://apis.google.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://raw.githubusercontent.com https://*.githubusercontent.com",
  "media-src 'self' blob:",
  "font-src 'self' data:",
  "connect-src 'self' blob: https://*.googleapis.com https://raw.githubusercontent.com https://api.github.com",
  "frame-src https://pokemon-professor.firebaseapp.com https://accounts.google.com https://apis.google.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'"
].join('; ');
const CSP_META = '<meta http-equiv="Content-Security-Policy" content="' + CSP + '">';

// The policy goes into every HTML page the site serves, not only the entry point: they share one origin (and its localStorage).
// Idempotent: an existing policy tag is replaced, so a changed CSP reaches every page.
const CSP_TAG = /\n?[ \t]*<meta http-equiv="Content-Security-Policy"[^>]*>/;
const withCsp = (html) => {
  const h = html.indexOf('<head>'); if (h < 0) throw new Error('no <head> to put the CSP in');
  html = html.replace(CSP_TAG, '');
  const c = html.indexOf('>', html.indexOf('<meta charset', h)) + 1;
  return html.slice(0, c) + '\n  ' + CSP_META + html.slice(c);
};
const OTHER_PAGES = ['Scout Dashboard.html', 'Scout Dashboard Standalone.dc.html', 'Scout Dashboard.dc.html'].map(n => path.join(ROOT, n));

async function build() {
  const src = fs.readFileSync(SRC, 'utf8');
  const st = src.indexOf('<script type="__bundler/template">');
  const a = src.indexOf('>', st) + 1, b = src.indexOf('</script>', a);
  const tpl = JSON.parse(src.slice(a, b));
  const m = tpl.match(/<script type="text\/x-dc"[^>]*>/);
  if (!m) throw new Error('class script not found in the template');
  const s0 = m.index + m[0].length, e0 = tpl.indexOf('</script>', s0);
  const code = tpl.slice(s0, e0);
  const r = await minify(code, {
    compress: { passes: 1 },
    // Method and property names are referenced from the template ({{ name }}) and via this.x,
    // so only local variables are renamed; the class keeps its name for the runtime.
    mangle: { keep_classnames: true, reserved: ['Component', 'DCLogic'] },
    keep_classnames: true,
    format: { comments: false }
  });
  if (!r.code || r.code.length < code.length * 0.2) throw new Error('minifier produced no output');
  const newTpl = tpl.slice(0, s0) + r.code + tpl.slice(e0);
  const esc = JSON.stringify(newTpl).replace(/<\/([sS][cC][rR][iI][pP][tT])/g, '<\\u002F$1');
  return withCsp(src.slice(0, a) + '\n' + esc + '\n' + src.slice(b));
}

build().then(out => {
  const pages = OTHER_PAGES.map(f => [f, withCsp(fs.readFileSync(f, 'utf8'))]);
  if (process.argv.includes('--check')) {
    const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (cur !== out) { console.error('index.html is out of date: run node scripts/build_index.js'); process.exit(1); }
    const stale = pages.filter(([f, t]) => fs.readFileSync(f, 'utf8') !== t).map(([f]) => path.basename(f));
    if (stale.length) { console.error('no current CSP tag in: ' + stale.join(', ') + ' (run node scripts/build_index.js)'); process.exit(1); }
    console.log('index.html is up to date (' + out.length + ' bytes); the CSP tag is current in ' + pages.length + ' other pages');
    return;
  }
  fs.writeFileSync(OUT, out);
  pages.forEach(([f, t]) => { if (fs.readFileSync(f, 'utf8') !== t) fs.writeFileSync(f, t); });
  console.log('index.html written: ' + out.length + ' bytes (from ' + fs.statSync(SRC).size + '); CSP tag set in ' + pages.length + ' other pages');
}).catch(e => { console.error(e); process.exit(1); });
