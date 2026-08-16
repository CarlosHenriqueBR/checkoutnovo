import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { one } from '@/lib/db';
import { safeJson } from '@/lib/utils';
import type { Upsell, UpsellBlock, UpsellTheme } from '@/lib/types';
import UpsellClient from './UpsellClient';

export const dynamic = 'force-dynamic';

function load(slug: string) {
  return one<Upsell>('SELECT * FROM upsells WHERE slug = ? AND active = 1', [slug]);
}

function slugOf(id: number | null): string {
  if (!id) return '';
  return one<{ slug: string }>('SELECT slug FROM upsells WHERE id = ? AND active = 1', [id])?.slug ?? '';
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const u = load(slug);
  return { title: u?.name ?? 'Oferta especial' };
}

export default async function UpsellPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const upsell = load(slug);
  if (!upsell) notFound();

  const blocks = safeJson<UpsellBlock[]>(upsell.blocks_json, []);
  const theme = safeJson<UpsellTheme>(upsell.theme_json, {});

  return (
    <UpsellClient
      slug={upsell.slug}
      name={upsell.name}
      headline={upsell.headline}
      subheadline={upsell.subheadline}
      imageUrl={upsell.image_url}
      bodyHtml={upsell.body_html}
      blocks={blocks}
      theme={theme}
      priceCents={upsell.price_cents}
      downsellPriceCents={upsell.downsell_price_cents}
      downsellHeadline={upsell.downsell_headline}
      acceptLabel={upsell.accept_label}
      declineLabel={upsell.decline_label}
      nextOnAccept={slugOf(upsell.next_on_accept_id)}
      nextOnDecline={slugOf(upsell.next_on_decline_id)}
      finalUrl={upsell.final_url || '/obrigado'}
    />
  );
}
