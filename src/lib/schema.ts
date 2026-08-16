// Gerado a partir de schema.sql — mantido em TS para não depender de leitura de arquivo em runtime.
export const SCHEMA_SQL = `
-- =====================================================================
-- Vega Checkout — schema local (SQLite)
-- Todos os valores monetários são em CENTAVOS (inteiro).
-- =====================================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------
-- Gateways (Duttyfy). A URL encriptada é gerada no painel da Duttyfy.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gateways (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT NOT NULL,
  provider       TEXT NOT NULL DEFAULT 'duttyfy',
  encrypted_url  TEXT NOT NULL,
  is_default     INTEGER NOT NULL DEFAULT 0,
  active         INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------
-- Produtos
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  image_url     TEXT NOT NULL DEFAULT '',
  price_cents   INTEGER NOT NULL DEFAULT 0,
  delivery_url  TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------
-- Checkouts
-- config_json guarda: tema, campos, timer, order bump, prova social...
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS checkouts (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  slug                  TEXT NOT NULL UNIQUE,
  name                  TEXT NOT NULL,
  product_id            INTEGER REFERENCES products(id) ON DELETE SET NULL,
  gateway_id            INTEGER REFERENCES gateways(id) ON DELETE SET NULL,

  headline              TEXT NOT NULL DEFAULT '',
  subheadline           TEXT NOT NULL DEFAULT '',
  image_url             TEXT NOT NULL DEFAULT '',

  price_cents           INTEGER NOT NULL DEFAULT 0,
  -- Oferta de ticket menor do produto principal (backredirect / exit intent)
  downsell_price_cents  INTEGER NOT NULL DEFAULT 0,
  downsell_headline     TEXT NOT NULL DEFAULT '',

  -- Backredirect: quando o cliente aperta "voltar"
  backredirect_enabled  INTEGER NOT NULL DEFAULT 1,
  backredirect_url      TEXT NOT NULL DEFAULT '',
  exit_offer_enabled    INTEGER NOT NULL DEFAULT 1,

  -- Funil pós-pagamento
  upsell_id             INTEGER,
  thankyou_url          TEXT NOT NULL DEFAULT '',

  config_json           TEXT NOT NULL DEFAULT '{}',
  active                INTEGER NOT NULL DEFAULT 1,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------
-- Upsells / Downsells — páginas personalizáveis encadeadas
-- next_on_accept_id / next_on_decline_id apontam para outro upsell.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS upsells (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  slug                  TEXT NOT NULL UNIQUE,
  name                  TEXT NOT NULL,

  headline              TEXT NOT NULL DEFAULT '',
  subheadline           TEXT NOT NULL DEFAULT '',
  image_url             TEXT NOT NULL DEFAULT '',
  body_html             TEXT NOT NULL DEFAULT '',
  blocks_json           TEXT NOT NULL DEFAULT '[]',

  price_cents           INTEGER NOT NULL DEFAULT 0,
  downsell_price_cents  INTEGER NOT NULL DEFAULT 0,
  downsell_headline     TEXT NOT NULL DEFAULT '',

  accept_label          TEXT NOT NULL DEFAULT 'SIM, EU QUERO!',
  decline_label         TEXT NOT NULL DEFAULT 'Não, obrigado',

  next_on_accept_id     INTEGER,
  next_on_decline_id    INTEGER,
  final_url             TEXT NOT NULL DEFAULT '',

  theme_json            TEXT NOT NULL DEFAULT '{}',
  active                INTEGER NOT NULL DEFAULT 1,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------
-- Contas de pixel — múltiplas contas por plataforma
-- platform: google_ads | ga4 | meta | tiktok | kwai
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pixel_accounts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  platform     TEXT NOT NULL,
  config_json  TEXT NOT NULL DEFAULT '{}',
  active       INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Vínculo N:N entre checkout e contas de pixel
CREATE TABLE IF NOT EXISTS checkout_pixels (
  checkout_id       INTEGER NOT NULL REFERENCES checkouts(id) ON DELETE CASCADE,
  pixel_account_id  INTEGER NOT NULL REFERENCES pixel_accounts(id) ON DELETE CASCADE,
  PRIMARY KEY (checkout_id, pixel_account_id)
);

-- ---------------------------------------------------------------------
-- Pedidos
-- kind: main | bump | upsell | downsell
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id                TEXT PRIMARY KEY,
  checkout_id       INTEGER REFERENCES checkouts(id) ON DELETE SET NULL,
  upsell_id         INTEGER REFERENCES upsells(id) ON DELETE SET NULL,
  parent_order_id   TEXT REFERENCES orders(id) ON DELETE SET NULL,
  kind              TEXT NOT NULL DEFAULT 'main',

  gateway_id        INTEGER,
  transaction_id    TEXT UNIQUE,
  status            TEXT NOT NULL DEFAULT 'PENDING',

  title             TEXT NOT NULL DEFAULT '',
  amount_cents      INTEGER NOT NULL DEFAULT 0,

  customer_name     TEXT NOT NULL DEFAULT '',
  customer_document TEXT NOT NULL DEFAULT '',
  customer_email    TEXT NOT NULL DEFAULT '',
  customer_phone    TEXT NOT NULL DEFAULT '',

  -- String crua exatamente como enviada no campo \`utm\` da Duttyfy
  utm_raw           TEXT NOT NULL DEFAULT '',
  -- Objeto com os parâmetros já separados (fbclid, ttclid, click_id, gclid...)
  tracking_json     TEXT NOT NULL DEFAULT '{}',

  pix_code          TEXT NOT NULL DEFAULT '',
  ip                TEXT NOT NULL DEFAULT '',
  user_agent        TEXT NOT NULL DEFAULT '',

  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  paid_at           TEXT
);

CREATE INDEX IF NOT EXISTS idx_orders_status  ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_tx      ON orders(transaction_id);

-- Eventos do pedido (auditoria + idempotência do webhook)
CREATE TABLE IF NOT EXISTS order_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id     TEXT REFERENCES orders(id) ON DELETE CASCADE,
  type         TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_order_events_order ON order_events(order_id);

-- Trava de idempotência: 1 linha por (transação, evento)
CREATE TABLE IF NOT EXISTS idempotency (
  key        TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Log de disparo de conversões (Google, Meta, TikTok, Kwai, UTMify)
CREATE TABLE IF NOT EXISTS dispatch_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id   TEXT REFERENCES orders(id) ON DELETE CASCADE,
  target     TEXT NOT NULL,
  ok         INTEGER NOT NULL DEFAULT 0,
  request    TEXT NOT NULL DEFAULT '',
  response   TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_dispatch_order ON dispatch_log(order_id);

-- Sessões de rastreamento capturadas na página de entrada (backup server-side)
CREATE TABLE IF NOT EXISTS tracking_sessions (
  id            TEXT PRIMARY KEY,
  utm_raw       TEXT NOT NULL DEFAULT '',
  tracking_json TEXT NOT NULL DEFAULT '{}',
  landing_url   TEXT NOT NULL DEFAULT '',
  referrer      TEXT NOT NULL DEFAULT '',
  ip            TEXT NOT NULL DEFAULT '',
  user_agent    TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
`;
