import { NextRequest } from 'next/server';
import { all, run, one } from '@/lib/db';
import { guard, ok, bad, int, str, bool, jsonStr } from '@/lib/adminHelpers';
import { slugify } from '@/lib/utils';
import type { Upsell } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const g = await guard();
  if (g) return g;
  return ok(all<Upsell>('SELECT * FROM upsells ORDER BY id DESC'));
}

export async function POST(req: NextRequest) {
  const g = await guard();
  if (g) return g;
  const b = await req.json().catch(() => ({}));
  const name = str(b.name, 160).trim();
  if (!name) return bad('Nome obrigatório');

  let slug = slugify(str(b.slug, 80) || name) || `upsell-${Date.now()}`;
  if (one('SELECT id FROM upsells WHERE slug = ?', [slug])) slug = `${slug}-${Date.now().toString(36)}`;

  const r = run(
    `INSERT INTO upsells
       (slug, name, headline, subheadline, image_url, body_html, blocks_json,
        price_cents, downsell_price_cents, downsell_headline,
        accept_label, decline_label, next_on_accept_id, next_on_decline_id, final_url, theme_json, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [
      slug,
      name,
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
      b.next_on_accept_id ? int(b.next_on_accept_id) : null,
      b.next_on_decline_id ? int(b.next_on_decline_id) : null,
      str(b.final_url, 500),
      jsonStr(b.theme),
    ],
  );
  return ok({ id: Number(r.lastInsertRowid), slug });
}
