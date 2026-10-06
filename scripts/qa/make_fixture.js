#!/usr/bin/env node
// Deterministic Poke Genie-style CSV for the QA suite: 64 Pokemon with consistent CP/HP
// computed from real base stats, covering every league, flags and Mega-capable species.
const fs = require('fs'), path = require('path');
global.window = { dispatchEvent() {} }; global.Event = function () {};
require(path.join(__dirname, '..', '..', 'pokemon-mechanics.js'));
const m = window.PokemonMechanics;
let seed = 11; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const pick = [
  ['Dragonite', 149], ['Garchomp', 445], ['Azumarill', 184], ['Machamp', 68], ['Pikachu', 25], ['Gyarados', 130], ['Caterpie', 10], ['Altaria', 334],
  ['Skarmory', 227], ['Medicham', 308], ['Charizard', 6], ['Mewtwo', 150], ['Beedrill', 15], ['Venusaur', 3], ['Blastoise', 9], ['Alakazam', 65],
  ['Gengar', 94], ['Tyranitar', 248], ['Metagross', 376], ['Salamence', 373], ['Lucario', 448], ['Scizor', 212], ['Heracross', 214], ['Sableye', 302],
  ['Bulbasaur', 1], ['Charmander', 4], ['Squirtle', 7], ['Eevee', 133], ['Snorlax', 143], ['Lapras', 131], ['Togekiss', 468], ['Registeel', 379],
  ['Swampert', 260], ['Sceptile', 254], ['Blaziken', 257], ['Gardevoir', 282], ['Gallade', 475], ['Absol', 359], ['Latios', 381], ['Rayquaza', 384],
  ['Kyogre', 382], ['Groudon', 383], ['Mew', 151], ['Lugia', 249], ['Ho-Oh', 250], ['Mr. Mime', 122], ['Farfetch\'d', 83], ['Nidoran♀', 29],
  ['Wobbuffet', 202], ['Bastiodon', 411], ['Cresselia', 488], ['Mandibuzz', 630], ['Stunfisk', 618], ['Jellicent', 593], ['Whiscash', 340], ['Venomoth', 49],
  ['Magikarp', 129], ['Zubat', 41], ['Rattata', 19], ['Wooper', 194], ['Pidgey', 16], ['Ditto', 132], ['Corsola', 222], ['Skiploom', 188],
];
const header = Array.from({ length: 47 }, (_, i) => 'c' + i).join(',');
const rows = pick.map(([name, dex], i) => {
  const base = m.BASE_STATS[dex]; const iv = [0, 0, 0].map(() => Math.floor(rnd() * 16));
  if (i % 9 === 0) iv.fill(15); if (i % 11 === 0) iv.fill(0);
  // choose the highest level that keeps most picks in a league band so every league has entries
  const band = [1500, 2500, 99999, 1500][i % 4]; let lvl = 1;
  for (let L = 1; L <= 50; L += 0.5) { if (m.cpFor(base, iv, L) <= band) lvl = L; }
  lvl = Math.max(1, lvl - (i % 5 === 0 ? 4 : 0));
  const cp = m.cpFor(base, iv, lvl), hp = m.hpFor(base, iv[2], lvl), avg = ((iv[0] + iv[1] + iv[2]) / 45 * 100).toFixed(1);
  const mv = (m.movepoolFor(name) || { fast: [], charge: [] });
  const cap = s => s.replace(/\b\w/g, c => c.toUpperCase());
  const f = mv.fast[0] ? cap(mv.fast[0]) : 'Tackle', c1 = mv.charge[0] ? cap(mv.charge[0]) : 'Struggle', c2 = mv.charge[1] ? cap(mv.charge[1]) : '';
  const cols = new Array(47).fill('');
  Object.assign(cols, { 0: i, 1: name, 3: dex, 4: i % 2 ? 'F' : 'M', 5: cp, 6: hp, 7: iv[0], 8: iv[1], 9: iv[2], 10: avg, 11: lvl, 12: lvl, 13: f, 14: c1, 15: c2, 16: '2026-09-01', 18: '2024-0' + (1 + i % 9) + '-15', 19: '10kg', 20: '1m', 21: i % 13 === 0 ? 1 : 0, 22: i % 17 === 0 ? 1 : 0, 23: i % 7 === 0 ? 1 : 0, 24: 1000 });
  return cols.join(',');
});
fs.writeFileSync(path.join(__dirname, '..', 'fixtures', 'qa_roster.csv'), header + '\n' + rows.join('\n') + '\n');
console.log('wrote', rows.length, 'rows');
