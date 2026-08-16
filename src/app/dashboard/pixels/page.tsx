'use client';

import { useState } from 'react';
import { api, useResource, Field } from '../ui';
import type { PixelAccount, PixelAccountConfig, Platform } from '@/lib/types';

const PLATFORMS: { value: Platform; label: string; help: string }[] = [
  { value: 'google_ads', label: 'Google Ads', help: 'Dispara conversão no navegador (gtag) e importação offline via API (gclid).' },
  { value: 'ga4', label: 'Google Analytics 4', help: 'Evento purchase via Measurement Protocol (server-side).' },
  { value: 'meta', label: 'Meta / Facebook', help: 'Pixel + Conversions API com deduplicação por event_id.' },
  { value: 'tiktok', label: 'TikTok Ads', help: 'Pixel + Events API usando ttclid.' },
  { value: 'kwai', label: 'Kwai Ads', help: 'Pixel + Event API usando click_id.' },
];

const FIELDS: Record<Platform, { key: keyof PixelAccountConfig; label: string; hint?: string }[]> = {
  google_ads: [
    { key: 'conversionId', label: 'ID de conversão (AW-…)', hint: 'Usado no gtag do navegador' },
    { key: 'conversionLabel', label: 'Rótulo da conversão' },
    { key: 'customerId', label: 'Customer ID', hint: 'Só números, sem hífen' },
    { key: 'loginCustomerId', label: 'Login Customer ID (MCC)', hint: 'Opcional' },
    { key: 'conversionActionId', label: 'Conversion Action ID', hint: 'Só números' },
    { key: 'developerToken', label: 'Developer token' },
    { key: 'clientId', label: 'OAuth Client ID' },
    { key: 'clientSecret', label: 'OAuth Client Secret' },
    { key: 'refreshToken', label: 'OAuth Refresh Token' },
  ],
  ga4: [
    { key: 'measurementId', label: 'Measurement ID (G-…)' },
    { key: 'apiSecret', label: 'API Secret' },
  ],
  meta: [
    { key: 'pixelId', label: 'Pixel ID' },
    { key: 'accessToken', label: 'Access Token (CAPI)' },
    { key: 'testEventCode', label: 'Test Event Code', hint: 'Opcional, só para testes' },
  ],
  tiktok: [
    { key: 'tiktokPixelId', label: 'Pixel ID' },
    { key: 'tiktokAccessToken', label: 'Access Token' },
  ],
  kwai: [
    { key: 'kwaiPixelId', label: 'Pixel ID' },
    { key: 'kwaiAccessToken', label: 'Access Token' },
  ],
};

interface Draft {
  id: number;
  name: string;
  platform: Platform;
  active: boolean;
  config: PixelAccountConfig;
}

const EMPTY: Draft = { id: 0, name: '', platform: 'google_ads', active: true, config: {} };

export default function PixelsPage() {
  const { data, loading, error, reload } = useResource<PixelAccount[]>('/api/admin/pixels');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!draft) return;
    setSaving(true);
    setErr('');
    try {
      const body = JSON.stringify({ name: draft.name, platform: draft.platform, config: draft.config, active: draft.active });
      if (draft.id) await api(`/api/admin/pixels/${draft.id}`, { method: 'PUT', body });
      else await api('/api/admin/pixels', { method: 'POST', body });
      setDraft(null);
      reload();
    } catch (e) {
      setErr(String((e as Error).message));
    }
    setSaving(false);
  }

  async function remove(id: number) {
    if (!confirm('Excluir esta conta de pixel?')) return;
    await api(`/api/admin/pixels/${id}`, { method: 'DELETE' });
    reload();
  }

  function editRow(p: PixelAccount) {
    let config: PixelAccountConfig = {};
    try {
      config = JSON.parse(p.config_json);
    } catch {
      config = {};
    }
    setDraft({ id: p.id, name: p.name, platform: p.platform, active: !!p.active, config });
  }

  return (
    <>
      <h1 className="dash-h1">Pixels e conversões</h1>
      <p className="dash-desc">
        Cadastre quantas contas quiser — inclusive várias do Google. Cada checkout escolhe quais contas recebem o
        evento de venda paga.
      </p>

      <div className="toolbar">
        <button className="btn btn-primary" onClick={() => setDraft({ ...EMPTY, config: {} })}>+ Nova conta</button>
        <button className="btn" onClick={reload}>Atualizar</button>
      </div>

      {error && <div className="vg-alert">{error}</div>}
      {loading && <p className="muted">Carregando…</p>}

      {draft && (
        <div className="vg-card">
          <h2 className="dash-h1" style={{ fontSize: 16 }}>{draft.id ? 'Editar conta' : 'Nova conta'}</h2>
          {err && <div className="vg-alert">{err}</div>}
          <div className="row">
            <Field label="Nome da conta" hint="Ex.: Google Ads — BM 2">
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </Field>
            <Field label="Plataforma">
              <select
                value={draft.platform}
                onChange={(e) => setDraft({ ...draft, platform: e.target.value as Platform, config: {} })}
              >
                {PLATFORMS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </Field>
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: -4 }}>
            {PLATFORMS.find((p) => p.value === draft.platform)?.help}
          </p>

          <div className="row">
            {FIELDS[draft.platform].map((f) => (
              <Field key={String(f.key)} label={f.label} hint={f.hint}>
                <input
                  value={(draft.config[f.key] as string) || ''}
                  onChange={(e) => setDraft({ ...draft, config: { ...draft.config, [f.key]: e.target.value } })}
                />
              </Field>
            ))}
          </div>

          <label style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '8px 0 14px' }}>
            <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
            Conta ativa
          </label>

          <div className="toolbar">
            <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button>
            <button className="btn" onClick={() => setDraft(null)}>Cancelar</button>
          </div>
        </div>
      )}

      <table className="dash-table">
        <thead>
          <tr><th>Conta</th><th>Plataforma</th><th>Identificador</th><th>Status</th><th></th></tr>
        </thead>
        <tbody>
          {data?.length === 0 && <tr><td colSpan={5} className="muted">Nenhuma conta cadastrada.</td></tr>}
          {data?.map((p) => {
            let cfg: PixelAccountConfig = {};
            try {
              cfg = JSON.parse(p.config_json);
            } catch {
              cfg = {};
            }
            const ident = cfg.conversionId || cfg.measurementId || cfg.pixelId || cfg.tiktokPixelId || cfg.kwaiPixelId || '—';
            return (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{PLATFORMS.find((x) => x.value === p.platform)?.label ?? p.platform}</td>
                <td className="mono">{ident}</td>
                <td>{p.active ? <span className="tag tag-ok">ativa</span> : <span className="tag">pausada</span>}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn" onClick={() => editRow(p)}>Editar</button>{' '}
                  <button className="btn btn-danger" onClick={() => remove(p.id)}>Excluir</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
