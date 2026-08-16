import crypto from 'node:crypto';
import { cookies } from 'next/headers';

const COOKIE = 'vg_session';
const MAX_AGE = 60 * 60 * 24 * 7; // 7 dias

function secret(): string {
  return process.env.SESSION_SECRET || 'dev-secret-troque-em-producao';
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function createToken(): string {
  const exp = Date.now() + MAX_AGE * 1000;
  const payload = `admin.${exp}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(token: string | undefined): boolean {
  if (!token) return false;
  const idx = token.lastIndexOf('.');
  if (idx < 0) return false;
  const payload = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = sign(payload);
  if (sig.length !== expected.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  const exp = Number(payload.split('.')[1]);
  return Number.isFinite(exp) && exp > Date.now();
}

export function checkPassword(password: string): boolean {
  const expected = process.env.DASHBOARD_PASSWORD || 'admin';
  const a = Buffer.from(String(password));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function isAuthenticated(): Promise<boolean> {
  const store = await cookies();
  return verifyToken(store.get(COOKIE)?.value);
}

export const SESSION_COOKIE = COOKIE;
export const SESSION_MAX_AGE = MAX_AGE;

/** Guarda para rotas de API do dashboard. */
export async function requireAuth(): Promise<Response | null> {
  if (await isAuthenticated()) return null;
  return new Response(JSON.stringify({ error: 'Não autenticado' }), {
    status: 401,
    headers: { 'content-type': 'application/json' },
  });
}
