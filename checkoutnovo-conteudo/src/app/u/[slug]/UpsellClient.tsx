'use client';

import { useEffect, useRef, useState } from 'react';
import type { UpsellBlock, UpsellTheme } from '@/lib/types';
import { brl } from '@/lib/utils';

interface Props {
  slug: string;
  name: string;
  headline: string;
  subheadline: string;
  imageUrl: string;
  bodyHtml: string;
  blocks: UpsellBlock[];
  theme: UpsellTheme;
  priceCents: number;
  downsellPriceCents: number;
  downsellHeadline: string;
  acceptLabel: string;
  declineLabel: string;
  nextOnAccept: string;
  nextOnDecline: string;
  finalUrl: string;
}

interface PixState {
  orderId: string;
  pixCode: string;
  qrDataUrl: string;
  amountCents: number;
}

function Blocks({ blocks }: { blocks: UpsellBlock[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'heading':
            return <h2 key={i} className="ck-card-title" style={{ fontSize: 19, marginTop: 16 }}>{b.text}</h2>;
          case 'text':
            return <p key={i} style={{ margin: '8px 0' }}>{b.text}</p>;
          case 'image':
            // eslint-disable-next-line @next/next/no-img-element
            return <img key={i} src={b.url} alt={b.alt || ''} style={{ borderRadius: 10, margin: '12px 0' }} />;
          case 'video':
            return (
              <div key={i} style={{ position: 'relative', paddingTop: '56.25%', margin: '12px 0' }}>
                <iframe
                  src={b.url}
                  title={`video-${i}`}
                  allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
                  allowFullScreen
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0, borderRadius: 10 }}
                />
              </div>
            );
          case 'list':
            return (
              <ul key={i} style={{ paddingLeft: 20, margin: '8px 0' }}>
                {b.items.map((it, j) => (
                  <li key={j} style={{ marginBottom: 4 }}>{it}</li>
                ))}
              </ul>
            );
          case 'divider':
            return <hr key={i} style={{ border: 0, borderTop: '1px solid var(--ck-border)', margin: '16px 0' }} />;
          case 'html':
            return <div key={i} dangerouslySetInnerHTML={{ __html: b.html }} />;
          default:
            return null;
        }
      })}
    </>
  );
}

