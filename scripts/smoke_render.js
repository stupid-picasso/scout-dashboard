#!/usr/bin/env node
/**
 * smoke_render.js — loads the real app in headless Chromium, imports a small CSV, walks every screen and the planners, and fails on
 * any uncaught page error. Gestures, the detail sheet and the PvP rows are covered by the QA suites (scripts/qa). It is the fast
 * Chromium-only gate of test.yml. Run: node scripts/smoke_render.js [index.html]
 *
 * Needs `playwright` (npm i playwright). Set PW_CHROMIUM to use an existing Chromium binary instead of Playwright's own download.
 */
const path = require('path');
const { session, close } = require('./qa/qa_lib');
const { checker } = require('./lib/testkit');
const { SCREENS } = require('./lib/nav');

const REPO = path.resolve(__dirname, '..');
const CSV = path.join(__dirname, 'fixtures', 'smoke.csv');
const t = checker();
const check = (name, ok, extra) => { if (ok) console.log('ok   ' + name); t.ok(name, ok, extra); };

(async () => {
  const s = await session({ url: 'file://' + path.join(REPO, process.argv[2] || 'index.html'), pinTiers: false });
  const page = s.page;
  check('the bundle ships current mechanics (Mega rules, cup tables)', await page.evaluate(() => { const m = window.PokemonMechanics; return !!(m && m.megaFormsFor && m.PVP_CUP_TABLES && m.pvpTableFor('cup:mega@1500')); }));

  // A fresh page with the CSV loaded: the app's state is rebuilt, so one screen's checks cannot leak into the next.
  const fresh = async () => { await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => document.body.innerText.length > 100); await s.load(CSV); };
  await s.load(CSV);
  // Types normally come from a lookup that needs the network; inject them.
  await s.set({ typeTable: { dragonite: 'Dragon / Flying', garchomp: 'Dragon / Ground', azumarill: 'Water / Fairy', machamp: 'Fighting', pikachu: 'Electric', gyarados: 'Water / Flying', caterpie: 'Bug' }, raidBossTypes: ['Fire'], raidWeather: 'Rainy' });

  await s.go('HOME');
  const version = await page.evaluate(() => (document.body.innerText.match(/v53\.\d+/) || [])[0]);
  check('app boots and shows a version (Settings > About)', !!version, String(version));
  await s.go('ROSTER');
  const rows = await page.locator('[data-swipe-row]').count();
  check('roster rows carry data-swipe-row', rows >= 5, 'rows=' + rows);

  // detail sheet
  await fresh();
  await s.go('ROSTER');
  await page.locator('[data-swipe-row]').first().click();
  await page.waitForSelector('[data-countup]'); await s.settled();
  check('detail sheet opens with the rolling CP number', (await page.locator('[data-countup]').count()) >= 1);
  check('detail sheet leaves no inline transform behind', await page.evaluate(() => {
    const el = [...document.querySelectorAll('.om-scroll')].find(e => e.style.maxHeight && e.style.maxHeight.includes('calc'));
    return !!el && el.style.transform === '';
  }));

  for (const label of SCREENS.filter(x => x !== 'ROSTER')) {
    await fresh();
    await s.go(label);
    const text = await s.text();
    check(label + ' tab renders', text.length > 200);
    // A literal \\uXXXX in visible text means an escape was written into HTML (it only works in JS strings).
    check(label + ' tab shows no raw \\u escapes', !/\\u[0-9a-fA-F]{4}/.test(text), (text.match(/.{0,30}\\u[0-9a-fA-F]{4}.{0,20}/) || [''])[0]);
  }
  // PvP list: nothing over the league's CP cap.
  await fresh();
  await s.go('PVP');
  const pvpText = await s.text();
  const greatList = pvpText.split('BEST GREAT')[0].split('SUGGESTED TEAM')[0];
  check('Great League list excludes a 2648 CP Dragonite', !/Dragonite/.test(greatList));
  check('Great League list includes a 1498 CP Azumarill', /Azumarill/.test(greatList));

  // Live feed: serve a synthetic feed so the check does not expire with real dates.
  await page.route('**/data/feed.json*', route => {
    const day = 86400000, now = Date.now(), iso = ms => new Date(ms).toISOString();
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      source: 'test', fetchedAt: iso(now),
      gbl: [{ start: iso(now - day), end: iso(now + 6 * day), season: 'Smoke Season', leagues: [
        { name: 'Great League', cp: 1500, mega: false, rules: ['Pokemon must be at or below 1,500 CP.'] },
        { name: 'Great League: Mega Edition', cp: 1500, mega: true, rules: ['Mega Evolutions are eligible.'] }] }],
      events: [{ id: 'x', name: 'Smoke Community Day', type: 'community-day', start: iso(now + day), end: iso(now + 2 * day), link: '', spawns: ['Zorua'], bonuses: ['3x Catch XP'] }]
    }) });
  });
  // Planners: add an event, save a team and tally a result.
  await fresh();
  await s.go('TODAY');
  await page.getByPlaceholder('Event name, e.g. Community Day').fill('Smoke Day');
  await page.getByPlaceholder('Featured species, comma separated').fill('Azumarill, Caterpie');
  await page.getByText('ADD EVENT', { exact: true }).click();
  await page.getByText('Smoke Day').first().waitFor();
  check('Megas-worth-evolving card lists Mega-capable Pokemon', (await page.getByText('Megas worth evolving', { exact: true }).count()) >= 1);
  check('GBL card shows the cup rotation and rules', (await page.getByText('GO Battle League', { exact: true }).count()) >= 1 && (await page.getByText('Mega Edition').count()) >= 1);
  check('feed events show details and a verdict', (await page.getByText('Smoke Community Day').count()) >= 1 && (await page.getByText('3x Catch XP').count()) >= 1);
  check('event planner lists the event and judges each species', (await page.getByText('Smoke Day').count()) >= 1 && (await page.getByText('HUNT').count()) >= 1);
  await s.go('PVP');
  const canSave = (await page.getByText('SAVE THIS TEAM', { exact: true }).count()) === 1;
  check('PvP tab offers to save the suggested team', canSave);
  if (canSave) {
    await page.getByText('SAVE THIS TEAM', { exact: true }).click();
    await page.getByText('+ WIN', { exact: true }).first().click();
    await page.getByText(/1W . 0L/).first().waitFor();
    check('a saved team records a win', (await page.getByText(/1W . 0L/).count()) >= 1);
  }
  check('no uncaught page errors', s.errors.length === 0, s.errors.slice(0, 3).join(' | '));

  await s.close(); await close();
  t.exit(t.fail ? t.fail + ' check(s) failed' : 'smoke passed');
})().catch(e => { console.error(e); process.exit(1); });
