import { NextRequest } from 'next/server';
import { run } from '@/lib/db';
import { guard, ok, int, str, bool } from '@/lib/adminHelpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard();
  if (g) return g;
  const { id: rawId } = await ctx.params;
  const id = int(rawId);
  const b = await req.json().catch(() => ({}));

  if (bool(b.is_default)) run('UPDATE gateways SET is_default = 0');

  const url = str(b.encrypted_url, 1000).trim();
  if (url && /^https:\/\//i.test(url)) {
    run('UPDATE gateways SET encrypted_url = ? WHERE id = ?', [url, id]);
  }
  run('UPDATE gateways SET name = ?, is_default = ?, active = ? WHERE id = ?', [
    str(b.name, 120),
    bool(b.is_default),
    bool(b.active),
    id,
  ]);
  return ok();
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard();
  if (g) return g;
  const { id } = await ctx.params;
  run('DELETE FROM gateways WHERE id = ?', [int(id)]);
  return ok();
}
