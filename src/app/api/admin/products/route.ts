import { NextRequest } from 'next/server';
import { all, run } from '@/lib/db';
import { guard, ok, bad, int, str } from '@/lib/adminHelpers';
import type { Product } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const g = await guard();
  if (g) return g;
  return ok(all<Product>('SELECT * FROM products ORDER BY id DESC'));
}

export async function POST(req: NextRequest) {
  const g = await guard();
  if (g) return g;
  const b = await req.json().catch(() => ({}));
  const name = str(b.name, 160).trim();
  if (!name) return bad('Nome obrigatório');

  const r = run(
    'INSERT INTO products (name, description, image_url, price_cents, delivery_url) VALUES (?, ?, ?, ?, ?)',
    [name, str(b.description, 4000), str(b.image_url, 500), int(b.price_cents), str(b.delivery_url, 500)],
  );
  return ok({ id: Number(r.lastInsertRowid) });
}
