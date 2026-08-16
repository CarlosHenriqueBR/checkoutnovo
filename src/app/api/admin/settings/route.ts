import { NextRequest } from 'next/server';
import { all, setSetting } from '@/lib/db';
import { guard, ok, str } from '@/lib/adminHelpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SECRET_KEYS = new Set(['utmify_token']);

export async function GET() {
  const g = await guard();
  if (g) return g;
  const rows = all<{ key: string; value: string }>('SELECT key, value FROM settings');
  const out: Record<string, string> = {};
  for (const r of rows) {
    out[r.key] = SECRET_KEYS.has(r.key) && r.value ? `${r.value.slice(0, 4)}••••${r.value.slice(-4)}` : r.value;
  }
  return ok(out);
}

export async function POST(req: NextRequest) {
  const g = await guard();
  if (g) return g;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  for (const [k, v] of Object.entries(b)) {
    if (typeof v !== 'string') continue;
    if (SECRET_KEYS.has(k) && v.includes('••')) continue; // não sobrescreve o mascarado
    setSetting(str(k, 60), str(v, 2000));
  }
  return ok();
}
