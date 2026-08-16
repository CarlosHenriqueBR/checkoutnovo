import type { Order, PixelAccountConfig, TrackingData } from '../types';
import { sha256, toE164BR } from '../utils';
import type { DispatchResult } from './google';

const ENDPOINT = 'https://business-api.tiktok.com/open_api/v1.3/event/track/';

/** TikTok Events API 2.0 — evento CompletePayment usando o ttclid. */
export async function sendTikTokPurchase(
  cfg: PixelAccountConfig,
  order: Order,
  tracking: TrackingData,
  accountName: string,
): Promise<DispatchResult> {
  const target = `tiktok:${accountName}`;
  if (!cfg.tiktokPixelId || !cfg.tiktokAccessToken) {
    return { ok: false, target, error: 'tiktokPixelId ou tiktokAccessToken ausente' };
  }

  const user: Record<string, unknown> = {};
  if (order.customer_email) user.email = await sha256(order.customer_email);
  if (order.customer_phone) user.phone = await sha256(toE164BR(order.customer_phone));
  if (order.customer_document) user.external_id = await sha256(order.customer_document);
  if (tracking.ttclid) user.ttclid = tracking.ttclid;
  if (order.ip) user.ip = order.ip;
  if (order.user_agent) user.user_agent = order.user_agent;

  const payload = {
    event_source: 'web',
    event_source_id: cfg.tiktokPixelId,
    data: [
      {
        event: 'CompletePayment',
        event_time: Math.floor(Date.parse(order.paid_at || order.created_at) / 1000) || Math.floor(Date.now() / 1000),
        event_id: order.transaction_id || order.id,
        user,
        page: { url: tracking.landing_url || undefined, referrer: tracking.referrer || undefined },
        properties: {
          currency: 'BRL',
          value: order.amount_cents / 100,
          order_id: order.transaction_id || order.id,
          contents: [
            {
              content_id: String(order.checkout_id ?? order.upsell_id ?? 'produto'),
              content_name: order.title,
              content_type: 'product',
              price: order.amount_cents / 100,
              quantity: 1,
            },
          ],
        },
      },
    ],
  };

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Access-Token': cfg.tiktokAccessToken },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
    const text = await res.text();
    return { ok: res.ok, target, request: payload, response: text || `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, target, error: e instanceof Error ? e.message : 'erro', request: payload };
  }
}
