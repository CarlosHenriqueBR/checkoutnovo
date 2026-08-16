'use client';

import { Fragment, useState } from 'react';
import { useResource, brlText } from '../ui';
import type { Order, TrackingData } from '@/lib/types';

interface Row extends Order {
  tracking: TrackingData;
  audit: { present: string[]; missing: string[]; hasAnyClickId: boolean; hasAnyUtm: boolean };
}

interface Payload {
  metrics: { revenueCents: number; paidOrders: number; totalOrders: number; conversionRate: number };
  orders: Row[];
}

export default function PedidosPage() {
  const { data, loading, error, reload } = useResource<Payload>('/api/admin/orders?limit=200');
  const [open, setOpen] = useState<string | null>(null);

  return (
    <>
      <h1 className="dash-h1">Pedidos</h1>
      <p className="dash-desc">
        Cada linha mostra a string <code>utm</code> exatamente como foi enviada para a Duttyfy.
      </p>

      <div className="toolbar">
        <button className="btn" onClick={reload}>Atualizar</button>
        {data && (
          <span className="muted">
            {data.metrics.paidOrders} pagos de {data.metrics.totalOrders} • {brlText(data.metrics.revenueCents)}
          </span>
        )}
      </div>

      {error && <div className="vg-alert">{error}</div>}
      {loading && <p className="muted">Carregando…</p>}

      <table className="dash-table">
        <thead>
          <tr>
            <th>Data</th>
            <th>Cliente</th>
            <th>Tipo</th>
            <th>Valor</th>
            <th>Status</th>
            <th>Click IDs</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {data?.orders.map((o) => (
            <Fragment key={o.id}>
              <tr>
                <td className="mono">{o.created_at}</td>
                <td>
                  {o.customer_name}
                  <br />
                  <span className="muted mono">{o.customer_email}</span>
                </td>
                <td>{o.kind}</td>
                <td>{brlText(o.amount_cents)}</td>
                <td>
                  <span className={`tag ${o.status === 'COMPLETED' ? 'tag-ok' : o.status === 'FAILED' ? 'tag-err' : 'tag-wait'}`}>
                    {o.status}
                  </span>
                </td>
                <td>
                  {o.audit.hasAnyClickId ? (
                    <span className="tag tag-ok">{o.audit.present.join(', ')}</span>
                  ) : (
                    <span className="tag tag-err">nenhum</span>
                  )}
                </td>
                <td>
                  <button className="btn" onClick={() => setOpen(open === o.id ? null : o.id)}>
                    {open === o.id ? 'Fechar' : 'Detalhes'}
                  </button>
                </td>
              </tr>
              {open === o.id && (
                <tr>
                  <td colSpan={7} style={{ background: '#fafbfc' }}>
                    <div className="row">
                      <div>
                        <b>utm enviada à Duttyfy</b>
                        <pre className="mono" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                          {o.utm_raw || '(vazio)'}
                        </pre>
                      </div>
                      <div>
                        <b>Parâmetros</b>
                        <pre className="mono" style={{ whiteSpace: 'pre-wrap' }}>
                          {JSON.stringify(o.tracking, null, 2)}
                        </pre>
                      </div>
                      <div>
                        <b>Transação</b>
                        <pre className="mono" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                          {`id: ${o.id}\ntransactionId: ${o.transaction_id || '—'}\npago em: ${o.paid_at || '—'}`}
                        </pre>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </>
  );
}
