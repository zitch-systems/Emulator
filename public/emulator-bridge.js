/*
 * EMulator Studio bridge (standalone).
 * Drop this into your PWA to stream console + network + errors into the studio
 * even for cross-origin URLs:
 *   <script src="https://your-studio/emulator-bridge.js"></script>
 * Mirrors lib/emu/bridge.ts BRIDGE_SNIPPET.
 */
(function () {
  if (window.__emuBridgeInstalled) return;
  window.__emuBridgeInstalled = true;
  var send = function (kind, payload) {
    try {
      parent.postMessage({ __emu: 1, kind: kind, payload: payload }, '*');
    } catch (e) {}
  };
  var ser = function (a) {
    return Array.prototype.map
      .call(a, function (x) {
        try {
          if (x instanceof Error) return x.stack || x.name + ': ' + x.message;
          if (typeof x === 'object') return JSON.stringify(x);
          return String(x);
        } catch (e) {
          return String(x);
        }
      })
      .join(' ');
  };
  ['log', 'info', 'warn', 'error', 'debug'].forEach(function (level) {
    var orig = console[level];
    console[level] = function () {
      send('log', {
        level: level === 'debug' ? 'log' : level,
        message: ser(arguments),
        ts: Date.now(),
        origin: 'console',
      });
      if (orig) orig.apply(console, arguments);
    };
  });
  window.addEventListener('error', function (e) {
    send('log', {
      level: 'error',
      message: (e.message || 'Error') + (e.filename ? ' (' + e.filename + ':' + e.lineno + ')' : ''),
      ts: Date.now(),
      origin: 'window.error',
      stack: e.error && e.error.stack,
    });
  });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    var msg = (r && (r.stack || r.message)) || String(r);
    send('log', { level: 'error', message: 'Unhandled rejection: ' + msg, ts: Date.now(), origin: 'unhandledrejection' });
  });
  var of = window.fetch;
  if (of) {
    window.fetch = function () {
      var args = arguments;
      var url = (args[0] && args[0].url) || String(args[0]);
      var method = (args[1] && args[1].method) || 'GET';
      var t0 = Date.now();
      return of
        .apply(this, args)
        .then(function (res) {
          send('net', { method: method, url: url, status: res.status, ms: Date.now() - t0, ts: t0, ok: res.ok });
          return res;
        })
        .catch(function (err) {
          send('net', { method: method, url: url, status: 0, ms: Date.now() - t0, ts: t0, ok: false, error: String(err) });
          throw err;
        });
    };
  }
  send('log', { level: 'info', message: 'EMulator bridge connected', ts: Date.now(), origin: 'bridge' });
})();
