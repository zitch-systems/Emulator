/* EMulator Studio — application controller. Wires UI to the EMU modules. */
(function (global) {
  'use strict';
  const E = global.EMU;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];

  function el(tag, props, kids) {
    const n = document.createElement(tag);
    if (props) for (const k in props) {
      if (k === 'class') n.className = props[k];
      else if (k === 'html') n.innerHTML = props[k];
      else if (k === 'text') n.textContent = props[k];
      else if (k.startsWith('on') && typeof props[k] === 'function') n.addEventListener(k.slice(2).toLowerCase(), props[k]);
      else if (props[k] != null) n.setAttribute(k, props[k]);
    }
    (Array.isArray(kids) ? kids : kids != null ? [kids] : []).forEach(c => n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return n;
  }

  const state = {
    device: E.devices.byId('iphone-15-pro'),
    landscape: false,
    inspection: null,
    source: null,
    current: null,        // {type:'url'|'html'|'bundle', ...}
    handle: null,         // device render handle {iframe, screen,...}
    logs: [], network: [], screenshots: [],
    canCapture: false,
  };

  /* ---------------- init ---------------- */
  function init() {
    buildDeviceSelect();
    restoreTheme();
    bindTopBar();
    bindTabs();
    bindStage();
    bindReport();
    bindPush();
    bindHelp();
    window.addEventListener('message', onMessage);
    window.addEventListener('resize', () => state.handle && state.handle.setScale());
    renderStage();
    loadDemo();   // start populated
  }

  /* ---------------- device + stage ---------------- */
  function buildDeviceSelect() {
    const sel = $('#deviceSelect');
    E.devices.list.forEach(d => sel.appendChild(el('option', { value: d.id }, d.name)));
    sel.value = state.device.id;
    sel.addEventListener('change', () => { state.device = E.devices.byId(sel.value); renderStage(); reapply(); });
  }

  function renderStage() {
    const host = $('#stage');
    state.handle = E.devices.renderDevice(host, state.device, {
      landscape: state.landscape,
      dark: document.documentElement.classList.contains('dark'),
      showStatus: true,
    });
    updateScaleLabel();
  }
  function updateScaleLabel() {
    const s = state.handle ? state.handle.setScale() : 1;
    $('#scaleLabel').textContent = Math.round(s * 100) + '%';
    $('#dimLabel').textContent = state.handle ? (state.handle.W + '×' + state.handle.H) : '';
  }

  function reapply() {
    if (!state.current) return setPlaceholder(true);
    applyRun(state.current, /*keepLogs*/ true);
  }

  function bindStage() {
    $('#btnRotate').addEventListener('click', () => { state.landscape = !state.landscape; renderStage(); reapply(); });
    $('#btnReload').addEventListener('click', () => reapply());
    $('#btnShot').addEventListener('click', takeScreenshot);
    // drag & drop
    const app = $('#app');
    ['dragover', 'dragenter'].forEach(ev => app.addEventListener(ev, e => { e.preventDefault(); app.classList.add('dragging'); }));
    ['dragleave', 'drop'].forEach(ev => app.addEventListener(ev, e => { e.preventDefault(); if (ev === 'drop' || e.target === app) app.classList.remove('dragging'); }));
    app.addEventListener('drop', e => { const f = e.dataTransfer.files; if (f && f.length) handleFiles(f); });
  }

  function setPlaceholder(show, html) {
    let ph = $('#stagePlaceholder');
    if (!ph) { ph = el('div', { id: 'stagePlaceholder', class: 'stage-ph' }); $('#stageWrap').appendChild(ph); }
    ph.style.display = show ? 'flex' : 'none';
    if (html != null) ph.innerHTML = html;
  }

  /* ---------------- top bar ---------------- */
  function bindTopBar() {
    $('#btnLoad').addEventListener('click', () => { const u = $('#srcInput').value.trim(); if (u) loadURL(u); });
    $('#srcInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('#btnLoad').click(); });
    $('#btnOpenPkg').addEventListener('click', () => $('#fileInputPkg').click());
    $('#fileInputPkg').addEventListener('change', e => handleFiles(e.target.files));
    $('#btnOpenBuild').addEventListener('click', () => $('#fileInputDir').click());
    $('#fileInputDir').addEventListener('change', e => handleFiles(e.target.files));
    $('#btnDemo').addEventListener('click', loadDemo);
    $('#themeToggle').addEventListener('click', toggleTheme);
  }

  async function handleFiles(fileList) {
    const files = [...fileList];
    if (!files.length) return;
    try {
      if (files.length > 1 || files.some(f => f.webkitRelativePath)) return await loadBuild(files);
      const f = files[0]; const n = f.name.toLowerCase();
      if (n.endsWith('.apk') || n.endsWith('.ipa')) return await loadPackage(f);
      if (n.endsWith('.html') || n.endsWith('.htm')) return await loadSingleHTML(f);
      if (n.endsWith('.zip')) return await loadZipBuild(f);
      toast('Unsupported file — use .apk, .ipa, .html, a .zip web build, or open a build folder.');
    } catch (err) { toast('Error: ' + err.message); console.error(err); }
  }

  async function loadPackage(file) {
    busy(true, 'Inspecting ' + file.name + '…');
    try {
      const r = await E.inspect.inspect(file);
      state.inspection = r; state.source = file.name;
      renderInspect(r);
      if (r.runnable && r.zip && r.webRoot) {
        const files = await E.runner.bundleFromZip(r.zip, r.webRoot);
        applyRun({ type: 'bundle', files, entry: r.webEntry });
        switchTab('console');
      } else {
        state.current = null;
        applyRun(null);
        setPlaceholder(true, nativePlaceholder(r));
        switchTab('inspect');
      }
    } finally { busy(false); }
  }

  async function loadSingleHTML(file) {
    const text = await file.text();
    state.inspection = null; state.source = file.name; renderInspect(null);
    applyRun({ type: 'html', html: text }); switchTab('console');
  }

  async function loadBuild(files) {
    const map = new Map();
    files.forEach(f => map.set(f.webkitRelativePath || f.name, f));
    // read all to bytes
    const bytes = new Map();
    for (const [path, f] of map) bytes.set(path, new Uint8Array(await f.arrayBuffer()));
    state.inspection = null; state.source = (files[0].webkitRelativePath || files[0].name).split('/')[0] + '/'; renderInspect(null);
    applyRun({ type: 'bundle', files: bytes }); switchTab('console');
  }

  async function loadZipBuild(file) {
    const z = await E.zip.readZip(await file.arrayBuffer());
    const entry = z.find(/(^|\/)index\.html$/)[0];
    if (!entry) return toast('No index.html found in zip');
    const root = entry.name.replace(/index\.html$/, '');
    const files = await E.runner.bundleFromZip(z, root);
    state.inspection = null; state.source = file.name; renderInspect(null);
    applyRun({ type: 'bundle', files }); switchTab('console');
  }

  function loadURL(url) {
    state.inspection = null; state.source = url; renderInspect(null);
    $('#srcInput').value = url;
    applyRun({ type: 'url', url });
    switchTab('console');
  }

  function loadDemo() {
    state.inspection = E.demo.inspection; state.source = E.demo.inspection.fileName;
    renderInspect(state.inspection);
    applyRun({ type: 'html', html: E.demo.appHTML });
    switchTab('inspect');
  }

  /* ---------------- run ---------------- */
  function applyRun(current, keepLogs) {
    state.current = current;
    if (!keepLogs) { state.logs = []; state.network = []; renderConsole(); renderNetwork(); }
    if (!state.handle) renderStage();
    const iframe = state.handle.iframe;
    setPlaceholder(false);
    if (!current) { iframe.removeAttribute('src'); iframe.srcdoc = ''; state.canCapture = false; updateCaptureUI(); return; }
    let res;
    if (current.type === 'url') res = E.runner.runURL(iframe, current.url);
    else if (current.type === 'html') res = E.runner.runHTMLString(iframe, current.html);
    else if (current.type === 'bundle') { E.runner.runBundle(iframe, current.files, current.entry).then(r => { state.canCapture = r.canCapture; updateCaptureUI(); }); res = { canCapture: true }; }
    state.canCapture = res.canCapture; updateCaptureUI();
    if (current.type === 'url') {
      setPlaceholder(false);
      $('#srcWarn').style.display = '';
    } else { $('#srcWarn').style.display = 'none'; }
  }

  function updateCaptureUI() {
    $('#btnShot').disabled = !state.canCapture;
    $('#btnShot').title = state.canCapture ? 'Capture screenshot' : 'Screenshots need an uploaded build or bridged content (not a cross-origin URL)';
    $('#captureHint').style.display = state.canCapture ? 'none' : '';
  }

  /* ---------------- console / network ---------------- */
  function onMessage(e) {
    const d = e.data; if (!d || !d.__emu) return;
    if (d.type === 'console') addLog(d.payload.level, d.payload.text);
    else if (d.type === 'net') addNet(d.payload);
  }
  function addLog(level, text) {
    state.logs.push({ level, text, t: Date.now() });
    if (state.logs.length > 800) state.logs.shift();
    appendLogRow({ level, text }); updateCounts();
  }
  function addNet(n) { state.network.push(n); appendNetRow(n); updateCounts(); }

  function appendLogRow(l) {
    const list = $('#consoleList');
    list.appendChild(el('div', { class: 'log log-' + l.level }, [
      el('span', { class: 'log-lv' }, l.level),
      el('span', { class: 'log-tx' }, l.text),
    ]));
    list.scrollTop = list.scrollHeight;
  }
  function renderConsole() { $('#consoleList').innerHTML = ''; state.logs.forEach(appendLogRow); updateCounts(); }
  function appendNetRow(n) {
    const list = $('#netList');
    const cls = n.ok ? 'ok' : 'err';
    list.appendChild(el('div', { class: 'net net-' + cls }, [
      el('span', { class: 'net-m' }, n.method || 'GET'),
      el('span', { class: 'net-s' }, String(n.status || (n.ok ? 200 : 'ERR'))),
      el('span', { class: 'net-u', title: n.url }, shortUrl(n.url)),
      el('span', { class: 'net-t' }, (n.ms != null ? n.ms + 'ms' : '')),
    ]));
    list.scrollTop = list.scrollHeight;
  }
  function renderNetwork() { $('#netList').innerHTML = ''; state.network.forEach(appendNetRow); }
  function updateCounts() {
    const errs = state.logs.filter(l => l.level === 'error').length;
    const warns = state.logs.filter(l => l.level === 'warn').length;
    badge('#tabConsoleBadge', errs || warns ? (errs + warns) : 0, errs ? 'err' : 'warn');
    badge('#tabNetBadge', state.network.length, 'mut');
    $('#errCount').textContent = errs; $('#warnCount').textContent = warns; $('#logCount').textContent = state.logs.length;
  }
  function badge(sel, n, kind) { const b = $(sel); if (!b) return; b.textContent = n; b.style.display = n ? '' : 'none'; b.className = 'badge badge-' + (kind || 'mut'); }

  function bindTabs() {
    $$('#tabs .tab').forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));
    // console filters
    $$('#consoleFilters .chip').forEach(c => c.addEventListener('click', () => {
      c.classList.toggle('off'); const lv = c.dataset.lv; $('#consoleList').classList.toggle('hide-' + lv, c.classList.contains('off'));
    }));
    $('#btnClearConsole').addEventListener('click', () => { state.logs = []; renderConsole(); });
    $('#btnClearNet').addEventListener('click', () => { state.network = []; renderNetwork(); });
  }
  function switchTab(name) {
    $$('#tabs .tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    $$('.pane').forEach(p => p.classList.toggle('active', p.id === 'pane-' + name));
  }

  /* ---------------- inspect pane ---------------- */
  function renderInspect(r) {
    const host = $('#pane-inspect');
    host.innerHTML = '';
    if (!r) {
      host.appendChild(el('div', { class: 'empty' }, 'No package loaded. Open an .apk / .ipa to inspect metadata, or load a URL / web build to run it.'));
      return;
    }
    const m = r.meta;
    // header
    const head = el('div', { class: 'insp-head' });
    const icon = el('div', { class: 'insp-icon' });
    if (r.iconBlobUrl) icon.appendChild(el('img', { src: r.iconBlobUrl, alt: '' }));
    else icon.textContent = (m.name || 'A').slice(0, 1).toUpperCase();
    head.appendChild(icon);
    head.appendChild(el('div', {}, [
      el('div', { class: 'insp-name' }, m.name || r.fileName),
      el('div', { class: 'insp-sub' }, (r.kind.toUpperCase()) + ' · ' + E.zip.fmtBytes(r.fileSize)),
      el('div', { class: 'chips' }, [
        runBadge(r),
        ...(r.frameworks || []).map(f => el('span', { class: 'chip ckit' }, f)),
      ]),
    ]));
    host.appendChild(head);

    // metadata grid
    const rows = r.kind === 'apk'
      ? [['Package', m.package], ['Version', m.versionName + '  (' + m.versionCode + ')'], ['Min SDK', m.minSdk], ['Target SDK', m.targetSdk], ['ABIs', (r.abis || []).join(', ') || '—']]
      : [['Bundle ID', m.bundleId], ['Version', m.versionName + '  (' + m.versionCode + ')'], ['Min iOS', m.minOS], ['Devices', m.deviceFamily || '—'], ['Built with', m.platform || '—']];
    const grid = el('div', { class: 'kv' });
    rows.forEach(([k, v]) => { grid.appendChild(el('div', { class: 'k' }, k)); grid.appendChild(el('div', { class: 'v' }, String(v == null ? '—' : v))); });
    host.appendChild(grid);

    // permissions
    if (r.permissions && r.permissions.length) {
      host.appendChild(el('div', { class: 'insp-h' }, (r.kind === 'apk' ? 'Permissions' : 'Privacy usage') + ' · ' + r.permissions.length));
      host.appendChild(el('div', { class: 'chips' }, r.permissions.map(p => el('span', { class: 'chip cperm' }, p))));
    }

    // contents
    if (r.summary) {
      host.appendChild(el('div', { class: 'insp-h' }, 'Contents'));
      const s = r.summary;
      host.appendChild(el('div', { class: 'insp-sub2' }, s.fileCount + ' files · ' + E.zip.fmtBytes(s.totalUncompressed) + ' uncompressed'));
      const max = Math.max(...s.topDirs.map(d => d[1]), 1);
      const bars = el('div', { class: 'bars' });
      s.topDirs.forEach(([d, sz]) => bars.appendChild(el('div', { class: 'bar-row' }, [
        el('span', { class: 'bar-l' }, d), el('span', { class: 'bar-track' }, el('span', { class: 'bar-fill', style: 'width:' + (sz / max * 100) + '%' })), el('span', { class: 'bar-v' }, E.zip.fmtBytes(sz)),
      ])));
      host.appendChild(bars);
    }

    // notes
    if (r.notes && r.notes.length) {
      host.appendChild(el('div', { class: 'insp-h' }, 'Notes'));
      r.notes.forEach(n => host.appendChild(el('div', { class: 'note-line ' + (/cannot|native/i.test(n) ? 'warn' : '') }, n)));
    }
  }
  function runBadge(r) { return r.runnable ? el('span', { class: 'chip crun' }, '● Runnable') : el('span', { class: 'chip cnative' }, '○ Inspect-only'); }
  function nativePlaceholder(r) {
    return '<div class="ph-card"><div class="ph-ic">⛬</div><h3>Native ' + (r.kind === 'apk' ? 'Android' : 'iOS') + ' binary</h3>' +
      '<p>Browsers can’t execute compiled ' + (r.kind === 'apk' ? 'Android' : 'iOS') + ' code. Metadata is in the <b>Inspect</b> tab. To <i>run</i> it, frame a web/PWA build of the app (paste a URL above) or use a cloud device service.</p></div>';
  }

  /* ---------------- screenshot ---------------- */
  async function takeScreenshot() {
    if (!state.canCapture) return;
    busy(true, 'Capturing…');
    try {
      const shot = await E.shot.captureApp(state.handle.iframe, state.device.name);
      state.screenshots.push(shot);
      renderShots(); toast('Screenshot captured');
      $('#tabReportBadge') && badge('#tabReportBadge', state.screenshots.length, 'mut');
    } catch (err) { toast(err.message); }
    finally { busy(false); }
  }
  function renderShots() {
    const wrap = $('#shotStrip'); if (!wrap) return;
    wrap.innerHTML = '';
    state.screenshots.forEach((s, i) => {
      const fig = el('figure', { class: 'shot' }, [
        el('img', { src: s.dataUrl, alt: s.name, onclick: () => window.open(s.dataUrl) }),
        el('figcaption', {}, s.device || 'shot'),
        el('button', { class: 'shot-x', title: 'Remove', onclick: () => { state.screenshots.splice(i, 1); renderShots(); } }, '×'),
      ]);
      wrap.appendChild(fig);
    });
    $('#shotEmpty').style.display = state.screenshots.length ? 'none' : '';
  }

  /* ---------------- report ---------------- */
  function bindReport() {
    $('#btnBuildReport').addEventListener('click', buildReport);
    $('#btnDownloadMd').addEventListener('click', downloadMd);
    $('#btnDownloadZip').addEventListener('click', downloadZip);
    renderShots();
  }
  function reportSections() {
    return {
      meta: $('#rep-meta').checked, permissions: $('#rep-perms').checked, files: $('#rep-files').checked,
      consoleErrors: $('#rep-errors').checked, consoleAll: $('#rep-all').checked,
      network: $('#rep-net').checked, screenshots: $('#rep-shots').checked,
    };
  }
  function currentMd() { return E.report.buildMarkdown(state, reportSections()); }
  function buildReport() {
    const { md } = currentMd();
    $('#reportPreview').textContent = md;
    $('#reportPreview').style.display = '';
  }
  function downloadMd() { const { md } = currentMd(); E.report.downloadText('emulator-report.md', md); }
  async function downloadZip() {
    const { md, assets } = currentMd();
    const files = [{ name: 'report.md', data: new TextEncoder().encode(md) }];
    for (const a of assets) files.push({ name: a.path, data: await E.zipw.blobToU8(a.blob) });
    const blob = E.zipw.buildZip(files);
    E.report.triggerDownload('emulator-report.zip', blob);
  }

  /* ---------------- github push ---------------- */
  function bindPush() {
    const gh = E.github;
    $('#ghToken').value = gh.getToken();
    $('#ghRepo').value = gh.getRepo();
    $('#btnCheckToken').addEventListener('click', async () => {
      const t = $('#ghToken').value.trim(); gh.setToken(t);
      if (!t) return pushStatus('Enter a token first.', 'warn');
      pushStatus('Checking…');
      try { const u = await gh.getUser(t); pushStatus('✓ Authenticated as ' + u.login, 'ok'); }
      catch (e) { pushStatus('✗ ' + e.message, 'err'); }
    });
    $('#btnPush').addEventListener('click', pushToRepo);
    $('#ghToken').addEventListener('change', () => gh.setToken($('#ghToken').value.trim()));
    $('#ghRepo').addEventListener('change', () => gh.setRepo($('#ghRepo').value.trim()));
  }
  function pushStatus(msg, kind) { const e = $('#pushStatus'); e.textContent = msg; e.className = 'push-status ' + (kind || ''); }
  async function pushToRepo() {
    const gh = E.github;
    const token = $('#ghToken').value.trim(); gh.setToken(token);
    const repo = gh.parseRepo($('#ghRepo').value.trim()); gh.setRepo($('#ghRepo').value.trim());
    if (!token) return pushStatus('Enter a GitHub token.', 'warn');
    if (!repo) return pushStatus('Enter a repo as owner/name.', 'warn');
    const branch = $('#ghBranch').value.trim() || undefined;
    const dir = ($('#ghPath').value.trim() || 'emulator-reports').replace(/^\/|\/$/g, '');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const base = dir + '/' + stamp;
    const { md, assets } = currentMd();
    const files = [{ path: base + '/report.md', text: md }];
    assets.forEach(a => files.push({ path: base + '/' + a.path, blob: a.blob }));
    pushStatus('Pushing ' + files.length + ' file(s)…');
    try {
      const out = await gh.push({ token, owner: repo.owner, repo: repo.repo, branch, message: 'EMulator report ' + stamp, files, onProgress: (i, n, p) => pushStatus('Pushing ' + i + '/' + n + ' — ' + p) });
      const link = out.results[0] && out.results[0].url;
      pushStatus('✓ Pushed to ' + repo.owner + '/' + repo.repo + ' @' + out.branch, 'ok');
      if (link) { const a = $('#pushLink'); a.href = link.replace(/\/report\.md$/, ''); a.style.display = ''; a.textContent = 'View on GitHub →'; }
    } catch (e) { pushStatus('✗ ' + e.message, 'err'); }
  }

  /* ---------------- help ---------------- */
  function bindHelp() {
    $('#snippetBox').value = E.runner.snippet();
    $('#btnCopySnippet').addEventListener('click', () => { navigator.clipboard.writeText($('#snippetBox').value).then(() => toast('Snippet copied')); });
  }

  /* ---------------- theme + misc ---------------- */
  function restoreTheme() {
    let t = 'dark'; try { t = localStorage.getItem('emu.theme') || 'dark'; } catch (e) {}
    document.documentElement.classList.toggle('dark', t === 'dark');
    $('#themeToggle').textContent = t === 'dark' ? '☾' : '☀';
  }
  function toggleTheme() {
    const dark = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', dark);
    try { localStorage.setItem('emu.theme', dark ? 'dark' : 'light'); } catch (e) {}
    $('#themeToggle').textContent = dark ? '☾' : '☀';
    renderStage(); reapply();
  }

  function busy(on, msg) { const b = $('#busy'); b.style.display = on ? 'flex' : 'none'; if (msg) $('#busyMsg').textContent = msg; }
  let toastT;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); }
  function shortUrl(u) { try { const x = new URL(u); return x.pathname.length > 1 ? x.host + x.pathname : x.host; } catch (e) { return String(u).slice(0, 48); } }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(window);
