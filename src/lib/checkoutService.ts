import QRCode from 'qrcode';
import { one, run } from './db';
import { createCharge, getGateway } from './duttyfy';
import { buildUtmString, normalizeTracking } from './attribution';
import { addEvent, getOrder } from './orders';
import { dispatchOrderCreated } from './dispatch';
import type { Checkout, Order, OrderKind, TrackingData, Upsell } from './types';
import { onlyDigits, uid } from './utils';

/**
 * Serviço central de cobrança.
 * ÚNICO ponto onde a string `utm` é montada e enviada ao gateway —
 * garante que checkout, upsells e downsells usem exatamente o mesmo rastreio.
 */

export interface CustomerInput {
  name: string;
  document: string;
  email: string;
  phone: string;
}

export interface ChargeRequest {
  kind: OrderKind;
  title: string;
  description: string;
  amountCents: number;
  customer: CustomerInput;
  tracking: unknown;
  checkoutId?: number | null;
  upsellId?: number | null;
  parentOrderId?: string | null;
  ip?: string;
  userAgent?: string;
  gatewayId?: number | null;
}

export interface ChargeResponse {
  ok: boolean;
  error?: string;
  orderId?: string;
  transactionId?: string;
  pixCode?: string;
  qrDataUrl?: string;
  amountCents?: number;
  utm?: string;
}

export function getCheckoutBySlug(slug: string): Checkout | undefined {
  return one<Checkout>('SELECT * FROM checkouts WHERE slug = ? AND active = 1', [slug]);
}

export function getUpsellBySlug(slug: string): Upsell | undefined {
  return one<Upsell>('SELECT * FROM upsells WHERE slug = ? AND active = 1', [slug]);
}

export async function createPixCharge(req: ChargeRequest): Promise<ChargeResponse> {
  const gateway = getGateway(req.gatewayId ?? null);
  if (!gateway) return { ok: false, error: 'Nenhum gateway configurado. Cadastre a URL encriptada da Duttyfy no painel.' };

  const tracking: TrackingData = normalizeTracking(req.tracking);
  // >>> string CRUA enviada no campo `utm` — com fbclid / ttclid / click_id / gclid <<<
  const utm = buildUtmString(tracking);

  const orderId = uid();
  const customer: CustomerInput = {
    name: req.customer.name.trim().slice(0, 120),
    document: onlyDigits(req.customer.document),
    email: req.customer.email.trim().toLowerCase().slice(0, 160),
    phone: onlyDigits(req.customer.phone),
  };

  run(
    `INSERT INTO orders
       (id, checkout_id, upsell_id, parent_order_id, kind, gateway_id, status, title, amount_cents,
        customer_name, customer_document, customer_email, customer_phone,
        utm_raw, tracking_json, ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      orderId,
      req.checkoutId ?? null,
      req.upsellId ?? null,
      req.parentOrderId ?? null,
      req.kind,
      gateway.id,
      req.title.slice(0, 200),
      req.amountCents,
      customer.name,
      customer.document,
      customer.email,
      customer.phone,
      utm,
      JSON.stringify(tracking),
      (req.ip || '').slice(0, 64),
      (req.userAgent || '').slice(0, 400),
    ],
  );

  const result = await createCharge(gateway, {
    amount: req.amountCents,
    description: req.description.slice(0, 200),
    customer: {
      name: customer.name,
      document: customer.document,
      email: customer.email,
      phone: customer.phone,
    },
    item: { title: req.title.slice(0, 200), price: req.amountCents, quantity: 1 },
    utm,
  });

  addEvent(orderId, 'charge_created', {
    ok: result.ok,
    error: result.error,
    utm_enviada: utm,
    transactionId: result.transactionId,
  });

  if (!result.ok || !result.pixCode) {
    run("UPDATE orders SET status = 'FAILED' WHERE id = ?", [orderId]);
    return { ok: false, error: result.error || 'O gateway não retornou o código PIX.', orderId };
  }

  run('UPDATE orders SET transaction_id = ?, pix_code = ? WHERE id = ?', [
    result.transactionId ?? null,
    result.pixCode,
    orderId,
  ]);

  let qrDataUrl = '';
  try {
    qrDataUrl = await QRCode.toDataURL(result.pixCode, {
      margin: 1,
      width: 260,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#ffffff' },
    });
  } catch {
    /* o copia-e-cola continua funcionando mesmo sem QR */
  }

  const order = getOrder(orderId);
  if (order) void dispatchOrderCreated(order);

  return {
    ok: true,
    orderId,
    transactionId: result.transactionId,
    pixCode: result.pixCode,
    qrDataUrl,
    amountCents: req.amountCents,
    utm,
  };
}

/** Reaproveita os dados do comprador do pedido pai (one-click do upsell). */
export function customerFromOrder(order: Order): CustomerInput {
  return {
    name: order.customer_name,
    document: order.customer_document,
    email: order.customer_email,
    phone: order.customer_phone,
  };
}
