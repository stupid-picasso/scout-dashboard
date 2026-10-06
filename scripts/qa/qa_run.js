#!/usr/bin/env node
// Runs the QA suites and writes qa-e2e.json. Usage: node scripts/qa/qa_run.js [a|b|c ...]
const fs = require('fs');
const { results, close } = require('./qa_lib');
(async () => {
  const which = process.argv.slice(2).length ? process.argv.slice(2) : ['a', 'b', 'c'];
  for (const w of which) {
    const f = './qa_e2e_' + w + '.js';
    if (!fs.existsSync(require('path').join(__dirname, f))) continue;
    process.stdout.write('\n[' + w + '] ');
    try { await require(f)(); } catch (e) { results.push({ id: 'SUITE-' + w, area: 'Harness', name: 'Suite ' + w + ' aborted', sev: 'high', status: 'fail', note: String(e.message).split('\n')[0].slice(0, 200), ms: 0 }); }
  }
  await close();
  const out = process.env.QA_OUT || '/tmp/qa/e2e.json';
  fs.writeFileSync(out, JSON.stringify(results, null, 1));
  const f = results.filter(r => r.status === 'fail'), p = results.filter(r => r.status === 'pass'), sk = results.filter(r => r.status === 'skip');
  console.log(`\n\n${p.length} passed, ${f.length} failed, ${sk.length} skipped of ${results.length}`);
  f.forEach(r => console.log('FAIL', r.id, r.name, '\n     ', r.note));
  sk.forEach(r => console.log('skip', r.id, r.name, '-', r.note));
})().catch(e => { console.error(e); process.exit(1); });
