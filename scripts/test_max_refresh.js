#!/usr/bin/env node
/**
 * test_max_refresh.js - the live Max Battle data: data/max_data.json against the baked blocks, the shape check and the in-place swap in
 * pokemon-mechanics.js, and the app's loader (reloadMaxDataNow / maxDataNote) and the "Reload Max Battle data" step of Refresh everything,
 * run on the real source of Scout Dashboard.dc.html with a stubbed fetch (no network).
 * MAXR_SRC=<path> and MAXR_MECH=<path> point it at broken copies (to prove the tests fail on one).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { checker } = require('./lib/testkit');

const ROOT = path.dirname(__dirname);
const SRC = fs.readFileSync(process.env.MAXR_SRC || path.join(ROOT, 'Scout Dashboard.dc.html'), 'utf8');
const MECH = fs.readFileSync(process.env.MAXR_MECH || path.join(ROOT, 'pokemon-mechanics.js'), 'utf8');
const t = checker(), eq = t.eq, ok = t.ok;
const load = () => { const c = { window: { dispatchEvent: () => {} }, Event: function () {}, console }; vm.createContext(c); vm.runInContext(MECH, c); return c.window.PokemonMechanics; };
const clone = o => JSON.parse(JSON.stringify(o));
const file = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'max_data.json'), 'utf8'));

// ---- the committed file is what the baked blocks hold --------------------------------------------------------------------------
{
  const M = load();
  eq('data/max_data.json matches the baked tables', [file.tierGroup, file.groupCosts, file.moveIds], [M.MAX_TIER_GROUP, M.MAX_GROUP_COSTS, M.MAX_MOVE_IDS]);
  ok('file carries a date and a source', /^\d{4}-\d{2}-\d{2}$/.test(file.generatedAt) && typeof file.source === 'string' && file.source.length > 0);
  ok('the file passes the shape check', M.validMaxData(file));
}

// ---- shape check and in-place swap ---------------------------------------------------------------------------------------------
{
  const M = load();
  const bad = {
    'null': null, 'empty object': {}, 'few species': { ...clone(file), tierGroup: { 1: '1' } },
    'group without costs': { ...clone(file), tierGroup: { ...file.tierGroup, 1: '9' } },
    'attack with 3 steps': (() => { const d = clone(file); d.groupCosts['1'].attack.push({ mp: 1 }); return d; })(),
    'unknown cost field': (() => { const d = clone(file); d.groupCosts['1'].guard[0].gold = 5; return d; })(),
    'zero cost': (() => { const d = clone(file); d.groupCosts['1'].guard[0].mp = 0; return d; })(),
    'string cost': (() => { const d = clone(file); d.groupCosts['1'].guard[0].mp = '400'; return d; })(),
    'missing move ids': { ...clone(file), moveIds: null },
    'a type missing': (() => { const d = clone(file); delete d.moveIds.types.Fire; return d; })(),
    'bad g-max row': (() => { const d = clone(file); d.moveIds.gmax.push(['x']); return d; })()
  };
  Object.keys(bad).forEach(k => {
    const before = JSON.stringify(M.maxDataSnapshot());
    ok('rejected: ' + k, M.validMaxData(bad[k]) === false && M.applyMaxData(bad[k]) === false && JSON.stringify(M.maxDataSnapshot()) === before);
  });
  const d = clone(file);
  d.tierGroup['483'] = '1'; d.tierGroup['9999'] = 'Z'; d.groupCosts['2'].attack[0].candy = 999;
  const ref = M.MAX_TIER_GROUP, costs = M.MAX_GROUP_COSTS;
  eq('diff counts species and groups', M.maxDataDiff(M.maxDataSnapshot(), d), { species: 2, groups: 1, moves: 0 });
  ok('applied', M.applyMaxData(d) === true);
  ok('swapped in place: the exported tables are the same objects', M.MAX_TIER_GROUP === ref && M.MAX_GROUP_COSTS === costs);
  eq('estimates use the new data', [M.maxGroupFor(483), M.maxStepCost('2', 'attack', 2).candy, M.maxGroupFor(9999)], ['1', 999, 'Z']);
  d.tierGroup['483'] = '4';
  eq('the swap copies (later edits of the source do not leak in)', M.maxGroupFor(483), '1');
  const less = clone(file); delete less.tierGroup['483']; delete less.groupCosts['8']; less.tierGroup['890'] = '4';
  ok('a species or group the new data drops is gone, not left over', M.applyMaxData(less) && M.maxGroupFor(483) === null && !('8' in M.MAX_GROUP_COSTS) && M.maxGroupFor(890) === '4');
  eq('diff of equal data is zero', M.maxDataDiff(M.maxDataSnapshot(), clone(M.maxDataSnapshot())), { species: 0, groups: 0, moves: 0 });
}

// ---- the app's loader, on the real source with a stubbed fetch -----------------------------------------------------------------
function method(name) {
  const m = new RegExp('\\n  (?:async )?' + name + '\\(([^)]*)\\) \\{').exec(SRC);
  if (!m) throw new Error('no method ' + name);
  const open = m.index + m[0].length - 1;
  let depth = 0, j = open;
  for (; j < SRC.length; j++) { if (SRC[j] === '{') depth++; else if (SRC[j] === '}' && --depth === 0) break; }
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  return new (/\n {2}async /.test(m[0]) ? AsyncFunction : Function)(...m[1].split(',').map(s => s.trim()).filter(Boolean), SRC.slice(open + 1, j));
}
function makeApp(responses) {
  const M = load(), calls = [], store = {}, state = {};
  const app = { mechanics: M, state, setState: p => Object.assign(state, p) };
  app.reloadMaxDataNow = method('reloadMaxDataNow').bind(app); app.maxDataNote = method('maxDataNote').bind(app); app.loadMaxData = method('loadMaxData').bind(app);
  global.fetch = async u => { calls.push(u); const r = responses.shift(); if (r instanceof Error) throw r; return r; };
  global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } };
  return { app, M, calls, store, state };
}
const resp = (body, okFlag = true) => ({ ok: okFlag, json: async () => body });

(async () => {
  {
    const d = clone(file); d.generatedAt = '2030-01-02'; d.tierGroup['483'] = '1';
    const x = makeApp([resp(d)]);
    const r = await x.app.reloadMaxDataNow();
    eq('good copy: result', [r.generatedAt, r.diff], ['2030-01-02', { species: 1, groups: 0, moves: 0 }]);
    eq('good copy: applied, state and saved copy', [x.M.maxGroupFor(483), x.state.maxData, JSON.parse(x.store['scout.maxdata.v1']).generatedAt], ['1', { generatedAt: '2030-01-02' }, '2030-01-02']);
    eq('note: counts', x.app.maxDataNote(r), '1 species changed');
    eq('first source is the app\'s own file', /^data\/max_data\.json\?t=/.test(x.calls[0]), true);
  }
  {
    const x = makeApp([resp(clone(file))]);
    eq('note: unchanged', x.app.maxDataNote(await x.app.reloadMaxDataNow()), 'Up to date (as of ' + file.generatedAt + ')');
  }
  eq('note: species and groups', makeApp([]).app.maxDataNote({ generatedAt: 'x', diff: { species: 3, groups: 2, moves: 0 } }), '3 species / 2 groups changed');
  eq('note: nothing fetched', makeApp([]).app.maxDataNote(null), 'Offline: using the saved copy');
  {
    const junk = { ...clone(file), tierGroup: {} };
    const x = makeApp([resp(junk), resp({ nope: 1 })]);
    const before = JSON.stringify(x.M.maxDataSnapshot());
    eq('bad shape from both sources: null, baked data kept, nothing saved', [await x.app.reloadMaxDataNow(), JSON.stringify(x.M.maxDataSnapshot()) === before, Object.keys(x.store).length, x.calls.length], [null, true, 0, 2]);
  }
  {
    const x = makeApp([new Error('offline'), resp({}, false)]);
    eq('network down: null, fell through to the second source', [await x.app.reloadMaxDataNow(), x.calls.length], [null, 2]);
  }
  {
    const x = makeApp([resp({ x: 1 }), resp(clone(file))]);
    eq('a bad first copy falls through to the next source', (await x.app.reloadMaxDataNow()).generatedAt, file.generatedAt);
  }
  {
    // start-up: the saved copy is applied before any fetch, and a bad saved copy is ignored
    const d = clone(file); d.tierGroup['483'] = '3'; d.generatedAt = '2029-05-05';
    const x = makeApp([new Error('offline')]); x.store['scout.maxdata.v1'] = JSON.stringify(d);
    x.app.loadMaxData(); await new Promise(r => setTimeout(r, 10));
    eq('saved copy applied at start-up', [x.M.maxGroupFor(483), x.state.maxData], ['3', { generatedAt: '2029-05-05' }]);
    const y = makeApp([new Error('offline')]); y.store['scout.maxdata.v1'] = '{"tierGroup":1}';
    y.app.loadMaxData(); await new Promise(r => setTimeout(r, 10));
    eq('bad saved copy ignored', [y.M.maxGroupFor(483), y.state.maxData], ['4', undefined]);
  }

  // ---- the Refresh everything step ----
  const re = /async refreshEverything\(\) \{[\s\S]*?\n  \}\n/.exec(SRC)[0];
  const defs = /const defs = \[([\s\S]*?)\];\n/.exec(re)[1];
  eq('step listed right after the feed', defs.indexOf("['feed', 'Reload events and GBL feed'],") >= 0 && defs.indexOf("['maxdata', 'Reload Max Battle data']") > defs.indexOf("['feed'") && defs.indexOf("['maxdata'") < defs.indexOf("['evo'"), true);
  ok('the step runs the loader and reports through maxDataNote', /step\('maxdata', 'run'\)[\s\S]*reloadMaxDataNow\(\)[\s\S]*maxDataNote\(r\)/.test(re));
  ok('offline: the step is skipped, not failed', /step\('maxdata', r \? 'done' : 'skip'/.test(re) && /catch \(e\) \{ step\('maxdata', 'skip'/.test(re));

  t.exit(t.pass + ' passed, ' + t.fail + ' failed');
})();
