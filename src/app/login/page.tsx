'use client';

import { useState } from 'react';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    setLoading(false);
    if (!res.ok) {
      setError('Senha incorreta.');
      return;
    }
    const next = new URLSearchParams(location.search).get('next') || '/dashboard';
    location.href = next;
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <form className="vg-card" style={{ maxWidth: 360, width: '100%' }} onSubmit={submit}>
        <h1 className="dash-h1" style={{ marginBottom: 16 }}>Vega Checkout</h1>
        {error && <div className="vg-alert">{error}</div>}
        <div className="field">
          <label htmlFor="pw">Senha do painel</label>
          <input
            id="pw"
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button className="vg-btn" disabled={loading}>{loading ? 'Entrando…' : 'Entrar'}</button>
      </form>
    </div>
  );
}
