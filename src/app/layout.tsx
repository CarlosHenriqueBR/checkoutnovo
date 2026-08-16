import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Checkout',
  description: 'Pagamento seguro via PIX',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#00b37e',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        {/* Captura de atribuição — precisa rodar antes de qualquer interação */}
        <script src="/t.js" async />
      </head>
      <body>{children}</body>
    </html>
  );
}
