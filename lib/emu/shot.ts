// Client-side screenshot capture via html2canvas. Same-origin guests (blob web
// builds, demo) capture fully; cross-origin iframes cannot be read by the
// browser, so we throw and the caller falls back to the server Playwright probe
// (which screenshots any URL). Native screenshots come from adb/simctl instead.

export async function captureElement(el: HTMLElement): Promise<string> {
  const mod = await import('html2canvas');
  const html2canvas = (mod as unknown as { default: typeof import('html2canvas').default }).default;
  const canvas = await html2canvas(el, {
    backgroundColor: null,
    useCORS: true,
    logging: false,
    scale: window.devicePixelRatio || 2,
  });
  return canvas.toDataURL('image/png');
}

/** Capture the live content of a same-origin iframe. Throws if cross-origin. */
export async function captureIframe(iframe: HTMLIFrameElement): Promise<string> {
  let doc: Document | null = null;
  try {
    doc = iframe.contentDocument;
  } catch {
    doc = null;
  }
  if (!doc || !doc.documentElement) {
    throw new Error('cross-origin');
  }
  const target = (doc.body as HTMLElement) || doc.documentElement;
  const mod = await import('html2canvas');
  const html2canvas = (mod as unknown as { default: typeof import('html2canvas').default }).default;
  const canvas = await html2canvas(target, {
    backgroundColor: '#ffffff',
    useCORS: true,
    logging: false,
    width: doc.documentElement.clientWidth,
    height: doc.documentElement.clientHeight,
    windowWidth: doc.documentElement.clientWidth,
    windowHeight: doc.documentElement.clientHeight,
  });
  return canvas.toDataURL('image/png');
}
