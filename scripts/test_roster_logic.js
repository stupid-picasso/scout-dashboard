#!/usr/bin/env node
/**
 * test_roster_logic.js — regression tests for roster identity/visibility
 * logic in Scout Dashboard.dc.html: isRemoved()/pokeSig() (who gets hidden
 * when something is marked transferred) and the Professor chat's two-list
 * context split (who gets full detail sent to the model).
 *
 * WHY THIS EXISTS
 * ----------------
 * A single session shipped two real bugs in this exact area, and a static
 * code review (reading the logic and reasoning about it) caught NEITHER —
 * both only surfaced when a real user hit realistic data:
 *
 *   1. isRemoved() hid a Pokemon if its OWN id matched removedIds, OR if its
 *      SIGNATURE (name+CP+HP) did. Any group of Pokemon sharing a signature
 *      — the norm for anything not yet appraised, since CP/HP alone can't
 *      tell identical individuals apart — shared one signature, so removing
 *      ONE hid ALL of them, and re-adding one un-hid all of them.
 *   2. The Professor chat's "everything else" list excluded anything
 *      lucky/shadow/favorite. A Pokemon that was BOTH flagged AND outside
 *      the top-90-by-rank list landed in neither list — zero CP/HP/IV/moves
 *      sent to the model for it at all, even when asked about by name.
 *
 * Both bugs require constructing SPECIFIC data shapes (duplicate signatures;
 * a flagged Pokemon ranked outside the top slice) to reproduce — reading the
 * code in isolation doesn't surface either one. So these tests don't check
 * "is the logic sensible", they build exactly those data shapes and assert
 * on the real, live-extracted source's actual behavior against them.
 *
 * These tests extract the real function source out of the shipped file
 * (same pattern as test_ranking.js does for pokemon-mechanics.js) rather
 * than reimplementing the logic, so a future edit that reintroduces either
 * bug shape gets caught here instead of by another support conversation.
 *
 * USAGE
 * -----
 *   node scripts/test_roster_logic.js
 *
 * Exits 0 if everything matches, non-zero (with a diff-style report) if
 * anything doesn't. No dependencies beyond Node's stdlib.
 */
const fs = require('fs');
const path = require('path');

const REPO = path.dirname(__dirname);
const SRC = fs.readFileSync(path.join(REPO, 'Scout Dashboard.dc.html'), 'utf8');

let pass = 0;
let fail = 0;
const failures = [];

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; }
  else {
    fail++;
    failures.push(`  ${name}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`);
  }
}

function extractMethodBody(src, signature) {
  const i = src.indexOf(signature);
  if (i < 0) throw new Error(`Could not find "${signature}" in source — has it been renamed?`);
  const braceStart = src.indexOf('{', i);
  let depth = 0, j = braceStart;
  for (; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) break; }
  }
  return src.slice(braceStart + 1, j);
}

// ---------------------------------------------------------------------------
// isRemoved() / pokeSig() — bug #1 shape: duplicate signatures must not
// cross-hide each other.
// ---------------------------------------------------------------------------
const pokeSigBody = extractMethodBody(SRC, 'pokeSig(p) {');
const isRemovedBody = extractMethodBody(SRC, 'isRemoved(p, removedSet) {');

const ctx = {
  pokeSig: new Function('p', pokeSigBody),
};
ctx.isRemoved = new Function('p', 'removedSet', isRemovedBody).bind(ctx);

(function testDuplicateSignaturesDontCrossHide() {
  // Four real Gyarados a trainer could plausibly own before appraising any
  // of them: identical species/CP/HP, distinct idx. This is the exact shape
  // that triggered the live bug.
  const roster = [
    { idx: 'a', name: 'Gyarados', cp: 1057, hp: 90 },
    { idx: 'b', name: 'Gyarados', cp: 1057, hp: 90 },
    { idx: 'c', name: 'Gyarados', cp: 1057, hp: 90 },
    { idx: 'd', name: 'Gyarados', cp: 1057, hp: 90 },
  ];

  // Mirrors exactly what the OLD, buggy removePokemon() used to write to
  // removedIds: both the idx AND the signature. Testing isRemoved() against
  // idx-only input would never exercise the sig-check branch at all, buggy
  // or not — a removedIds array can still contain legacy sig entries from
  // before the fix (old localStorage/Firestore data), so the read side needs
  // to be robust to that shape regardless of what today's write side does.
  const removedSet = new Set(['a', ctx.pokeSig(roster[0])]);
  const visible = roster.filter(p => !ctx.isRemoved(p, removedSet)).map(p => p.idx);
  check('removing one duplicate-signature Pokemon hides only that one', visible, ['b', 'c', 'd']);

  // Also confirm a distinct-idx-but-real-transfer case still works normally.
  const roster2 = [{ idx: 'x', name: 'Pidgey', cp: 400, hp: 40 }];
  const removedSet2 = new Set(['x']);
  check('a genuinely removed unique Pokemon is still hidden',
    roster2.filter(p => !ctx.isRemoved(p, removedSet2)).map(p => p.idx), []);
})();

