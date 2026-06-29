/* EMulator Studio — binary AndroidManifest.xml (AXML) decoder.
   Extracts a flat ordered list of elements: [{name, attrs:{k:v}}].
   Resource references are returned as "@<hex>" strings. */
(function (global) {
  'use strict';

  const TYPE = {
    STRING_POOL: 0x0001,
    START_NS: 0x0100,
    END_NS: 0x0101,
    START_TAG: 0x0102,
    END_TAG: 0x0103,
    CDATA: 0x0104,
    RESOURCE_MAP: 0x0180,
  };

  function parseAXML(u8) {
    const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let pos = 0;
    const u16 = (o) => view.getUint16(o, true);
    const u32 = (o) => view.getUint32(o, true);
    const i32 = (o) => view.getInt32(o, true);

    // file header
    if (u16(0) !== 0x0003) throw new Error('Not AXML (bad magic)');
    pos = u16(2); // header size, then chunks follow

    let strings = [];
    const elements = [];

    while (pos + 8 <= u8.byteLength) {
      const type = u16(pos);
      const headerSize = u16(pos + 2);
      const size = u32(pos + 4);
      if (size <= 0) break;

      if (type === TYPE.STRING_POOL) {
        strings = parseStringPool(view, pos, u8);
      } else if (type === TYPE.START_TAG) {
        const lineNo = u32(pos + 8); // (unused)
        const nsIdx = i32(pos + 16);
        const nameIdx = i32(pos + 20);
        const attrStart = u16(pos + 24);
        const attrCount = u16(pos + 28);
        const name = str(strings, nameIdx);
        const attrs = {};
        let ap = pos + attrStart;
        for (let a = 0; a < attrCount; a++) {
          const aNs = i32(ap);
          const aName = i32(ap + 4);
          const aRaw = i32(ap + 8);
          const aType = view.getUint8(ap + 15); // dataType is high byte of (size<<? ) — at offset 8+ (size:u16, res0:u8, dataType:u8)
          const aData = u32(ap + 16);
          let key = str(strings, aName);
          let val = decodeValue(aType, aData, aRaw, strings);
          if (key) attrs[key] = val;
          ap += 20;
        }
        elements.push({ name, attrs });
      }
      pos += size;
    }
    return elements;
  }

  function decodeValue(type, data, rawIdx, strings) {
    // TypedValue types
    switch (type) {
      case 0x03: return rawIdx >= 0 ? str(strings, rawIdx) : '@string/' + data; // STRING
      case 0x10: return String(data | 0);            // INT_DEC
      case 0x11: return '0x' + (data >>> 0).toString(16); // INT_HEX
      case 0x12: return data === 0 ? 'false' : 'true'; // INT_BOOLEAN
      case 0x01: return '@' + (data >>> 0).toString(16); // REFERENCE
      case 0x02: return '?' + (data >>> 0).toString(16); // ATTRIBUTE
      case 0x04: return intBitsToFloat(data).toString(); // FLOAT
      case 0x1c: case 0x1d: return '#' + (data >>> 0).toString(16).padStart(8, '0'); // COLOR
      default:
        if (rawIdx >= 0) return str(strings, rawIdx);
        return String(data | 0);
    }
  }

  const _fb = new ArrayBuffer(4), _fv = new DataView(_fb);
  function intBitsToFloat(i) { _fv.setUint32(0, i >>> 0); return _fv.getFloat32(0); }

  function str(strings, idx) { return (idx >= 0 && idx < strings.length) ? strings[idx] : ''; }

  function parseStringPool(view, base, u8) {
    const u32 = (o) => view.getUint32(o, true);
    const stringCount = u32(base + 8);
    const flags = u32(base + 16);
    const stringsStart = u32(base + 20);
    const isUTF8 = (flags & 0x100) !== 0;
    const offsetsBase = base + 28;
    const dataBase = base + stringsStart;
    const out = [];
    for (let i = 0; i < stringCount; i++) {
      const off = u32(offsetsBase + i * 4);
      const p = dataBase + off;
      try {
        out.push(isUTF8 ? readUTF8(view, p, u8) : readUTF16(view, p));
      } catch (e) { out.push(''); }
    }
    return out;
  }

  function readUTF16(view, p) {
    let len = view.getUint16(p, true);
    let o = p + 2;
    if (len & 0x8000) { len = ((len & 0x7fff) << 16) | view.getUint16(o, true); o += 2; }
    let s = '';
    for (let i = 0; i < len; i++) { s += String.fromCharCode(view.getUint16(o + i * 2, true)); }
    return s;
  }

  function readUTF8(view, p, u8) {
    // skip "u16 char length" then "u8/u16 byte length"
    let o = p;
    let n = u8[o++]; if (n & 0x80) { n = ((n & 0x7f) << 8) | u8[o++]; }   // char count
    let b = u8[o++]; if (b & 0x80) { b = ((b & 0x7f) << 8) | u8[o++]; }   // byte count
    const bytes = u8.subarray(o, o + b);
    return new TextDecoder('utf-8').decode(bytes);
  }

  global.EMU = global.EMU || {};
  global.EMU.axml = { parseAXML };
})(window);
