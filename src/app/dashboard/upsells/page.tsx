'use client';

import { useState } from 'react';
import { api, useResource, MoneyInput, ImageField, Field, brlText } from '../ui';
import type { Upsell, UpsellBlock, UpsellTheme } from '@/lib/types';

interface Draft {
  id: number;
  slug: string;
  name: string;
  headline: string;
  subheadline: string;
  image_url: string;
  body_html: string;
  blocks: UpsellBlock[];
  price_cents: number;
  downsell_price_cents: number;
  downsell_headline: string;
  accept_label: string;
  decline_label: string;
  next_on_accept_id: number | null;
  next_on_decline_id: number | null;
  final_url: string;
  active: boolean;
  theme: UpsellTheme;
}

const EMPTY: Draft = {
  id: 0,
  slug: '',
  name: '',
  headline: '',
  subheadline: '',
  image_url: '',
  body_html: '',
  blocks: [],
  price_cents: 0,
  downsell_price_cents: 0,
  downsell_headline: 'Tudo bem, e se ficar mais barato?',
  accept_label: 'SIM, EU QUERO!',
  decline_label: 'Não, obrigado',
  next_on_accept_id: null,
  next_on_decline_id: null,
  final_url: '/obrigado',
  active: true,
  theme: {
    primaryColor: '#5cc47f',
    bgColor: '#f2f2f2',
    textColor: '#3d4756',
    cardColor: '#ffffff',
    customCss: '',
    htmlTop: '',
    htmlBeforeCta: '',
    htmlBottom: '',
  },
};

const BLOCK_TYPES: UpsellBlock['type'][] = ['heading', 'text', 'image', 'video', 'list', 'divider', 'html'];

function newBlock(type: UpsellBlock['type']): UpsellBlock {
  switch (type) {
    case 'heading': return { type, text: 'Novo título' };
    case 'text': return { type, text: 'Escreva aqui…' };
    case 'image': return { type, url: '', alt: '' };
    case 'video': return { type, url: '' };
    case 'list': return { type, items: ['Primeiro item'] };
    case 'divider': return { type };
    case 'html': return { type, html: '<p></p>' };
  }
}

