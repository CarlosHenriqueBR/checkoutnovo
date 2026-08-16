import type { Order, PixelAccountConfig, TrackingData } from '../types';
import { sha256, toE164BR } from '../utils';
import type { DispatchResult } from './google';

const GRAPH_VERSION = 'v21.0';

/** Meta Conversions API — evento Purchase, deduplicado com o pixel do navegador. */
export async function sendMetaPurchase(
  cfg: PixelAccountConfig,
  order: Order,
  tracking: TrackingData,
  accountName: string,
): Promise<DispatchResult> {
  const target = `meta:${accountName}`;
  if (!cfg.pixelId || !cfg.accessToken) {
    return { ok: false, target, error: 'pixelId ou accessToken ausente' };
  }

  const eventTime = Math.floor(Date.parse(order.paid_at || order.created_at) / 1000) || Math.floor(Date.now() / 1000);

  // fbc: se não veio pronto do navegador, reconstruímos a partir do fbclid.
  const fbc =
    tracking.fbc ||
    (tracking.fbclid ? `fb.1.${Math.floor(Date.parse(order.created_at) || Date.now())}.${tracking.fbclid}` : undefined);

  const user_data: Record<string, unknown> = {};
  if (order.customer_email) user_data.em = [await sha256(order.customer_email)];
  if (order.customer_phone) user_data.ph = [await sha256(toE164BR(order.customer_phone).replace('+', ''))];
  if (order.customer_name) {
    const [first, ...rest] = order.customer_name.trim().split(/\s+/);
    user_data.fn = [await sha256(first)];
    if (rest.length) user_data.ln = [await sha256(rest.join(' '))];
  }
  if (order.customer_document) user_data.external_id = [await sha256(order.customer_document)];
  if (fbc) user_data.fbc = fbc;
  if (tracking.fbp) user_data.fbp = tracking.fbp;
  if (order.ip) user_data.client_ip_address = order.ip;
  if (order.user_agent) user_data.client_user_agent = order.user_agent;
  user_data.country = [await sha256('br')];

  const payload: Record<string, unknown> = {
    data: [
      {
        event_name: 'Purchase',
        event_time: eventTime,
        event_id: order.transaction_id || order.id, // deduplicação com o pixel web
        action_source: 'website',
        event_source_url: tracking.landing_url || undefined,
        user_data,
        custom_data: {
          currency: 'BRL',
          value: order.amount_cents / 100,
          content_name: order.title,
          content_type: 'product',
          contents: [{ id: String(order.checkout_id ?? order.upsell_id ?? 'produto'), quantity: 1, item_price: order.amount_cents / 100 }],
          order_id: order.transaction_id || order.id,
        },
      },
    ],
  };
  if (cfg.testEventCode) payload.test_event_code = cfg.testEventCode;

  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${cfg.pixelId}/events?access_token=${encodeURIComponent(cfg.accessToken)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        cache: 'no-store',
      },
    );
    const text = await res.text();
    return { ok: res.ok, target, request: payload, response: text || `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, target, error: e instanceof Error ? e.message : 'erro', request: payload };
  }
}
