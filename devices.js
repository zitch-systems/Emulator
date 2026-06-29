/* EMulator Studio — Apple plist decoder. Handles binary (bplist00) and XML plists. */
(function (global) {
  'use strict';

  function parsePlist(u8) {
    // detect bplist magic
    const magic = String.fromCharCode(u8[0], u8[1], u8[2], u8[3], u8[4], u8[5]);
    if (magic === 'bplist') return parseBinary(u8);
    const text = new TextDecoder('utf-8').decode(u8);
    return parseXML(text);
  }

  /* ---------- XML plist ---------- */
  function parseXML(text) {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    const root = doc.querySelector('plist > *');
    return root ? walkXML(root) : {};
  }
  function walkXML(node) {
    switch (node.tagName) {
      case 'dict': {
        const o = {}; let key = null;
        for (const c of Array.from(node.children)) {
          if (c.tagName === 'key') key = c.textContent;
          else { o[key] = walkXML(c); key = null; }
        }
        return o;
      }
      case 'array': return Array.from(node.children).map(walkXML);
      case 'string': return node.textContent;
      case 'integer': return parseInt(node.textContent, 10);
      case 'real': return parseFloat(node.textContent);
      case 'true': return true;
      case 'false': return false;
      case 'date': return node.textContent;
      case 'data': return '<data>';
      default: return node.textContent;
    }
  }

  /* ---------- binary plist ---------- */
  function parseBinary(u8) {
    const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const len = u8.byteLength;
    // trailer = last 32 bytes
    const tr = len - 32;
    const offsetSize = u8[tr + 6];
    const objRefSize = u8[tr + 7];
    const numObjects = readBE(view, tr + 8, 8);
    const topObject = readBE(view, tr + 16, 8);
    const offsetTableStart = readBE(view, tr + 24, 8);

    const offsets = [];
    for (let i = 0; i < numObjects; i++) {
      offsets.push(readBE(view, offsetTableStart + i * offsetSize, offsetSize));
    }

    function readObj(idx) {
      let o = offsets[idx];
      const marker = u8[o];
      const hi = marker >> 4, lo = marker & 0x0f;
      switch (hi) {
        case 0x0: // singletons
          if (marker === 0x08) return false;
          if (marker === 0x09) return true;
          if (marker === 0x0f) return null;
          return null;
        case 0x1: { // int
          const n = 1 << lo; return readBE(view, o + 1, n);
        }
        case 0x2: { // real
          const n = 1 << lo;
          return n === 4 ? view.getFloat32(o + 1) : view.getFloat64(o + 1);
        }
        case 0x3: return view.getFloat64(o + 1); // date (secs since 2001) — return raw
        case 0x4: { // data
          const [count] = readLen(lo, o); return '<data ' + count + 'b>';
        }
        case 0x5: { // ASCII string
          const [count, start] = readLen(lo, o);
          return new TextDecoder('ascii').decode(u8.subarray(start, start + count));
        }
        case 0x6: { // UTF-16 string
          const [count, start] = readLen(lo, o);
          let s = '';
          for (let i = 0; i < count; i++) s += String.fromCharCode(view.getUint16(start + i * 2, false));
          return s;
        }
        case 0xa: case 0xc: { // array / set
          const [count, start] = readLen(lo, o);
          const arr = [];
          for (let i = 0; i < count; i++) arr.push(readObj(readBE(view, start + i * objRefSize, objRefSize)));
          return arr;
        }
        case 0xd: { // dict
          const [count, start] = readLen(lo, o);
          const keysStart = start;
          const valsStart = start + count * objRefSize;
          const obj = {};
          for (let i = 0; i < count; i++) {
            const k = readObj(readBE(view, keysStart + i * objRefSize, objRefSize));
            const v = readObj(readBE(view, valsStart + i * objRefSize, objRefSize));
            obj[k] = v;
          }
          return obj;
        }
        default: return null;
      }
    }

    function readLen(lo, o) {
      if (lo !== 0x0f) return [lo, o + 1];
      // next is an int object giving count
      const sizeMarker = u8[o + 1];
      const intBytes = 1 << (sizeMarker & 0x0f);
      const count = readBE(view, o + 2, intBytes);
      return [count, o + 2 + intBytes];
    }

    try { return readObj(topObject); } catch (e) { return {}; }
  }

  function readBE(view, off, size) {
    let v = 0;
    for (let i = 0; i < size; i++) v = v * 256 + view.getUint8(off + i);
    return v;
  }

  global.EMU = global.EMU || {};
  global.EMU.plist = { parsePlist };
})(window);
