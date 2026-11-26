// QA suite F: Home > Import > Check against the game > Check from Google Drive. The workflow dispatch and the result file are route stubs
// (nothing reaches GitHub or Gemini); the sheet it gives is compared with the one the on-device read gives for the same frames.
const path = require('path');
const { T, G, expect, session } = require('./qa_lib');

const GEM_MODELS = ['gemini-3.9-flash', 'gemini-3.9-flash-lite', 'gemini-3.8-flash'];
const KEY = 'AIzaSyQAGSk' + 'k'.repeat(30);
async function appSession(fn, opts) { const sx = await session({ feed: false, ...(opts || {}) }); try { return await fn(sx); } finally { await sx.close(); } }
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const mk = (idx, name, cp) => ({ idx, name, cp, hp: 60, atkIV: 10, defIV: 10, staIV: 10, ivAvg: 66.7, scanDate: '2026-10-01' });
const t = (name, cp) => ({ name, cp });
// Four frames of a scrolled list: the model's replies, and the file the server writes for the same four.
const REPLY = [
  { image: 1, count: 7, max: 1225, tiles: [t('Feebas', 115), t('Whismur', 81), t('Feebas', 109)] },
  { image: 2, count: 7, max: 1225, tiles: [t('Feebas', 109), t('Bobby', 800), t('Zubat', 55)] },
  { image: 3, count: null, max: null, tiles: [t('Zubat', 55)] }];
const FILE = fresh => ({
  frames: REPLY.map((o, i) => ({ i, n: o.tiles, head: o.count == null ? null : { count: o.count, max: o.max } })),
  source: 'clip.mp4', extractedAt: fresh ? new Date(Date.now() + 60000).toISOString() : '2020-01-01T00:00:00Z'
});
const mons = [mk('g1', 'Feebas', 115), mk('g2', 'Pidgey', 300), mk('g3', 'Dragonite', 800), mk('g4', 'Zubat', 40)];

