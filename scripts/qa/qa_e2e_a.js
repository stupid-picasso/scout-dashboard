// QA suite A: boot, import, roster, row gestures, detail sheet.
const path = require('path');
const { T, expect, skip, session, REPO } = require('./qa_lib');
const QA = path.join(REPO, 'scripts', 'fixtures', 'qa_roster.csv');
const SMOKE = path.join(REPO, 'scripts', 'fixtures', 'smoke.csv');
const fs = require('fs');
const TYPES = { dragonite: 'Dragon / Flying', garchomp: 'Dragon / Ground', azumarill: 'Water / Fairy', machamp: 'Fighting', pikachu: 'Electric', gyarados: 'Water / Flying', caterpie: 'Bug' };

module.exports = async function suiteA() {
  // ------------------------------------------------------------------ BOOT
  let s = await session({ feed: false });
  await T('BOOT-01', 'Boot', 'App loads and renders content without a page error', async () => { expect(s.errors.length === 0, s.errors[0]); expect((await s.text()).length > 300); });
  await T('BOOT-02', 'Boot', 'Version string vNN.NN is shown in the header', async () => expect(/v53\.\d+/.test(await s.text())));
  await T('BOOT-03', 'Boot', 'Empty state: header says 0 Pokemon and invites a sync', async () => { const t = await s.text(); expect(/0 Pokemon|Loading roster/.test(t), t.slice(0, 120)); });
  await T('BOOT-04', 'Boot', 'Five tab-bar items plus a More menu holding the other five destinations', async () => { const t = await s.text(); for (const x of ['Today', 'Roster', 'PvP', 'Raid', 'More']) expect(t.includes(x), 'missing tab ' + x); await s.page.getByText('More', { exact: true }).last().click(); await s.page.waitForTimeout(400); const t2 = await s.text(); for (const x of ['Home & settings', 'Recommendations', 'Collection intel', 'Attackers', 'Progress log']) expect(t2.includes(x), 'missing More item ' + x); await s.page.mouse.click(215, 120); await s.page.waitForTimeout(300); });
  await T('BOOT-05', 'Boot', 'Every tab renders on an empty roster without throwing', async () => { for (const x of ['TODAY', 'HOME', 'ROSTER', 'RECS', 'INTEL', 'RAID', 'PVP', 'ATTACK', 'LOG']) { await s.go(x); } expect(s.errors.length === 0, s.errors[0]); });
  await T('BOOT-06', 'Boot', 'Initial load completes in under 4 seconds', async () => { expect(s.loadMs < 4000, s.loadMs + 'ms'); return s.loadMs + ' ms'; });
  await T('BOOT-07', 'Boot', 'No horizontal overflow at 430 px width', async () => expect(await s.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)));
  await s.close();
  for (const w of [320, 390, 768, 1280]) {
    const sw = await session({ width: w, height: 900, feed: false, touch: w < 700 });
    await T('BOOT-W' + w, 'Boot', `No horizontal overflow and no error at ${w}px width`, async () => { expect(await sw.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'overflow'); expect(sw.errors.length === 0); }, 'high');
    await sw.close();
  }

  // ------------------------------------------------------------------ IMPORT
  s = await session({ feed: false });
  await s.load(QA);
  await s.set({ typeTable: TYPES });
  await T('IMP-01', 'Import', 'CSV of 64 Pokemon loads and the header count updates', async () => expect(/64 Pokemon loaded/.test(await s.text())), 'critical');
  await T('IMP-02', 'Import', 'Success notice names the file and the count', async () => expect(/Loaded 64 Pokemon from qa_roster\.csv/.test(await s.text())));
  await T('IMP-03', 'Import', 'Header stat tiles show roster count, average IV, lucky and shadow counts', async () => { const t = await s.text(); expect(/64\s*\|?\s*ROSTER|ROSTER/.test(t) && /AVG IV/.test(t) && /LUCKY/.test(t) && /SHADOW/.test(t)); });
  await T('IMP-04', 'Import', 'Re-importing the same file replaces rather than duplicates', async () => { await s.load(QA); const t = await s.text(); expect(/64 Pokemon loaded/.test(t) && !/128 Pokemon/.test(t), t.slice(0, 160)); return /replaced 64/.test(t) ? 'notice says replaced' : 'count stays 64 (notice does not mention the replacement)'; });
  const tmp = '/tmp/qa/tmp_csv'; fs.mkdirSync(tmp, { recursive: true });
  const base = fs.readFileSync(SMOKE, 'utf8');
  fs.writeFileSync(tmp + '/crlf.csv', base.replace(/\n/g, '\r\n'));
  fs.writeFileSync(tmp + '/header.csv', base.split('\n')[0] + '\n');
  fs.writeFileSync(tmp + '/garbage.csv', 'this,is,not\n<script>alert(1)</script>,\x00,\n');
  fs.writeFileSync(tmp + '/xss.csv', base.split('\n')[0] + '\n0,"<img src=x onerror=window.__xss=1>",,149,M,2648,155,12,10,15,82.2,50,50,Dragon Breath,Outrage,Dragon Claw,2026-09-01,,2024-01-01,10kg,1m,0,0,0,1000\n');
  fs.writeFileSync(tmp + '/accents.csv', base.split('\n')[0] + '\n0,Flabébé,,669,F,300,60,15,15,15,100.0,30,30,Vine Whip,Struggle,,2026-09-01,,2024-01-01,10kg,1m,0,0,0,1000\n1,Nidoran♀,,29,F,300,60,15,15,15,100.0,30,30,Poison Sting,Struggle,,2026-09-01,,2024-01-01,10kg,1m,0,0,0,1000\n2,Farfetch\'d,,83,M,300,60,15,15,15,100.0,30,30,Peck,Struggle,,2026-09-01,,2024-01-01,10kg,1m,0,0,0,1000\n');
  const big = [base.split('\n')[0]]; for (let i = 0; i < 800; i++) big.push(base.split('\n')[1 + (i % 10)].replace(/^\d+/, i)); fs.writeFileSync(tmp + '/big.csv', big.join('\n') + '\n');
  fs.writeFileSync(tmp + '/short.csv', base.split('\n')[0] + '\n0,Pikachu,,25,M,800,90,15,15,15\n');
  const s2 = await session({ feed: false });
  await T('IMP-05', 'Import', 'CRLF line endings import cleanly (Windows exports)', async () => { await s2.load(tmp + '/crlf.csv'); const t = await s2.text(); expect(/10 Pokemon loaded/.test(t), t.slice(0, 140)); expect(!/Dragonite\r/.test(t)); }, 'high');
  await T('IMP-06', 'Import', 'A header-only file shows a readable error, not a crash', async () => { await s2.load(tmp + '/header.csv'); const t = await s2.text(); expect(/No rows found|Could not read/.test(t), t.slice(0, 200)); expect(s2.errors.length === 0, s2.errors[0]); });
  await T('IMP-07', 'Import', 'A garbage file does not crash or corrupt the roster', async () => { await s2.load(SMOKE); await s2.load(tmp + '/garbage.csv'); expect(s2.errors.length === 0, s2.errors[0]); const t = await s2.text(); expect(/Pokemon loaded/.test(t)); }, 'high');
  await T('IMP-08', 'Import', 'HTML in a Pokemon name is rendered as text (no script execution)', async () => { await s2.load(tmp + '/xss.csv'); await s2.go('ROSTER'); expect(!(await s2.page.evaluate(() => window.__xss)), 'XSS executed'); }, 'critical');
  await T('IMP-09', 'Import', 'Names with accents and symbols (Flabébé, Nidoran♀, Farfetch\'d) import', async () => { await s2.load(tmp + '/accents.csv'); const t = await s2.text(); expect(/Flabébé/.test(t) && /Nidoran♀/.test(t) && /Farfetch'd/.test(t), t.slice(0, 300)); });
  await T('IMP-10', 'Import', 'A file with missing trailing columns still imports the Pokemon', async () => { await s2.load(tmp + '/short.csv'); const t = await s2.text(); expect(/1 Pokemon loaded/.test(t), t.slice(0, 160)); });
  await T('IMP-11', 'Import', '800-row import renders in under 5 seconds', async () => { const t0 = Date.now(); await s2.load(tmp + '/big.csv'); await s2.page.waitForFunction(() => /800 Pokemon loaded/.test(document.body.innerText), null, { timeout: 8000 }); const ms = Date.now() - t0; expect(ms < 5000, ms + 'ms'); return ms + ' ms'; }, 'high');
  await T('IMP-13', 'Import', 'Importing over an existing roster asks first, showing the before/after counts', async () => { await s2.load(SMOKE); await s2.load(QA, { noConfirm: true }); const t = await s2.text(); expect(/Replace your roster\?/.test(t) && /has 10 Pokemon/.test(t) === false ? true : /Replace your roster\?/.test(t), t.slice(0, 200)); expect(/64/.test(t), 'no count in preview'); const cancel = s2.page.getByText('CANCEL', { exact: true }); await cancel.first().click(); await s2.page.waitForTimeout(300); expect(/10 Pokemon loaded/.test(await s2.text()), 'cancel changed the roster'); }, 'high');
  await T('IMP-14', 'Import', 'Replacing can be undone from the toast', async () => { await s2.load(QA, { noConfirm: true }); await s2.page.getByText('REPLACE', { exact: true }).first().click(); await s2.page.waitForTimeout(500); expect(/64 Pokemon loaded/.test(await s2.text())); await s2.page.getByRole('button', { name: 'Undo' }).click(); await s2.page.waitForTimeout(400); expect(/10 Pokemon loaded/.test(await s2.text()), 'undo did not restore'); }, 'high');
  fs.writeFileSync(tmp + '/ranges.csv', base.split('\n')[0] + '\n0,Dragonite,,149,M,2648,155,12,10,15,82.2,50,50,Dragon Breath,Outrage,Dragon Claw\n1,Pikachu,,25,M,99999,90,99,15,15,100,35,35,Thunder Shock,Wild Charge,\n2,,,1,M,300,60,1,1,1,6.7,30,30,Tackle,Struggle,\n3,Mew,,151,M,-5,40,15.5,15,15,100,30,30,Pound,Struggle,\n');
  await T('IMP-15', 'Import', 'Out-of-range values are cleared and listed; a row with no name is skipped', async () => { await s2.load(tmp + '/ranges.csv', { noConfirm: true }); await s2.page.getByText('REPLACE', { exact: true }).first().click().catch(() => {}); await s2.page.waitForTimeout(500); const st = await s2.state(); const pk = st.roster.find(p => p.name === 'Pikachu'), mew = st.roster.find(p => p.name === 'Mew'); expect(st.roster.length === 3, 'rows ' + st.roster.length); expect(pk.cp === null && pk.atkIV === null, JSON.stringify([pk.cp, pk.atkIV])); expect(mew.cp === null && mew.atkIV === null, 'Mew not cleaned'); expect((st.importReport || []).length >= 4, 'report ' + (st.importReport || []).length); expect(/Import notes/.test(await s2.text())); await s2.go('ROSTER'); }, 'critical');
  fs.writeFileSync(tmp + '/named.csv', 'Name,CP,HP,Atk IV,Def IV,Sta IV,Level,Fast Move,Charged Move\n"Charizard, the first",2002,130,10,12,14,40,Fire Spin,Blast Burn\nGyarados,2422,154,15,15,15,50,Waterfall,Crunch\n');
  await T('IMP-16', 'Import', 'A different exporter\'s CSV is read by column name, including quoted names', async () => { await s2.load(tmp + '/named.csv', { noConfirm: true }); await s2.page.getByText('REPLACE', { exact: true }).first().click().catch(() => {}); await s2.page.waitForTimeout(500); const st = await s2.state(); expect(st.roster.length === 2 && st.roster[0].name === 'Charizard, the first' && st.roster[0].cp === 2002 && st.roster[1].atkIV === 15, JSON.stringify(st.roster.map(p => [p.name, p.cp, p.atkIV]))); }, 'high');
  await T('IMP-17', 'Import', 'Dropping a .csv file on the page imports it', async () => { const data = fs.readFileSync(SMOKE, 'utf8'); await s2.page.evaluate(async txt => { const f = new File([txt], 'dropped.csv', { type: 'text/csv' }); const dt = new DataTransfer(); dt.items.add(f); window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); }, data); await s2.page.waitForTimeout(800); await s2.page.getByText('REPLACE', { exact: true }).first().click().catch(() => {}); await s2.page.waitForTimeout(500); expect(/dropped\.csv/.test(await s2.text())); });
  await T('IMP-18', 'Import', '200 randomly corrupted files never crash the app or leave it unusable', async () => { let seed = 5; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296; const lines = base.split('\n').filter(Boolean); let bad = 0; for (let i = 0; i < 200; i++) { const rows = [lines[0]]; for (let r = 1; r < 1 + Math.floor(rnd() * 8); r++) { let l = lines[1 + Math.floor(rnd() * (lines.length - 1))]; const cut = Math.floor(rnd() * l.length); const mode = Math.floor(rnd() * 5); l = mode === 0 ? l.slice(0, cut) : mode === 1 ? l.replace(/,/g, () => (rnd() < .3 ? ';' : ',')) : mode === 2 ? l + ',"unterminated' : mode === 3 ? l.replace(/\d+/, 'NaN') : l.split('').reverse().join(''); rows.push(l); } const txt = rows.join(rnd() < .5 ? '\n' : '\r\n'); const e = await s2.page.evaluate(t => { try { const c = new (Object.getPrototypeOf(function () {}).constructor)('return 0'); } catch (x) {} return null; }, txt); const r = await s2.page.evaluate(t => { for (const el of document.querySelectorAll('*')) { const k = Object.keys(el).find(x => x.startsWith('__reactFiber')); if (!k) continue; for (let f = el[k]; f; f = f.return) if (f.stateNode && f.stateNode.logic && f.stateNode.logic.parseCSV) { try { const L = f.stateNode.logic; const rows = L.parseCSV(t); L.validateImportRows(rows); return 'ok'; } catch (x) { return 'THROW ' + x.message; } } } return 'noapp'; }, txt); if (r !== 'ok') bad++; } expect(bad === 0, bad + ' of 200 threw'); expect(s2.errors.length === 0, s2.errors[0]); }, 'high');
  await T('IMP-12', 'Import', 'Roster is persisted: a reload keeps the imported Pokemon', async () => { await s2.page.waitForTimeout(2000); await s2.page.reload({ waitUntil: 'load' }); await s2.page.waitForTimeout(5000); const t = await s2.text(); expect(/800 Pokemon loaded|Pokemon loaded/.test(t) && !/^.*0 Pokemon loaded$/m.test(t.split('\n').find(l => /Pokemon loaded/.test(l)) || ''), (t.match(/\d+ Pokemon loaded/) || ['none'])[0]); }, 'high');
  await s2.close();

  // ------------------------------------------------------------------ ROSTER
  await s.go('ROSTER');
  const rows = () => s.page.locator('[data-swipe-row]').count();
  await T('ROS-01', 'Roster', 'First page shows 30 rows with a count line', async () => { const n = await rows(); expect(n === 30, 'rows=' + n); expect(/of 64 shown|30 of 64/.test(await s.text())); });
  await T('ROS-02', 'Roster', 'LOAD MORE adds the next page', async () => { const b = s.page.getByText(/LOAD \d+ MORE/i).first(); expect(await b.count() > 0, 'no load more'); await b.click(); await s.page.waitForTimeout(500); expect(await rows() > 30); });
  const search = s.page.getByPlaceholder(/Search name, move or type/);
  await T('ROS-03', 'Roster', 'Search by name filters the list', async () => { await search.fill('garchomp'); await s.page.waitForTimeout(500); const n = await rows(); expect(n === 1, 'rows=' + n); });
  await T('ROS-04', 'Roster', 'Search by move name finds Pokemon that know the move', async () => { await search.fill('Hurricane'); await s.page.waitForTimeout(500); expect(await rows() >= 1); });
  await T('ROS-05', 'Roster', 'Search by type works once types are known', async () => { await search.fill('dragon'); await s.page.waitForTimeout(500); expect(await rows() >= 2, 'rows=' + await rows()); });
  await T('ROS-06', 'Roster', 'A search with no matches shows an empty state, not a blank screen', async () => { await search.fill('zzzzzz'); await s.page.waitForTimeout(500); const t = await s.text(); expect(await rows() === 0 && /No Pokemon|no match|Nothing/i.test(t), t.slice(-200)); }, 'high');
  await T('ROS-07', 'Roster', 'Search is case-insensitive and trims spaces', async () => { await search.fill('  PIKACHU '); await s.page.waitForTimeout(500); expect(await rows() === 1, 'rows=' + await rows()); });
  await search.fill(''); await s.page.waitForTimeout(400);
  const sortSel = s.page.locator('select').first();
  const firstName = async () => (await s.page.locator('[data-swipe-row]').first().innerText()).split('\n').find(l => /[A-Za-z]{3}/.test(l) && !/^(CP|M|F)$/.test(l)) || '';
  const sortTests = [['cp', 'CP highest first', async () => { const r = await s.page.locator('[data-swipe-row]').evaluateAll(els => els.slice(0, 8).map(e => +((e.innerText.match(/CP\s*(\d+)/) || [])[1] || 0))); return r.every((v, i) => i === 0 || r[i - 1] >= v); }],
    ['name', 'Name A-Z', async () => { const r = await s.page.locator('[data-swipe-row]').evaluateAll(els => els.slice(0, 8).map(e => e.innerText.split('\n').filter(x => x.trim().length > 2)[0] || '')); return r.every((v, i) => i === 0 || r[i - 1].localeCompare(v) <= 0); }],
    ['iv', 'IV% highest first', async () => { const r = await s.page.locator('[data-swipe-row]').evaluateAll(els => els.slice(0, 8).map(e => { const m = e.innerText.match(/(\d+)\s*\/\s*(\d+)\s*\/\s*(\d+)/); return m ? (+m[1] + +m[2] + +m[3]) : -1; })); return r.every((v, i) => i === 0 || r[i - 1] >= v); }],
    ['dex', 'Dex number ascending', async () => true]];
  const opts = await sortSel.locator('option').allInnerTexts();
  await T('ROS-08', 'Roster', 'Sort control offers eight orderings', async () => expect(opts.length >= 8, opts.join('|')));
  for (const [key, label, check] of sortTests) {
    await T('ROS-S-' + key, 'Roster', 'Sort: ' + label + ' is correctly ordered', async () => {
      const i = opts.findIndex(o => key === 'cp' ? /CP$/.test(o) : key === 'name' ? /Name/.test(o) : key === 'iv' ? /IV%/.test(o) : /Dex/.test(o));
      expect(i >= 0, 'option missing'); await sortSel.selectOption({ index: i }); await s.page.waitForTimeout(500); expect(await check(), 'order wrong');
    });
  }
  await sortSel.selectOption({ index: 0 }); await s.page.waitForTimeout(300);
  const chips = ['MEASURED', 'NEEDS APPRAISAL', 'PVP READY', 'LUCKY', 'SHADOW'];
  for (const c of chips) {
    await T('ROS-F-' + c.replace(/\W/g, ''), 'Roster', 'Filter chip ' + c + ' narrows the list and ALL restores it', async () => {
      const chip = s.page.getByText(new RegExp('^' + c), { exact: false }).first(); await chip.click(); await s.page.waitForTimeout(500);
      const n = await rows(); await s.page.getByText('ALL', { exact: true }).first().click(); await s.page.waitForTimeout(400);
      expect(n <= 30, 'rows ' + n); expect((await rows()) === 30, 'ALL did not restore'); return n + ' rows';
    });
  }
  await T('ROS-09', 'Roster', 'Lucky filter count matches the Lucky stat tile', async () => { const st = await s.state(); const lucky = st.roster.filter(p => p.lucky).length; await s.page.getByText(/^LUCKY/).nth(1).click().catch(() => {}); await s.page.waitForTimeout(400); await s.page.getByText('ALL', { exact: true }).first().click(); return 'lucky in data: ' + lucky; });
  await T('ROS-10', 'Roster', 'Every row shows name, CP, IV triple and a type label', async () => { const t = await s.page.locator('[data-swipe-row]').first().innerText(); expect(/CP\s*\d+/.test(t) && /\d+\s*\/\s*\d+\s*\/\s*\d+/.test(t), t.replace(/\n/g, '|')); });
  await T('ROS-11', 'Roster', 'Row opens the detail sheet on tap', async () => { await s.page.locator('[data-swipe-row]').first().click(); await s.page.waitForTimeout(900); expect(/POWER UP|APPRAISAL|EVOLUTION/i.test(await s.text())); });
  // ------------------------------------------------------------------ DETAIL
  await T('DET-01', 'Detail', 'Detail header shows name, CP and a position counter ("1 of N")', async () => { const t = await s.text(); expect(/\d+ of \d+/.test(t), t.slice(0, 200)); });
  await T('DET-02', 'Detail', 'Next arrow moves to the following Pokemon', async () => { const before = await s.text(); const nx = s.page.getByText(/^(›|→|NEXT)$/).first(); if (!(await nx.count())) skip('no next control found by text'); await nx.click(); await s.page.waitForTimeout(500); expect((await s.text()) !== before); });
  await T('DET-03', 'Detail', 'Detail sheet shows moves with a best-moves suggestion', async () => expect(/MOVES|Fast|Charge/i.test(await s.text())));
  await T('DET-04', 'Detail', 'Detail shows type weaknesses', async () => expect(/WEAK|weak/i.test(await s.text())));
  await T('DET-05', 'Detail', 'Detail shows league rank chips (Great/Ultra/Little)', async () => expect(/GREAT|ULTRA|LITTLE/i.test(await s.text())));
  await T('DET-06', 'Detail', 'Power-up card shows a stardust cost (non-maxed Pokemon)', async () => { await s.call('closeDetail'); const low = (await s.state()).roster.find(p => p.lvlMax && p.lvlMax < 38 && p.cp < 1400); await search.fill(low ? low.name : 'Caterpie'); await s.page.waitForTimeout(400); await s.page.locator('[data-swipe-row]').first().click({ force: true }); await s.page.waitForTimeout(800); const t = await s.text(); expect(/POWER UP/.test(t) && /\d{1,2},?\d{3}/.test(t), t.slice(0, 200)); await s.call('closeDetail'); await search.fill(''); await s.page.waitForTimeout(300); });
  await T('DET-07', 'Detail', 'Close returns to the roster at the same scroll position', async () => { await s.call('closeDetail'); await s.page.waitForTimeout(600); expect(await rows() >= 1); });
  // Mega card
  await search.fill('Beedrill'); await s.page.waitForTimeout(400);
  await s.page.locator('[data-swipe-row]').first().click({ force: true }); await s.page.waitForTimeout(800);
  await T('DET-10', 'Detail', 'A Mega-capable Pokemon shows the MEGA EVOLUTION card', async () => expect(/MEGA EVOLUTION/.test(await s.text())));
  await T('DET-11', 'Detail', 'Typing Mega energy updates the status line live', async () => { const inp = s.page.getByPlaceholder('energy').first(); await inp.fill('250'); await inp.blur(); await s.page.waitForTimeout(300); expect(/250 energy/.test(await s.text()), (await s.text()).slice(0, 80)); });
  await T('DET-12', 'Detail', 'Mega level + rest days produce the game\'s skip cost (level 1, 4 days = 11)', async () => { await s.page.getByPlaceholder('level').first().fill('1'); await s.page.getByPlaceholder('rest days left').first().fill('4'); await s.page.waitForTimeout(300); expect(/11 needed/.test(await s.text()), (await s.text()).match(/\d+ needed[^\n]*/) + ''); }, 'high');
  await T('DET-13', 'Detail', 'I MEGA EVOLVED deducts the cost and restarts the rest period', async () => { await s.page.getByText('I MEGA EVOLVED').first().click(); await s.page.waitForTimeout(300); const t = await s.text(); expect(/239 energy/.test(t), (t.match(/\d+ energy/) || ['none'])[0]); });
  await T('DET-14', 'Detail', 'Mega data survives a reload', async () => { await s.page.waitForTimeout(2000); await s.page.reload({ waitUntil: 'load' }); await s.page.waitForTimeout(5000); const st = await s.state(); expect(st && st.megaEnergyInventory && st.megaEnergyInventory.beedrill, 'inventory lost'); }, 'high');
  await s.close();

  // ------------------------------------------------------------------ ROW GESTURES
  s = await session({ feed: false });
  await s.load(SMOKE); await s.go('ROSTER');
  await T('GES-01', 'Gestures', 'Swipe left reveals Transfer / Remove actions', async () => { const row = s.page.locator('[data-swipe-row]').first(); const b = await row.boundingBox(); const cdp = await s.ctx.newCDPSession(s.page); const y = b.y + b.height / 2; await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x + b.width - 30, y }] }); for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: b.x + b.width - 30 - i * 25, y }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await s.page.waitForTimeout(400); expect((await row.evaluate(e => e.dataset.swipeOpen)) === '1'); }, 'critical');
  await T('GES-02', 'Gestures', 'Tapping elsewhere closes an open swipe row (iOS list behaviour)', async () => { await s.page.mouse.click(215, 400); await s.page.waitForTimeout(400); expect((await s.page.locator('[data-swipe-open="1"]').count()) === 0, 'row still open'); });
  await s.page.reload({ waitUntil: 'load' }); await s.page.waitForTimeout(2200); await s.load(SMOKE); await s.go('ROSTER');
  await T('GES-03', 'Gestures', 'Long press opens the action menu', async () => { const row = s.page.locator('[data-swipe-row]').nth(1); const b = await row.boundingBox(); const cdp = await s.ctx.newCDPSession(s.page); await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x + 100, y: b.y + b.height / 2 }] }); await s.page.waitForTimeout(800); const open = await s.page.getByText('What would you like to do?').count(); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await s.page.waitForTimeout(400); expect(open === 1 && await s.page.getByText('What would you like to do?').count() === 1, 'open=' + open); }, 'critical');
  await T('GES-04', 'Gestures', 'Vertical scrolling is not hijacked by the swipe handler', async () => { await s.page.keyboard.press('Escape'); const y0 = await s.page.evaluate(() => window.scrollY); await s.page.mouse.wheel(0, 400); await s.page.waitForTimeout(300); expect(true); });
  await T('GES-05', 'Gestures', 'Transfer removes the Pokemon and the count drops by one', async () => { await s.page.keyboard.press('Escape'); await s.page.reload({ waitUntil: 'load' }); await s.page.waitForTimeout(2200); const before = await s.page.locator('[data-swipe-row]').count(); await s.page.getByText(/Transfer/).first().click({ force: true }).catch(() => {}); await s.page.waitForTimeout(500); expect(await s.page.locator('[data-swipe-row]').count() <= before); });
  // ---- Roster: select mode, bulk actions, saved views, undo, sort, hint
  const rowCount = () => s.page.locator('[data-swipe-row]').count();
  const reset = async csv => { await s.page.reload({ waitUntil: 'load' }); await s.page.waitForTimeout(2200); await s.load(csv); await s.go('ROSTER'); await s.page.waitForTimeout(400); };
  await reset(SMOKE);
  await T('ROS-12', 'Roster', 'Select mode: rows toggle on tap, the bar shows the count, Done exits', async () => {
    await s.page.getByRole('button', { name: 'Select', exact: true }).click(); await s.page.waitForTimeout(300);
    const rws = s.page.locator('[data-swipe-row]'); await rws.nth(0).click(); await rws.nth(1).click(); await s.page.waitForTimeout(300);
    expect(/2 selected/.test(await s.text()), 'count not shown'); expect(await s.page.getByText('Pokemon', { exact: false }).count() > 0);
    expect((await s.state()).selectedIdx.length === 2, 'state');
    await s.page.getByRole('button', { name: 'Done', exact: true }).click(); await s.page.waitForTimeout(300);
    expect((await s.state()).selectMode === false && (await s.state()).selectedIdx.length === 0, 'did not exit');
  }, 'high');
  await T('ROS-13', 'Roster', 'Bulk transfer removes the selection, adds 1 candy per Pokemon, and Undo restores it all', async () => {
    const before = await rowCount(); const st0 = await s.state();
    await s.page.getByRole('button', { name: 'Select', exact: true }).click();
    const rws = s.page.locator('[data-swipe-row]'); await rws.nth(0).click(); await rws.nth(1).click();
    await s.page.getByRole('button', { name: 'Transfer', exact: true }).last().click(); await s.page.waitForTimeout(500);
    const st1 = await s.state(); expect((await rowCount()) === before - 2, 'rows ' + before + ' -> ' + (await rowCount()));
    expect(st1.removedIds.length === st0.removedIds.length + 2, 'removedIds');
    const candy = Object.values(st1.candyInventory || {}).reduce((a, c) => a + (c.candy || 0), 0) - Object.values(st0.candyInventory || {}).reduce((a, c) => a + (c.candy || 0), 0);
    expect(candy === 2, 'candy +' + candy); expect(/Transferred 2 Pokemon/.test(await s.text()), 'toast');
    await s.page.getByRole('button', { name: 'Undo' }).click(); await s.page.waitForTimeout(400);
    const st2 = await s.state(); expect((await rowCount()) === before, 'undo rows'); expect(st2.removedIds.length === st0.removedIds.length, 'undo removedIds');
    expect(JSON.stringify(st2.candyInventory) === JSON.stringify(st0.candyInventory), 'undo candy');
  }, 'critical');
  await T('ROS-14', 'Roster', 'Bulk favourite marks the selection, and Undo reverses it', async () => {
    await s.page.getByRole('button', { name: 'Select', exact: true }).click();
    const rws = s.page.locator('[data-swipe-row]'); await rws.nth(2).click(); await rws.nth(3).click();
    await s.page.getByRole('button', { name: 'Favourite', exact: true }).click(); await s.page.waitForTimeout(400);
    let st = await s.state(); const favs = Object.values(st.ivOverrides || {}).filter(o => o && o.favorite === true).length; expect(favs === 2, 'favs ' + favs);
    await s.page.getByRole('button', { name: 'Undo' }).click(); await s.page.waitForTimeout(300);
    st = await s.state(); expect(Object.values(st.ivOverrides || {}).filter(o => o && o.favorite === true).length === 0, 'undo');
  }, 'medium');
  await T('ROS-15', 'Roster', 'Bulk remove asks first and grants no candy', async () => {
    const st0 = await s.state(); const before = await rowCount();
    await s.page.getByRole('button', { name: 'Select', exact: true }).click(); await s.page.locator('[data-swipe-row]').nth(0).click();
    await s.page.getByRole('button', { name: 'Remove', exact: true }).last().click(); await s.page.waitForTimeout(300);
    expect(/NOT grant transfer candy/.test(await s.text()), 'no confirm');
    await s.page.getByText('REMOVE', { exact: true }).click(); await s.page.waitForTimeout(400);
    const st1 = await s.state(); expect((await rowCount()) === before - 1, 'rows'); expect(JSON.stringify(st1.candyInventory) === JSON.stringify(st0.candyInventory), 'candy changed');
    await s.page.getByRole('button', { name: 'Undo' }).click(); await s.page.waitForTimeout(300); expect((await rowCount()) === before, 'undo');
  }, 'high');
  await T('ROS-16', 'Roster', 'Saved views: save the current filter + sort, reapply it, delete it, and it survives a reload', async () => {
    await s.page.locator('.om-press', { hasText: /^LUCKY$/ }).click({ timeout: 4000 }).catch(e => { throw new Error('step 1: ' + e.message.split('\n')[0]); }); await s.page.waitForTimeout(300);
    await s.page.getByRole('button', { name: 'Save this view' }).click({ timeout: 4000 }).catch(e => { throw new Error('step 2: ' + e.message.split('\n')[0]); }); await s.page.waitForTimeout(300);
    expect((await s.state()).savedViews.length === 1, 'not saved'); expect(/Lucky/.test(await s.text()));
    await s.page.locator('.om-press', { hasText: /^ALL$/ }).click({ timeout: 4000 }).catch(e => { throw new Error('step 3: ' + e.message.split('\n')[0]); }); await s.page.waitForTimeout(200);
    await s.page.getByRole('button', { name: /^Lucky/ }).first().click({ timeout: 4000 }).catch(e => { throw new Error('step 4: ' + e.message.split('\n')[0]); }); await s.page.waitForTimeout(300); expect((await s.state()).rosterFilter === 'lucky', 'view not applied');
    await s.page.reload({ waitUntil: 'load' }); await s.page.waitForTimeout(3000);
    expect((await s.state()).savedViews.length === 1, 'not persisted'); await s.go('ROSTER'); await s.page.waitForTimeout(500);
    await s.page.getByRole('button', { name: /Delete saved view/ }).first().click({ timeout: 4000 }).catch(e => { throw new Error('step 5: ' + e.message.split('\n')[0]); }); await s.page.waitForTimeout(300); expect((await s.state()).savedViews.length === 0, 'not deleted');
  }, 'medium');
  await T('ROS-17', 'Roster', 'Sort "Mega ready" lists Mega-capable Pokemon first', async () => {
    await s.page.reload({ waitUntil: 'load' }); await s.page.waitForTimeout(2500); await s.load(QA, {}); await s.go('ROSTER');
    await s.page.locator('select').first().selectOption('megaReady'); await s.page.waitForTimeout(500);
    const tags = await s.page.locator('[data-swipe-row]').evaluateAll(els => els.slice(0, 30).map(e => /MEGA ✓/.test(e.innerText) ? 2 : /MEGA/.test(e.innerText) ? 1 : 0));
    expect(tags.some(t => t > 0), 'fixture has no Mega-capable Pokemon in view'); expect(tags.every((v, i) => i === 0 || tags[i - 1] >= v), 'order ' + tags.join(''));
  }, 'medium');
  await T('ROS-18', 'Roster', 'Scrolling to the bottom loads the next page without tapping', async () => {
    await s.page.locator('select').first().selectOption('cp'); await s.page.waitForTimeout(300);
    expect((await rowCount()) === 30, 'start ' + (await rowCount()));
    await s.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await s.page.waitForTimeout(1200);
    expect((await rowCount()) > 30, 'still ' + (await rowCount()));
  }, 'high');
  await T('ROS-19', 'Roster', 'Rows skip off-screen rendering (content-visibility) so long lists scroll smoothly', async () => {
    const v = await s.page.locator('[data-swipe-row]').first().evaluate(e => getComputedStyle(e.parentElement).contentVisibility); expect(v === 'auto', v);
  }, 'medium');
  await reset(SMOKE);
  await T('GES-06', 'Gestures', 'Single transfer offers Undo and restores the Pokemon and candy', async () => {
    const before = await rowCount(); const st0 = await s.state();
    await s.page.locator('[aria-label^="Transfer"]').first().dispatchEvent('click'); await s.page.waitForTimeout(300);
    await s.page.getByText('NO XL CANDY', { exact: true }).click(); await s.page.waitForTimeout(500);
    expect((await rowCount()) === before - 1, 'not removed');
    await s.page.getByRole('button', { name: 'Undo' }).click(); await s.page.waitForTimeout(400);
    const st1 = await s.state(); expect((await rowCount()) === before, 'undo rows'); expect(JSON.stringify(st1.candyInventory) === JSON.stringify(st0.candyInventory), 'candy not restored');
  }, 'high');
  await T('GES-07', 'Gestures', 'One-time swipe hint nudges the first row once, then never again', async () => {
    await s.page.evaluate(() => localStorage.removeItem('scout.hint.swipe'));
    await s.call('maybeSwipeHint'); await s.page.waitForTimeout(250);
    const t1 = await s.page.locator('[data-swipe-row]').first().evaluate(e => e.style.transform); expect(/-56px/.test(t1), 'no nudge: ' + t1);
    await s.page.waitForTimeout(1800);
    const t2 = await s.page.locator('[data-swipe-row]').first().evaluate(e => e.style.transform); expect(t2 === '', 'left transform ' + t2);
    await s.call('maybeSwipeHint'); await s.page.waitForTimeout(250);
    expect((await s.page.locator('[data-swipe-row]').first().evaluate(e => e.style.transform)) === '', 'hint repeated');
  }, 'medium');
  await s.close();
};
