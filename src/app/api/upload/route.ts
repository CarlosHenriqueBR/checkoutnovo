import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { guard, bad } from '@/lib/adminHelpers';
import { slugify } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};

/** Upload de imagens 100% LOCAL — grava em public/uploads e devolve a URL. */
export async function POST(req: NextRequest) {
  const g = await guard();
  if (g) return g;

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return bad('Envie um arquivo no campo "file"');
  if (file.size > MAX_BYTES) return bad('Arquivo maior que 5MB');

  const ext = ALLOWED[file.type];
  if (!ext) return bad('Formato não suportado (use PNG, JPG, WEBP, GIF ou SVG)');

  const dir = path.isAbsolute(process.env.UPLOAD_DIR || '')
    ? (process.env.UPLOAD_DIR as string)
    : path.join(process.cwd(), process.env.UPLOAD_DIR || 'public/uploads');
  await fs.mkdir(dir, { recursive: true });

  const base = slugify(file.name.replace(/\.[^.]+$/, '')) || 'imagem';
  const name = `${base}-${Date.now().toString(36)}.${ext}`;
  await fs.writeFile(path.join(dir, name), Buffer.from(await file.arrayBuffer()));

  return NextResponse.json({ url: `/uploads/${name}` });
}
