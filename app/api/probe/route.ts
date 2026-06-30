// POST /api/probe — universal headless device emulation of any URL via Playwright.
// Renders the page at a real device profile (viewport, DPR, UA, touch), captures
// console logs, page errors, unhandled rejections and network calls, and returns
// a screenshot. This is the engine that tests/audits ANY PWA or web build,
// including cross-origin URLs the in-browser iframe can't read.

import { NextRequest, NextResponse } from 'next/server';
import type { LogEntry, NetEntry, ProbeResult } from '@/lib/types';
import { getDevice } from '@/lib/emu/devices';
import { getBrowser } from '@/lib/server/browser';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 90;

export async function POST(req: NextRequest) {
  const started = Date.now();
  let url = '';
  try {
    const body = await req.json();
    url = String(body.url || '').trim();
    const deviceId = String(body.deviceId || 'iphone-15-pro');
    const fullPage = Boolean(body.fullPage);
    const landscape = Boolean(body.landscape);
    const settleMs = Math.min(Math.max(Number(body.settleMs) || 1500, 0), 8000);

    if (!url) return NextResponse.json({ error: 'Missing url' }, { status: 400 });
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

    const device = getDevice(deviceId);
    const vw = landscape ? device.height : device.width;
    const vh = landscape ? device.width : device.height;
    const isTablet = /ipad|tablet/.test(device.id);

    const browser = await getBrowser();
    const context = await browser.newContext({
      viewport: { width: vw, height: vh },
      deviceScaleFactor: device.dpr,
      isMobile: !isTablet,
      hasTouch: true,
      userAgent: device.ua,
      ignoreHTTPSErrors: true,
    });

    const logs: LogEntry[] = [];
    const net: NetEntry[] = [];
    const starts = new Map<string, number>();

    const page = await context.newPage();

    page.on('console', (msg) => {
      const type = msg.type();
      const level: LogEntry['level'] =
        type === 'error' ? 'error' : type === 'warning' ? 'warn' : type === 'info' ? 'info' : 'log';
      logs.push({ level, message: msg.text(), ts: Date.now(), origin: 'console' });
    });
    page.on('pageerror', (err) => {
      logs.push({
        level: 'error',
        message: err.message,
        ts: Date.now(),
        origin: 'pageerror',
        stack: err.stack,
      });
    });
    page.on('request', (r) => starts.set(r.url() + r.method(), Date.now()));
    page.on('requestfailed', (r) => {
      const key = r.url() + r.method();
      net.push({
        method: r.method(),
        url: r.url(),
        status: 0,
        ms: Date.now() - (starts.get(key) ?? Date.now()),
        ts: Date.now(),
        ok: false,
        error: r.failure()?.errorText || 'request failed',
      });
    });
    page.on('response', (res) => {
      const r = res.request();
      const key = r.url() + r.method();
      net.push({
        method: r.method(),
        url: r.url(),
        status: res.status(),
        ms: Date.now() - (starts.get(key) ?? Date.now()),
        ts: Date.now(),
        ok: res.ok(),
      });
    });

    let status: number | undefined;
    let title = '';
    try {
      const resp = await page.goto(url, { waitUntil: 'load', timeout: 30000 });
      status = resp?.status();
    } catch (e) {
      logs.push({
        level: 'error',
        message: 'Navigation error: ' + (e as Error).message,
        ts: Date.now(),
        origin: 'navigation',
      });
    }
    await page.waitForTimeout(settleMs);
    try {
      title = await page.title();
    } catch {
      /* ignore */
    }

    let screenshotDataUrl: string | undefined;
    try {
      const buf = await page.screenshot({ type: 'png', fullPage });
      screenshotDataUrl = 'data:image/png;base64,' + buf.toString('base64');
    } catch {
      /* ignore */
    }

    await context.close();

    const result: ProbeResult = {
      ok: true,
      url,
      device: device.name,
      status,
      title,
      logs,
      net,
      screenshotDataUrl,
      durationMs: Date.now() - started,
    };
    return NextResponse.json(result);
  } catch (e) {
    const result: ProbeResult = {
      ok: false,
      url,
      device: '',
      logs: [],
      net: [],
      durationMs: Date.now() - started,
      error: (e as Error).message,
    };
    return NextResponse.json(result, { status: 500 });
  }
}
