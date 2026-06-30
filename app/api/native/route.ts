// POST /api/native — Strategy A: drive a LOCAL Android emulator (adb/emulator)
// or iOS Simulator (xcrun simctl) when the developer has the SDK installed.
// Every action first checks tool availability and returns a structured
// { available:false, reason } instead of throwing, so the UI degrades to
// inspect + framed web build when no SDK is present (honesty rule).
//
// actions: status | android-install | screenshot | logcat | ios-install | ios-log

import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';
import type { LogEntry } from '@/lib/types';
import { execCapture, toolAvailable, text } from '@/lib/server/exec';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

async function detect() {
  const [adb, emulator, xcrun] = await Promise.all([
    toolAvailable('adb', ['version']),
    toolAvailable('emulator', ['-version']),
    toolAvailable('xcrun', ['simctl', 'help']),
  ]);
  let avds: string[] = [];
  if (emulator) {
    const out = await text('emulator', ['-list-avds'], 8000).catch(() => '');
    avds = out.split('\n').map((s) => s.trim()).filter(Boolean);
  }
  let simulators: string[] = [];
  if (xcrun) {
    const out = await text('xcrun', ['simctl', 'list', 'devices', 'available'], 8000).catch(() => '');
    simulators = out
      .split('\n')
      .map((l) => l.match(/^\s+(.+?)\s+\([0-9A-F-]{36}\)\s+\(/i)?.[1])
      .filter((x): x is string => Boolean(x));
  }
  return {
    android: { available: adb && emulator, adb, emulator, avds },
    ios: { available: xcrun, simulators },
  };
}

async function bytesFromBody(body: Record<string, unknown>): Promise<{ buf: Buffer; name: string }> {
  const base64 = String(body.base64 || '');
  if (!base64) throw new Error('Missing base64 artifact');
  return { buf: Buffer.from(base64, 'base64'), name: String(body.filename || 'app.bin') };
}

export async function POST(req: NextRequest) {
  let action = '';
  try {
    const body = await req.json();
    action = String(body.action || 'status');

    if (action === 'status') {
      return NextResponse.json(await detect());
    }

    const caps = await detect();

    // ---- Android ----
    if (action === 'android-install') {
      if (!caps.android.available) {
        return NextResponse.json({
          available: false,
          reason:
            'Android SDK not found on this host (need `adb` + `emulator` on PATH). Install Android Studio or use Appetize cloud.',
        });
      }
      const { buf } = await bytesFromBody(body);
      const dir = await mkdtemp(join(tmpdir(), 'emu-'));
      const apkPath = join(dir, 'app.apk');
      await writeFile(apkPath, buf);

      // Ensure a device is online; boot the first AVD if needed.
      let devices = await text('adb', ['devices'], 8000);
      if (!/\bdevice\b/.test(devices.split('\n').slice(1).join('\n'))) {
        const avd = body.avd || caps.android.avds[0];
        if (!avd) return NextResponse.json({ available: false, reason: 'No AVD available to boot.' });
        // Boot headless in the background; do not await full boot here.
        execCapture('emulator', ['-avd', String(avd), '-no-window', '-no-audio', '-no-boot-anim', '-gpu', 'swiftshader_indirect'], { timeoutMs: 1 }).catch(() => undefined);
        await execCapture('adb', ['wait-for-device'], { timeoutMs: 90000 });
        await execCapture('adb', ['shell', 'while [[ -z $(getprop sys.boot_completed | tr -d "\\r") ]]; do sleep 1; done'], { timeoutMs: 90000 });
        devices = await text('adb', ['devices'], 8000);
      }

      const install = await text('adb', ['install', '-r', '-t', apkPath], 120000);
      const ok = /Success/i.test(install);
      let launch = '';
      const pkg = String(body.packageId || '');
      if (ok && pkg) {
        launch = await text('adb', ['shell', 'monkey', '-p', pkg, '-c', 'android.intent.category.LAUNCHER', '1'], 15000);
      }
      return NextResponse.json({ available: true, installed: ok, install, launch, devices });
    }

    if (action === 'screenshot') {
      if (!caps.android.available) return NextResponse.json({ available: false, reason: 'No adb on PATH.' });
      const r = await execCapture('adb', ['exec-out', 'screencap', '-p'], { timeoutMs: 20000 });
      if (!r.stdout.length) return NextResponse.json({ available: true, error: r.stderr || 'no image' });
      return NextResponse.json({ available: true, screenshotDataUrl: 'data:image/png;base64,' + r.stdout.toString('base64') });
    }

    if (action === 'logcat') {
      if (!caps.android.available) return NextResponse.json({ available: false, reason: 'No adb on PATH.' });
      const pkg = String(body.packageId || '');
      let pid = '';
      if (pkg) pid = (await text('adb', ['shell', 'pidof', pkg], 8000)).trim();
      const args = pid ? ['logcat', '-d', '-v', 'time', `--pid=${pid}`] : ['logcat', '-d', '-v', 'time', '*:W'];
      const raw = await text('adb', args, 15000);
      return NextResponse.json({ available: true, logs: parseLogcat(raw) });
    }

    // ---- iOS (macOS only) ----
    if (action === 'ios-install') {
      if (!caps.ios.available) {
        return NextResponse.json({
          available: false,
          reason: 'iOS Simulator requires macOS with Xcode (`xcrun simctl`). Use Appetize cloud on other platforms.',
        });
      }
      const { buf } = await bytesFromBody(body);
      const dir = await mkdtemp(join(tmpdir(), 'emu-ipa-'));
      const zip = await JSZip.loadAsync(buf);
      // Extract Payload/*.app
      const appRootEntry = Object.keys(zip.files).find((n) => /^Payload\/[^/]+\.app\/$/.test(n));
      if (!appRootEntry) return NextResponse.json({ available: true, error: 'No Payload/*.app in IPA' });
      for (const [name, file] of Object.entries(zip.files)) {
        const dest = join(dir, name);
        if (file.dir) continue;
        await writeFile(dest, await file.async('nodebuffer')).catch(async () => {
          const { mkdir } = await import('node:fs/promises');
          await mkdir(join(dir, name.split('/').slice(0, -1).join('/')), { recursive: true });
          await writeFile(dest, await file.async('nodebuffer'));
        });
      }
      await execCapture('xcrun', ['simctl', 'boot', String(body.device || 'iPhone 15 Pro')], { timeoutMs: 60000 });
      const appPath = join(dir, appRootEntry.replace(/\/$/, ''));
      const install = await text('xcrun', ['simctl', 'install', 'booted', appPath], 60000);
      let launch = '';
      if (body.bundleId) launch = await text('xcrun', ['simctl', 'launch', 'booted', String(body.bundleId)], 30000);
      return NextResponse.json({ available: true, install, launch });
    }

    if (action === 'ios-screenshot') {
      if (!caps.ios.available) return NextResponse.json({ available: false, reason: 'No xcrun on host.' });
      const dir = await mkdtemp(join(tmpdir(), 'emu-shot-'));
      const out = join(dir, 'shot.png');
      await execCapture('xcrun', ['simctl', 'io', 'booted', 'screenshot', out], { timeoutMs: 20000 });
      const { readFile } = await import('node:fs/promises');
      const png = await readFile(out).catch(() => null);
      if (!png) return NextResponse.json({ available: true, error: 'screenshot failed' });
      return NextResponse.json({ available: true, screenshotDataUrl: 'data:image/png;base64,' + png.toString('base64') });
    }

    return NextResponse.json({ error: 'Unknown action: ' + action }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: `native ${action} failed: ${(e as Error).message}` }, { status: 500 });
  }
}

function parseLogcat(raw: string): LogEntry[] {
  const out: LogEntry[] = [];
  for (const line of raw.split('\n')) {
    // e.g. "06-30 12:00:00.123 D/Tag( 123): message"
    const m = /^\d\d-\d\d \d\d:\d\d:\d\d\.\d+\s+([VDIWEF])\/(.+?)\(\s*\d+\):\s?(.*)$/.exec(line.trim());
    if (!m) continue;
    const sev = m[1];
    const level: LogEntry['level'] =
      sev === 'E' || sev === 'F' ? 'error' : sev === 'W' ? 'warn' : sev === 'I' ? 'info' : 'log';
    out.push({ level, message: `${m[2]}: ${m[3]}`, ts: Date.now(), origin: 'logcat' });
    if (/FATAL EXCEPTION|ANR in/.test(line)) {
      out[out.length - 1].level = 'error';
    }
  }
  return out;
}
