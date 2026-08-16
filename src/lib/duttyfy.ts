import { one } from './db';
import type { Gateway } from './types';

/**
 * =====================================================================
 * CLIENTE DA API PIX DUTTYFY
 * ---------------------------------------------------------------------
 * Toda chamada é SERVER-SIDE. A URL encriptada nunca vai para o browser.
 *
 *  Criar cobrança : POST {URL_ENCRIPTADA}   body JSON
 *  Consultar      : GET  {URL_ENCRIPTADA}?transactionId={ID}   (fallback)
 *  Webhook        : POST na sua URL quando o status muda (fonte primária)
 *
 * Valores SEMPRE em centavos. CPF 11 dígitos. Telefone com DDD, só números.
 * =====================================================================
 */

export interface DuttyfyCustomer {
  name: string;
  document: string;
  email: string;
  phone: string;
}

export interface CreateChargeInput {
  amount: number; // centavos
  description: string;
  customer: DuttyfyCustomer;
  item: { title: string; price: number; quantity: number };
  /** String CRUA de rastreamento — deve conter fbclid / ttclid / click_id. */
  utm: string;
}

export interface CreateChargeResult {
  ok: boolean;
  transactionId?: string;
  pixCode?: string;
  raw?: unknown;
  error?: string;
}

export interface ChargeStatusResult {
  ok: boolean;
  status?: 'PENDING' | 'COMPLETED' | string;
  paidAt?: string | null;
  raw?: unknown;
  error?: string;
}

const TIMEOUT_MS = 20_000;

export function getGateway(id?: number | null): Gateway | undefined {
  if (id) {
    const g = one<Gateway>('SELECT * FROM gateways WHERE id = ? AND active = 1', [id]);
    if (g) return g;
  }
  return (
    one<Gateway>('SELECT * FROM gateways WHERE is_default = 1 AND active = 1 ORDER BY id LIMIT 1') ??
    one<Gateway>('SELECT * FROM gateways WHERE active = 1 ORDER BY id LIMIT 1')
  );
}

function isMock(): boolean {
  return process.env.GATEWAY_MOCK === '1';
}

async function fetchJson(url: string, init: RequestInit): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal, cache: 'no-store' });
    const text = await res.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      /* resposta não-JSON fica como texto */
    }
    return { status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

function pick(obj: unknown, keys: string[]): string | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  const o = obj as Record<string, unknown>;
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'string' && v) return v;
  }
  // procura um nível abaixo (data / result / transaction)
  for (const nest of ['data', 'result', 'transaction', 'pix', 'charge']) {
    const child = o[nest];
    if (child && typeof child === 'object') {
      const found = pick(child, keys);
      if (found) return found;
    }
  }
  return undefined;
}

/** Cria a cobrança PIX. */
export async function createCharge(
  gateway: Gateway,
  input: CreateChargeInput,
): Promise<CreateChargeResult> {
  const body = {
    amount: input.amount,
    description: input.description,
    customer: {
      name: input.customer.name,
      document: input.customer.document,
      email: input.customer.email,
      phone: input.customer.phone,
    },
    item: {
      title: input.item.title,
      price: input.item.price,
      quantity: input.item.quantity,
    },
    paymentMethod: 'PIX' as const,
    // >>> campo obrigatório para o rastreamento chegar na Duttyfy <<<
    utm: input.utm,
  };

  if (isMock()) {
    const id = `mock-${crypto.randomUUID()}`;
    return {
      ok: true,
      transactionId: id,
      pixCode: `00020126BR.GOV.BCB.PIX${id.replace(/-/g, '').toUpperCase()}5204000053039865802BR6009SAO PAULO62070503***6304MOCK`,
      raw: { mock: true, sent: body },
    };
  }

  try {
    const { status, body: res } = await fetchJson(gateway.encrypted_url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
    });

    const transactionId = pick(res, ['transactionId', 'transaction_id', 'id', '_id']);
    const pixCode = pick(res, ['pixCode', 'pix_code', 'qrcode', 'qrCode', 'copiaECola', 'emv']);

    if (status >= 400 || (!transactionId && !pixCode)) {
      return {
        ok: false,
        raw: res,
        error: pick(res, ['error', 'message']) || `Gateway retornou HTTP ${status}`,
      };
    }
    return { ok: true, transactionId, pixCode, raw: res };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Falha de rede no gateway' };
  }
}

/** Consulta o status (FALLBACK — o webhook é a fonte primária). */
export async function getChargeStatus(
  gateway: Gateway,
  transactionId: string,
): Promise<ChargeStatusResult> {
  if (isMock()) {
    return { ok: true, status: 'PENDING', paidAt: null, raw: { mock: true } };
  }
  try {
    const sep = gateway.encrypted_url.includes('?') ? '&' : '?';
    const url = `${gateway.encrypted_url}${sep}transactionId=${encodeURIComponent(transactionId)}`;
    const { status, body } = await fetchJson(url, { method: 'GET', headers: { accept: 'application/json' } });

    const err = pick(body, ['error']);
    if (status >= 400 || err) return { ok: false, error: err || `HTTP ${status}`, raw: body };

    return {
      ok: true,
      status: pick(body, ['status']) ?? 'PENDING',
      paidAt: pick(body, ['paidAt', 'paid_at']) ?? null,
      raw: body,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Falha de rede no gateway' };
  }
}

/**
 * Extrai o identificador da transação do payload de webhook.
 * Em COMPLETED pode não vir `transactionId` — nesse caso usa `_id.$oid`.
 */
export function webhookTransactionId(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const p = payload as Record<string, unknown>;
  if (typeof p.transactionId === 'string' && p.transactionId) return p.transactionId;
  const id = p._id;
  if (id && typeof id === 'object') {
    const oid = (id as Record<string, unknown>)['$oid'];
    if (typeof oid === 'string' && oid) return oid;
  }
  if (typeof p._id === 'string' && p._id) return p._id;
  return undefined;
}

/** `items` no webhook é OBJETO (não array) — normalizamos os dois formatos. */
export function webhookItems(payload: unknown): { title: string; price: number; quantity: number }[] {
  if (!payload || typeof payload !== 'object') return [];
  const items = (payload as Record<string, unknown>).items;
  if (!items) return [];
  const arr = Array.isArray(items) ? items : [items];
  return arr
    .filter((i): i is Record<string, unknown> => !!i && typeof i === 'object')
    .map((i) => ({
      title: String(i.title ?? ''),
      price: Number(i.price ?? 0),
      quantity: Number(i.quantity ?? 1),
    }));
}
