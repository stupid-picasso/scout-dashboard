#!/usr/bin/env node
/**
 * test_flags_from_game.js - "Flags from the game, part 1" in Scout Dashboard.dc.html: the match of a game search (costume, background,
 * shiny) against the roster (flagMatch / costumeMatch), what marking and clearing set (flagPatch), when clearing may be offered
 * (flagOffer), the builder term and the power-up merge carrying the background flag.
 * Real method source is extracted from the shipped file; FLAGS_SRC=<path> points it at a broken copy (to prove the tests fail on one).
 * The old costumeMatch (frozen copy of its body) is compared on random input.
 *
 * USAGE: node scripts/test_flags_from_game.js
 */
const fs = require('fs');
const path = require('path');
const { checker } = require('./lib/testkit');

const ROOT = path.dirname(__dirname);
const SRC = fs.readFileSync(process.env.FLAGS_SRC || path.join(ROOT, 'Scout Dashboard.dc.html'), 'utf8');
function methodOf(src, name) {
  const m = new RegExp('\\n  (?:async )?' + name + '\\(([^)]*)\\) \\{').exec(src);
  if (!m) throw new Error('Could not find the method "' + name + '" in the source');
  const open = m.index + m[0].length - 1;
  let depth = 0, j = open;
  for (; j < src.length; j++) { if (src[j] === '{') depth++; else if (src[j] === '}' && --depth === 0) break; }
  return new Function(...m[1].split(',').map(s => s.trim()).filter(Boolean), src.slice(open + 1, j));
}
const t = checker(), eq = t.eq, ok = t.ok;
const mon = (idx, name, cpv, extra) => ({ idx, name, cp: cpv, ...(extra || {}) });
function makeCtx(roster, state) {
  const ctx = { roster, state: { roster: [], addedPokemon: [], ivOverrides: {}, removedIds: [], lastImport: null, ...(state || {}) }, pushes: 0,
    effectiveRosterForMatch() { return this.roster; }, setState(u, cb) { Object.assign(this.state, u); if (cb) cb(); }, pushNow() { this.pushes++; } };
  ['costumeNorm', 'flagMatch', 'costumeMatch', 'flagPatch', 'flagOffer', 'searchStringFromBuilder', 'mergePowerUp', 'monWithOverrides'].forEach(n => { ctx[n] = methodOf(SRC, n).bind(ctx); });
  return ctx;
}
const R = (name, cpv, n) => ({ name, cp: cpv, n: n || 1 });
const names = a => a.slice().sort();

