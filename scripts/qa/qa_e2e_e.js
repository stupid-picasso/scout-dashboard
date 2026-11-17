// QA suite E: UI quality bar on every screen at iPhone width: touch targets, horizontal overflow, tiny text, unnamed controls, empty states.
const path = require('path');
const { T, expect, session, REPO } = require('./qa_lib');
const fs = require('fs');
const QA = path.join(REPO, 'scripts', 'fixtures', 'qa_roster.csv');
const SCREENS = ['TODAY', 'ROSTER', 'PVP', 'RAID', 'HOME', 'RECS', 'INTEL', 'ATTACK', 'LOG'];

// Runs in the page: every visible control with its size and name.
const SCAN = () => {
  const vis = el => { const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return null; const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return null; return r; };
  const controls = [...document.querySelectorAll('button, a[href], [role=button], [role=checkbox], [role=tab], input:not([type=hidden]), select, textarea, summary, [onclick]')];
  const small = [], unnamed = [];
  controls.forEach(el => {
    if (el.disabled || el.closest('[aria-hidden=true]')) return;
    let r = vis(el); if (!r) return;
    // a native checkbox/radio is as tappable as the label around it
    if (el.tagName === 'INPUT' && /checkbox|radio/.test(el.type) && el.closest('label')) r = el.closest('label').getBoundingClientRect();
    // a link inside a sentence is as big as its text line; the rule is for stand-alone controls
    const inline = el.tagName === 'A' && el.parentElement && el.parentElement.childNodes.length > 1 && getComputedStyle(el).display === 'inline';
    const label = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || el.getAttribute('placeholder') || (el.labels && el.labels[0] && el.labels[0].textContent) || '').trim();
    if (!label && el.tagName !== 'INPUT') unnamed.push((el.tagName + '.' + (el.className || '')).slice(0, 40));
    // the stylesheet gives every button a 44 px invisible tap strip (::before)
    const strip = parseFloat(getComputedStyle(el, '::before').height) >= 44 && getComputedStyle(el, '::before').content !== 'none';
    if (strip) r = { width: Math.max(r.width, 44), height: Math.max(r.height, 44) };
    if (!inline && Math.min(r.width, r.height) < 44 && Math.max(r.width, r.height) < 44 * 3) small.push({ t: label.slice(0, 24) || el.tagName, w: Math.round(r.width), h: Math.round(r.height) });
  });
  const tinyEls = [...document.querySelectorAll('body *')].filter(el => el.children.length === 0 && el.textContent.trim() && vis(el) && parseFloat(getComputedStyle(el).fontSize) < 11);
  const tiny = tinyEls.length; const tinySample = tinyEls.slice(0, 6).map(el => el.textContent.trim().slice(0, 18) + ' ' + getComputedStyle(el).fontSize);
  const root = document.documentElement.classList.contains('shell') ? document.querySelector('[data-app-scroll]') : document.documentElement;
  const overflowX = Math.max(0, (root ? root.scrollWidth : 0) - window.innerWidth);
  return { small, unnamed, tiny, tinySample, overflowX };
};


// ---------------------------------------------------------------------------------------------------------------
// UI polish checks (UIQ-xx). Zero tolerance; the only exceptions are the named allow-lists below, one comment each.
const SIZES = [12, 13, 15, 17, 22, 28, 32];          // type scale
const WEIGHTS = [400, 500, 600, 700];
const RADII = [6, 10, 14, 20];                        // plus pill (>=999) and 50%
const ALLOW_CAPS = ['PWA', 'GBL', 'GREAT', 'ULTRA', 'MASTER', 'LITTLE'];   // acronym-like words that are not shouting (also matched case-sensitively as a whole run)
const ALLOW_EMOJI = ['✓'];                       // check mark, used as a glyph in the evolve-done and verified marks
const BANNED_COPY = [/SYNC CSV/i, /Build dev/i, /^free$/i];
const MOTION_MS = [100, 160, 240, 360, 520];

