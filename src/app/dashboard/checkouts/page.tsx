'use client';

import { useState } from 'react';
import { api, useResource, MoneyInput, ImageField, Field, brlText } from '../ui';
import type { Checkout, CheckoutConfig, PixelAccount, Product, Upsell, Gateway } from '@/lib/types';

interface Row extends Checkout {
  pixel_ids: number[];
}

interface Draft {
  id: number;
  slug: string;
  name: string;
  product_id: number | null;
  gateway_id: number | null;
  headline: string;
  subheadline: string;
  image_url: string;
  price_cents: number;
  downsell_price_cents: number;
  downsell_headline: string;
  backredirect_enabled: boolean;
  backredirect_url: string;
  exit_offer_enabled: boolean;
  upsell_id: number | null;
  thankyou_url: string;
  active: boolean;
  pixel_ids: number[];
  config: CheckoutConfig;
}

const EMPTY: Draft = {
  id: 0,
  slug: '',
  name: '',
  product_id: null,
  gateway_id: null,
  headline: '',
  subheadline: '',
  image_url: '',
  price_cents: 0,
  downsell_price_cents: 0,
  downsell_headline: 'Espere! Última chance com desconto',
  backredirect_enabled: true,
  backredirect_url: '',
  exit_offer_enabled: true,
  upsell_id: null,
  thankyou_url: '/obrigado',
  active: true,
  pixel_ids: [],
  config: {
    primaryColor: '#00b37e',
    accentColor: '#f59e0b',
    bgColor: '#f4f5f7',
    textColor: '#14181f',
    timerSeconds: 900,
    timerText: 'Oferta expira em',
    askEmail: true,
    askPhone: true,
    askDocument: true,
    bumpEnabled: false,
    bumpTitle: '',
    bumpDescription: '',
    bumpPriceCents: 0,
    showSecurityBadges: true,
    noticeText: 'Compra 100% segura • Pagamento via PIX',
    ctaLabel: '',
    pollIntervalMs: 5000,
  },
};

