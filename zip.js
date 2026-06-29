/* EMulator Studio — runner. Loads a URL, an uploaded web build, or an extracted
   hybrid bundle into the device iframe, with a console/error/network bridge. */
(function (global) {
  'use strict';
  const { zip } = global.EMU;

  /* ---- the bridge injected into content we control (same-origin blob docs) ---- */
  function bridgeSource() {
    return '(' + function () {
      function fmt(v) {
        try {
          if (v instanceof Error) return v.name + ': ' + v.message + (v.stack ? '\n' + v.stack : '');
          if (typeof v === 'object' && v !== null) return JSON.stringify(v, replacer(), 0).slice(0, 2000);
          return String(v);
        } catch (e) { return String(v); }
      }
      function replacer() { const seen = new WeakSet(); return function (k, val) { if (typeof val === 'object' && val !== null) { if (seen.has(val)) return '[Circular]'; seen.add(val); } if (typeof val === 'function') return '[Function]'; return val; }; }
      function send(type, payload) { try { parent.postMessage({ __emu: true, type: type, payload: payload, t: Date.now() }, '*'); } catch (e) {} }
      ['log', 'info', 'warn', 'error', 'debug'].forEach(function (m) {
        var orig = console[m] ? console[m].bind(console) : function () {};
        console[m] = function () { send('console', { level: m, text: [].slice.call(arguments).map(fmt).join(' ') }); return orig.apply(null, arguments); };
      });
      window.addEventListener('error', function (e) {
        if (e.message) send('console', { level: 'error', text: e.message + (e.filename ? ' (' + e.filename.split('/').pop() + ':' + e.lineno + ':' + e.colno + ')' : '') });
        else if (e.target && e.target.src) send('console', { level: 'error', text: 'Failed to load resource: ' + e.target.src });
      }, true);
      window.addEventListener('unhandledrejection', function (e) {
        var r = e.reason; send('console', { level: 'error', text: 'Unhandled promise rejection: ' + (r && r.message ? r.message : fmt(r)) });
      });
      var of = window.fetch;
      if (of) window.fetch = function (input, init) {
        var url = (input && input.url) || input; var method = (init && init.method) || (input && input.method) || 'GET'; var t0 = performance.now();
        return of.apply(this, arguments).then(function (res) { send('net', { url: String(url), method: method, status: res.status, ok: res.ok, ms: Math.round(performance.now() - t0) }); return res; },
          function (err) { send('net', { url: String(url), method: method, status: 0, ok: false, error: String(err), ms: Math.round(performance.now() - t0) }); throw err; });
      };
      var OX = window.XMLHttpRequest;
      if (OX) { var op = OX.prototype.open, os = OX.prototype.send; OX.prototype.open = function (m, u) { this.__emu = { m: m, u: u, t: performance.now() }; return op.apply(this, arguments); }; OX.prototype.send = function () { var x = this; this.addEventListener('loadend', function () { if (x.__emu) send('net', { url: String(x.__emu.u), method: x.__emu.m, status: x.status, ok: x.status >= 200 && x.status < 400, ms: Math.round(performance.now() - x.__emu.t) }); }); return os.apply(this, arguments); }; }
      send('ready', { url: location.href });
    }.toString() + ')();';
  }

  /* ---- run a remote URL (cross-origin → no capture) ---- */
  function runURL(iframe, url) {
    if (!/^https?:\/\//i.test(url) && !/^about:/.test(url)) url = 'https://' + url;
    iframe.removeAttribute('srcdoc');
    iframe.src = url;
    return { mode: 'url', url, canCapture: false };
  }

  /* ---- run a single HTML string ---- */
  function runHTMLString(iframe, html) {
    const doc = injectBridge(html);
    const blobUrl = URL.createObjectURL(new Blob([doc], { type: 'text/html' }));
    iframe.removeAttribute('srcdoc');
    iframe.src = blobUrl;
    return { mode: 'html', canCapture: true, blobUrl };
  }

  /* ---- run a multi-file web build (Map<path, Uint8Array>) ---- */
  async function runBundle(iframe, files, entry) {
    entry = entry || 'index.html';
    const norm = normalizeMap(files);
    if (!norm.has(entry)) {
      const alt = [...norm.keys()].find(k => k.endsWith('/index.html') || k === 'index.html' || k.endsWith('.html'));
      if (alt) entry = alt; else throw new Error('No HTML entry point found in build');
    }
    const blobCache = new Map();
    const mime = (p) => zip.mimeFor(p);

    function isText(p) { return /\.(css|js|mjs|html?|json|svg|map)$/i.test(p); }

    function blobFor(path) {
      if (blobCache.has(path)) return blobCache.get(path);
      const data = norm.get(path); if (data == null) return null;
      const url = URL.createObjectURL(new Blob([data], { type: mime(path) }));
      blobCache.set(path, url); return url;
    }

    // rewrite CSS first so HTML links point to fixed blobs
    const cssBlob = new Map();
    for (const [path, bytes] of norm) {
      if (!/\.css$/i.test(path)) continue;
      let txt = new TextDecoder().decode(bytes);
      txt = rewriteCSS(txt, path, norm, blobFor);
      cssBlob.set(path, URL.createObjectURL(new Blob([txt], { type: 'text/css' })));
    }
    function resolvedBlob(path) { return cssBlob.get(path) || blobFor(path); }

    const html = new TextDecoder().decode(norm.get(entry));
    const rewritten = rewriteHTML(html, entry, norm, resolvedBlob);
    const doc = injectBridge(rewritten);
    const entryUrl = URL.createObjectURL(new Blob([doc], { type: 'text/html' }));
    iframe.removeAttribute('srcdoc');
    iframe.src = entryUrl;
    return { mode: 'bundle', canCapture: true, entry, fileCount: norm.size };
  }

  async function bundleFromZip(z, webRoot) {
    const files = new Map();
    for (const e of z.entries) {
      if (e.dir || !e.name.startsWith(webRoot)) continue;
      const rel = e.name.slice(webRoot.length);
      if (!rel) continue;
      try { files.set(rel, await z.readFile(e.name)); } catch (err) {}
    }
    return files;
  }

  /* ---- helpers ---- */
  function normalizeMap(files) {
    // strip common top-level dir; keys without leading slash
    const keys = [...files.keys()].map(k => k.replace(/^\.?\//, ''));
    let prefix = '';
    if (keys.length && !keys.includes('index.html')) {
      const firstSeg = keys[0].split('/')[0] + '/';
      if (keys.every(k => k.startsWith(firstSeg))) prefix = firstSeg;
    }
    const out = new Map();
    for (const [k, v] of files) { out.set(k.replace(/^\.?\//, '').slice(prefix.length), v); }
    return out;
  }

  function dirOf(p) { const i = p.lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i + 1); }
  function resolvePath(ref, fromPath) {
    ref = ref.split('#')[0].split('?')[0];
    if (!ref || /^(https?:|data:|blob:|mailto:|tel:|#|javascript:)/i.test(ref)) return null;
    let base = ref.startsWith('/') ? '' : dirOf(fromPath);
    const parts = (base + ref.replace(/^\//, '')).split('/');
    const stack = [];
    for (const part of parts) { if (part === '.' || part === '') continue; if (part === '..') stack.pop(); else stack.push(part); }
    return stack.join('/');
  }

  function rewriteHTML(html, entry, map, blobFor) {
    // attributes: src, href, poster
    html = html.replace(/\b(src|href|poster)\s*=\s*("|')(.*?)\2/gi, (m, attr, q, val) => {
      const key = resolvePath(val, entry); if (key == null || !map.has(key)) return m;
      const b = blobFor(key); return b ? attr + '=' + q + b + q : m;
    });
    // srcset
    html = html.replace(/\bsrcset\s*=\s*("|')(.*?)\1/gi, (m, q, val) => {
      const out = val.split(',').map(part => { const [u, d] = part.trim().split(/\s+/); const key = resolvePath(u, entry); const b = key && map.has(key) ? blobFor(key) : null; return (b || u) + (d ? ' ' + d : ''); }).join(', ');
      return 'srcset=' + q + out + q;
    });
    // inline style url()
    html = html.replace(/url\((['"]?)(.*?)\1\)/gi, (m, q, val) => { const key = resolvePath(val, entry); const b = key && map.has(key) ? blobFor(key) : null; return b ? 'url(' + q + b + q + ')' : m; });
    return html;
  }

  function rewriteCSS(txt, fromPath, map, blobFor) {
    txt = txt.replace(/url\((['"]?)(.*?)\1\)/gi, (m, q, val) => { const key = resolvePath(val, fromPath); const b = key && map.has(key) ? blobFor(key) : null; return b ? 'url(' + q + b + q + ')' : m; });
    txt = txt.replace(/@import\s+(['"])(.*?)\1/gi, (m, q, val) => { const key = resolvePath(val, fromPath); const b = key && map.has(key) ? blobFor(key) : null; return b ? '@import ' + q + b + q : m; });
    return txt;
  }

  function injectBridge(html) {
    const tag = '<script>' + bridgeSource() + '<\/script>';
    if (/<head[^>]*>/i.test(html)) return html.replace(/<head([^>]*)>/i, '<head$1>' + tag);
    if (/<html[^>]*>/i.test(html)) return html.replace(/<html([^>]*)>/i, '<html$1><head>' + tag + '</head>');
    return tag + html;
  }

  function snippet() {
    return '<!-- Paste before </head> in your app so EMulator can capture logs from a live URL -->\n<script>' + bridgeSource() + '<\/script>';
  }

  global.EMU = global.EMU || {};
  global.EMU.runner = { runURL, runHTMLString, runBundle, bundleFromZip, snippet, bridgeSource };
})(window);
