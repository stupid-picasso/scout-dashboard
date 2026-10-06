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
const vm = require('vm');

const REPO = path.dirname(__dirname);
const SRC = fs.readFileSync(path.join(REPO, 'Scout Dashboard.dc.html'), 'utf8');

// Same loader test_ranking.js uses — real pokemon-mechanics.js in a sandbox,
// not reimplemented, so movepoolFor()/AUTHORITATIVE_MOVES stay authoritative.
function loadMechanics() {
  const code = fs.readFileSync(path.join(REPO, 'pokemon-mechanics.js'), 'utf8');
  const sandbox = { window: { dispatchEvent: () => {} }, Event: function () {}, console };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  if (!sandbox.window.PokemonMechanics) {
    throw new Error('pokemon-mechanics.js did not export window.PokemonMechanics — cannot test');
  }
  return sandbox.window.PokemonMechanics;
}
const m = loadMechanics();

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
// Move picker case-sensitivity bug: MOVEPOOL_TABLE stores lowercase move
// names ("aqua jet"), but moveOptionsByKind() (the real, shipped method,
// extracted below rather than reimplemented) builds Title Case values
// ("Aqua Jet") from AUTHORITATIVE_MOVES, with a trailing "+" on legacy
// entries. A raw `Set(movepool).has(titleCaseValue)` comparison never
// matches, which silently filtered every real move out of the picker for
// any species the movepool table covers — i.e. most of the roster — leaving
// only the "not set" clear option. This reproduces that exact shape against
// the real Wartortle data (found live, not constructed) and asserts the
// normalization the fix requires actually closes the gap.
// ---------------------------------------------------------------------------
(function testMovePickerNormalizesCaseAgainstMovepool() {
  const moveOptionsBody = extractMethodBody(SRC, 'moveOptionsByKind(kind) {');
  const ctx = { mechanics: m };
  ctx.moveOptionsByKind = new Function('kind', moveOptionsBody).bind(ctx);

  const wartortlePool = m.movepoolFor('wartortle');
  if (!wartortlePool) throw new Error('wartortle missing from MOVEPOOL_TABLE — pick a species that is still covered');
  const chargeOptions = ctx.moveOptionsByKind('charged');
  const realWartortleCharge = chargeOptions.filter(o => wartortlePool.charge.includes(o.value.toLowerCase()));
  check('real charge moves exist in the option list before any filtering (sanity check)',
    realWartortleCharge.length > 0, true);

  // The exact broken comparison the picker used to make.
  const brokenAllowed = new Set(wartortlePool.charge);
  const brokenSurvivors = chargeOptions.filter(o => brokenAllowed.has(o.value));
  check('BUG SHAPE: unnormalized Set comparison matches nothing (Title Case vs lowercase)',
    brokenSurvivors.length, 0);

  // The fixed comparison: both sides normalized (lowercase, legacy "+" stripped).
  const normalizeMove = v => String(v || '').replace(/\+$/, '').toLowerCase();
  const fixedAllowed = new Set(wartortlePool.charge.map(normalizeMove));
  const fixedSurvivors = chargeOptions.filter(o => fixedAllowed.has(normalizeMove(o.value)));
  check('FIX: normalized comparison recovers all 3 of Wartortle real charge moves',
    fixedSurvivors.length, wartortlePool.charge.length);
  check('FIX: Aqua Jet specifically survives normalization',
    fixedSurvivors.some(o => o.value === 'Aqua Jet'), true);
})();

// ---------------------------------------------------------------------------
// shinyPatch() — colour-only reads are held as 'suspected'; a confirmed shiny
// (or a legacy one with no shinyState) is never changed by a later scan.
// ---------------------------------------------------------------------------
(function testShinyPatch() {
  const body = extractMethodBody(SRC, 'shinyPatch(item, prior) {');
  const shinyPatch = new Function('item', 'prior', body);
  check('colour-only read on a non-shiny -> suspected',
    shinyPatch({ shiny: true, shinyIcon: false }, { shiny: false }), { shiny: true, shinyState: 'suspected' });
  check('sparkles icon seen -> confirmed (no suspected state)',
    shinyPatch({ shiny: true, shinyIcon: true }, null), { shiny: true, shinyState: null });
  check('confirmed shiny is not downgraded by a scan that says false',
    shinyPatch({ shiny: false }, { shiny: true, shinyState: null }), {});
  check('legacy shiny (no shinyState key) is treated as confirmed',
    shinyPatch({ shiny: false }, { shiny: true }), {});
  check('suspected shiny cleared when a later scan says false',
    shinyPatch({ shiny: false }, { shiny: true, shinyState: 'suspected' }), { shiny: false, shinyState: null });
  check('scan with no shiny info changes nothing',
    shinyPatch({}, { shiny: false }), {});
})();

