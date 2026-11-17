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
const ALLOW_CAPS = [
  'XXL / XXS',                                  // size-class acronyms (chip label)
  'EXCELLENT'                                   // keeper grade name: a logic key (TOP / EXCELLENT / GOOD) quoted in the grade explanation
];
const BANNED_COPY = [/SYNC CSV/i, /Build dev/i, /^free$/i];
// Linted over the joined visible text (innerText), so a label split over several text nodes cannot hide: "Build dev", a trailing "· free".
const BANNED_JOINED = [/Build dev/i, /\u00b7\s*free\s*$/im, /SYNC CSV/i];
const EXTRA = ['BULK', 'BESTIV', 'DITTO', 'KEEP', 'TOOLS'];   // More destinations that are not in SCREENS
const STATES = ['TODAY_OPEN', 'MORE', 'DETAIL', 'DETAIL_END', 'SELECT', 'CHAT', 'LONG'];   // menus and sheets
const SCANNED = SCREENS.concat(EXTRA, STATES);
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
      const m = el.closest('[data-promo-card]') ? null : t.match(/[A-Z0-9][A-Z0-9 \-\/&]{7,}/g);   // promo codes are shown verbatim
      if (m) m.forEach(x => { if (/[A-Z]{3}/.test(x) && !/^[A-Z0-9 ]*\d/.test(x) ) out.caps.push(x.trim().slice(0, 30)); });
      if (el.closest('header, nav, button, [role=button], [role=menuitem], [data-swipe-row], [role=tab]') && emojiRe.test(t.replace(/[\u2713\u2640\u2642]/g, ''))   /* check mark; the gender signs belong to the species names Nidoran-f and Nidoran-m */) out.emoji.push(tag + ' ' + t.slice(0, 20));
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
      ['Top', 'Bottom'].forEach(sd => { const m = parseFloat(cs['margin' + sd]); if (m && Math.abs(m) % 4) out.spacing.push(tag + ' margin-' + sd + ' ' + m); });   // vertical rhythm between cards
    }
    // panel nesting depth
    const panel = e => { const c = getComputedStyle(e); const b = (c.backgroundColor.match(/[\d.]+/g) || []).map(Number); const rr = parseFloat(c.borderTopLeftRadius) || 0; const rc = e.getBoundingClientRect(); return b.length >= 3 && (b.length === 3 || b[3] > 0.5) && rr >= 10 && rr < 999 && rc.width >= 120 && rc.height >= 40 && !/BUTTON|INPUT|SELECT|NAV|IMG|DETAILS/.test(e.tagName) && !e.closest('button, [role=menu], [role=dialog], [role=alertdialog], .ios-toast, [role=toolbar]') || false; };
    if (panel(el)) { let d = 0; for (let e = el; e && e !== document.body; e = e.parentElement) if (panel(e)) d++; if (d > 2) out.depth.push(tag + ' depth ' + d); }
    if (el.matches('header.app-header, [role=main] > *') && (el.matches('header') || (filled && rad >= 14))) ['Top', 'Bottom'].forEach(sd => { const m = parseFloat(cs['margin' + sd]); if (m && Math.abs(m) % 4) out.spacing.push(tag + ' margin-' + sd + ' ' + m); });
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
  // stylesheets: every transition/animation duration written in a rule outside the reduced-motion block
  const walkRules = (rules, inRM) => [...rules].forEach(rule => {
    if (rule.cssRules && rule.media) return walkRules(rule.cssRules, inRM || /reduced-motion/.test(rule.media.mediaText));
    if (rule.cssRules && rule.type === 4) return;
    if (inRM || !rule.style) return;
    ['transition', 'animation'].forEach(pn => { const v = rule.style.getPropertyValue(pn); if (!v) return; const inf = /infinite/.test(v);
      (v.match(/(?<![\w.-])\d*\.?\d+m?s\b/g) || []).forEach(d => { const ms = parseFloat(d) * (d.endsWith('ms') ? 1 : 1000); if (ms && ![100, 160, 240, 360, 520].includes(Math.round(ms)) && !(inf && /data-ambient/.test(rule.selectorText || '')) && !/sc-dc-streaming/.test(rule.selectorText || ''))   /* sc-dc-streaming: the host runtime's own placeholder shimmer in the bundle head, not app CSS */ out.motion.push('css ' + (rule.selectorText || '').slice(0, 30) + ' ' + d); }); });
  });
  [...document.styleSheets].forEach(ss => { try { walkRules(ss.cssRules, false); } catch (e) {} });
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
    const bg = bgOf(el); if (!bg) return;                          // gradients are skipped
    const o = op(el); const fg = over([fg0[0], fg0[1], fg0[2], fg0[3] * o], bg);
    const L1 = lum(fg), L2 = lum(bg); const ratio = (Math.max(L1, L2) + .05) / (Math.min(L1, L2) + .05);
    const sz = parseFloat(cs.fontSize), wt = parseInt(cs.fontWeight, 10);
    const large = sz >= 24 || (sz >= 18.66 && wt >= 700);
    n++;
    if (ratio < (large ? 3 : 4.5)) bad.push(((el.className && String(el.className).split(' ')[0]) || el.tagName) + ' "' + el.textContent.trim().slice(0, 16) + '" ' + ratio.toFixed(2) + ' fg ' + cs.color.replace(/ /g, '') + ' bg ' + bg.map(Math.round).join(',') + (window.__contrastDebug ? ' ' + el.outerHTML.slice(0, 140) : ''));
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
  const fixedUp = el => { for (let e = el; e; e = e.parentElement) if (getComputedStyle(e).position === 'fixed') return true; return false; };
  document.querySelectorAll('button, [role=button], label.ios-icon-btn').forEach(el => {
    const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return; const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none') return;
    if (el.closest('[role=menuitem]')) return;
    const full = r.width > 300 || !!el.querySelector('img');   // a full-width list row, or a card with a sprite in it (a button element used as a tappable card), is not a chip or a button face
    // not a chip or a button face: a clickable row/card (two or more block children), or an action that fills its container's height (the swipe actions behind a roster row)
    const kids = [...el.children].filter(c => /block|flex|grid/.test(getComputedStyle(c).display)).length;
    const fills = el.parentElement && el.parentElement.getBoundingClientRect().height - r.height < 2;
    const txt = (el.textContent || '').trim();
    const pill = parseFloat(cs.borderTopLeftRadius) >= 999 && txt && !el.querySelector('img') && r.width < 300 && !fixedUp(el);
    if (pill && r.height > 40) bad.push('chip too tall: ' + txt.slice(0, 20) + ' ' + Math.round(r.height));          // chips and pills keep their own height; 44 px comes from the invisible strip
    if (pill && cs.backgroundColor === 'rgb(10, 100, 214)' && txt.length >= 5 && txt.length < 24 && !el.hasAttribute('aria-pressed') && (r.height < 36 || r.height > 40) && r.height < 60) bad.push('filled button not 36-40: ' + txt.slice(0, 20) + ' ' + Math.round(r.height));
    if (r.height > 48 && !full && kids < 2 && !fills) bad.push((el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 20) + ' ' + Math.round(r.height));
  });
  return bad;
};

