import type { Order, TrackingData } from '../types';
import { getSetting } from '../db';
import type { DispatchResult } from './google';

const ENDPOINT = 'https://api.utmify.com.br/api-credentials/orders';

/**
 * UTMify — envio de pedidos via API.
 * Enviamos DUAS vezes por pedido, com o MESMO orderId:
 *   1) na geração do PIX  -> status "waiting_payment"
 *   2) no webhook de pago -> status "paid"
 *
 * Os parâmetros de rastreamento vêm do MESMO objeto que gerou a string `utm`
 * mandada para a Duttyfy — é isso que amarra Duttyfy <-> checkout <-> UTMify.
 */

function utcStamp(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return null;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

export function utmifyToken(): string {
  return process.env.UTMIFY_API_TOKEN || getSetting('utmify_token', '');
}

export async function sendUtmifyOrder(
  order: Order,
  tracking: TrackingData,
  status: 'waiting_payment' | 'paid' | 'refused' | 'refunded',
): Promise<DispatchResult> {
  const target = `utmify:${status}`;
  const token = utmifyToken();
  if (!token) return { ok: false, target, error: 'token da UTMify não configurado' };

  const payload = {
    orderId: order.transaction_id || order.id,
    platform: 'VegaCheckout',
    paymentMethod: 'pix',
    status,
    createdAt: utcStamp(order.created_at),
    approvedDate: status === 'paid' ? utcStamp(order.paid_at || new Date().toISOString()) : null,
    refundedAt: null,
    customer: {
      name: order.customer_name,
      email: order.customer_email,
      phone: order.customer_phone || null,
      document: order.customer_document || null,
      country: 'BR',
      ip: order.ip || null,
    },
    products: [
      {
        id: String(order.checkout_id ?? order.upsell_id ?? 'produto'),
        name: order.title,
        planId: null,
        planName: null,
        quantity: 1,
        priceInCents: order.amount_cents,
      },
    ],
    trackingParameters: {
      src: tracking.src ?? null,
      sck: tracking.sck ?? null,
      utm_source: tracking.utm_source ?? null,
      utm_campaign: tracking.utm_campaign ?? null,
      utm_medium: tracking.utm_medium ?? null,
      utm_content: tracking.utm_content ?? null,
      utm_term: tracking.utm_term ?? null,
    },
    commission: {
      totalPriceInCents: order.amount_cents,
      gatewayFeeInCents: 0,
      userCommissionInCents: order.amount_cents,
    },
    isTest: process.env.GATEWAY_MOCK === '1',
  };

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-token': token },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
    const text = await res.text();
    return { ok: res.ok, target, request: payload, response: text || `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, target, error: e instanceof Error ? e.message : 'erro', request: payload };
  }
}
