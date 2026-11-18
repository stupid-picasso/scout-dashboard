#!/usr/bin/env node
// Serves the repo over http://localhost and loads the BUILT index.html (which carries the CSP meta tag) in Chromium and WebKit.
// Fails on any Content-Security-Policy violation through launch, CSV import, the detail sheet and the chat sheet, and requires that a
// request to a host outside the policy is blocked. A browser that is not installed is skipped (set CSP_REQUIRE_WEBKIT=1 to make a missing WebKit a failure).
//   node scripts/test_csp.js            runs every browser in a child process (the QA helper picks the browser from QA_BROWSER)
const http = require('http'), fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const REPO = path.join(__dirname, '..');
const QA_CSV = path.join(REPO, 'scripts', 'fixtures', 'qa_roster.csv');
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
      const f = path.join(REPO, p);
      if (!f.startsWith(REPO + path.sep) || /\/(node_modules|\.git)\//.test(f) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rsp.writeHead(404); return rsp.end('not found'); }
      rsp.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(rsp);
    }).listen(0, 'localhost', () => res(srv));
  });
}

async function child() {
  const { session, close, expect } = require('./qa/qa_lib');
  const srv = await serve(), port = srv.address().port;
  const html = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
  if (!/<meta http-equiv="Content-Security-Policy"/.test(html)) throw new Error('index.html has no CSP meta tag (run python3 scripts/build_bundles.py)');
  // Sign-in by popup (Google, GitHub) needs the Firebase auth domain and the Google sign-in hosts as frames and apis.google.com as a script host; the token calls
  // go to *.googleapis.com (already in connect-src). Nothing for github.com is needed: the GitHub page loads inside the popup window, which this policy does not govern.
  const csp = (html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/) || [])[1] || '';
  const dir = n => ((csp.split(';').map(x => x.trim()).find(x => x.startsWith(n + ' ')) || '').split(/\s+/).slice(1));
  const pre = [];
  ['https://pokemon-professor.firebaseapp.com', 'https://accounts.google.com', 'https://apis.google.com'].forEach(h => { if (dir('frame-src').indexOf(h) < 0) pre.push('frame-src lacks ' + h); });
  if (dir('script-src').indexOf('https://apis.google.com') < 0) pre.push('script-src lacks https://apis.google.com');
  if (dir('connect-src').indexOf('https://*.googleapis.com') < 0) pre.push('connect-src lacks https://*.googleapis.com');
  ['connect-src', 'frame-src', 'script-src'].forEach(d => { if (dir(d).some(x => x === '*' || x === 'https:' || x === 'http:')) pre.push(d + ' is a wildcard'); });
  if (pre.length) throw new Error('CSP does not fit popup sign-in: ' + pre.join('; '));
  let s;
  try {
    s = await session({
      feed: false, url: 'http://localhost:' + port + '/index.html',
      // WebKit's request interception does not see a request the page's service worker makes, so the host checks below would count nothing. The worker is
      // blocked there; Chromium keeps it registered, so the policy is still checked with the worker running.
      blockServiceWorkers: process.env.QA_BROWSER === 'webkit',
      init: () => { window.__csp = []; window.addEventListener('securitypolicyviolation', e => window.__csp.push({ d: e.violatedDirective, u: e.blockedURI, s: (e.sample || '').slice(0, 60) }), true); }
    });
  } catch (e) { if (/Executable doesn't exist|browserType\.launch/.test(e.message)) { console.log('SKIP ' + (process.env.QA_BROWSER || 'chromium') + ': browser not installed'); process.exit(process.env.CSP_REQUIRE_WEBKIT === '1' && process.env.QA_BROWSER === 'webkit' ? 1 : 0); } throw e; }
  const consoleCsp = [];
  s.page.on('console', m => { if (/Content.Security.Policy|Refused to (load|connect|execute|apply|frame)/i.test(m.text())) consoleCsp.push(m.text().slice(0, 200)); });
  const fails = [];
  const must = (c, m) => { if (!c) fails.push(m); };
  await s.page.waitForTimeout(1500);
  await s.load(QA_CSV); await s.page.waitForTimeout(1500);
  const st = await s.state(); must(((st.roster || []).length) > 10, 'the CSV import did not load under the CSP (' + (st.roster || []).length + ' rows)');
  await s.go('ROSTER'); await s.page.waitForTimeout(600);
  const row = s.page.locator('[data-swipe-row]').first(); must(await row.count() > 0, 'no roster row'); if (await row.count()) { await row.click(); await s.page.waitForTimeout(900); }
  must((await s.state()).detailPoke, 'the detail sheet did not open');
  await s.call('closeDetail'); await s.call('openChatBubble'); await s.page.waitForTimeout(700);
  must((await s.state()).chatOpen, 'the chat sheet did not open');
  // The owner features that stay on (import from server, workflow dispatch) and the Gemini host must be inside connect-src.
  const hits = { raw: 0, api: 0, gem: 0 };
  await s.page.route(/raw\.githubusercontent\.com/, r => { hits.raw++; r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '[]' }); });
  await s.page.route(/api\.github\.com/, r => { hits.api++; r.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }, body: '' }); });
  await s.page.route(/generativelanguage\.googleapis\.com/, r => { hits.gem++; r.fulfill({ status: 400, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{}' }); });
  await s.set({ githubToken: 'ghp_FAKE_NOT_A_TOKEN', driveVideoLink: 'https://drive.google.com/file/d/x' });
  await s.call('importFromServer'); await s.call('importIvFromServer'); await s.call('runGithubWorkflow', 'video');
  await s.page.evaluate(() => fetch('https://generativelanguage.googleapis.com/v1beta/models', { headers: { 'x-goog-api-key': 'fake' } }).catch(() => {}));
  await s.page.waitForTimeout(1200);
  must(hits.raw >= 2 && hits.api >= 1 && hits.gem >= 1, 'allowed hosts were not reached (raw ' + hits.raw + ', api ' + hits.api + ', gemini ' + hits.gem + ')');
  const before = await s.page.evaluate(() => window.__csp.slice());
  must(before.length === 0, 'CSP violations during normal use: ' + JSON.stringify(before));
  must(consoleCsp.length === 0, 'CSP console messages: ' + consoleCsp.join(' | '));
  // The policy must be enforced after the page has unpacked itself: a request to a host outside it is blocked, a script from one too.
  const blocked = await s.page.evaluate(async () => {
    let fetchBlocked = false; try { await fetch('https://example.com/', { mode: 'no-cors' }); } catch (e) { fetchBlocked = true; }
    const sc = document.createElement('script'); sc.src = 'https://example.com/x.js'; document.head.appendChild(sc);
    await new Promise(r => setTimeout(r, 600));
    return { fetchBlocked, v: window.__csp.map(x => x.d + ' ' + x.u) };
  });
  must(blocked.fetchBlocked, 'fetch to https://example.com was not blocked');
  must(blocked.v.some(x => /connect-src/.test(x) && /example\.com/.test(x)), 'no connect-src violation recorded for example.com: ' + JSON.stringify(blocked.v));
  must(blocked.v.some(x => /script-src/.test(x) && /example\.com/.test(x)), 'no script-src violation recorded for a script from example.com: ' + JSON.stringify(blocked.v));
  must(s.errors.filter(e => !/net::ERR|Failed to load resource|Load failed/i.test(String(e))).length === 0, 'page errors: ' + s.errors.slice(0, 2).join(' | '));
  await s.close(); await close(); srv.close();
  if (fails.length) { fails.forEach(f => console.log('FAIL [' + (process.env.QA_BROWSER || 'chromium') + '] ' + f)); process.exit(1); }
  console.log('ok [' + (process.env.QA_BROWSER || 'chromium') + '] no CSP violation through launch, import, detail and chat; example.com blocked (fetch and script)');
}

if (process.env.CSP_CHILD) child().catch(e => { console.log('FAIL ' + (e && e.message)); process.exit(1); });
else {
  let bad = 0;
  for (const b of (process.env.QA_BROWSER ? [process.env.QA_BROWSER] : ['chromium', 'webkit'])) {
    const r = spawnSync(process.execPath, [__filename], { env: { ...process.env, CSP_CHILD: '1', QA_BROWSER: b }, stdio: 'inherit' });
    if (r.status !== 0) bad++;
  }
  console.log(bad ? bad + ' browser(s) failed' : 'csp test passed');
  process.exit(bad ? 1 : 0);
}
