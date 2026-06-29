/* EMulator Studio — device presets + frame renderer (vanilla) */
(function (global) {
  'use strict';

  // css width/height = logical points. dpr = device pixel ratio.
  // notch: 'island' | 'notch' | 'punch' | 'home' | 'none'
  const DEVICES = [
    { id: 'iphone-15-pro',     os: 'ios',     name: 'iPhone 15 Pro',     w: 393,  h: 852,  dpr: 3,   radius: 55, notch: 'island', bezel: 14 },
    { id: 'iphone-15-pro-max', os: 'ios',     name: 'iPhone 15 Pro Max', w: 430,  h: 932,  dpr: 3,   radius: 58, notch: 'island', bezel: 14 },
    { id: 'iphone-se',         os: 'ios',     name: 'iPhone SE',         w: 375,  h: 667,  dpr: 2,   radius: 22, notch: 'home',   bezel: 16, chin: 64, top: 64 },
    { id: 'pixel-8',           os: 'android', name: 'Pixel 8',           w: 412,  h: 915,  dpr: 2.6, radius: 42, notch: 'punch',  bezel: 12 },
    { id: 'pixel-8-pro',       os: 'android', name: 'Pixel 8 Pro',       w: 448,  h: 998,  dpr: 3,   radius: 46, notch: 'punch',  bezel: 12 },
    { id: 'galaxy-fold',       os: 'android', name: 'Galaxy Fold (open)', w: 600,  h: 818,  dpr: 2.4, radius: 26, notch: 'punch',  bezel: 12, fold: true },
    { id: 'ipad-pro-11',       os: 'ios',     name: 'iPad Pro 11"',      w: 834,  h: 1194, dpr: 2,   radius: 30, notch: 'none',   bezel: 18 },
    { id: 'android-tablet',    os: 'android', name: 'Android Tablet',    w: 800,  h: 1280, dpr: 2,   radius: 24, notch: 'none',   bezel: 16 },
  ];

  function byId(id) { return DEVICES.find(d => d.id === id) || DEVICES[0]; }

  // Build the bezel + screen. Returns { root, iframe, screen, setScale }.
  function renderDevice(host, dev, opts) {
    opts = opts || {};
    const landscape = !!opts.landscape;
    const dark = !!opts.dark;          // status-bar tint
    const showStatus = opts.showStatus !== false;

    const W = landscape ? dev.h : dev.w;
    const H = landscape ? dev.w : dev.h;

    host.innerHTML = '';

    const root = document.createElement('div');
    root.className = 'dev-frame os-' + dev.os + (landscape ? ' landscape' : '');
    root.style.setProperty('--rad', dev.radius + 'px');
    root.style.setProperty('--bezel', dev.bezel + 'px');

    // screen container (logical px)
    const screen = document.createElement('div');
    screen.className = 'dev-screen';
    screen.style.width = W + 'px';
    screen.style.height = H + 'px';

    const iframe = document.createElement('iframe');
    iframe.className = 'dev-iframe';
    iframe.setAttribute('title', dev.name + ' screen');
    iframe.setAttribute('allow', 'accelerometer; camera; encrypted-media; geolocation; gyroscope; microphone; clipboard-read; clipboard-write; fullscreen');
    iframe.setAttribute('sandbox', 'allow-scripts allow-forms allow-popups allow-modals allow-same-origin allow-pointer-lock allow-downloads');
    screen.appendChild(iframe);

    // status bar overlay
    if (showStatus && dev.notch !== 'none') {
      screen.appendChild(buildStatusBar(dev, landscape, dark));
    }

    // notch / island / punch hole
    if (!landscape) {
      if (dev.notch === 'island') {
        const isl = document.createElement('div'); isl.className = 'dev-island'; screen.appendChild(isl);
      } else if (dev.notch === 'notch') {
        const n = document.createElement('div'); n.className = 'dev-notch'; screen.appendChild(n);
      } else if (dev.notch === 'punch') {
        const p = document.createElement('div'); p.className = 'dev-punch'; screen.appendChild(p);
      }
    }

    // home indicator (gesture bar) for modern devices
    if (dev.notch !== 'home' && dev.notch !== 'none') {
      const hb = document.createElement('div'); hb.className = 'dev-homebar'; screen.appendChild(hb);
    }
    if (dev.notch === 'home') {
      root.classList.add('frame-home');
      const btn = document.createElement('div'); btn.className = 'dev-homebtn'; root.appendChild(btn);
    }
    if (dev.fold) {
      const seam = document.createElement('div'); seam.className = 'dev-foldseam'; screen.appendChild(seam);
    }

    root.appendChild(screen);
    host.appendChild(root);

    // scaling: fit the bezel into host
    function setScale() {
      const pad = 40;
      const availW = host.clientWidth - pad;
      const availH = host.clientHeight - pad;
      const fw = root.offsetWidth, fh = root.offsetHeight;
      if (!fw || !fh) return 1;
      const s = Math.min(availW / fw, availH / fh, 1.4);
      root.style.transform = 'scale(' + s + ')';
      return s;
    }
    requestAnimationFrame(setScale);

    return { root, iframe, screen, setScale, W, H, dev, landscape };
  }

  function buildStatusBar(dev, landscape, dark) {
    const bar = document.createElement('div');
    bar.className = 'dev-statusbar ' + (dark ? 'sb-dark' : 'sb-light');
    const t = new Date();
    const hh = t.getHours(), mm = String(t.getMinutes()).padStart(2, '0');
    const time = dev.os === 'ios'
      ? ((hh % 12 || 12) + ':' + mm)
      : (String(hh).padStart(2, '0') + ':' + mm);
    const right = dev.os === 'ios'
      ? '<span class="sb-ic">􀙥</span><span class="sb-ic">􀙇</span><span class="sb-batt"></span>'
      : '<span class="sb-mob">5G</span><span class="sb-wifi"></span><span class="sb-batt"></span>';
    bar.innerHTML =
      '<div class="sb-time">' + time + '</div>' +
      '<div class="sb-right">' +
        (dev.os === 'ios'
          ? '<span class="sb-net">5G</span><span class="sb-wifi"></span><span class="sb-batt"></span>'
          : right) +
      '</div>';
    return bar;
  }

  global.EMU = global.EMU || {};
  global.EMU.devices = { list: DEVICES, byId, renderDevice };
})(window);
