// ============================================================
// SCOUT DASHBOARD PATCHES — Copy these methods into Scout Dashboard.dc.html
// ============================================================
// These fixes address:
// 1. HP/Type/Candy not reading from screenshots (multi-pass OCR + region cropping)
// 2. CSV sync resetting to 200 on refresh (unified localStorage database)
// 3. No unified database across screenshot/CSV/Firebase (single source of truth)
// 4. Init order wrong (loads sample data AFTER localStorage)
//
// INSTRUCTIONS:
// 1. Find each existing method in Scout Dashboard.dc.html and REPLACE it
// 2. For new methods (marked "ADD NEW"), add them anywhere in your logic class
// 3. For init fix, find your componentDidMount/init and replace the roster load
// ============================================================

// ----------------------------------------------------------
// 1. REPLACE: preprocessImage()
// ----------------------------------------------------------
preprocessImage(file) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      // Scale up for better OCR (Pokemon GO text is small)
      const scale = 2;
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Get image data for processing
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      // Convert to grayscale + boost contrast + threshold
      for (let i = 0; i < data.length; i += 4) {
        const gray = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
        // Aggressive contrast boost for dark-mode POGO screens
        const boosted = gray < 100 ? 0 : (gray > 180 ? 255 : gray * 1.4);
        data[i] = data[i+1] = data[i+2] = Math.min(255, boosted);
      }

      ctx.putImageData(imageData, 0, 0);
      resolve(canvas);
    };
    img.src = URL.createObjectURL(file);
  });
}

