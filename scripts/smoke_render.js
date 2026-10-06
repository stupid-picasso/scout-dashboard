#!/usr/bin/env node
/**
 * smoke_render.js — loads the real app in headless Chromium, imports a small
 * CSV and exercises the screens that have broken before: roster rows, swipe and
 * long-press, the detail sheet, and the PvP / Attackers / Raid tabs. It fails on
 * any uncaught page error. Run: node scripts/smoke_render.js [index.html]
 *
 * Needs `playwright` (npm i playwright). Set PW_CHROMIUM to use an existing
 * Chromium binary instead of Playwright's own download.
 */
const path = require('path');
const { chromium } = require('playwright');

const REPO = path.resolve(__dirname, '..');
const PAGE = 'file://' + path.join(REPO, process.argv[2] || 'index.html');
const CSV = path.join(__dirname, 'fixtures', 'smoke.csv');

let failed = 0;
const check = (name, ok, extra) => {
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : '  ' + (extra || '')));
  if (!ok) failed++;
};

(async () => {
  const launch = { args: ['--no-sandbox'] };
  if (process.env.PW_CHROMIUM) launch.executablePath = process.env.PW_CHROMIUM;
  const browser = await chromium.launch(launch);
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.goto(PAGE, { waitUntil: 'load' });
  await page.waitForTimeout(3000);
  const version = await page.evaluate(() => (document.body.innerText.match(/v53\.\d+/) || [])[0]);
  check('app boots and shows a version', !!version, String(version));

  await page.setInputFiles('input[type=file][accept=".csv"]', CSV);
  await page.waitForTimeout(1500);
  // Types normally come from a lookup that needs the network; inject them.
  await page.evaluate(() => {
    for (const e of document.querySelectorAll('*')) {
      const k = Object.keys(e).find(x => x.startsWith('__reactFiber'));
      if (!k) continue;
      for (let f = e[k]; f; f = f.return) {
        if (f.stateNode && f.stateNode.logic && f.stateNode.logic.setState) {
          f.stateNode.logic.setState({ typeTable: { dragonite: 'Dragon / Flying', garchomp: 'Dragon / Ground', azumarill: 'Water / Fairy', machamp: 'Fighting', pikachu: 'Electric', gyarados: 'Water / Flying', caterpie: 'Bug' }, raidBossTypes: ['Fire'], raidWeather: 'Rainy' });
          return;
        }
      }
    }
  });
  const go = async label => { const t = page.getByText(label, { exact: true }).last(); await t.scrollIntoViewIfNeeded().catch(() => {}); await t.click(); await page.waitForTimeout(1200); };

  await go('ROSTER');
  const rows = await page.locator('[data-swipe-row]').count();
  check('roster rows carry data-swipe-row', rows >= 5, 'rows=' + rows);

  // swipe left on the first row
  const cdp = await ctx.newCDPSession(page);
  const row = page.locator('[data-swipe-row]').first();
  const box = await row.boundingBox();
  const y = box.y + box.height / 2, x0 = box.x + box.width - 40;
  const touch = (type, x) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  await touch('touchStart', x0);
  for (let i = 1; i <= 8; i++) { await touch('touchMove', x0 - i * 22); await page.waitForTimeout(16); }
  await touch('touchEnd');
  await page.waitForTimeout(500);
  check('swipe reveals the row actions', (await row.evaluate(e => e.dataset.swipeOpen)) === '1');

  // long-press on a different row
  const row2 = page.locator('[data-swipe-row]').nth(1);
  const b2 = await row2.boundingBox();
  const y2 = b2.y + b2.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b2.x + 120, y: y2 }] });
  await page.waitForTimeout(700);
  check('long-press opens the action menu', (await page.getByText('What would you like to do?').count()) === 1);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(300);

  // detail sheet
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(2500);
  await page.setInputFiles('input[type=file][accept=".csv"]', CSV);
  await page.waitForTimeout(1200);
  await go('ROSTER');
  await page.locator('[data-swipe-row]').first().click();
  await page.waitForTimeout(1200);
  check('detail sheet opens with the count-up CP', (await page.locator('.om-count').count()) >= 1);
  check('detail sheet leaves no inline transform behind', await page.evaluate(() => {
    const s = [...document.querySelectorAll('.om-scroll')].find(e => e.style.maxHeight && e.style.maxHeight.includes('calc'));
    return !!s && s.style.transform === '';
  }));

  for (const label of ['PVP', 'ATTACK', 'RAID', 'TODAY', 'HOME', 'INTEL', 'RECS', 'LOG']) {
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(2200);
    await page.setInputFiles('input[type=file][accept=".csv"]', CSV);
    await page.waitForTimeout(1000);
    await go(label);
    const text = await page.locator('body').innerText();
    check(label + ' tab renders', text.length > 200);
    // A literal \\uXXXX in visible text means an escape was written into HTML (it only works in JS strings).
    check(label + ' tab shows no raw \\u escapes', !/\\u[0-9a-fA-F]{4}/.test(text), (text.match(/.{0,30}\\u[0-9a-fA-F]{4}.{0,20}/) || [''])[0]);
  }
  check('no uncaught page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

  await browser.close();
  console.log(failed ? failed + ' check(s) failed' : 'smoke passed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
