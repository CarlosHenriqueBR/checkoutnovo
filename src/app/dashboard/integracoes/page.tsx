'use client';

import { useEffect, useState } from 'react';
import { api, useResource, Field } from '../ui';

export default function IntegracoesPage() {
  const { data, reload } = useResource<Record<string, string>>('/api/admin/settings');
  const [token, setToken] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    if (data?.utmify_token) setToken(data.utmify_token);
  }, [data]);

  async function save() {
    setErr('');
    setMsg('');
    try {
      await api('/api/admin/settings', { method: 'POST', body: JSON.stringify({ utmify_token: token }) });
      setMsg('Salvo.');
      reload();
    } catch (e) {
      setErr(String((e as Error).message));
    }
  }

  const trackUrl = typeof window !== 'undefined' ? `${location.origin}/t.js` : '/t.js';

  return (
    <>
      <h1 className="dash-h1">Integrações</h1>
      <p className="dash-desc">UTMify e o script de rastreamento das páginas de entrada.</p>

      <div className="vg-card">
        <h2 className="dash-h1" style={{ fontSize: 16 }}>UTMify</h2>
        <p className="muted" style={{ fontSize: 13 }}>
          Cada pedido é enviado duas vezes com o mesmo <code>orderId</code>: <b>waiting_payment</b> quando o PIX é
          gerado e <b>paid</b> quando a Duttyfy confirma. Os parâmetros de rastreamento são os mesmos que vão no campo{' '}
          <code>utm</code> da Duttyfy.
        </p>
        {err && <div className="vg-alert">{err}</div>}
        {msg && <div className="vg-alert" style={{ background: '#ecfdf5', borderColor: '#a7f3d0', color: '#065f46' }}>{msg}</div>}
        <Field label="API Token da UTMify" hint="Painel da UTMify → Integrações → Credenciais de API">
          <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="cole o token aqui" />
        </Field>
        <button className="btn btn-primary" onClick={save}>Salvar</button>
      </div>

      <div className="vg-card">
        <h2 className="dash-h1" style={{ fontSize: 16 }}>Script de rastreamento</h2>
        <p className="muted" style={{ fontSize: 13 }}>
          Cole no <code>&lt;head&gt;</code> de <b>toda</b> página que recebe tráfego pago (presell, VSL, landing).
          Sem ele, o <code>fbclid</code>, <code>ttclid</code>, <code>click_id</code> e <code>gclid</code> não chegam ao
          gateway. No checkout ele já vem embutido.
        </p>
        <pre className="mono" style={{ background: '#f9fafb', padding: 10, borderRadius: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          {`<script src="${trackUrl}" async></script>`}
        </pre>
        <p className="muted" style={{ fontSize: 12 }}>
          Ele salva os parâmetros em <code>localStorage</code> + cookie 1st-party por 30 dias, decora automaticamente os
          links internos e preenche o checkout com nome/CPF/e-mail/telefone já usados pelo visitante.
        </p>
      </div>
    </>
  );
}
