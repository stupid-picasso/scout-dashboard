/* Scout diagnostic log.
 * Ring buffer of structured events, mirrored to localStorage so it survives a
 * reload/crash, exportable as a text file that can be committed to the repo
 * (logs/) — the point is that a failed import can be diagnosed from evidence
 * instead of guesswork.
 * Classic script on purpose: it must be available before the dashboard mounts.
 */
(function () {
  var CAP = 1200;
  var LS_KEY = 'scout_log_v1';
  var buf = [];
  var t0 = Date.now();

  try {
    var prev = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
    if (Array.isArray(prev)) buf = prev.slice(-CAP);
  } catch (e) {}

  var flushTimer = null;
  function flush() {
    flushTimer = null;
    try { localStorage.setItem(LS_KEY, JSON.stringify(buf.slice(-CAP))); }
    catch (e) {
      // Quota: halve and retry once, then give up silently.
      buf = buf.slice(-Math.floor(CAP / 2));
      try { localStorage.setItem(LS_KEY, JSON.stringify(buf)); } catch (e2) {}
    }
  }
  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(flush, 400);
  }

  function short(v) {
    if (v == null) return v;
    if (typeof v === 'string') return v.length > 400 ? v.slice(0, 400) + '…(' + v.length + ')' : v;
    return v;
  }

  var ScoutLog = {
    // add('gemini', 'http 429', {model: …, key: 2})
    add: function (tag, msg, data) {
      var e = { t: new Date().toISOString(), ms: Date.now() - t0, tag: String(tag), msg: short(String(msg)) };
      if (data && typeof data === 'object') {
        e.d = {};
        for (var k in data) if (Object.prototype.hasOwnProperty.call(data, k)) e.d[k] = short(data[k]);
      }
      buf.push(e);
      if (buf.length > CAP) buf = buf.slice(-CAP);
      scheduleFlush();
      try { console.log('[Scout:' + e.tag + '] ' + e.msg, data || ''); } catch (e3) {}
      return e;
    },
    // Marks a new session/run so exported logs are readable.
    mark: function (label, data) {
      t0 = Date.now();
      return this.add('run', '=== ' + label + ' ===', data);
    },
    entries: function () { return buf.slice(); },
    count: function () { return buf.length; },
    clear: function () { buf = []; flush(); },
    header: function () {
      var n = (typeof navigator !== 'undefined' && navigator) || {};
      return [
        'scout-log v1',
        'exported: ' + new Date().toISOString(),
        'entries: ' + buf.length,
        'ua: ' + (n.userAgent || '?'),
        'platform: ' + (n.platform || '?'),
        'mem(GB): ' + (n.deviceMemory || '?'),
        'online: ' + (n.onLine === false ? 'no' : 'yes'),
        'screen: ' + (typeof screen !== 'undefined' ? screen.width + 'x' + screen.height + '@' + (window.devicePixelRatio || 1) : '?'),
        'build: ' + (window.SCOUT_BUILD || 'unknown'),
        ''
      ].join('\n');
    },
    text: function () {
      var lines = buf.map(function (e) {
        var s = String(e.ms / 1000).padStart(8, ' ') + 's  ' + e.tag.padEnd(9, ' ') + ' ' + e.msg;
        if (e.d) {
          var parts = [];
          for (var k in e.d) parts.push(k + '=' + (typeof e.d[k] === 'object' ? JSON.stringify(e.d[k]) : e.d[k]));
          if (parts.length) s += '   {' + parts.join(' ') + '}';
        }
        return s;
      });
      return this.header() + lines.join('\n') + '\n';
    },
    json: function () { return JSON.stringify({ exported: new Date().toISOString(), ua: (navigator || {}).userAgent, entries: buf }, null, 1); },
    filename: function (ext) {
      var d = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      return 'scout-log-' + d + '.' + (ext || 'txt');
    },
    download: function (ext) {
      var body = ext === 'json' ? this.json() : this.text();
      var blob = new Blob([body], { type: 'text/plain' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = this.filename(ext);
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { a.remove(); URL.revokeObjectURL(url); }, 1000);
      return a.download;
    },
    copy: async function () {
      var body = this.text();
      try { await navigator.clipboard.writeText(body); return true; }
      catch (e) { return false; }
    },
    // Share sheet is the only practical way to get a file off iOS Safari into
    // GitHub; falls back to download.
    share: async function () {
      var body = this.text();
      var name = this.filename('txt');
      try {
        if (navigator.canShare && navigator.share) {
          var file = new File([body], name, { type: 'text/plain' });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: name });
            return 'shared';
          }
        }
      } catch (e) {}
      this.download();
      return 'downloaded';
    }
  };

  window.ScoutLog = ScoutLog;

  window.addEventListener('error', function (ev) {
    ScoutLog.add('error', (ev.message || 'error'), { src: (ev.filename || '') + ':' + (ev.lineno || 0) });
  });
  window.addEventListener('unhandledrejection', function (ev) {
    var r = ev.reason;
    ScoutLog.add('error', 'unhandled rejection: ' + ((r && r.message) || String(r)));
  });
  ScoutLog.add('boot', 'page load', { url: location.href.slice(0, 120) });
})();
