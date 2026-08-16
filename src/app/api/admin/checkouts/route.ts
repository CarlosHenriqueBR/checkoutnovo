import { NextRequest } from 'next/server';
import { all, run, one } from '@/lib/db';
import { guard, ok, bad, int, str, bool, jsonStr, syncPixels } from '@/lib/adminHelpers';
import { slugify } from '@/lib/utils';
import type { Checkout } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const g = await guard();
  if (g) return g;
  const rows = all<Checkout>('SELECT * FROM checkouts ORDER BY id DESC');
  const pixels = all<{ checkout_id: number; pixel_account_id: number }>('SELECT * FROM checkout_pixels');
  return ok(
    rows.map((c) => ({
      ...c,
      pixel_ids: pixels.filter((p) => p.checkout_id === c.id).map((p) => p.pixel_account_id),
    })),
  );
}

export async function POST(req: NextRequest) {
  const g = await guard();
  if (g) return g;
  const b = await req.json().catch(() => ({}));
  const name = str(b.name, 160).trim();
  if (!name) return bad('Nome obrigatório');

  let slug = slugify(str(b.slug, 80) || name);
  if (!slug) slug = `checkout-${Date.now()}`;
  if (one('SELECT id FROM checkouts WHERE slug = ?', [slug])) slug = `${slug}-${Date.now().toString(36)}`;

  const r = run(
    `INSERT INTO checkouts
      (slug, name, product_id, gateway_id, headline, subheadline, image_url,
       price_cents, downsell_price_cents, downsell_headline,
       backredirect_enabled, backredirect_url, exit_offer_enabled,
       upsell_id, thankyou_url, config_json, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [
      slug,
      name,
      b.product_id ? int(b.product_id) : null,
      b.gateway_id ? int(b.gateway_id) : null,
      str(b.headline, 200),
      str(b.subheadline, 300),
      str(b.image_url, 500),
      int(b.price_cents),
      int(b.downsell_price_cents),
      str(b.downsell_headline, 200),
      bool(b.backredirect_enabled ?? true),
      str(b.backredirect_url, 500),
      bool(b.exit_offer_enabled ?? true),
      b.upsell_id ? int(b.upsell_id) : null,
      str(b.thankyou_url, 500),
      jsonStr(b.config),
    ],
  );

  const id = Number(r.lastInsertRowid);
  syncPixels(id, b.pixel_ids);
  return ok({ id, slug });
}
