// Package inspector: turns a loaded APK/IPA zip into an AppInfo.
// Server-side (Node) module — uses jszip + the pure-JS axml/bplist decoders.
// Port of emu/inspect.js (framework/ABI/permission/icon detection).

import JSZip from 'jszip';
import type { AppInfo, Platform } from '@/lib/types';
import { parseAxml, findNode, findAll, type AxmlNode } from '@/lib/emu/axml';
import { parsePlist, type PlistValue } from '@/lib/emu/bplist';

function uncompressedSize(file: JSZip.JSZipObject): number {
  // JSZip exposes the size on its internal _data after load.
  const anyFile = file as unknown as { _data?: { uncompressedSize?: number } };
  return anyFile._data?.uncompressedSize ?? 0;
}

function topDir(path: string): string {
  const i = path.indexOf('/');
  return i === -1 ? path : path.slice(0, i);
}

function collectDirSizes(zip: JSZip): { dirSizes: { name: string; bytes: number }[]; fileCount: number } {
  const sizes = new Map<string, number>();
  let fileCount = 0;
  zip.forEach((relPath, file) => {
    if (file.dir) return;
    fileCount++;
    const d = topDir(relPath);
    sizes.set(d, (sizes.get(d) ?? 0) + uncompressedSize(file));
  });
  const dirSizes = [...sizes.entries()]
    .map(([name, bytes]) => ({ name, bytes }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 8);
  return { dirSizes, fileCount };
}

function mime(path: string): string {
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.webp')) return 'image/webp';
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';
  return 'application/octet-stream';
}

function toDataUrl(bytes: Uint8Array, type: string): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 = typeof btoa !== 'undefined' ? btoa(bin) : Buffer.from(bytes).toString('base64');
  return `data:${type};base64,${b64}`;
}

// ---------------------------------------------------------------------------
// Android
// ---------------------------------------------------------------------------

