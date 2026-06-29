/* EMulator Studio — demo payload so the studio is populated without a real upload. */
(function (global) {
  'use strict';

  const inspection = {
    kind: 'apk', fileName: 'aurora-notes-2.4.0.apk', fileSize: 18_944_512,
    meta: { name: 'Aurora Notes', package: 'com.zitch.aurora', versionName: '2.4.0', versionCode: '240', minSdk: '24', targetSdk: '34' },
    permissions: ['INTERNET', 'CAMERA', 'ACCESS_FINE_LOCATION', 'POST_NOTIFICATIONS', 'RECORD_AUDIO', 'READ_MEDIA_IMAGES'],
    abis: ['arm64-v8a', 'armeabi-v7a', 'x86_64'],
    frameworks: ['Capacitor'],
    runnable: true, webRoot: null, webEntry: 'index.html', iconBlobUrl: null,
    summary: {
      fileCount: 412, totalUncompressed: 41_287_004,
      topDirs: [['assets', 22_118_400], ['lib', 9_842_000], ['res', 5_204_880], ['classes.dex', 3_120_000], ['META-INF', 1_001_724]],
      types: [['png', 96], ['js', 14], ['so', 6], ['xml', 120], ['json', 8]],
    },
    notes: ['Hybrid web app detected — runnable in the device frame.', 'Demo data — load a real .apk/.ipa or a URL to replace it.'],
  };

  const appHTML = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Aurora Notes</title>
<style>
  :root{--ink:#15171c;--bg:#fbfbfd;--card:#fff;--line:#e9e9ee;--accent:#2f6df4;--muted:#7a7f8c}
  *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
  body{margin:0;font:15px/1.5 -apple-system,system-ui,"Segoe UI",Roboto,sans-serif;background:var(--bg);color:var(--ink);padding-top:env(safe-area-inset-top)}
  header{position:sticky;top:0;background:rgba(251,251,253,.86);backdrop-filter:blur(12px);padding:54px 18px 12px;border-bottom:1px solid var(--line)}
  h1{margin:0;font-size:26px;font-weight:680;letter-spacing:-.02em}
  .sub{color:var(--muted);font-size:13px;margin-top:2px}
  main{padding:14px 16px 96px}
  .note{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:14px 16px;margin-bottom:12px;box-shadow:0 1px 2px rgba(20,20,40,.04)}
  .note h3{margin:0 0 4px;font-size:16px;font-weight:620}
  .note p{margin:0;color:#525663;font-size:14px}
  .tag{display:inline-block;font-size:11px;font-weight:600;color:var(--accent);background:#eaf1fe;padding:3px 9px;border-radius:999px;margin-top:8px}
  .fab{position:fixed;right:18px;bottom:calc(22px + env(safe-area-inset-bottom));width:56px;height:56px;border-radius:50%;border:none;background:var(--accent);color:#fff;font-size:28px;box-shadow:0 8px 22px rgba(47,109,244,.4);display:grid;place-items:center}
  .bar{position:fixed;left:0;right:0;bottom:0;display:flex;justify-content:space-around;padding:10px 0 calc(8px + env(safe-area-inset-bottom));background:rgba(255,255,255,.92);backdrop-filter:blur(12px);border-top:1px solid var(--line)}
  .bar button{border:none;background:none;color:var(--muted);font-size:11px;display:grid;justify-items:center;gap:3px}
  .bar .ic{font-size:20px}
  .bar .on{color:var(--accent)}
</style></head>
<body>
  <header><h1>Aurora Notes</h1><div class="sub">3 notes · synced just now</div></header>
  <main id="list">
    <div class="note"><h3>Design review prep</h3><p>Pull the latest emulator frames, check Pixel + iPhone safe areas.</p><span class="tag">work</span></div>
    <div class="note"><h3>Groceries</h3><p>Oat milk, espresso, sourdough, blueberries.</p><span class="tag">home</span></div>
    <div class="note"><h3>Reading list</h3><p>Three articles on hybrid app testing pipelines.</p><span class="tag">later</span></div>
  </main>
  <button class="fab" id="add" aria-label="Add note">+</button>
  <nav class="bar">
    <button class="on"><span class="ic">􀎞</span>Notes</button>
    <button id="syncBtn"><span class="ic">􀊃</span>Sync</button>
    <button><span class="ic">􀉪</span>Profile</button>
  </nav>
<script>
  console.info('Aurora Notes booted', { build: '2.4.0', platform: 'capacitor' });
  var n = 4;
  document.getElementById('add').addEventListener('click', function(){
    var d = document.createElement('div'); d.className='note';
    d.innerHTML = '<h3>New note '+(n++)+'</h3><p>Tapped the + button at '+ new Date().toLocaleTimeString() +'.</p><span class="tag">draft</span>';
    document.getElementById('list').prepend(d);
    console.log('Note created, total now', n-1);
  });
  document.getElementById('syncBtn').addEventListener('click', function(){
    console.log('Sync requested…');
    fetch('https://api.zitch.dev/sync').then(function(r){ return r.json(); })
      .then(function(d){ console.log('Synced', d); })
      .catch(function(e){ console.warn('Sync endpoint unreachable (demo) — working offline'); });
  });
  setTimeout(function(){ console.warn('Location permission not yet granted'); }, 1200);
  setTimeout(function(){ try { undefinedFn(); } catch(e){ /* silent */ } }, 1800);
<\/script>
</body></html>`;

  global.EMU = global.EMU || {};
  global.EMU.demo = { inspection, appHTML };
})(window);
