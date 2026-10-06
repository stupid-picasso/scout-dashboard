#!/usr/bin/env node
// Lighthouse (mobile, simulated throttling) against the app served over http.
// Usage: node scripts/qa/qa_lighthouse.js [out.json]   Env: PW_CHROMIUM (chrome binary)
const http = require('http'), fs = require('fs'), path = require('path');
const REPO = path.join(__dirname, '..', '..');
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css' };
const srv = http.createServer((req, res) => {
  const p = path.join(REPO, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html'));
  if (!p.startsWith(REPO) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end('no'); }
  res.writeHead(200, { 'content-type': mime[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
(async () => {
  const lighthouse = (await import('lighthouse')).default;
  const chromeLauncher = await import('chrome-launcher');
  await new Promise(r => srv.listen(0, r));
  const url = 'http://localhost:' + srv.address().port + '/index.html';
  const chrome = await chromeLauncher.launch({ chromePath: process.env.PW_CHROMIUM, chromeFlags: ['--headless=new', '--no-sandbox'] });
  const r = await lighthouse(url, { port: chrome.port, output: 'json', logLevel: 'error', onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'] });
  await chrome.kill(); srv.close();
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
