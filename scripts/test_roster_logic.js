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
// evoRecordFor() — real GAME_MASTER data (via mechanics.js) must take
// precedence over the AI-guessed evoTable for any species it covers, and
// fall back to evoTable only when the real table has nothing for that name.
// This is the precedence rule the whole evoTable-replacement effort depends
// on; getting it backwards would silently keep every species on AI-guessed
// data even after real data was added.
// ---------------------------------------------------------------------------
(function testEvoRecordForPrefersRealDataOverAiTable() {
  const evoRecordBody = extractMethodBody(SRC, 'evoRecordFor(p) {');
  const ctx = {
    mechanics: {
      evolutionInfoFor: (name) => (name === 'onix'
        ? { to: 'Steelix', candy: 50, itemKey: 'metalCoat', itemLabel: 'Metal Coat' }
        : null)
    },
    // Deliberately WRONG AI-guessed data for onix, to prove real data wins
    // rather than being silently shadowed by whatever evoTable already has.
    state: { evoTable: { onix: { to: 'Wrong Guess', candy: 999, item: null } } }
  };
  ctx.evoRecordFor = new Function('p', evoRecordBody).bind(ctx);

  const real = ctx.evoRecordFor({ name: 'Onix' });
  check('real GAME_MASTER data wins over evoTable for a covered species', real, { to: 'Steelix', candy: 50, item: 'Metal Coat', itemKey: 'metalCoat' });

  const fallback = ctx.evoRecordFor({ name: 'SomeUnreleasedMon' });
  check('falls back to evoTable when real data has nothing for this species', fallback, null);

  ctx.state.evoTable.somenewmon = { to: 'GuessedEvo', candy: 25, item: null };
  const fallback2 = ctx.evoRecordFor({ name: 'SomeNewMon' });
  check('evoTable fallback is actually used (not just returning null) when real data is silent',
    fallback2, { to: 'GuessedEvo', candy: 25, item: null, itemKey: null });
})();

// ---------------------------------------------------------------------------
// evoInfoFor() — item-gated evolutions must not read READY off candy alone.
// Before this session, an evolution needing Metal Coat would show "READY TO
// EVOLVE" the moment candy was funded, with the item requirement rendered as
// inert text nobody's readiness depended on. These tests build the exact
// shape that bug needs (candy funded, item NOT on hand) and assert `ready`
// is false, not true — a regression here would silently reintroduce exactly
// that bug.
// ---------------------------------------------------------------------------
(function testEvoInfoForGatesOnItemNotJustCandy() {
  const evoInfoBody = extractMethodBody(SRC, 'evoInfoFor(p) {');
  const chainCandyCostBody = extractMethodBody(SRC, 'chainCandyCost(p) {');
  function makeCtx(evolutionItems, candyOnHand) {
    const ctx = {
      mechanics: {
        evolutionInfoFor: () => ({ to: 'Steelix', candy: 50, itemKey: 'metalCoat', itemLabel: 'Metal Coat' })
      },
      state: { evoTable: {}, evolutionItems },
      candyStockFor: () => ({ candy: candyOnHand, xlCandy: null })
    };
    // Single-hop mock: Onix -> Steelix is Onix's actual final stage, so make
    // the mock terminal there (matches production shape) rather than looping
    // forever off a name-blind mock — chainCandyCost has its own dedicated
    // test below, this one only needs evoInfoFor to not throw.
    ctx.evoRecordFor = function(p) {
      if (String(p.name || '').toLowerCase() === 'steelix') return null;
      const real = this.mechanics.evolutionInfoFor();
      return { to: real.to, candy: real.candy, item: real.itemLabel, itemKey: real.itemKey };
    };
    ctx.chainCandyCost = new Function('p', chainCandyCostBody).bind(ctx);
    ctx.evoInfoFor = new Function('p', evoInfoBody).bind(ctx);
    return ctx;
  }

  const p = { name: 'Onix' };

  const fundedNoItem = makeCtx({ metalCoat: 0 }, 50).evoInfoFor(p);
  check('candy funded but item count is 0 -> ready is false, not true', fundedNoItem.ready, false);
  check('itemReady is false when on-hand count is 0', fundedNoItem.itemReady, false);

  const fundedWithItem = makeCtx({ metalCoat: 1 }, 50).evoInfoFor(p);
  check('candy funded and item on hand -> ready is true', fundedWithItem.ready, true);

  const itemReadyNoCandy = makeCtx({ metalCoat: 1 }, 0).evoInfoFor(p);
  check('item on hand but candy short -> ready is still false (candy blocks independently)', itemReadyNoCandy.ready, false);

  const itemCountUnlogged = makeCtx({}, 50).evoInfoFor(p);
  check('candy funded but item count was never logged -> ready is unknown (null), not true',
    itemCountUnlogged.ready, null);
  check('an unlogged item count must not be silently treated as zero-on-hand',
    itemCountUnlogged.itemReady, null);
})();

