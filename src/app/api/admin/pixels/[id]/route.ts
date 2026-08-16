import { NextRequest } from 'next/server';
import { run } from '@/lib/db';
import { guard, ok, int, str, bool, jsonStr } from '@/lib/adminHelpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard();
  if (g) return g;
  const { id } = await ctx.params;
  const b = await req.json().catch(() => ({}));
  run('UPDATE pixel_accounts SET name = ?, platform = ?, config_json = ?, active = ? WHERE id = ?', [
    str(b.name, 120),
    str(b.platform, 30),
    jsonStr(b.config),
    bool(b.active),
    int(id),
  ]);
  return ok();
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard();
  if (g) return g;
  const { id } = await ctx.params;
  run('DELETE FROM pixel_accounts WHERE id = ?', [int(id)]);
  return ok();
}
