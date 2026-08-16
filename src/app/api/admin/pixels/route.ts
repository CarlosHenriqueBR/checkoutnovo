import { NextRequest } from 'next/server';
import { all, run } from '@/lib/db';
import { guard, ok, bad, str, jsonStr } from '@/lib/adminHelpers';
import type { PixelAccount, Platform } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PLATFORMS: Platform[] = ['google_ads', 'ga4', 'meta', 'tiktok', 'kwai'];

export async function GET() {
  const g = await guard();
  if (g) return g;
  return ok(all<PixelAccount>('SELECT * FROM pixel_accounts ORDER BY platform, id'));
}

export async function POST(req: NextRequest) {
  const g = await guard();
  if (g) return g;
  const b = await req.json().catch(() => ({}));
  const name = str(b.name, 120).trim();
  const platform = str(b.platform, 30) as Platform;
  if (!name) return bad('Dê um nome para a conta (ex.: "Google Ads — Conta 1")');
  if (!PLATFORMS.includes(platform)) return bad('Plataforma inválida');

  const r = run('INSERT INTO pixel_accounts (name, platform, config_json, active) VALUES (?, ?, ?, 1)', [
    name,
    platform,
    jsonStr(b.config),
  ]);
  return ok({ id: Number(r.lastInsertRowid) });
}