// ---------------------------------------------------------------------------
// chainCandyCost() / evoInfoFor().chainReady — evolving a Pokemon now must
// not look "fully ready" off just the next stage's cost when the SAME
// individual still owes candy for a later stage too (Squirtle->Wartortle
// costs 25, but the line isn't done until Blastoise, another 100). This is
// the exact bug shape reported: an "evolve now" card that doesn't know
// evolving will spend candy the same Pokemon needs again downstream.
// ---------------------------------------------------------------------------
(function testChainCandyCostSumsFullRemainingLine() {
  const chainCandyCostBody = extractMethodBody(SRC, 'chainCandyCost(p) {');
  const evoInfoBody = extractMethodBody(SRC, 'evoInfoFor(p) {');
  // Squirtle -25-> Wartortle -100-> Blastoise (final stage, no further evo).
  const CHAIN = {
    squirtle: { to: 'Wartortle', candy: 25 },
    wartortle: { to: 'Blastoise', candy: 100 },
    blastoise: null
  };
  function makeCtx(candyOnHand) {
    const ctx = { state: { evoTable: {} }, candyStockFor: () => ({ candy: candyOnHand, xlCandy: null }) };
    ctx.evoRecordFor = function(p) {
      const rec = CHAIN[String(p.name || '').toLowerCase()];
      return rec ? { to: rec.to, candy: rec.candy, item: null, itemKey: null } : null;
    };
    ctx.chainCandyCost = new Function('p', chainCandyCostBody).bind(ctx);
    ctx.evoInfoFor = new Function('p', evoInfoBody).bind(ctx);
    return ctx;
  }

  const squirtle = { name: 'Squirtle' };
  check('chain cost sums every remaining stage, not just the next one',
    makeCtx(999).chainCandyCost(squirtle), 125);

  const midStock = makeCtx(30).evoInfoFor(squirtle);
  check('30 candy covers the next stage (25) so the immediate step reads ready', midStock.ready, true);
  check('but 30 does not cover the full 125 remaining line -> chainReady is false, not true',
    midStock.chainReady, false);

  const fullStock = makeCtx(125).evoInfoFor(squirtle);
  check('125 candy covers next stage AND the rest of the line -> chainReady is true', fullStock.chainReady, true);

  const wartortle = { name: 'Wartortle' };
  check('a final-stage species (Blastoise, no further evo) breaks the chain-need walk at null to',
    makeCtx(999).chainCandyCost({ name: 'Blastoise' }), 0);
  check('mid-chain species still sums correctly on its own', makeCtx(999).chainCandyCost(wartortle), 100);
})();

// ---------------------------------------------------------------------------
// megaEvolveInfoFor() — must charge the first-time cost before a species has
// ever been Mega Evolved, and the (lower) repeat cost after. Getting this
// backwards either overcharges every trainer's first Mega Evolve or
// undercharges every repeat — either way silently wrong energy math.
// ---------------------------------------------------------------------------
(function testMegaEvolveInfoForFirstVsRepeatCost() {
  const megaInfoBody = extractMethodBody(SRC, 'megaEvolveInfoFor(key) {');
  function makeCtx(history, energyOnHand) {
    const ctx = {
      mechanics: {
        megaEvolveCostFor: (key, hist) => ([{
          form: null, cost: (hist && hist['']) ? 40 : 200, first: 200, subsequent: 40
        }])
      },
      state: {
        megaEvolvedHistory: history,
        megaEnergyInventory: { charizard: { name: 'Charizard', amount: energyOnHand } }
      }
    };
    ctx.megaEvolveInfoFor = new Function('key', megaInfoBody).bind(ctx);
    return ctx;
  }

  const beforeFirstEvolve = makeCtx({}, 200).megaEvolveInfoFor('charizard');
  check('first-ever Mega Evolve is priced at the full first-time cost', beforeFirstEvolve[0].cost, 200);
  check('200 energy exactly covers the first-time cost -> ready', beforeFirstEvolve[0].ready, true);

  const afterFirstEvolve = makeCtx({ charizard: { '': true } }, 40).megaEvolveInfoFor('charizard');
  check('after one Mega Evolve, repeat cost applies instead of first-time cost', afterFirstEvolve[0].cost, 40);
  check('40 energy exactly covers the repeat cost -> ready', afterFirstEvolve[0].ready, true);

  const notEnoughForRepeat = makeCtx({ charizard: { '': true } }, 39).megaEvolveInfoFor('charizard');
  check('one energy short of the repeat cost -> not ready', notEnoughForRepeat[0].ready, false);
})();

// ---------------------------------------------------------------------------
console.log(`${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\nFailures:\n' + failures.join('\n\n'));
  process.exit(1);
}
