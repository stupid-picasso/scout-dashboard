// Shared support for the node tests and the QA harness: an assertion counter, the vm loader for pokemon-mechanics.js, and the
// static file server the browser tests use. CommonJS so both the .js and .mjs tests can load it.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const http = require('http');
const zlib = require('zlib');

const REPO = path.join(__dirname, '..', '..');

// One counter per test file. eq() compares by JSON, ok() takes a boolean and an optional detail; both print a FAIL line and
// count it. exit() prints the summary line the caller passes and sets the exit code from the failure count.
function checker() {
  const t = {
    pass: 0, fail: 0,
    get n() { return t.pass + t.fail; },
    eq(name, got, want) {
      const a = JSON.stringify(got), b = JSON.stringify(want);
      if (a === b) { t.pass++; return true; }
      t.fail++; console.log('FAIL', name, '\n  got ', a, '\n  want', b); return false;
    },
    ok(name, cond, detail) {
      if (cond) { t.pass++; return true; }
      t.fail++; console.log('FAIL ' + name + (detail === undefined ? '' : ': ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)))); return false;
    },
    exit(summary) { console.log(summary || (t.fail ? t.fail + ' of ' + t.n + ' checks failed' : 'ok: ' + t.n + ' checks passed')); process.exit(t.fail ? 1 : 0); }
  };
  return t;
}

// pokemon-mechanics.js run in a vm context with the window stub it expects. Returns { m, ctx }: m is window.PokemonMechanics,
// ctx lets a test read top-level bindings (runInContext('CPM', ctx)).
function loadMechanicsContext() {
  const code = fs.readFileSync(path.join(REPO, 'pokemon-mechanics.js'), 'utf8');
  const ctx = { window: { dispatchEvent: () => {} }, Event: function () {}, console };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  if (!ctx.window.PokemonMechanics) throw new Error('pokemon-mechanics.js did not export window.PokemonMechanics, cannot test');
  return { m: ctx.window.PokemonMechanics, ctx };
}
const loadMechanics = () => loadMechanicsContext().m;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.mjs': 'application/javascript', '.json': 'application/json', '.css': 'text/css',
  '.csv': 'text/csv', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json'
};

// Static server over the repo root. Returns a promise of the listening http.Server.
//   host     the interface and the name the page is loaded from (default 127.0.0.1)
//   noStore  send cache-control: no-store
//   gzip     gzip text responses when the client accepts it, as GitHub Pages does
// A path outside the repo, under node_modules or .git, or a directory is a 404.
function serveRepo({ host = '127.0.0.1', noStore = false, gzip = false } = {}) {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
      const f = path.join(REPO, p);
      if (!f.startsWith(REPO + path.sep) || /[\\/](node_modules|\.git)[\\/]/.test(f) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rsp.writeHead(404); return rsp.end('not found'); }
      const type = MIME[path.extname(f)] || 'application/octet-stream';
      const gz = gzip && /^(text\/|application\/(javascript|json))/.test(type) && /\bgzip\b/.test(req.headers['accept-encoding'] || '');
      rsp.writeHead(200, { 'content-type': type, ...(noStore ? { 'cache-control': 'no-store' } : {}), ...(gz ? { 'content-encoding': 'gzip', vary: 'accept-encoding' } : {}) });
      if (gz) fs.createReadStream(f).pipe(zlib.createGzip({ level: 6 })).pipe(rsp); else fs.createReadStream(f).pipe(rsp);
    }).listen(0, host, () => res(srv));
  });
}

// The persistence schema of the app and every list derived from it, evaluated from the source of Scout Dashboard.dc.html (the lists
// are views over SYNC_SCHEMA, so their text no longer holds the keys). Returns an object with the schema, the lists, dataFields()
// and schemaDefaults(); set .state on it before calling anything that reads state.
function appSchema(src) {
  const body = head => {
    const i = src.indexOf(head);
    if (i < 0) throw new Error('not found in the app source: ' + head.trim());
    let d = 0, j = src.indexOf('{', i); const start = j;
    for (; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}' && --d === 0) break; }
    return src.slice(start + 1, j);
  };
  const ctx = { state: {} };
  ['SYNC_SCHEMA', 'SYNCED_STATE_KEYS', 'RESTORE_EXCLUDED_KEYS', 'CLOUD_META_KEYS', 'PACKED_KEYS', 'SECRET_CLOUD_FIELDS'].forEach(n => {
    const f = new Function(body('  get ' + n + '() {'));
    Object.defineProperty(ctx, n, { get() { return f.call(ctx); } });
  });
  [['dataFields', ''], ['SYNC_KEYS', ''], ['schemaDefaults', 'keepStay']].forEach(([n, a]) => { ctx[n] = new Function(a, body('  ' + n + '(' + a + ') {')).bind(ctx); });
  return ctx;
}

module.exports = { REPO, checker, loadMechanics, loadMechanicsContext, serveRepo, appSchema, MIME };
