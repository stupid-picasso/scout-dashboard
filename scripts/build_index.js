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
  return src.slice(0, a) + '\n' + esc + '\n' + src.slice(b);
}

build().then(out => {
  if (process.argv.includes('--check')) {
    const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (cur !== out) { console.error('index.html is out of date: run node scripts/build_index.js'); process.exit(1); }
    console.log('index.html is up to date (' + out.length + ' bytes)');
    return;
  }
  fs.writeFileSync(OUT, out);
  console.log('index.html written: ' + out.length + ' bytes (from ' + fs.statSync(SRC).size + ')');
}).catch(e => { console.error(e); process.exit(1); });
