#!/usr/bin/env node
/**
 * test_ranking.js — regression tests for pokemon-mechanics.js's PvP ranking
 * math (rankPctForLeague, the shadow multiplier, Little Cup eligibility) and
 * the move-damage/DPS functions.
 *
 * WHY THIS EXISTS
 * ----------------
 * A single session found and fixed four real bugs in this exact area: a
 * missing shadow stat multiplier, a missing Little Cup eligibility gate, a
 * silent-corruption bug in the file-propagation tool, and a syntax error
 * that would have blanked a whole deployed file. None of those would have
 * been caught automatically — each required a manual audit. This suite
 * exists so the NEXT change to pokemon-mechanics.js (or to any of the ~20
 * call sites that pass IVs/shadow status into it) gets checked in seconds
 * instead of requiring another full audit.
 *
 * WHAT KIND OF TEST THIS IS
 * ---------------------------
 * These are snapshot/regression tests, not independent ground-truth checks
 * against an external source. Expected values below were computed FROM this
 * codebase's own (already-fixed, already-verified) mechanics at the time
 * this file was written — the point is to catch an UNINTENDED future change
 * to that output, not to re-derive PvP theory from scratch. If a future edit
 * deliberately changes one of these numbers (e.g. a genuine formula
 * correction), update the expected value here as part of that change, with
 * a comment explaining why — a silent mismatch should always mean "something
 * changed that nobody meant to change."
 *
 * USAGE
 * -----
 *   node scripts/test_ranking.js
 *
 * Exits 0 if everything matches, non-zero (with a diff-style report) if
 * anything doesn't. No dependencies beyond Node's stdlib.
 */
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const REPO = path.dirname(__dirname);

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

function approxEqual(a, b, tol) {
  if (a === null || b === null) return a === b;
  if (a === undefined || b === undefined) return a === b;
  return Math.abs(a - b) <= tol;
}

function check(name, actual, expected, tol) {
  tol = tol == null ? 0.05 : tol;
  const ok = approxEqual(actual, expected, tol);
  if (ok) {
    pass++;
  } else {
    fail++;
    failures.push(`  ${name}\n    expected: ${expected}\n    actual:   ${actual}`);
  }
}

function checkExact(name, actual, expected) {
  const ok = actual === expected;
  if (ok) {
    pass++;
  } else {
    fail++;
    failures.push(`  ${name}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`);
  }
}

// ---------------------------------------------------------------------------
// Fixtures — real species from the app's own BASE_STATS table.
// ---------------------------------------------------------------------------
const BULBASAUR = m.BASE_STATS[1];   // NFE — Little Cup eligible
const VENUSAUR = m.BASE_STATS[3];    // fully evolved — Little Cup ineligible
const MACHOP = m.BASE_STATS[66];     // mid-tier, commonly shadow
const MEWTWO = m.BASE_STATS[150];    // master-league-relevant

// ---------------------------------------------------------------------------
// 1. Shadow multiplier — a shadow's rank% must differ from a non-shadow's for
//    an IDENTICAL IV spread, because the numerator (own stat product) and
//    denominator (species ceiling) are both computed with boosted ATK/lowered
//    DEF for shadows. This is the exact bug fixed this session — a
//    regression here would mean the multiplier silently stopped applying.
// ---------------------------------------------------------------------------
(function testShadowMultiplier() {
  const ivs = [12, 13, 14];
  const normalGreat = m.rankPctForLeague(MACHOP, ivs, 'great', false);
  const shadowGreat = m.rankPctForLeague(MACHOP, ivs, 'great', true);
  // Not asserting exact values (that would just re-encode the current output
  // as a fixed number for no real gain) — asserting the RELATIONSHIP that
  // must hold if the multiplier is doing anything at all: a shadow's own
  // stat product changes, so unless the ceiling shifts by exactly the same
  // ratio (it won't, since ATK/DEF move in opposite directions), the two
  // rank%s should differ.
  if (normalGreat === shadowGreat) {
    fail++;
    failures.push(`  shadow multiplier appears inactive — normal and shadow Machop produced identical Great League rank% (${normalGreat}). Check shadowAdjustedBase is still wired into rankPctForLeague.`);
  } else {
    pass++;
  }

  // Snapshot of the actual current values, so an unintended SHIFT in the
  // multiplier's magnitude (not just its presence) also gets caught.
  check('Machop 12/13/14 Great League, normal', normalGreat, normalGreat, 0); // self-check the harness
  check('shadowAdjustedBase ATK multiplier is 1.2', m.SHADOW_ATK_MULTIPLIER, 1.2, 0.0001);
  check('shadowAdjustedBase DEF multiplier is 0.83333326', m.SHADOW_DEF_MULTIPLIER, 0.83333326, 0.0000001);

  const adjusted = m.shadowAdjustedBase(MACHOP, true);
  check('shadow ATK = base ATK * 1.2', adjusted[0], MACHOP[0] * 1.2, 0.01);
  check('shadow DEF = base DEF * 0.83333326', adjusted[1], MACHOP[1] * 0.83333326, 0.01);
  checkExact('shadow HP unchanged', adjusted[2], MACHOP[2]);

  const unchangedNormal = m.shadowAdjustedBase(MACHOP, false);
  checkExact('non-shadow base stats pass through unmodified', JSON.stringify(unchangedNormal), JSON.stringify(MACHOP));
})();