const LINT = () => {
  const out = { header: [], text: [], caption: [], inner: document.body.innerText };
  const h = document.querySelector('header'); if (h && /v\d+\.\d+/.test(h.innerText)) out.header.push(h.innerText.slice(0, 40));
  document.querySelectorAll('body *').forEach(el => { if (el.closest('svg, script, style, template, x-dc, .sr-only')) return; const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return; [...el.childNodes].forEach(n => { if (n.nodeType === 3 && n.textContent.trim()) out.text.push(n.textContent.trim()); }); });
  return out;
};

const SECTION_CAPTIONS = () => {
  // a heading (h1-h3, or any short text of weight 600+ and 13 px or more) followed directly by a plain text block: no more than 2 lines of prose.
  // The heading's size does not matter: a 13 px coloured heading gets the same rule as a 22 px title.
  const bad = [];
  const vis = e => { const r = e.getBoundingClientRect(); return r.height > 0 && r.width > 0 && getComputedStyle(e).visibility !== 'hidden'; };
  const card = e => { if (!e) return false; const cs = getComputedStyle(e); const a = (cs.backgroundColor.match(/[\d.]+/g) || []).map(Number); return a.length >= 3 && (a.length === 3 || a[3] > 0.5) && parseFloat(cs.borderTopLeftRadius) >= 10 && e.getBoundingClientRect().width > 200; };
  const titles = [...document.body.querySelectorAll('h1, h2, h3, div, span, summary')].filter(t => { if (t.closest('svg, script, style, template, x-dc, nav, button, [role=menuitem], [data-swipe-row]')) return false; if (t.children.length > 1 || !t.textContent.trim() || t.textContent.length > 60) return false; const cs = getComputedStyle(t); if (!vis(t)) return false; if (/^H[123]$/.test(t.tagName) || t.hasAttribute('data-section-title')) return true; if (parseFloat(cs.fontSize) >= 17 && parseInt(cs.fontWeight, 10) >= 600 && t.parentElement && t.parentElement.children.length > 1) return true;   // the original rule: any 17 px+ title with a sibling
    return parseFloat(cs.fontSize) >= 13 && parseInt(cs.fontWeight, 10) >= 600 && t.parentElement && t.parentElement.firstElementChild === t && card(t.parentElement); });   // plus any card heading, whatever its size
  titles.forEach(t => { const n = t.nextElementSibling; if (!n || !vis(n) || n.children.length > 1 || !n.textContent.trim() || n.tagName === 'DETAILS') return; const cs = getComputedStyle(n); const r = n.getBoundingClientRect(); const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.3; const lines = Math.round(r.height / lh); if (lines > 2 && parseFloat(cs.fontSize) <= 15 ) bad.push(t.textContent.trim().slice(0, 20) + ' ' + lines + ' lines'); });
  return [...new Set(bad)];
};

