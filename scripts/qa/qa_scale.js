#!/usr/bin/env node
// Roster at scale: ~2,000 rows loaded, then scrolled to the bottom while frame times are recorded.
// Usage: node scripts/qa/qa_scale.js   Env: PW_CHROMIUM, ROWS (default 2000), CPU (throttle, default 1)
const fs = require('fs'), path = require('path'), os = require('os');
const { session, close, REPO } = require('./qa_lib');
(async () => {
  const want = +process.env.ROWS || 2000;
  const lines = fs.readFileSync(path.join(REPO, 'scripts', 'fixtures', 'qa_roster.csv'), 'utf8').trim().split('\n');
  const head = lines[0], body = lines.slice(1);
  const out = [head]; for (let i = 0; out.length - 1 < want; i++) out.push(body[i % body.length]);
  const f = path.join(os.tmpdir(), 'qa-scale.csv'); fs.writeFileSync(f, out.join('\n'));
  const s = await session({ feed: false });
  const cdp = await s.ctx.newCDPSession(s.page); if (+process.env.CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: +process.env.CPU });
  const t0 = Date.now(); await s.load(f); const loadMs = Date.now() - t0; await s.go('ROSTER'); await s.page.waitForTimeout(800);
  const res = await s.page.evaluate(async () => {
    const frames = []; let last = performance.now(); let run = true;
    const tick = t => { frames.push(t - last); last = t; if (run) requestAnimationFrame(tick); }; requestAnimationFrame(tick);
    const t0 = performance.now(); let steps = 0;
    while (steps < 400) { window.scrollBy(0, 600); steps++; await new Promise(r => setTimeout(r, 16)); if (innerHeight + scrollY >= document.body.scrollHeight - 5 && steps > 20) { await new Promise(r => setTimeout(r, 300)); if (innerHeight + scrollY >= document.body.scrollHeight - 5) break; } }
    run = false; await new Promise(r => setTimeout(r, 50));
    const sorted = frames.slice(1).sort((a, b) => a - b); const q = p => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
    return { steps, ms: Math.round(performance.now() - t0), frames: sorted.length, p50: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), p99: +q(0.99).toFixed(1), max: +sorted[sorted.length - 1].toFixed(1), rows: document.querySelectorAll('[data-swipe-row]').length, over50: sorted.filter(x => x > 50).length, heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null };
  });
  const st = await s.state(); res.rosterSize = st.roster.length; res.importMs = loadMs;
  console.log(JSON.stringify(res)); await s.close(); await close();
})().catch(e => { console.error(e); process.exit(1); });
