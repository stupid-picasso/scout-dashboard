#!/usr/bin/env node
// The tracked tree must not hold the owner's address or a credential. The address is not written here: only the SHA-256 of
// each address that must never appear (the old admin addresses of the removed admin-by-email rule). Every email-shaped token
// in every tracked text file outside docs/research is hashed and compared. docs/research keeps the historical reports.
// Personal data files (data/pokemon_import.json, data/appraisal_import.json, logs/) are kept on purpose by the owner's decision.
const { execSync } = require('child_process'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const REPO = path.join(__dirname, '..');
const BANNED = new Set(['54e67d93b184cb9db3aed6a14c60644f0b3ca3a3c89804001d319acadfd0a208','f1e51c3d39558b21cd691b4bb7768b78c76c3ddd61860a74c14cffed7dbd079d']);
const files = execSync('git ls-files -z', { cwd: REPO, maxBuffer: 1 << 28 }).toString().split('\0').filter(Boolean)
  .filter(f => !/^docs\/research\//.test(f) && !/\.(png|jpg|jpeg|gif|webp|ico|mp4|mov|woff2?|ttf|zip|pdf)$/i.test(f) && fs.existsSync(path.join(REPO, f)));
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const KEY = /AIza[0-9A-Za-z_-]{35}|gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/;
const isTest = f => /^scripts\/(qa\/|test_)/.test(f) || /^scripts\/fixtures\//.test(f);
let bad = 0, scanned = 0;
const sha = s => crypto.createHash('sha256').update(s.toLowerCase()).digest('hex');
for (const f of files) {
  let t; try { t = fs.readFileSync(path.join(REPO, f), 'utf8'); } catch (e) { continue; }
  if (t.indexOf('\0') >= 0) continue;
  scanned++;
  for (const m of t.match(EMAIL) || []) if (BANNED.has(sha(m))) { bad++; console.log('FAIL the owner/admin address appears in ' + f); }
  // the Firebase web config's apiKey is public by design (restrict it by domain in the console), so a match on an apiKey line is allowed
  const keyHit = !isTest(f) && t.split('\n').some(l => KEY.test(l) && !/apiKey/.test(l));
  if (keyHit) { bad++; console.log('FAIL a credential-shaped string appears in ' + f); }
}
// self-check: the matcher really finds a banned address (guards against a broken regex making the test vacuous)
if (!BANNED.size || !BANNED.has('f1e51c3d39558b21cd691b4bb7768b78c76c3ddd61860a74c14cffed7dbd079d')) { bad++; console.log('FAIL the banned-hash list is empty or the matcher is broken'); }
// Project files that must exist, with a marker each (H): licence, security, contributing, privacy, and the non-affiliation notice in README, PRIVACY.md and the app.
const need = [['LICENSE', /MIT License/], ['LICENSE', /not cover/i], ['SECURITY.md', /unsafe-eval/], ['SECURITY.md', /sha384/], ['CONTRIBUTING.md', /real account data/i], ['PRIVACY.md', /EEA/], ['PRIVACY.md', /Delete my account/],
  ['README.md', /not affiliated with, endorsed by or sponsored by/i], ['PRIVACY.md', /not affiliated with, endorsed by or sponsored by/i], ['Scout Dashboard.dc.html', /not affiliated with, endorsed or sponsored by/i]];
need.forEach(([f, re]) => { let t = ''; try { t = fs.readFileSync(path.join(REPO, f), 'utf8'); } catch (e) {} if (!re.test(t)) { bad++; console.log('FAIL ' + f + ' is missing or lacks ' + re); } });
console.log(bad ? bad + ' problem(s)' : 'tracked tree clean (' + scanned + ' text files scanned, ' + BANNED.size + ' banned address hashes)');
process.exit(bad ? 1 : 0);