// ---- costume stays as it was ----
(function costume() {
  const c = makeCtx([mon('a', 'Piplup', 844), mon('b', 'Piplup', 844), mon('c', 'Gengar', 789, { costume: true }), mon('d', 'Piplup', 999)]);
  const r = c.costumeMatch([R('Piplup', 844, 2), R('Gengar', 789), R('Zubat', 445)]);
  eq('costume: the two twins are matched, the marked one is already marked, Zubat is not found', [r.idxs, r.already, r.unmatched, r.tiles], [['a', 'b'], 1, ['Zubat 445'], 4]);
  eq('costume: a wrong CP is not matched', c.costumeMatch([R('Piplup', 843)]).idxs, []);
  const one = c.costumeMatch([R('Piplup', 844)]);
  eq('costume: twins and one tile: the first is taken, the surplus is said to be ambiguous', [one.idxs, one.ambiguous.length], [['a'], 1]);
  ok('costume: the ambiguity note keeps its words', /you own 2 with that CP and 1 showed as costume, so the first 1 were taken/.test(one.ambiguous[0]));
  eq('costume: the patch', c.flagPatch('costume'), { costume: true });
  // The matcher before this feature (its body, frozen here), on random reads and rosters: same idxs, names, unmatched, ambiguous, already, tiles.
  const OLD = "\n    const roster = this.effectiveRosterForMatch();\n    const byKey = new Map();\n    roster.forEach(p => { if (!Number.isFinite(p.cp)) return; const k = this.costumeNorm(p.name) + '|' + p.cp; (byKey.get(k) || byKey.set(k, []).get(k)).push(p); });\n    const matched = [], unmatched = [], ambiguous = [];\n    let already = 0;\n    reads.forEach(r => {\n      const all = byKey.get(this.costumeNorm(r.name) + '|' + r.cp) || [];\n      const fresh = all.filter(p => !p.costume);\n      already += Math.min(r.n, all.length - fresh.length);\n      const need = Math.max(0, r.n - (all.length - fresh.length));\n      if (!need) return;\n      if (!fresh.length) { unmatched.push(r.name + ' ' + r.cp); return; }\n      matched.push(...fresh.slice(0, need));\n      if (fresh.length > need) ambiguous.push(r.name + ' ' + r.cp + ': you own ' + fresh.length + ' with that CP and ' + need + ' showed as costume, so the first ' + need + ' were taken (they cannot be told apart by name and CP)');\n      if (need > fresh.length) unmatched.push((need - fresh.length) + ' \u00d7 ' + r.name + ' ' + r.cp);\n    });\n    return { idxs: matched.map(p => p.idx), names: matched.map(p => p.name + ' ' + p.cp), unmatched, ambiguous, already, tiles: reads.reduce((a, r) => a + r.n, 0) };\n  ";
  {
    const oc = { roster: [], effectiveRosterForMatch() { return this.roster; } };
    oc.costumeNorm = methodOf(SRC, 'costumeNorm').bind(oc); oc.costumeMatch = new Function('reads', OLD).bind(oc);
    let seed = 7; const rnd = n => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n;
    let same = 0;
    for (let i = 0; i < 300; i++) {
      const nm = ['Piplup', 'Gengar', 'Flabébé', 'Zubat'], roster = [];
      for (let k = 0; k < rnd(9); k++) roster.push(mon('p' + k, nm[rnd(4)], 100 + rnd(3), rnd(3) === 0 ? { costume: true } : {}));
      const reads = []; for (let k = 0; k < rnd(6); k++) reads.push(R(['piplup', 'GENGAR', 'Flabebe', 'Zubat', 'Rattata'][rnd(5)], 100 + rnd(3), 1 + rnd(3)));
      oc.roster = roster; const a = oc.costumeMatch(reads); const nc = makeCtx(roster), b = nc.costumeMatch(reads);
      if (JSON.stringify([a.idxs, a.names, a.unmatched, a.ambiguous, a.already, a.tiles]) === JSON.stringify([b.idxs, b.names, b.unmatched, b.ambiguous, b.already, b.tiles])) same++;
    }
    eq('costume: 300 random matches equal the old matcher', same, 300);
  }
})();

// ---- normalisation, duplicates, not found, already marked: all three flags ----
['costume', 'background', 'shiny'].forEach(flag => {
  const on = flag === 'shiny' ? { shiny: true, shinyState: null } : { [flag]: true };
  const c = makeCtx([mon('f1', 'Flabébé', 300), mon('f2', 'Mr. Mime', 400), mon('t1', 'Zubat', 50), mon('t2', 'Zubat', 50), mon('t3', 'Zubat', 50, on), mon('m1', 'Rattata', 10, on)]);
  const r = c.flagMatch([R('Flabebe', 300), R('mr mime', 400), R('Zubat', 50, 2), R('Rattata', 10), R('Bobby', 99), R('Zubat', 77, 2)], flag);
  eq(flag + ': diacritics and punctuation are normalised, twins take as many as showed, the marked one is skipped', r.idxs, ['f1', 'f2', 't1']);
  eq(flag + ': the marked twin and the marked Rattata count as already marked', r.already, 2);
  eq(flag + ': not found lists the unknown name and the unknown CP', r.unmatched, ['Bobby 99', 'Zubat 77']);
  const twins = makeCtx([mon('x1', 'Pidgey', 5), mon('x2', 'Pidgey', 5)]).flagMatch([R('Pidgey', 5, 2)], flag);
  eq(flag + ': two tiles, two twins: both marked, no ambiguity', [twins.idxs, twins.ambiguous.length], [['x1', 'x2'], 0]);
  const dup = makeCtx([mon('x1', 'Pidgey', 5)]).flagMatch([R('Pidgey', 5, 3)], flag);
  eq(flag + ': three tiles, one Pokemon: one matched, two not found', [dup.idxs, dup.unmatched], [['x1'], ['2 × Pidgey 5']]);
  eq(flag + ': tiles are counted', r.tiles, 1 + 1 + 2 + 1 + 1 + 2);
});

