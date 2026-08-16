'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CheckoutConfig } from '@/lib/types';
import { brl, isValidCPF, isValidEmail, isValidPhone, onlyDigits } from '@/lib/utils';
import PixLogo from '@/components/PixLogo';
import { SecureBadge, CheckoutFooter, Chevron } from '@/components/CheckoutChrome';

declare global {
  interface Window {
    VegaTrack?: {
      get: () => Record<string, string>;
      query: () => string;
      getCustomer: () => Record<string, string>;
      saveCustomer: (c: Record<string, string>) => void;
    };
  }
}

interface Props {
  slug: string;
  name: string;
  headline: string;
  subheadline: string;
  imageUrl: string;
  priceCents: number;
  downsellPriceCents: number;
  downsellHeadline: string;
  backredirectEnabled: boolean;
  backredirectUrl: string;
  exitOfferEnabled: boolean;
  config: CheckoutConfig;
}

interface PixState {
  orderId: string;
  pixCode: string;
  qrDataUrl: string;
  amountCents: number;
  pollIntervalMs: number;
}

function maskCPF(v: string) {
  const d = onlyDigits(v).slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

function maskPhone(v: string) {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length <= 10) return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2');
  return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
}

export default function CheckoutClient(p: Props) {
  const askEmail = p.config.askEmail !== false;
  const askPhone = p.config.askPhone !== false;
  const askDoc = p.config.askDocument !== false;
  const bumpAvailable = !!p.config.bumpEnabled && (p.config.bumpPriceCents ?? 0) > 0;
  const storeName = p.config.storeName || p.name;

  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [doc, setDoc] = useState('');
  const [bump, setBump] = useState(false);
  const [offer, setOffer] = useState<'main' | 'downsell'>('main');
  const [cartOpen, setCartOpen] = useState(true);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pix, setPix] = useState<PixState | null>(null);
  const [paid, setPaid] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showExit, setShowExit] = useState(false);
  const [seconds, setSeconds] = useState(p.config.timerSeconds ?? 0);

  const exitShown = useRef(false);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ------------------ AUTOFILL: dados salvos no navegador ---------------- */
  useEffect(() => {
    const fill = () => {
      let c: Record<string, string> | null = null;
      try {
        c = window.VegaTrack?.getCustomer?.() ?? JSON.parse(localStorage.getItem('vg_customer') || 'null');
      } catch {
        c = null;
      }
      if (!c) return;
      if (c.email) setEmail((v) => v || c!.email);
      if (c.phone) setPhone((v) => v || maskPhone(c!.phone));
      if (c.name) setName((v) => v || c!.name);
      if (c.document) setDoc((v) => v || maskCPF(c!.document));
    };
    fill();
    const t = setTimeout(fill, 600); // /t.js é async
    return () => clearTimeout(t);
  }, []);

  function persistCustomer() {
    const payload = {
      name: name.trim(),
      document: onlyDigits(doc),
      email: email.trim().toLowerCase(),
      phone: onlyDigits(phone),
    };
    try {
      if (window.VegaTrack?.saveCustomer) window.VegaTrack.saveCustomer(payload);
      else localStorage.setItem('vg_customer', JSON.stringify(payload));
    } catch {
      /* modo anônimo: segue sem salvar */
    }
  }

  /* ----------------------------- timer ---------------------------------- */
  useEffect(() => {
    if (!seconds) return;
    const i = setInterval(() => setSeconds((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(i);
  }, [seconds]);

  /* ---------------- BACKREDIRECT + EXIT INTENT (ticket menor) ------------ */
  const triggerExit = useCallback(() => {
    if (exitShown.current || pix) return;
    exitShown.current = true;
    if (p.exitOfferEnabled && p.downsellPriceCents > 0) setShowExit(true);
    else if (p.backredirectUrl) window.location.href = p.backredirectUrl;
  }, [p.exitOfferEnabled, p.downsellPriceCents, p.backredirectUrl, pix]);

  useEffect(() => {
    if (!p.backredirectEnabled) return;
    try {
      history.pushState({ vg: 1 }, '', location.href);
      history.pushState({ vg: 2 }, '', location.href);
    } catch {
      /* ignora */
    }

    const onPop = () => {
      if (exitShown.current) {
        if (p.backredirectUrl) window.location.href = p.backredirectUrl;
        return;
      }
      try {
        history.pushState({ vg: 2 }, '', location.href);
      } catch {
        /* ignora */
      }
      triggerExit();
    };
    const onMouseOut = (e: MouseEvent) => {
      if (e.clientY <= 0 && !e.relatedTarget) triggerExit();
    };

    window.addEventListener('popstate', onPop);
    if (window.matchMedia('(pointer: fine)').matches) window.document.addEventListener('mouseout', onMouseOut);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.document.removeEventListener('mouseout', onMouseOut);
    };
  }, [p.backredirectEnabled, p.backredirectUrl, triggerExit]);

  /* ------------------------------ submit -------------------------------- */
  function validate(): boolean {
    const e: Record<string, string> = {};
    if (askEmail && !isValidEmail(email)) e.email = 'Informe um e-mail válido';
    if (askPhone && !isValidPhone(phone)) e.phone = 'Informe o telefone com DDD';
    if (name.trim().split(/\s+/).length < 2) e.name = 'Informe nome e sobrenome';
    if (askDoc && !isValidCPF(doc)) e.doc = 'CPF inválido';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit(e?: React.FormEvent, forcedOffer?: 'main' | 'downsell') {
    e?.preventDefault();
    setApiError('');
    if (!validate()) return;
    persistCustomer();
    setLoading(true);

    const tracking = window.VegaTrack?.get?.() ?? {};
    try {
      const res = await fetch('/api/pix/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          slug: p.slug,
          offer: forcedOffer ?? offer,
          bump,
          customer: { name: name.trim(), document: onlyDigits(doc), email: email.trim(), phone: onlyDigits(phone) },
          tracking,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setApiError(data.error || 'Não foi possível gerar o PIX. Tente novamente.');
        setLoading(false);
        return;
      }
      setPix({
        orderId: data.orderId,
        pixCode: data.pixCode,
        qrDataUrl: data.qrDataUrl,
        amountCents: data.amountCents,
        pollIntervalMs: data.pollIntervalMs || 5000,
      });
      setShowExit(false);
    } catch {
      setApiError('Falha de conexão. Verifique sua internet e tente novamente.');
    }
    setLoading(false);
  }

  /* --------------------- polling do status do pagamento ------------------ */
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
          const q = window.VegaTrack?.query?.() || '';
          const next = data.next?.url || '/obrigado';
          const sep = next.includes('?') ? '&' : '?';
          setTimeout(() => {
            window.location.href = `${next}${sep}o=${encodeURIComponent(pix.orderId)}${q ? `&${q}` : ''}`;
          }, 900);
          return;
        }
      } catch {
        /* rede instável: tenta de novo */
      }
      if (alive) pollTimer.current = setTimeout(check, pix.pollIntervalMs);
    };

    pollTimer.current = setTimeout(check, 3000);
    return () => {
      alive = false;
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, [pix, paid]);

  async function copyPix() {
    if (!pix) return;
    try {
      await navigator.clipboard.writeText(pix.pixCode);
    } catch {
      const el = window.document.getElementById('ck-pix-code') as HTMLTextAreaElement | null;
      el?.select();
      try {
        window.document.execCommand('copy');
      } catch {
        /* nada a fazer */
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  }

  const unitPrice = offer === 'downsell' && p.downsellPriceCents > 0 ? p.downsellPriceCents : p.priceCents;
  const bumpPrice = bump && bumpAvailable ? p.config.bumpPriceCents! : 0;
  const total = unitPrice + bumpPrice;

  const style = {
    '--ck-green': p.config.primaryColor || '#5cc47f',
    '--ck-blue': p.config.accentColor || '#3ea1e8',
    '--ck-bg': p.config.bgColor || '#f2f2f2',
  } as React.CSSProperties;

  /* ================================ PIX ================================== */
  if (pix) {
    return (
      <div className="ck-page" style={style}>
        <div className="ck-wrap">
          <SecureBadge />
          <div className="ck-card ck-pix">
            {paid ? (
              <>
                <h2 className="ck-card-title">Pagamento confirmado</h2>
                <p style={{ color: 'var(--ck-muted)' }}>Estamos liberando seu acesso…</p>
              </>
            ) : (
              <>
                <h2 className="ck-card-title">Pague {brl(pix.amountCents)} com Pix</h2>
                <p style={{ color: 'var(--ck-muted)', marginTop: 6 }}>
                  Abra o app do seu banco, escaneie o QR Code ou use o código copia e cola.
                </p>
                {pix.qrDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="qr" src={pix.qrDataUrl} alt="QR Code Pix" width={240} height={240} />
                ) : null}
                <textarea id="ck-pix-code" className="ck-code" readOnly value={pix.pixCode} />
                <button className="ck-btn" onClick={copyPix} type="button">
                  {copied ? 'Código copiado' : 'Copiar código Pix'}
                </button>
                <p className="ck-status">
                  <span className="ck-dot" />
                  Aguardando confirmação do pagamento…
                </p>
              </>
            )}
          </div>
        </div>
        <CheckoutFooter storeName={storeName} />
      </div>
    );
  }

  /* =============================== FORM ================================== */
  return (
    <div className="ck-page" style={style}>
      {seconds > 0 && (
        <div className="ck-timer">
          {p.config.timerText || 'Oferta expira em'}{' '}
          <b>
            {String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}
          </b>
        </div>
      )}

      <div className="ck-wrap">
        <SecureBadge />

        {/* ------------------------------ carrinho ---------------------- */}
        <section className="ck-card">
          <div className="ck-cart-head">
            <h2 className="ck-card-title">Seu carrinho</h2>
            <button className="ck-cart-toggle" type="button" onClick={() => setCartOpen((v) => !v)} aria-expanded={cartOpen}>
              <span className="ck-count">1</span>
              <Chevron open={cartOpen} />
            </button>
          </div>

          {cartOpen && (
            <div className="ck-item">
              {p.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="ck-item-img" src={p.imageUrl} alt={p.name} width={68} height={68} />
              ) : (
                <div className="ck-item-img" />
              )}
              <div>
                <p className="ck-item-name">{p.headline || p.name}</p>
                <p className="ck-item-sub">{p.subheadline || 'Aguardando pagamento'}</p>
              </div>
              <span className="ck-item-qty">1 un.</span>
            </div>
          )}

          <div className="ck-line">
            <span>Subtotal</span>
            <span>
              {offer === 'downsell' && p.priceCents > unitPrice && <span className="old">{brl(p.priceCents)}</span>}
              {brl(unitPrice)}
            </span>
          </div>
          {bumpPrice > 0 && (
            <div className="ck-line">
              <span>{p.config.bumpTitle || 'Oferta adicional'}</span>
              <span>{brl(bumpPrice)}</span>
            </div>
          )}
          <div className="ck-line total">
            <span>Total</span>
            <span>{brl(total)}</span>
          </div>
        </section>

        <form onSubmit={submit} noValidate>
          {/* --------------------------- identificação ------------------ */}
          <section className="ck-card">
            <h2 className="ck-card-title">Identificação</h2>
            {apiError && <div className="ck-alert" style={{ marginTop: 16 }}>{apiError}</div>}

            {askEmail && (
              <div className="ck-field">
                <label htmlFor="ck-email">E-mail</label>
                <input
                  id="ck-email"
                  className={`ck-input${errors.email ? ' err' : ''}`}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="email@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                {errors.email && <div className="ck-err">{errors.email}</div>}
              </div>
            )}

            {askPhone && (
              <div className="ck-field">
                <label htmlFor="ck-phone">Telefone</label>
                <input
                  id="ck-phone"
                  className={`ck-input${errors.phone ? ' err' : ''}`}
                  inputMode="tel"
                  autoComplete="tel-national"
                  placeholder="(99) 99999-9999"
                  value={phone}
                  onChange={(e) => setPhone(maskPhone(e.target.value))}
                />
                {errors.phone && <div className="ck-err">{errors.phone}</div>}
              </div>
            )}

            <div className="ck-field">
              <label htmlFor="ck-name">Nome completo</label>
              <input
                id="ck-name"
                className={`ck-input${errors.name ? ' err' : ''}`}
                autoComplete="name"
                placeholder="Nome e Sobrenome"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              {errors.name && <div className="ck-err">{errors.name}</div>}
            </div>

            {askDoc && (
              <div className="ck-field">
                <label htmlFor="ck-doc">CPF/CNPJ</label>
                <input
                  id="ck-doc"
                  className={`ck-input${errors.doc ? ' err' : ''}`}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="123.456.789-12"
                  value={doc}
                  onChange={(e) => setDoc(maskCPF(e.target.value))}
                />
                {errors.doc && <div className="ck-err">{errors.doc}</div>}
              </div>
            )}
          </section>

          {/* ------------------------------ order bump ------------------ */}
          {bumpAvailable && (
            <section className="ck-card">
              <label className="ck-bump">
                <input type="checkbox" checked={bump} onChange={(e) => setBump(e.target.checked)} />
                <span>
                  <b>{p.config.bumpTitle || 'Adicione por um valor especial'}</b>
                  <span className="desc">{p.config.bumpDescription}</span>
                  <span className="price">+ {brl(p.config.bumpPriceCents!)}</span>
                </span>
              </label>
            </section>
          )}

          {/* ------------------------------ pagamento ------------------- */}
          <section className="ck-card">
            <h2 className="ck-card-title">Pagamento</h2>

            <div className="ck-methods">
              <div className="ck-method">
                <PixLogo />
              </div>
            </div>

            <div className="ck-info">
              {p.config.pixNotice ||
                'Ao selecionar o Pix, você será encaminhado para um ambiente seguro para finalizar seu pagamento.'}
            </div>

            <button className="ck-btn" disabled={loading}>
              {loading ? 'Gerando Pix…' : p.config.ctaLabel || 'Gerar Pix'}
            </button>
          </section>
        </form>
      </div>

      <CheckoutFooter storeName={storeName} />

      {/* -------------------- OFERTA DE SAÍDA (ticket menor) ---------------- */}
      {showExit && (
        <div className="ck-modal-bg" onClick={() => setShowExit(false)}>
          <div className="ck-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="ck-card-title" style={{ fontSize: 20 }}>
              {p.downsellHeadline || 'Espere! Última chance com desconto'}
            </h2>
            <p style={{ color: 'var(--ck-muted)', margin: '10px 0 16px' }}>
              Só por agora você leva <b>{p.name}</b> por:
            </p>
            <div style={{ marginBottom: 18 }}>
              <span className="ck-price-old">{brl(p.priceCents)}</span>
              <span className="ck-price-big">{brl(p.downsellPriceCents)}</span>
            </div>
            <button
              className="ck-btn"
              type="button"
              disabled={loading}
              onClick={() => {
                setOffer('downsell');
                setShowExit(false);
                if (name && (!askDoc || isValidCPF(doc))) void submit(undefined, 'downsell');
                else window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            >
              {loading ? 'Gerando Pix…' : `Quero por ${brl(p.downsellPriceCents)}`}
            </button>
            <button
              className="ck-btn ck-btn-ghost"
              type="button"
              onClick={() => {
                setShowExit(false);
                if (p.backredirectUrl) window.location.href = p.backredirectUrl;
              }}
            >
              Não, quero perder essa oferta
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
