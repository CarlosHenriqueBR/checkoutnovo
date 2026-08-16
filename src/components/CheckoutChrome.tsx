import { PixMark } from './PixLogo';

/** Selo verde "PAGAMENTO 100% SEGURO" no topo. */
export function SecureBadge() {
  return (
    <div className="ck-secure">
      <svg width="26" height="30" viewBox="0 0 24 28" aria-hidden="true">
        <path
          fill="#1e8e3e"
          d="M12 0 0 4.4v8.3C0 20.2 5.1 27 12 28c6.9-1 12-7.8 12-15.3V4.4L12 0z"
        />
      </svg>
      <span>
        PAGAMENTO
        <br />
        100% SEGURO
      </span>
    </div>
  );
}

/** Rodapé: formas de pagamento, copyright e selo de ambiente seguro. */
export function CheckoutFooter({ storeName }: { storeName: string }) {
  return (
    <footer className="ck-footer">
      <div>Formas de pagamento</div>
      <div className="pay-icon">
        <PixMark size={20} color="#ffffff" />
      </div>
      <div className="copy">
        © {new Date().getFullYear()} {storeName}
      </div>
      <div className="ck-safe-pill">
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="11" fill="#5cc47f" />
          <path d="M7 12.5l3.2 3.2L17 9" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Ambiente seguro
      </div>
    </footer>
  );
}

export function Chevron({ open }: { open: boolean }) {
  return (
    <svg className={`ck-chevron${open ? ' open' : ''}`} width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 9l7 7 7-7" stroke="#1c2b45" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
