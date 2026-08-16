'use client';

import { useState } from 'react';
import { api, useResource, Field } from '../ui';

interface GatewayRow {
  id: number;
  name: string;
  encrypted_url: string;
  url_length: number;
  is_default: number;
  active: number;
}

export default function GatewayPage() {
  const { data, loading, error, reload } = useResource<GatewayRow[]>('/api/admin/gateways');
  const [name, setName] = useState('Duttyfy');
  const [url, setUrl] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const webhookUrl =
    typeof window !== 'undefined' ? `${location.origin}/api/webhooks/duttyfy?s=SEU_WEBHOOK_SECRET` : '';

  async function add() {
    setErr('');
    setMsg('');
    try {
      await api('/api/admin/gateways', { method: 'POST', body: JSON.stringify({ name, encrypted_url: url, is_default: true }) });
      setUrl('');
      setMsg('URL encriptada salva. Ela fica só no servidor — nunca vai para o navegador do cliente.');
      reload();
    } catch (e) {
      setErr(String((e as Error).message));
    }
  }

  async function remove(id: number) {
    if (!confirm('Remover este gateway?')) return;
    await api(`/api/admin/gateways/${id}`, { method: 'DELETE' });
    reload();
  }

  async function setDefault(g: GatewayRow) {
    await api(`/api/admin/gateways/${g.id}`, {
      method: 'PUT',
      body: JSON.stringify({ name: g.name, is_default: true, active: true }),
    });
    reload();
  }

  return (
    <>
      <h1 className="dash-h1">Gateway PIX (Duttyfy)</h1>
      <p className="dash-desc">
        Gere a URL encriptada em <b>Integrações e Chaves → Chaves API</b> no painel da Duttyfy e cole aqui.
        Nunca use a chave bruta.
      </p>

      <div className="vg-card">
        <h2 className="dash-h1" style={{ fontSize: 16 }}>1. URL encriptada</h2>
        {err && <div className="vg-alert">{err}</div>}
        {msg && <div className="vg-alert" style={{ background: '#ecfdf5', borderColor: '#a7f3d0', color: '#065f46' }}>{msg}</div>}
        <div className="row">
          <Field label="Nome da conta">
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="URL encriptada" hint="https://app.duttyfy.com.br/…">
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://app.duttyfy.com.br/..." />
          </Field>
        </div>
        <button className="btn btn-primary" onClick={add}>Salvar gateway</button>
      </div>

      <div className="vg-card">
        <h2 className="dash-h1" style={{ fontSize: 16 }}>2. Webhook</h2>
        <p className="muted" style={{ fontSize: 13 }}>
          Em <b>Integrações e Chaves → Webhooks</b>, cadastre a URL abaixo (troque <code>SEU_WEBHOOK_SECRET</code> pelo
          valor da variável <code>WEBHOOK_SECRET</code> do seu <code>.env.local</code>):
        </p>
        <pre className="mono" style={{ background: '#f9fafb', padding: 10, borderRadius: 8, wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>
          {webhookUrl}
        </pre>
        <p className="muted" style={{ fontSize: 12 }}>
          O webhook é a fonte primária. O checkout também faz polling a cada 5s como fallback — os dois usam a mesma
          trava de idempotência, então a conversão nunca é disparada duas vezes.
        </p>
      </div>

      {error && <div className="vg-alert">{error}</div>}
      {loading && <p className="muted">Carregando…</p>}

      <table className="dash-table">
        <thead>
          <tr><th>Conta</th><th>URL (mascarada)</th><th>Padrão</th><th></th></tr>
        </thead>
        <tbody>
          {data?.length === 0 && <tr><td colSpan={4} className="muted">Nenhum gateway cadastrado.</td></tr>}
          {data?.map((g) => (
            <tr key={g.id}>
              <td>{g.name}</td>
              <td className="mono muted">{g.encrypted_url}</td>
              <td>{g.is_default ? <span className="tag tag-ok">padrão</span> : <button className="btn" onClick={() => setDefault(g)}>tornar padrão</button>}</td>
              <td><button className="btn btn-danger" onClick={() => remove(g.id)}>Excluir</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
