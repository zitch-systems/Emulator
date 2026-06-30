// Pure-JS property-list decoder for iOS Info.plist. Handles both the binary
// ("bplist00") format and XML plists. Dependency-free port of emu/bplist.js.

export type PlistValue =
  | string
  | number
  | boolean
  | Date
  | Uint8Array
  | PlistValue[]
  | { [key: string]: PlistValue };

const MAGIC = 'bplist00';

export function parsePlist(buf: Uint8Array): PlistValue {
  const head = asciiSlice(buf, 0, 8);
  if (head === MAGIC) return parseBinaryPlist(buf);
  // Otherwise assume an XML plist.
  const text = utf8(buf);
  return parseXmlPlist(text);
}

// ---------------------------------------------------------------------------
// Binary plist v0/v1
// ---------------------------------------------------------------------------

function parseBinaryPlist(buf: Uint8Array): PlistValue {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const len = buf.length;
  const trailer = len - 32;
  const offsetSize = buf[trailer + 6];
  const refSize = buf[trailer + 7];
  const numObjects = readBE(view, trailer + 8, 8);
  const topObject = readBE(view, trailer + 16, 8);
  const offsetTableOffset = readBE(view, trailer + 24, 8);

  const offsets: number[] = [];
  for (let i = 0; i < numObjects; i++) {
    offsets.push(readBE(view, offsetTableOffset + i * offsetSize, offsetSize));
  }

  function parseObject(index: number): PlistValue {
    const pos = offsets[index];
    const marker = buf[pos];
    const objType = marker >> 4;
    const objInfo = marker & 0x0f;

    switch (objType) {
      case 0x0: // singletons
        if (objInfo === 0x0) return '';
        if (objInfo === 0x8) return false;
        if (objInfo === 0x9) return true;
        return '';
      case 0x1: {
        // int
        const n = 1 << objInfo;
        return readBE(view, pos + 1, n);
      }
      case 0x2: {
        // real
        const n = 1 << objInfo;
        return n === 4 ? view.getFloat32(pos + 1) : view.getFloat64(pos + 1);
      }
      case 0x3: // date (seconds since 2001-01-01)
        return new Date(978307200000 + view.getFloat64(pos + 1) * 1000);
      case 0x4: {
        // data
        const [count, start] = readLength(buf, view, pos, objInfo);
        return buf.subarray(start, start + count);
      }
      case 0x5: {
        // ASCII string
        const [count, start] = readLength(buf, view, pos, objInfo);
        return asciiSlice(buf, start, start + count);
      }
      case 0x6: {
        // UTF-16BE string
        const [count, start] = readLength(buf, view, pos, objInfo);
        let s = '';
        for (let i = 0; i < count; i++) s += String.fromCharCode(view.getUint16(start + i * 2));
        return s;
      }
      case 0x8: {
        // UID — treat as int
        const n = objInfo + 1;
        return readBE(view, pos + 1, n);
      }
      case 0xa: // array
      case 0xc: {
        // set
        const [count, start] = readLength(buf, view, pos, objInfo);
        const arr: PlistValue[] = [];
        for (let i = 0; i < count; i++) {
          arr.push(parseObject(readBE(view, start + i * refSize, refSize)));
        }
        return arr;
      }
      case 0xd: {
        // dict
        const [count, start] = readLength(buf, view, pos, objInfo);
        const keysBase = start;
        const valsBase = start + count * refSize;
        const obj: { [key: string]: PlistValue } = {};
        for (let i = 0; i < count; i++) {
          const k = parseObject(readBE(view, keysBase + i * refSize, refSize));
          const v = parseObject(readBE(view, valsBase + i * refSize, refSize));
          obj[String(k)] = v;
        }
        return obj;
      }
      default:
        return '';
    }
  }

  return parseObject(topObject);
}

