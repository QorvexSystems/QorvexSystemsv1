import type { AuthSession } from './auth-session';

const adminRoles = ['ADMIN', 'SUPER_ADMIN', 'QORVEX_SUPER_ADMIN'];

export function isAdminSession(session: AuthSession | null | undefined) {
  return Boolean(session?.role && adminRoles.includes(session.role));
}

export function canAccessPath(session: AuthSession | null | undefined, pathname: string) {
  if (!session) {
    return false;
  }

  if (isAdminSession(session)) {
    return true;
  }

  if (session.permissions.canUsePos && (pathname === '/pos' || pathname.startsWith('/pos/'))) {
    return true;
  }

  return Boolean(
    session.permissions.canReprintReceipt &&
      pathname.startsWith('/invoices/') &&
      pathname.endsWith('/print'),
  );
}