// Runs in the page: conformance scans over everything visible.
const CONFORM = ({ SIZES, WEIGHTS, RADII }) => {
  const vis = el => { const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return null; const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none') return null; return r; };
  const hasText = el => [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
  const out = { type: [], radii: [], spacing: [], depth: [], stroke: [], emoji: [], caps: [], motion: [] };
  const all = [...document.body.querySelectorAll('*')].filter(el => !el.closest('svg') && !el.closest('.sr-only') && !el.closest('script,style,template,x-dc'));
  const emojiRe = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
  all.forEach(el => {
    const r = vis(el); if (!r) return;
    const cs = getComputedStyle(el);
    const tag = (el.tagName + '.' + String(el.className || '').split(' ')[0]).slice(0, 30);
    if (hasText(el)) {
      const sz = parseFloat(cs.fontSize), wt = parseInt(cs.fontWeight, 10);
      if (!SIZES.includes(sz) || !WEIGHTS.includes(wt)) out.type.push(tag + ' ' + sz + '/' + wt + ' "' + el.textContent.trim().slice(0, 14) + '"');
      const t = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(' ').trim();
      const m = t.match(/[A-Z0-9][A-Z0-9 \-\/&]{7,}/g);
      if (m) m.forEach(x => { if (/[A-Z]{3}/.test(x) && !/^[A-Z0-9 ]*\d/.test(x) ) out.caps.push(x.trim().slice(0, 30)); });
      if (el.closest('header, nav, button, [role=button], [role=menuitem], [data-swipe-row], [role=tab]') && emojiRe.test(t.replace(/✓/g, ''))) out.emoji.push(tag + ' ' + t.slice(0, 20));
    }
    ['TopLeft', 'TopRight', 'BottomLeft', 'BottomRight'].forEach(c => {
      const v = cs['border' + c + 'Radius']; if (!v || v === '0px') return;
      v.split(' ').forEach(x => { const n = parseFloat(x); if (!n) return; const ok = x.endsWith('%') ? n === 50 : (RADII.includes(n) || n >= 999); if (!ok) out.radii.push(tag + ' ' + v); });
    });
    // cards: filled surface with a big radius
    const bg = cs.backgroundColor, a = (bg.match(/[\d.]+/g) || []).map(Number);
    const filled = a.length >= 3 && (a.length === 3 || a[3] > 0.5);
    const rad = parseFloat(cs.borderTopLeftRadius) || 0;
    if (filled && rad >= 14 && rad < 999 && r.width > 120 && r.height > 40 && !el.closest('button, nav, [role=menu], input, select')) {
      ['Top', 'Right', 'Bottom', 'Left'].forEach(sd => { const p = parseFloat(cs['padding' + sd]); if (p % 4) out.spacing.push(tag + ' padding-' + sd + ' ' + p); });
      [cs.rowGap, cs.columnGap].forEach(g => { const p = parseFloat(g); if (p && p % 4) out.spacing.push(tag + ' gap ' + g); });
    }
    // panel nesting depth
    const panel = e => { const c = getComputedStyle(e); const b = (c.backgroundColor.match(/[\d.]+/g) || []).map(Number); const rr = parseFloat(c.borderTopLeftRadius) || 0; const rc = e.getBoundingClientRect(); return b.length >= 3 && (b.length === 3 || b[3] > 0.5) && rr >= 10 && rr < 999 && rc.width >= 120 && rc.height >= 40 && !/BUTTON|INPUT|SELECT|NAV|IMG|DETAILS/.test(e.tagName) && !e.closest('button, [role=menu], [role=dialog], [role=alertdialog], .ios-toast, [role=toolbar]') || false; };
    if (panel(el)) { let d = 0; for (let e = el; e && e !== document.body; e = e.parentElement) if (panel(e)) d++; if (d > 2) out.depth.push(tag + ' depth ' + d); }
    if (el.matches('header svg, nav svg, button svg')) {}
  });
  document.querySelectorAll('nav svg, header svg, button svg, [role=button] svg, [role=menuitem] svg').forEach(sv => {
    const w = sv.getAttribute('stroke-width') || (sv.querySelector('[stroke-width]') || { getAttribute: () => null }).getAttribute('stroke-width');
    if (sv.getBoundingClientRect().width > 0 && w != null && parseFloat(w) !== 1.75) out.stroke.push(w + ' ' + (sv.closest('button,nav,header,[role]') || sv).tagName);
  });
  // motion: computed durations
  all.forEach(el => {
    const cs = getComputedStyle(el);
    const list = (cs.transitionDuration + ',' + cs.animationDuration).split(',').map(x => x.trim()).filter(Boolean);
    const inf = cs.animationIterationCount.includes('infinite');
    list.forEach((d, i) => { const ms = parseFloat(d) * (d.endsWith('ms') ? 1 : 1000); if (!ms) return; if (![100, 160, 240, 360, 520].includes(Math.round(ms)) && !(inf && el.closest('[data-ambient]'))) out.motion.push(el.tagName + '.' + String(el.className || '').split(' ')[0] + ' ' + d); });
  });
  for (const k in out) out[k] = [...new Set(out[k])];
  return out;
};

// Runs in the page: WCAG contrast of every visible text node against its composited background.
const CONTRAST = () => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 1; const cx = cv.getContext('2d', { willReadFrequently: true });
  const cache = {};
  const rgba = c => { if (cache[c]) return cache[c]; cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return (cache[c] = [d[0], d[1], d[2], d[3] / 255]); };
  const over = (f, b) => { const a = f[3]; return [f[0] * a + b[0] * (1 - a), f[1] * a + b[1] * (1 - a), f[2] * a + b[2] * (1 - a), 1]; };
  const lum = c => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]); };
  const bgOf = el => { const chain = []; for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.backgroundImage !== 'none') return null; chain.push(rgba(cs.backgroundColor)); if (chain[chain.length - 1][3] >= 1) break; } let b = [255, 255, 255, 1]; if (!chain.length || chain[chain.length - 1][3] < 1) b = rgba(getComputedStyle(document.documentElement).backgroundColor); if (b[3] < 1) b = [0, 0, 0, 1]; for (let i = chain.length - 1; i >= 0; i--) b = over(chain[i], b); return b; };
  const op = el => { let o = 1; for (let e = el; e; e = e.parentElement) o *= +getComputedStyle(e).opacity; return o; };
  const bad = []; let n = 0;
  [...document.body.querySelectorAll('*')].forEach(el => {
    if (el.closest('svg, .sr-only, script, style, template, x-dc') || el.disabled || el.closest('[aria-hidden=true]')) return;
    if (![...el.childNodes].some(x => x.nodeType === 3 && x.textContent.trim())) return;
    const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none') return;
    const fg0 = rgba(cs.color); if (fg0[3] < .3) return;           // decorative watermark letters behind a sprite
    if (el.closest('[data-skip-contrast]')) return;
    const bg = bgOf(el); if (!bg) return;                          // gradients are skipped
    const o = op(el); const fg = over([fg0[0], fg0[1], fg0[2], fg0[3] * o], bg);
    const L1 = lum(fg), L2 = lum(bg); const ratio = (Math.max(L1, L2) + .05) / (Math.min(L1, L2) + .05);
    const sz = parseFloat(cs.fontSize), wt = parseInt(cs.fontWeight, 10);
    const large = sz >= 24 || (sz >= 18.66 && wt >= 700);
    n++;
    if (ratio < (large ? 3 : 4.5)) bad.push(((el.className && String(el.className).split(' ')[0]) || el.tagName) + ' "' + el.textContent.trim().slice(0, 16) + '" ' + ratio.toFixed(2));
  });
  return { n, bad: [...new Set(bad)] };
};

