// QA suite E: UI quality bar on every screen at iPhone width: touch targets, horizontal overflow, tiny text, unnamed controls, empty states.
const path = require('path');
const { T, expect, session, REPO } = require('./qa_lib');
const QA = path.join(REPO, 'scripts', 'fixtures', 'qa_roster.csv');
const SCREENS = ['TODAY', 'ROSTER', 'PVP', 'RAID', 'HOME', 'RECS', 'INTEL', 'ATTACK', 'LOG'];

// Runs in the page: every visible control with its size and name.
const SCAN = () => {
  const vis = el => { const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return null; const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return null; return r; };
  const controls = [...document.querySelectorAll('button, a[href], [role=button], [role=checkbox], [role=tab], input:not([type=hidden]), select, textarea, summary, [onclick]')];
  const small = [], unnamed = [];
  controls.forEach(el => {
    if (el.disabled || el.closest('[aria-hidden=true]')) return;
    const r = vis(el); if (!r) return;
    // a link inside a sentence is as big as its text line; the rule is for stand-alone controls
    const inline = el.tagName === 'A' && el.parentElement && el.parentElement.childNodes.length > 1 && getComputedStyle(el).display === 'inline';
    const label = (el.getAttribute('aria-label') || el.innerText || el.getAttribute('title') || el.getAttribute('placeholder') || '').trim();
    if (!label && el.tagName !== 'INPUT') unnamed.push((el.tagName + '.' + (el.className || '')).slice(0, 40));
    if (!inline && Math.min(r.width, r.height) < 44 && Math.max(r.width, r.height) < 44 * 3) small.push({ t: label.slice(0, 24) || el.tagName, w: Math.round(r.width), h: Math.round(r.height) });
  });
  const tiny = [...document.querySelectorAll('body *')].filter(el => el.children.length === 0 && el.textContent.trim() && vis(el) && parseFloat(getComputedStyle(el).fontSize) < 11).length;
  const root = document.documentElement.classList.contains('shell') ? document.querySelector('[data-app-scroll]') : document.documentElement;
  const overflowX = Math.max(0, (root ? root.scrollWidth : 0) - window.innerWidth);
  return { small, unnamed, tiny, overflowX };
};

module.exports = async function suiteE() {
  const s = await session({ feed: false });
  await s.load(QA); await s.call('recalculateAllRanks'); await s.page.waitForTimeout(2000);
  const res = {};
  for (const scr of SCREENS) {
    await s.go(scr); await s.page.waitForTimeout(700);
    res[scr] = await s.page.evaluate(SCAN);
    if (process.env.UI_VERBOSE) console.log('\n' + scr, JSON.stringify({ small: res[scr].small.slice(0, 40), unnamed: res[scr].unnamed.slice(0, 10), tiny: res[scr].tiny, overflowX: res[scr].overflowX }));
  }
  for (const scr of SCREENS) {
    await T('UI-' + scr, 'Layout', scr + ': every control is at least 44 px on one side, named, no sideways scroll, no text under 11 px', async () => {
      const r = res[scr];
      expect(r.overflowX <= 1, 'sideways overflow ' + r.overflowX + ' px');
      expect(r.unnamed.length === 0, r.unnamed.length + ' unnamed controls: ' + r.unnamed.slice(0, 5).join(', '));
      expect(r.tiny === 0, r.tiny + ' text runs under 11 px');
      expect(r.small.length === 0, r.small.length + ' controls under 44 px: ' + r.small.slice(0, 6).map(x => x.t + ' ' + x.w + 'x' + x.h).join('; '));
    }, 'high');
  }
  await s.close();
};