// Returns [count, dataStart]. When the low nibble is 0xF, the real count is an
// int object that immediately follows the marker byte.
function readLength(
  buf: Uint8Array,
  view: DataView,
  pos: number,
  objInfo: number,
): [number, number] {
  if (objInfo !== 0x0f) return [objInfo, pos + 1];
  const intMarker = buf[pos + 1];
  const n = 1 << (intMarker & 0x0f);
  const count = readBE(view, pos + 2, n);
  return [count, pos + 2 + n];
}

function readBE(view: DataView, offset: number, size: number): number {
  let v = 0;
  for (let i = 0; i < size; i++) v = v * 256 + view.getUint8(offset + i);
  return v;
}

// ---------------------------------------------------------------------------
// XML plist (minimal but correct for Info.plist shapes)
// ---------------------------------------------------------------------------

function parseXmlPlist(xml: string): PlistValue {
  // Strip declaration, DOCTYPE and comments.
  const cleaned = xml
    .replace(/<\?xml[^>]*\?>/g, '')
    .replace(/<!DOCTYPE[^>]*>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  const tokens = cleaned.match(/<[^>]+>|[^<]+/g) || [];
  let i = 0;

  function next(): string | null {
    while (i < tokens.length) {
      const t = tokens[i++];
      if (t.trim() === '') continue;
      return t;
    }
    return null;
  }
  function peekTag(): string | null {
    let j = i;
    while (j < tokens.length) {
      const t = tokens[j++];
      if (t.trim() === '') continue;
      return t;
    }
    return null;
  }

  function parseValue(tag: string): PlistValue {
    const name = tagName(tag);
    if (tag.endsWith('/>')) {
      if (name === 'true') return true;
      if (name === 'false') return false;
      if (name === 'array') return [];
      if (name === 'dict') return {};
      return '';
    }
    switch (name) {
      case 'dict': {
        const obj: { [key: string]: PlistValue } = {};
        for (;;) {
          const t = next();
          if (t === null || tagName(t) === '/dict') break;
          if (tagName(t) === 'key') {
            const key = decodeEntities(textUntil('/key'));
            const vt = next();
            if (vt === null) break;
            obj[key] = parseValue(vt);
          }
        }
        return obj;
      }
      case 'array': {
        const arr: PlistValue[] = [];
        for (;;) {
          const t = peekTag();
          if (t === null || tagName(t) === '/array') {
            next();
            break;
          }
          const vt = next();
          if (vt === null) break;
          arr.push(parseValue(vt));
        }
        return arr;
      }
      case 'string':
        return decodeEntities(textUntil('/string'));
      case 'integer':
        return parseInt(textUntil('/integer').trim(), 10) || 0;
      case 'real':
        return parseFloat(textUntil('/real').trim()) || 0;
      case 'true':
        return true;
      case 'false':
        return false;
      case 'data':
        return textUntil('/data').trim();
      case 'date':
        return textUntil('/date').trim();
      default:
        return '';
    }
  }

  function textUntil(closeTag: string): string {
    let out = '';
    for (;;) {
      if (i >= tokens.length) break;
      const t = tokens[i++];
      if (t.startsWith('<') && tagName(t) === closeTag) break;
      if (!t.startsWith('<')) out += t;
    }
    return out;
  }

  // Find <plist> then its single root child.
  for (;;) {
    const t = next();
    if (t === null) return {};
    if (tagName(t) === 'plist') break;
  }
  const rootTag = next();
  if (rootTag === null) return {};
  return parseValue(rootTag);
}

function tagName(tag: string): string {
  return tag.replace(/^<\/?/, '').replace(/\s.*?>?$/, '').replace(/\/?>$/, '').trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function asciiSlice(buf: Uint8Array, start: number, end: number): string {
  let s = '';
  for (let i = start; i < end && i < buf.length; i++) s += String.fromCharCode(buf[i]);
  return s;
}
function utf8(buf: Uint8Array): string {
  if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(buf);
  return Buffer.from(buf).toString('utf-8');
}