// ---- shiny: suspected is confirmed, confirmed is never touched ----
(function shiny() {
  const c = makeCtx([mon('s1', 'Eevee', 500, { shiny: true, shinyState: 'suspected' }), mon('s2', 'Eevee', 500), mon('s3', 'Pikachu', 600, { shiny: true, shinyState: null }), mon('s4', 'Pikachu', 600)]);
  const r = c.flagMatch([R('Eevee', 500), R('Pikachu', 600)], 'shiny');
  eq('shiny: the suspected one is taken first and confirmed', r.idxs[0], 's1');
  eq('shiny: a confirmed shiny is already marked and is not in the list to mark', [r.idxs.includes('s3'), r.already], [false, 1]);
  eq('shiny: the Pikachu tile finds its confirmed one, so the plain twin is left alone', r.idxs.includes('s4'), false);
  eq('shiny: marking sets confirmed, never suspected', c.flagPatch('shiny'), { shiny: true, shinyState: null });
  eq('shiny: clearing sets not shiny', c.flagPatch('shiny', '', true), { shiny: false, shinyState: null });
  const gone = makeCtx([mon('u1', 'Eevee', 500, { shiny: true, shinyState: 'suspected' }), mon('u2', 'Pikachu', 600, { shiny: true, shinyState: null })]).flagMatch([R('Zubat', 40)], 'shiny');
  eq('shiny: absent records: the suspected one is a plain clear, the confirmed one is in its own list (a second tap)', [gone.clear, gone.strong], [['u1'], ['u2']]);
})();

// ---- background and its kind ----
(function background() {
  const c = makeCtx([mon('b1', 'Pidgey', 5), mon('b2', 'Rattata', 6, { background: true }), mon('b3', 'Zubat', 7, { background: true, backgroundKind: 'location' }), mon('b4', 'Eevee', 8, { background: true, backgroundKind: 'special' })]);
  eq('background: marking with no kind stores no kind', c.flagPatch('background', ''), { background: true });
  eq('background: marking from specialbackground stores the kind', c.flagPatch('background', 'special'), { background: true, backgroundKind: 'special' });
  eq('background: marking from locationbackground stores the kind', c.flagPatch('background', 'location'), { background: true, backgroundKind: 'location' });
  eq('background: clearing drops the kind too', c.flagPatch('background', '', true), { background: false, backgroundKind: null });
  const any = c.flagMatch([R('Pidgey', 5), R('Rattata', 6)], 'background', '');
  eq('background, either kind: a flagged one is already marked, kind or not', [any.idxs, any.already], [['b1'], 1]);
  const sp = c.flagMatch([R('Rattata', 6), R('Zubat', 7), R('Eevee', 8)], 'background', 'special');
  eq('background, special: a flagged one with no kind or another kind gets this kind; the same kind is already marked', [names(sp.idxs), sp.already], [['b2', 'b3'], 1]);
  const tw = makeCtx([mon('t1', 'Pidgey', 5), mon('t2', 'Pidgey', 5, { background: true })]).flagMatch([R('Pidgey', 5)], 'background', 'special');
  eq('background: of twins, the one already flagged (no kind yet) is taken first and gains the kind', tw.idxs, ['t2']);
  const gone = c.flagMatch([R('Pidgey', 5)], 'background', 'special');
  eq('background, special list: only records of that kind are candidates to clear', gone.clear, ['b4']);
  eq('background, either kind list: every flagged record is a candidate', c.flagMatch([R('Pidgey', 5)], 'background', '').clear.sort(), ['b2', 'b3', 'b4']);
})();

// ---- the clear list ----
(function clearList() {
  const c = makeCtx([mon('k1', 'Pidgey', 5, { costume: true }), mon('k2', 'Rattata', 6, { costume: true }), mon('k3', 'Zubat', 7, { costume: true }), mon('k4', 'Zubat', 7, { costume: true }), mon('k5', 'NoCp', null, { costume: true }), mon('k6', 'Eevee', 8)]);
  const r = c.flagMatch([R('Pidgey', 5), R('Zubat', 7)], 'costume');
  eq('clear: flagged records the tiles did not show', r.clear, ['k2', 'k4']);
  ok('clear: a record with no CP is never listed', !r.clear.includes('k5'));
  const lost = c.flagMatch([R('Pidgey', 5), R('Bobby', 6)], 'costume');
  ok('clear: a flagged record at the CP of a tile that was not found is left out (the tile may be it, renamed)', !lost.clear.includes('k2') && lost.clear.includes('k3'));
  eq('clear: nothing flagged is absent when every tile is seen', makeCtx([mon('z', 'Pidgey', 5, { costume: true })]).flagMatch([R('Pidgey', 5)], 'costume').clear, []);
  eq('clear: no tiles at all lists every flagged record with a CP', makeCtx([mon('z', 'Pidgey', 5, { costume: true })]).flagMatch([], 'costume').clear, ['z']);
})();

