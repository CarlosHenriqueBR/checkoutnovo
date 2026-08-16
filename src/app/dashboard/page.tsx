import Link from 'next/link';
import { all } from '@/lib/db';
import { metrics } from '@/lib/orders';
import { brl, safeJson, appUrl } from '@/lib/utils';
import { auditTracking } from '@/lib/attribution';
import type { Order, TrackingData, Checkout } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default function Overview() {
  const m = metrics();
  const recent = all<Order>('SELECT * FROM orders ORDER BY created_at DESC LIMIT 10');
  const checkouts = all<Checkout>('SELECT * FROM checkouts WHERE active = 1 ORDER BY id DESC LIMIT 5');

  const semClickId = recent.filter((o) => !auditTracking(safeJson<TrackingData>(o.tracking_json, {})).hasAnyClickId).length;

  return (
    <>
      <h1 className="dash-h1">Visão geral</h1>
      <p className="dash-desc">Faturamento, últimas vendas e saúde do rastreamento.</p>

      <div className="dash-grid">
        <div className="dash-stat">
          <span>Faturamento total</span>
          <b>{brl(m.revenueCents)}</b>
        </div>
        <div className="dash-stat">
          <span>Hoje</span>
          <b>{brl(m.todayRevenueCents)}</b>
        </div>
        <div className="dash-stat">
          <span>Vendas pagas</span>
          <b>{m.paidOrders}</b>
        </div>
        <div className="dash-stat">
          <span>Conversão PIX</span>
          <b>{m.conversionRate}%</b>
        </div>
      </div>

      {semClickId > 0 && (
        <div className="vg-alert">
          {semClickId} dos últimos {recent.length} pedidos chegaram <b>sem nenhum click ID</b> (fbclid / ttclid /
          click_id / gclid). Confirme que o <code>/t.js</code> está instalado na página de entrada do anúncio.
        </div>
      )}

      <h2 className="dash-h1" style={{ fontSize: 17, marginTop: 24 }}>Checkouts ativos</h2>
      <table className="dash-table" style={{ marginBottom: 24 }}>
        <thead>
          <tr>
            <th>Nome</th>
            <th>Valor</th>
            <th>Ticket menor</th>
            <th>Link</th>
          </tr>
        </thead>
        <tbody>
          {checkouts.length === 0 && (
            <tr>
              <td colSpan={4} className="muted">
                Nenhum checkout ainda. <Link href="/dashboard/checkouts">Criar o primeiro →</Link>
              </td>
            </tr>
          )}
          {checkouts.map((c) => (
            <tr key={c.id}>
              <td>{c.name}</td>
              <td>{brl(c.price_cents)}</td>
              <td>{c.downsell_price_cents ? brl(c.downsell_price_cents) : <span className="muted">—</span>}</td>
              <td className="mono">
                <a href={`/c/${c.slug}`} target="_blank" rel="noreferrer">
                  {appUrl()}/c/{c.slug}
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="dash-h1" style={{ fontSize: 17 }}>Últimos pedidos</h2>
      <table className="dash-table">
        <thead>
          <tr>
            <th>Data</th>
            <th>Cliente</th>
            <th>Produto</th>
            <th>Valor</th>
            <th>Status</th>
            <th>Rastreio</th>
          </tr>
        </thead>
        <tbody>
          {recent.length === 0 && (
            <tr>
              <td colSpan={6} className="muted">Nenhum pedido ainda.</td>
            </tr>
          )}
          {recent.map((o) => {
            const t = safeJson<TrackingData>(o.tracking_json, {});
            const a = auditTracking(t);
            return (
              <tr key={o.id}>
                <td className="mono">{o.created_at}</td>
                <td>{o.customer_name}</td>
                <td>{o.title}</td>
                <td>{brl(o.amount_cents)}</td>
                <td>
                  <span className={`tag ${o.status === 'COMPLETED' ? 'tag-ok' : o.status === 'FAILED' ? 'tag-err' : 'tag-wait'}`}>
                    {o.status}
                  </span>
                </td>
                <td>
                  {a.hasAnyClickId ? (
                    <span className="tag tag-ok">{a.present.join(', ')}</span>
                  ) : (
                    <span className="tag tag-err">sem click ID</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