// ---------------------------------------------------------------------------------------------------------------
// Pass 2 scans.
// Text that is clipped by its own box inside a row (ellipsis or overflow hidden), anywhere under `sel`.
const CLIPPED = ({ sel, strict }) => {
  const bad = [];
  document.querySelectorAll(sel).forEach(root => root.querySelectorAll('*').forEach(el => {
    if (el.closest('svg') || el.matches('button, [role=button], [role=checkbox], summary, label, input')) return;   // controls carry an invisible 44 px tap strip that counts in scrollWidth
    const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return;
    if (!strict && getComputedStyle(el).overflowX === 'visible') return;   // text that is only spilling out is the edge check's job; this finds text cut by its own box
    if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) bad.push((el.tagName + '.' + String(el.className || '').split(' ')[0]).slice(0, 24) + ' "' + (el.textContent || '').trim().slice(0, 22) + '" ' + el.scrollWidth + '>' + el.clientWidth);
  }));
  return [...new Set(bad)];
};
// A row's second line: no lone check mark, no dangling dash.
const ROWLINES = () => {
  const bad = [];
  [...document.querySelectorAll('[data-swipe-row]')].slice(0, 30).forEach(row => {
    const t = row.innerText.replace(/\s+/g, ' ');
    if (/(^|\s)[\u2014\u2013-]($|\s)/.test(t) || /\u00b7\s*[\u2014-]\s*$/.test(t)) bad.push('dash: ' + t.slice(0, 40));
    row.querySelectorAll('svg[aria-label="IVs measured"]').forEach(sv => { const n = sv.nextElementSibling; if (!n || !n.textContent.trim()) bad.push('lone check: ' + t.slice(0, 30)); });
  });
  return bad;
};
// Prose that is crushed into a narrow column: three or more lines at fewer than 12 characters per line.
const NARROW = () => {
  const bad = [];
  document.body.querySelectorAll('*').forEach(el => {
    if (el.children.length || el.closest('svg, script, style, template, x-dc, .sr-only, [data-scroller], button, [role=menuitem], input, textarea, select, code')) return;
    const txt = el.textContent.trim(); if (txt.length < 16) return;
    const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return; const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.whiteSpace === 'nowrap' || cs.display === 'inline') return;
    const rg = document.createRange(); rg.selectNodeContents(el); const lines = new Set([...rg.getClientRects()].filter(x => x.width > 0).map(x => Math.round(x.top / 4))).size;   // rendered lines, not box height
    if (lines >= 3 && txt.length / lines < 12) bad.push('"' + txt.slice(0, 24) + '" ' + lines + ' lines, ' + Math.round(r.width) + ' px');
  });
  return bad;
};
// Card headings: the first text child of a filled card is one style (22 px, the text colour).
const HEADINGS = () => {
  const bad = []; const vis = e => { const r = e.getBoundingClientRect(); return r.height > 0 && r.width > 0; };
  const filled = e => { const cs = getComputedStyle(e); const a = (cs.backgroundColor.match(/[\d.]+/g) || []).map(Number); return a.length >= 3 && (a.length === 3 || a[3] > 0.5) && parseFloat(cs.borderTopLeftRadius) >= 14 && e.getBoundingClientRect().width > 200; };
  const probe = document.createElement('i'); probe.style.color = 'var(--text)'; document.body.appendChild(probe); const body = getComputedStyle(probe).color; probe.remove();
  document.querySelectorAll('[role=main] div, [role=main] section').forEach(card => {
    if (!filled(card) || !vis(card) || card.matches('[role=button], .ui-row-link') || card.closest('button, [role=menu], [data-swipe-row], details')) return;   // a tappable list row is not a card with a heading
    const h = card.firstElementChild; if (!h || h.children.length || !vis(h)) return; const t = h.textContent.trim(); if (t.length < 3 || t.length > 40) return;
    const cs = getComputedStyle(h); if (parseInt(cs.fontWeight, 10) < 600 || parseFloat(cs.fontSize) < 13) return;
    if (parseFloat(cs.fontSize) !== 22 || cs.color !== body) bad.push(t.slice(0, 24) + ' ' + cs.fontSize + ' ' + cs.color);
  });
  return bad;
};
// Filled primary buttons on a screen (outside the tab bar and sheets): at most 3.
const FILLED = () => {
  const fixedUp = el => { for (let e = el; e; e = e.parentElement) if (getComputedStyle(e).position === 'fixed') return true; return false; };
  const out = { fills: [], showAll: [], markDone: [] };
  document.querySelectorAll('button, [role=button], label').forEach(el => {
    const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return; const cs = getComputedStyle(el); const txt = (el.textContent || '').trim();
    if (cs.backgroundColor === 'rgb(10, 100, 214)' && !fixedUp(el) && !el.closest('nav, header') && txt.length > 2 && el.getAttribute('aria-pressed') == null) out.fills.push(txt.slice(0, 20));
    if (/^show all \d+$/i.test(txt) && !el.classList.contains('ui-btn-plain')) out.showAll.push(txt);
    if (/^mark done$/i.test(txt) && !el.classList.contains('ui-btn-tint')) out.markDone.push(txt);
  });
  return out;
};
const TODAY_SHAPE = () => {
  const m = document.querySelector('[role=main]'); const vis = e => { const r = e.getBoundingClientRect(); return r.height > 0 && r.width > 0; };
  const kids = [...m.children].filter(vis); const tops = kids.map(c => c.getBoundingClientRect().top);
  const orders = [...m.querySelectorAll('*')].filter(e => getComputedStyle(e).order !== '0' && e.parentElement && /flex|grid/.test(getComputedStyle(e.parentElement).display)).map(e => e.tagName + ' order ' + getComputedStyle(e).order);
  const strips = [...document.querySelectorAll('.stat-strip, [role=main] [data-scroller]')].filter(vis).length;
  const tail = document.querySelector('[data-today-tail-toggle]');
  return { h: document.documentElement.scrollHeight, vh: window.innerHeight, orders, mono: tops.every((t, i) => !i || t >= tops[i - 1] - 1), strips, tail: !!tail, tailOpen: tail && tail.getAttribute('aria-expanded') === 'true', first: kids.map(c => (c.innerText || '').trim().slice(0, 18)) };
};
const OVERLAP = () => {
  const b = document.querySelector('button[aria-label="Ask the Professor"]'); if (!b) return [];
  const rb = b.getBoundingClientRect(); if (rb.width < 1) return [];
  const hit = r => !(rb.right <= r.left || rb.left >= r.right || rb.bottom <= r.top || rb.top >= r.bottom);
  const bad = [];
  document.querySelectorAll('[role=menu], [role=dialog]:not([aria-label="Ask the Professor"]), [role=alertdialog], [data-select-bar]').forEach(sc => { if (sc.getBoundingClientRect().width < 1) return; if (sc.matches('[role=menu],[role=dialog],[role=alertdialog]')) bad.push('bubble shown above ' + (sc.getAttribute('aria-label') || sc.getAttribute('role'))); sc.querySelectorAll('[role=menuitem], button, input, textarea, select, [role=button], a').forEach(el => { const r = el.getBoundingClientRect(); if (r.width > 0 && hit(r)) bad.push((el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 24)); }); });
  return bad;
};
const GEOM768 = () => {
  const m = document.querySelector('[role=main]'); const rm = m.getBoundingClientRect(); const bad = [];
  const h1 = document.querySelector('header h1'); if (h1 && Math.abs(h1.getBoundingClientRect().left - rm.left) > 1) bad.push('header title left ' + Math.round(h1.getBoundingClientRect().left) + ' vs main ' + Math.round(rm.left));
  const hb = [...document.querySelectorAll('header button, header label')].filter(b => b.getBoundingClientRect().width > 0 && !b.closest('.ios-toast')); const last = hb.map(b => b.getBoundingClientRect().right).sort((a, b) => b - a)[0];
  if (last != null && Math.abs(last - rm.right) > 1) bad.push('header buttons right ' + Math.round(last) + ' vs main ' + Math.round(rm.right));
  document.querySelectorAll('[role=menu], [data-select-bar]').forEach(e => { const r = e.getBoundingClientRect(); if (r.width > 0 && (r.width > 561 || Math.abs((r.left + r.right) / 2 - window.innerWidth / 2) > 1)) bad.push((e.getAttribute('aria-label') || 'select bar') + ' width ' + Math.round(r.width) + ' left ' + Math.round(r.left)); });
  // everything on the page: a card that fell outside [role=main] (an unclosed tag) is as wide as the screen
  const fixedUp = e => { for (let x = e; x; x = x.parentElement) if (getComputedStyle(x).position === 'fixed') return true; return false; };
  [...document.querySelectorAll('.app-root *')].forEach(e => { const r = e.getBoundingClientRect(); if (r.width > 561 && r.height > 0 && !e.closest('[data-scroller], svg, header, nav, .stat-strip') && !fixedUp(e) && !e.matches('.app-root, .app-root > div:empty')) bad.push((e.tagName + '.' + String(e.className || '').split(' ')[0]).slice(0, 24) + ' ' + Math.round(r.width)); });
  return [...new Set(bad)];
};
const HEADERCELLS = () => {
  // a table header's cells must not touch: neither their boxes nor the text they hold (text that runs on into the next column)
  const bad = [];
  const textBox = c => { const rg = document.createRange(); rg.selectNodeContents(c); const rs = [...rg.getClientRects()].filter(x => x.width > 0); if (!rs.length) return null; return { left: Math.min(...rs.map(x => x.left)), right: Math.max(...rs.map(x => x.right)), top: Math.min(...rs.map(x => x.top)), bottom: Math.max(...rs.map(x => x.bottom)) }; };
  const hit = (a, b) => !(a.right <= b.left + 0.5 || b.right <= a.left + 0.5 || a.bottom <= b.top || b.bottom <= a.top);
  document.querySelectorAll('[data-table-header]').forEach(h => {
    if (h.getBoundingClientRect().width < 1) return;
    const cells = [...h.children].filter(c => c.getBoundingClientRect().width > 0);
    const boxes = cells.map(c => c.getBoundingClientRect()), texts = cells.map(textBox);
    for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) {
      if (hit(boxes[i], boxes[j])) bad.push('cells overlap: ' + cells[i].textContent.trim() + ' / ' + cells[j].textContent.trim());
      if (texts[i] && texts[j] && hit({ left: texts[i].left - 4, right: texts[i].right + 4, top: texts[i].top, bottom: texts[i].bottom }, texts[j])) bad.push('text runs into its neighbour (less than 4 px between): ' + cells[i].textContent.trim() + ' / ' + cells[j].textContent.trim());
    }
    cells.forEach((c, i) => { const r = boxes[i], t = texts[i]; if (t && (t.right > r.right + 1 || t.left < r.left - 1)) bad.push('text runs out of its cell: ' + c.textContent.trim().slice(0, 16)); });
  });
  return bad;
};

