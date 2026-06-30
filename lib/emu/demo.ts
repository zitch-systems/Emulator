// Bundled demo: a Capacitor-style hybrid sample that exercises every panel
// (logs at each level, a thrown error, a successful + a failing fetch) so the
// studio is fully populated on first open. Port of emu/demo.js.

import type { AppInfo } from '@/lib/types';

export const DEMO_APP: AppInfo = {
  platform: 'android',
  name: 'Capacitor Demo',
  packageId: 'com.emulator.demo',
  version: '1.0.0',
  build: '1',
  minSdk: '23',
  targetSdk: '34',
  abis: ['arm64-v8a', 'armeabi-v7a'],
  permissions: ['INTERNET', 'CAMERA', 'ACCESS_FINE_LOCATION'],
  frameworks: ['Capacitor/Cordova'],
  runnable: true,
  hybridRoot: 'assets/public',
  sizeBytes: 8_412_000,
  fileType: 'APK',
  fileCount: 142,
  dirSizes: [
    { name: 'assets', bytes: 4_100_000 },
    { name: 'lib', bytes: 2_900_000 },
    { name: 'res', bytes: 980_000 },
    { name: 'classes.dex', bytes: 410_000 },
    { name: 'META-INF', bytes: 22_000 },
  ],
  notes: [
    'Hybrid web app detected — the web layer runs live in the device frame.',
    'Demo sample: console, network, errors and a screenshot are all capturable.',
  ],
};

export const DEMO_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>Capacitor Demo</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  body { margin:0; font-family: -apple-system, system-ui, "Segoe UI", Roboto, sans-serif; background:#0b1020; color:#e8ebef; }
  .bar { padding: env(safe-area-inset-top,16px) 16px 14px; background:linear-gradient(135deg,#0e8f6e,#0b7a5e); color:#fff; }
  .bar h1 { margin:0; font-size:19px; }
  .bar p { margin:4px 0 0; opacity:.85; font-size:12.5px; }
  main { padding:16px; display:flex; flex-direction:column; gap:12px; }
  .card { background:#13182b; border:1px solid #232a44; border-radius:14px; padding:14px; }
  .card h2 { margin:0 0 6px; font-size:13px; color:#9aa6c7; text-transform:uppercase; letter-spacing:.05em; }
  button { appearance:none; border:0; border-radius:10px; padding:11px 14px; font-size:14px; font-weight:600; color:#04221a; background:#34d399; width:100%; }
  button.alt { background:#1d2540; color:#e8ebef; }
  .row { display:flex; gap:8px; }
  .count { font-size:34px; font-weight:700; text-align:center; }
  small { color:#6b7796; }
</style>
</head>
<body>
  <div class="bar"><h1>Capacitor Demo</h1><p>EMulator Studio sample · tap to generate events</p></div>
  <main>
    <div class="card">
      <h2>Counter</h2>
      <div class="count" id="count">0</div>
      <div class="row">
        <button id="inc">Increment (logs)</button>
        <button class="alt" id="warn">Warn</button>
      </div>
    </div>
    <div class="card">
      <h2>Network</h2>
      <button class="alt" id="ok">GET /ok (200)</button>
      <div style="height:8px"></div>
      <button class="alt" id="fail">GET /missing (fails)</button>
      <p><small id="net">No requests yet.</small></p>
    </div>
    <div class="card">
      <h2>Errors</h2>
      <button class="alt" id="throw">Throw an error</button>
      <button class="alt" id="reject" style="margin-top:8px">Reject a promise</button>
    </div>
  </main>
  <script>
    var n = 0;
    var $ = function(id){ return document.getElementById(id); };
    console.info('Capacitor demo booted');
    $('inc').onclick = function(){ n++; $('count').textContent = n; console.log('counter incremented to', n); };
    $('warn').onclick = function(){ console.warn('This is a sample warning at count', n); };
    $('ok').onclick = function(){
      $('net').textContent = 'Loading…';
      fetch('https://jsonplaceholder.typicode.com/todos/1')
        .then(function(r){ return r.json(); })
        .then(function(d){ $('net').textContent = 'OK: ' + JSON.stringify(d).slice(0,60) + '…'; })
        .catch(function(e){ $('net').textContent = 'Error: ' + e; });
    };
    $('fail').onclick = function(){
      $('net').textContent = 'Loading…';
      fetch('https://jsonplaceholder.typicode.com/this-endpoint-does-not-exist-xyz')
        .then(function(r){ $('net').textContent = 'HTTP ' + r.status; })
        .catch(function(e){ $('net').textContent = 'Network error: ' + e; });
    };
    $('throw').onclick = function(){ throw new Error('Sample uncaught error from the demo button'); };
    $('reject').onclick = function(){ Promise.reject(new Error('Sample unhandled promise rejection')); };
  </script>
</body>
</html>`;