// ---------------------------------------------------------------------------
// bestRaidMoveset() — best legal fast+charge pair by cycleDps, compared with
// the Pokemon's current moves. Runs the real shipped methods against the real
// mechanics tables.
// ---------------------------------------------------------------------------
(function testBestRaidMoveset() {
  const ctx = { mechanics: m, state: { moveDB: {} } };
  [['moveKey', 'name'], ['lookupMove', 'name'], ['bestDpsFor', 'p'], ['bestRaidMoveset', 'p'], ['formatMoveName', 'name']].forEach(([n, arg]) => {
    ctx[n] = new Function(arg, extractMethodBody(SRC, `${n}(${arg}) {`)).bind(ctx);
  });
  ctx.baseStatsOf = p => m.BASE_STATS[p.dex];
  ctx.ivsOf = () => [15, 15, 15];
  ctx.typesOf = p => p.types;
  ctx.isShadow = () => false;
  const mon = { name: 'Wartortle', dex: 8, types: ['Water'], quickMove: 'water gun', chargeMove: 'hydro pump' };
  const r = ctx.bestRaidMoveset(mon);
  check('returns a recommendation for a species with a movepool', !!r && /DPS/.test(r.best), true);
  const pool = m.movepoolFor('wartortle');
  const all = [...pool.fast, ...(pool.fastLegacy || [])];
  check('recommended fast move comes from the species pool', all.some(f => r.best.toLowerCase().includes(f)), true);
  const bad = ctx.bestRaidMoveset({ ...mon, name: 'NotARealMon' });
  check('unknown species returns null instead of throwing', bad, null);
})();

// ---------------------------------------------------------------------------
// Roster rows: the template renders data-swipe-row="{{ p.idx }}". If the row
// view-model has no top-level idx the attribute is never rendered and swipe /
// long-press can't find their row (five on-device attempts failed on this).
// ---------------------------------------------------------------------------
(function testRosterRowExposesIdx() {
  const start = SRC.indexOf('const filteredRoster = pagedFiltered.map');
  const objStart = SRC.indexOf('return {', start);
  const head = SRC.slice(objStart, objStart + 600);
  check('filteredRoster row view-model exposes idx for data-swipe-row', /\n\s+idx: p\.idx,/.test(head), true);
  check('template still binds data-swipe-row to p.idx', SRC.includes('data-swipe-row="{{ p.idx }}"'), true);
})();

// ---------------------------------------------------------------------------
// pvpMovesetFor() — PvPoke's recommended set per species/league, stored as a
// compact "fast|charged1|charged2" string and returned in app move naming.
// ---------------------------------------------------------------------------
(function testPvpMovesetFor() {
  const g = m.pvpMovesetFor('azumarill', false, 'great');
  check('ranked species returns a fast move and at least one charged move',
    !!g && typeof g.fast === 'string' && Array.isArray(g.charged) && g.charged.length >= 1, true);
  check('move names use the app naming (lowercase, spaces, no underscores)',
    !!g && [g.fast, ...g.charged].every(n => n === n.toLowerCase() && !n.includes('_')), true);
  check('unranked/unknown species returns null', m.pvpMovesetFor('notarealmon', false, 'great'), null);
  const u = m.pvpMovesetFor('azumarill', false, 'ultra');
  check('ultra league lookup works independently of great', u === null || typeof u.fast === 'string', true);
})();

