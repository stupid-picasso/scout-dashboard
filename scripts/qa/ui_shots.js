#!/usr/bin/env node
// UI screenshots for design review. Usage: node scripts/qa/ui_shots.js <outDir> [widths=320,390,402,768] [themes=dark,light] [screens=all]
// Writes <theme>_<width>_<screen>.png (device scale 2, full page) with the fixture roster, the real data/feed.json and
// data/promo_codes.json, and the sentence-case display layer ON (what a user sees).
const fs = require('fs');
const path = require('path');
const { session, close, REPO } = require('./qa_lib');
const QA = path.join(REPO, 'scripts', 'fixtures', 'qa_roster.csv');
const out = process.argv[2];
if (!out) { console.error('usage: ui_shots.js <outDir> [widths] [themes] [only]'); process.exit(1); }
fs.mkdirSync(out, { recursive: true });
const WIDTHS = (process.argv[3] || '320,390,402,768').split(',').map(Number);
const THEMES = (process.argv[4] || 'dark,light').split(',');
const ONLY = process.argv[5] ? process.argv[5].split(',') : null;
const feed = JSON.parse(fs.readFileSync(path.join(REPO, 'data', 'feed.json'), 'utf8'));
const promo = JSON.parse(fs.readFileSync(path.join(REPO, 'data', 'promo_codes.json'), 'utf8'));
const SCREENS = ['TODAY', 'ROSTER', 'PVP', 'RAID', 'HOME', 'RECS', 'INTEL', 'ATTACK', 'LOG'];
const want = n => !ONLY || ONLY.includes(n);

(async () => {
  for (const theme of THEMES) for (const width of WIDTHS) {
    const tag = theme + '_' + width + '_';
    const shot = async (s, name, full = true) => { if (!want(name)) return; await s.page.waitForTimeout(500); await s.page.screenshot({ path: path.join(out, tag + name + '.png'), fullPage: full }); };
    // ---- with the fixture roster
    let s = await session({ width, height: width >= 768 ? 1024 : 844, colorScheme: theme, sentenceCase: true, feed, touch: true, collapsedTail: true });
    await s.load(QA); await s.call('recalculateAllRanks'); await s.page.waitForTimeout(1500);
    await s.set({ promoCodes: promo });
    await s.page.evaluate(() => { try { localStorage.setItem('scout.hint.swipe', '1'); } catch (e) {} });
    for (const scr of SCREENS) { await s.go(scr); await s.page.waitForTimeout(900); await shot(s, scr); }
    // Today with the long tail opened (the default Today above is what a person sees: the tail is collapsed)
    try { await s.go('TODAY'); await s.page.locator('[data-today-tail-toggle]').click(); await s.page.waitForTimeout(700); await shot(s, 'TODAY_OPEN'); await s.page.locator('[data-today-tail-toggle]').click(); } catch (e) { console.error('today open', e.message); }
    // detail sheet
    try {
      await s.go('ROSTER'); await s.page.waitForTimeout(600);
      const row = s.page.locator('[data-swipe-row]').first(); await row.click(); await s.page.waitForTimeout(1200);
      await shot(s, 'DETAIL', false);
      await s.page.keyboard.press('Escape'); await s.page.waitForTimeout(300);
      const back = s.page.getByLabel(/close|back/i).first(); if (await back.count()) await back.click().catch(() => {});
      await s.page.waitForTimeout(400);
    } catch (e) { console.error('detail', e.message); }
    // select mode
    try { await s.go('ROSTER'); await s.call('toggleSelectMode'); await s.page.waitForTimeout(400); await s.call('toggleSelect', 0); await s.call('toggleSelect', 1); await shot(s, 'SELECT', false); await s.call('toggleSelectMode'); } catch (e) { console.error('select', e.message); }
    // long-press sheet
    try { await s.go('ROSTER'); const idx = await s.page.evaluate(() => document.querySelector('[data-swipe-row]').getAttribute('data-swipe-row')); await s.call('openRosterActionMenu', idx); await s.page.waitForTimeout(600); await shot(s, 'LONG', false); await s.call('closeConfirm'); } catch (e) { console.error('long', e.message); }
    // toast
    try { await s.go('TODAY'); await s.set({ csvNotice: 'Transferred Latios', importUndoable: false, undoLabel: 'Transferred Latios' }); await s.page.waitForTimeout(500); await shot(s, 'TOAST', false); await s.set({ csvNotice: '', undoLabel: '' }); } catch (e) { console.error('toast', e.message); }
    // chat sheet
    try { await s.set({ chatOpen: true }); await s.page.waitForTimeout(700); await shot(s, 'CHAT', false); await s.set({ chatOpen: false }); } catch (e) { console.error('chat', e.message); }
    // more menu
    try { await s.page.getByText('More', { exact: true }).last().click(); await s.page.waitForTimeout(600); await shot(s, 'MORE', false); } catch (e) { console.error('more', e.message); }
    await s.close();
    // ---- empty roster
    s = await session({ width, height: width >= 768 ? 1024 : 844, colorScheme: theme, sentenceCase: true, feed, touch: true, collapsedTail: true });
    await s.page.waitForTimeout(1500);
    for (const scr of ['TODAY', 'ROSTER', 'PVP']) { try { await s.go(scr); await s.page.waitForTimeout(700); await shot(s, 'EMPTY_' + scr); } catch (e) { console.error('empty', scr, e.message); } }
    await s.close();
    console.log('done', theme, width);
  }
  await close();
})().catch(e => { console.error(e); process.exit(1); });
