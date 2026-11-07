// QA suite D: automated accessibility (axe-core) on every screen. Fails on serious/critical issues.
const fs = require('fs'), path = require('path');
const { T, expect, session, REPO } = require('./qa_lib');
const QA = path.join(REPO, 'scripts', 'fixtures', 'qa_roster.csv');
const AXE = fs.readFileSync(path.join(REPO, 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');
const SCREENS = ['TODAY', 'ROSTER', 'PVP', 'RAID', 'HOME', 'RECS', 'INTEL', 'ATTACK', 'LOG'];

module.exports = async function suiteD() {
  const s = await session({ feed: false });
  await s.load(QA); await s.call('recalculateAllRanks'); await s.page.waitForTimeout(2500);
  const all = {};
  for (const scr of SCREENS) {
    await T('AXE-' + scr, 'Accessibility', `axe-core: no serious or critical violations on ${scr}`, async () => {
      await s.go(scr); await s.page.waitForTimeout(800);
      await s.page.evaluate(src => { if (!window.axe) (0, eval)(src); }, AXE);
      const res = await s.page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] } })).violations.map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length, help: v.help })));
      all[scr] = res;
      const bad = res.filter(v => v.impact === 'serious' || v.impact === 'critical');
      expect(bad.length === 0, bad.map(v => `${v.id}(${v.n})`).join(', '));
      return res.length + ' lower-impact issues: ' + res.map(v => v.id).join(',');
    }, 'high');
  }
  const axeNow = async () => { await s.page.evaluate(src => { if (!window.axe) (0, eval)(src); }, AXE); return s.page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] } })).violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.id + '(' + v.nodes.length + ')')); };
  await T('AXE-MORE', 'Accessibility', 'axe-core: the More menu is clean', async () => { await s.go('TODAY'); await s.page.getByText('More', { exact: true }).last().click(); await s.page.waitForTimeout(500); const bad = await axeNow(); await s.page.mouse.click(215, 120); expect(bad.length === 0, bad.join(',')); }, 'high');
  await T('AXE-DETAIL', 'Accessibility', 'axe-core: the detail sheet (with the Mega card) is clean', async () => { await s.go('ROSTER'); const st = await s.state(); const mon = st.roster.find(p => p.name === 'Beedrill'); await s.page.evaluate(m => { for (const e of document.querySelectorAll('*')) { const k = Object.keys(e).find(x => x.startsWith('__reactFiber')); if (!k) continue; for (let f = e[k]; f; f = f.return) if (f.stateNode && f.stateNode.logic && f.stateNode.logic.openDetail) { f.stateNode.logic.openDetail(m); return; } } }, mon); await s.page.waitForTimeout(900); const bad = await axeNow(); await s.call('closeDetail'); expect(bad.length === 0, bad.join(',')); }, 'high');
  await T('AXE-SELECT', 'Accessibility', 'axe-core: roster select mode with a selection and the bulk bar is clean', async () => { await s.go('ROSTER'); await s.page.getByRole('button', { name: 'Select', exact: true }).click(); await s.page.locator('[data-swipe-row]').nth(0).click(); await s.page.waitForTimeout(400); const bad = await axeNow(); await s.page.getByRole('button', { name: 'Done', exact: true }).click(); expect(bad.length === 0, bad.join(',')); }, 'high');
  await T('KEY-01', 'Accessibility', 'Keyboard only: Tab reaches the tab bar and Enter switches screens', async () => { await s.go('TODAY'); await s.page.evaluate(() => document.activeElement && document.activeElement.blur()); let hit = false; for (let i = 0; i < 80 && !hit; i++) { await s.page.keyboard.press('Tab'); hit = await s.page.evaluate(() => (document.activeElement.getAttribute('aria-label') || '') === 'Roster'); } expect(hit, 'never reached the Roster tab'); await s.page.keyboard.press('Enter'); await s.page.waitForTimeout(500); expect(/POKÉMON|Pokémon/.test(await s.text()) && /Sort/.test(await s.text())); }, 'high');
  await T('KEY-02', 'Accessibility', 'Keyboard only: a roster row opens its detail with Enter and Escape-free close works', async () => { await s.go('ROSTER'); const row = s.page.locator('[data-swipe-row]').first(); await row.focus(); await s.page.keyboard.press('Enter'); await s.page.waitForTimeout(700); expect(/POWER UP|APPRAISAL|EVOLUTION|MEGA/i.test(await s.text())); await s.call('closeDetail'); });
  await T('KEY-03', 'Accessibility', 'Every control on the tab bar and header has an accessible name', async () => { const n = await s.page.evaluate(() => [...document.querySelectorAll('header button, header label, nav button')].filter(b => !(b.getAttribute('aria-label') || b.innerText || '').trim()).length); expect(n === 0, n + ' unnamed controls'); });
  fs.writeFileSync(process.env.QA_AXE_OUT || '/tmp/qa/axe.json', JSON.stringify(all, null, 1));
  await s.close();
  // Light theme: same checks, on every tab, with the display layer (sentence case) switched on.
  const sl = await session({ feed: false, colorScheme: 'light', sentenceCase: true });
  await sl.load(QA); await sl.call('recalculateAllRanks'); await sl.page.waitForTimeout(2500);
  await T('THEME-01', 'Theme', 'Light follows the phone, Dark and Light buttons override it, and the choice is remembered', async () => {
    const th = () => sl.page.evaluate(() => ({ attr: document.documentElement.getAttribute('data-theme'), bg: getComputedStyle(document.body).backgroundColor, ls: localStorage.getItem('scout.theme') }));
    let t = await th();
    expect(t.attr === null && /246, 246, 247/.test(t.bg), 'auto in a light phone is light: ' + JSON.stringify(t));
    await sl.call('setThemePref', 'dark'); await sl.page.waitForTimeout(200); t = await th();
    expect(t.attr === 'dark' && /15, 15, 16/.test(t.bg) && t.ls === 'dark', 'Dark button: ' + JSON.stringify(t));
    await sl.call('setThemePref', 'light'); await sl.page.waitForTimeout(200); t = await th();
    expect(t.attr === 'light' && /246, 246, 247/.test(t.bg), 'Light button: ' + JSON.stringify(t));
    await sl.call('setThemePref', 'auto'); await sl.page.waitForTimeout(200); t = await th();
    expect(t.attr === null && t.ls === 'auto', 'Auto removes the override: ' + JSON.stringify(t));
  }, 'high');
  await T('CASE-01', 'Theme', 'Labels written in capitals are shown in sentence case, acronyms kept', async () => {
    await sl.go('HOME'); await sl.page.waitForTimeout(900);
    const t = await sl.text();
    expect(/Refresh everything/.test(t) && /Power up/.test(t) && !/POWER UP/.test(t) && !/REFRESH EVERYTHING/.test(t), 'Home labels: ' + t.slice(0, 300));
    await sl.go('RAID'); await sl.page.waitForTimeout(700);
    const r = await sl.text();
    expect(/Boss types \(pick up to 2\)/.test(r) && /Raid counters/.test(r) && /Fire/.test(r) && !/BOSS TYPES/.test(r), 'Raid labels');
    await sl.go('ROSTER'); await sl.page.waitForTimeout(700);
    const o = await sl.text();
    expect(/CP/.test(o) && /\bPvP ready\b/.test(o), 'CP stays capitalised, PvP is PvP');
  }, 'high');
  for (const scr of SCREENS) {
    await T('AXE-LIGHT-' + scr, 'Accessibility', `axe-core (light theme): no serious or critical violations on ${scr}`, async () => {
      await sl.go(scr); await sl.page.waitForTimeout(800);
      await sl.page.evaluate(src => { if (!window.axe) (0, eval)(src); }, AXE);
      const res = await sl.page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.id + '(' + v.nodes.length + ')'));
      expect(res.length === 0, res.join(', '));
    }, 'high');
  }
  await sl.close();
};
