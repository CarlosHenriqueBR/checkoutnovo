import { all, one, run, claimIdempotency } from './db';
import type { Order, TrackingData } from './types';
import { safeJson } from './utils';
import { dispatchPurchase } from './dispatch';

export function getOrder(id: string): Order | undefined {
  return one<Order>('SELECT * FROM orders WHERE id = ?', [id]);
}

export function getOrderByTransaction(txId: string): Order | undefined {
  return one<Order>('SELECT * FROM orders WHERE transaction_id = ?', [txId]);
}

export function orderTracking(order: Order): TrackingData {
  return safeJson<TrackingData>(order.tracking_json, {});
}

export function addEvent(orderId: string, type: string, payload: unknown) {
  run('INSERT INTO order_events (order_id, type, payload_json) VALUES (?, ?, ?)', [
    orderId,
    type,
    JSON.stringify(payload ?? {}).slice(0, 16000),
  ]);
}

/**
 * Marca o pedido como pago de forma SÍNCRONA e idempotente.
 * Retorna o pedido atualizado se esta foi a primeira vez, ou null se duplicado.
 *
 * O disparo das conversões é feito depois (fora do caminho da resposta HTTP),
 * para o webhook responder 2xx em menos de 5s como a Duttyfy recomenda.
 */
export function claimPaid(order: Order, source: 'webhook' | 'polling', payload?: unknown): Order | null {
  const key = `paid:${order.transaction_id || order.id}`;
  if (!claimIdempotency(key)) {
    addEvent(order.id, `paid_duplicate_${source}`, payload);
    return null;
  }
  run("UPDATE orders SET status = 'COMPLETED', paid_at = datetime('now') WHERE id = ?", [order.id]);
  addEvent(order.id, `paid_${source}`, payload);
  return getOrder(order.id) ?? null;
}

/** Fluxo completo (usado onde não há necessidade de resposta imediata). */
export async function markPaid(order: Order, source: 'webhook' | 'polling', payload?: unknown): Promise<boolean> {
  const fresh = claimPaid(order, source, payload);
  if (!fresh) return false;
  await dispatchPurchase(fresh);
  return true;
}

export function listOrders(limit = 100, offset = 0): Order[] {
  return all<Order>('SELECT * FROM orders ORDER BY created_at DESC LIMIT ? OFFSET ?', [limit, offset]);
}

export interface Metrics {
  totalOrders: number;
  paidOrders: number;
  revenueCents: number;
  todayRevenueCents: number;
  todayPaid: number;
  conversionRate: number;
}

export function metrics(): Metrics {
  const t = one<{ c: number }>('SELECT COUNT(*) AS c FROM orders')?.c ?? 0;
  const p = one<{ c: number }>("SELECT COUNT(*) AS c FROM orders WHERE status = 'COMPLETED'")?.c ?? 0;
  const r =
    one<{ s: number }>("SELECT COALESCE(SUM(amount_cents),0) AS s FROM orders WHERE status = 'COMPLETED'")?.s ?? 0;
  const tr =
    one<{ s: number }>(
      "SELECT COALESCE(SUM(amount_cents),0) AS s FROM orders WHERE status = 'COMPLETED' AND date(paid_at) = date('now')",
    )?.s ?? 0;
  const tp =
    one<{ c: number }>(
      "SELECT COUNT(*) AS c FROM orders WHERE status = 'COMPLETED' AND date(paid_at) = date('now')",
    )?.c ?? 0;
  return {
    totalOrders: t,
    paidOrders: p,
    revenueCents: r,
    todayRevenueCents: tr,
    todayPaid: tp,
    conversionRate: t ? Math.round((p / t) * 1000) / 10 : 0,
  };
}
