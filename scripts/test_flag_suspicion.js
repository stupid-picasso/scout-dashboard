#!/usr/bin/env node
/**
 * test_flag_suspicion.js - "Flags from the game, part 2" in Scout Dashboard.dc.html: the import prompts also ask whether the Pokemon
 * wears a costume and has a special background, and the answer is stored as a SUSPICION only (costumeSuspected / backgroundSuspected).
 * Checks the storage rules on the real method source: a scan sets the suspicion and never the confirmed flag, never touches a record
 * whose flag is confirmed, a later "no" clears an unconfirmed suspicion, the confirm and clear paths of part 1 clear it, and the
 * power-up merge does not carry it. Also that the three prompts that list shiny ask for the two fields and the others do not.
 * FLAGS2_SRC=<path> points it at a broken copy (to prove the tests fail on one).
 *
 * USAGE: node scripts/test_flag_suspicion.js
 */
const fs = require('fs');
const path = require('path');
const { checker } = require('./lib/testkit');

const ROOT = path.dirname(__dirname);
const SRC = fs.readFileSync(process.env.FLAGS2_SRC || path.join(ROOT, 'Scout Dashboard.dc.html'), 'utf8');
function bodyOf(src, name) {
  const m = new RegExp('\\n  (?:async )?' + name + '\\(([^)]*)\\) \\{').exec(src);
  if (!m) throw new Error('Could not find the method "' + name + '" in the source');
  const open = m.index + m[0].length - 1;
  let depth = 0, j = open;
  for (; j < src.length; j++) { if (src[j] === '{') depth++; else if (src[j] === '}' && --depth === 0) break; }
  return { args: m[1].split(',').map(s => s.trim()).filter(Boolean), text: src.slice(open + 1, j) };
}
const methodOf = (src, name) => { const b = bodyOf(src, name); return new Function(...b.args, b.text); };
const t = checker(), eq = t.eq, ok = t.ok;

function makeCtx(state) {
  const ctx = { state: { roster: [], addedPokemon: [], ivOverrides: {}, removedIds: [], lastImport: null, costumePending: null, ...(state || {}) },
    setState(u, cb) { Object.assign(this.state, u); if (cb) cb(); }, pushNow() {}, offerUndo() {}, haptic() {},
    patchEach(idxs, patch) { idxs.forEach(i => { this.state.ivOverrides[i] = { ...(this.state.ivOverrides[i] || {}), ...patch }; }); },
    maxPatch() { return {}; }, emptyLeague() { return {}; } };
  ['shinyPatch', 'updatePatch', 'newRecord', 'costumeApply', 'flagPatch', 'mergePowerUp', 'monWithOverrides'].forEach(n => { ctx[n] = methodOf(SRC, n).bind(ctx); });
  return ctx;
}
const c = makeCtx();
const sp = (item, prior) => c.shinyPatch(item, prior);

// ---- the rule ----
eq('a scan that says costume sets the suspicion, never the confirmed flag', sp({ costume: true }, null), { costumeSuspected: true });
eq('both at once', sp({ costume: true, background: true }, {}), { costumeSuspected: true, backgroundSuspected: true });
eq('no answer, no keys', sp({}, {}), {});
eq('an answer that is not a boolean is ignored', sp({ costume: 'true', background: 1 }, {}), {});
eq('false with nothing to clear adds no keys', sp({ costume: false, background: false }, {}), {});
eq('a confirmed costume is never touched by a yes', sp({ costume: true }, { costume: true }), {});
eq('a confirmed costume is never touched by a no (a stale suspicion stays)', sp({ costume: false }, { costume: true, costumeSuspected: true }), {});
eq('a confirmed background does not shield the costume answer', sp({ costume: true, background: true }, { background: true }), { costumeSuspected: true });
eq('a no clears a suspicion that was never confirmed', sp({ costume: false }, { costumeSuspected: true }), { costumeSuspected: false });
eq('a no clears the background suspicion', sp({ background: false }, { backgroundSuspected: true }), { backgroundSuspected: false });
eq('a no for one flag leaves the other suspicion alone', sp({ background: false }, { costumeSuspected: true, backgroundSuspected: true }), { backgroundSuspected: false });
eq('no item, no patch', sp(null, {}), {});

