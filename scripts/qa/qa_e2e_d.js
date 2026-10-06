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
  fs.writeFileSync(process.env.QA_AXE_OUT || '/tmp/qa/axe.json', JSON.stringify(all, null, 1));
  await s.close();
};