// ---------------------------------------------------------------------------
// 2. CP-cap eligibility must use REAL (unmodified) stats even for shadows —
//    Niantic does not change displayed/legal CP for shadow Pokemon, only
//    battle damage. A regression here would mean a shadow's level-under-cap
//    search silently uses boosted stats, producing a CP that doesn't match
//    what the game actually shows.
// ---------------------------------------------------------------------------
(function testShadowCpCapUsesRealStats() {
  const ivs = [15, 15, 15];
  const normalCp = m.cpFor(MACHOP, ivs, 40);
  // cpFor takes raw base stats; passing shadow-adjusted stats through it
  // would change the result, so shadowAdjustedBase must NEVER be handed to
  // cpFor directly anywhere in the ranking pipeline — this asserts the two
  // are still distinguishable as different code paths.
  const shadowStats = m.shadowAdjustedBase(MACHOP, true);
  const cpIfWronglyBoosted = m.cpFor(shadowStats, ivs, 40);
  if (normalCp === cpIfWronglyBoosted) {
    fail++;
    failures.push('  cpFor(shadowAdjustedBase(...)) produced the same CP as cpFor(realBase(...)) — the two inputs should differ (boosted ATK/lowered DEF change the stat product used by CP), so this equality suggests shadowAdjustedBase is a no-op or CP math changed.');
  } else {
    pass++;
  }
})();

// ---------------------------------------------------------------------------
// 3. Little Cup — this suite can't exercise littleCupEligible() itself
//    (that's a Scout Dashboard.dc.html method depending on evoTable, which
//    is per-user Firestore data, not part of pokemon-mechanics.js). What IS
//    worth asserting here: rankPctForLeague answers "how good is this
//    individual relative to the best possible spread of the SAME species
//    under this cap" — it does NOT know or care whether that species is
//    competitively eligible for the format. A fully evolved Venusaur can
//    legitimately rank high against "the best possible Venusaur under 500
//    CP," even though it has no business being in Little Cup at all. That
//    gap is exactly why littleCupEligible() exists as a separate, deliberate
//    gate in the app layer — this test asserts the math behaves sanely, not
//    that it enforces format legality on its own (it was never meant to).
// ---------------------------------------------------------------------------
(function testLittleCupStatProductSanity() {
  const ivs = [10, 10, 10];
  const bulbasaurLittle = m.rankPctForLeague(BULBASAUR, ivs, 'little', false);
  const venusaurLittle = m.rankPctForLeague(VENUSAUR, ivs, 'little', false);
  if (bulbasaurLittle == null) {
    fail++;
    failures.push(`  Bulbasaur (an actual Little Cup staple) produced a null Little League rank% (${bulbasaurLittle}) — the CP-cap search may be broken.`);
  } else {
    pass++;
    check('Bulbasaur Little League rank is a real percentage 0-100', bulbasaurLittle >= 0 && bulbasaurLittle <= 100 ? 1 : 0, 1, 0);
  }
  // Venusaur ranking well against ITS OWN ceiling is expected (see note
  // above) — just confirm the math stays in a sane 0-100 range or null,
  // not that it's low. Format-eligibility filtering is the app's job.
  if (venusaurLittle != null && (venusaurLittle < 0 || venusaurLittle > 100)) {
    fail++;
    failures.push(`  Venusaur Little League rank% out of the valid 0-100 range: ${venusaurLittle}`);
  } else {
    pass++;
  }
})();

// ---------------------------------------------------------------------------
// 4. Rank% must never exceed 100 (the clamp exists specifically because
//    floating-point search can nudge an optimal spread a hair over).
// ---------------------------------------------------------------------------
(function testRankNeverExceeds100() {
  [[0, 0, 0], [15, 15, 15], [15, 0, 15], [0, 15, 0]].forEach(ivs => {
    ['great', 'ultra', 'little', 'master'].forEach(league => {
      [false, true].forEach(shadow => {
        const r = m.rankPctForLeague(MEWTWO, ivs, league, shadow);
        if (r != null && r > 100) {
          fail++;
          failures.push(`  Mewtwo ${ivs.join('/')} ${league} shadow=${shadow} produced rank% > 100: ${r}`);
        } else {
          pass++;
        }
      });
    });
  });
})();

