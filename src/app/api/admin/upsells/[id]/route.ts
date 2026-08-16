import { NextRequest } from 'next/server';
import { run, one } from '@/lib/db';
import { guard, ok, int, str, bool, jsonStr } from '@/lib/adminHelpers';
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
  if (!slug) slug = String(one<{ slug: string }>('SELECT slug FROM upsells WHERE id = ?', [id])?.slug ?? `upsell-${id}`);
  if (one('SELECT id FROM upsells WHERE slug = ? AND id <> ?', [slug, id])) slug = `${slug}-${id}`;

  // Evita loop: um upsell não pode apontar para si mesmo.
  const nextAccept = b.next_on_accept_id ? int(b.next_on_accept_id) : null;
  const nextDecline = b.next_on_decline_id ? int(b.next_on_decline_id) : null;

  run(
    `UPDATE upsells SET
       slug = ?, name = ?, headline = ?, subheadline = ?, image_url = ?, body_html = ?, blocks_json = ?,
       price_cents = ?, downsell_price_cents = ?, downsell_headline = ?,
       accept_label = ?, decline_label = ?, next_on_accept_id = ?, next_on_decline_id = ?,
       final_url = ?, theme_json = ?, active = ?, updated_at = datetime('now')
     WHERE id = ?`,
    [
      slug,
      str(b.name, 160),
      str(b.headline, 200),
      str(b.subheadline, 300),
      str(b.image_url, 500),
      str(b.body_html, 20000),
      jsonStr(b.blocks, '[]'),
      int(b.price_cents),
      int(b.downsell_price_cents),
      str(b.downsell_headline, 200),
      str(b.accept_label, 80) || 'SIM, EU QUERO!',
      str(b.decline_label, 80) || 'Não, obrigado',
      nextAccept === id ? null : nextAccept,
      nextDecline === id ? null : nextDecline,
      str(b.final_url, 500),
      jsonStr(b.theme),
      bool(b.active),
      id,
    ],
  );
  return ok({ id, slug });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard();
  if (g) return g;
  const { id } = await ctx.params;
  const n = int(id);
  run('UPDATE upsells SET next_on_accept_id = NULL WHERE next_on_accept_id = ?', [n]);
  run('UPDATE upsells SET next_on_decline_id = NULL WHERE next_on_decline_id = ?', [n]);
  run('UPDATE checkouts SET upsell_id = NULL WHERE upsell_id = ?', [n]);
  run('DELETE FROM upsells WHERE id = ?', [n]);
  return ok();
}