// Runs in the page: no name truncated, no word broken across lines.
const NAMES = () => {
  const bad = [];
  const chk = (el, what) => {
    if (!el || !el.getBoundingClientRect().width) return;
    if (el.scrollWidth > el.clientWidth + 1) bad.push(what + ' clipped: ' + el.textContent.trim().slice(0, 20));
    const t = el.firstChild; if (!t || t.nodeType !== 3) return;
    const txt = t.textContent; let i = 0;
    txt.split(/(\s+)/).forEach(w => { const len = w.length; if (w.trim().length > 1) { const rg = document.createRange(); rg.setStart(t, i); rg.setEnd(t, i + len); const rs = [...rg.getClientRects()].filter(x => x.width > 0); const tops = new Set(rs.map(x => Math.round(x.top))); if (tops.size > 1) bad.push(what + ' word broken: ' + w); } i += len; });
  };
  [...document.querySelectorAll('[data-swipe-row] [data-row-name]')].slice(0, 20).forEach(e => chk(e, 'roster name'));
  [...document.querySelectorAll('[data-pvp-name]')].forEach(e => chk(e, 'pvp name'));
  return bad;
};

const EDGE = () => {
  const bad = [];
  [...document.body.querySelectorAll('*')].forEach(el => {
    if (el.closest('[data-scroller], .sr-only, svg, script, style, template, x-dc')) return;
    const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return;
    const cs = getComputedStyle(el); if (cs.position === 'fixed' && el.closest('[role=menu]')) return;
    if (r.right > window.innerWidth + 1 && r.left < window.innerWidth) { let clipped = false; for (let e = el.parentElement; e; e = e.parentElement) { const o = getComputedStyle(e).overflowX; if (o !== 'visible' && e.getBoundingClientRect().right <= window.innerWidth + 1) { clipped = true; break; } } if (!clipped) bad.push((el.tagName + '.' + String(el.className || '').split(' ')[0]).slice(0, 30) + ' right ' + Math.round(r.right)); }
  });
  return [...new Set(bad)];
};

