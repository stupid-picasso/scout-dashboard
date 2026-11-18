// The push Worker's address lives in ONE place: PUSH_CONFIG() in "Scout Dashboard.dc.html" (empty until the owner deploys the Worker).
// build_index.js reads it here and adds exactly that origin to connect-src; test_push_config.js and test_csp.js use the same reader to check the
// built page. A value that is not a plain https origin is ignored (never turned into a wildcard or a path).
const fs = require('fs'), path = require('path');
const DC = path.join(__dirname, '..', 'Scout Dashboard.dc.html');

function readConfig(text) {
  const m = /PUSH_CONFIG\(\)\s*\{\s*return\s*\{\s*workerUrl:\s*'([^']*)'\s*,\s*vapidPublicKey:\s*'([^']*)'/.exec(text);
  return m ? { workerUrl: m[1], vapidPublicKey: m[2] } : null;
}
// -> 'https://host' for a usable URL, '' for empty, and null for a value that is set but unusable (the build must stop on it).
function workerOrigin(url) {
  if (!url) return '';
  if (!/^https:\/\/[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?(?::\d{1,5})?\/?$/.test(url) || /\.\./.test(url)) return null;
  return new URL(url).origin;
}
// The whole connect-src directive of the page's policy. The base list is what the app needs without the Worker.
const CONNECT_BASE = "connect-src 'self' blob: https://*.googleapis.com https://raw.githubusercontent.com https://api.github.com";
function connectSrc(workerUrl) {
  const o = workerOrigin(workerUrl);
  if (o === null) throw new Error('PUSH_CONFIG.workerUrl must be empty or a plain https origin such as https://professor-push.example.workers.dev');
  return CONNECT_BASE + (o ? ' ' + o : '');
}
function configured() { return readConfig(fs.readFileSync(DC, 'utf8')); }
module.exports = { readConfig, workerOrigin, connectSrc, configured, CONNECT_BASE, DC };
