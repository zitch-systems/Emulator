// POST /api/inspect — parse an uploaded .apk / .ipa / web-build .zip into AppInfo.
// Accepts multipart/form-data (field "file") or JSON { filename, base64 }.

import { NextRequest, NextResponse } from 'next/server';
import { inspectPackage } from '@/lib/emu/inspect';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const ct = req.headers.get('content-type') || '';
    let bytes: Uint8Array;
    let filename = 'upload';

    if (ct.includes('multipart/form-data')) {
      const form = await req.formData();
      const file = form.get('file');
      if (!file || typeof file === 'string') {
        return NextResponse.json({ error: 'No file provided' }, { status: 400 });
      }
      filename = file.name || filename;
      bytes = new Uint8Array(await file.arrayBuffer());
    } else {
      const body = await req.json();
      if (!body.base64) return NextResponse.json({ error: 'Missing base64' }, { status: 400 });
      filename = body.filename || filename;
      bytes = new Uint8Array(Buffer.from(body.base64, 'base64'));
    }

    if (bytes.byteLength === 0) {
      return NextResponse.json({ error: 'Empty file' }, { status: 400 });
    }
    if (bytes.byteLength > 300 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large (>300MB)' }, { status: 413 });
    }

    const info = await inspectPackage(bytes, filename);
    return NextResponse.json({ info });
  } catch (e) {
    return NextResponse.json(
      { error: 'Inspection failed: ' + (e as Error).message },
      { status: 500 },
    );
  }
}
