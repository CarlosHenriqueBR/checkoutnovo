import { NextRequest, NextResponse } from 'next/server';

/**
 * Checagem barata na borda: só verifica se existe cookie de sessão.
 * A validação real da assinatura acontece em src/app/dashboard/layout.tsx
 * e em todas as rotas /api/admin/* (runtime Node).
 */
export function middleware(req: NextRequest) {
  const token = req.cookies.get('vg_session')?.value;
  if (token) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.searchParams.set('next', req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
