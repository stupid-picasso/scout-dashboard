#!/usr/bin/env node
// Static checks on firestore.rules against what the app can write. No emulator, no network, no Firebase project involved.
// The behavioural twin of this test is the in-memory stand-in in scripts/qa/qa_lib.js, which reads the same allow-list.
const fs = require('fs'), path = require('path');
const REPO = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8');
const rulesRaw = read('firestore.rules');
const rules = rulesRaw.replace(/\/\/.*$/gm, '');      // comments may mention anything
const app = read('Scout Dashboard.dc.html');
let failed = 0, passed = 0;
const check = (name, ok, detail) => { if (ok) passed++; else { failed++; console.log('FAIL ' + name + (detail ? ': ' + detail : '')); } };

const listOf = (src, name) => { const m = src.match(new RegExp('function ' + name + '\\(\\)\\s*\\{([\\s\\S]*?)\\}')); return m ? (m[1].match(/'([^']+)'/g) || []).map(x => x.slice(1, -1)) : null; };
const allowed = listOf(rules, 'allowedKeysList'), scrub = listOf(rules, 'scrubKeysList');
check('allowedKeysList is present and has entries', allowed && allowed.length > 30, String(allowed && allowed.length));
check('scrubKeysList is present', scrub && scrub.length === 4);

// What the app can write -------------------------------------------------------------------------------------------------------
const method = (src, head) => { const i = src.indexOf(head); if (i < 0) return ''; const j = src.indexOf('\n  }\n', i); return src.slice(i, j); };
const getter = (name) => { const t = method(app, '  get ' + name + '() {'); return (t.match(/'([^']+)'/g) || []).map(x => x.slice(1, -1)); };
const blobSrc = method(app, '  buildCloudBlob() {');
const rawObj = blobSrc.slice(blobSrc.indexOf('const raw = {'), blobSrc.indexOf('const out = {}')).replace(/\/\/.*$/gm, '');
const rawKeys = [...new Set([...rawObj.matchAll(/(?:^|[\s,{])([A-Za-z_]\w*)\s*:/gm)].map(m => m[1]).filter(k => k !== 'raw'))];
const packed = getter('PACKED_KEYS'), meta = getter('CLOUD_META_KEYS'), excluded = getter('RESTORE_EXCLUDED_KEYS');
check('found the blob keys in the app source', rawKeys.length >= 30 && rawKeys.indexOf('roster') >= 0 && rawKeys.indexOf('updatedAt') >= 0, rawKeys.length + ' keys');
check('found PACKED_KEYS, CLOUD_META_KEYS, RESTORE_EXCLUDED_KEYS', packed.length >= 15 && meta.length >= 2 && excluded.length === 4, [packed.length, meta.length, excluded.length].join('/'));

const writes = new Set();
rawKeys.forEach(k => writes.add(packed.indexOf(k) >= 0 ? k + 'Json' : k));
writes.add('packedVersion'); meta.forEach(k => writes.add(k));
packed.forEach(k => writes.add(k));                  // pushCloud deletes the plain legacy key of every packed collection
const missing = [...writes].filter(k => allowed && allowed.indexOf(k) < 0);
check('every key the client can write is in allowedKeysList', missing.length === 0, 'missing: ' + missing.join(', '));
check('no secret is allowed to be written', allowed && excluded.every(k => allowed.indexOf(k) < 0 && rawKeys.indexOf(k) < 0), 'a secret key is in the allow-list or the blob');
check('every secret field is in scrubKeysList (delete only)', excluded.every(k => scrub && scrub.indexOf(k) >= 0));
check('the allow-list has no stale entries (all are written, legacy or bookkeeping)', allowed && allowed.every(k => writes.has(k)), 'unused: ' + (allowed || []).filter(k => !writes.has(k)).join(', '));
check('buildCloudBlob does not mention a secret field', !/githubToken|geminiKey|apiEndpoint/.test(blobSrc.replace(/\/\/.*$/gm, '')), 'a secret field is referenced in buildCloudBlob');

// Shape of the rules ----------------------------------------------------------------------------------------------------------
check('no admin by email (token.email in ...)', !/token\.email\s+in\b/.test(rules) && !/admin@/i.test(rulesRaw) && !/@gmail\.com/i.test(rulesRaw));
check('catch-all deny', /match \/\{document=\*\*\}\s*\{\s*allow read, write:\s*if false;\s*\}/.test(rules));
check('gameData is read-only', /match \/gameData\/\{doc\}\s*\{\s*allow read:\s*if signedIn\(\);\s*allow write:\s*if false;\s*\}/.test(rules));
check('sprites is read-only', /match \/sprites\/\{doc\}\s*\{\s*allow read:\s*if signedIn\(\);\s*allow write:\s*if false;\s*\}/.test(rules));
check('no rule allows anything unconditionally', !/allow [a-z, ]+:\s*if true/.test(rules));
check('scoutUsers is owner-only', /match \/scoutUsers\/\{uid\}[\s\S]*allow get:\s*if isOwner\(uid\)/.test(rules) && !/allow (read|list)[^;]*:\s*if signedIn\(\)[^;]*;\s*\n\s*allow (create|get)/.test(rules.split('match /gameData')[0]));
check('user document create/update use the key allow-list', /allow create:[^;]*createKeysOk\(\)/.test(rules) && /allow update:[^;]*updateKeysOk\(\)/.test(rules));
check('update checks only the changed keys (diff().affectedKeys())', /diff\(resource\.data\)\.affectedKeys\(\)\.hasOnly\(/.test(rules));
check('scrub keys may be deleted, never written or changed (scrubOk for all four)', /&& scrubOk\(\)/.test(rules) && scrub.every(k => new RegExp("'" + k + "' in request\\.resource\\.data").test(rules)));
check('updatedAt must be the server time', /updatedAt\s*==\s*request\.time/.test(rules));
check('writes need a verified identity (function, google.com / github.com)', /function verifiedIdentity\(\)/.test(rules) && /google\.com/.test(rules) && /github\.com/.test(rules) && (rules.match(/verifiedIdentity\(\)/g) || []).length >= 4);
check('snapshots: id pattern, key allow-list, no update', /match \/snapshots\/\{id\}/.test(rules) && /id\.matches\('\[0-9\]\{13\}'\)/.test(rules) && /hasOnly\(\['reason','createdAt','pokemonCount','data'\]\)/.test(rules) && /allow update:\s*if false/.test(rules));
check('verifiedIdentity reads email_verified with a default (a missing claim is false, not an error)', /function verifiedIdentity\(\)\s*\{[^}]*token\.get\('email_verified',\s*false\)/.test(rules) && !/token\.email_verified/.test(rules));
check('update rule calls stampOk() (not only defines it)', /allow update:[^;]*&&\s*stampOk\(\)/.test(rules));
check('update rule calls updateKeysOk() and verifiedIdentity()', /allow update:[^;]*verifiedIdentity\(\)[^;]*updateKeysOk\(\)/.test(rules));
check('create rule requires the server time', /allow create:[^;]*updatedAt\s*==\s*request\.time/.test(rules));
check('updateKeysOk calls scrubOk()', /function updateKeysOk\(\)\s*\{[^}]*scrubOk\(\)/.test(rules));
const dep = read('DEPLOY.md');
const depLines = dep.split('\n');
check('DEPLOY.md opens with the unverified-accounts banner', /^>/.test(depLines[2] || '') && /unverified/i.test(depLines.slice(0, 8).join(' ')) && /read-only/i.test(depLines.slice(0, 8).join(' ')));
check('DEPLOY.md: Playground checks come before Publish', (() => { const pg = dep.search(/Playground/); const pub = dep.search(/\*\*Publish\.\*\*/); return pg > 0 && pub > pg && /BEFORE you publish/.test(dep); })());
check('DEPLOY.md: the evil:1 check names provider google.com and updatedAt = request time, and a positive check exists', /evil: 1[\s\S]{0,200}updatedAt/.test(dep) && /google\.com/.test(dep) && /allowed\*\*/.test(dep));
check('DEPLOY.md does not claim the new client works under the old rules unconditionally', !/the new client works under the old rules too\./.test(dep));
check('rules_version 2', /rules_version\s*=\s*'2'/.test(rules));
const fj = JSON.parse(read('firebase.json'));
check('firebase.json points at firestore.rules', fj.firestore && fj.firestore.rules === 'firestore.rules');
check('DEPLOY.md exists and starts with the client-first rule', fs.existsSync(path.join(REPO, 'DEPLOY.md')) && /client first/i.test(read('DEPLOY.md')));
check('the app has no admin-by-email left', !/ADMIN_EMAILS|migrateStatsAndSprites|refreshCloudGameData|checkMigrationStatus|loadMechanicsFromCloud/.test(app));
check('the app does not read gameData or sprites from Firestore', !/collection\('(gameData|sprites)'\)/.test(app));

console.log((failed ? failed + ' failed, ' : '0 failed, ') + passed + ' passed');
process.exit(failed ? 1 : 0);
