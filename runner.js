/* EMulator Studio — package inspector. Detects APK vs IPA, extracts metadata,
   framework, ABIs, permissions, icon, and a runnable web bundle (Capacitor/Cordova/PWA-wrapped). */
(function (global) {
  'use strict';
  const { zip, axml, plist } = global.EMU;

  async function inspect(file) {
    const buf = await file.arrayBuffer();
    const z = await zip.readZip(buf);
    const lower = file.name.toLowerCase();
    let kind = 'unknown';
    if (lower.endsWith('.apk') || z.has('AndroidManifest.xml')) kind = 'apk';
    else if (lower.endsWith('.ipa') || z.find(/^Payload\/[^/]+\.app\//).length) kind = 'ipa';

    const base = {
      kind, fileName: file.name, fileSize: file.size,
      meta: {}, permissions: [], abis: [], frameworks: [],
      runnable: false, webRoot: null, webEntry: null, iconBlobUrl: null,
      summary: summarize(z), notes: [], zip: z,
    };

    if (kind === 'apk') return await inspectAPK(z, base);
    if (kind === 'ipa') return await inspectIPA(z, base);
    base.notes.push('Unrecognized package. Showing raw archive contents.');
    return base;
  }

  function summarize(z) {
    const dirs = {}; const types = {};
    for (const e of z.entries) {
      if (e.dir) continue;
      const top = e.name.split('/')[0];
      dirs[top] = (dirs[top] || 0) + e.uncompSize;
      const ext = (e.name.split('.').pop() || '').toLowerCase();
      types[ext] = (types[ext] || 0) + 1;
    }
    return {
      fileCount: z.entries.filter(e => !e.dir).length,
      totalUncompressed: z.totalUncompressed,
      topDirs: Object.entries(dirs).sort((a, b) => b[1] - a[1]).slice(0, 8),
      types: Object.entries(types).sort((a, b) => b[1] - a[1]).slice(0, 12),
    };
  }

  /* ---------------- APK ---------------- */
  async function inspectAPK(z, r) {
    // metadata from binary manifest
    try {
      const man = axml.parseAXML(await z.readFile('AndroidManifest.xml'));
      const root = man.find(e => e.name === 'manifest') || {};
      const a = (root.attrs) || {};
      r.meta.package = a.package || '—';
      r.meta.versionName = a.versionName || '—';
      r.meta.versionCode = a.versionCode || '—';
      const usesSdk = man.find(e => e.name === 'uses-sdk');
      if (usesSdk) {
        r.meta.minSdk = usesSdk.attrs.minSdkVersion || '—';
        r.meta.targetSdk = usesSdk.attrs.targetSdkVersion || '—';
      }
      r.permissions = man.filter(e => e.name === 'uses-permission')
        .map(e => (e.attrs.name || '').replace(/^android\.permission\./, '')).filter(Boolean);
      const app = man.find(e => e.name === 'application');
      r.meta.name = friendlyName(a.package);
      r._labelRef = app && app.attrs.label;
    } catch (e) {
      r.notes.push('Could not decode AndroidManifest.xml: ' + e.message);
    }

    // ABIs
    const abiSet = new Set();
    z.find(/^lib\/[^/]+\//).forEach(e => { const m = e.name.match(/^lib\/([^/]+)\//); if (m) abiSet.add(m[1]); });
    r.abis = [...abiSet];

    // framework detection
    const has = (re) => z.find(re).length > 0;
    if (has(/^lib\/[^/]+\/libflutter\.so$/)) r.frameworks.push('Flutter');
    if (has(/^assets\/index\.android\.bundle$/) || has(/libreactnativejni\.so$/) || has(/libhermes\.so$/)) r.frameworks.push('React Native');
    if (has(/^lib\/[^/]+\/libunity\.so$/) || has(/^assets\/bin\/Data\//)) r.frameworks.push('Unity');
    if (has(/^lib\/[^/]+\/libmonodroid\.so$/)) r.frameworks.push('.NET / Xamarin');

    // hybrid web bundle?
    const webRoot = ['assets/public/', 'assets/www/'].find(p => z.has(p + 'index.html'));
    if (webRoot) {
      r.runnable = true;
      r.webRoot = webRoot;
      r.webEntry = 'index.html';
      r.frameworks.push(z.has('assets/capacitor.config.json') || z.find(/capacitor/i).length ? 'Capacitor' : 'Cordova/Ionic');
      r.notes.push('Hybrid web app detected — runnable in the device frame.');
    } else if (!r.frameworks.length) {
      r.frameworks.push('Native (Java/Kotlin)');
    }
    if (!r.runnable) r.notes.push(nativeNote('Android'));

    await pickIconAPK(z, r);
    return r;
  }

  async function pickIconAPK(z, r) {
    // prefer high-density raster launcher icons
    const cands = z.find(/(mipmap|drawable)[^/]*\/.*(ic_launcher|launcher|icon|appicon)[^/]*\.(png|webp)$/i);
    const score = (n) => (/(xxxhdpi)/i.test(n) ? 5 : /(xxhdpi)/i.test(n) ? 4 : /(xhdpi)/i.test(n) ? 3 : /(hdpi)/i.test(n) ? 2 : 1) + (/round/i.test(n) ? 0.5 : 0);
    cands.sort((a, b) => score(b.name) - score(a.name));
    for (const c of cands) {
      try { r.iconBlobUrl = URL.createObjectURL(await z.readBlob(c.name, zip.mimeFor(c.name))); return; }
      catch (e) { /* try next */ }
    }
  }

  /* ---------------- IPA ---------------- */
  async function inspectIPA(z, r) {
    const appEntry = z.find(/^Payload\/[^/]+\.app\//)[0];
    const appDir = appEntry ? appEntry.name.match(/^(Payload\/[^/]+\.app\/)/)[1] : 'Payload/';
    r._appDir = appDir;
    try {
      const info = plist.parsePlist(await z.readFile(appDir + 'Info.plist'));
      r.meta.bundleId = info.CFBundleIdentifier || '—';
      r.meta.name = info.CFBundleDisplayName || info.CFBundleName || friendlyName(info.CFBundleIdentifier);
      r.meta.versionName = info.CFBundleShortVersionString || '—';
      r.meta.versionCode = info.CFBundleVersion || '—';
      r.meta.minOS = info.MinimumOSVersion || info['LSMinimumSystemVersion'] || '—';
      r.meta.platform = info.DTPlatformVersion ? ('iOS SDK ' + info.DTPlatformVersion) : '—';
      const fam = info.UIDeviceFamily;
      if (Array.isArray(fam)) r.meta.deviceFamily = fam.map(f => f === 1 ? 'iPhone' : f === 2 ? 'iPad' : 'Family ' + f).join(', ');
      // privacy usage strings = permissions
      r.permissions = Object.keys(info).filter(k => /UsageDescription$/.test(k))
        .map(k => k.replace(/^NS/, '').replace(/UsageDescription$/, ''));
      r._info = info;
    } catch (e) {
      r.notes.push('Could not read Info.plist: ' + e.message);
    }

    const has = (re) => z.find(re).length > 0;
    if (has(new RegExp('^' + escapeRe(appDir) + 'Frameworks/Flutter\\.framework'))) r.frameworks.push('Flutter');
    if (has(new RegExp('^' + escapeRe(appDir) + 'main\\.jsbundle$'))) r.frameworks.push('React Native');
    if (has(new RegExp('^' + escapeRe(appDir) + 'Data/Managed/'))) r.frameworks.push('Unity');

    const webRoot = [appDir + 'public/', appDir + 'www/'].find(p => z.has(p + 'index.html'));
    if (webRoot) {
      r.runnable = true; r.webRoot = webRoot; r.webEntry = 'index.html';
      r.frameworks.push('Capacitor / Cordova');
      r.notes.push('Hybrid web app detected — runnable in the device frame.');
    } else if (!r.frameworks.length) {
      r.frameworks.push('Native (Swift/Obj-C)');
    }
    if (!r.runnable) r.notes.push(nativeNote('iOS'));

    await pickIconIPA(z, r, appDir);
    return r;
  }

  async function pickIconIPA(z, r, appDir) {
    const cands = z.find(new RegExp('^' + escapeRe(appDir) + '[^/]*(AppIcon|Icon)[^/]*\\.png$', 'i'));
    const score = (n) => (/@3x/i.test(n) ? 4 : /@2x/i.test(n) ? 3 : 1) + (parseInt((n.match(/(\d{2,3})x\d/) || [])[1] || 0, 10) / 100);
    cands.sort((a, b) => score(b.name) - score(a.name));
    for (const c of cands) {
      try { r.iconBlobUrl = URL.createObjectURL(await z.readBlob(c.name, 'image/png')); return; }
      catch (e) {}
    }
  }

  function nativeNote(os) {
    return 'This is a compiled ' + os + ' binary. Browsers cannot execute native ' + os +
      ' code — running it needs ' + (os === 'iOS' ? 'a Mac + Xcode Simulator' : 'an Android emulator (AVD/QEMU)') +
      ' or a cloud device service (e.g. Appetize.io). Inspection + a framed web/PWA build are available here.';
  }

  function friendlyName(id) {
    if (!id) return 'App';
    const seg = id.split('.').pop();
    return seg ? seg.charAt(0).toUpperCase() + seg.slice(1) : id;
  }
  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  global.EMU = global.EMU || {};
  global.EMU.inspect = { inspect };
})(window);
