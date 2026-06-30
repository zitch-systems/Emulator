// Shared Playwright Chromium launcher (server only). Resolves the browser
// executable across environments: an explicit env override, the pre-provisioned
// path used by this hosting environment, or playwright's own default download.

import { existsSync } from 'node:fs';
import { chromium, type Browser } from 'playwright-core';

let browserPromise: Promise<Browser> | null = null;

function resolveExecutable(): string | undefined {
  const candidates = [
    process.env.PLAYWRIGHT_EXECUTABLE_PATH,
    process.env.PLAYWRIGHT_CHROMIUM_PATH,
    '/opt/pw-browsers/chromium', // symlink in the managed environment
  ].filter(Boolean) as string[];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  // Fall back to playwright's bundled location (works on a normal dev machine
  // after `npx playwright install chromium`).
  try {
    const def = chromium.executablePath();
    if (def && existsSync(def)) return def;
  } catch {
    /* ignore */
  }
  return undefined;
}

export async function getBrowser(): Promise<Browser> {
  if (browserPromise) {
    const b = await browserPromise.catch(() => null);
    if (b && b.isConnected()) return b;
    browserPromise = null;
  }
  browserPromise = chromium.launch({
    executablePath: resolveExecutable(),
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });
  return browserPromise;
}

export async function closeBrowser() {
  if (!browserPromise) return;
  const b = await browserPromise.catch(() => null);
  browserPromise = null;
  if (b) await b.close().catch(() => undefined);
}