export default function UpsellClient(p: Props) {
  const [offer, setOffer] = useState<'main' | 'downsell'>('main');
  const [pix, setPix] = useState<PixState | null>(null);
  const [paid, setPaid] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [parentOrderId, setParentOrderId] = useState('');
  const poll = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const o = q.get('o') || '';
    if (o) {
      setParentOrderId(o);
      try {
        sessionStorage.setItem('vg_parent_order', o);
      } catch {
        /* ignora */
      }
    } else {
      try {
        setParentOrderId(sessionStorage.getItem('vg_parent_order') || '');
      } catch {
        /* ignora */
      }
    }
  }, []);

  function nextUrl(kind: 'accept' | 'decline'): string {
    const slug = kind === 'accept' ? p.nextOnAccept : p.nextOnDecline;
    const base = slug ? `/u/${slug}` : p.finalUrl || '/obrigado';
    const q = window.VegaTrack?.query?.() || '';
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}o=${encodeURIComponent(parentOrderId)}${q ? `&${q}` : ''}`;
  }

  async function accept(which: 'main' | 'downsell') {
    setError('');
    if (!parentOrderId) {
      setError('Não encontramos seu pedido. Volte ao checkout e finalize a compra novamente.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/pix/upsell', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          slug: p.slug,
          parentOrderId,
          offer: which,
          tracking: window.VegaTrack?.get?.() ?? {},
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Não foi possível gerar o PIX.');
        setLoading(false);
        return;
      }
      setPix({ orderId: data.orderId, pixCode: data.pixCode, qrDataUrl: data.qrDataUrl, amountCents: data.amountCents });
    } catch {
      setError('Falha de conexão. Tente novamente.');
    }
    setLoading(false);
  }

  function decline() {
    // Primeiro "não" cai no downsell, se houver.
    if (offer === 'main' && p.downsellPriceCents > 0) {
      setOffer('downsell');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    window.location.href = nextUrl('decline');
  }

  useEffect(() => {
    if (!pix || paid) return;
    let alive = true;
    const check = async () => {
      try {
        const res = await fetch(`/api/pix/status?orderId=${encodeURIComponent(pix.orderId)}`, { cache: 'no-store' });
        const data = await res.json();
        if (!alive) return;
        if (data.paid) {
          setPaid(true);
          setTimeout(() => { window.location.href = nextUrl('accept'); }, 900);
          return;
        }
      } catch {
        /* tenta de novo */
      }
      if (alive) poll.current = setTimeout(check, 5000);
    };
    poll.current = setTimeout(check, 3000);
    return () => {
      alive = false;
      if (poll.current) clearTimeout(poll.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pix, paid]);

  async function copyPix() {
    if (!pix) return;
    try {
      await navigator.clipboard.writeText(pix.pixCode);
    } catch {
      /* ignora */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const style = {
    '--ck-green': p.theme.primaryColor || '#5cc47f',
    '--ck-bg': p.theme.bgColor || '#f2f2f2',
    '--ck-text': p.theme.textColor || '#3d4756',
    '--ck-card': p.theme.cardColor || '#ffffff',
  } as React.CSSProperties;

  const isDown = offer === 'downsell';
  const price = isDown ? p.downsellPriceCents : p.priceCents;

  if (pix) {
    return (
      <div className="ck-page" style={style}>
        <div className="ck-topbar">{paid ? 'Pagamento aprovado!' : 'Finalize o PIX para liberar'}</div>
        <div className="ck-wrap">
          <div className="ck-card ck-pix">
            {paid ? (
              <>
                <h2 className="ck-card-title">Adicionado com sucesso ✅</h2>
                <p className="ck-sub">Redirecionando…</p>
              </>
            ) : (
              <>
                <h2 className="ck-card-title">PIX de {brl(pix.amountCents)}</h2>
                {pix.qrDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="qr" src={pix.qrDataUrl} alt="QR Code Pix" width={240} height={240} />
                ) : null}
                <textarea className="ck-code" readOnly value={pix.pixCode} />
                <button className="ck-btn" style={{ marginTop: 10 }} onClick={copyPix} type="button">
                  {copied ? '✓ Código copiado!' : 'Copiar código PIX'}
                </button>
                <p className="ck-status"><span className="ck-dot" />Aguardando confirmação…</p>
                <button className="ck-btn ck-btn-ghost" onClick={() => (window.location.href = nextUrl('decline'))}>
                  Pular esta oferta
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ck-page" style={style}>
      <div className="ck-topbar">Oferta exclusiva — só aparece uma vez</div>
      <div className="ck-wrap ck-wrap-wide">
        <div className="ck-card">
          <h1 className="ck-card-title" style={{ fontSize: 22 }}>
            {isDown ? p.downsellHeadline || p.headline : p.headline || p.name}
          </h1>
          {p.subheadline && <p className="ck-sub">{p.subheadline}</p>}
          {p.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.imageUrl} alt={p.name} style={{ borderRadius: 10, margin: '14px 0' }} />
          ) : null}

          <Blocks blocks={p.blocks} />
          {p.bodyHtml && <div dangerouslySetInnerHTML={{ __html: p.bodyHtml }} />}

          <div style={{ marginTop: 18, textAlign: 'center' }}>
            {isDown && <span className="ck-price-old">{brl(p.priceCents)}</span>}
            <span className="ck-price-big">{brl(price)}</span>
          </div>

          {error && <div className="ck-alert" style={{ marginTop: 12 }}>{error}</div>}

          <button className="ck-btn" style={{ marginTop: 14 }} disabled={loading} onClick={() => accept(offer)}>
            {loading ? 'Gerando PIX…' : p.acceptLabel}
          </button>
          <button className="ck-btn ck-btn-ghost" onClick={decline}>
            {isDown ? 'Não, obrigado' : p.declineLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