const VISIBLE_BTN_H = () => {
  const bad = [];
  document.querySelectorAll('button, [role=button], label.ios-icon-btn').forEach(el => {
    const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return; const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none') return;
    if (el.closest('[role=menuitem]')) return;
    const full = r.width > 300;   // a full-width list row is not a chip or a button face
    if (r.height > 48 && !full) bad.push((el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 20) + ' ' + Math.round(r.height));
  });
  return bad;
};

const LINT = () => {
  const out = { header: [], text: [], caption: [] };
  const h = document.querySelector('header'); if (h && /v\d+\.\d+/.test(h.innerText)) out.header.push(h.innerText.slice(0, 40));
  document.querySelectorAll('body *').forEach(el => { if (el.closest('svg, script, style, template, x-dc, .sr-only')) return; const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return; [...el.childNodes].forEach(n => { if (n.nodeType === 3 && n.textContent.trim()) out.text.push(n.textContent.trim()); }); });
  return out;
};

const SECTION_CAPTIONS = () => {
  // a section title (h2/h3 or 17-22px 600 text) followed directly by a caption block: no more than 2 lines of caption prose
  const bad = [];
  document.querySelectorAll('h2, h3, [data-section-title]').forEach(t => { const n = t.nextElementSibling; if (!n) return; const cs = getComputedStyle(n); const r = n.getBoundingClientRect(); if (r.height < 1 || n.children.length > 0 || !n.textContent.trim()) return; const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.3; const lines = Math.round(r.height / lh); if (lines > 2 && parseFloat(cs.fontSize) <= 15) bad.push(t.textContent.trim().slice(0, 20) + ' ' + lines + ' lines'); });
  return bad;
};