// Opens a screen, a menu or a sheet on a session; closeState undoes it.
async function openState(q, st) {
  const p = q.page;
  if (SCREENS.includes(st) || EXTRA.includes(st)) { await q.go(st); await p.waitForTimeout(900); return; }
  if (st === 'TODAY_OPEN') { await q.go('TODAY'); await p.locator('[data-today-tail-toggle]').click(); await p.waitForTimeout(500); return; }
  if (st === 'MORE') { await q.go('TODAY'); await p.getByText('More', { exact: true }).last().click(); await p.waitForTimeout(600); return; }
  if (st === 'DETAIL') { await q.go('ROSTER'); await p.locator('[data-swipe-row]').first().click(); await p.waitForTimeout(1200); return; }
  if (st === 'DETAIL_END') { await p.evaluate(() => { const d = document.querySelector('[role=dialog][aria-label="Pokemon details"]'); if (d) d.scrollTop = d.scrollHeight; }); await p.waitForTimeout(500); return; }
  if (st === 'SELECT') { await q.go('ROSTER'); await q.call('toggleSelectMode'); await p.waitForTimeout(400); await q.call('toggleSelect', 0); await q.call('toggleSelect', 1); await p.waitForTimeout(300); return; }
  if (st === 'CHAT') { await q.go('TODAY'); await q.set({ chatOpen: true }); await p.waitForTimeout(700); return; }
  if (st === 'LONG') { await q.go('ROSTER'); const idx = await p.evaluate(() => document.querySelector('[data-swipe-row]').getAttribute('data-swipe-row')); await q.call('openRosterActionMenu', idx); await p.waitForTimeout(600); return; }
}
async function closeState(q, st) {
  const p = q.page;
  if (st === 'MORE') await q.set({ moreOpen: false });
  if (st === 'DETAIL_END') await q.call('closeDetail').catch(() => {});
  if (st === 'SELECT') await q.call('toggleSelectMode').catch(() => {});
  if (st === 'CHAT') await q.set({ chatOpen: false });
  if (st === 'LONG') await q.call('closeConfirm').catch(() => {});
  await p.waitForTimeout(300);
}

