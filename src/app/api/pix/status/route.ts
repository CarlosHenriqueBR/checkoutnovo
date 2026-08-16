import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { getOrder, claimPaid } from '@/lib/orders';
import { getGateway, getChargeStatus } from '@/lib/duttyfy';
import { dispatchPurchase } from '@/lib/dispatch';
import { one } from '@/lib/db';
import type { Checkout, Upsell } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Consulta de status — FALLBACK do webhook.
 * O checkout chama a cada ~5s enquanto a tela do PIX está aberta.
 */
export async function GET(req: NextRequest) {
  const orderId = req.nextUrl.searchParams.get('orderId') || '';
  const order = getOrder(orderId);
  if (!order) return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });

  if (order.status === 'COMPLETED') {
    return NextResponse.json({ status: 'COMPLETED', paid: true, next: nextStep(order.checkout_id, order.upsell_id), orderId: order.id });
  }

  if (!order.transaction_id) {
    return NextResponse.json({ status: order.status, paid: false });
  }

  const gateway = getGateway(order.gateway_id);
  if (!gateway) return NextResponse.json({ status: order.status, paid: false });

  const res = await getChargeStatus(gateway, order.transaction_id);
  if (!res.ok) return NextResponse.json({ status: order.status, paid: false, warning: res.error });

  if (String(res.status).toUpperCase() === 'COMPLETED') {
    const fresh = claimPaid(order, 'polling', res.raw);
    if (fresh) after(async () => { await dispatchPurchase(fresh); });
    return NextResponse.json({
      status: 'COMPLETED',
      paid: true,
      orderId: order.id,
      next: nextStep(order.checkout_id, order.upsell_id),
    });
  }

  return NextResponse.json({ status: res.status ?? 'PENDING', paid: false });
}

/** Para onde levar o comprador depois de pagar. */
function nextStep(checkoutId: number | null, upsellId: number | null): { type: 'upsell' | 'thankyou'; url: string } {
  if (checkoutId) {
    const ck = one<Checkout>('SELECT * FROM checkouts WHERE id = ?', [checkoutId]);
    if (ck?.upsell_id) {
      const up = one<Upsell>('SELECT slug FROM upsells WHERE id = ? AND active = 1', [ck.upsell_id]);
      if (up) return { type: 'upsell', url: `/u/${up.slug}` };
    }
    if (ck?.thankyou_url) return { type: 'thankyou', url: ck.thankyou_url };
  }
  if (upsellId) {
    const up = one<Upsell>('SELECT * FROM upsells WHERE id = ?', [upsellId]);
    if (up?.next_on_accept_id) {
      const nx = one<Upsell>('SELECT slug FROM upsells WHERE id = ? AND active = 1', [up.next_on_accept_id]);
      if (nx) return { type: 'upsell', url: `/u/${nx.slug}` };
    }
    if (up?.final_url) return { type: 'thankyou', url: up.final_url };
  }
  return { type: 'thankyou', url: '/obrigado' };
}