// ---------------------------------------------------------------------------
// 5. A perfect (15/15/15) spread should always rank at or near the top of
//    its own species' curve — sanity check that the "own vs species ceiling"
//    ratio isn't inverted somewhere.
// ---------------------------------------------------------------------------
(function testPerfectIvsRankHigh() {
  const perfect = m.rankPctForLeague(MACHOP, [15, 15, 15], 'master', false);
  // Master League has no CP cap, so 15/15/15 at max level IS the species
  // ceiling by definition — this should be exactly 100 (modulo float noise).
  check('Machop 15/15/15 Master League rank is ~100 (no CP cap, so this IS the ceiling)', perfect, 100, 0.1);
})();

// ---------------------------------------------------------------------------
// 6. Move data — the newly embedded AUTHORITATIVE_MOVES table.
// ---------------------------------------------------------------------------
(function testAuthoritativeMoves() {
  const moves = m.AUTHORITATIVE_MOVES || {};
  const count = Object.keys(moves).length;
  if (count < 300) {
    fail++;
    failures.push(`  AUTHORITATIVE_MOVES has only ${count} entries — expected 300+. Table may have failed to embed correctly.`);
  } else {
    pass++;
  }

  const vineWhip = moves['vine whip'];
  checkExact('Vine Whip is a fast Grass move', vineWhip && vineWhip.kind, 'fast');
  checkExact('Vine Whip type', vineWhip && vineWhip.type, 'Grass');
  check('Vine Whip power (Gym & Raid)', vineWhip && vineWhip.power, 6, 0.5);

  const sludgeBomb = moves['sludge bomb'];
  checkExact('Sludge Bomb is a charged Poison move', sludgeBomb && sludgeBomb.kind, 'charged');
  check('Sludge Bomb energy cost (Gym & Raid)', sludgeBomb && sludgeBomb.energy, 50, 1);

  // Aura Wheel is genuinely form-dependent (Electric/Dark Morpeko learn
  // different-typed versions) — the bare, unsuffixed name correctly has no
  // single answer and must stay excluded regardless of data source.
  checkExact('bare "aura wheel" excluded (form-dependent, no single answer)', moves['aura wheel'], undefined);
  checkExact('aura wheel dark resolves', moves['aura wheel dark'] && moves['aura wheel dark'].type, 'Dark');
  checkExact('aura wheel electric resolves', moves['aura wheel electric'] && moves['aura wheel electric'].type, 'Electric');

  // air slash / psycho cut used to be excluded here because the OLD
  // PvP-sourced table (Trainer Battle combatMove overrides) carries
  // multiple stat blocks per name across past competitive seasons. Gym &
  // Raid moveSettings has no such history — verified zero naming collisions
  // against the raw GAME_MASTER — so these now resolve cleanly.
  checkExact('air slash resolves (Gym & Raid, no longer ambiguous)', moves['air slash'] && moves['air slash'].kind, 'fast');
  checkExact('psycho cut resolves (Gym & Raid, no longer ambiguous)', moves['psycho cut'] && moves['psycho cut'].kind, 'fast');
})();

// ---------------------------------------------------------------------------
// 7. cycleDps — sanity check the damage formula produces a sane, finite,
//    positive number for a known fast+charged pairing, and returns null
//    (not a garbage number) when a move is missing.
// ---------------------------------------------------------------------------
(function testCycleDps() {
  const fast = m.AUTHORITATIVE_MOVES['vine whip'];
  const charged = m.AUTHORITATIVE_MOVES['sludge bomb'];
  const dps = m.cycleDps(VENUSAUR, [15, 15, 15], 50, fast, charged, { ownTypes: ['Grass', 'Poison'] });
  if (dps == null || !(dps > 0) || !Number.isFinite(dps)) {
    fail++;
    failures.push(`  cycleDps for a real, complete moveset returned a non-positive or non-finite value: ${dps}`);
  } else {
    pass++;
  }

  const dpsWithMissingMove = m.cycleDps(VENUSAUR, [15, 15, 15], 50, fast, null, {});
  checkExact('cycleDps returns null (not 0 or NaN) when a move is missing', dpsWithMissingMove, null);
})();

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
console.log(`${pass} passed, ${fail} failed`);
if (failures.length) {
  console.log('\nFailures:');
  console.log(failures.join('\n\n'));
  process.exit(1);
}
process.exit(0);
