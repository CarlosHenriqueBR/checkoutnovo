export type Platform = 'google_ads' | 'ga4' | 'meta' | 'tiktok' | 'kwai';

export interface Gateway {
  id: number;
  name: string;
  provider: string;
  encrypted_url: string;
  is_default: number;
  active: number;
  created_at: string;
}

export interface Product {
  id: number;
  name: string;
  description: string;
  image_url: string;
  price_cents: number;
  delivery_url: string;
  created_at: string;
}

export interface CheckoutConfig {
  /** Cores e estilo */
  primaryColor?: string;
  accentColor?: string;
  bgColor?: string;
  textColor?: string;
  logoUrl?: string;
  /** Contador regressivo (segundos). 0 = desligado */
  timerSeconds?: number;
  timerText?: string;
  /** Campos exibidos */
  askEmail?: boolean;
  askPhone?: boolean;
  askDocument?: boolean;
  /** Order bump */
  bumpEnabled?: boolean;
  bumpTitle?: string;
  bumpDescription?: string;
  bumpImageUrl?: string;
  bumpPriceCents?: number;
  /** Prova social / segurança */
  showSecurityBadges?: boolean;
  noticeText?: string;
  /** Texto do botão */
  ctaLabel?: string;
  /** Nome exibido no rodapé (© 2026 …) */
  storeName?: string;
  /** Texto explicativo abaixo do seletor de Pix */
  pixNotice?: string;
  /** Segundos de polling do status do PIX */
  pollIntervalMs?: number;
}

export interface Checkout {
  id: number;
  slug: string;
  name: string;
  product_id: number | null;
  gateway_id: number | null;
  headline: string;
  subheadline: string;
  image_url: string;
  price_cents: number;
  downsell_price_cents: number;
  downsell_headline: string;
  backredirect_enabled: number;
  backredirect_url: string;
  exit_offer_enabled: number;
  upsell_id: number | null;
  thankyou_url: string;
  config_json: string;
  active: number;
  created_at: string;
  updated_at: string;
}

export type UpsellBlock =
  | { type: 'heading'; text: string }
  | { type: 'text'; text: string }
  | { type: 'image'; url: string; alt?: string }
  | { type: 'video'; url: string }
  | { type: 'list'; items: string[] }
  | { type: 'divider' }
  | { type: 'html'; html: string };

export interface UpsellTheme {
  primaryColor?: string;
  bgColor?: string;
  textColor?: string;
  cardColor?: string;
}

export interface Upsell {
  id: number;
  slug: string;
  name: string;
  headline: string;
  subheadline: string;
  image_url: string;
  body_html: string;
  blocks_json: string;
  price_cents: number;
  downsell_price_cents: number;
  downsell_headline: string;
  accept_label: string;
  decline_label: string;
  next_on_accept_id: number | null;
  next_on_decline_id: number | null;
  final_url: string;
  theme_json: string;
  active: number;
  created_at: string;
  updated_at: string;
}

export interface PixelAccountConfig {
  // GA4 Measurement Protocol
  measurementId?: string;
  apiSecret?: string;
  // Google Ads (client-side gtag + Offline Conversion Import)
  conversionId?: string; // AW-XXXXXXXX
  conversionLabel?: string;
  customerId?: string; // 1234567890 (sem hífens)
  loginCustomerId?: string;
  developerToken?: string;
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  conversionActionId?: string;
  // Meta
  pixelId?: string;
  accessToken?: string;
  testEventCode?: string;
  // TikTok
  tiktokPixelId?: string;
  tiktokAccessToken?: string;
  // Kwai
  kwaiPixelId?: string;
  kwaiAccessToken?: string;
}

export interface PixelAccount {
  id: number;
  name: string;
  platform: Platform;
  config_json: string;
  active: number;
  created_at: string;
}

export type OrderKind = 'main' | 'bump' | 'upsell' | 'downsell';

export interface Order {
  id: string;
  checkout_id: number | null;
  upsell_id: number | null;
  parent_order_id: string | null;
  kind: OrderKind;
  gateway_id: number | null;
  transaction_id: string | null;
  status: string;
  title: string;
  amount_cents: number;
  customer_name: string;
  customer_document: string;
  customer_email: string;
  customer_phone: string;
  utm_raw: string;
  tracking_json: string;
  pix_code: string;
  ip: string;
  user_agent: string;
  created_at: string;
  paid_at: string | null;
}

/** Parâmetros de rastreamento capturados na página de entrada. */
export interface TrackingData {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  utm_id?: string;
  src?: string;
  sck?: string;
  /** Facebook Ads */
  fbclid?: string;
  fbp?: string;
  fbc?: string;
  /** TikTok Ads */
  ttclid?: string;
  /** Kwai Ads */
  click_id?: string;
  /** Google Ads */
  gclid?: string;
  wbraid?: string;
  gbraid?: string;
  /** Contexto */
  landing_url?: string;
  referrer?: string;
  session_id?: string;
  [k: string]: string | undefined;
}
