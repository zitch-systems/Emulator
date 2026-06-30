// POST /api/appetize — Strategy B (cloud device farm). Uploads an .apk/.ipa to
// Appetize.io and returns a publicKey the client embeds as a streamed REAL
// device. Optional: requires the user's own Appetize API token. Without it the
// studio falls back to inspect + framed web build (honesty rule).
//
// Reference: https://docs.appetize.io  (POST /v2/apps)

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const APPETIZE_API = 'https://api.appetize.io/v1/apps';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const token = String(body.token || '');
    const platform = String(body.platform || 'android');
    if (!token) {
      return NextResponse.json(
        { error: 'Appetize API token required. Add it in Settings to stream real native devices.' },
        { status: 401 },
      );
    }

    // Two supported inputs: a public artifact URL, or base64 bytes we forward.
    let res: Response;
    if (body.url) {
      res = await fetch(APPETIZE_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-KEY': token },
        body: JSON.stringify({ url: String(body.url), platform }),
      });
    } else if (body.base64) {
      const bytes = Buffer.from(String(body.base64), 'base64');
      const filename = String(body.filename || (platform === 'ios' ? 'app.ipa' : 'app.apk'));
      const form = new FormData();
      form.append('platform', platform);
      form.append(
        'file',
        new Blob([new Uint8Array(bytes)], { type: 'application/octet-stream' }),
        filename,
      );
      res = await fetch(APPETIZE_API, {
        method: 'POST',
        headers: { 'X-API-KEY': token },
        body: form,
      });
    } else {
      return NextResponse.json({ error: 'Provide either url or base64' }, { status: 400 });
    }

    const text = await res.text();
    let json: Record<string, unknown> = {};
    try {
      json = JSON.parse(text);
    } catch {
      /* non-json error body */
    }
    if (!res.ok) {
      return NextResponse.json(
        { error: `Appetize upload failed (${res.status}): ${(json.message as string) || text.slice(0, 200)}` },
        { status: 502 },
      );
    }

    return NextResponse.json({
      publicKey: json.publicKey,
      appURL: json.appURL,
      platform,
    });
  } catch (e) {
    return NextResponse.json({ error: 'Appetize error: ' + (e as Error).message }, { status: 500 });
  }
}
