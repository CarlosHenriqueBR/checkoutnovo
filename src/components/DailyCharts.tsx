import type { DailyRow } from '@/lib/orders';
import { brl } from '@/lib/utils';

/**
 * Gráficos do relatório diário — SVG puro, renderizado no servidor.
 * Sem biblioteca, sem JS no cliente.
 *
 * Faturamento (R$) e taxa de aprovação (%) têm escalas diferentes, então
 * são DOIS gráficos separados. Nunca dois eixos Y no mesmo desenho.
 *
 * Cores validadas contra fundo branco:
 *   #008300 (faturamento) e #2a78d6 (taxa) — contraste ≥ 3:1 e separação
 *   de daltonismo aprovadas.
 */

const W = 720;
const H = 210;
const PAD_L = 52;
const PAD_R = 12;
const PAD_T = 20;
const PAD_B = 26;
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;

function ddmm(dia: string): string {
  const [, m, d] = dia.split('-');
  return `${d}/${m}`;
}

/** Rótulos de X sem colisão: mostra no máximo ~10. */
function labelEvery(n: number): number {
  return Math.max(1, Math.ceil(n / 10));
}

/** Eixo em reais sem repetir rótulo: 1,5k em vez de dois "2k" arredondados. */
function fmtAxisMoney(v: number): string {
  if (v >= 1000) {
    const k = v / 1000;
    return `${(k < 10 ? k.toFixed(1) : k.toFixed(0)).replace('.', ',').replace(',0', '')}k`;
  }
  return String(Math.round(v));
}

/** Mantém o rótulo dentro da área do gráfico nas pontas. */
function edgeAnchor(i: number, n: number): { anchor: 'start' | 'middle' | 'end'; dx: number } {
  if (i === 0) return { anchor: 'start', dx: -6 };
  if (i === n - 1) return { anchor: 'end', dx: 6 };
  return { anchor: 'middle', dx: 0 };
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  for (const step of [1, 2, 2.5, 5, 10]) {
    const cand = step * mag;
    if (cand >= v) return cand;
  }
  return 10 * mag;
}

function Grid({ ticks, format }: { ticks: number[]; format: (v: number) => string }) {
  return (
    <g>
      {ticks.map((t, i) => {
        const y = PAD_T + PLOT_H - (i / (ticks.length - 1)) * PLOT_H;
        return (
          <g key={t}>
            <line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y} stroke="#ececee" strokeWidth={1} />
            <text x={PAD_L - 8} y={y + 4} textAnchor="end" fontSize={11} fill="#8b929c">
              {format(t)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function XLabels({ rows }: { rows: DailyRow[] }) {
  const every = labelEvery(rows.length);
  const slot = PLOT_W / rows.length;
  return (
    <g>
      {rows.map((r, i) =>
        i % every === 0 || i === rows.length - 1 ? (
          <text
            key={r.dia}
            x={PAD_L + slot * i + slot / 2}
            y={H - 8}
            textAnchor="middle"
            fontSize={11}
            fill="#8b929c"
          >
            {ddmm(r.dia)}
          </text>
        ) : null,
      )}
    </g>
  );
}

/** Faturamento por dia — barras. */
export function RevenueChart({ rows }: { rows: DailyRow[] }) {
  const maxV = niceMax(Math.max(...rows.map((r) => r.receitaCents), 0) / 100);
  const ticks = [0, maxV / 4, maxV / 2, (maxV * 3) / 4, maxV];
  const slot = PLOT_W / rows.length;
  const barW = Math.max(3, slot - 2); // 2px de respiro entre barras
  const maxIdx = rows.reduce((b, r, i) => (r.receitaCents > rows[b].receitaCents ? i : b), 0);
  const lastIdx = rows.length - 1;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Faturamento por dia">
      <Grid ticks={ticks} format={fmtAxisMoney} />
      {rows.map((r, i) => {
        const v = r.receitaCents / 100;
        const h = maxV ? (v / maxV) * PLOT_H : 0;
        const x = PAD_L + slot * i + (slot - barW) / 2;
        const y = PAD_T + PLOT_H - h;
        if (h <= 0) return null;
        return <rect key={r.dia} x={x} y={y} width={barW} height={h} rx={3} fill="#008300" />;
      })}
      {/* rótulo direto só no maior e no último — nunca em todos */}
      {[maxIdx, lastIdx]
        .filter((i, idx, arr) => arr.indexOf(i) === idx && rows[i].receitaCents > 0)
        .map((i) => {
          const v = rows[i].receitaCents / 100;
          const h = (v / maxV) * PLOT_H;
          const { anchor, dx } = edgeAnchor(i, rows.length);
          return (
            <text
              key={`lbl-${i}`}
              x={PAD_L + slot * i + slot / 2 + dx}
              y={PAD_T + PLOT_H - h - 6}
              textAnchor={anchor}
              fontSize={11}
              fontWeight={700}
              fill="#1c2b45"
            >
              {brl(rows[i].receitaCents)}
            </text>
          );
        })}
      <line x1={PAD_L} y1={PAD_T + PLOT_H} x2={W - PAD_R} y2={PAD_T + PLOT_H} stroke="#d9dce0" strokeWidth={1} />
      <XLabels rows={rows} />
    </svg>
  );
}

/** Taxa de aprovação por dia — linha com marcadores. */
export function ApprovalChart({ rows }: { rows: DailyRow[] }) {
  const ticks = [0, 25, 50, 75, 100];
  const slot = PLOT_W / rows.length;
  const pts = rows.map((r, i) => ({
    x: PAD_L + slot * i + slot / 2,
    y: PAD_T + PLOT_H - (r.taxa / 100) * PLOT_H,
    row: r,
  }));
  const withData = pts.filter((p) => p.row.gerados > 0);
  const path = withData.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const best = withData.reduce<(typeof withData)[number] | null>(
    (b, p) => (!b || p.row.taxa > b.row.taxa ? p : b),
    null,
  );
  const last = withData[withData.length - 1] ?? null;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Taxa de aprovação por dia">
      <Grid ticks={ticks} format={(v) => `${Math.round(v)}%`} />
      {withData.length > 1 && (
        <path d={path} fill="none" stroke="#2a78d6" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      )}
      {withData.map((p) => (
        <circle key={p.row.dia} cx={p.x} cy={p.y} r={4} fill="#2a78d6" stroke="#ffffff" strokeWidth={2} />
      ))}
      {[best, last]
        .filter((p, i, arr): p is NonNullable<typeof p> => !!p && arr.findIndex((q) => q?.row.dia === p.row.dia) === i)
        .map((p) => {
          const idx = rows.findIndex((r) => r.dia === p.row.dia);
          const { anchor, dx } = edgeAnchor(idx, rows.length);
          return (
            <text
              key={`t-${p.row.dia}`}
              x={p.x + dx}
              y={p.y - 10}
              textAnchor={anchor}
              fontSize={11}
              fontWeight={700}
              fill="#1c2b45"
            >
              {p.row.taxa}%
            </text>
          );
        })}
      <line x1={PAD_L} y1={PAD_T + PLOT_H} x2={W - PAD_R} y2={PAD_T + PLOT_H} stroke="#d9dce0" strokeWidth={1} />
      <XLabels rows={rows} />
    </svg>
  );
}
