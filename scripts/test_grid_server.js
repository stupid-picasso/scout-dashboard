#!/usr/bin/env node
/**
 * test_grid_server.js - the pure parts of "Check from Google Drive" in Scout Dashboard.dc.html: the grid file the server writes
 * (data/grid_import.json) turned into the input of gridMerge, the sheet it gives against the sheet the on-device read gives for the
 * same frames, the texts of the problems a loaded file can have, and how long a recording gets to open (extractFrames).
 *
 * Like test_grid_reconcile.js it extracts the real method source from the shipped file. GRID_SRC=<path> points it at another copy of
 * the source (used to prove the tests fail on a broken one).
 *
 * USAGE: node scripts/test_grid_server.js
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
const method = (sig, ...args) => { ctx[sig.slice(0, sig.indexOf('('))] = new Function(...args, body(sig)).bind(ctx); };
method('costumeNorm(s) {', 's');
method('gridReconcile(reads, roster, header) {', 'reads', 'roster', 'header');
method('gridMerge(frames) {', 'frames');
method('gridRead(o, heads) {', 'o', 'heads');
method('gridFromFile(data) {', 'data');
method('gridFileProblem(data, queuedAt) {', 'data', 'queuedAt');
method('videoOpenWait(bytes) {', 'bytes');

let pass = 0;
const failures = [];
const ok = (name, cond) => check(name, !!cond, true);
function check(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) pass++; else failures.push('  ' + name + '\n    expected: ' + e + '\n    actual:   ' + a);
}
const t = (name, cp) => ({ name, cp });
const mon = (name, cp) => ({ idx: name + cp, name, cp });

// The same recording two ways: a model reply per frame (what gridRun reads) and the file the server writes for it.
const replies = [
  { image: 1, count: 6, max: 1225, tiles: [t('Feebas', 115), t('Whismur', 81), t('Feebas', 109)] },
  { image: 2, count: 6, max: 1225, tiles: [t('Feebas', 109), t('Bobby', 800), t('Zubat', 55)] },
  { image: 3, count: null, max: null, tiles: [t('Zubat', 55)] },
  { image: 4, count: 6, max: 1225, tiles: [t('Pidgey', 300), t('Zubat', 60)] }
];
const file = {
  frames: [
    { i: 0, n: [t('Feebas', 115), t('Whismur', 81), t('Feebas', 109)], head: { count: 6, max: 1225 } },
    { i: 1, n: [t('Feebas', 109), t('Bobby', 800), t('Zubat', 55)], head: { count: 6, max: 1225 } },
    { i: 2, n: [t('Zubat', 55)], head: null },
    { i: 3, n: [t('Pidgey', 300), t('Zubat', 60)], head: { count: 6, max: 1225 } }
  ], source: 'clip.mp4', extractedAt: '2026-11-22T10:00:00Z'
};
const roster = [mon('Feebas', 115), mon('Pidgey', 300), mon('Zubat', 40), mon('Dragonite', 800)];
const sheetOf = (lists, heads) => {
  const merged = ctx.gridMerge(lists), tally = {};
  heads.forEach(h => { tally[h] = (tally[h] || 0) + 1; });
  const top = Object.keys(tally).sort((a, b) => tally[b] - tally[a])[0], hp = top ? top.split('/').map(Number) : null;
  return { res: ctx.gridReconcile(merged.tiles, roster, hp ? { n: hp[0], max: hp[1] } : null), merged };
};
const device = (() => { const heads = []; const lists = replies.map(o => ctx.gridRead(o, heads)); return sheetOf(lists, heads); })();
const served = (() => { const f = ctx.gridFromFile(file); return { f, ...sheetOf(f.lists, f.heads) }; })();
check('the file gives the same lists as the model replies', served.f.lists, replies.map(o => o.tiles));
check('the file gives the same header readings', served.f.heads, ['6/1225', '6/1225', '6/1225']);
check('the file feeds gridMerge exactly like the on-device read: same tiles, gaps and failures', served.merged, device.merged);
check('and gridReconcile gives the same result', served.res, device.res);
check('the merge drops the overlap between frames (Zubat 55 once)', served.merged.tiles.map(x => x.name + x.cp), ['Feebas115', 'Whismur81', 'Feebas109', 'Bobby800', 'Zubat55', 'Pidgey300', 'Zubat60']);
check('header taken from the most common reading', served.res.count, { read: 7, header: 6, max: 1225, short: -1, app: 4, noCp: 0 });

// order: by i, whatever order the file lists them in
const shuffled = { ...file, frames: [file.frames[3], file.frames[1], file.frames[0], file.frames[2]] };
check('frames are taken in order of i', ctx.gridFromFile(shuffled).lists, ctx.gridFromFile(file).lists);
const reversed = { ...file, frames: file.frames.slice().reverse().map((f, k) => ({ ...f, i: 3 - k })) };
check('a file that lists them backwards (i still right) reads the same', ctx.gridFromFile(reversed).lists, ctx.gridFromFile(file).lists);

// unread frames: null for the merge (counted as failed, no overlap assumed), an empty frame stays empty
const withHoles = { frames: [{ i: 0, n: [t('A', 1), t('B', 2)], head: null }, { i: 1, n: null, head: null }, { i: 2, n: [], head: null }, { i: 3, n: [t('B', 2), t('C', 3)], head: null }] };
const h = ctx.gridFromFile(withHoles);
check('an unread frame (n null) is null, an empty one is []', h.lists, [[t('A', 1), t('B', 2)], null, [], [t('B', 2), t('C', 3)]]);
check('the merge counts the unread frame and does not join across it', ctx.gridMerge(h.lists), { tiles: [t('A', 1), t('B', 2), t('B', 2), t('C', 3)], gaps: 0, failed: 1 });

// tiles are read like the on-device read: names trimmed, a cp that is not a number null, tiles with neither dropped
const odd = ctx.gridFromFile({ frames: [{ i: 0, n: [{ name: ' Eevee ', cp: '450' }, { name: 'Nick', cp: null }, { name: '', cp: null }, null, { cp: 9 }], head: { count: 'x', max: 5 } }] });
check('tile cleaning is the on-device one', odd.lists, [[t('Eevee', 450), t('Nick', null), t('', 9)]]);
check('a header needs both numbers', odd.heads, []);
check('garbage in is empty, never a throw', [ctx.gridFromFile(null).lists, ctx.gridFromFile({}).lists, ctx.gridFromFile({ frames: 'no' }).lists, ctx.gridFromFile({ frames: [null, 5, 'x'] }).lists], [[], [], [], []]);

// what is wrong with a loaded file
const QUEUED = Date.parse('2026-11-22T10:30:00Z');
check('a good file has no problem', ctx.gridFileProblem(file, 0), '');
check('no frames', ctx.gridFileProblem({ frames: [] }, 0), 'The result file holds no frames. Start the check again.');
check('not an object / no frames field', [ctx.gridFileProblem(null, 0), ctx.gridFileProblem([], 0), ctx.gridFileProblem({ frames: 5 }, 0)], Array(3).fill('The result file holds no frames. Start the check again.'));
check('every frame unread', ctx.gridFileProblem({ frames: [{ i: 0, n: null, head: null }] }, 0), 'The result file has no readable frames. Start the check again.');
check('a file written before this device started the run is the earlier run\'s', ctx.gridFileProblem(file, QUEUED), 'That result is from an earlier run. The workflow is still running or has failed. Try again in a few minutes.');
check('a file written after the start is the answer', ctx.gridFileProblem({ ...file, extractedAt: '2026-11-22T10:42:00Z' }, QUEUED), '');
check('a little clock difference between the runner and the phone is tolerated', ctx.gridFileProblem({ ...file, extractedAt: '2026-11-22T10:29:30Z' }, QUEUED), '');
check('no time in the file after a start in this session: not trusted', ctx.gridFileProblem({ ...file, extractedAt: undefined }, QUEUED), 'That result is from an earlier run. The workflow is still running or has failed. Try again in a few minutes.');
check('without a start in this session the time is not checked', ctx.gridFileProblem({ ...file, extractedAt: 'junk' }, 0), '');

// how long a recording gets to open
const MB = 1048576;
check('a small file waits what it always did (10 s)', [0, undefined, 1, 1000, MB - 1].map(b => ctx.videoOpenWait(b)), Array(5).fill(10000));
check('10 s plus 400 ms for each whole MB', [MB, 25 * MB, 100 * MB, 250 * MB].map(b => ctx.videoOpenWait(b)), [10400, 20000, 50000, 110000]);
check('capped at 120 s', [275 * MB, 300 * MB, 5000 * MB].map(b => ctx.videoOpenWait(b)), [120000, 120000, 120000]);
const ef = body('async extractFrames(file, opts) {');
ok('extractFrames waits the scaled time, not a fixed 10000', /const waitMs = this\.videoOpenWait\(file\.size\)/.test(ef) && /\)\), waitMs\);/.test(ef) && !/, 10000\);/.test(ef));
ok('the timeout message says the file size and the wait', /'Video never loaded in ' \+ Math\.round\(waitMs \/ 1000\) \+ ' s \(' \+ Math\.round\(\(file\.size \|\| 0\) \/ 1048576\) \+ ' MB\) \\u2014 this browser likely/.test(ef));
ok('the rest of the open step is as before (decode wait of 15 x 100 ms, the two errors)', /i < 15 && !video\.videoWidth/.test(ef) && /Could not read that video file\./.test(ef));

// the start button dispatches the grid workflow by name, with the same inputs as the others
const rg = body('runGithubWorkflow(kind) {');
ok('the grid kind starts extract-grid.yml', /if \(isGrid\) workflowFile = 'extract-grid\.yml'/.test(rg) && /inputs: \{ drive_link: link, fresh_import: 'true' \}/.test(rg));
ok('the start time is kept for the stale-file check', /gridQueuedAt: Date\.now\(\)/.test(rg));

if (failures.length) { console.log('FAIL\n' + failures.join('\n')); console.log(pass + ' passed, ' + failures.length + ' failed'); process.exit(1); }
console.log(pass + ' passed, 0 failed');
