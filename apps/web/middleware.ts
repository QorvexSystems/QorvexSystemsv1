import { NextResponse, type NextRequest } from 'next/server';
import { sessionCookieName } from './lib/auth-constants';

type IpRule =
  | {
      type: 'exact';
      value: string;
    }
  | {
      type: 'cidr';
      base: number;
      mask: number;
    };

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
  '/quotations',
  '/returns',
  '/settings',
];

export function middleware(request: NextRequest) {
  const internalAccessResponse = enforceInternalAccess(request);

  if (internalAccessResponse) {
    return internalAccessResponse;
  }

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

function enforceInternalAccess(request: NextRequest) {
  const rules = parseAllowedIpRules(process.env.INTERNAL_ALLOWED_IPS ?? '');

  if (!rules.length || isLocalDevelopmentRequest(request)) {
    return null;
  }

  const clientIp = getClientIp(request);

  if (clientIp && isIpAllowed(clientIp, rules)) {
    return null;
  }

  return new NextResponse('Not found', {
    status: 404,
  });
}

function isLocalDevelopmentRequest(request: NextRequest) {
  return (
    process.env.NODE_ENV !== 'production' &&
    ['localhost', '127.0.0.1', '::1'].includes(request.nextUrl.hostname)
  );
}

function parseAllowedIpRules(value: string) {
  const entries = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  return entries.map((entry) => {
    if (entry.includes('/')) {
      const [baseIp, rawMask] = entry.split('/');
      const base = ipv4ToNumber(normalizeIp(baseIp));
      const maskBits = Number(rawMask);

      if (base === null || !Number.isInteger(maskBits) || maskBits < 0 || maskBits > 32) {
        throw new Error(`Invalid INTERNAL_ALLOWED_IPS entry: ${entry}`);
      }

      const mask = maskBits === 0 ? 0 : (0xffffffff << (32 - maskBits)) >>> 0;
      return {
        type: 'cidr',
        base,
        mask,
      } satisfies IpRule;
    }

    return {
      type: 'exact',
      value: normalizeIp(entry),
    } satisfies IpRule;
  });
}

function getClientIp(request: NextRequest) {
  const forwardedFor = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const cloudflareIp = request.headers.get('cf-connecting-ip');
  return normalizeIp(forwardedFor?.split(',')[0] ?? realIp ?? cloudflareIp ?? '');
}

function normalizeIp(value: string) {
  const normalized = value.trim().replace(/^::ffff:/, '');
  return normalized === '::1' ? '127.0.0.1' : normalized;
}

function isIpAllowed(clientIp: string, rules: IpRule[]) {
  const clientIpNumber = ipv4ToNumber(clientIp);

  return rules.some((rule) => {
    if (rule.type === 'exact') {
      return clientIp === rule.value;
    }

    return clientIpNumber !== null && (clientIpNumber & rule.mask) === (rule.base & rule.mask);
  });
}

function ipv4ToNumber(value: string) {
  const parts = value.split('.');

  if (parts.length !== 4) {
    return null;
  }

  const octets = parts.map((part) => Number(part));

  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return null;
  }

  return (((octets[0] << 24) >>> 0) + (octets[1] << 16) + (octets[2] << 8) + octets[3]) >>> 0;
}
