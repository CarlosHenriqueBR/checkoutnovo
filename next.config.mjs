/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // better-sqlite3 é nativo: não pode ser empacotado pelo bundler do servidor.
  serverExternalPackages: ['better-sqlite3'],
  poweredByHeader: false,
  compress: true,
  images: { unoptimized: true },
  experimental: {
    // Menos JS no cliente = checkout mais rápido.
    optimizePackageImports: [],
  },
  async headers() {
    return [
      {
        // O script de rastreamento é servido para páginas de venda externas.
        source: '/t.js',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Cache-Control', value: 'public, max-age=300, s-maxage=300' },
        ],
      },
      {
        source: '/api/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store' }],
      },
    ];
  },
};

export default nextConfig;
