#!/usr/bin/env node
// Lighthouse (mobile, simulated throttling) against the app served over http.
// Usage: node scripts/qa/qa_lighthouse.js [out.json]   Env: PW_CHROMIUM (chrome binary)
const fs = require('fs');
const { serveRepo } = require('../lib/testkit');
let srv;
(async () => {
  const lighthouse = (await import('lighthouse')).default;
  const chromeLauncher = await import('chrome-launcher');
  // GitHub Pages (where the app is served) gzips text responses; serveRepo does the same so the transfer size, and therefore the
  // load metrics, match what a phone actually downloads.
  srv = await serveRepo({ host: 'localhost', gzip: true });
  const url = 'http://localhost:' + srv.address().port + '/index.html';
  const chrome = await chromeLauncher.launch({ chromePath: process.env.PW_CHROMIUM, chromeFlags: ['--headless=new', '--no-sandbox'] });
  const r = await lighthouse(url, { port: chrome.port, output: 'json', logLevel: 'error', onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'], pauseAfterLoadMs: 6000, networkQuietThresholdMs: 3000 });
  await chrome.kill(); srv.close();
  if (process.env.LH_FULL) fs.writeFileSync(process.env.LH_FULL, JSON.stringify(r.lhr));
  const c = r.lhr.categories, a = r.lhr.audits;
  const out = {
    scores: Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Math.round(v.score * 100)])),
    metrics: { fcp: a['first-contentful-paint'].displayValue, lcp: a['largest-contentful-paint'].displayValue, tbt: a['total-blocking-time'].displayValue, tti: a['interactive'].displayValue, cls: a['cumulative-layout-shift'].displayValue, size: a['total-byte-weight'].displayValue },
    failing: Object.values(a).filter(x => x.score !== null && x.score < 0.9 && x.scoreDisplayMode !== 'informative' && x.scoreDisplayMode !== 'notApplicable').map(x => x.id + ' (' + Math.round(x.score * 100) + ')').slice(0, 25)
  };
  fs.writeFileSync(process.argv[2] || '/tmp/qa/lighthouse.json', JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
  const min = { performance: +process.env.LH_MIN_PERF || 0, accessibility: +process.env.LH_MIN_A11Y || 0 };
  if (out.scores.performance < min.performance || out.scores.accessibility < min.accessibility) { console.error('below threshold', min); process.exit(1); }
})().catch(e => { console.error(e); srv.close(); process.exit(1); });