// ----------------------------------------------------------
// 2. REPLACE: handleScreenshotUpload()
// ----------------------------------------------------------
async handleScreenshotUpload(file) {
  this.setState({ importStatus: 'Processing screenshot...', importProgress: 10 });

  try {
    const canvas = await this.preprocessImage(file);
    const fullText = await this.runOCR(canvas, 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/.,% CPHPAtkDefStaLevelkgm');

    this.setState({ importStatus: 'Parsing fields...', importProgress: 50 });

    // Extract basic fields from full image
    let rec = this.parsePokemonText(fullText);

    // If we have a name, do dex lookup for type and other metadata
    if (rec.pokemon_name) {
      const dexInfo = this.lookupDexInfo(rec.pokemon_name);
      rec = { ...dexInfo, ...rec };
    }

    // Multi-pass: crop specific regions for hard-to-read fields
    if (!rec.hp || !rec.candy || !rec.xl_candy) {
      this.setState({ importStatus: 'Reading detailed fields...', importProgress: 70 });
      const detailRec = await this.extractDetailFields(canvas);
      rec = { ...rec, ...detailRec };
    }

    // Merge into roster (match by name + CP within 10)
    const existing = this.state.roster.find(p => 
      p.name === rec.pokemon_name && Math.abs((p.cp || 0) - (rec.cp || 0)) < 10
    );

    let newRoster;
    if (existing) {
      // Update existing
      newRoster = this.state.roster.map(p => 
        (p.name === rec.pokemon_name && Math.abs((p.cp || 0) - (rec.cp || 0)) < 10)
          ? { ...p, ...rec, _updated: Date.now() }
          : p
      );
    } else {
      // Add new
      const newMon = this.buildPokemonRecord(rec);
      newRoster = [...this.state.roster, newMon];
    }

    this.saveRoster(newRoster);
    this.setState({ 
      roster: newRoster, 
      importStatus: `Imported ${rec.pokemon_name || 'Pokemon'} (CP ${rec.cp || '?'})`,
      importProgress: 100 
    });

  } catch (err) {
    console.error('Screenshot import failed:', err);
    this.setState({ importStatus: 'Import failed: ' + err.message, importProgress: 0 });
  }
}

// ----------------------------------------------------------
// 3. ADD NEW: runOCR(canvas, whitelist)
// ----------------------------------------------------------
async runOCR(canvas, whitelist = null) {
  if (!window.Tesseract) {
    await this.loadTesseract();
  }

  const config = {
    logger: m => {
      if (m.status === 'recognizing text') {
        this.setState({ importProgress: 10 + Math.round(m.progress * 40) });
      }
    }
  };

  if (whitelist) {
    config.tessedit_char_whitelist = whitelist;
  }

  const result = await window.Tesseract.recognize(canvas, 'eng', config);
  return result.data.text;
}

// ----------------------------------------------------------
// 4. ADD NEW: extractDetailFields(canvas)
//    Crops specific regions for HP, Candy, XL Candy
// ----------------------------------------------------------
async extractDetailFields(canvas) {
  const result = {};
  const w = canvas.width;
  const h = canvas.height;

  // HP region: usually middle-left, below CP arc
  const hpCanvas = document.createElement('canvas');
  const hpCtx = hpCanvas.getContext('2d');
  hpCanvas.width = w * 0.3;
  hpCanvas.height = h * 0.15;
  hpCtx.drawImage(canvas, w * 0.1, h * 0.25, w * 0.3, h * 0.15, 0, 0, hpCanvas.width, hpCanvas.height);

  // Candy region: lower middle
  const candyCanvas = document.createElement('canvas');
  const candyCtx = candyCanvas.getContext('2d');
  candyCanvas.width = w * 0.5;
  candyCanvas.height = h * 0.2;
  candyCtx.drawImage(canvas, w * 0.25, h * 0.6, w * 0.5, h * 0.2, 0, 0, candyCanvas.width, candyCanvas.height);

  // Run OCR on cropped regions with digit-only whitelist
  const [hpText, candyText] = await Promise.all([
    this.runOCR(hpCanvas, '0123456789HP/'),
    this.runOCR(candyCanvas, '0123456789CandyXL ')
  ]);

  // Parse HP
  const hpMatch = hpText.match(/HP\s*(\d+)/i) || hpText.match(/(\d+)\s*\/\s*\d+/);
  if (hpMatch) result.hp = parseInt(hpMatch[1]);

  // Parse Candy
  const candyMatch = candyText.match(/(\d+)\s+Candy\b(?!.*XL)/i);
  if (candyMatch) result.candy = parseInt(candyMatch[1]);

  // Parse XL Candy
  const xlMatch = candyText.match(/(\d+)\s*XL/i);
  if (xlMatch) result.xl_candy = parseInt(xlMatch[1]);

  return result;
}

// ----------------------------------------------------------
// 5. REPLACE: parsePokemonText(text)
// ----------------------------------------------------------
parsePokemonText(text) {
  const rec = {};
  const t = text.replace(/,/g, '');

  // Name: first known Pokemon name found
  const nameMatch = this.findPokemonName(text);
  if (nameMatch) rec.pokemon_name = nameMatch;

  // CP
  const cp = t.match(/\bCP\s*(\d+)/i);
  if (cp) rec.cp = parseInt(cp[1]);

  // HP (from full text as fallback)
  const hp = t.match(/\bHP\s*(\d+)/i);
  if (hp) rec.hp = parseInt(hp[1]);

  // IVs
  const atk = t.match(/Atk\s*(\d+)/i);
  const def = t.match(/Def\s*(\d+)/i);
  const sta = t.match(/Sta\s*(\d+)/i);
  if (atk) rec.attack_iv = parseInt(atk[1]);
  if (def) rec.defense_iv = parseInt(def[1]);
  if (sta) rec.stamina_iv = parseInt(sta[1]);

  // Level
  const lvl = t.match(/Level\s*(\d+\.?\d*)/i);
  if (lvl) rec.level = parseFloat(lvl[1]);

  // Weight/Height
  const wt = t.match(/(\d+\.?\d*)\s*kg/i);
  const ht = t.match(/(\d+\.?\d*)\s*m\b/i);
  if (wt) rec.weight = wt[1];
  if (ht) rec.height = ht[1];

  // Stardust
  const dust = t.match(/(\d+)\s*Stardust/i);
  if (dust) rec.stardust = parseInt(dust[1]);

  // Booleans
  if (/\bShadow\b/i.test(t)) rec.shadow = true;
  if (/\bPurified\b/i.test(t)) rec.purified = true;
  if (/\bLucky\b/i.test(t)) rec.lucky = true;
  if (/\bShiny\b/i.test(t)) rec.shiny = true;
  if (/\bFavorite\b/i.test(t)) rec.favorite = true;

  // Moves
  const moves = this.extractMoves(text);
  if (moves.fast) rec.fast_move = moves.fast;
  if (moves.charged1) rec.charged_move_1 = moves.charged1;
  if (moves.charged2) rec.charged_move_2 = moves.charged2;

  return rec;
}

// ----------------------------------------------------------
// 6. ADD NEW: findPokemonName(text)
// ----------------------------------------------------------
findPokemonName(text) {
  // Build reverse lookup from pokemon-mechanics.js BASE_STATS_BY_FORM
  if (!this._nameList) {
    this._nameList = Object.keys(BASE_STATS_BY_FORM || {}).map(n => n.toLowerCase());
    // Add common names
    this._nameList.push(...['eevee', 'pikachu', 'charizard', 'dragonite', 'garchomp', 
      'mewtwo', 'tyranitar', 'metagross', 'gengar', 'machamp']);
  }

  const lines = text.split('\n').slice(0, 15);
  for (const line of lines) {
    const clean = line.trim().toLowerCase();
    if (clean.length < 3 || clean.length > 20) continue;
    // Exact match
    if (this._nameList.includes(clean)) {
      return this.capitalizeName(clean);
    }
    // Check each word/phrase
    const words = clean.split(/\s+/);
    for (let i = 0; i < words.length; i++) {
      for (let j = i + 1; j <= Math.min(i + 3, words.length); j++) {
        const phrase = words.slice(i, j).join(' ');
        if (this._nameList.includes(phrase)) {
          return this.capitalizeName(phrase);
        }
      }
    }
  }
  return null;
}

capitalizeName(str) {
  return str.replace(/\b\w/g, c => c.toUpperCase());
}

// ----------------------------------------------------------
// 7. ADD NEW: lookupDexInfo(name)
// ----------------------------------------------------------
lookupDexInfo(name) {
  const info = {};
  // Try to find in BASE_STATS_BY_FORM
  const key = Object.keys(BASE_STATS_BY_FORM || {}).find(
    k => k.toLowerCase() === name.toLowerCase()
  );
  if (key) {
    const stats = BASE_STATS_BY_FORM[key];
    info.dex_number = stats.dex || 0;
    info.type_1 = stats.type1 || '';
    info.type_2 = stats.type2 || '';
  }
  // Manual fallback for common Pokemon
  const manual = {
    'eevee': { dex_number: 133, type_1: 'Normal' },
    'pikachu': { dex_number: 25, type_1: 'Electric' },
    'charizard': { dex_number: 6, type_1: 'Fire', type_2: 'Flying' },
    'dragonite': { dex_number: 149, type_1: 'Dragon', type_2: 'Flying' },
    'garchomp': { dex_number: 445, type_1: 'Dragon', type_2: 'Ground' },
    'mewtwo': { dex_number: 150, type_1: 'Psychic' },
    'tyranitar': { dex_number: 248, type_1: 'Rock', type_2: 'Dark' },
    'metagross': { dex_number: 376, type_1: 'Steel', type_2: 'Psychic' },
    'gengar': { dex_number: 94, type_1: 'Ghost', type_2: 'Poison' },
    'machamp': { dex_number: 68, type_1: 'Fighting' },
  };
  const lower = name.toLowerCase();
  if (manual[lower]) {
    return { ...manual[lower], ...info };
  }
  return info;
}

// ----------------------------------------------------------
// 8. ADD NEW: buildPokemonRecord(rec)
// ----------------------------------------------------------
buildPokemonRecord(rec) {
  const atk = rec.attack_iv || 0;
  const def = rec.defense_iv || 0;
  const sta = rec.stamina_iv || 0;
  const ivAvg = rec.iv_percent || Math.round((atk + def + sta) / 45 * 100 * 10) / 10;

  return {
    idx: this.state.roster.length + 1,
    name: rec.pokemon_name || 'Unknown',
    form: rec.form || null,
    dex: rec.dex_number || 0,
    gender: rec.gender || '',
    cp: rec.cp || 0,
    hp: rec.hp || 0,
    atkIV: atk,
    defIV: def,
    staIV: sta,
    ivAvg: ivAvg,
    lvlMin: rec.level || null,
    lvlMax: rec.level || null,
    quickMove: rec.fast_move || '',
    chargeMove: rec.charged_move_1 || '',
    chargeMove2: rec.charged_move_2 || null,
    scanDate: new Date().toISOString().split('T')[0],
    catchDate: rec.caught_date || null,
    weight: rec.weight || '',
    height: rec.height || '',
    lucky: rec.lucky || false,
    shadowPurified: rec.shadow ? '1' : (rec.purified ? '2' : '0'),
    favorite: rec.favorite || false,
    dust: rec.stardust || 0,
    candy: rec.candy || 0,
    xlCandy: rec.xl_candy || 0,
    type1: rec.type_1 || '',
    type2: rec.type_2 || '',
    great: { rankPct: null, rankNum: null, statProd: null, dustCost: null, candyCost: null, evolvesTo: null },
    ultra: { rankPct: null, rankNum: null, statProd: null, dustCost: null, candyCost: null, evolvesTo: null },
    little: { rankPct: null, rankNum: null, statProd: null, dustCost: null, candyCost: null, evolvesTo: null },
  };
}

// ----------------------------------------------------------
// 9. CRITICAL — REPLACE: saveRoster() & loadRoster()
// ----------------------------------------------------------
saveRoster(roster) {
  try {
    const data = JSON.stringify(roster);
    localStorage.setItem('scout_roster', data);
    localStorage.setItem('scout_roster_ts', Date.now().toString());
    console.log(`[Scout] Saved ${roster.length} Pokemon to localStorage`);
  } catch (e) {
    console.error('[Scout] localStorage save failed:', e);
    if (e.name === 'QuotaExceededError') {
      alert('Storage full! Export your data and clear some Pokemon.');
    }
  }
}

loadRoster() {
  try {
    const saved = localStorage.getItem('scout_roster');
    if (saved) {
      const roster = JSON.parse(saved);
      console.log(`[Scout] Loaded ${roster.length} Pokemon from localStorage`);
      return roster;
    }
  } catch (e) {
    console.error('[Scout] localStorage load failed:', e);
  }
  return null;
}

// ----------------------------------------------------------
// 10. CRITICAL — REPLACE: Init / componentDidMount roster load
//     Find where you set roster from POKEMON_DATA and replace with:
// ----------------------------------------------------------
// const savedRoster = this.loadRoster();
// if (savedRoster && savedRoster.length > 0) {
//   this.state.roster = savedRoster;
// } else {
//   this.state.roster = SAMPLE_POKEMON || [];
//   this.saveRoster(this.state.roster);
// }

// ----------------------------------------------------------
// 11. REPLACE: importCSV(csvText)
// ----------------------------------------------------------
importCSV(csvText) {
  const lines = csvText.trim().split('\n');
  const imported = [];

  for (const line of lines) {
    const cols = line.split(',');
    if (cols.length < 5) continue;

    const rec = {
      pokemon_name: cols[0]?.trim(),
      dex_number: parseInt(cols[1]) || 0,
      cp: parseInt(cols[2]) || 0,
      hp: parseInt(cols[3]) || 0,
      level: parseFloat(cols[4]) || null,
      attack_iv: parseInt(cols[5]) || null,
      defense_iv: parseInt(cols[6]) || null,
      stamina_iv: parseInt(cols[7]) || null,
      iv_percent: parseFloat(cols[8]) || null,
      gender: cols[9]?.trim() || '',
      weight: cols[11]?.trim() || '',
      height: cols[12]?.trim() || '',
      type_1: cols[13]?.trim() || '',
      type_2: cols[14]?.trim() || '',
      favorite: cols[17] === '1',
      shiny: cols[18] === '1',
      shadow: cols[19] === '1',
      purified: cols[20] === '1',
      lucky: cols[21] === '1',
      fast_move: cols[37]?.trim() || '',
      charged_move_1: cols[38]?.trim() || '',
      charged_move_2: cols[39]?.trim() || null,
      fast_move_type: cols[40]?.trim() || '',
      charged_move_type_1: cols[41]?.trim() || '',
      charged_move_type_2: cols[42]?.trim() || '',
      stardust: parseInt(cols[43]) || 0,
      candy: parseInt(cols[45]) || 0,
      xl_candy: parseInt(cols[46]) || 0,
      mega_energy: parseInt(cols[50]) || 0,
    };

    // Look up missing info from name
    const dexInfo = this.lookupDexInfo(rec.pokemon_name);
    if (!rec.type_1 && dexInfo.type_1) rec.type_1 = dexInfo.type_1;
    if (!rec.type_2 && dexInfo.type_2) rec.type_2 = dexInfo.type_2;
    if (!rec.dex_number && dexInfo.dex_number) rec.dex_number = dexInfo.dex_number;

    imported.push(this.buildPokemonRecord(rec));
  }

  // MERGE with existing roster (don't overwrite)
  const existingIds = new Set(this.state.roster.map(p => `${p.name}_${p.cp}`));
  const newMons = imported.filter(p => !existingIds.has(`${p.name}_${p.cp}`));
  const merged = [...this.state.roster, ...newMons];

  this.saveRoster(merged);
  this.setState({ roster: merged, importStatus: `Imported ${newMons.length} new Pokemon` });

  // Auto-sync to cloud if logged in
  if (this.state.user) {
    this.pushCloud(merged);
  }
}

// ----------------------------------------------------------
// 12. REPLACE: pullCloud() and pushCloud()
// ----------------------------------------------------------
async pullCloud() {
  if (!this.state.user || !window.db) return;
  try {
    const doc = await window.db.collection('rosters').doc(this.state.user.uid).get();
    if (doc.exists) {
      const cloudData = doc.data().pokemon || [];
      // Merge: local wins if newer timestamp
      const localTs = parseInt(localStorage.getItem('scout_roster_ts') || '0');
      const cloudTs = doc.data().updatedAt || 0;

      if (cloudTs > localTs) {
        this.saveRoster(cloudData);
        this.setState({ roster: cloudData, syncStatus: 'Synced from cloud' });
      } else {
        this.setState({ syncStatus: 'Local data is newer' });
      }
    }
  } catch (e) {
    console.error('Cloud pull failed:', e);
  }
}

async pushCloud(roster) {
  if (!this.state.user || !window.db) return;
  try {
    await window.db.collection('rosters').doc(this.state.user.uid).set({
      pokemon: roster,
      updatedAt: Date.now(),
      email: this.state.user.email
    });
    this.setState({ syncStatus: 'Synced to cloud', lastSync: Date.now() });
  } catch (e) {
    console.error('Cloud push failed:', e);
    this.setState({ syncStatus: 'Sync failed: ' + e.message });
  }
}
