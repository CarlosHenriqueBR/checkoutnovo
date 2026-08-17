import Link from 'next/link';
import { dailyReport } from '@/lib/orders';
import { brl } from '@/lib/utils';
import { RevenueChart, ApprovalChart } from '@/components/DailyCharts';

export const dynamic = 'force-dynamic';

const RANGES = [7, 14, 30];

function Delta({ value, suffix = '%' }: { value: number | null; suffix?: string }) {
  if (value === null) return <span className="muted"> — </span>;
  const up = value >= 0;
  return (
    <span style={{ color: up ? '#008300' : '#d93025', fontSize: 12, fontWeight: 700 }}>
      {up ? '▲' : '▼'} {Math.abs(value)}
      {suffix}
    </span>
  );
}

export default async function FaturamentoPage({
  searchParams,
}: {
  searchParams: Promise<{ dias?: string }>;
}) {
  const { dias } = await searchParams;
  const days = RANGES.includes(Number(dias)) ? Number(dias) : 14;
  const r = dailyReport(days);

  return (
    <>
      <h1 className="dash-h1">Faturamento</h1>
      <p className="dash-desc">
        Visão por dia de <b>geração do PIX</b>: dos pedidos criados naquele dia, quantos foram pagos e quanto renderam.
        É a leitura que casa com o gasto de tráfego do mesmo dia.
      </p>

      <div className="toolbar">
        {RANGES.map((d) => (
          <Link
            key={d}
            href={`/dashboard/faturamento?dias=${d}`}
            className="btn"
            style={d === days ? { background: 'var(--ck-green)', borderColor: 'var(--ck-green)', color: '#fff' } : undefined}
          >
            {d} dias
          </Link>
        ))}
        <div className="spacer" />
        <Link className="btn" href="/dashboard/pedidos">Ver pedidos →</Link>
      </div>

      <div className="dash-grid">
        <div className="dash-stat">
          <span>Faturamento no período</span>
          <b>{brl(r.totalReceitaCents)}</b>
          <Delta value={r.variacaoReceitaPct} /> <span className="muted" style={{ fontSize: 11 }}>vs. período anterior</span>
        </div>
        <div className="dash-stat">
          <span>Taxa de aprovação</span>
          <b>{r.taxaMedia}%</b>
          <Delta value={r.variacaoTaxaPct} suffix=" p.p." />{' '}
          <span className="muted" style={{ fontSize: 11 }}>
            {r.totalPagos} de {r.totalGerados} PIX
          </span>
        </div>
        <div className="dash-stat">
          <span>Ticket médio</span>
          <b>{brl(r.ticketMedioCents)}</b>
        </div>
        <div className="dash-stat">
          <span>Melhor dia</span>
          <b>{r.melhorDia ? brl(r.melhorDia.receitaCents) : '—'}</b>
          <span className="muted" style={{ fontSize: 11 }}>
            {r.melhorDia ? r.melhorDia.dia.split('-').reverse().join('/') : 'sem vendas no período'}
          </span>
        </div>
      </div>

      <div className="vg-card">
        <h2 className="dash-h1" style={{ fontSize: 16 }}>Faturamento por dia</h2>
        <p className="dash-desc" style={{ marginBottom: 8 }}>Em reais, dos pedidos gerados em cada dia.</p>
        <RevenueChart rows={r.rows} />
      </div>

      <div className="vg-card">
        <h2 className="dash-h1" style={{ fontSize: 16 }}>Taxa de aprovação por dia</h2>
        <p className="dash-desc" style={{ marginBottom: 8 }}>
          Percentual dos PIX gerados que foram efetivamente pagos.
        </p>
        <ApprovalChart rows={r.rows} />
      </div>

      <h2 className="dash-h1" style={{ fontSize: 16, marginTop: 24 }}>Detalhe por dia</h2>
      <table className="dash-table">
        <thead>
          <tr>
            <th>Dia</th>
            <th>PIX gerados</th>
            <th>Pagos</th>
            <th>Taxa</th>
            <th>Faturamento</th>
            <th>Caixa do dia</th>
          </tr>
        </thead>
        <tbody>
          {r.rows
            .slice()
            .reverse()
            .map((row) => (
              <tr key={row.dia}>
                <td className="mono">{row.dia.split('-').reverse().join('/')}</td>
                <td>{row.gerados || <span className="muted">—</span>}</td>
                <td>{row.pagos || <span className="muted">—</span>}</td>
                <td>
                  {row.gerados ? (
                    <span className={`tag ${row.taxa >= r.taxaMedia ? 'tag-ok' : 'tag-wait'}`}>{row.taxa}%</span>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td>{row.receitaCents ? brl(row.receitaCents) : <span className="muted">—</span>}</td>
                <td className="muted">{row.recebidoCents ? brl(row.recebidoCents) : '—'}</td>
              </tr>
            ))}
        </tbody>
      </table>

      <p className="dash-desc" style={{ marginTop: 12 }}>
        <b>Faturamento</b> soma os pedidos criados no dia que foram pagos (em qualquer momento).{' '}
        <b>Caixa do dia</b> soma o que entrou naquela data, mesmo que o PIX tenha sido gerado antes — a diferença entre
        as duas colunas é o pagamento atrasado.
      </p>
    </>
  );
}