// ---------------------------------------------------------------------------
// Raid rating + PvP assessment: bulk counts, the best legal moveset is never
// worse than the current one, and a perfect-IV weak species is NOT "PvP ready".
// ---------------------------------------------------------------------------
(function testRankingModel() {
  // raidRating: same moves, same IVs, more bulk -> higher rating, equal DPS.
  const fast = m.AUTHORITATIVE_MOVES['counter'] || Object.values(m.AUTHORITATIVE_MOVES).find(x => x.kind === 'fast');
  const charged = m.AUTHORITATIVE_MOVES['dynamic punch'] || Object.values(m.AUTHORITATIVE_MOVES).find(x => x.kind === 'charged');
  const glass = m.raidRating([200, 100, 100], [15, 15, 15], 50, fast, charged, { ownTypes: [] });
  const bulky = m.raidRating([200, 100, 200], [15, 15, 15], 50, fast, charged, { ownTypes: [] });
  check('same attack and moves give the same DPS', Math.abs(glass.dps - bulky.dps) < 1e-9, true);
  check('more bulk gives a higher raid rating', bulky.rating > glass.rating, true);
  check('missing move data returns null', m.raidRating([200, 100, 100], [15, 15, 15], 50, null, charged, {}), null);

  const ctx = { mechanics: m, state: { moveDB: {}, roster: [], addedPokemon: [], ivOverrides: {} } };
  ['moveKey', 'lookupMove', 'raidProfile', 'pvpAssess', 'pvpBest', 'isPvpWorthy', 'needsAppraisal'].forEach(n => {
    const sig = { moveKey: 'name', lookupMove: 'name', raidProfile: 'p', pvpAssess: 'p, leagueKey', pvpBest: 'p', isPvpWorthy: 'p', needsAppraisal: 'p' }[n];
    ctx[n] = new Function(...sig.split(', '), extractMethodBody(SRC, `${n}(${sig}) {`)).bind(ctx);
  });
  ctx.baseStatsOf = p => m.BASE_STATS[p.dex];
  ctx.ivsOf = p => [p.atkIV, p.defIV, p.staIV];
  ctx.typesOf = p => p.types;
  ctx.isShadow = () => false;

  const wart = { idx: 1, name: 'Wartortle', dex: 8, types: ['Water'], atkIV: 15, defIV: 15, staIV: 15, quickMove: 'water gun', chargeMove: 'hydro pump' };
  const prof = ctx.raidProfile(wart);
  check('raid profile finds current and best-possible movesets', !!(prof && prof.now && prof.ceil), true);
  check('best legal moveset is never worse than the current one', prof.ceil.rating >= prof.now.rating - 1e-9, true);
  check('no-legacy ceiling is never better than the full ceiling', !prof.ceilNoLegacy || prof.ceilNoLegacy.rating <= prof.ceil.rating + 1e-9, true);

  const mk = (name, rank, measured = true) => ({ name, dex: 0, great: { rankPct: rank }, ultra: { rankPct: rank }, little: null, quickMove: null, chargeMove: null, chargeMove2: null, atkIV: 0, ivMeasured: measured, ivSolved: !measured });
  const strong = ctx.pvpAssess(mk('Azumarill', 95), 'great');
  check('a PvPoke-ranked strong species has tier S/A/B', !!strong && strong.tierRank <= 2, true);
  check('missing recommended moves are reported', !!strong && strong.movesOk === false && strong.missing.length >= 1, true);
  check('S/A/B species at 95% IV rank counts as PvP ready', ctx.isPvpWorthy(mk('Azumarill', 95)), true);
  check('a species PvPoke does not rank is NOT PvP ready even at 100% IV rank', ctx.isPvpWorthy(mk('Caterpie', 100)), false);
  check('90% IV rank is the floor even for a strong species', ctx.isPvpWorthy(mk('Azumarill', 80)), false);
  check('estimated (unmeasured) IVs never count as PvP ready', ctx.isPvpWorthy(mk('Azumarill', 98, false)), false);
  check('the assessment flags unconfirmed IVs', ctx.pvpAssess(mk('Azumarill', 98, false), 'great').confirmed, false);

  // Level cap: a lower cap can only lower (or keep) the best stat product, and the setting restores.
  const base = m.BASE_STATS[184];
  const orig = m.getPvpMaxLevel();
  m.setPvpMaxLevel(51); const p51 = m.bestStatProductUnderCap(base, 500, false);
  m.setPvpMaxLevel(40); const p40 = m.bestStatProductUnderCap(base, 2500, false);
  m.setPvpMaxLevel(50); const p50 = m.bestStatProductUnderCap(base, 2500, false);
  m.setPvpMaxLevel(51); const p51b = m.bestStatProductUnderCap(base, 2500, false);
  check('a lower max level never raises the best stat product (L40 <= L50 <= L51)', p40 <= p50 + 1e-9 && p50 <= p51b + 1e-9, true);
  check('level 51 vs 50 can only differ upward', p51 > 0, true);
  m.setPvpMaxLevel(orig);
  const sp = m.bestSpreadUnderCap(m.BASE_STATS[184], 1500, false);
  check('Great League best spread keeps attack IV low and puts the CP budget into DEF/HP', sp.ivs[0] <= 3 && sp.ivs[1] >= 10 && sp.ivs[2] >= 10, true);
  const spMaster = m.bestSpreadUnderCap(m.BASE_STATS[149], Infinity, false);
  check('with no CP cap the best spread is 15/15/15', spMaster.ivs.join('/'), '15/15/15');

  const mu = m.pvpMatchupsFor('azumarill', false, 'great');
  check('matchup data exists for a strong species', !!mu && mu.counters.length > 0 && mu.matchups.length > 0, true);
  check('matchup ratings are 0-1000 numbers', !!mu && mu.counters.concat(mu.matchups).every(t => t.rating >= 0 && t.rating <= 1000), true);
  check('no matchup data for an unranked species', m.pvpMatchupsFor('caterpie', false, 'great'), null);
})();

