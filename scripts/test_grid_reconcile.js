#!/usr/bin/env node
/**
 * test_grid_reconcile.js - tests for "Check against the game" (grid reconcile) in Scout Dashboard.dc.html:
 * gridReconcile (the multiset match of the game's grid tiles against the roster), gridMerge (overlapping scroll frames into one
 * tile list), gridStrings (in-game search strings, batched) and gridSheet (the words of the result sheet).
 *
 * Like test_roster_logic.js it extracts the real method source from the shipped file, so a change to the app is what is tested.
 * GRID_SRC=<path> points it at another copy of the source (used to prove the tests fail on a broken one).
 *
 * USAGE: node scripts/test_grid_reconcile.js
 */
const fs = require('fs');
const path = require('path');
const { loadMechanics } = require('./lib/testkit');

const SRC = fs.readFileSync(process.env.GRID_SRC || path.join(path.dirname(__dirname), 'Scout Dashboard.dc.html'), 'utf8');
function body(sig) {
  const i = SRC.indexOf(sig);
  if (i < 0) throw new Error('Could not find "' + sig + '" in the source');
  const open = SRC.indexOf('{', i);
  let depth = 0, j = open;
  for (; j < SRC.length; j++) { if (SRC[j] === '{') depth++; else if (SRC[j] === '}' && --depth === 0) break; }
  return SRC.slice(open + 1, j);
}
const ctx = { mechanics: loadMechanics() };
ctx.costumeNorm = new Function('s', body('costumeNorm(s) {')).bind(ctx);
ctx.gridReconcile = new Function('reads', 'roster', 'header', body('gridReconcile(reads, roster, header) {')).bind(ctx);
ctx.gridMerge = new Function('frames', body('gridMerge(frames) {')).bind(ctx);
ctx.gridStrings = new Function('list', 'plain', 'per', body('gridStrings(list, plain, per) {')).bind(ctx);
ctx.gridSheet = new Function('res', 'plain', body('gridSheet(res, plain) {')).bind(ctx);

let pass = 0;
const failures = [];
function check(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) pass++; else failures.push('  ' + name + '\n    expected: ' + e + '\n    actual:   ' + a);
}
const t = (name, cp) => ({ name, cp });
const mon = (name, cp, idx) => ({ idx: idx || name + cp + Math.random(), name, cp });
const frozen = o => { const f = x => { if (x && typeof x === 'object') { Object.freeze(x); Object.values(x).forEach(f); } return x; }; return f(o); };
const rec = (reads, roster, header) => ctx.gridReconcile(frozen(reads), frozen(roster), header === undefined ? null : header);

// ---- multiset: two Feebas with different CP count correctly; twins count twice ----
(function exact() {
  const roster = [mon('Feebas', 115), mon('Feebas', 109), mon('Whismur', 81)];
  const r = rec([t('Whismur', 81), t('Feebas', 109), t('Feebas', 115)], roster, { n: 3, max: 1225 });
  check('exact match: nothing missing', r.missingInApp, []);
  check('exact match: nothing extra', r.extraInApp, []);
  check('exact match: no pairs or ambiguity', [r.pairs, r.ambiguous, r.nameCheck, r.find], [[], [], [], []]);
  check('exact match: count', r.count, { read: 3, header: 3, max: 1225, short: 0, app: 3, noCp: 0 });
})();

(function missingAndExtra() {
  const roster = [mon('Feebas', 115), mon('Pidgey', 300)];
  const r = rec([t('Feebas', 115), t('Whismur', 81), t('Feebas', 109)], roster);
  check('missing in the app (sorted by name then CP)', r.missingInApp, [t('Feebas', 109), t('Whismur', 81)]);
  check('extra in the app', r.extraInApp, [t('Pidgey', 300)]);
  check('the game side of what is missing is what to look for', r.find, [t('Feebas', 109), t('Whismur', 81)]);
  check('no header: short is null', r.count.short, null);
})();

(function matchIgnoresCaseAndAccents() {
  const r = rec([t('FLABEBE', 500), t('Mr. Mime', 700)], [mon('Flabébé', 500), mon('mr mime', 700)]);
  check('names match without case, accents or punctuation', [r.missingInApp, r.extraInApp, r.nameCheck], [[], [], []]);
})();

// ---- duplicates ----
(function duplicates() {
  const r = rec([t('Feebas', 115), t('Feebas', 115), t('Whismur', 81), t('Whismur', 81)], [mon('Feebas', 115), mon('Whismur', 81), mon('Whismur', 81)]);
  check('twins with equal counts are fine', r.ambiguous.filter(x => x.name === 'Whismur'), []);
  check('twins with different counts are ambiguous, not missing', [r.ambiguous, r.missingInApp, r.extraInApp], [[{ name: 'Feebas', cp: 115, game: 2, app: 1 }], [], []]);
  check('the surplus tile is looked for in the game', r.find, [t('Feebas', 115)]);
  const r2 = rec([t('Feebas', 115)], [mon('Feebas', 115), mon('Feebas', 115)]);
  check('more in the app than the game is ambiguous and not searched', [r2.ambiguous, r2.find], [[{ name: 'Feebas', cp: 115, game: 1, app: 2 }], []]);
})();

