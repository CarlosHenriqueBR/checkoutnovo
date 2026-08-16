'use client';

import { useState } from 'react';
import { api, useResource, MoneyInput, ImageField, Field, brlText } from '../ui';
import type { Product } from '@/lib/types';

const EMPTY = { id: 0, name: '', description: '', image_url: '', price_cents: 0, delivery_url: '' };

export default function ProdutosPage() {
  const { data, loading, error, reload } = useResource<Product[]>('/api/admin/products');
  const [edit, setEdit] = useState<typeof EMPTY | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    if (!edit) return;
    setSaving(true);
    setErr('');
    try {
      if (edit.id) await api(`/api/admin/products/${edit.id}`, { method: 'PUT', body: JSON.stringify(edit) });
      else await api('/api/admin/products', { method: 'POST', body: JSON.stringify(edit) });
      setEdit(null);
      reload();
    } catch (e) {
      setErr(String((e as Error).message));
    }
    setSaving(false);
  }

  async function remove(id: number) {
    if (!confirm('Excluir este produto?')) return;
    await api(`/api/admin/products/${id}`, { method: 'DELETE' });
    reload();
  }

  return (
    <>
      <h1 className="dash-h1">Produtos</h1>
      <p className="dash-desc">Cadastro base usado pelos checkouts (imagem, valor e link de entrega).</p>

      <div className="toolbar">
        <button className="btn btn-primary" onClick={() => setEdit({ ...EMPTY })}>+ Novo produto</button>
        <button className="btn" onClick={reload}>Atualizar</button>
      </div>

      {error && <div className="vg-alert">{error}</div>}
      {loading && <p className="muted">Carregando…</p>}

      {edit && (
        <div className="vg-card">
          <h2 className="dash-h1" style={{ fontSize: 16 }}>{edit.id ? 'Editar produto' : 'Novo produto'}</h2>
          {err && <div className="vg-alert">{err}</div>}
          <div className="row">
            <Field label="Nome">
              <input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            </Field>
            <MoneyInput label="Valor (R$)" value={edit.price_cents} onChange={(c) => setEdit({ ...edit, price_cents: c })} />
          </div>
          <ImageField label="Imagem do produto" value={edit.image_url} onChange={(u) => setEdit({ ...edit, image_url: u })} />
          <Field label="Descrição">
            <textarea rows={3} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
          </Field>
          <Field label="Link de entrega" hint="Para onde o comprador vai depois de pagar (área de membros, grupo, PDF…)">
            <input value={edit.delivery_url} onChange={(e) => setEdit({ ...edit, delivery_url: e.target.value })} />
          </Field>
          <div className="toolbar">
            <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button>
            <button className="btn" onClick={() => setEdit(null)}>Cancelar</button>
          </div>
        </div>
      )}

      <table className="dash-table">
        <thead>
          <tr><th>Produto</th><th>Valor</th><th>Entrega</th><th></th></tr>
        </thead>
        <tbody>
          {data?.length === 0 && <tr><td colSpan={4} className="muted">Nenhum produto cadastrado.</td></tr>}
          {data?.map((p) => (
            <tr key={p.id}>
              <td>{p.name}</td>
              <td>{brlText(p.price_cents)}</td>
              <td className="mono muted">{p.delivery_url || '—'}</td>
              <td style={{ whiteSpace: 'nowrap' }}>
                <button className="btn" onClick={() => setEdit({ ...EMPTY, ...p })}>Editar</button>{' '}
                <button className="btn btn-danger" onClick={() => remove(p.id)}>Excluir</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
