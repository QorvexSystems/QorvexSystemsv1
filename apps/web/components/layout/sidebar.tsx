'use client';

import {
  Boxes,
  ClipboardList,
  FileText,
  FileUp,
  LayoutDashboard,
  LucideIcon,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCcw,
  ScrollText,
  ShoppingCart,
  Settings,
  ClipboardPlus,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getSession, type AuthSession } from '@/lib/auth-session';
import { canTakeOrders, isAdminSession } from '@/lib/authorization';
import { cn } from '@/lib/utils';

export const navigation: Array<{ name: string; href: string; icon: LucideIcon; primary?: boolean }> = [
  { name: 'Panel', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Caja POS', href: '/pos', icon: ShoppingCart, primary: true },
  { name: 'Toma de ordenes', href: '/orders', icon: ClipboardPlus, primary: true },
  { name: 'Cotizaciones', href: '/quotations', icon: FileText },
  { name: 'Productos', href: '/products', icon: Package },
  { name: 'Clientes', href: '/customers', icon: Users },
  { name: 'Facturas', href: '/invoices', icon: FileText, primary: true },
  { name: 'Devoluciones', href: '/returns', icon: RotateCcw, primary: true },
  { name: 'Empleados', href: '/employees', icon: Users },
  { name: 'Caja / Logs', href: '/cash/logs', icon: ClipboardList },
  { name: 'Sesiones', href: '/cash/sessions', icon: ScrollText },
  { name: 'Importaciones', href: '/settings/imports', icon: FileUp },
  { name: 'Secuencias fiscales', href: '/settings/fiscal-sequences', icon: ScrollText },
  { name: 'Configuracion', href: '/settings', icon: Settings },
];

export function Sidebar({
  collapsed = false,
  onToggle,
  onNavigate,
}: {
  collapsed?: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
}) {
  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-30 hidden border-r border-slate-800 bg-slate-950 text-slate-100 transition-[width] duration-200 print:hidden lg:block',
        collapsed ? 'w-20' : 'w-72',
      )}
    >
      <SidebarContent collapsed={collapsed} onToggle={onToggle} onNavigate={onNavigate} />
    </aside>
  );
}

export function SidebarContent({
  collapsed = false,
  onToggle,
  onNavigate,
}: {
  collapsed?: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const session = getSession();
  const visibleNavigation = getVisibleNavigation(session);

  return (
    <div className="flex h-full flex-col">
      <div className={cn('flex h-16 items-center gap-3 border-b border-slate-800 px-4', collapsed && 'justify-center')}>
        <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-md bg-white">
          <img src="/tenants/Ferreteria_RIVNU.jpeg" alt="" className="h-full w-full object-cover" />
        </div>
        <div className={cn('min-w-0', collapsed && 'hidden')}>
          <p className="truncate text-sm font-semibold">Ferreteria RIVNU</p>
          <p className="truncate text-xs text-slate-400">Powered by CoreStack</p>
        </div>
      </div>

      {onToggle ? (
        <div className="px-3 pt-3">
          <button
            type="button"
            onClick={onToggle}
            className={cn(
              'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-900 hover:text-white',
              collapsed && 'justify-center px-2',
            )}
            aria-label={collapsed ? 'Desplegar menu' : 'Ocultar menu'}
          >
            {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
            <span className={cn(collapsed && 'hidden')}>{collapsed ? 'Desplegar' : 'Ocultar menu'}</span>
          </button>
        </div>
      ) : null}

      <nav className="flex-1 space-y-1 px-3 py-4">
        {visibleNavigation.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
                collapsed && 'justify-center px-2',
                isActive
                  ? 'bg-white text-slate-950 shadow-sm'
                  : 'text-slate-300 hover:bg-slate-900 hover:text-white',
              )}
              title={collapsed ? item.name : undefined}
            >
              <item.icon className={cn('h-5 w-5', isActive ? 'text-[#f36c10]' : '')} />
              <span className={cn(collapsed && 'hidden')}>{item.name}</span>
            </Link>
          );
        })}
      </nav>

      <div className={cn('border-t border-slate-800 p-4', collapsed && 'px-3')}>
        <div className="rounded-md border border-slate-800 bg-slate-900 p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <Boxes className="h-4 w-4 text-[#f36c10]" />
            <span className={cn(collapsed && 'hidden')}>CoreStack Core</span>
          </div>
          <p className={cn('text-xs leading-5 text-slate-400', collapsed && 'hidden')}>
            Plataforma provista por CoreStack. Datos aislados por tenant.
          </p>
        </div>
      </div>
    </div>
  );
}

export function getVisibleNavigation(session: AuthSession | null) {
  if (isAdminSession(session)) {
    if (session?.role === 'ADMIN') {
      return navigation.filter((item) => item.href !== '/pos');
    }

    return navigation;
  }

  if (canTakeOrders(session) && session?.permissions.canUsePos) {
    return navigation.filter(
      (item) => item.href === '/orders' || item.href === '/pos' || item.href === '/returns',
    );
  }

  if (canTakeOrders(session)) {
    return navigation.filter((item) => item.href === '/orders');
  }

  if (session?.permissions.canUsePos) {
    return navigation.filter((item) => item.href === '/pos' || item.href === '/returns');
  }

  return [];
}