export default function UpsellsPage() {
  const { data, error, reload } = useResource<Upsell[]>('/api/admin/upsells');
  const [d, setD] = useState<Draft | null>(null);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  function set<K extends keyof Draft>(k: K, v: Draft[K]) {
    if (d) setD({ ...d, [k]: v });
  }

  function editRow(u: Upsell) {
    let blocks: UpsellBlock[] = [];
    let theme: UpsellTheme = {};
    try { blocks = JSON.parse(u.blocks_json); } catch { blocks = []; }
    try { theme = JSON.parse(u.theme_json); } catch { theme = {}; }
    setD({
      id: u.id,
      slug: u.slug,
      name: u.name,
      headline: u.headline,
      subheadline: u.subheadline,
      image_url: u.image_url,
      body_html: u.body_html,
      blocks: Array.isArray(blocks) ? blocks : [],
      price_cents: u.price_cents,
      downsell_price_cents: u.downsell_price_cents,
      downsell_headline: u.downsell_headline,
      accept_label: u.accept_label,
      decline_label: u.decline_label,
      next_on_accept_id: u.next_on_accept_id,
      next_on_decline_id: u.next_on_decline_id,
      final_url: u.final_url,
      active: !!u.active,
      theme: { ...EMPTY.theme, ...theme },
    });
  }

  async function save() {
    if (!d) return;
    setSaving(true);
    setErr('');
    try {
      const body = JSON.stringify(d);
      if (d.id) await api(`/api/admin/upsells/${d.id}`, { method: 'PUT', body });
      else await api('/api/admin/upsells', { method: 'POST', body });
      setD(null);
      reload();
    } catch (e) {
      setErr(String((e as Error).message));
    }
    setSaving(false);
  }

  async function remove(id: number) {
    if (!confirm('Excluir este upsell?')) return;
    await api(`/api/admin/upsells/${id}`, { method: 'DELETE' });
    reload();
  }

  function updateBlock(i: number, patch: Partial<UpsellBlock>) {
    if (!d) return;
    const blocks = d.blocks.slice();
    blocks[i] = { ...blocks[i], ...patch } as UpsellBlock;
    set('blocks', blocks);
  }

  function moveBlock(i: number, dir: -1 | 1) {
    if (!d) return;
    const j = i + dir;
    if (j < 0 || j >= d.blocks.length) return;
    const blocks = d.blocks.slice();
    [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
    set('blocks', blocks);
  }

  const others = (data ?? []).filter((u) => u.id !== d?.id);

  return (
    <>
      <h1 className="dash-h1">Upsells</h1>
      <p className="dash-desc">
        Páginas personalizáveis, ligadas entre si. Quem aceita vai para um caminho, quem recusa cai no downsell ou no
        próximo upsell.
      </p>

      <div className="toolbar">
        <button className="btn btn-primary" onClick={() => setD({ ...EMPTY, blocks: [], theme: { ...EMPTY.theme } })}>+ Novo upsell</button>
        <button className="btn" onClick={reload}>Atualizar</button>
      </div>

      {error && <div className="vg-alert">{error}</div>}

      {d && (
        <div className="vg-card">
          <h2 className="dash-h1" style={{ fontSize: 16 }}>{d.id ? `Editar: ${d.name}` : 'Novo upsell'}</h2>
          {err && <div className="vg-alert">{err}</div>}

          <div className="row">
            <Field label="Nome interno">
              <input value={d.name} onChange={(e) => set('name', e.target.value)} />
            </Field>
            <Field label="Slug (URL)" hint={`/u/${d.slug || 'meu-upsell'}`}>
              <input value={d.slug} onChange={(e) => set('slug', e.target.value)} />
            </Field>
          </div>

          <div className="row">
            <Field label="Título">
              <input value={d.headline} onChange={(e) => set('headline', e.target.value)} />
            </Field>
            <Field label="Subtítulo">
              <input value={d.subheadline} onChange={(e) => set('subheadline', e.target.value)} />
            </Field>
          </div>
          <ImageField label="Imagem principal" value={d.image_url} onChange={(u) => set('image_url', u)} />

          <div className="row">
            <MoneyInput label="Valor (R$)" value={d.price_cents} onChange={(c) => set('price_cents', c)} />
            <MoneyInput
              label="Downsell (R$)"
              value={d.downsell_price_cents}
              onChange={(c) => set('downsell_price_cents', c)}
              hint="Mostrado quando o cliente clica em recusar. 0 = pula direto."
            />
            <Field label="Título do downsell">
              <input value={d.downsell_headline} onChange={(e) => set('downsell_headline', e.target.value)} />
            </Field>
          </div>

          <div className="row">
            <Field label="Texto do botão de aceite">
              <input value={d.accept_label} onChange={(e) => set('accept_label', e.target.value)} />
            </Field>
            <Field label="Texto do botão de recusa">
              <input value={d.decline_label} onChange={(e) => set('decline_label', e.target.value)} />
            </Field>
          </div>

          <h3 className="dash-h1" style={{ fontSize: 14, marginTop: 16 }}>Ligações do funil</h3>
          <div className="row">
            <Field label="Se ACEITAR, ir para">
              <select value={d.next_on_accept_id ?? ''} onChange={(e) => set('next_on_accept_id', e.target.value ? Number(e.target.value) : null)}>
                <option value="">— página final —</option>
                {others.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </Field>
            <Field label="Se RECUSAR, ir para">
              <select value={d.next_on_decline_id ?? ''} onChange={(e) => set('next_on_decline_id', e.target.value ? Number(e.target.value) : null)}>
                <option value="">— página final —</option>
                {others.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </Field>
            <Field label="Página final">
              <input value={d.final_url} onChange={(e) => set('final_url', e.target.value)} />
            </Field>
          </div>

          <h3 className="dash-h1" style={{ fontSize: 14, marginTop: 16 }}>Conteúdo da página</h3>
          {d.blocks.map((b, i) => (
            <div key={i} className="vg-card" style={{ background: '#fafbfc', marginBottom: 8 }}>
              <div className="toolbar" style={{ marginBottom: 8 }}>
                <b style={{ fontSize: 13 }}>{b.type}</b>
                <div className="spacer" />
                <button className="btn" onClick={() => moveBlock(i, -1)}>↑</button>
                <button className="btn" onClick={() => moveBlock(i, 1)}>↓</button>
                <button className="btn btn-danger" onClick={() => set('blocks', d.blocks.filter((_, j) => j !== i))}>Remover</button>
              </div>
              {b.type === 'heading' || b.type === 'text' ? (
                <textarea rows={b.type === 'text' ? 3 : 1} value={b.text} onChange={(e) => updateBlock(i, { text: e.target.value } as Partial<UpsellBlock>)} />
              ) : null}
              {b.type === 'image' ? (
                <ImageField label="Imagem" value={b.url} onChange={(u) => updateBlock(i, { url: u } as Partial<UpsellBlock>)} />
              ) : null}
              {b.type === 'video' ? (
                <input placeholder="URL do embed (YouTube/Vimeo)" value={b.url} onChange={(e) => updateBlock(i, { url: e.target.value } as Partial<UpsellBlock>)} />
              ) : null}
              {b.type === 'list' ? (
                <textarea
                  rows={4}
                  value={b.items.join('\n')}
                  onChange={(e) => updateBlock(i, { items: e.target.value.split('\n') } as Partial<UpsellBlock>)}
                />
              ) : null}
              {b.type === 'html' ? (
                <textarea rows={4} className="mono" value={b.html} onChange={(e) => updateBlock(i, { html: e.target.value } as Partial<UpsellBlock>)} />
              ) : null}
            </div>
          ))}

          <div className="toolbar">
            {BLOCK_TYPES.map((t) => (
              <button key={t} className="btn" onClick={() => set('blocks', [...d.blocks, newBlock(t)])}>+ {t}</button>
            ))}
          </div>

          <h3 className="dash-h1" style={{ fontSize: 14, marginTop: 16 }}>Aparência</h3>
          <div className="row">
            <Field label="Cor principal">
              <input type="color" value={d.theme.primaryColor || '#00b37e'} onChange={(e) => set('theme', { ...d.theme, primaryColor: e.target.value })} />
            </Field>
            <Field label="Fundo">
              <input type="color" value={d.theme.bgColor || '#f4f5f7'} onChange={(e) => set('theme', { ...d.theme, bgColor: e.target.value })} />
            </Field>
            <Field label="Cartão">
              <input type="color" value={d.theme.cardColor || '#ffffff'} onChange={(e) => set('theme', { ...d.theme, cardColor: e.target.value })} />
            </Field>
          </div>

          <h3 className="dash-h1" style={{ fontSize: 14, marginTop: 16 }}>HTML e CSS personalizados</h3>
          <p className="dash-desc" style={{ marginBottom: 10 }}>
            Injetados nesta página de upsell. Aceitam HTML completo, inclusive <code>&lt;script&gt;</code>.
          </p>
          <Field label="CSS personalizado" hint="Ex.: .ck-btn { background:#000 } · .ck-card { padding:40px }">
            <textarea
              rows={5}
              className="mono"
              value={d.theme.customCss || ''}
              onChange={(e) => set('theme', { ...d.theme, customCss: e.target.value })}
            />
          </Field>
          <div className="row">
            <Field label="HTML no topo">
              <textarea rows={4} className="mono" value={d.theme.htmlTop || ''} onChange={(e) => set('theme', { ...d.theme, htmlTop: e.target.value })} />
            </Field>
            <Field label="HTML antes dos botões">
              <textarea rows={4} className="mono" value={d.theme.htmlBeforeCta || ''} onChange={(e) => set('theme', { ...d.theme, htmlBeforeCta: e.target.value })} />
            </Field>
            <Field label="HTML no rodapé">
              <textarea rows={4} className="mono" value={d.theme.htmlBottom || ''} onChange={(e) => set('theme', { ...d.theme, htmlBottom: e.target.value })} />
            </Field>
          </div>

          <div className="toolbar" style={{ marginTop: 16 }}>
            <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Salvando…' : 'Salvar upsell'}</button>
            <button className="btn" onClick={() => setD(null)}>Cancelar</button>
            {d.id > 0 && <a className="btn" href={`/u/${d.slug}`} target="_blank" rel="noreferrer">Abrir página →</a>}
          </div>
        </div>
      )}

      <table className="dash-table">
        <thead>
          <tr><th>Upsell</th><th>Valor</th><th>Downsell</th><th>Aceita →</th><th>Recusa →</th><th>Link</th><th></th></tr>
        </thead>
        <tbody>
          {data?.length === 0 && <tr><td colSpan={7} className="muted">Nenhum upsell criado.</td></tr>}
          {data?.map((u) => (
            <tr key={u.id}>
              <td>{u.name}</td>
              <td>{brlText(u.price_cents)}</td>
              <td>{u.downsell_price_cents ? brlText(u.downsell_price_cents) : <span className="muted">—</span>}</td>
              <td>{data.find((x) => x.id === u.next_on_accept_id)?.name ?? <span className="muted">final</span>}</td>
              <td>{data.find((x) => x.id === u.next_on_decline_id)?.name ?? <span className="muted">final</span>}</td>
              <td className="mono"><a href={`/u/${u.slug}`} target="_blank" rel="noreferrer">/u/{u.slug}</a></td>
              <td style={{ whiteSpace: 'nowrap' }}>
                <button className="btn" onClick={() => editRow(u)}>Editar</button>{' '}
                <button className="btn btn-danger" onClick={() => remove(u.id)}>Excluir</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
