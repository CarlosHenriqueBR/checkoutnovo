import { NextRequest } from 'next/server';
import { run, one } from '@/lib/db';
import { guard, ok, int, str, bool, jsonStr, syncPixels } from '@/lib/adminHelpers';
import { slugify } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard();
  if (g) return g;
  const { id: rawId } = await ctx.params;
  const id = int(rawId);
  const b = await req.json().catch(() => ({}));

  let slug = slugify(str(b.slug, 80));
  if (!slug) slug = String(one<{ slug: string }>('SELECT slug FROM checkouts WHERE id = ?', [id])?.slug ?? `checkout-${id}`);
  const clash = one<{ id: number }>('SELECT id FROM checkouts WHERE slug = ? AND id <> ?', [slug, id]);
  if (clash) slug = `${slug}-${id}`;

  run(
    `UPDATE checkouts SET
       slug = ?, name = ?, product_id = ?, gateway_id = ?, headline = ?, subheadline = ?, image_url = ?,
       price_cents = ?, downsell_price_cents = ?, downsell_headline = ?,
       backredirect_enabled = ?, backredirect_url = ?, exit_offer_enabled = ?,
       upsell_id = ?, thankyou_url = ?, config_json = ?, active = ?, updated_at = datetime('now')
     WHERE id = ?`,
    [
      slug,
      str(b.name, 160),
      b.product_id ? int(b.product_id) : null,
      b.gateway_id ? int(b.gateway_id) : null,
      str(b.headline, 200),
      str(b.subheadline, 300),
      str(b.image_url, 500),
      int(b.price_cents),
      int(b.downsell_price_cents),
      str(b.downsell_headline, 200),
      bool(b.backredirect_enabled),
      str(b.backredirect_url, 500),
      bool(b.exit_offer_enabled),
      b.upsell_id ? int(b.upsell_id) : null,
      str(b.thankyou_url, 500),
      jsonStr(b.config),
      bool(b.active),
      id,
    ],
  );

  syncPixels(id, b.pixel_ids);
  return ok({ id, slug });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard();
  if (g) return g;
  const { id } = await ctx.params;
  run('DELETE FROM checkouts WHERE id = ?', [int(id)]);
  return ok();
}
