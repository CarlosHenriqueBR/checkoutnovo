import type { Order, PixelAccountConfig, TrackingData } from '../types';
import type { DispatchResult } from './google';

const ENDPOINT = 'https://www.adsnebula.com/log/common/api';

/**
 * Kwai Ads — Event API.
 * O click ID do Kwai chega na URL como `click_id` e é obrigatório para atribuir.
 */
export async function sendKwaiPurchase(
  cfg: PixelAccountConfig,
  order: Order,
  tracking: TrackingData,
  accountName: string,
): Promise<DispatchResult> {
  const target = `kwai:${accountName}`;
  if (!cfg.kwaiPixelId || !cfg.kwaiAccessToken) {
    return { ok: false, target, error: 'kwaiPixelId ou kwaiAccessToken ausente' };
  }
  if (!tracking.click_id) {
    return { ok: false, target, error: 'sem click_id — clique não veio do Kwai Ads' };
  }

  const payload = {
    access_token: cfg.kwaiAccessToken,
    clickid: tracking.click_id,
    event_name: 'EVENT_PURCHASE',
    is_attributed: 1,
    mmpcode: 'PL',
    pixelId: cfg.kwaiPixelId,
    pixelSdkVersion: '9.9.9',
    testFlag: false,
    third_party: 'vega-checkout',
    trackFlag: true,
    properties: JSON.stringify({
      currency: 'BRL',
      value: order.amount_cents / 100,
      content_id: String(order.checkout_id ?? order.upsell_id ?? 'produto'),
      content_name: order.title,
      content_type: 'product',
      quantity: 1,
      order_id: order.transaction_id || order.id,
    }),
  };

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
    const text = await res.text();
    return { ok: res.ok, target, request: { ...payload, access_token: '***' }, response: text || `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, target, error: e instanceof Error ? e.message : 'erro' };
  }
}
