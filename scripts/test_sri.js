#!/usr/bin/env node
// The Firebase SDK files are loaded with Subresource Integrity. Static check: every firebasejs URL in the app has a sha384 value and
// crossOrigin. Set SRI_VERIFY=1 to also download each file (through the configured proxy, TLS unchanged) and compare the hash.
const fs = require('fs'), path = require('path'), crypto = require('crypto'), https = require('https');
const src = fs.readFileSync(path.join(__dirname, '..', 'Scout Dashboard.dc.html'), 'utf8');
const pairs = [...src.matchAll(/\['(https:\/\/www\.gstatic\.com\/firebasejs\/[^']+)',\s*'(sha384-[A-Za-z0-9+/=]+)'\]/g)].map(m => [m[1], m[2]]);
let bad = 0; const fail = m => { bad++; console.log('FAIL ' + m); };
const urls = [...src.matchAll(/https:\/\/www\.gstatic\.com\/firebasejs\/[^'"\s]+\.js/g)].map(m => m[0]);
if (pairs.length !== 3 || new Set(urls).size !== pairs.length) fail('expected 3 firebasejs URLs, each with a sha384 value; found ' + pairs.length + ' pairs for ' + new Set(urls).size + ' URLs');
if (!/s\.integrity\s*=/.test(src) || !/s\.crossOrigin\s*=\s*'anonymous'/.test(src)) fail('loadFirebaseSdk does not set integrity and crossOrigin');
if (!pairs.every(([u]) => /\/firebasejs\/\d+\.\d+\.\d+\//.test(u))) fail('a URL is not pinned to an exact version');
const get = u => new Promise((res, rej) => https.get(u, r => { const c = []; r.on('data', d => c.push(d)); r.on('end', () => res(Buffer.concat(c))); }).on('error', rej));
(async () => {
  if (process.env.SRI_VERIFY === '1') for (const [u, h] of pairs) {
    const got = 'sha384-' + crypto.createHash('sha384').update(await get(u)).digest('base64');
    if (got !== h) fail('hash of ' + u + ' is ' + got + ', the app has ' + h);
  }
  console.log(bad ? bad + ' failed' : 'sri ok (' + pairs.length + ' files' + (process.env.SRI_VERIFY === '1' ? ', hashes verified against the network' : ', static check') + ')');
  process.exit(bad ? 1 : 0);
})();
