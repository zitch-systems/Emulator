// Zip writer for the report export bundle (report.md + screenshots/*.png).
// Browser-side, uses jszip. Port of emu/zipw.js.

import JSZip from 'jszip';
import type { Shot } from '@/lib/types';

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(',');
  const b64 = dataUrl.slice(comma + 1);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export async function buildReportZip(markdown: string, shots: Shot[]): Promise<Blob> {
  const zip = new JSZip();
  zip.file('report.md', markdown);
  if (shots.length) {
    const dir = zip.folder('screenshots')!;
    for (const s of shots) dir.file(`${s.id}.png`, dataUrlToBytes(s.dataUrl));
  }
  return zip.generateAsync({ type: 'blob' });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(text: string, filename: string, mime = 'text/markdown') {
  downloadBlob(new Blob([text], { type: mime }), filename);
}