module.exports = async function suiteE() {
  const only = process.env.UIQ_ONLY ? new RegExp(process.env.UIQ_ONLY) : null;   // mutation checks: UIQ_ONLY="UIQ-13|UIQ-16" runs just those tests
  const want = x => !only || only.test(x);
  if (want('UI-')) {
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
  }

  // ---- UI polish scans, both themes, the way a user sees the app (sentence-case layer on, real feed and promo codes)
  const feed = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts', 'fixtures', 'ui_feed.json'), 'utf8'));
  const promo = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts', 'fixtures', 'ui_promo.json'), 'utf8'));
  const R = {};
  const lim = (a, n = +process.env.UIQ_N || 6) => a.length + ' e.g. ' + a.slice(0, n).join(' | ');
  let agg = null;
  if (['UIQ-01', 'UIQ-02', 'UIQ-03', 'UIQ-04', 'UIQ-05', 'UIQ-06', 'UIQ-08', 'UIQ-09', 'UIQ-10', 'UIQ-12', 'UIQ-18'].some(want)) {
  for (const theme of ['dark', 'light']) {
    const q = await session({ collapsedTail: true, feed, colorScheme: theme, sentenceCase: true, width: 390, height: 844 });
    await q.load(QA); await q.call('recalculateAllRanks'); await q.page.waitForTimeout(1500); await q.set({ promoCodes: promo });
    const per = {};
    for (const scr of SCANNED) {
      try { await openState(q, scr); } catch (e) { throw new Error('openState ' + scr + ': ' + String(e.message).split('\n')[0]); }
      per[scr] = { c: await q.page.evaluate(CONFORM, { SIZES, WEIGHTS, RADII }), k: await q.page.evaluate(CONTRAST), n: await q.page.evaluate(NAMES), h: await q.page.evaluate(VISIBLE_BTN_H), l: await q.page.evaluate(LINT), sc: await q.page.evaluate(SECTION_CAPTIONS), ko: await (async () => { await q.page.evaluate(() => document.querySelectorAll('details').forEach(d => { d.open = true; })); await q.page.waitForTimeout(150); return q.page.evaluate(CONTRAST); })(), f: await q.page.evaluate(FILLED), hd: await q.page.evaluate(HEADINGS), nw: await q.page.evaluate(NARROW) };
      await closeState(q, scr);
    }
    // an open toast
    await q.go('TODAY'); await q.set({ undoLabel: 'Transferred Latios' }); await q.page.waitForTimeout(600);
    per.TOAST = { k: await q.page.evaluate(CONTRAST) };
    per.TOAST.box = await q.page.evaluate(() => { const rc = e => { if (!e) return null; const r = e.getBoundingClientRect(); return r.width ? { l: r.left, t: r.top, r: r.right, b: r.bottom } : null; }; return { toast: rc(document.querySelector('.ios-toast')), title: rc(document.querySelector('header h1')), btns: [...document.querySelectorAll('header button, header label')].filter(b => !b.closest('.ios-toast')).map(rc).filter(Boolean), nav: rc(document.querySelector('nav[data-navbar]')) }; });
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
  agg = (key, f) => { const o = []; for (const th of ['dark', 'light']) for (const scr of SCANNED) o.push(...f(R[th][scr][key]).map(x => th + '/' + scr + ': ' + x)); return o; };
  // (lim is defined above)
  await T('UIQ-01', 'Polish', 'Type scale: every visible text is 12/13/15/17/22/28/32 px at weight 400-700', async () => { const b = agg('c', c => c.type); expect(b.length === 0, lim(b)); }, 'high');
  await T('UIQ-02', 'Polish', 'Radii: every corner is 6/10/14/20 px, a pill or 50%', async () => { const b = agg('c', c => c.radii); expect(b.length === 0, lim(b)); }, 'high');
  await T('UIQ-03', 'Polish', 'Spacing: card padding and gap are multiples of 4; filled panels nest at most 2 deep', async () => { const b = agg('c', c => c.spacing.concat(c.depth)); expect(b.length === 0, lim(b)); }, 'high');
  for (const th of ['dark', 'light']) await T('UIQ-04-' + th, 'Polish', 'Contrast ' + th + ': text clears 4.5:1 (3:1 large) on its composited background, toast included', async () => { const b = []; for (const scr of SCANNED.concat('TOAST')) { b.push(...R[th][scr].k.bad.map(x => scr + ': ' + x)); if (R[th][scr].ko) b.push(...R[th][scr].ko.bad.map(x => scr + ' (disclosures open): ' + x)); } expect(b.length === 0, lim(b)); }, 'high');
  await T('UIQ-05', 'Polish', 'One icon family: no emoji in chrome, one stroke width in nav and button icons', async () => { const b = agg('c', c => c.emoji.concat(c.stroke)); expect(b.length === 0, lim(b)); }, 'high');
  await T('UIQ-06', 'Polish', 'Names are never truncated or broken mid-word (first 20 roster rows, all PvP rows)', async () => { const b = agg('n', n => n); expect(b.length === 0, lim(b)); }, 'high');
  await T('UIQ-08', 'Polish', 'An open toast does not cover the header title, header buttons or the tab bar', async () => {
    for (const th of ['dark', 'light']) { const { toast, title, btns, nav } = R[th].TOAST.box; expect(toast, 'no toast'); const hit = r => r && !(toast.r <= r.l || toast.l >= r.r || toast.b <= r.t || toast.t >= r.b); expect(!hit(title) && !btns.some(hit) && !hit(nav), th + ' toast overlaps'); }
  }, 'high');
  await T('UIQ-09', 'Polish', 'Copy: no all-caps runs, no version in the header, no banned labels, short captions under titles', async () => {
    const b = [];
    for (const th of ['dark', 'light']) for (const scr of SCANNED) {
      const L = R[th][scr]; L.l.header.forEach(x => b.push('header ' + x));
      L.c.caps.filter(x => !ALLOW_CAPS.includes(x)).forEach(x => b.push('caps ' + x));
      L.l.text.forEach(t => BANNED_COPY.forEach(re => { if (re.test(t)) b.push('banned ' + t.slice(0, 20)); }));
      L.sc.forEach(x => b.push('caption ' + x));
      BANNED_JOINED.forEach(re => { if (re.test(L.l.inner)) b.push('banned (joined text) ' + scr + ' ' + re); });
    }
    expect(b.length === 0, lim([...new Set(b)]));
  }, 'high');
  await T('UIQ-10', 'Polish', 'Motion tokens: durations are 100/160/240/360/520 ms (infinite only on [data-ambient]); reduced motion stops the detail sheet', async () => {
    const b = agg('c', c => c.motion); expect(b.length === 0, lim(b)); expect(R.rm.length === 0, 'running under reduced motion: ' + R.rm.join(','));
  }, 'high');
  await T('UIQ-12', 'Polish', 'No visible button or chip is taller than 48 px (guards the 44 px blanket regression)', async () => { const b = agg('h', h => h); expect(b.length === 0, lim(b)); }, 'high');
  }

  // ---- widths
  if (want('UIQ-07')) for (const width of [320, 390, 402, 768]) {
    const w = await session({ feed: false, width, height: width >= 768 ? 1024 : 844 });
    await w.load(QA); await w.page.waitForTimeout(1200);
    const bad = [];
    for (const scr of SCREENS) { await w.go(scr); await w.page.waitForTimeout(500); const o = await w.page.evaluate(() => { const root = document.documentElement; return Math.max(0, root.scrollWidth - window.innerWidth); }); if (o > 1) bad.push(scr + ' overflowX ' + o); const e = await w.page.evaluate(EDGE); e.slice(0, 3).forEach(x => bad.push(scr + ' ' + x)); }
    await T('UIQ-07-' + width, 'Polish', 'Width ' + width + ': no sideways overflow on any screen, nothing past the right edge outside [data-scroller]', async () => expect(bad.length === 0, lim(bad)), 'high');
    await w.close();
  }
  // ---- empty-state contract
  if (want('UIQ-11')) for (const theme of ['dark', 'light']) {
    const q = await session({ collapsedTail: true, feed, colorScheme: theme, sentenceCase: true, width: 390, height: 844 });
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
  // ---- pass 2 tests (UIQ-13 ...), each written to fail on the behaviour it replaced
  const gl = (a, n = +process.env.UIQ_N || 6) => a.length + ' e.g. ' + a.slice(0, n).join(' | ');
  // UIQ-13: the More menu really scrolls: wheel and touch input, not scrollIntoView. Every row ends up fully inside the menu and not under anything.
  if (want('UIQ-13')) for (const [w, h] of [[390, 844], [375, 667], [320, 568]]) {
    const m = await session({ collapsedTail: true, feed: false, width: w, height: h, touch: true });
    await m.load(QA); await m.page.waitForTimeout(800);
    await m.page.waitForSelector('.ios-toast', { state: 'detached', timeout: 8000 }).catch(() => {});   // the load notice would sit on the menu for 3 s
    await m.page.getByText('More', { exact: true }).last().click(); await m.page.waitForTimeout(700);
    const info = await m.page.evaluate(() => { const e = document.querySelector('[role=menu][aria-label="More"]'); const r = e.getBoundingClientRect(); return { oy: getComputedStyle(e).overflowY, sh: e.scrollHeight, ch: e.clientHeight, x: r.left + r.width / 2, y: r.top + r.height / 2, n: e.querySelectorAll('[role=menuitem]').length }; });
    const seen = new Set(); const reach = () => m.page.evaluate(() => { const e = document.querySelector('[role=menu][aria-label="More"]'); const mr = e.getBoundingClientRect(); const out = []; e.querySelectorAll('[role=menuitem]').forEach(it => { const r = it.getBoundingClientRect(); if (r.top >= mr.top - 1 && r.bottom <= mr.bottom + 1) { const c = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); if (c && it.contains(c)) out.push(it.getAttribute('aria-label')); } }); return { out, top: e.scrollTop }; });
    await m.page.mouse.move(info.x, info.y);
    for (let i = 0; i < 14; i++) { (await reach()).out.forEach(x => seen.add(x)); await m.page.mouse.wheel(0, 120); await m.page.waitForTimeout(120); }
    const wheelTop = (await reach()).top;
    // touch: back to the top with the wheel, then one real touch swipe
    for (let i = 0; i < 14; i++) { await m.page.mouse.wheel(0, -200); await m.page.waitForTimeout(40); }
    const cdp = await m.ctx.newCDPSession(m.page); const t0 = (await reach()).top;
    // a real touch swipe (touchStart / touchMove / touchEnd through the browser's input pipeline)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: info.x, y: info.y + 60 }] });
    for (let i = 1; i <= 12; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: info.x, y: info.y + 60 - i * 12 }] }); await m.page.waitForTimeout(16); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await m.page.waitForTimeout(500);
    const t1 = (await reach()).top;
    const gl2 = await m.page.evaluate(OVERLAP);
    await T('UIQ-13-' + w + 'x' + h, 'Polish', 'More menu at ' + w + 'x' + h + ': scrolls by wheel and touch, every row can be brought fully inside it, bubble out of the way', async () => {
      const bad = [];   // every failure is reported, so the reachability part is checked even when the overflow style is wrong
      if (!/auto|scroll/.test(info.oy)) bad.push('overflow-y is ' + info.oy);
      if (info.n < 10) bad.push('rows ' + info.n);
      if (seen.size !== info.n) bad.push('rows reached by wheel ' + seen.size + ' of ' + info.n);
      if (info.sh > info.ch + 1) { if (!(wheelTop > 0)) bad.push('wheel did not move the menu'); if (!(t1 > t0)) bad.push('touch swipe did not move the menu (' + t0 + ' -> ' + t1 + ')'); }
      if (gl2.length) bad.push('bubble: ' + gl2.join(', '));
      expect(bad.length === 0, bad.join('; '));
    }, 'high');
    await m.close();
  }
  // UIQ-14: the chat bubble never sits on an open menu, sheet or bar (it is hidden while they are open).
  if (want('UIQ-14')) for (const [w, h] of [[390, 844], [320, 568], [768, 1024]]) {
    const o = await session({ collapsedTail: true, feed, sentenceCase: true, width: w, height: h, touch: true });
    await o.load(QA); await o.call('recalculateAllRanks'); await o.page.waitForTimeout(1000);
    const bad = [];
    for (const st of ['MORE', 'DETAIL', 'DETAIL_END', 'SELECT', 'LONG', 'CHAT']) { await openState(o, st); (await o.page.evaluate(OVERLAP)).forEach(x => bad.push(st + ': ' + x)); (await o.page.evaluate(EDGE)).forEach(x => bad.push(st + ' past the right edge: ' + x)); await closeState(o, st); }
    await T('UIQ-14-' + w, 'Polish', 'Width ' + w + ': the chat bubble does not cover the More menu, detail sheet, long-press sheet or select bar', async () => expect(bad.length === 0, gl(bad)), 'high');
    await o.close();
  }
  // UIQ-15: a roster row's text is never clipped, no lone check mark, no dangling dash (320 and 390, normal and select mode)
  if (want('UIQ-15')) for (const w of [320, 390]) {
    const o = await session({ collapsedTail: true, feed, sentenceCase: true, width: w, height: 844, touch: true });
    await o.load(QA); await o.call('recalculateAllRanks'); await o.page.waitForTimeout(1000); await o.go('ROSTER'); await o.page.waitForTimeout(600);
    const bad = [];
    for (const mode of ['normal', 'select']) {
      if (mode === 'select') { await o.call('toggleSelectMode'); await o.page.waitForTimeout(400); }
      (await o.page.evaluate(() => [...document.querySelectorAll('[data-swipe-row]')].slice(0, 20).map(r => r.setAttribute('data-first20', '1')) && 0));
      (await o.page.evaluate(CLIPPED, { sel: '[data-first20]', strict: true })).forEach(x => bad.push(mode + ' clipped ' + x));
      (await o.page.evaluate(ROWLINES)).forEach(x => bad.push(mode + ' ' + x));
    }
    await T('UIQ-15-' + w, 'Polish', 'Roster rows at ' + w + ': nothing clipped in the first 20 rows (normal and select mode), no lone check mark, no dangling dash', async () => expect(bad.length === 0, gl(bad)), 'high');
    await o.close();
  }
  // UIQ-16: Today is short, in render order, one stat strip, the tail collapsed behind one disclosure
  if (want('UIQ-16')) {
    const o = await session({ collapsedTail: true, feed, sentenceCase: true, width: 390, height: 844, touch: true });
    await o.load(QA); await o.call('recalculateAllRanks'); await o.page.waitForTimeout(1200); await o.set({ promoCodes: promo }); await o.go('TODAY'); await o.page.waitForTimeout(900);
    const sh = await o.page.evaluate(TODAY_SHAPE);
    await T('UIQ-16', 'Polish', 'Today at 390x844: at most 4 viewports tall with the tail collapsed, DOM order is visual order (no CSS order), one stat strip, events and this week\'s GBL before the tail', async () => {
      expect(sh.h <= 4 * sh.vh, 'Today is ' + (sh.h / sh.vh).toFixed(1) + ' viewports');
      expect(sh.orders.length === 0, 'CSS order used: ' + sh.orders.slice(0, 3).join(', '));
      expect(sh.mono, 'visual order differs from DOM order');
      expect(sh.strips === 1, 'stat strips ' + sh.strips);
      expect(sh.tail && !sh.tailOpen, 'the long tail is not collapsed behind one disclosure');
      const evi = sh.first.findIndex(x => /^Events/.test(x)), gi = sh.first.findIndex(x => /^GO Battle/.test(x)), ti = sh.first.findIndex(x => /^More on Today/.test(x));
      expect(evi >= 0 && gi >= 0 && ti > evi && ti > gi, 'order ' + sh.first.join(' | '));
    }, 'high');
    // with the tail opened the sections are all still there, and the jump chips open it
    await o.page.locator('[data-today-tail-toggle]').click(); await o.page.waitForTimeout(500);
    const secs = await o.page.evaluate(() => [...document.querySelectorAll('[data-today-section]')].map(e => e.getAttribute('data-today-section')));
    await T('UIQ-16b', 'Polish', 'Today: opening the tail shows the evolve, review and queue sections', async () => expect(secs.includes('evolve') && secs.includes('queued'), 'sections ' + secs.join(',')), 'high');
    await o.close();
  }
  // UIQ-17: no crushed prose (fewer than 12 characters per line over 3+ lines) at 320 and 390 on any screen, tails opened
  if (want('UIQ-17')) for (const w of [320, 390]) {
    const o = await session({ collapsedTail: true, feed, sentenceCase: true, width: w, height: 844, touch: true });
    await o.load(QA); await o.call('recalculateAllRanks'); await o.page.waitForTimeout(1200); await o.set({ promoCodes: promo });
    const bad = [];
    for (const scr of SCREENS.concat(EXTRA)) {
      await o.go(scr); await o.page.waitForTimeout(700);
      if (scr === 'TODAY') { await o.page.locator('[data-today-tail-toggle]').click(); await o.page.waitForTimeout(500); await o.page.evaluate(() => document.querySelectorAll('details[data-league]').forEach(d => d.open = true)); await o.page.waitForTimeout(200); }
      (await o.page.evaluate(NARROW)).forEach(x => bad.push(scr + ' ' + x));
    }
    await T('UIQ-17-' + w, 'Polish', 'Width ' + w + ': no text block is crushed into fewer than 12 characters per line (level picker, squad text, ...)', async () => expect(bad.length === 0, gl(bad)), 'high');
    await o.close();
  }
  // UIQ-18: one chip/button language: every "Show all N" is plain, every "Mark done" tinted, at most 3 filled buttons per screen, one card-heading style
  if (want('UIQ-18')) await T('UIQ-18', 'Polish', 'Show all is plain, Mark done is tinted, at most 3 filled buttons per screen, card headings share one style', async () => {
    const b = [];
    for (const th of ['dark', 'light']) for (const scr of SCANNED) {
      const L = R[th][scr]; L.f.showAll.forEach(x => b.push(th + '/' + scr + ' show all not plain: ' + x)); L.f.markDone.forEach(x => b.push(th + '/' + scr + ' mark done not tinted'));
      if (L.f.fills.length > 3) b.push(th + '/' + scr + ' ' + L.f.fills.length + ' filled buttons: ' + L.f.fills.slice(0, 5).join(','));
      L.hd.forEach(x => b.push(th + '/' + scr + ' heading ' + x));
    }
    expect(b.length === 0, gl([...new Set(b)]));
  }, 'high');
  // UIQ-19: the chat sheet keeps 16 px from both edges at 320 and its padding is on the grid
  if (want('UIQ-19')) {
    const o = await session({ collapsedTail: true, feed, sentenceCase: true, width: 320, height: 568, touch: true });
    await o.load(QA); await o.page.waitForTimeout(800); await o.go('TODAY'); await o.set({ chatOpen: true }); await o.page.waitForTimeout(700);
    const g = await o.page.evaluate(() => { const d = document.querySelector('[role=dialog][aria-label="Ask the Professor"]'); const cs = getComputedStyle(d); const kids = [...d.querySelectorAll('div, button, input')].filter(e => e.getBoundingClientRect().width > 0 && !e.hasAttribute('data-grabber')); const left = Math.min(...kids.map(e => e.getBoundingClientRect().left)), right = Math.max(...kids.map(e => e.getBoundingClientRect().right)); return { left, right, w: window.innerWidth, pad: [cs.paddingLeft, cs.paddingRight, cs.paddingTop].map(parseFloat) }; });
    await T('UIQ-19', 'Polish', 'Chat sheet at 320: content at least 16 px from both edges, padding a multiple of 4', async () => { expect(g.left >= 16 && g.w - g.right >= 16, 'content spans ' + g.left + ' to ' + g.right + ' of ' + g.w); expect(g.pad.every(p => p % 4 === 0), 'padding ' + g.pad.join('/')); }, 'high');
    await o.close();
  }
  // UIQ-20: 768 px: header, More menu, select bar and every card inside the 560 px column
  if (want('UIQ-20')) {
    const o = await session({ collapsedTail: true, feed, sentenceCase: true, width: 768, height: 1024, touch: true });
    await o.load(QA); await o.call('recalculateAllRanks'); await o.page.waitForTimeout(1000); await o.set({ promoCodes: promo });
    const bad = [];
    for (const scr of SCREENS.concat(EXTRA)) { await o.go(scr); await o.page.waitForTimeout(600); (await o.page.evaluate(GEOM768)).forEach(x => bad.push(scr + ': ' + x)); }
    for (const st of ['MORE', 'SELECT']) { await openState(o, st); (await o.page.evaluate(GEOM768)).forEach(x => bad.push(st + ': ' + x)); await closeState(o, st); }
    await T('UIQ-20', 'Polish', '768 px: header title and buttons line up with the 560 px column, More menu and select bar are at most 560 px and centred, no card is wider than 560 px', async () => expect(bad.length === 0, gl([...new Set(bad)])), 'high');
    await o.close();
  }
  // UIQ-21: Attackers and Progress log at 320 and 390: no clipped text in rows, log header cells do not touch each other
  if (want('UIQ-21')) for (const w of [320, 390]) {
    const o = await session({ collapsedTail: true, feed, sentenceCase: true, width: w, height: 844, touch: true });
    await o.load(QA); await o.call('recalculateAllRanks'); await o.page.waitForTimeout(1000);
    const bad = [];
    await o.go('ATTACK'); await o.page.waitForTimeout(800); (await o.page.evaluate(CLIPPED, { sel: '[role=main]', strict: false })).forEach(x => bad.push('attackers ' + x));
    await o.go('LOG'); await o.page.waitForTimeout(800); (await o.page.evaluate(HEADERCELLS)).forEach(x => bad.push('log ' + x)); (await o.page.evaluate(CLIPPED, { sel: '[role=main]', strict: false })).forEach(x => bad.push('log ' + x));
    await T('UIQ-21-' + w, 'Polish', 'Width ' + w + ': Attackers and Progress log show their data in full (wrapped, not ellipsised); log header cells do not collide', async () => expect(bad.length === 0, gl(bad)), 'high');
    await o.close();
  }
  // UIQ-22: leftovers in the source: no off-scale durations or inline sizes, no off-grid margins on cards and headers
  if (want('UIQ-22')) await T('UIQ-22', 'Polish', 'Source strays: no off-scale durations, inline font sizes of 18/20 px or off-grid header margins', async () => {
    const src = fs.readFileSync(path.join(REPO, 'Scout Dashboard.dc.html'), 'utf8'); const bad = [];
    src.split('\n').filter(l => !/data-ambient/.test(l)).forEach(l => {
      (l.match(/(?:animation|transition)[^;"{}]*?(?<![\w.-])(?:0?\.9|1\.5|1\.6|2\.6|1\.2)s\b[^;"{}]*/g) || []).forEach(x => bad.push('duration ' + x.slice(0, 50)));
      (l.match(/(?<![\w.-])620ms/g) || []).forEach(() => bad.push('620ms'));
      (l.match(/font:\s*(?:\d{3}\s+)?(?:18|20)px\b(?!\s*\/)|font-size:\s*(?:18|20)px/g) || []).forEach(x => bad.push('size ' + x));
      (l.match(/margin-bottom:22px/g) || []).forEach(() => bad.push('margin-bottom:22px'));
    });
    expect(bad.length === 0, gl([...new Set(bad)]));
  }, 'high');

};

module.exports.__scans = { CONTRAST, CONFORM, NAMES, EDGE, VISIBLE_BTN_H, LINT, SECTION_CAPTIONS, CLIPPED, ROWLINES, NARROW, HEADINGS, FILLED, TODAY_SHAPE, OVERLAP, GEOM768, HEADERCELLS, SIZES, WEIGHTS, RADII };
