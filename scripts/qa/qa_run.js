#!/usr/bin/env node
// Runs the QA suites (qa_e2e_<letter>.js) and writes the results as JSON to QA_OUT (default /tmp/qa/e2e.json, directory created).
// Usage: node scripts/qa/qa_run.js [a|b|c|d|e ...] [--write]   default a b c. --write rewrites the golden files instead of comparing. Exits 1 on a failed test, an unknown suite letter or a duplicate test id.
const fs = require('fs');
const path = require('path');
const { results, close } = require('./qa_lib');

const suiteFile = w => path.join(__dirname, 'qa_e2e_' + w + '.js');
const known = fs.readdirSync(__dirname).map(f => (f.match(/^qa_e2e_([a-z])\.js$/) || [])[1]).filter(Boolean).sort();
if (process.argv.includes('--write')) process.env.QA_WRITE_GOLDEN = '1';   // rewrite the golden files (scripts/fixtures/golden) instead of comparing
const args = process.argv.slice(2).filter(a => a !== '--write');
const which = args.length ? args : ['a', 'b', 'c'];
const unknown = which.filter(w => !known.includes(w));
if (unknown.length) { console.error('unknown suite letter(s): ' + unknown.join(' ') + ' (known: ' + known.join(' ') + ')'); process.exit(1); }

// A test id names one test: QA_ONLY / QA_SKIP and the results JSON all key on it. Every suite file is scanned, whichever letters run.
const ids = {};
for (const f of [...known.map(suiteFile), path.join(__dirname, 'qa_push.js')]) {
  for (const m of fs.readFileSync(f, 'utf8').matchAll(/\bT\('([A-Za-z0-9._-]+)'/g)) (ids[m[1]] = ids[m[1]] || []).push(path.basename(f));
}
const dup = Object.keys(ids).filter(id => ids[id].length > 1);
if (dup.length) { console.error('duplicate test id(s): ' + dup.map(id => id + ' (' + ids[id].join(', ') + ')').join('; ')); process.exit(1); }

(async () => {
  for (const w of which) {
    process.stdout.write('\n[' + w + '] ');
    try { await require(suiteFile(w))(); } catch (e) { results.push({ id: 'SUITE-' + w, area: 'Harness', name: 'Suite ' + w + ' aborted', sev: 'high', status: 'fail', note: String(e.message).split('\n')[0].slice(0, 200), ms: 0 }); }
  }
  await close();
  const seen = new Set(), repeated = new Set();
  results.forEach(r => { if (seen.has(r.id)) repeated.add(r.id); seen.add(r.id); });   // ids built at run time (AXE-<screen>) escape the scan above
  if (repeated.size) results.push({ id: 'SUITE-ids', area: 'Harness', name: 'Test ids are unique', sev: 'high', status: 'fail', note: 'duplicate id(s): ' + [...repeated].join(', '), ms: 0 });
  const out = process.env.QA_OUT || '/tmp/qa/e2e.json';
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(results, null, 1));
  const f = results.filter(r => r.status === 'fail'), p = results.filter(r => r.status === 'pass'), sk = results.filter(r => r.status === 'skip');
  console.log(`\n\n${p.length} passed, ${f.length} failed, ${sk.length} skipped of ${results.length}`);
  f.forEach(r => console.log('FAIL', r.id, r.name, '\n     ', r.note));
  if (f.length) process.exitCode = 1;   // a failed test fails the CI step
  sk.forEach(r => console.log('skip', r.id, r.name, '-', r.note));
})().catch(e => { console.error(e); process.exit(1); });