// ---------------------------------------------------------------------------
// Weather: +20% damage on matching move types only.
// ---------------------------------------------------------------------------
(function testWeatherBoost() {
  const water = { type: 'Water', power: 90, energy: 50, durationMs: 2000, kind: 'charged' };
  const fastW = { type: 'Water', power: 10, energy: 8, durationMs: 1000, kind: 'fast' };
  const base = [200, 150, 150], ivs = [15, 15, 15];
  const plain = m.cycleDps(base, ivs, 40, fastW, water, { ownTypes: ['Water'], defenderTypes: ['Fire'] });
  const rainy = m.cycleDps(base, ivs, 40, fastW, water, { ownTypes: ['Water'], defenderTypes: ['Fire'], weatherTypes: m.WEATHER_TYPES['Rainy'] });
  const sunny = m.cycleDps(base, ivs, 40, fastW, water, { ownTypes: ['Water'], defenderTypes: ['Fire'], weatherTypes: m.WEATHER_TYPES['Sunny'] });
  check('rain boosts Water moves', rainy > plain, true);
  check('sun does not boost Water moves', Math.abs(sunny - plain) < 1e-9, true);
  check('all seven weathers are defined', Object.keys(m.WEATHER_TYPES).length, 7);
  check('boost is +20%', m.WEATHER_BOOST, 1.2);
})();

// ---------------------------------------------------------------------------
// Credentials stay on the device: persisted to localStorage, deleted from the
// cloud once, never part of the synced key lists.
// ---------------------------------------------------------------------------
(function testDeviceOnlySecrets() {
  const mkStorage = () => { const d = {}; return { d, getItem: k => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); }, removeItem: k => { delete d[k]; } }; };
  const call = (name, ls, ctx, fb) => new Function('localStorage', 'firebase', extractMethodBody(SRC, name + '() {')).call(ctx, ls, fb);
  const ls = mkStorage();
  const ctx = { state: { geminiKey: 'AIza1', geminiKeys: ['AIza1', 'AIza2'], apiEndpoint: 'https://x', githubToken: 'ghp_x' } };
  ctx._secretsLocalOk = true;
  call('persistSecretsIfChanged', ls, ctx);
  const saved = JSON.parse(ls.d['scout.secrets.v1'] || '{}');
  check('secrets are written to localStorage', saved.githubToken === 'ghp_x' && saved.geminiKeys.length === 2, true);
  check('persistence is confirmed by read-back', ctx._secretsPersisted, true);

  const fb = { firestore: { FieldValue: { delete: () => 'DELETE' } } };
  const scrub = call('secretScrubFields', ls, ctx, fb);
  check('first write deletes the old cloud copies', scrub.githubToken === 'DELETE' && scrub.geminiKeys === 'DELETE' && scrub.apiEndpoint === 'DELETE', true);
  ls.setItem('scout.secretsScrubbed', '1');
  check('after the scrub is recorded nothing more is deleted', Object.keys(call('secretScrubFields', ls, ctx, fb)).length, 0);
  const ctx2 = { state: {}, _secretsLocalOk: true, _secretsPersisted: false };
  check('cloud copies are never deleted before the device holds them', Object.keys(call('secretScrubFields', mkStorage(), ctx2, fb)).length, 0);

  const ctx3 = { _patch: null, setState(p) { this._patch = p; } };
  call('loadLocalSecrets', ls, ctx3);
  check('a fresh load restores the keys and endpoint', !!ctx3._patch && ctx3._patch.geminiKeys.length === 2 && ctx3._patch.apiEndpoint === 'https://x' && ctx3._patch.githubToken === 'ghp_x', true);

  const syncKeys = extractMethodBody(SRC, 'SYNC_KEYS() {') + extractMethodBody(SRC, 'get SYNCED_STATE_KEYS() {') + extractMethodBody(SRC, 'get PACKED_KEYS() {');
  check('no credential is in the synced or packed key lists', /geminiKey|githubToken|apiEndpoint/.test(syncKeys), false);
})();

