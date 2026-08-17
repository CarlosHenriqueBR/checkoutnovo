'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/dashboard', label: 'Visão geral' },
  { href: '/dashboard/faturamento', label: 'Faturamento' },
  { href: '/dashboard/checkouts', label: 'Checkouts' },
  { href: '/dashboard/upsells', label: 'Upsells' },
  { href: '/dashboard/produtos', label: 'Produtos' },
  { href: '/dashboard/pixels', label: 'Pixels' },
  { href: '/dashboard/gateway', label: 'Gateway PIX' },
  { href: '/dashboard/integracoes', label: 'Integrações' },
  { href: '/dashboard/pedidos', label: 'Pedidos' },
];

export default function Nav() {
  const path = usePathname();
  return (
    <nav className="dash-side">
      <div className="dash-logo">Vega</div>
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} className={path === l.href ? 'active' : ''}>
          {l.label}
        </Link>
      ))}
      <a
        href="#"
        onClick={async (e) => {
          e.preventDefault();
          await fetch('/api/auth/logout', { method: 'POST' });
          location.href = '/login';
        }}
      >
        Sair
      </a>
    </nav>
  );
}