// ---- powered up pairs ----
(function pairs() {
  const r = rec([t('Feebas', 130), t('Whismur', 81)], [mon('Feebas', 109), mon('Whismur', 81)]);
  check('same species missing and extra is a pair', r.pairs, [{ name: 'Feebas', game: 130, app: 109 }]);
  check('a pair leaves both lists', [r.missingInApp, r.extraInApp], [[], []]);
  check('the new CP is looked for', r.find, [t('Feebas', 130)]);
  const r2 = rec([t('Feebas', 130), t('Feebas', 140), t('Whismur', 90)], [mon('Feebas', 109), mon('Pidgey', 50)]);
  check('pairs go lowest to lowest, the rest stays', [r2.pairs, r2.missingInApp, r2.extraInApp], [[{ name: 'Feebas', game: 130, app: 109 }], [t('Feebas', 140), t('Whismur', 90)], [t('Pidgey', 50)]]);
})();

// ---- nicknames and unreadable tiles ----
(function nicknames() {
  const r = rec([t('Bobby', 800), t('Feebas', null), t('', 400), t('Whismur', 81)], [mon('Whismur', 81), mon('Dragonite', 800)]);
  check('nickname, no CP and no name go to the hand check (position in the list)', r.nameCheck, [{ pos: 1, name: 'Bobby', cp: 800, near: 'Dragonite' }, { pos: 2, name: 'Feebas', cp: null }, { pos: 3, name: '', cp: 400 }]);
  check('a nickname tile takes the roster Pokemon of its CP out of the extras', [r.extraInApp, r.missingInApp], [[], []]);
  check('nothing is guessed into the search', r.find, []);
  check('the unmatched tiles still count as read', r.count.read, 4);
})();

// ---- counts ----
(function counts() {
  const roster = [mon('Feebas', 115), mon('Whismur', 81), mon('Pidgey', 40)];
  const one = [t('Feebas', 115), t('Whismur', 81)];
  check('short', rec(one, roster, { n: 5, max: 1225 }).count, { read: 2, header: 5, max: 1225, short: 3, app: 3, noCp: 0 });
  check('over', rec(one, roster, { n: 1, max: 1225 }).count.short, -1);
  check('exact', rec(one, roster, { n: 2, max: 1225 }).count.short, 0);
  check('header with no number', rec(one, roster, { n: null, max: null }).count.short, null);
  check('roster rows with no CP are counted apart and never matched', rec(one, [...roster, { idx: 'x', name: 'Mew' }]).count.noCp, 1);
})();

// ---- empty inputs ----
(function empties() {
  const e = rec([], [], null);
  check('nothing read, nothing owned', [e.missingInApp, e.extraInApp, e.pairs, e.ambiguous, e.nameCheck, e.stop, e.count.read], [[], [], [], [], [], null, 0]);
  check('nothing read: the whole roster is extra', rec([], [mon('Feebas', 115)]).extraInApp, [t('Feebas', 115)]);
  check('empty roster: every tile is missing', rec([t('Feebas', 115)], []).missingInApp, [t('Feebas', 115)]);
  check('undefined inputs', ctx.gridReconcile(undefined, undefined, undefined).count.read, 0);
})();

// ---- non-mutating ----
(function nonMutating() {
  const reads = [t('Feebas', 115)], roster = [mon('Feebas', 109)], before = JSON.stringify([reads, roster]);
  ctx.gridReconcile(reads, roster, { n: 1, max: 2 });
  check('reads and roster are left as they were', JSON.stringify([reads, roster]), before);
})();

// ---- stop point (recents sort) ----
(function stopPoint() {
  const roster = [mon('Feebas', 115), mon('Whismur', 81)];
  const r = rec([t('Pidgey', 30), t('Rattata', 20), t('Feebas', 115), t('Zubat', 10), t('Whismur', 81)], roster);
  check('first known tile, new above it, unknown below it', r.stop, { first: 3, newAbove: 2, unknownBelow: 1 });
  check('first tile known', rec([t('Feebas', 115)], roster).stop, { first: 1, newAbove: 0, unknownBelow: 0 });
  check('no known tile', rec([t('Pidgey', 30)], roster).stop, null);
})();

