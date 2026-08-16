import { NextRequest } from 'next/server';
import { all, run } from '@/lib/db';
import { guard, ok, bad, str, bool } from '@/lib/adminHelpers';
import type { Gateway } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** A URL encriptada é sensível — mascaramos ao listar. */
function mask(url: string): string {
  if (url.length <= 24) return '••••';
  return `${url.slice(0, 18)}••••${url.slice(-8)}`;
}

export async function GET() {
  const g = await guard();
  if (g) return g;
  const rows = all<Gateway>('SELECT * FROM gateways ORDER BY id');
  return ok(rows.map((r) => ({ ...r, encrypted_url: mask(r.encrypted_url), url_length: r.encrypted_url.length })));
}

export async function POST(req: NextRequest) {
  const g = await guard();
  if (g) return g;
  const b = await req.json().catch(() => ({}));
  const name = str(b.name, 120).trim() || 'Duttyfy';
  const url = str(b.encrypted_url, 1000).trim();
  if (!/^https:\/\//i.test(url)) return bad('Informe a URL encriptada completa (https://...)');

  const isDefault = bool(b.is_default);
  if (isDefault) run('UPDATE gateways SET is_default = 0');

  const r = run(
    'INSERT INTO gateways (name, provider, encrypted_url, is_default, active) VALUES (?, ?, ?, ?, 1)',
    [name, 'duttyfy', url, isDefault],
  );
  // Se for o primeiro, vira o padrão automaticamente.
  run('UPDATE gateways SET is_default = 1 WHERE id = ? AND NOT EXISTS (SELECT 1 FROM gateways WHERE is_default = 1)', [
    Number(r.lastInsertRowid),
  ]);
  return ok({ id: Number(r.lastInsertRowid) });
}
