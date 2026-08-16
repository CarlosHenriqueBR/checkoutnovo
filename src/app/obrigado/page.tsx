import { all, one } from '@/lib/db';
import { safeJson, brl } from '@/lib/utils';
import type { Order, PixelAccount, PixelAccountConfig, Product, Checkout } from '@/lib/types';
import PixelScripts, { type BrowserPixel } from '@/components/PixelScripts';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Obrigado pela compra!' };

function pixelsFor(order: Order | undefined): BrowserPixel[] {
  if (!order) return [];
  let checkoutId = order.checkout_id;
  let cursor: Order | undefined = order;
  while (!checkoutId && cursor?.parent_order_id) {
    cursor = one<Order>('SELECT * FROM orders WHERE id = ?', [cursor.parent_order_id]);
    checkoutId = cursor?.checkout_id ?? null;
  }
  const rows = checkoutId
    ? all<PixelAccount>(
        `SELECT p.* FROM pixel_accounts p
           JOIN checkout_pixels cp ON cp.pixel_account_id = p.id
          WHERE cp.checkout_id = ? AND p.active = 1`,
        [checkoutId],
      )
    : [];

  return rows
    .map((p): BrowserPixel | null => {
      const cfg = safeJson<PixelAccountConfig>(p.config_json, {});
      if (p.platform === 'meta' && cfg.pixelId) return { platform: 'meta', id: cfg.pixelId };
      if (p.platform === 'ga4' && cfg.measurementId) return { platform: 'ga4', id: cfg.measurementId };
      if (p.platform === 'google_ads' && cfg.conversionId)
        return { platform: 'google_ads', id: cfg.conversionId, label: cfg.conversionLabel || '' };
      if (p.platform === 'tiktok' && cfg.tiktokPixelId) return { platform: 'tiktok', id: cfg.tiktokPixelId };
      if (p.platform === 'kwai' && cfg.kwaiPixelId) return { platform: 'kwai', id: cfg.kwaiPixelId };
      return null;
    })
    .filter((x): x is BrowserPixel => x !== null);
}

export default async function ObrigadoPage({ searchParams }: { searchParams: Promise<{ o?: string }> }) {
  const { o } = await searchParams;
  const order = o ? one<Order>("SELECT * FROM orders WHERE id = ? AND status = 'COMPLETED'", [o]) : undefined;

  let deliveryUrl = '';
  if (order?.checkout_id) {
    const ck = one<Checkout>('SELECT * FROM checkouts WHERE id = ?', [order.checkout_id]);
    if (ck?.product_id) {
      deliveryUrl = one<Product>('SELECT * FROM products WHERE id = ?', [ck.product_id])?.delivery_url ?? '';
    }
  }

  return (
    <>
      {order && (
        <PixelScripts
          pixels={pixelsFor(order)}
          event="Purchase"
          purchase={{
            value: order.amount_cents / 100,
            currency: 'BRL',
            transactionId: order.transaction_id || order.id,
            contentName: order.title,
          }}
        />
      )}
      <div className="ck-topbar">Pagamento aprovado</div>
      <div className="ck-wrap">
        <div className="ck-card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 44, lineHeight: 1 }}>✅</div>
          <h1 className="ck-card-title" style={{ fontSize: 22, marginTop: 10 }}>Compra confirmada!</h1>
          {order ? (
            <>
              <p className="ck-sub">
                {order.title} — {brl(order.amount_cents)}
              </p>
              <p className="ck-sub" style={{ marginTop: 8 }}>
                Enviamos os dados de acesso para <b>{order.customer_email}</b>.
              </p>
              {deliveryUrl && (
                <a className="ck-btn" style={{ marginTop: 16 }} href={deliveryUrl}>
                  ACESSAR AGORA
                </a>
              )}
              <p className="ck-notice mono">Pedido {order.transaction_id || order.id}</p>
            </>
          ) : (
            <p className="ck-sub">Obrigado! Em instantes você receberá os dados de acesso por e-mail.</p>
          )}
        </div>
      </div>
    </>
  );
}