// ---------------------------------------------------------------------------
// Chat-context list split — bug #2 shape: a flagged (lucky/shadow/favorite)
// Pokemon ranked outside the top slice must still land in the second list.
// ---------------------------------------------------------------------------
const listSplitSrc = (() => {
  const i = SRC.indexOf('const byRank = [...roster]');
  const j = SRC.indexOf('.slice(0, 150);', i);
  if (i < 0 || j < 0) throw new Error('Could not find the BEST/EVERYTHING ELSE list-building block — has it moved?');
  return SRC.slice(i, j + '.slice(0, 150);'.length);
})();

// bestRank is normally IV/level dependent PvP math (pokemon-mechanics.js) —
// irrelevant to what this test checks (coverage, not ranking correctness),
// so a simple injected stand-in keeps this test independent of that engine.
const buildListsFn = new Function('roster', `
  ${listSplitSrc}
  return { topIdx: [...topIdx], cutIdx: cutCandidates.map(p => p.idx) };
`);
function buildLists(roster, bestRank) {
  const isShadow = p => p.shadowPurified === '1' || p.shadowPurified === 1;
  return buildListsFn.call({ bestRank, isShadow }, roster);
}

(function testFlaggedLowRankPokemonIsNotInvisible() {
  const roster = [];
  // 95 high-rank filler Pokemon to push a flagged one out of the top-90 slice.
  for (let n = 0; n < 95; n++) roster.push({ idx: 'filler' + n, rank: 100 - n });
  // The exact shape that went missing live: flagged, low rank, real Pokemon.
  roster.push({ idx: 'the-gyarados', rank: 1, lucky: true, ivAvg: 82 });

  const bestRank = p => p.rank;
  const { topIdx, cutIdx } = buildLists(roster, bestRank);
  const allCovered = new Set([...topIdx, ...cutIdx]);
  check('a lucky Pokemon ranked outside the top 90 still appears in some list',
    allCovered.has('the-gyarados'), true);

  // And the general invariant this bug violated: nobody should ever be
  // covered by neither list (within the 90 + 150 = 240 combined cap).
  const uncovered = roster.filter(p => !allCovered.has(p.idx));
  check('no roster member (within combined cap) is covered by neither list',
    uncovered.length, Math.max(0, roster.length - 240));
})();

(function testShadowAndFavoriteAlsoNotExcluded() {
  const roster = [];
  for (let n = 0; n < 95; n++) roster.push({ idx: 'filler' + n, rank: 100 - n });
  roster.push({ idx: 'shadow-mon', rank: 2, shadowPurified: '1' });
  roster.push({ idx: 'favorite-mon', rank: 3, favorite: true });

  const bestRank = p => p.rank;
  const { topIdx, cutIdx } = buildLists(roster, bestRank);
  const allCovered = new Set([...topIdx, ...cutIdx]);
  check('a shadow Pokemon ranked outside the top 90 still appears in some list', allCovered.has('shadow-mon'), true);
  check('a favorite Pokemon ranked outside the top 90 still appears in some list', allCovered.has('favorite-mon'), true);
})();

(function testCloseDetailClearsAbandonedMoveDraft() {
  const closeDetailBody = extractMethodBody(SRC, 'closeDetail() {');
  const ctx2 = { state: { detailPoke: { idx: 'garchomp1' }, moveDraft: { garchomp1: { quickMove: 'Fire Fang' } }, movePicker: { pokeIdx: 'garchomp1', field: 'quickMove' }, movePickerFilter: 'fire' } };
  ctx2.setState = function(patch) { Object.assign(this.state, patch); };
  ctx2.closeDetail = new Function(closeDetailBody).bind(ctx2);
  ctx2.closeDetail();
  check('closeDetail clears the abandoned move draft', ctx2.state.moveDraft, {});
  check('closeDetail clears the open move picker', ctx2.state.movePicker, null);
  check('closeDetail clears the move picker filter text', ctx2.state.movePickerFilter, '');
})();

// ---------------------------------------------------------------------------
console.log(`${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\nFailures:\n' + failures.join('\n\n'));
  process.exit(1);
}