module.exports = async function suiteF() {
  await T('GRID-02', 'Import', 'Check from Google Drive: the button starts extract-grid.yml with the link, LOAD RESULT reads data/grid_import.json into the same sheet the on-device read gives for the same frames, with no Gemini request', async () => {
    await appSession(async sx => {
      const g = await sx.stubGemini({ models: GEM_MODELS, generate: G.ok('```json\n' + JSON.stringify(REPLY) + '\n```') });
      await sx.set({ geminiKey: KEY, geminiKeys: [KEY], addedPokemon: mons, roster: [], ivOverrides: {} });
      await sx.go('HOME');
      const sheet = sx.page.locator('[data-grid-sheet]');
      const txt = async () => (await sheet.innerText()).replace(/[ \t]+/g, ' ').replace(/\n+/g, '\n').trim();
      const done = () => sx.page.waitForFunction(() => { const l = window.__qaFindLogic(); return !!l && !l.state.gridBusy && (l.state.gridRes || l.state.gridError); }, null, { timeout: 30000 });
      // (a) the reference: the same three frames read on this device
      await sx.logic((l, f) => { l.gridRun(f); return true; }, ['A'.repeat(8), 'B'.repeat(8), 'C'.repeat(8)]);
      await done();
      const device = { text: await txt(), strings: await sx.page.locator('[data-grid-string]').allInnerTexts(), res: (await sx.state()).gridRes };
      expect(/Read 5 of 7\. 2 tiles may be missed/.test(device.text), 'the reference sheet: ' + device.text.slice(0, 120));
      await sx.set({ gridRes: null, gridError: '', gridMsg: '' });
      const asked = g.generated().length;
      // (b) the server path
      const dispatches = [];
      let served = { status: 200, body: FILE(true) }, rawHits = 0;
      await sx.page.route(/api\.github\.com/, r => {
        const q = r.request();
        if (q.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS });
        dispatches.push({ method: q.method(), url: q.url(), auth: q.headers().authorization, body: q.postDataJSON() });
        return r.fulfill({ status: 204, headers: CORS, body: '' });
      });
      await sx.page.route(/raw\.githubusercontent\.com\/.*\/data\/grid_import\.json/, r => { rawHits++; r.fulfill({ status: served.status, contentType: 'application/json', headers: CORS, body: JSON.stringify(served.body) }); });
      await sx.page.locator('summary', { hasText: 'Check from Google Drive' }).click();
      const start = sx.page.getByRole('button', { name: 'START ON GITHUB' }), load = sx.page.getByRole('button', { name: 'LOAD RESULT' });
      const linkBox = sx.page.locator('input[aria-label="Google Drive link to the Pokemon list recording"]');
      await start.click();
      expect(/Paste a Google Drive share link first\./.test(await sx.text()), 'no link: asked for one');
      await linkBox.fill('https://drive.google.com/file/d/ABC123/view?usp=sharing'); await linkBox.blur();
      await start.click();
      expect(/Add a GitHub token under GITHUB ACCESS first\./.test(await sx.text()) && dispatches.length === 0, 'no token: asked for one, nothing sent');
      await sx.set({ githubToken: 'ghp_FAKE_NOT_A_TOKEN' });
      await start.click();
      await sx.page.waitForFunction(() => /Grid check queued on GitHub/.test(document.body.innerText), null, { timeout: 10000 });
      expect(dispatches.length === 1 && dispatches[0].method === 'POST' && /\/actions\/workflows\/extract-grid\.yml\/dispatches$/.test(dispatches[0].url), 'one dispatch of extract-grid.yml: ' + JSON.stringify(dispatches.map(d => d.url)));
      expect(dispatches[0].auth === 'Bearer ghp_FAKE_NOT_A_TOKEN', 'the token is sent as a bearer token');
      expect(JSON.stringify(dispatches[0].body) === JSON.stringify({ ref: 'main', inputs: { drive_link: 'https://drive.google.com/file/d/ABC123/view?usp=sharing', fresh_import: 'true' } }), 'the body: ' + JSON.stringify(dispatches[0].body));
      expect((await sx.state()).gridQueuedAt > 0, 'the start time is kept');
      expect(await linkBox.inputValue() === '', 'the link is cleared after queuing, like the other imports');
      // an earlier run's file is not the answer
      served = { status: 200, body: FILE(false) };
      await load.click(); await done();
      expect(/earlier run/.test((await txt()) + ((await sx.state()).gridError || '')) && !(await sx.state()).gridRes, 'a file older than the start is refused: ' + (await sx.state()).gridError);
      await sx.set({ gridRes: null, gridError: '', gridMsg: '' });
      served = { status: 404, body: { message: 'Not Found' } };
      await load.click(); await done();
      expect(/No result file found yet \(HTTP 404\)/.test((await sx.state()).gridError), 'no file yet: ' + (await sx.state()).gridError);
      await sx.set({ gridRes: null, gridError: '', gridMsg: '' });
      served = { status: 200, body: FILE(true) };
      await load.click(); await done();
      const st = await sx.state();
      expect(!st.gridError, 'no error: ' + st.gridError);
      const text = await txt(), strings = await sx.page.locator('[data-grid-string]').allInnerTexts();
      expect(text === device.text, 'the sheet equals the on-device sheet:\n' + text + '\n---\n' + device.text);
      expect(strings.join() === device.strings.join() && strings.join() === 'feebas,whismur,zubat & cp55,cp81,cp109', 'the search strings: ' + strings.join());
      expect(JSON.stringify(st.gridRes) === JSON.stringify(device.res), 'the result data is the same');
      expect(JSON.stringify(st.addedPokemon) === JSON.stringify(mons), 'the roster is untouched');
      expect(g.generated().length === asked, 'no Gemini request on the server path: ' + (g.generated().length - asked));
      expect(rawHits === 3, 'the file was fetched once per tap: ' + rawHits);
      // an unread frame is counted
      served = { status: 200, body: { ...FILE(true), frames: [FILE(true).frames[0], { i: 1, n: null, head: null }, FILE(true).frames[2]] } };
      await sx.set({ gridRes: null });
      await load.click(); await done();
      expect(/1 frame could not be read\./.test(await txt()), 'an unread frame is reported: ' + (await txt()).slice(0, 200));
    });
  }, 'high');
};