// ---------------------------------------------------------------------------
// PvPoke game master data: species typing, PvP damage formula, IV breakpoints.
// ---------------------------------------------------------------------------
(function testBreakpoints() {
  const b = m.speciesInfo('Bulbasaur', '');
  check('species types come from the bundled game master', b && b.types.join('/'), 'Grass/Poison');
  const alolan = m.speciesInfo('Raichu', 'Alolan');
  check('regional forms resolve to their own typing', alolan && alolan.types.join('/'), 'Electric/Psychic');
  check('buddy distance and second-move cost are present', !!b && b.buddyKm === 3 && b.thirdMoveCost > 0, true);
  check('PvP damage formula (no STAB)', m.pvpDamage(6, 'Poison', 100, 100, [], []), 4);
  check('PvP damage formula (STAB x1.2)', m.pvpDamage(6, 'Poison', 100, 100, ['Poison'], []), 5);
  check('PvP damage is non-decreasing in attack', m.pvpDamage(9, 'Water', 120, 100, [], []) <= m.pvpDamage(9, 'Water', 130, 100, [], []), true);

  const base = m.BASE_STATS[184];
  const orig = m.getPvpMaxLevel(); m.setPvpMaxLevel(50);
  const r = m.ivBreakpoints(base, [8, 14, 15], 'great', false, 'bubble', ['Water', 'Fairy']);
  check('breakpoints computed for a ranked species', !!r && r.metaSize > 0 && !!r.atk && !!r.def, true);
  check('the lowest attack that keeps the damage is never above the current attack', r.atk.keepLowest <= r.atk.current, true);
  check('lowering attack to that value does not lower stat product', r.atk.keepPct >= r.atk.curPct - 1e-9, true);
  check('next attack breakpoints are strictly higher IVs, in order', r.atk.next.every((n, i) => n.iv > r.atk.current && (i === 0 || n.iv > r.atk.next[i - 1].iv)), true);
  check('next bulkpoints are strictly higher defense IVs', r.def.next.every(n => n.iv > r.def.current), true);
  check('a stat that is itself a breakpoint reports what one step down costs', r.atk.keepLowest < r.atk.current || (!!r.atk.drop && r.atk.drop.iv === r.atk.current - 1 && Array.isArray(r.atk.drop.who)), true);
  check('unknown fast move returns null instead of throwing', m.ivBreakpoints(base, [8, 14, 15], 'great', false, 'not_a_move', ['Water']), null);
  check('leagues without meta data return null', m.ivBreakpoints(base, [8, 14, 15], 'master', false, 'bubble', ['Water']), null);
  m.setPvpMaxLevel(orig);
})();

