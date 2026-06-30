// Pure-JS decoder for Android binary XML (AndroidManifest.xml inside an APK).
// Dependency-free port of the prototype's emu/axml.js. Returns a small DOM-like
// tree { tag, attrs, children } with typed attribute values.
//
// Format reference: AOSP ResourceTypes.h chunk layout (little-endian).

export interface AxmlNode {
  tag: string;
  attrs: Record<string, string | number | boolean>;
  children: AxmlNode[];
}

const CHUNK_STRING_POOL = 0x0001;
const CHUNK_XML_START_ELEMENT = 0x0102;
const CHUNK_XML_END_ELEMENT = 0x0103;

const UTF8_FLAG = 1 << 8;

// Resource value types we care about.
const TYPE_REFERENCE = 0x01;
const TYPE_STRING = 0x03;
const TYPE_INT_DEC = 0x10;
const TYPE_INT_HEX = 0x11;
const TYPE_INT_BOOLEAN = 0x12;

class Reader {
  view: DataView;
  pos = 0;
  constructor(public buf: Uint8Array) {
    this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  u16(p = this.pos) {
    return this.view.getUint16(p, true);
  }
  u32(p = this.pos) {
    return this.view.getUint32(p, true);
  }
}

function parseStringPool(buf: Uint8Array, start: number): string[] {
  const r = new Reader(buf);
  const headerSize = r.u16(start + 2);
  const stringCount = r.u32(start + 8);
  const flags = r.u32(start + 16);
  const stringsStart = r.u32(start + 20);
  const isUtf8 = (flags & UTF8_FLAG) !== 0;
  const out: string[] = [];
  const offsetsBase = start + headerSize;
  const dataBase = start + stringsStart;

  for (let i = 0; i < stringCount; i++) {
    const off = r.u32(offsetsBase + i * 4);
    let p = dataBase + off;
    if (isUtf8) {
      // skip the UTF-16 length, then read the byte length
      p = skipLen(r, p); // u16 char count
      const [byteLen, np] = readLen(r, p);
      p = np;
      const bytes = buf.subarray(p, p + byteLen);
      out.push(utf8Decode(bytes));
    } else {
      const [charLen, np] = readLen16(r, p);
      p = np;
      let s = '';
      for (let c = 0; c < charLen; c++) {
        s += String.fromCharCode(r.u16(p));
        p += 2;
      }
      out.push(s);
    }
  }
  return out;
}

// UTF-8 string lengths: 1 byte, or 2 bytes when the high bit of the first is set.
function readLen(r: Reader, p: number): [number, number] {
  let len = r.view.getUint8(p);
  p += 1;
  if (len & 0x80) {
    len = ((len & 0x7f) << 8) | r.view.getUint8(p);
    p += 1;
  }
  return [len, p];
}
function skipLen(r: Reader, p: number): number {
  const b = r.view.getUint8(p);
  return p + ((b & 0x80) ? 2 : 1);
}
// UTF-16 char-count lengths: 1 u16, or 2 u16 when the high bit of the first is set.
function readLen16(r: Reader, p: number): [number, number] {
  let len = r.u16(p);
  p += 2;
  if (len & 0x8000) {
    len = ((len & 0x7fff) << 16) | r.u16(p);
    p += 2;
  }
  return [len, p];
}

function utf8Decode(bytes: Uint8Array): string {
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder('utf-8').decode(bytes);
  }
  // Fallback (Node without global TextDecoder — unlikely on modern runtimes).
  return Buffer.from(bytes).toString('utf-8');
}

function str(pool: string[], idx: number): string {
  if (idx < 0 || idx === 0xffffffff || idx >= pool.length) return '';
  return pool[idx] ?? '';
}

/** Decode a binary AndroidManifest.xml into a node tree. Throws on a non-AXML buffer. */
export function parseAxml(input: Uint8Array): AxmlNode {
  const r = new Reader(input);
  const magic = r.u16(0);
  if (magic !== 0x0003) {
    throw new Error('not a binary AXML document');
  }

  // Find the string pool chunk (first chunk after the file header at offset 8).
  let pool: string[] = [];
  let p = 8;
  const total = input.length;
  while (p + 8 <= total) {
    const type = r.u16(p);
    const size = r.u32(p + 4);
    if (size <= 0) break;
    if (type === CHUNK_STRING_POOL) {
      pool = parseStringPool(input, p);
      p += size;
      break;
    }
    p += size;
  }

  // Walk element chunks, building a tree.
  const root: AxmlNode = { tag: '#root', attrs: {}, children: [] };
  const stack: AxmlNode[] = [root];

  while (p + 8 <= total) {
    const type = r.u16(p);
    const size = r.u32(p + 4);
    if (size <= 0) break;

    if (type === CHUNK_XML_START_ELEMENT) {
      const nodeHeader = r.u16(p + 2); // ResXMLTree_node header size (16)
      const nameIdx = r.u32(p + 20);
      // attributeStart is relative to the attrExt struct, which begins right
      // after the node header (p + nodeHeader). Its canonical value is 0x14.
      const attrStart = r.u16(p + 24);
      const attrCount = r.u16(p + 28);
      const node: AxmlNode = { tag: str(pool, nameIdx), attrs: {}, children: [] };
      let ap = p + nodeHeader + attrStart;
      for (let i = 0; i < attrCount; i++) {
        const aNameIdx = r.u32(ap + 4);
        const aRawValue = r.u32(ap + 8);
        const aType = input[ap + 15]; // high byte of typedValue
        const aData = r.u32(ap + 16);
        const aName = str(pool, aNameIdx);
        node.attrs[aName] = decodeValue(aType, aData, aRawValue, pool);
        ap += 20;
      }
      stack[stack.length - 1].children.push(node);
      stack.push(node);
    } else if (type === CHUNK_XML_END_ELEMENT) {
      if (stack.length > 1) stack.pop();
    }
    p += size;
  }

  // The single real root element is the first child of #root.
  return root.children[0] ?? root;
}

function decodeValue(
  type: number,
  data: number,
  rawValue: number,
  pool: string[],
): string | number | boolean {
  switch (type) {
    case TYPE_STRING:
      return str(pool, rawValue !== 0xffffffff ? rawValue : data);
    case TYPE_INT_BOOLEAN:
      return data !== 0;
    case TYPE_INT_HEX:
      return data;
    case TYPE_INT_DEC:
      return data | 0;
    case TYPE_REFERENCE:
      return '@' + data.toString(16);
    default:
      // unknown / dimension / float — surface the raw int
      return data;
  }
}

/** Depth-first search for the first node with a given tag. */
export function findNode(node: AxmlNode, tag: string): AxmlNode | undefined {
  if (node.tag === tag) return node;
  for (const c of node.children) {
    const found = findNode(c, tag);
    if (found) return found;
  }
  return undefined;
}

/** Collect every node with a given tag. */
export function findAll(node: AxmlNode, tag: string, acc: AxmlNode[] = []): AxmlNode[] {
  if (node.tag === tag) acc.push(node);
  for (const c of node.children) findAll(c, tag, acc);
  return acc;
}
