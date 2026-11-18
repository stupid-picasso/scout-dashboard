#!/usr/bin/env node
// Viewport screenshots of the Pokemon GO restyle (fixture roster only). Usage: node scripts/qa/go_shots.js <outDir> [widths=320,390,768] [themes=dark,light]
const fs = require('fs');
const path = require('path');
const { session, close, REPO } = require('./qa_lib');
const QA = path.join(REPO, 'scripts', 'fixtures', 'qa_roster.csv');
const out = process.argv[2];
if (!out) { console.error('usage: go_shots.js <outDir> [widths] [themes]'); process.exit(1); }
fs.mkdirSync(out, { recursive: true });
const WIDTHS = (process.argv[3] || '320,390,768').split(',').map(Number);
const THEMES = (process.argv[4] || 'dark,light').split(',');
const feed = JSON.parse(fs.readFileSync(path.join(REPO, 'data', 'feed.json'), 'utf8'));
(async () => {
  for (const theme of THEMES) for (const width of WIDTHS) {
    const tag = (process.env.ZOOM ? 'z' + process.env.ZOOM + '_' : '') + (process.env.THEMEPREF ? 'pref' + process.env.THEMEPREF + '-' : '') + theme + '_' + width + '_';
    const s = await session({ width, height: width >= 768 ? 1024 : 844, colorScheme: theme, sentenceCase: true, feed, touch: true, collapsedTail: true });
    const shot = async name => { await s.page.waitForTimeout(500); await s.page.screenshot({ path: path.join(out, tag + name + '.png') }); };
    const tryDo = async (name, fn) => { try { await fn(); } catch (e) { console.error(tag + name, e.message); } };
    if (process.env.THEMEPREF) await s.call('setThemePref', process.env.THEMEPREF);
    if (process.env.ZOOM) await s.call('setUiZoom', +process.env.ZOOM);
    await s.load(QA); await s.call('recalculateAllRanks'); await s.page.waitForTimeout(1500);
    await s.page.evaluate(() => { try { localStorage.setItem('scout.hint.swipe', '1'); } catch (e) {} });
    await tryDo('ROSTER', async () => { await s.go('ROSTER'); await s.page.waitForTimeout(1000); await shot('ROSTER'); });
    await tryDo('DETAIL', async () => {
      await s.page.locator('[data-swipe-row]').first().click(); await s.page.waitForTimeout(1200); await shot('DETAIL');
      await s.page.evaluate(() => { const d = document.querySelector('[aria-label="Pokemon details"]'); if (d) d.scrollTop = 520; }); await shot('DETAIL_SCROLLED');
      await s.page.evaluate(() => { const d = document.querySelector('[aria-label="Pokemon details"]'); if (d) d.scrollTop = 1100; }); await shot('DETAIL_MAX');
      await s.page.keyboard.press('Escape'); await s.call('closeDetail'); await s.page.waitForTimeout(400);
    });
    // detail states that need a Pokemon with a power-up, a purify and an evolve button: scan the fixture roster for them
    await tryDo('DETAIL_STATES', async () => {
      const scan = async (want, tag2) => {
        await s.go('ROSTER'); await s.page.waitForTimeout(600); const got = {};
        for (let i = 0; i < 64 && Object.keys(got).length < Object.keys(want).length; i++) {
          const row = s.page.locator('[data-swipe-row]').nth(i); if (!(await row.count())) break;
          await row.click({ force: true }); await s.page.waitForTimeout(400);
          for (const k of Object.keys(want)) if (!got[k] && await s.page.locator(want[k]).count()) {
            got[k] = i; await s.page.locator(want[k]).first().scrollIntoViewIfNeeded(); await s.page.evaluate(() => { const d = document.querySelector('[aria-label="Pokemon details"]'); if (d) d.scrollTop += 120; }); await shot('DETAIL_' + k.toUpperCase());
          }
          await s.call('closeDetail'); await s.page.waitForTimeout(200);
        }
        console.log(tag, tag2, 'detail states found', JSON.stringify(got));
      };
      await scan({ cost: '.go-cost:not(.go-cost-off)', pink: '.go-pink' }, 'a');
      await s.set({ stardustBalance: 0 });
      await scan({ off: '.go-cost-off', evo: '.go-evo', mega: 'input[placeholder="energy"]' }, 'b');
      await s.set({ stardustBalance: 100000 });
    });
    await tryDo('SELECT', async () => { await s.go('ROSTER'); await s.call('toggleSelectMode'); await s.page.waitForTimeout(300); await s.call('toggleSelect', 0); await s.call('toggleSelect', 1); await shot('SELECT'); await s.call('toggleSelectMode'); });
    await tryDo('SWIPE', async () => {
      await s.go('ROSTER'); const row = s.page.locator('[data-swipe-row]').nth(1); const b = await row.boundingBox(); const cdp = await s.ctx.newCDPSession(s.page); const y = b.y + b.height / 2;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x + b.width - 20, y }] }); for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: b.x + b.width - 20 - i * 25, y }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await shot('SWIPE');
    });
    await tryDo('CONFIRM', async () => {
      await s.call('askConfirm', { title: 'Transfer Latios?', message: 'It is removed from your roster and you get 1 candy. You can undo this for a few seconds.', actions: [{ label: 'TRANSFER', style: 'primary' }, { label: 'NOT YET', style: 'neutral' }] }); await shot('CONFIRM'); await s.call('closeConfirm');
    });
    await tryDo('BACKUP', async () => {
      await s.set({ fileFallback: { filename: 'professor-backup.csv', preview: 'name,cp,atk,def,sta\nMetagross,4286,15,15,15\nLatios,4185,12,11,11' } }); await shot('BACKUP'); await s.set({ fileFallback: null });
    });
    await tryDo('CARRY', async () => {
      await s.set({ carryPrompt: { count: 64, uploadLabel: 'Upload 64 Pokemon to this account' } }); await shot('CARRY'); await s.set({ carryPrompt: null });
    });
    await tryDo('TODAY', async () => { await s.go('TODAY'); await s.page.waitForTimeout(900); await shot('TODAY'); });
    await tryDo('MORE', async () => { await s.page.getByText('More', { exact: true }).last().click(); await s.page.waitForTimeout(600); await shot('MORE'); });
    await s.set({ moreOpen: false }); await s.page.waitForTimeout(300);
    await tryDo('PVP', async () => { await s.go('PVP'); await s.page.waitForTimeout(900); await shot('PVP'); await s.page.evaluate(() => { const m = document.querySelector('[role=main]'); (document.querySelector('[data-app-scroll]') || document.scrollingElement).scrollTop = 700; }); await shot('PVP_SCROLLED'); });
    await tryDo('RECS', async () => { await s.go('RECS'); await s.page.waitForTimeout(900); await shot('RECS'); });
    await tryDo('SIGNIN', async () => {
      await s.go('HOME'); await s.page.evaluate(() => document.querySelectorAll('details').forEach(d => { if (/Setup, sync and backup/.test(d.textContent.slice(0, 120))) d.open = true; }));
      await s.page.locator('[data-signin-card]').scrollIntoViewIfNeeded(); await shot('SIGNIN');
    });
    await s.close();
    // fresh storage with no roster: the empty-account prompt and the first-run overlay
    const e = await session({ width, height: width >= 768 ? 1024 : 844, colorScheme: theme, sentenceCase: true, feed, touch: true, collapsedTail: true });
    await tryDo('EMPTY', async () => { await e.go('TODAY'); await e.page.waitForTimeout(900); await e.page.screenshot({ path: path.join(out, tag + 'EMPTY.png') }); });
    await e.close();
    const f = await session({ width, height: width >= 768 ? 1024 : 844, colorScheme: theme, sentenceCase: true, feed, touch: true, collapsedTail: true, firstRun: true });
    await f.page.waitForTimeout(2200);
    await tryDo('FIRSTRUN', async () => { await f.page.screenshot({ path: path.join(out, tag + 'FIRSTRUN.png') }); await f.page.locator('[data-firstrun] button').filter({ hasText: /^Continue without an account$/ }).click(); await f.page.waitForTimeout(500); await f.page.screenshot({ path: path.join(out, tag + 'FIRSTRUN2.png') }); });
    await f.close();
    console.log('done', theme, width);
  }
  await close();
})().catch(e => { console.error(e); process.exit(1); });