// ---- the import paths: owned (update) and new (insert) ----
const before = { idx: 'a', name: 'Piplup', cp: 400, hp: 50 };
const upd = (item, rec) => c.updatePatch({ cp: 400, hp: 50, ...item }, null, { idx: 'a', hp: 50 }, rec, {}, {}, '2026-11-22');
let u = upd({ costume: true, background: true }, before);
ok('update: suspicion set', u.costumeSuspected === true && u.backgroundSuspected === true);
ok('update: confirmed flags are not written', !('costume' in u) && !('background' in u));
u = upd({ costume: true, background: true }, { ...before, costume: true, background: true });
ok('update: a record with both confirmed gets nothing', !('costumeSuspected' in u) && !('backgroundSuspected' in u));
u = upd({ costume: false }, { ...before, costumeSuspected: true });
ok('update: a later no clears the unconfirmed suspicion', u.costumeSuspected === false);
u = upd({}, { ...before, costumeSuspected: true });
ok('update: silence keeps it', !('costumeSuspected' in u));
let n = c.newRecord({ name: 'Machamp', dex: 68, cp: 900, costume: true, background: false }, 0, {}, '2026-11-22');
ok('insert: suspicion set, never the confirmed flag', n.costumeSuspected === true && !('costume' in n) && !('background' in n) && !('backgroundSuspected' in n));
n = c.newRecord({ name: 'Machamp', dex: 68, cp: 900 }, 0, {}, '2026-11-22');
ok('insert: no answer leaves the record as it was', !('costumeSuspected' in n) && !('backgroundSuspected' in n));

// ---- part 1: confirming and clearing clears the suspicion ----
(function confirm() {
  const pend = (flag, kind, o) => ({ flag, kind, idxs: [], names: [], already: 0, clear: [], strong: [], ...o });
  const k = makeCtx({ ivOverrides: { a: { costumeSuspected: true } }, costumePending: pend('costume', '', { idxs: ['a'] }) });
  k.costumeApply(false);
  eq('confirming a costume clears its suspicion', [k.state.ivOverrides.a.costume, k.state.ivOverrides.a.costumeSuspected], [true, false]);
  const kb = makeCtx({ ivOverrides: { b: { backgroundSuspected: true, costumeSuspected: true } }, costumePending: pend('background', 'special', { idxs: ['b'] }) });
  kb.costumeApply(false);
  eq('confirming a background clears its suspicion and leaves the costume one', [kb.state.ivOverrides.b.background, kb.state.ivOverrides.b.backgroundSuspected, kb.state.ivOverrides.b.costumeSuspected], [true, false, true]);
  const kc = makeCtx({ ivOverrides: { z: { costume: true, costumeSuspected: true } }, costumePending: pend('costume', '', { clear: ['z'] }) });
  kc.costumeApply(true);
  eq('the clear-marks path clears the flag and the suspicion', [kc.state.ivOverrides.z.costume, kc.state.ivOverrides.z.costumeSuspected], [false, false]);
  const ks = makeCtx({ ivOverrides: { s: { shiny: true, shinyState: 'suspected' } }, costumePending: pend('shiny', '', { idxs: ['s'] }) });
  ks.costumeApply(false);
  eq('shiny marking adds no suspicion keys', ks.state.ivOverrides.s, { shiny: true, shinyState: null });
})();

// ---- the power-up merge never carries a suspicion ----
(function powerUp() {
  const old = { idx: 'r1', name: 'Machamp', cp: 1500 }, nw = { idx: 'video-1', name: 'Machamp', cp: 1600 };
  const pair = { at: 1, rows: [], revert: {}, pairs: [{ n: 'video-1', o: 'r1' }] };
  const k = makeCtx({ roster: [old], addedPokemon: [nw], ivOverrides: { r1: { costumeSuspected: true, backgroundSuspected: true, costume: true } }, lastImport: JSON.parse(JSON.stringify(pair)) });
  k.mergePowerUp('video-1');
  eq('power-up merge: the confirmed costume is carried, the suspicions are not', k.state.ivOverrides['video-1'], { costume: true });
  const k2 = makeCtx({ roster: [old], addedPokemon: [nw], ivOverrides: { r1: { costumeSuspected: true } }, lastImport: JSON.parse(JSON.stringify(pair)) });
  k2.mergePowerUp('video-1');
  eq('power-up merge: a suspicion alone carries nothing', k2.state.ivOverrides['video-1'], {});
})();

// ---- the prompts ----
(function prompts() {
  ['runVideoPipeline', 'importPromptText', 'readScreenshotWithVision'].forEach(n => {
    const txt = bodyOf(SRC, n).text.replace(/'\s*\+\s*'/g, '');
    ok(n + ' asks for costume and background as booleans', /"costume":\s*boolean/.test(txt) && /"background":\s*boolean/.test(txt));
    ok(n + ' explains both and says to answer false when unsure', /costume: true only if the Pokemon visibly wears a hat, outfit or accessory/.test(txt) && /background: true only if the detail card shows a special illustrated backdrop/.test(txt) && /Answer false when unsure/.test(txt));
  });
  ['appraisalPrompt', 'gridPrompt'].forEach(n => ok(n + ' is unchanged: no costume or background', !/costume|background/i.test(bodyOf(SRC, n).text)));
  ok('the screenshot reader keeps only booleans', /costume: o\.costume === true \|\| o\.costume === false \? o\.costume : undefined/.test(bodyOf(SRC, 'readScreenshotWithVision').text));
})();

t.exit();
