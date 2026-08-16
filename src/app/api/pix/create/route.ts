import { NextRequest, NextResponse } from 'next/server';
import { createPixCharge, getCheckoutBySlug } from '@/lib/checkoutService';
import { addEvent } from '@/lib/orders';
import { safeJson, isValidCPF, isValidEmail, isValidPhone, onlyDigits } from '@/lib/utils';
import type { CheckoutConfig } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Cria a cobrança PIX do produto principal.
 * O PREÇO NUNCA VEM DO CLIENTE — é lido do banco a partir do slug.
 * `offer` decide entre o valor cheio e o ticket menor (downsell / backredirect).
 */
export async function POST(req: NextRequest) {
  let body: {
    slug?: string;
    offer?: 'main' | 'downsell';
    bump?: boolean;
    customer?: { name?: string; document?: string; email?: string; phone?: string };
    tracking?: unknown;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const checkout = body.slug ? getCheckoutBySlug(body.slug) : undefined;
  if (!checkout) return NextResponse.json({ error: 'Checkout não encontrado' }, { status: 404 });

  const cfg = safeJson<CheckoutConfig>(checkout.config_json, {});
  const c = body.customer || {};

  const name = (c.name || '').trim();
  const document = onlyDigits(c.document || '');
  const email = (c.email || '').trim();
  const phone = onlyDigits(c.phone || '');

  if (name.length < 3) return NextResponse.json({ error: 'Informe seu nome completo' }, { status: 400 });
  if (cfg.askDocument !== false && !isValidCPF(document))
    return NextResponse.json({ error: 'CPF inválido' }, { status: 400 });
  if (cfg.askEmail !== false && !isValidEmail(email))
    return NextResponse.json({ error: 'E-mail inválido' }, { status: 400 });
  if (cfg.askPhone !== false && !isValidPhone(phone))
    return NextResponse.json({ error: 'Telefone inválido (DDD + número)' }, { status: 400 });

  // Ticket menor do produto principal
  const useDownsell = body.offer === 'downsell' && checkout.downsell_price_cents > 0;
  let amount = useDownsell ? checkout.downsell_price_cents : checkout.price_cents;

  // Order bump
  const bumpOn = !!body.bump && !!cfg.bumpEnabled && (cfg.bumpPriceCents ?? 0) > 0;
  if (bumpOn) amount += cfg.bumpPriceCents!;

  if (amount <= 0) return NextResponse.json({ error: 'Valor do produto não configurado' }, { status: 400 });

  const title = bumpOn ? `${checkout.name} + ${cfg.bumpTitle || 'Oferta adicional'}` : checkout.name;

  const result = await createPixCharge({
    kind: useDownsell ? 'downsell' : 'main',
    title,
    description: checkout.headline || checkout.name,
    amountCents: amount,
    customer: { name, document, email, phone },
    tracking: body.tracking,
    checkoutId: checkout.id,
    gatewayId: checkout.gateway_id,
    ip: req.headers.get('x-forwarded-for')?.split(',')[0].trim() || '',
    userAgent: req.headers.get('user-agent') || '',
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });

  if (result.orderId) {
    addEvent(result.orderId, 'checkout_submit', { offer: useDownsell ? 'downsell' : 'main', bump: bumpOn });
  }

  return NextResponse.json({
    orderId: result.orderId,
    transactionId: result.transactionId,
    pixCode: result.pixCode,
    qrDataUrl: result.qrDataUrl,
    amountCents: result.amountCents,
    pollIntervalMs: cfg.pollIntervalMs ?? 5000,
  });
}
