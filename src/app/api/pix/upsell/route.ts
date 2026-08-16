import { NextRequest, NextResponse } from 'next/server';
import { createPixCharge, customerFromOrder, getUpsellBySlug } from '@/lib/checkoutService';
import { addEvent, getOrder, orderTracking } from '@/lib/orders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * ONE-CLICK do upsell/downsell.
 * Reaproveita nome/CPF/e-mail/telefone E o rastreamento do pedido original,
 * então o `utm` enviado à Duttyfy é idêntico ao da venda principal.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    slug?: string;
    parentOrderId?: string;
    offer?: 'main' | 'downsell';
    tracking?: unknown;
  };

  const upsell = body.slug ? getUpsellBySlug(body.slug) : undefined;
  if (!upsell) return NextResponse.json({ error: 'Upsell não encontrado' }, { status: 404 });

  const parent = body.parentOrderId ? getOrder(body.parentOrderId) : undefined;
  if (!parent) return NextResponse.json({ error: 'Pedido de origem não encontrado' }, { status: 400 });

  const useDownsell = body.offer === 'downsell' && upsell.downsell_price_cents > 0;
  const amount = useDownsell ? upsell.downsell_price_cents : upsell.price_cents;
  if (amount <= 0) return NextResponse.json({ error: 'Valor do upsell não configurado' }, { status: 400 });

  // Rastreio do pedido pai é a fonte de verdade; o do navegador só complementa.
  const tracking = { ...(body.tracking as object), ...orderTracking(parent) };

  const result = await createPixCharge({
    kind: useDownsell ? 'downsell' : 'upsell',
    title: upsell.name,
    description: upsell.headline || upsell.name,
    amountCents: amount,
    customer: customerFromOrder(parent),
    tracking,
    upsellId: upsell.id,
    parentOrderId: parent.id,
    gatewayId: parent.gateway_id,
    ip: req.headers.get('x-forwarded-for')?.split(',')[0].trim() || '',
    userAgent: req.headers.get('user-agent') || '',
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });

  if (result.orderId) {
    addEvent(result.orderId, 'upsell_accept', { upsell: upsell.slug, offer: useDownsell ? 'downsell' : 'main' });
  }

  return NextResponse.json({
    orderId: result.orderId,
    transactionId: result.transactionId,
    pixCode: result.pixCode,
    qrDataUrl: result.qrDataUrl,
    amountCents: result.amountCents,
  });
}
