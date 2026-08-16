import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';

export const runtime = 'nodejs';

const TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};

function uploadDir(): string {
  const dir = process.env.UPLOAD_DIR || 'public/uploads';
  return path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir);
}

/**
 * Serve as imagens enviadas pelo painel.
 * Em produção elas ficam no volume persistente (/data/uploads), fora de /public,
 * então precisam deste handler para ficarem acessíveis em /uploads/arquivo.png
 */
export async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path: parts } = await ctx.params;
  const base = uploadDir();
  const target = path.resolve(base, ...parts);

  // Bloqueia path traversal
  if (!target.startsWith(path.resolve(base))) {
    return new NextResponse('Not found', { status: 404 });
  }

  try {
    const file = await fs.readFile(target);
    const type = TYPES[path.extname(target).toLowerCase()] || 'application/octet-stream';
    return new NextResponse(new Uint8Array(file), {
      headers: {
        'content-type': type,
        'cache-control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
}
