/**
 * Seed de demonstração.
 *   node scripts/seed.mjs
 *
 * Cria: gateway de teste, produto, checkout, 2 upsells encadeados e
 * uma conta de pixel por plataforma (sem credenciais reais).
 */
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const file = process.env.DATABASE_FILE || './data/vega.db';
fs.mkdirSync(path.dirname(file), { recursive: true });

// Extrai o SQL do módulo TS sem precisar de compilador.
const schemaSrc = fs.readFileSync(new URL('../src/lib/schema.ts', import.meta.url), 'utf8');
const match = schemaSrc.match(/export const SCHEMA_SQL = `([\s\S]*)`;\s*$/);
if (!match) {
  console.error('Não consegui ler o schema em src/lib/schema.ts');
  process.exit(1);
}
const SCHEMA_SQL = match[1].replace(/\\`/g, '`').replace(/\\\$\{/g, '${');

const db = new Database(file);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(SCHEMA_SQL);

const has = (t) => db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c > 0;

if (!has('gateways')) {
  db.prepare(
    "INSERT INTO gateways (name, provider, encrypted_url, is_default, active) VALUES (?, 'duttyfy', ?, 1, 1)",
  ).run('Duttyfy (teste)', 'https://app.duttyfy.com.br/EXEMPLO-URL-ENCRIPTADA');
}

if (!has('products')) {
  db.prepare(
    'INSERT INTO products (name, description, image_url, price_cents, delivery_url) VALUES (?, ?, ?, ?, ?)',
  ).run('Receitas Fit Max', 'Ebook com 120 receitas', '', 1990, 'https://area-de-membros.exemplo.com');
}

if (!has('upsells')) {
  const up2 = db
    .prepare(
      `INSERT INTO upsells (slug, name, headline, subheadline, price_cents, downsell_price_cents, downsell_headline, final_url, blocks_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      'plano-anual',
      'Plano Anual',
      'Leve 12 meses de acompanhamento',
      'Só nesta página',
      9700,
      4700,
      'Tudo bem — e por metade do preço?',
      '/obrigado',
      JSON.stringify([
        { type: 'heading', text: 'O que você recebe' },
        { type: 'list', items: ['Acompanhamento semanal', 'Grupo fechado', 'Atualizações mensais'] },
      ]),
    );

  db.prepare(
    `INSERT INTO upsells (slug, name, headline, subheadline, price_cents, downsell_price_cents, downsell_headline, next_on_accept_id, next_on_decline_id, final_url, blocks_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    'combo-suplementos',
    'Combo Suplementos',
    'Adicione o combo com 60% OFF',
    'Oferta única, some ao sair desta página',
    4700,
    2700,
    'Última chance: leve por menos',
    Number(up2.lastInsertRowid),
    Number(up2.lastInsertRowid),
    '/obrigado',
    JSON.stringify([{ type: 'text', text: 'Aproveite o combo com desconto exclusivo de comprador.' }]),
  );
}

if (!has('checkouts')) {
  const product = db.prepare('SELECT id FROM products ORDER BY id LIMIT 1').get();
  const gateway = db.prepare('SELECT id FROM gateways ORDER BY id LIMIT 1').get();
  const upsell = db.prepare("SELECT id FROM upsells WHERE slug = 'combo-suplementos'").get();

  db.prepare(
    `INSERT INTO checkouts
      (slug, name, product_id, gateway_id, headline, subheadline, image_url,
       price_cents, downsell_price_cents, downsell_headline,
       backredirect_enabled, backredirect_url, exit_offer_enabled, upsell_id, thankyou_url, config_json, active)
     VALUES (?, ?, ?, ?, ?, ?, '', ?, ?, ?, 1, '', 1, ?, '/obrigado', ?, 1)`,
  ).run(
    'receitas-fit',
    'Receitas Fit Max',
    product?.id ?? null,
    gateway?.id ?? null,
    'Receitas Fit Max — 120 receitas',
    'Acesso imediato após o pagamento',
    1990,
    990,
    'Espere! Leve por R$ 9,90',
    upsell?.id ?? null,
    JSON.stringify({
      primaryColor: '#00b37e',
      accentColor: '#f59e0b',
      timerSeconds: 900,
      timerText: 'Oferta expira em',
      askEmail: true,
      askPhone: true,
      askDocument: true,
      bumpEnabled: true,
      bumpTitle: 'Adicione o Guia de Treinos',
      bumpDescription: 'Treinos para fazer em casa, sem equipamento.',
      bumpPriceCents: 970,
      showSecurityBadges: true,
      noticeText: 'Compra 100% segura • Pagamento via PIX',
      pollIntervalMs: 5000,
    }),
  );
}

console.log('Seed concluído. Checkout de exemplo: /c/receitas-fit');
db.close();
