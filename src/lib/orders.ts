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

/* =====================================================================
 * MÉTRICAS DIÁRIAS
 * ---------------------------------------------------------------------
 * Visão de COORTE por dia de criação do pedido: dos PIX gerados no dia X,
 * quantos foram pagos e quanto renderam. É essa a leitura que casa com o
 * gasto de tráfego do mesmo dia.
 *
 * `recebidoCents` é a outra leitura — dinheiro que efetivamente caiu no
 * dia (por paid_at), independente de quando o pedido nasceu.
 * ===================================================================== */

export interface DailyRow {
  dia: string;            // YYYY-MM-DD
  gerados: number;        // PIX gerados no dia
  pagos: number;          // desses, quantos foram pagos
  receitaCents: number;   // faturamento da coorte do dia
  recebidoCents: number;  // caixa do dia (por paid_at)
  taxa: number;           // % de aprovação (pagos / gerados)
}

export interface DailyReport {
  rows: DailyRow[];
  totalReceitaCents: number;
  totalGerados: number;
  totalPagos: number;
  taxaMedia: number;
  ticketMedioCents: number;
  melhorDia: DailyRow | null;
  /** Comparação com o período imediatamente anterior, de mesmo tamanho. */
  variacaoReceitaPct: number | null;
  variacaoTaxaPct: number | null;
}

interface CohortRow {
  dia: string;
  gerados: number;
  pagos: number;
  receita: number;
}

function cohortQuery(days: number): CohortRow[] {
  return all<CohortRow>(
    `SELECT date(created_at) AS dia,
            COUNT(*) AS gerados,
            SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS pagos,
            COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN amount_cents ELSE 0 END), 0) AS receita
       FROM orders
      WHERE date(created_at) >= date('now', ?)
        AND date(created_at) <= date('now')
      GROUP BY date(created_at)
      ORDER BY dia`,
    [`-${days - 1} days`],
  );
}

/** Relatório diário dos últimos `days` dias, sem buracos na série. */
export function dailyReport(days = 14): DailyReport {
  const safeDays = Math.min(Math.max(Math.round(days) || 14, 1), 90);

  const cohort = cohortQuery(safeDays);
  const cash = all<{ dia: string; recebido: number }>(
    `SELECT date(paid_at) AS dia, COALESCE(SUM(amount_cents), 0) AS recebido
       FROM orders
      WHERE status = 'COMPLETED' AND paid_at IS NOT NULL
        AND date(paid_at) >= date('now', ?) AND date(paid_at) <= date('now')
      GROUP BY date(paid_at)`,
    [`-${safeDays - 1} days`],
  );

  const byDay = new Map(cohort.map((r) => [r.dia, r]));
  const cashByDay = new Map(cash.map((r) => [r.dia, r.recebido]));

  // Preenche todos os dias do intervalo, inclusive os sem venda.
  const rows: DailyRow[] = [];
  const today = new Date();
  for (let i = safeDays - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dia = d.toISOString().slice(0, 10);
    const c = byDay.get(dia);
    const gerados = c?.gerados ?? 0;
    const pagos = c?.pagos ?? 0;
    rows.push({
      dia,
      gerados,
      pagos,
      receitaCents: c?.receita ?? 0,
      recebidoCents: cashByDay.get(dia) ?? 0,
      taxa: gerados ? Math.round((pagos / gerados) * 1000) / 10 : 0,
    });
  }

  const totalReceitaCents = rows.reduce((s, r) => s + r.receitaCents, 0);
  const totalGerados = rows.reduce((s, r) => s + r.gerados, 0);
  const totalPagos = rows.reduce((s, r) => s + r.pagos, 0);

  // Período anterior, de mesmo tamanho, para a variação.
  const prev = all<{ receita: number; gerados: number; pagos: number }>(
    `SELECT COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN amount_cents ELSE 0 END), 0) AS receita,
            COUNT(*) AS gerados,
            SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS pagos
       FROM orders
      WHERE date(created_at) >= date('now', ?) AND date(created_at) < date('now', ?)`,
    [`-${safeDays * 2 - 1} days`, `-${safeDays - 1} days`],
  )[0];

  const taxaMedia = totalGerados ? Math.round((totalPagos / totalGerados) * 1000) / 10 : 0;
  const taxaPrev = prev && prev.gerados ? (prev.pagos / prev.gerados) * 100 : 0;

  const melhorDia = rows.reduce<DailyRow | null>(
    (best, r) => (!best || r.receitaCents > best.receitaCents ? r : best),
    null,
  );

  return {
    rows,
    totalReceitaCents,
    totalGerados,
    totalPagos,
    taxaMedia,
    ticketMedioCents: totalPagos ? Math.round(totalReceitaCents / totalPagos) : 0,
    melhorDia: melhorDia && melhorDia.receitaCents > 0 ? melhorDia : null,
    variacaoReceitaPct:
      prev && prev.receita > 0 ? Math.round(((totalReceitaCents - prev.receita) / prev.receita) * 1000) / 10 : null,
    variacaoTaxaPct: taxaPrev > 0 ? Math.round((taxaMedia - taxaPrev) * 10) / 10 : null,
  };
}
