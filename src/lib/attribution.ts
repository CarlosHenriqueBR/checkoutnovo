import type { TrackingData } from './types';

/**
 * =====================================================================
 * MOTOR DE ATRIBUIÇÃO
 * ---------------------------------------------------------------------
 * A Duttyfy espera o campo `utm` como UMA QUERY STRING CRUA contendo
 * todos os parâmetros de rastreamento, incluindo os click IDs:
 *
 *   Facebook Ads -> fbclid
 *   TikTok Ads   -> ttclid
 *   Kwai Ads     -> click_id
 *   Google Ads   -> gclid / wbraid / gbraid
 *
 * Fluxo:
 *   1. /t.js captura os parâmetros na PÁGINA DE ENTRADA (vinda do anúncio)
 *      e salva em localStorage + cookie 1st-party.
 *   2. O checkout recupera esses valores do navegador e envia junto do POST.
 *   3. O servidor normaliza, monta a string e envia no campo `utm`.
 * =====================================================================
 */

/** Todas as chaves que rastreamos, na ordem em que entram na query string. */
export const TRACKED_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'utm_id',
  'src',
  'sck',
  'fbclid',
  'fbp',
  'fbc',
  'ttclid',
  'click_id',
  'gclid',
  'wbraid',
  'gbraid',
  'xcod',
  'ref',
] as const;

/** Click IDs obrigatórios por plataforma (usado na validação/diagnóstico). */
export const CLICK_ID_KEYS: Record<string, string[]> = {
  facebook: ['fbclid'],
  tiktok: ['ttclid'],
  kwai: ['click_id'],
  google: ['gclid', 'wbraid', 'gbraid'],
};

const MAX_LEN = 512;

function clean(v: unknown): string {
  if (typeof v !== 'string') return '';
  const s = v.trim();
  if (!s || s === 'undefined' || s === 'null') return '';
  return s.slice(0, MAX_LEN);
}

/**
 * Normaliza um objeto solto (vindo do body do cliente) em TrackingData,
 * descartando chaves desconhecidas e valores vazios.
 */
export function normalizeTracking(input: unknown): TrackingData {
  const out: TrackingData = {};
  if (!input || typeof input !== 'object') return out;
  const obj = input as Record<string, unknown>;

  for (const key of TRACKED_KEYS) {
    const v = clean(obj[key]);
    if (v) out[key] = v;
  }
  // Contexto (não vai na string utm, mas é guardado no pedido)
  for (const key of ['landing_url', 'referrer', 'session_id'] as const) {
    const v = clean(obj[key]);
    if (v) out[key] = v;
  }
  return out;
}

/**
 * Extrai os parâmetros de rastreamento de uma query string / URL.
 * Usado no servidor (webhook, links de upsell) e espelhado em /t.js.
 */
export function parseTrackingFromQuery(search: string): TrackingData {
  const qs = search.startsWith('?') ? search.slice(1) : search;
  const params = new URLSearchParams(qs);
  const raw: Record<string, string> = {};
  params.forEach((value, key) => {
    raw[key] = value;
  });
  return normalizeTracking(raw);
}

/**
 * MONTA A STRING CRUA enviada no campo `utm` da Duttyfy.
 * Ex.: "utm_source=facebook&utm_medium=cpc&fbclid=ABC&ttclid=XYZ&click_id=KWAI"
 *
 * Regras:
 *  - Somente chaves com valor;
 *  - Ordem determinística (TRACKED_KEYS);
 *  - Valores encodados (encodeURIComponent) — a Duttyfy recebe uma query válida;
 *  - Nunca retorna `undefined`; na ausência total devolve string vazia.
 */
export function buildUtmString(tracking: TrackingData): string {
  const parts: string[] = [];
  for (const key of TRACKED_KEYS) {
    const v = tracking[key];
    if (v) parts.push(`${key}=${encodeURIComponent(v)}`);
  }
  return parts.join('&');
}

/** Caminho inverso: string crua da Duttyfy -> objeto. */
export function parseUtmString(utm: string): TrackingData {
  if (!utm) return {};
  return parseTrackingFromQuery(utm);
}

/**
 * Diagnóstico: quais click IDs estão presentes/ausentes.
 * Alimenta o painel de pedidos para você ver, por venda, se o rastreio veio completo.
 */
export function auditTracking(tracking: TrackingData) {
  const present: string[] = [];
  const missing: string[] = [];
  for (const [platform, keys] of Object.entries(CLICK_ID_KEYS)) {
    if (keys.some((k) => tracking[k])) present.push(platform);
    else missing.push(platform);
  }
  return {
    present,
    missing,
    hasAnyUtm: TRACKED_KEYS.some((k) => k.startsWith('utm_') && tracking[k]),
    hasAnyClickId: present.length > 0,
  };
}

/** Repassa o rastreamento para a próxima página do funil (upsells). */
export function trackingToQuery(tracking: TrackingData): string {
  const s = buildUtmString(tracking);
  return s ? `?${s}` : '';
}