export default function CheckoutsPage() {
  const checkouts = useResource<Row[]>('/api/admin/checkouts');
  const products = useResource<Product[]>('/api/admin/products');
  const pixels = useResource<PixelAccount[]>('/api/admin/pixels');
  const upsells = useResource<Upsell[]>('/api/admin/upsells');
  const gateways = useResource<Gateway[]>('/api/admin/gateways');

  const [d, setD] = useState<Draft | null>(null);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  function set<K extends keyof Draft>(k: K, v: Draft[K]) {
    if (d) setD({ ...d, [k]: v });
  }
  function setCfg<K extends keyof CheckoutConfig>(k: K, v: CheckoutConfig[K]) {
    if (d) setD({ ...d, config: { ...d.config, [k]: v } });
  }

  function editRow(row: Row) {
    let config: CheckoutConfig = {};
    try {
      config = JSON.parse(row.config_json);
    } catch {
      config = {};
    }
    setD({
      id: row.id,
      slug: row.slug,
      name: row.name,
      product_id: row.product_id,
      gateway_id: row.gateway_id,
      headline: row.headline,
      subheadline: row.subheadline,
      image_url: row.image_url,
      price_cents: row.price_cents,
      downsell_price_cents: row.downsell_price_cents,
      downsell_headline: row.downsell_headline,
      backredirect_enabled: !!row.backredirect_enabled,
      backredirect_url: row.backredirect_url,
      exit_offer_enabled: !!row.exit_offer_enabled,
      upsell_id: row.upsell_id,
      thankyou_url: row.thankyou_url,
      active: !!row.active,
      pixel_ids: row.pixel_ids || [],
      config: { ...EMPTY.config, ...config },
    });
  }

  async function save() {
    if (!d) return;
    setSaving(true);
    setErr('');
    try {
      const body = JSON.stringify(d);
      if (d.id) await api(`/api/admin/checkouts/${d.id}`, { method: 'PUT', body });
      else await api('/api/admin/checkouts', { method: 'POST', body });
      setD(null);
      checkouts.reload();
    } catch (e) {
      setErr(String((e as Error).message));
    }
    setSaving(false);
  }

  async function remove(id: number) {
    if (!confirm('Excluir este checkout?')) return;
    await api(`/api/admin/checkouts/${id}`, { method: 'DELETE' });
    checkouts.reload();
  }

  return (
    <>
      <h1 className="dash-h1">Checkouts</h1>
      <p className="dash-desc">Imagem, valor, ticket menor, backredirect, upsells e quais pixels recebem a venda.</p>

      <div className="toolbar">
        <button className="btn btn-primary" onClick={() => setD({ ...EMPTY, config: { ...EMPTY.config } })}>+ Novo checkout</button>
        <button className="btn" onClick={checkouts.reload}>Atualizar</button>
      </div>

      {checkouts.error && <div className="vg-alert">{checkouts.error}</div>}

      {d && (
        <div className="vg-card">
          <h2 className="dash-h1" style={{ fontSize: 16 }}>{d.id ? `Editar: ${d.name}` : 'Novo checkout'}</h2>
          {err && <div className="vg-alert">{err}</div>}

          <h3 className="dash-h1" style={{ fontSize: 14, marginTop: 12 }}>Produto e oferta</h3>
          <div className="row">
            <Field label="Nome interno">
              <input value={d.name} onChange={(e) => set('name', e.target.value)} />
            </Field>
            <Field label="Slug (URL)" hint={`/c/${d.slug || 'meu-checkout'}`}>
              <input value={d.slug} onChange={(e) => set('slug', e.target.value)} placeholder="meu-checkout" />
            </Field>
            <Field label="Produto vinculado">
              <select value={d.product_id ?? ''} onChange={(e) => set('product_id', e.target.value ? Number(e.target.value) : null)}>
                <option value="">— nenhum —</option>
                {products.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="Gateway">
              <select value={d.gateway_id ?? ''} onChange={(e) => set('gateway_id', e.target.value ? Number(e.target.value) : null)}>
                <option value="">— padrão —</option>
                {gateways.data?.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </Field>
          </div>

          <div className="row">
            <Field label="Título exibido">
              <input value={d.headline} onChange={(e) => set('headline', e.target.value)} />
            </Field>
            <Field label="Subtítulo">
              <input value={d.subheadline} onChange={(e) => set('subheadline', e.target.value)} />
            </Field>
          </div>
          <ImageField label="Imagem do produto" value={d.image_url} onChange={(u) => set('image_url', u)} />

          <div className="row">
            <MoneyInput label="Valor do produto (R$)" value={d.price_cents} onChange={(c) => set('price_cents', c)} />
            <MoneyInput
              label="Ticket menor (R$)"
              value={d.downsell_price_cents}
              onChange={(c) => set('downsell_price_cents', c)}
              hint="Oferecido quando o cliente tenta sair. 0 = desligado."
            />
            <Field label="Título da oferta de saída">
              <input value={d.downsell_headline} onChange={(e) => set('downsell_headline', e.target.value)} />
            </Field>
          </div>

          <h3 className="dash-h1" style={{ fontSize: 14, marginTop: 16 }}>Backredirect</h3>
          <div className="row">
            <Field label="Ativar trava do botão voltar">
              <select value={d.backredirect_enabled ? '1' : '0'} onChange={(e) => set('backredirect_enabled', e.target.value === '1')}>
                <option value="1">Sim</option>
                <option value="0">Não</option>
              </select>
            </Field>
            <Field label="Oferecer ticket menor ao sair">
              <select value={d.exit_offer_enabled ? '1' : '0'} onChange={(e) => set('exit_offer_enabled', e.target.value === '1')}>
                <option value="1">Sim</option>
                <option value="0">Não</option>
              </select>
            </Field>
            <Field label="URL do backredirect" hint="Para onde ir se o cliente recusar a oferta de saída">
              <input value={d.backredirect_url} onChange={(e) => set('backredirect_url', e.target.value)} placeholder="https://..." />
            </Field>
          </div>

          <h3 className="dash-h1" style={{ fontSize: 14, marginTop: 16 }}>Order bump</h3>
          <div className="row">
            <Field label="Ativar">
              <select value={d.config.bumpEnabled ? '1' : '0'} onChange={(e) => setCfg('bumpEnabled', e.target.value === '1')}>
                <option value="0">Não</option>
                <option value="1">Sim</option>
              </select>
            </Field>
            <Field label="Título do bump">
              <input value={d.config.bumpTitle || ''} onChange={(e) => setCfg('bumpTitle', e.target.value)} />
            </Field>
            <MoneyInput label="Valor do bump (R$)" value={d.config.bumpPriceCents || 0} onChange={(c) => setCfg('bumpPriceCents', c)} />
          </div>
          <Field label="Descrição do bump">
            <input value={d.config.bumpDescription || ''} onChange={(e) => setCfg('bumpDescription', e.target.value)} />
          </Field>

          <h3 className="dash-h1" style={{ fontSize: 14, marginTop: 16 }}>Funil pós-pagamento</h3>
          <div className="row">
            <Field label="Primeiro upsell" hint="Para onde o comprador vai depois de pagar">
              <select value={d.upsell_id ?? ''} onChange={(e) => set('upsell_id', e.target.value ? Number(e.target.value) : null)}>
                <option value="">— ir direto para a página de obrigado —</option>
                {upsells.data?.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </Field>
            <Field label="Página de obrigado">
              <input value={d.thankyou_url} onChange={(e) => set('thankyou_url', e.target.value)} />
            </Field>
          </div>

          <h3 className="dash-h1" style={{ fontSize: 14, marginTop: 16 }}>Aparência e campos</h3>
          <div className="row">
            <Field label="Cor principal">
              <input type="color" value={d.config.primaryColor || '#00b37e'} onChange={(e) => setCfg('primaryColor', e.target.value)} />
            </Field>
            <Field label="Cor de destaque">
              <input type="color" value={d.config.accentColor || '#f59e0b'} onChange={(e) => setCfg('accentColor', e.target.value)} />
            </Field>
            <Field label="Fundo">
              <input type="color" value={d.config.bgColor || '#f4f5f7'} onChange={(e) => setCfg('bgColor', e.target.value)} />
            </Field>
            <Field label="Contador (segundos)" hint="0 = desligado">
              <input
                type="number"
                value={d.config.timerSeconds ?? 0}
                onChange={(e) => setCfg('timerSeconds', Number(e.target.value))}
              />
            </Field>
          </div>
          <div className="row">
            <Field label="Texto do topo">
              <input value={d.config.noticeText || ''} onChange={(e) => setCfg('noticeText', e.target.value)} />
            </Field>
            <Field label="Texto do botão" hint="Vazio = 'PAGAR R$ X COM PIX'">
              <input value={d.config.ctaLabel || ''} onChange={(e) => setCfg('ctaLabel', e.target.value)} />
            </Field>
          </div>
          <div className="row">
            {([
              ['askDocument', 'Pedir CPF'],
              ['askEmail', 'Pedir e-mail'],
              ['askPhone', 'Pedir telefone'],
            ] as const).map(([k, label]) => (
              <label key={k} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="checkbox" checked={d.config[k] !== false} onChange={(e) => setCfg(k, e.target.checked)} />
                {label}
              </label>
            ))}
          </div>

          <h3 className="dash-h1" style={{ fontSize: 14, marginTop: 16 }}>Contas de pixel que recebem a venda</h3>
          <div className="row">
            {pixels.data?.length === 0 && <span className="muted">Nenhuma conta cadastrada ainda.</span>}
            {pixels.data?.map((p) => (
              <label key={p.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={d.pixel_ids.includes(p.id)}
                  onChange={(e) =>
                    set('pixel_ids', e.target.checked ? [...d.pixel_ids, p.id] : d.pixel_ids.filter((x) => x !== p.id))
                  }
                />
                {p.name} <span className="muted">({p.platform})</span>
              </label>
            ))}
          </div>

          <div className="toolbar" style={{ marginTop: 18 }}>
            <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Salvando…' : 'Salvar checkout'}</button>
            <button className="btn" onClick={() => setD(null)}>Cancelar</button>
            {d.id > 0 && (
              <a className="btn" href={`/c/${d.slug}`} target="_blank" rel="noreferrer">Abrir checkout →</a>
            )}
          </div>
        </div>
      )}

      <table className="dash-table">
        <thead>
          <tr><th>Checkout</th><th>Valor</th><th>Ticket menor</th><th>Upsell</th><th>Pixels</th><th>Link</th><th></th></tr>
        </thead>
        <tbody>
          {checkouts.data?.length === 0 && <tr><td colSpan={7} className="muted">Nenhum checkout criado.</td></tr>}
          {checkouts.data?.map((c) => (
            <tr key={c.id}>
              <td>{c.name}{!c.active && <> <span className="tag">pausado</span></>}</td>
              <td>{brlText(c.price_cents)}</td>
              <td>{c.downsell_price_cents ? brlText(c.downsell_price_cents) : <span className="muted">—</span>}</td>
              <td>{upsells.data?.find((u) => u.id === c.upsell_id)?.name ?? <span className="muted">—</span>}</td>
              <td>{c.pixel_ids.length}</td>
              <td className="mono"><a href={`/c/${c.slug}`} target="_blank" rel="noreferrer">/c/{c.slug}</a></td>
              <td style={{ whiteSpace: 'nowrap' }}>
                <button className="btn" onClick={() => editRow(c)}>Editar</button>{' '}
                <button className="btn btn-danger" onClick={() => remove(c.id)}>Excluir</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