// ---- merging scroll frames ----
(function merge() {
  const A = t('A', 1), B = t('B', 2), C = t('C', 3), D = t('D', 4), E = t('E', 5), F = t('F', 6);
  check('overlapping tail and head count once', ctx.gridMerge([[A, B, C], [B, C, D], [D, E]]).tiles, [A, B, C, D, E]);
  check('a still frame adds nothing', ctx.gridMerge([[A, B], [A, B]]).tiles, [A, B]);
  const gap = ctx.gridMerge([[A, B], [E, F]]);
  check('no overlap is a gap and keeps every tile', [gap.tiles, gap.gaps], [[A, B, E, F], 1]);
  const bad = ctx.gridMerge([[A, B], null, [B, C]]);
  check('a frame that could not be read is counted, and the next one cannot be joined', [bad.tiles, bad.failed, bad.gaps], [[A, B, B, C], 1, 0]);
  check('an empty frame is not a gap', ctx.gridMerge([[A, B], [], [B, C]]).gaps, 0);
  check('twins in one frame stay twins', ctx.gridMerge([[A, A, B]]).tiles, [A, A, B]);
  check('overlap matches names without case', ctx.gridMerge([[t('Feebas', 1)], [t('FEEBAS', 1), t('Z', 2)]]).tiles.length, 2);
  check('no frames', ctx.gridMerge([]).tiles, []);
})();

// ---- search strings ----
(function strings() {
  const list = Array.from({ length: 25 }, (_, i) => t('Feebas', 100 + i));
  check('batches of ten', ctx.gridStrings(list, false).map(b => b.n), [10, 10, 5]);
  check('batch text', ctx.gridStrings([t('Feebas', 109), t('Whismur', 81)], false), [{ text: 'Feebas&cp109,Whismur&cp81', n: 2 }]);
  check('plain CP form drops the name', ctx.gridStrings([t('Feebas', 109), t('Whismur', 81)], true), [{ text: 'cp109,cp81', n: 2 }]);
  check('plain form of equal CPs is one term', ctx.gridStrings([t('Feebas', 109), t('Whismur', 109)], true), [{ text: 'cp109', n: 1 }]);
  check('a different batch size', ctx.gridStrings(list, false, 4).map(b => b.n), [4, 4, 4, 4, 4, 4, 1]);
  check('spaces, diacritics and apostrophes stay as the game shows them', ctx.gridStrings([t('Mr. Mime', 700), t('Flabébé', 500), t("Farfetch'd", 300), t('Nidoran♀', 200)], false)[0].text, "Mr. Mime&cp700,Flabébé&cp500,Farfetch'd&cp300,Nidoran♀&cp200");
  check('a name with a comma or & is searched by CP alone', ctx.gridStrings([t('A,B', 11), t('C&D', 12)], false)[0].text, 'cp11,cp12');
  check('no CP, no term', ctx.gridStrings([t('Feebas', null)], false), []);
  check('empty', ctx.gridStrings([], false), []);
  const same = ctx.gridStrings([t('Feebas', 109), t('Feebas', 109)], false);
  check('the same tile twice is searched once', same[0].n, 1);
})();

// ---- sheet words ----
(function sheet() {
  const roster = [mon('Feebas', 115)];
  const s = ctx.gridSheet(rec([t('Feebas', 115), t('Whismur', 81)], roster, { n: 14, max: 1225 }), false);
  check('short line', s.line, 'Read 2 of 14. 12 tiles may be missed. Scroll again.');
  check('the extras are marked unconfirmed while tiles are short', ctx.gridSheet(rec([], roster, { n: 3, max: 9 }), false).sections.find(x => x.key === 'extra').note, 'Not confirmed: tiles that were not read show here too.');
  check('exact line', ctx.gridSheet(rec([t('Feebas', 115)], roster, { n: 1, max: 9 }), false).line, 'Read 1 of 1. Every tile was seen.');
  check('over line', ctx.gridSheet(rec([t('Feebas', 115), t('Feebas', 115)], roster, { n: 1, max: 9 }), false).line, 'Read 2 but the game has 1. 1 tiles were read twice or misread.');
  check('no header', ctx.gridSheet(rec([t('Feebas', 115)], roster, null), false).line, 'Read 1 tiles. The count in the header was not seen, so missed tiles cannot be told.');
  check('strings follow the toggle', [s.strings[0].text, ctx.gridSheet(rec([t('Feebas', 115), t('Whismur', 81)], roster, null), true).strings[0].text], ['Whismur&cp81', 'cp81']);
  const long = ctx.gridSheet(rec(Array.from({ length: 40 }, (_, i) => t('Feebas', 100 + i)), [], null), false);
  check('long lists are cut with a count', [long.sections[0].rows.length, long.sections[0].rows[30]], [31, 'and 10 more']);
  check('no result, no sheet', ctx.gridSheet(null, false), null);
})();

if (failures.length) {
  console.error('FAIL ' + failures.length + ' (passed ' + pass + ')\n' + failures.join('\n'));
  process.exit(1);
}
console.log('grid reconcile: ' + pass + ' checks passed');