// ---- when clearing may be offered ----
(function offer() {
  const c = makeCtx([]), v = { input: 'video', tiles: 40, gaps: 0, failed: 0, dropped: 0 }, s = { input: 'shots', tiles: 40, dropped: 0, blank: 0 };
  ok('offer: a clean recording', c.flagOffer(v, false));
  ok('offer: a failed frame blocks it', !c.flagOffer({ ...v, failed: 1 }, false));
  ok('offer: a scroll jump blocks it', !c.flagOffer({ ...v, gaps: 1 }, false));
  ok('offer: a tile dropped for a missing name or CP blocks it', !c.flagOffer({ ...v, dropped: 1 }, false));
  ok('offer: a read with no tile blocks it', !c.flagOffer({ ...v, tiles: 0 }, false));
  ok('offer: no read blocks it', !c.flagOffer(null, true));
  ok('offer: screenshots are never offered without the tick', !c.flagOffer(s, false));
  ok('offer: screenshots with the tick', c.flagOffer(s, true));
  ok('offer: screenshots with the tick but an unreadable reply', !c.flagOffer({ ...s, blank: 1 }, true));
  ok('offer: a recording does not need the tick', c.flagOffer(v, undefined));
})();

// ---- builder term and the roster filter ----
(function builder() {
  const c = makeCtx([]); c.state.srchFlags = { background: 1 };
  eq('builder: the Background filter emits the game term', c.searchStringFromBuilder(), 'background');
  c.state.srchFlags = { costume: 1, background: -1 };
  eq('builder: not-background is negated like the others', c.searchStringFromBuilder(), 'costume&!background');
  ok('builder: the chip is in the list', /\['costume', 'Costume'\], \['background', 'Background'\]/.test(SRC));
  ok('roster filter: Background filters on the flag', /rosterFilter === 'background'\) return !!p\.background/.test(SRC));
  ok('roster filter: the chip shows once one exists, like Costume', /roster\.some\(p => p\.background\) \? \[\{ key: 'background', label: 'BACKGROUND' \}\]/.test(SRC));
})();

// ---- flags ride on the override, and the power-up merge carries them ----
(function persist() {
  const newRec = mon('video-1', 'Machamp', 1600, { hp: 125 }), old = mon('r1', 'Machamp', 1500, { hp: 120 });
  const c = makeCtx([], { roster: [old], addedPokemon: [newRec], ivOverrides: { r1: { background: true, backgroundKind: 'special', costume: true, shiny: true, shinyState: null } },
    lastImport: { at: 1, rows: [], revert: {}, pairs: [{ n: 'video-1', o: 'r1', name: 'Machamp', ocp: 1500, ncp: 1600 }] } });
  c.mergePowerUp('video-1');
  eq('power-up merge: background, its kind, costume and a confirmed shiny are carried', c.state.ivOverrides['video-1'], { costume: true, background: true, backgroundKind: 'special', shiny: true, shinyState: null });
  const sus = makeCtx([], { roster: [old], addedPokemon: [newRec], ivOverrides: { r1: { shiny: true, shinyState: 'suspected' } }, lastImport: { at: 1, rows: [], revert: {}, pairs: [{ n: 'video-1', o: 'r1' }] } });
  sus.mergePowerUp('video-1');
  eq('power-up merge: a suspected shiny is still not carried', sus.state.ivOverrides['video-1'], {});
  const plain = makeCtx([], { roster: [old], addedPokemon: [newRec], ivOverrides: { r1: { background: true } }, lastImport: { at: 1, rows: [], revert: {}, pairs: [{ n: 'video-1', o: 'r1' }] } });
  plain.mergePowerUp('video-1');
  eq('power-up merge: a background with no kind carries no kind', plain.state.ivOverrides['video-1'], { background: true });
  // The override is plain data: it survives the JSON the cloud document holds.
  const ov = { 'video-1': { background: true, backgroundKind: 'location', costume: true } };
  eq('the override survives the cloud JSON round trip', JSON.parse(JSON.stringify(ov)), ov);
  const eff = c.monWithOverrides('video-1');
  eq('the effective record shows the carried flags', [eff.background, eff.backgroundKind], [true, 'special']);
})();

t.exit();
