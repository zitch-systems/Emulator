// Hybrid / web build runner (browser only). Takes an in-memory file map of a
// static web build (folder upload, zip, or hybrid package web root), rewrites
// relative references (html src/href, css url()/@import, js import specifiers)
// to blob URLs, injects the console bridge, and returns a blob URL for the
// entry document to drop into the device iframe. Port of emu/runner.js.

import { BRIDGE_SNIPPET } from '@/lib/emu/bridge';

export interface RunHandle {
  url: string;
  revoke: () => void;
  indexPath: string;
}

const TEXT_EXT = /\.(html?|css|js|mjs|cjs|json|svg|map|webmanifest|txt)$/i;

function mimeFor(path: string): string {
  const ext = (path.split('.').pop() || '').toLowerCase();
  const map: Record<string, string> = {
    html: 'text/html',
    htm: 'text/html',
    css: 'text/css',
    js: 'text/javascript',
    mjs: 'text/javascript',
    cjs: 'text/javascript',
    json: 'application/json',
    webmanifest: 'application/manifest+json',
    svg: 'image/svg+xml',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    ico: 'image/x-icon',
    woff: 'font/woff',
    woff2: 'font/woff2',
    ttf: 'font/ttf',
    otf: 'font/otf',
    wasm: 'application/wasm',
    mp3: 'audio/mpeg',
    mp4: 'video/mp4',
    txt: 'text/plain',
    map: 'application/json',
  };
  return map[ext] || 'application/octet-stream';
}

function normalize(path: string): string {
  const parts: string[] = [];
  for (const seg of path.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/');
}

function dirname(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? '' : path.slice(0, i);
}

function decode(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes);
}
function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/**
 * Build a runnable document from a file map (keys are normalized relative paths).
 * Returns a blob URL plus a revoke() that frees every blob created.
 */
export function buildRunnableDoc(files: Map<string, Uint8Array>, preferredIndex?: string): RunHandle {
  // Normalize keys.
  const fs = new Map<string, Uint8Array>();
  for (const [k, v] of files) fs.set(normalize(k), v);

  // Locate the entry document.
  let indexPath = preferredIndex ? normalize(preferredIndex) : '';
  if (!indexPath || !fs.has(indexPath)) {
    const candidates = [...fs.keys()].filter((k) => /(^|\/)index\.html?$/i.test(k));
    candidates.sort((a, b) => a.split('/').length - b.split('/').length);
    indexPath = candidates[0] || [...fs.keys()].find((k) => /\.html?$/i.test(k)) || '';
  }
  if (!indexPath) throw new Error('No HTML entry file found in the build.');

  const created: string[] = [];
  const blobCache = new Map<string, string>(); // normalized path -> blob url

  // Resolve a reference (relative to baseDir) to a known file path, or null.
  const resolveRef = (ref: string, baseDir: string): string | null => {
    let r = ref.trim();
    if (!r || /^(https?:|data:|blob:|mailto:|tel:|#|javascript:)/i.test(r)) return null;
    r = r.split('#')[0].split('?')[0];
    if (!r) return null;
    const abs = r.startsWith('/') ? normalize(r) : normalize(`${baseDir}/${r}`);
    if (fs.has(abs)) return abs;
    return null;
  };

  // Build a blob URL for a path, processing text files recursively so their
  // own references are rewritten first.
  const blobFor = (path: string): string => {
    const existing = blobCache.get(path);
    if (existing) return existing;
    // Reserve to avoid infinite recursion on circular refs.
    blobCache.set(path, '');
    const bytes = fs.get(path)!;
    let outBytes = bytes;
    if (TEXT_EXT.test(path) && !/\.html?$/i.test(path)) {
      const text = rewriteText(decode(bytes), dirname(path));
      outBytes = encode(text);
    }
    const url = URL.createObjectURL(new Blob([outBytes as BlobPart], { type: mimeFor(path) }));
    created.push(url);
    blobCache.set(path, url);
    return url;
  };

  // Rewrite every quoted relative path + css url() in a text file.
  function rewriteText(text: string, baseDir: string): string {
    // url(...) in CSS (quoted or not)
    text = text.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, ref) => {
      const hit = resolveRef(ref, baseDir);
      return hit ? `url(${q}${blobFor(hit)}${q})` : m;
    });
    // @import "..."
    text = text.replace(/@import\s+(['"])([^'"]+)\1/g, (m, q, ref) => {
      const hit = resolveRef(ref, baseDir);
      return hit ? `@import ${q}${blobFor(hit)}${q}` : m;
    });
    // generic quoted relative specifiers (js import/from, src, etc.)
    text = text.replace(/(['"`])(\.{1,2}\/[^'"`]+|\/[^'"`]+)\1/g, (m, q, ref) => {
      const hit = resolveRef(ref, baseDir);
      return hit ? `${q}${blobFor(hit)}${q}` : m;
    });
    return text;
  }

  // Process the entry HTML.
  const baseDir = dirname(indexPath);
  let html = decode(fs.get(indexPath)!);

  // Rewrite src/href attributes.
  html = html.replace(/\b(src|href)\s*=\s*(['"])([^'"]+)\2/gi, (m, attr, q, ref) => {
    const hit = resolveRef(ref, baseDir);
    return hit ? `${attr}=${q}${blobFor(hit)}${q}` : m;
  });
  // Rewrite inline style url() and module preloads already covered by generic pass:
  html = rewriteText(html, baseDir);

  // Inject the bridge as the very first executable thing.
  const inject = `<script>${BRIDGE_SNIPPET}</script>`;
  if (/<head[^>]*>/i.test(html)) html = html.replace(/<head[^>]*>/i, (m) => m + inject);
  else if (/<html[^>]*>/i.test(html)) html = html.replace(/<html[^>]*>/i, (m) => m + inject);
  else html = inject + html;

  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  created.push(url);

  return {
    url,
    indexPath,
    revoke: () => {
      for (const u of created) URL.revokeObjectURL(u);
      created.length = 0;
      blobCache.clear();
    },
  };
}

/** Build a runnable doc from a single HTML string (e.g. a one-file upload or demo). */
export function buildRunnableHtml(html: string): RunHandle {
  const inject = `<script>${BRIDGE_SNIPPET}</script>`;
  let doc = html;
  if (/<head[^>]*>/i.test(doc)) doc = doc.replace(/<head[^>]*>/i, (m) => m + inject);
  else doc = inject + doc;
  const url = URL.createObjectURL(new Blob([doc], { type: 'text/html' }));
  return { url, indexPath: 'index.html', revoke: () => URL.revokeObjectURL(url) };
}