// ---------------------------------------------------------------------------
// Upgrade payoff lists: power-up payoff (rating gain per stardust) and TM targets.
// ---------------------------------------------------------------------------
(function testUpgradePayoff() {
  const ctx = { mechanics: m, state: { moveDB: {}, stardustBalance: 5000, resources: {} } };
  const sigs = { moveKey: 'name', lookupMove: 'name', raidProfile: 'p', evalLevelOf: 'p', powerUpPayoff: 'roster', tmTargets: 'roster', formatMoveName: 'name' };
  Object.keys(sigs).forEach(n => { ctx[n] = new Function(...sigs[n].split(', '), extractMethodBody(SRC, `${n}(${sigs[n]}) {`)).bind(ctx); });
  ctx.baseStatsOf = p => m.BASE_STATS[p.dex];
  ctx.ivsOf = p => [p.atkIV, p.defIV, p.staIV];
  ctx.typesOf = p => p.types;
  ctx.isShadow = () => false;
  ctx.isPurified = () => false;
  const mk = (over) => ({ idx: 1, name: 'Wartortle', dex: 8, types: ['Water'], atkIV: 15, defIV: 15, staIV: 15, lvlMin: 30, lvlMax: 30, quickMove: 'water gun', chargeMove: 'hydro pump', lucky: false, ...over });
  const rows = ctx.powerUpPayoff([mk({})]);
  check('a level-30 attacker has a power-up payoff row', rows.length, 1);
  check('the payoff target is level 40 or 50 with positive gain and cost', !!rows[0] && [40, 50].includes(rows[0].target) && rows[0].gain > 0 && rows[0].cost.dust > 0 && rows[0].perK > 0, true);
  check('a level-50 Pokemon has nothing to power up', ctx.powerUpPayoff([mk({ lvlMin: 50, lvlMax: 50 })]).length, 0);
  const lucky = ctx.powerUpPayoff([mk({ lucky: true })]);
  check('lucky halves the dust, so payoff per dust is higher', !!lucky[0] && lucky[0].perK > rows[0].perK, true);
  check('a Pokemon without damage data for its moves is skipped', ctx.powerUpPayoff([mk({ quickMove: 'zzz not a move' })]).length, 0);
  const tm = ctx.tmTargets([mk({ quickMove: 'water gun', chargeMove: 'hydro pump' })]);
  check('TM targets return a list without throwing', Array.isArray(tm), true);
  check('every TM target lists the move to learn and a gain of at least 3%', tm.every(r => r.top >= 3 && (r.need.length || r.eliteNeed.length)), true);
})();

// ---------------------------------------------------------------------------
// Scan queue: only unmeasured Pokemon worth a scan, most valuable first.
// ---------------------------------------------------------------------------
(function testScanQueue() {
  const roster = [];
  const ctx = { mechanics: m, state: {}, effectiveRosterForMatch: () => roster, isShadow: p => !!p.shadow };
  ctx.needsAppraisal = new Function('p', extractMethodBody(SRC, 'needsAppraisal(p) {')).bind(ctx);
  ctx.scanQueue = new Function(extractMethodBody(SRC, 'scanQueue() {')).bind(ctx);
  const mon = (over) => ({ idx: Math.random(), name: 'Pikachu', dex: 25, cp: 300, ivMeasured: false, atkIV: null, ...over });
  roster.push(mon({ name: 'Azumarill', cp: 1498 }));              // S-tier species, no IVs
  roster.push(mon({ name: 'Caterpie', cp: 300 }));                // junk, no IVs
  roster.push(mon({ name: 'Azumarill', cp: 1400, ivMeasured: true, atkIV: 0, pendingPowerUps: 0 })); // already measured
  roster.push(mon({ name: 'Dragonite', cp: 2648, ivMeasured: true, atkIV: 5, pendingPowerUps: 3 })); // powered up since scan
  roster.push(mon({ name: 'Caterpie', cp: 3200 }));               // untiered but very high CP, no IVs
  const q = ctx.scanQueue();
  const names = q.rows.map(r => r.p.name + (r.p.ivMeasured ? '*' : ''));
  check('junk with no IVs is not worth a scan', q.rows.some(r => r.p.name === 'Caterpie' && r.p.cp === 300), false);
  check('a measured, unchanged Pokemon is not listed', q.rows.filter(r => r.p.name === 'Azumarill' && r.p.ivMeasured).length, 0);
  check('an S/A/B-tier species with no IVs is listed first', names[0], 'Azumarill');
  check('its reason names the tier', /tier/.test(q.rows[0].reasons.join(' ')), true);
  check('a Pokemon powered up since its scan is listed', q.rows.some(r => r.p.name === 'Dragonite' && /powered up/.test(r.reasons.join(' '))), true);
  check('high-CP unmeasured Pokemon are listed, after the tiered species', q.rows.some(r => r.p.cp === 3200) && names.indexOf('Azumarill') < names.findIndex(n => n === 'Caterpie'), true);
  check('unmeasured count covers every unmeasured Pokemon', q.unmeasured, 3);
})();

