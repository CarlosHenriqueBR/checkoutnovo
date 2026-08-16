import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { one } from '@/lib/db';
import { safeJson } from '@/lib/utils';
import type { Checkout, CheckoutConfig, PixelAccount, PixelAccountConfig } from '@/lib/types';
import { all } from '@/lib/db';
import CheckoutClient from './CheckoutClient';
import PixelScripts from '@/components/PixelScripts';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function load(slug: string) {
  const checkout = one<Checkout>('SELECT * FROM checkouts WHERE slug = ? AND active = 1', [slug]);
  if (!checkout) return null;
  const pixels = all<PixelAccount>(
    `SELECT p.* FROM pixel_accounts p
       JOIN checkout_pixels cp ON cp.pixel_account_id = p.id
      WHERE cp.checkout_id = ? AND p.active = 1`,
    [checkout.id],
  );
  return { checkout, pixels };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = load(slug);
  return { title: data?.checkout.name ? `${data.checkout.name} — Checkout` : 'Checkout' };
}

export default async function CheckoutPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = load(slug);
  if (!data) notFound();

  const { checkout, pixels } = data;
  const config = safeJson<CheckoutConfig>(checkout.config_json, {});

  // Só o que o navegador precisa — chaves de API NUNCA vão para o cliente.
  const browserPixels = pixels
    .map((p) => {
      const cfg = safeJson<PixelAccountConfig>(p.config_json, {});
      if (p.platform === 'meta' && cfg.pixelId) return { platform: 'meta' as const, id: cfg.pixelId };
      if (p.platform === 'ga4' && cfg.measurementId) return { platform: 'ga4' as const, id: cfg.measurementId };
      if (p.platform === 'google_ads' && cfg.conversionId)
        return { platform: 'google_ads' as const, id: cfg.conversionId, label: cfg.conversionLabel || '' };
      if (p.platform === 'tiktok' && cfg.tiktokPixelId) return { platform: 'tiktok' as const, id: cfg.tiktokPixelId };
      if (p.platform === 'kwai' && cfg.kwaiPixelId) return { platform: 'kwai' as const, id: cfg.kwaiPixelId };
      return null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return (
    <>
      <PixelScripts pixels={browserPixels} event="InitiateCheckout" />
      <CheckoutClient
        slug={checkout.slug}
        name={checkout.name}
        headline={checkout.headline}
        subheadline={checkout.subheadline}
        imageUrl={checkout.image_url}
        priceCents={checkout.price_cents}
        downsellPriceCents={checkout.downsell_price_cents}
        downsellHeadline={checkout.downsell_headline}
        backredirectEnabled={!!checkout.backredirect_enabled}
        backredirectUrl={checkout.backredirect_url}
        exitOfferEnabled={!!checkout.exit_offer_enabled}
        config={config}
      />
    </>
  );
}
