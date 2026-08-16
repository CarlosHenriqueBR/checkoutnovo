'use client';

import { useCallback, useEffect, useState } from 'react';

export async function api<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Erro ${res.status}`);
  return data as T;
}

export function useResource<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    setLoading(true);
    api<T>(url)
      .then((d) => {
        setData(d);
        setError('');
      })
      .catch((e) => setError(String(e.message || e)))
      .finally(() => setLoading(false));
  }, [url]);

  useEffect(reload, [reload]);
  return { data, error, loading, reload, setData };
}

/** Campo de valor em reais que grava centavos. */
export function MoneyInput({
  value,
  onChange,
  label,
  hint,
}: {
  value: number;
  onChange: (cents: number) => void;
  label: string;
  hint?: string;
}) {
  const [text, setText] = useState((value / 100).toFixed(2).replace('.', ','));
  useEffect(() => {
    setText((value / 100).toFixed(2).replace('.', ','));
  }, [value]);

  return (
    <div className="field">
      <label>{label}</label>
      <input
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          const raw = e.target.value;
          setText(raw);
          const cents = Math.round(parseFloat(raw.replace(/\./g, '').replace(',', '.')) * 100);
          onChange(Number.isFinite(cents) ? cents : 0);
        }}
      />
      {hint && <small>{hint}</small>}
    </div>
  );
}

/** Upload de imagem local — devolve a URL em /uploads. */
export function ImageField({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (url: string) => void;
  label: string;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function upload(file: File) {
    setBusy(true);
    setErr('');
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha no upload');
      onChange(data.url);
    } catch (e) {
      setErr(String((e as Error).message));
    }
    setBusy(false);
  }

  return (
    <div className="field">
      <label>{label}</label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--vg-border)' }} />
        ) : null}
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="/uploads/… ou https://…" />
        <label className="btn" style={{ whiteSpace: 'nowrap', cursor: 'pointer' }}>
          {busy ? '…' : 'Enviar'}
          <input
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
            }}
          />
        </label>
      </div>
      {err && <small style={{ color: 'var(--vg-danger)' }}>{err}</small>}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint && <small>{hint}</small>}
    </div>
  );
}

export function brlText(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
