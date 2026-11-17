#!/usr/bin/env node
// Regression guard: the app source must not use the DOM/JS sinks that turn text into code or markup.
// All dynamic text is rendered through the template engine's text nodes; keep it that way.
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'Scout Dashboard.dc.html'), 'utf8');
const code = src.split('\n').map(l => l.replace(/^\s*\/\/.*$/, '')).join('\n');
const sinks = [['innerHTML', /\binnerHTML\b/], ['outerHTML', /\bouterHTML\b/], ['dangerouslySetInnerHTML', /dangerouslySetInnerHTML/], ['document.write', /document\.write(ln)?\s*\(/], ['eval(', /(^|[^\w.])eval\s*\(/], ['insertAdjacentHTML', /insertAdjacentHTML/], ['new Function', /new\s+Function\s*\(/], ['fetch to a user-set endpoint (dropped from the public build, see SECURITY.md)', /fetch\(\s*this\.state\.apiEndpoint/]];
let bad = 0;
sinks.forEach(([name, re]) => {
  code.split('\n').forEach((l, i) => { if (re.test(l)) { bad++; console.log('FAIL ' + name + ' at line ' + (i + 1) + ': ' + l.trim().slice(0, 120)); } });
});
console.log(bad ? bad + ' dangerous sink(s)' : 'no dangerous sinks (' + sinks.length + ' patterns checked)');
process.exit(bad ? 1 : 0);
