import { NextRequest } from 'next/server';
import { all } from '@/lib/db';
import { guard, ok } from '@/lib/adminHelpers';
import { auditTracking } from '@/lib/attribution';
import { safeJson } from '@/lib/utils';
import type { Order, TrackingData } from '@/lib/types';
import { metrics } from '@/lib/orders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const g = await guard();
  if (g) return g;
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') || 100), 500);
  const status = req.nextUrl.searchParams.get('status');

  const rows = status
    ? all<Order>('SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC LIMIT ?', [status, limit])
    : all<Order>('SELECT * FROM orders ORDER BY created_at DESC LIMIT ?', [limit]);

  return ok({
    metrics: metrics(),
    orders: rows.map((o) => {
      const tracking = safeJson<TrackingData>(o.tracking_json, {});
      return { ...o, tracking, audit: auditTracking(tracking) };
    }),
  });
}