async function inspectApk(zip: JSZip, sizeBytes: number, fallbackName: string): Promise<AppInfo> {
  const notes: string[] = [];
  const frameworks: string[] = [];
  const names = Object.keys(zip.files);

  // ABIs from lib/<abi>/
  const abis = [
    ...new Set(
      names
        .map((n) => /^lib\/([^/]+)\//.exec(n))
        .filter(Boolean)
        .map((m) => (m as RegExpExecArray)[1]),
    ),
  ];

  // Framework detection.
  const has = (re: RegExp) => names.some((n) => re.test(n));
  if (has(/^lib\/[^/]+\/libflutter\.so$/)) frameworks.push('Flutter');
  if (has(/^assets\/index\.android\.bundle$/) || has(/^lib\/[^/]+\/libhermes\.so$/))
    frameworks.push('React Native');
  if (has(/^lib\/[^/]+\/libunity\.so$/)) frameworks.push('Unity');
  let hybridRoot: string | undefined;
  if (zip.file('assets/public/index.html')) hybridRoot = 'assets/public';
  else if (zip.file('assets/www/index.html')) hybridRoot = 'assets/www';
  if (hybridRoot) frameworks.push('Capacitor/Cordova');
  if (frameworks.length === 0) frameworks.push('Native (Java/Kotlin)');

  // Manifest.
  let packageId: string | undefined;
  let version: string | undefined;
  let build: string | undefined;
  let minSdk: string | undefined;
  let targetSdk: string | undefined;
  let label: string | undefined;
  let iconRef: string | undefined;
  const permissions: string[] = [];

  const manifestFile = zip.file('AndroidManifest.xml');
  if (manifestFile) {
    try {
      const bytes = await manifestFile.async('uint8array');
      const root = parseAxml(bytes);
      const manifest = findNode(root, 'manifest') ?? root;
      packageId = str(manifest.attrs['package']);
      version = str(manifest.attrs['versionName']) || undefined;
      const vc = manifest.attrs['versionCode'];
      build = vc !== undefined ? String(vc) : undefined;
      const usesSdk = findNode(root, 'uses-sdk');
      if (usesSdk) {
        if (usesSdk.attrs['minSdkVersion'] !== undefined)
          minSdk = String(usesSdk.attrs['minSdkVersion']);
        if (usesSdk.attrs['targetSdkVersion'] !== undefined)
          targetSdk = String(usesSdk.attrs['targetSdkVersion']);
      }
      for (const p of findAll(root, 'uses-permission')) {
        const n = str(p.attrs['name']);
        if (n) permissions.push(n.replace(/^android\.permission\./, ''));
      }
      const app = findNode(root, 'application');
      if (app) {
        const lbl = app.attrs['label'];
        if (typeof lbl === 'string' && lbl && !lbl.startsWith('@')) label = lbl;
        const icon = app.attrs['icon'];
        if (typeof icon === 'string') iconRef = icon;
      }
    } catch (e) {
      notes.push('Could not fully decode AndroidManifest.xml: ' + (e as Error).message);
    }
  } else {
    notes.push('No AndroidManifest.xml found in the package.');
  }

  // Icon: heuristic — biggest PNG/WebP launcher icon under res/mipmap|drawable.
  const iconDataUrl = await extractAndroidIcon(zip);

  const runnable = Boolean(hybridRoot);
  const name = label || prettyName(packageId) || fallbackName;

  if (!runnable) {
    notes.push(
      'Native Android binary — a browser cannot execute it. Inspect-only here; run it on a device emulator (Strategy A) or Appetize cloud (Strategy B).',
    );
  } else {
    notes.push('Hybrid web app detected — the web layer can run live in the device frame.');
  }
  if (abis.length) notes.push('ABIs: ' + abis.join(', '));

  const { dirSizes, fileCount } = collectDirSizes(zip);

  return {
    platform: 'android',
    name,
    packageId,
    version,
    build,
    minSdk,
    targetSdk,
    abis,
    permissions,
    frameworks,
    runnable,
    hybridRoot,
    iconDataUrl,
    sizeBytes,
    fileType: 'APK',
    fileCount,
    dirSizes,
    notes,
  };
}

async function extractAndroidIcon(zip: JSZip): Promise<string | undefined> {
  const candidates = Object.keys(zip.files).filter((n) =>
    /^res\/(mipmap|drawable)[^/]*\/(ic_launcher|ic_launcher_round|icon|app_icon)[^/]*\.(png|webp)$/i.test(
      n,
    ),
  );
  if (candidates.length === 0) return undefined;
  // Prefer the largest file (highest density raster).
  let best: { name: string; size: number } | null = null;
  for (const n of candidates) {
    const f = zip.file(n);
    if (!f) continue;
    const s = uncompressedSize(f);
    if (!best || s > best.size) best = { name: n, size: s };
  }
  if (!best) return undefined;
  try {
    const bytes = await zip.file(best.name)!.async('uint8array');
    return toDataUrl(bytes, mime(best.name));
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// iOS
// ---------------------------------------------------------------------------

async function inspectIpa(zip: JSZip, sizeBytes: number, fallbackName: string): Promise<AppInfo> {
  const notes: string[] = [];
  const frameworks: string[] = [];
  const names = Object.keys(zip.files);

  const appDirMatch = /^Payload\/([^/]+\.app)\//.exec(names.find((n) => /^Payload\/[^/]+\.app\//.test(n)) || '');
  const appDir = appDirMatch ? `Payload/${appDirMatch[1]}` : 'Payload';

  const has = (re: RegExp) => names.some((n) => re.test(n));
  if (has(/Frameworks\/Flutter\.framework/) || has(/\/App\.framework\//)) frameworks.push('Flutter');
  if (has(/main\.jsbundle$/)) frameworks.push('React Native');
  if (has(/Frameworks\/UnityFramework\.framework/)) frameworks.push('Unity');
  let hybridRoot: string | undefined;
  if (has(new RegExp(`^${escapeRe(appDir)}/public/index\\.html$`))) hybridRoot = `${appDir}/public`;
  else if (has(new RegExp(`^${escapeRe(appDir)}/www/index\\.html$`))) hybridRoot = `${appDir}/www`;
  if (hybridRoot) frameworks.push('Capacitor/Cordova');
  if (frameworks.length === 0) frameworks.push('Native (Swift/Obj-C)');

  let packageId: string | undefined;
  let version: string | undefined;
  let build: string | undefined;
  let minOS: string | undefined;
  let deviceFamily: string[] | undefined;
  let displayName: string | undefined;
  const permissions: string[] = [];

  const plistFile = zip.file(`${appDir}/Info.plist`);
  if (plistFile) {
    try {
      const bytes = await plistFile.async('uint8array');
      const plist = parsePlist(bytes) as Record<string, PlistValue>;
      packageId = pstr(plist['CFBundleIdentifier']);
      displayName = pstr(plist['CFBundleDisplayName']) || pstr(plist['CFBundleName']);
      version = pstr(plist['CFBundleShortVersionString']) || undefined;
      build = pstr(plist['CFBundleVersion']) || undefined;
      minOS = pstr(plist['MinimumOSVersion']) || undefined;
      const fam = plist['UIDeviceFamily'];
      if (Array.isArray(fam)) {
        deviceFamily = fam.map((n) => (Number(n) === 2 ? 'iPad' : 'iPhone'));
      }
      // Privacy usage strings = the permissions the app declares.
      for (const key of Object.keys(plist)) {
        if (/UsageDescription$/.test(key)) {
          permissions.push(key.replace(/^NS/, '').replace(/UsageDescription$/, ''));
        }
      }
    } catch (e) {
      notes.push('Could not decode Info.plist: ' + (e as Error).message);
    }
  } else {
    notes.push('No Info.plist found under Payload/*.app/.');
  }

  const runnable = Boolean(hybridRoot);
  const name = displayName || prettyName(packageId) || fallbackName.replace(/\.ipa$/i, '');

  if (!runnable) {
    notes.push(
      'Native iOS binary — a browser cannot execute it. Inspect-only here; run it in the iOS Simulator on macOS (Strategy A) or Appetize cloud (Strategy B).',
    );
  } else {
    notes.push('Hybrid web app detected — the web layer can run live in the device frame.');
  }
  notes.push('iOS app icons are CgBI-optimized PNGs that browsers cannot render — preview skipped.');

  const { dirSizes, fileCount } = collectDirSizes(zip);

  return {
    platform: 'ios',
    name,
    packageId,
    version,
    build,
    minOS,
    deviceFamily,
    permissions,
    frameworks,
    runnable,
    hybridRoot,
    sizeBytes,
    fileType: 'IPA',
    fileCount,
    dirSizes,
    notes,
  };
}

// ---------------------------------------------------------------------------
// entry point
// ---------------------------------------------------------------------------

export async function inspectPackage(buffer: ArrayBuffer | Uint8Array, filename: string): Promise<AppInfo> {
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const sizeBytes = data.byteLength;
  const zip = await JSZip.loadAsync(data);
  const names = Object.keys(zip.files);
  const isIpa =
    /\.ipa$/i.test(filename) || names.some((n) => /^Payload\/[^/]+\.app\//.test(n));
  const isApk =
    /\.apk$/i.test(filename) || zip.file('AndroidManifest.xml') !== null;

  if (isIpa) return inspectIpa(zip, sizeBytes, filename);
  if (isApk) return inspectApk(zip, sizeBytes, filename);

  // Unknown archive — treat as a web build zip if it has an index.html.
  const indexEntry = names.find((n) => /(^|\/)index\.html$/.test(n));
  const platform: Platform = 'web';
  return {
    platform,
    name: filename.replace(/\.(zip|apk|ipa)$/i, ''),
    frameworks: indexEntry ? ['Web build'] : ['Unknown archive'],
    runnable: Boolean(indexEntry),
    hybridRoot: indexEntry ? indexEntry.replace(/\/?index\.html$/, '') : undefined,
    sizeBytes,
    fileType: 'Archive',
    notes: indexEntry
      ? ['Archive contains index.html — can run as a web build.']
      : ['Unrecognized archive (no AndroidManifest.xml, no Payload/*.app, no index.html).'],
  };
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : v === undefined ? undefined : String(v);
}
function pstr(v: PlistValue | undefined): string {
  return typeof v === 'string' ? v : v === undefined ? '' : String(v);
}
function prettyName(pkg?: string): string | undefined {
  if (!pkg) return undefined;
  const last = pkg.split('.').pop() || pkg;
  return last.charAt(0).toUpperCase() + last.slice(1);
}
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