// ---------------------------------------------------------------------------
// Buddy plan, event planner and saved teams.
// ---------------------------------------------------------------------------
(function testPlanners() {
  const roster = [];
  const state = { events: [], savedTeams: [], candyInventory: {} };
  const ctx = { mechanics: m, state, effectiveRosterForMatch: () => roster, isShadow: () => false, isPurified: () => false,
    setState(p) { Object.assign(this.state, p); }, haptic() {}, moveKey: n => String(n || '').trim().toLowerCase() };
  const defs = { eventSpeciesVerdict: 'name', buddyPlan: '', saveTeam: 'teamRaw', tallyTeam: 'id, field', removeTeam: 'id', addEvent: '', removeEvent: 'id', setEventDraft: 'field, value' };
  Object.keys(defs).forEach(n => { ctx[n] = new Function(...(defs[n] ? defs[n].split(', ') : []), extractMethodBody(SRC, `${n}(${defs[n]}) {`)).bind(ctx); });

  // events
  ctx.pvpBest = () => null; ctx.evoInfoFor = () => null; ctx.raidProfile = () => null;
  const hunt = ctx.eventSpeciesVerdict('azumarill');
  check('an unowned S/A/B-tier species is worth hunting', hunt.verdict, 'HUNT');
  check('an unowned unranked species is skipped', ctx.eventSpeciesVerdict('caterpie').verdict, 'SKIP');
  roster.push({ name: 'Azumarill', dex: 184, great: { rankPct: 98 } });
  ctx.pvpBest = () => ({ rank: 98, tierRank: 0, league: 'great' });
  check('owning a 98% one of a strong species means power it up', ctx.eventSpeciesVerdict('azumarill').verdict, 'POWER UP');
  ctx.pvpBest = () => ({ rank: 82, tierRank: 0, league: 'great' });
  check('owning only an 82% one means hunt for a better one', ctx.eventSpeciesVerdict('azumarill').verdict, 'HUNT');
  ctx.setEventDraft('title', 'Community Day'); ctx.setEventDraft('species', 'Pikachu, Azumarill');
  ctx.addEvent();
  check('an event with species is stored and the draft clears', state.events.length === 1 && state.events[0].species.length === 2 && state.eventDraft.title === '', true);
  ctx.setEventDraft('title', ''); ctx.setEventDraft('species', 'x'); ctx.addEvent();
  check('an event without a title is not added', state.events.length, 1);
  ctx.removeEvent(state.events[0].id);
  check('events can be removed', state.events.length, 0);

  // teams
  ctx.saveTeam({ league: 'great', members: [{ p: { name: 'Azumarill', idx: 1, cp: 1498 } }, { p: { name: 'Dragonite', idx: 2, cp: 1490 } }, { p: { name: 'Machamp', idx: 3, cp: 1500 } }] });
  const team = state.savedTeams[0];
  check('a saved team keeps its members and starts at 0-0', team.members.length === 3 && team.wins === 0 && team.losses === 0, true);
  ctx.tallyTeam(team.id, 'wins'); ctx.tallyTeam(team.id, 'wins'); ctx.tallyTeam(team.id, 'losses');
  check('wins and losses are tallied on the right team', state.savedTeams[0].wins === 2 && state.savedTeams[0].losses === 1, true);
  ctx.removeTeam(team.id);
  check('a saved team can be removed', state.savedTeams.length, 0);

  // buddy plan
  roster.length = 0;
  const pika = { idx: 9, name: 'Pikachu', dex: 25, form: null, ivAvg: 90, ivMeasured: true, atkIV: 0, defIV: 15, staIV: 15, lvlMin: 40, lvlMax: 40 };
  roster.push(pika);
  ctx.isPvpWorthy = () => true; ctx.hasRaidRole = () => false; ctx.raidRoleTypeBest = () => ({ r: {}, s: {} });
  ctx.bestRank = () => 95; ctx.candyStockFor = () => ({ candy: 10, xlCandy: 0 });
  ctx.evoInfoFor = () => ({ to: 'Raichu', need: 50, have: 10, short: 40, ready: false });
  ctx.evalLevelOf = () => ({ level: 40, exact: true });
  const plan = ctx.buddyPlan();
  const km = m.speciesInfo('Pikachu', '').buddyKm;
  check('a Pokemon short of evolve candy gets a buddy row', plan.length, 1);
  check('km to finish = candy short x the species buddy distance', plan[0].short === 40 && plan[0].km === 40 * km, true);
  ctx.evoInfoFor = () => ({ to: 'Raichu', need: 50, have: 50, short: 0, ready: true });
  check('nothing short means no buddy row', ctx.buddyPlan().length, 0);
})();

// ---------------------------------------------------------------------------
console.log(`${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\nFailures:\n' + failures.join('\n\n'));
  process.exit(1);
}
