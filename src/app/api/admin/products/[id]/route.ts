import { NextRequest } from 'next/server';
import { run } from '@/lib/db';
import { guard, ok, int, str } from '@/lib/adminHelpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard();
  if (g) return g;
  const { id } = await ctx.params;
  const b = await req.json().catch(() => ({}));
  run(
    'UPDATE products SET name = ?, description = ?, image_url = ?, price_cents = ?, delivery_url = ? WHERE id = ?',
    [str(b.name, 160), str(b.description, 4000), str(b.image_url, 500), int(b.price_cents), str(b.delivery_url, 500), int(id)],
  );
  return ok();
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard();
  if (g) return g;
  const { id } = await ctx.params;
  run('DELETE FROM products WHERE id = ?', [int(id)]);
  return ok();
}
