import type { Order, PixelAccountConfig, TrackingData } from '../types';
import { sha256, onlyDigits, toE164BR } from '../utils';

/**
 * GOOGLE — dois caminhos server-side, ambos suportando MÚLTIPLAS CONTAS
 * (cada conta é uma linha em pixel_accounts).
 *
 *  1) GA4 Measurement Protocol  -> evento `purchase`
 *  2) Google Ads Offline Conversion Import -> uploadClickConversions (gclid/wbraid/gbraid)
 *
 * O disparo client-side (gtag AW-XXXX/label) acontece na página de obrigado
 * e é montado a partir da mesma configuração.
 */

export interface DispatchResult {
  ok: boolean;
  target: string;
  request?: unknown;
  response?: unknown;
  error?: string;
}

const GA4_ENDPOINT = 'https://www.google-analytics.com/mp/collect';
const OAUTH_ENDPOINT = 'https://oauth2.googleapis.com/token';
const ADS_API_VERSION = 'v18';

function clientIdFromTracking(order: Order, tracking: TrackingData): string {
  // GA4 exige um client_id. Usamos o _ga do navegador se veio; senão derivamos do pedido.
  const ga = tracking['_ga'] || tracking['ga_client_id'];
  if (ga) return String(ga).replace(/^GA\d+\.\d+\./, '');
  return `${Math.abs(hash(order.id)) % 1_000_000_000}.${Math.floor(Date.parse(order.created_at) / 1000) || 1}`;
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  return h;
}

/** GA4 Measurement Protocol — evento purchase. */
export async function sendGa4Purchase(
  cfg: PixelAccountConfig,
  order: Order,
  tracking: TrackingData,
  accountName: string,
): Promise<DispatchResult> {
  const target = `ga4:${accountName}`;
  if (!cfg.measurementId || !cfg.apiSecret) {
    return { ok: false, target, error: 'measurementId ou apiSecret ausente' };
  }

  const payload = {
    client_id: clientIdFromTracking(order, tracking),
    timestamp_micros: String(Date.now() * 1000),
    non_personalized_ads: false,
    user_data: {
      sha256_email_address: order.customer_email ? [await sha256(order.customer_email)] : undefined,
      sha256_phone_number: order.customer_phone ? [await sha256(toE164BR(order.customer_phone))] : undefined,
    },
    events: [
      {
        name: 'purchase',
        params: {
          transaction_id: order.transaction_id || order.id,
          value: order.amount_cents / 100,
          currency: 'BRL',
          items: [
            {
              item_id: String(order.checkout_id ?? order.upsell_id ?? 'produto'),
              item_name: order.title,
              price: order.amount_cents / 100,
              quantity: 1,
            },
          ],
          campaign: tracking.utm_campaign,
          source: tracking.utm_source,
          medium: tracking.utm_medium,
          term: tracking.utm_term,
          content: tracking.utm_content,
          session_id: tracking.session_id,
        },
      },
    ],
  };

  try {
    const url = `${GA4_ENDPOINT}?measurement_id=${encodeURIComponent(cfg.measurementId)}&api_secret=${encodeURIComponent(cfg.apiSecret)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
    const text = await res.text();
    return { ok: res.ok, target, request: payload, response: text || `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, target, error: e instanceof Error ? e.message : 'erro', request: payload };
  }
}

async function getAdsAccessToken(cfg: PixelAccountConfig): Promise<string | null> {
  if (!cfg.clientId || !cfg.clientSecret || !cfg.refreshToken) return null;
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    refresh_token: cfg.refreshToken,
    grant_type: 'refresh_token',
  });
  const res = await fetch(OAUTH_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { access_token?: string };
  return json.access_token ?? null;
}

function adsDateTime(iso: string): string {
  // Formato exigido: "yyyy-MM-dd HH:mm:ss+00:00"
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}+00:00`;
}

/**
 * Google Ads — Offline Conversion Import.
 * Usa gclid (ou wbraid/gbraid) capturado na página de entrada.
 */
export async function sendGoogleAdsConversion(
  cfg: PixelAccountConfig,
  order: Order,
  tracking: TrackingData,
  accountName: string,
): Promise<DispatchResult> {
  const target = `google_ads:${accountName}`;

  if (!cfg.customerId || !cfg.conversionActionId || !cfg.developerToken) {
    return { ok: false, target, error: 'customerId, conversionActionId ou developerToken ausente' };
  }
  if (!tracking.gclid && !tracking.wbraid && !tracking.gbraid) {
    return { ok: false, target, error: 'sem gclid/wbraid/gbraid — clique não veio do Google Ads' };
  }

  const token = await getAdsAccessToken(cfg);
  if (!token) return { ok: false, target, error: 'não foi possível obter access_token (OAuth)' };

  const customerId = onlyDigits(cfg.customerId);
  const conversion: Record<string, unknown> = {
    conversionAction: `customers/${customerId}/conversionActions/${onlyDigits(cfg.conversionActionId)}`,
    conversionDateTime: adsDateTime(order.paid_at || order.created_at),
    conversionValue: order.amount_cents / 100,
    currencyCode: 'BRL',
    orderId: order.transaction_id || order.id,
  };
  if (tracking.gclid) conversion.gclid = tracking.gclid;
  if (tracking.wbraid) conversion.wbraid = tracking.wbraid;
  if (tracking.gbraid) conversion.gbraid = tracking.gbraid;

  // Enhanced conversions for leads (dados hasheados)
  const identifiers: Record<string, unknown>[] = [];
  if (order.customer_email) identifiers.push({ hashedEmail: await sha256(order.customer_email) });
  if (order.customer_phone) identifiers.push({ hashedPhoneNumber: await sha256(toE164BR(order.customer_phone)) });
  if (identifiers.length) conversion.userIdentifiers = identifiers;

  const payload = { conversions: [conversion], partialFailure: true };

  try {
    const res = await fetch(
      `https://googleads.googleapis.com/${ADS_API_VERSION}/customers/${customerId}:uploadClickConversions`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'developer-token': cfg.developerToken,
          ...(cfg.loginCustomerId ? { 'login-customer-id': onlyDigits(cfg.loginCustomerId) } : {}),
          'content-type': 'application/json',
        },
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
