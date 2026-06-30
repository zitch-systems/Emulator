'use client';

import JSZip from 'jszip';

export async function fileToBytes(file: File | Blob): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as number[]);
  }
  return btoa(bin);
}

/** Extract the web-root subtree of a hybrid package into a path->bytes map. */
export async function extractWebRoot(
  packageBytes: Uint8Array,
  root: string,
): Promise<Map<string, Uint8Array>> {
  const zip = await JSZip.loadAsync(packageBytes);
  // root '' / '.' means "the whole archive" (index.html sits at the zip root).
  const prefix = !root || root === '.' ? '' : root.endsWith('/') ? root : root + '/';
  const map = new Map<string, Uint8Array>();
  const entries = Object.entries(zip.files).filter(([n, f]) => !f.dir && n.startsWith(prefix));
  for (const [name, file] of entries) {
    map.set(name.slice(prefix.length), await file.async('uint8array'));
  }
  return map;
}

/** Build a path->bytes map from a directory <input webkitdirectory> FileList. */
export async function filesToMap(files: FileList): Promise<Map<string, Uint8Array>> {
  const map = new Map<string, Uint8Array>();
  const arr = Array.from(files);
  // Strip the common top-level folder so index.html sits at the root.
  const rels = arr.map((f) => (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name);
  const firstSeg = rels[0]?.split('/')[0] ?? '';
  const sharePrefix = rels.every((r) => r.split('/')[0] === firstSeg) && firstSeg ? firstSeg + '/' : '';
  for (let i = 0; i < arr.length; i++) {
    const rel = rels[i].startsWith(sharePrefix) ? rels[i].slice(sharePrefix.length) : rels[i];
    map.set(rel, await fileToBytes(arr[i]));
  }
  return map;
}