module.exports = async function suiteE() {
  const s = await session({ feed: false });
  await s.load(QA); await s.call('recalculateAllRanks'); await s.page.waitForTimeout(2000);
  const res = {};
  for (const scr of SCREENS) {
    await s.go(scr); await s.page.waitForTimeout(700);
    res[scr] = await s.page.evaluate(SCAN);
    if (process.env.UI_VERBOSE) console.log('\n' + scr, JSON.stringify({ small: res[scr].small.slice(0, 40), unnamed: res[scr].unnamed.slice(0, 10), tiny: res[scr].tiny, tinySample: res[scr].tinySample, overflowX: res[scr].overflowX }));
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

  // ---- UI polish scans, both themes, the way a user sees the app (sentence-case layer on, real feed and promo codes)
  const feed = JSON.parse(fs.readFileSync(path.join(REPO, 'data', 'feed.json'), 'utf8'));
  const promo = JSON.parse(fs.readFileSync(path.join(REPO, 'data', 'promo_codes.json'), 'utf8'));
  const R = {};
  for (const theme of ['dark', 'light']) {
    const q = await session({ feed, colorScheme: theme, sentenceCase: true, width: 390, height: 844 });
    await q.load(QA); await q.call('recalculateAllRanks'); await q.page.waitForTimeout(1500); await q.set({ promoCodes: promo });
    const per = {};
    for (const scr of SCREENS) {
      await q.go(scr); await q.page.waitForTimeout(900);
      per[scr] = { c: await q.page.evaluate(CONFORM, { SIZES, WEIGHTS, RADII }), k: await q.page.evaluate(CONTRAST), n: await q.page.evaluate(NAMES), h: await q.page.evaluate(VISIBLE_BTN_H), l: await q.page.evaluate(LINT), sc: await q.page.evaluate(SECTION_CAPTIONS) };
    }
    // an open toast
    await q.go('TODAY'); await q.set({ undoLabel: 'Transferred Latios' }); await q.page.waitForTimeout(600);
    per.TOAST = { k: await q.page.evaluate(CONTRAST) };
    per.TOAST.box = await q.page.evaluate(() => { const rc = e => { if (!e) return null; const r = e.getBoundingClientRect(); return r.width ? { l: r.left, t: r.top, r: r.right, b: r.bottom } : null; }; return { toast: rc(document.querySelector('.ios-toast')), title: rc(document.querySelector('header h1')), btns: [...document.querySelectorAll('header button, header label')].map(rc).filter(Boolean), nav: rc(document.querySelector('nav[data-navbar]')) }; });
    await q.set({ undoLabel: '' });
    R[theme] = per;
    // reduced motion: nothing keeps running on the detail sheet after 50 ms
    if (theme === 'dark') {
      await q.go('ROSTER'); await q.page.emulateMedia({ reducedMotion: 'reduce' });
      await q.page.locator('[data-swipe-row]').first().click(); await q.page.waitForTimeout(400);
      R.rm = await q.page.evaluate(() => document.getAnimations().filter(a => a.playState === 'running' && a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest('[role=dialog]')).map(a => (a.animationName || a.transitionProperty || '?')));
    }
    await q.close();
  }
  const agg = (key, f) => { const o = []; for (const th of ['dark', 'light']) for (const scr of SCREENS) o.push(...f(R[th][scr][key]).map(x => th + '/' + scr + ': ' + x)); return o; };
  const lim = (a, n = 6) => a.length + ' e.g. ' + a.slice(0, n).join(' | ');
  await T('UIQ-01', 'Polish', 'Type scale: every visible text is 12/13/15/17/22/28/32 px at weight 400-700', async () => { const b = agg('c', c => c.type); expect(b.length === 0, lim(b)); }, 'high');
  await T('UIQ-02', 'Polish', 'Radii: every corner is 6/10/14/20 px, a pill or 50%', async () => { const b = agg('c', c => c.radii); expect(b.length === 0, lim(b)); }, 'high');
  await T('UIQ-03', 'Polish', 'Spacing: card padding and gap are multiples of 4; filled panels nest at most 2 deep', async () => { const b = agg('c', c => c.spacing.concat(c.depth)); expect(b.length === 0, lim(b)); }, 'high');
  for (const th of ['dark', 'light']) await T('UIQ-04-' + th, 'Polish', 'Contrast ' + th + ': text clears 4.5:1 (3:1 large) on its composited background, toast included', async () => { const b = []; for (const scr of SCREENS.concat('TOAST')) b.push(...R[th][scr].k.bad.map(x => scr + ': ' + x)); expect(b.length === 0, lim(b)); }, 'high');
  await T('UIQ-05', 'Polish', 'One icon family: no emoji in chrome, one stroke width in nav and button icons', async () => { const b = agg('c', c => c.emoji.concat(c.stroke)); expect(b.length === 0, lim(b)); }, 'high');
  await T('UIQ-06', 'Polish', 'Names are never truncated or broken mid-word (first 20 roster rows, all PvP rows)', async () => { const b = agg('n', n => n); expect(b.length === 0, lim(b)); }, 'high');
  await T('UIQ-08', 'Polish', 'An open toast does not cover the header title, header buttons or the tab bar', async () => {
    for (const th of ['dark', 'light']) { const { toast, title, btns, nav } = R[th].TOAST.box; expect(toast, 'no toast'); const hit = r => r && !(toast.r <= r.l || toast.l >= r.r || toast.b <= r.t || toast.t >= r.b); expect(!hit(title) && !btns.some(hit) && !hit(nav), th + ' toast overlaps'); }
  }, 'high');
  await T('UIQ-09', 'Polish', 'Copy: no all-caps runs, no version in the header, no banned labels, short captions under titles', async () => {
    const b = [];
    for (const th of ['dark', 'light']) for (const scr of SCREENS) {
      const L = R[th][scr]; L.l.header.forEach(x => b.push('header ' + x));
      L.c.caps.filter(x => !ALLOW_CAPS.includes(x)).forEach(x => b.push('caps ' + x));
      L.l.text.forEach(t => BANNED_COPY.forEach(re => { if (re.test(t)) b.push('banned ' + t.slice(0, 20)); }));
      L.sc.forEach(x => b.push('caption ' + x));
    }
    expect(b.length === 0, lim([...new Set(b)]));
  }, 'high');
  await T('UIQ-10', 'Polish', 'Motion tokens: durations are 100/160/240/360/520 ms (infinite only on [data-ambient]); reduced motion stops the detail sheet', async () => {
    const b = agg('c', c => c.motion); expect(b.length === 0, lim(b)); expect(R.rm.length === 0, 'running under reduced motion: ' + R.rm.join(','));
  }, 'high');
  await T('UIQ-12', 'Polish', 'No visible button or chip is taller than 48 px (guards the 44 px blanket regression)', async () => { const b = agg('h', h => h); expect(b.length === 0, lim(b)); }, 'high');

  // ---- widths
  for (const width of [320, 390, 402, 768]) {
    const w = await session({ feed: false, width, height: width >= 768 ? 1024 : 844 });
    await w.load(QA); await w.page.waitForTimeout(1200);
    const bad = [];
    for (const scr of SCREENS) { await w.go(scr); await w.page.waitForTimeout(500); const o = await w.page.evaluate(() => { const root = document.documentElement; return Math.max(0, root.scrollWidth - window.innerWidth); }); if (o > 1) bad.push(scr + ' overflowX ' + o); const e = await w.page.evaluate(EDGE); e.slice(0, 3).forEach(x => bad.push(scr + ' ' + x)); }
    await T('UIQ-07-' + width, 'Polish', 'Width ' + width + ': no sideways overflow on any screen, nothing past the right edge outside [data-scroller]', async () => expect(bad.length === 0, lim(bad)), 'high');
    await w.close();
  }
  // ---- empty-state contract
  for (const theme of ['dark', 'light']) {
    const q = await session({ feed, colorScheme: theme, sentenceCase: true, width: 390, height: 844 });
    await q.page.waitForTimeout(1500);
    const bad = [];
    for (const scr of ['TODAY', 'ROSTER', 'PVP', 'RECS']) {
      await q.go(scr); await q.page.waitForTimeout(700);
      const o = await q.page.evaluate(() => {
        const vis = el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
        const fixedUp = el => { for (let e = el; e; e = e.parentElement) if (getComputedStyle(e).position === 'fixed') return true; return false; };
        const prim = [...document.querySelectorAll('button, label, [role=button]')].filter(el => vis(el) && getComputedStyle(el).backgroundColor === 'rgb(10, 100, 214)' && !el.closest('nav, header, .ios-toast') && !fixedUp(el));
        return { n: prim.length, th: [...document.querySelectorAll('[data-table-header]')].filter(vis).length };
      });
      if (o.n !== 1) bad.push(scr + ' primary buttons ' + o.n);
      if (o.th) bad.push(scr + ' table header visible');
    }
    await T('UIQ-11-' + theme, 'Polish', 'Empty roster (' + theme + '): Today, Roster, PvP and Recs each show exactly one primary button and no table header', async () => expect(bad.length === 0, lim(bad)), 'high');
    await q.close();
  }
};
