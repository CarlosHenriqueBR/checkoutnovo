import { NextRequest, NextResponse } from 'next/server';
import { run } from '@/lib/db';
import { buildUtmString, normalizeTracking } from '@/lib/attribution';
import { uid } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/** Backup server-side do rastreio capturado na página de entrada. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const tracking = normalizeTracking(body);
    const id = String(body?.session_id || uid()).slice(0, 64);

    run(
      `INSERT INTO tracking_sessions (id, utm_raw, tracking_json, landing_url, referrer, ip, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         utm_raw = excluded.utm_raw,
         tracking_json = excluded.tracking_json`,
      [
        id,
        buildUtmString(tracking),
        JSON.stringify(tracking),
        String(body?.landing_url || '').slice(0, 500),
        String(body?.referrer || '').slice(0, 500),
        req.headers.get('x-forwarded-for')?.split(',')[0].trim() || '',
        req.headers.get('user-agent') || '',
      ],
    );

    return NextResponse.json({ ok: true, session_id: id }, { headers: CORS });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400, headers: CORS });
  }
}
