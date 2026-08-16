import { NextResponse } from 'next/server';
import { requireAuth } from './auth';
import { run } from './db';

export async function guard(): Promise<Response | null> {
  return requireAuth();
}

export function ok(data: unknown = { ok: true }) {
  return NextResponse.json(data);
}

export function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function int(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

export function bool(v: unknown): number {
  return v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0;
}

export function str(v: unknown, max = 2000): string {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

/** Regrava o vínculo N:N entre um checkout e as contas de pixel. */
export function syncPixels(checkoutId: number, ids: unknown) {
  run('DELETE FROM checkout_pixels WHERE checkout_id = ?', [checkoutId]);
  if (!Array.isArray(ids)) return;
  for (const raw of ids) {
    const pid = int(raw);
    if (pid > 0) {
      try {
        run('INSERT INTO checkout_pixels (checkout_id, pixel_account_id) VALUES (?, ?)', [checkoutId, pid]);
      } catch {
        /* ignora vínculo inválido */
      }
    }
  }
}

export function jsonStr(v: unknown, fallback = '{}'): string {
  if (typeof v === 'string') {
    try {
      JSON.parse(v);
      return v;
    } catch {
      return fallback;
    }
  }
  if (v && typeof v === 'object') return JSON.stringify(v);
  return fallback;
}
