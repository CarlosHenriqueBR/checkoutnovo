import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { run } from '@/lib/db';
import { webhookTransactionId } from '@/lib/duttyfy';
import { claimPaid, getOrderByTransaction, addEvent } from '@/lib/orders';
import { dispatchPurchase } from '@/lib/dispatch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * =====================================================================
 * WEBHOOK DUTTYFY — fonte primária de verdade
 * ---------------------------------------------------------------------
 * Configure em Integrações → Webhooks:
 *   https://SEU-DOMINIO/api/webhooks/duttyfy?s=WEBHOOK_SECRET
 *
 * Regras respeitadas:
 *  - `items` vem como OBJETO (não array);
 *  - em COMPLETED pode não vir `transactionId` -> usamos `_id.$oid`;
 *  - idempotência por transação;
 *  - resposta 2xx rápida: o disparo das conversões roda depois da resposta.
 * =====================================================================
 */
export async function POST(req: NextRequest) {
  const expected = process.env.WEBHOOK_SECRET || '';
  const provided = req.nextUrl.searchParams.get('s') || req.headers.get('x-webhook-secret') || '';
  if (expected && provided !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const txId = webhookTransactionId(payload);
  const status = String((payload as Record<string, unknown>)?.status ?? '').toUpperCase();

  // Log bruto (sem a URL/chave do gateway) para auditoria.
  run('INSERT INTO order_events (order_id, type, payload_json) VALUES (NULL, ?, ?)', [
    `webhook_${status || 'unknown'}`,
    JSON.stringify({ transactionId: txId, status }).slice(0, 4000),
  ]);

  if (!txId) return NextResponse.json({ ok: true, ignored: 'sem transactionId' });

  const order = getOrderByTransaction(txId);
  if (!order) return NextResponse.json({ ok: true, ignored: 'pedido desconhecido' });

  if (status !== 'COMPLETED') {
    addEvent(order.id, `webhook_${status.toLowerCase() || 'update'}`, payload);
    return NextResponse.json({ ok: true });
  }

  const fresh = claimPaid(order, 'webhook', payload);
  if (fresh) {
    after(async () => {
      await dispatchPurchase(fresh);
    });
  }

  return NextResponse.json({ ok: true, duplicated: !fresh });
}

/** Alguns painéis fazem um GET de verificação ao salvar a URL. */
export async function GET() {
  return NextResponse.json({ ok: true, service: 'vega-checkout duttyfy webhook' });
}
