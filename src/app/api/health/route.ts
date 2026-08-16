import { NextResponse } from 'next/server';
import { one } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Healthcheck do Railway: confirma que o app subiu e que o banco responde. */
export async function GET() {
  try {
    one('SELECT 1 AS ok');
    return NextResponse.json({ ok: true, db: true, ts: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'db error' }, { status: 500 });
  }
}
