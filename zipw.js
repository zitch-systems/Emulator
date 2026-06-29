/* EMulator Studio — screenshot capture (html2canvas if present; same-origin iframe content). */
(function (global) {
  'use strict';

  function hasH2C() { return typeof global.html2canvas === 'function'; }

  async function captureApp(iframe, deviceName) {
    if (!hasH2C()) throw new Error('Screenshot engine not loaded');
    let target = null, sameOrigin = false;
    try { target = iframe.contentDocument && iframe.contentDocument.documentElement; sameOrigin = !!(iframe.contentDocument && iframe.contentDocument.body); } catch (e) { sameOrigin = false; }
    if (!sameOrigin || !target) {
      throw new Error('Cannot capture a cross-origin URL (browser security). Screenshots work for uploaded builds and bridged content.');
    }
    const canvas = await global.html2canvas(target, {
      backgroundColor: getComputedStyle(iframe.contentDocument.body).backgroundColor || '#ffffff',
      useCORS: true, allowTaint: false, logging: false, scale: 2,
      width: target.clientWidth, height: target.clientHeight,
      windowWidth: target.clientWidth, windowHeight: target.clientHeight,
    });
    return canvasToShot(canvas, deviceName);
  }

  async function captureFrame(screenEl, deviceName) {
    if (!hasH2C()) throw new Error('Screenshot engine not loaded');
    const canvas = await global.html2canvas(screenEl, { backgroundColor: null, useCORS: true, scale: 2, logging: false });
    return canvasToShot(canvas, deviceName);
  }

  function canvasToShot(canvas, deviceName) {
    const dataUrl = canvas.toDataURL('image/png');
    return {
      id: 'shot_' + Date.now(),
      name: (deviceName || 'screen').replace(/\s+/g, '-').toLowerCase() + '-' + ts() + '.png',
      dataUrl, w: canvas.width, h: canvas.height, time: new Date().toISOString(), device: deviceName,
    };
  }

  function ts() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  }

  function dataUrlToBlob(dataUrl) {
    const [head, b64] = dataUrl.split(',');
    const mime = (head.match(/data:(.*?);/) || [])[1] || 'image/png';
    const bin = atob(b64); const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return new Blob([u8], { type: mime });
  }

  global.EMU = global.EMU || {};
  global.EMU.shot = { captureApp, captureFrame, dataUrlToBlob, hasH2C };
})(window);
