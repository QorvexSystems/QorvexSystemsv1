import { NextResponse, type NextRequest } from 'next/server';
import { sessionCookieName } from './lib/auth-constants';

const protectedPrefixes = [
  '/dashboard',
  '/pos',
  '/orders',
  '/products',
  '/employees',
  '/cash',
  '/invoices',
  '/inventory',
  '/customers',
  '/settings',
];

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSessionCookie = Boolean(request.cookies.get(sessionCookieName)?.value);

  if (pathname === '/login' && hasSessionCookie) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  const isProtectedRoute = protectedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (!isProtectedRoute || hasSessionCookie) {
    return NextResponse.next();
  }

  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('next', `${pathname}${search}`);

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
