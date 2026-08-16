import { all, one, run } from './db';
import type { Order, PixelAccount, PixelAccountConfig, TrackingData } from './types';
import { safeJson } from './utils';
import { sendGa4Purchase, sendGoogleAdsConversion, type DispatchResult } from './integrations/google';
import { sendMetaPurchase } from './integrations/meta';
import { sendTikTokPurchase } from './integrations/tiktok';
import { sendKwaiPurchase } from './integrations/kwai';
import { sendUtmifyOrder } from './integrations/utmify';

/**
 * Orquestrador de conversões.
 * Chamado quando um pedido vira PAGO (webhook ou polling), uma única vez
 * por transação (idempotência garantida antes da chamada).
 */

/** Resolve o checkout de origem — upsell herda os pixels do checkout que originou a venda. */
function resolveCheckoutId(order: Order): number | null {
  if (order.checkout_id) return order.checkout_id;
  if (order.parent_order_id) {
    const parent = one<Order>('SELECT * FROM orders WHERE id = ?', [order.parent_order_id]);
    if (parent) return resolveCheckoutId(parent);
  }
  return null;
}

export function pixelsForOrder(order: Order): PixelAccount[] {
  const checkoutId = resolveCheckoutId(order);
  if (!checkoutId) {
    // Sem checkout vinculado: dispara para todas as contas ativas.
    return all<PixelAccount>('SELECT * FROM pixel_accounts WHERE active = 1');
  }
  return all<PixelAccount>(
    `SELECT p.* FROM pixel_accounts p
      JOIN checkout_pixels cp ON cp.pixel_account_id = p.id
     WHERE cp.checkout_id = ? AND p.active = 1`,
    [checkoutId],
  );
}

function logDispatch(orderId: string, r: DispatchResult) {
  run('INSERT INTO dispatch_log (order_id, target, ok, request, response) VALUES (?, ?, ?, ?, ?)', [
    orderId,
    r.target,
    r.ok ? 1 : 0,
    JSON.stringify(r.request ?? null).slice(0, 8000),
    (r.error ? `ERRO: ${r.error} | ` : '') + JSON.stringify(r.response ?? null).slice(0, 8000),
  ]);
}

/** Dispara o evento de VENDA PAGA para todas as contas vinculadas + UTMify. */
export async function dispatchPurchase(order: Order): Promise<DispatchResult[]> {
  const tracking = safeJson<TrackingData>(order.tracking_json, {});
  const accounts = pixelsForOrder(order);

  const jobs: Promise<DispatchResult>[] = [];

  for (const acc of accounts) {
    const cfg = safeJson<PixelAccountConfig>(acc.config_json, {});
    switch (acc.platform) {
      case 'ga4':
        jobs.push(sendGa4Purchase(cfg, order, tracking, acc.name));
        break;
      case 'google_ads':
        jobs.push(sendGoogleAdsConversion(cfg, order, tracking, acc.name));
        break;
      case 'meta':
        jobs.push(sendMetaPurchase(cfg, order, tracking, acc.name));
        break;
      case 'tiktok':
        jobs.push(sendTikTokPurchase(cfg, order, tracking, acc.name));
        break;
      case 'kwai':
        jobs.push(sendKwaiPurchase(cfg, order, tracking, acc.name));
        break;
    }
  }

  jobs.push(sendUtmifyOrder(order, tracking, 'paid'));

  const results = await Promise.all(
    jobs.map((p) =>
      p.catch((e): DispatchResult => ({ ok: false, target: 'desconhecido', error: String(e) })),
    ),
  );
  for (const r of results) logDispatch(order.id, r);
  return results;
}

/** Dispara o pedido gerado (PIX criado, ainda não pago) para a UTMify. */
export async function dispatchOrderCreated(order: Order): Promise<void> {
  const tracking = safeJson<TrackingData>(order.tracking_json, {});
  try {
    const r = await sendUtmifyOrder(order, tracking, 'waiting_payment');
    logDispatch(order.id, r);
  } catch {
    /* não bloqueia a criação do PIX */
  }
}
