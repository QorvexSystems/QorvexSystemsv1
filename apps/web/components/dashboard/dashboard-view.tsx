'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Clock3,
  FileText,
  Landmark,
  PackageCheck,
  ReceiptText,
  RotateCcw,
  ShoppingCart,
  UserCheck,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatQuantity } from '@/components/operations/pos/pos-utils';
import { getDashboardSummary } from '@/lib/api';
import { getSession, type AuthSession } from '@/lib/auth-session';
import { canAccessPath } from '@/lib/authorization';
import {
  getStatusVariant,
  translateCashMovementType,
  translateEmployeeAction,
  translateEntity,
  translateStatus,
} from '@/lib/display-labels';
import { formatCurrency, formatDate } from '@/lib/utils';

export function DashboardView() {
  const session = getSession();
  const summaryQuery = useQuery({
    queryKey: ['dashboard-summary', session?.tenantId],
    queryFn: () => getDashboardSummary(session?.tenantId ?? '', session?.accessToken ?? ''),
    enabled: Boolean(session?.tenantId && session.accessToken),
  });

  if (!session) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sesion requerida</CardTitle>
          <CardDescription>Inicia sesion para consultar datos protegidos del tenant.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <a href="/login">Ir al login</a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (summaryQuery.isLoading) {
    return <DashboardSkeleton />;
  }

  if (summaryQuery.isError || !summaryQuery.data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Panel no disponible</CardTitle>
          <CardDescription>
            Revisa que el API este corriendo y que tu sesion tenga acceso al tenant.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const summary = summaryQuery.data;
  const quickActions = [
    {
      label: 'Tomar orden',
      href: '/orders',
      icon: ClipboardList,
      variant: 'default' as const,
    },
    {
      label: 'Cobrar orden',
      href: '/pos',
      icon: ReceiptText,
      variant: 'default' as const,
    },
    {
      label: 'Devoluciones',
      href: '/returns',
      icon: RotateCcw,
      variant: 'outline' as const,
    },
    {
      label: 'Facturas',
      href: '/invoices',
      icon: FileText,
      variant: 'outline' as const,
    },
    {
      label: 'Productos',
      href: '/products',
      icon: PackageCheck,
      variant: 'outline' as const,
    },
    {
      label: 'Sesiones de caja',
      href: '/cash/sessions',
      icon: Landmark,
      variant: 'outline' as const,
    },
  ].filter((action) => canAccessPath(session, action.href));

  const kpis = [
    {
      label: 'Ventas netas mes',
      value: formatCurrency(summary.netSalesMonth),
      hint: `${formatCurrency(summary.grossSalesMonth)} cobrado - ${formatCurrency(summary.refundsMonth)} devuelto`,
      icon: ReceiptText,
      tone: 'text-accent',
      href: '/invoices',
    },
    {
      label: 'Ventas netas hoy',
      value: formatCurrency(summary.netSalesToday),
      hint: `${formatCurrency(summary.grossSalesToday)} cobrado - ${formatCurrency(summary.refundsToday)} devuelto`,
      icon: Activity,
      tone: 'text-success',
      href: '/invoices',
    },
    {
      label: 'Ordenes en caja',
      value: summary.ordersInCashier.toString(),
      hint: `${summary.pendingOrders} en espera, ${summary.claimedOrders} tomadas`,
      icon: ShoppingCart,
      tone: 'text-warning',
      href: '/pos',
    },
    {
      label: 'Devoluciones pendientes',
      value: summary.pendingReturns.toString(),
      hint: `${formatCurrency(summary.pendingReturnAmount)} por validar`,
      icon: RotateCcw,
      tone: 'text-danger',
      href: '/returns',
    },
    {
      label: 'Cotizaciones',
      value: summary.pendingQuotations.toString(),
      hint: 'Pendientes de aceptar o cancelar',
      icon: ClipboardList,
      tone: 'text-primary',
      href: '/quotations',
    },
    {
      label: 'Cajas abiertas',
      value: summary.openCashSessions.toString(),
      hint: 'Sesiones activas ahora',
      icon: Landmark,
      tone: 'text-success',
      href: '/cash/sessions',
    },
    {
      label: 'Facturas pendientes',
      value: summary.pendingInvoices.toString(),
      hint: `${summary.paidInvoices} pagadas, ${summary.cancelledInvoices} anuladas`,
      icon: Clock3,
      tone: 'text-warning',
      href: '/invoices',
    },
    {
      label: 'Bajo stock',
      value: summary.lowStockProducts.toString(),
      hint: `${summary.activeProducts} productos activos`,
      icon: AlertTriangle,
      tone: 'text-danger',
      href: '/products',
    },
    {
      label: 'Clientes activos',
      value: summary.activeCustomers.toString(),
      hint: 'Clientes registrados',
      icon: Users,
      tone: 'text-accent',
      href: '/customers',
    },
    {
      label: 'Empleados',
      value: summary.activeEmployees.toString(),
      hint: 'Usuarios operativos activos',
      icon: UserCheck,
      tone: 'text-primary',
      href: '/employees',
    },
    {
      label: 'Borradores',
      value: summary.draftInvoices.toString(),
      hint: 'Facturas no emitidas',
      icon: FileText,
      tone: 'text-muted-foreground',
      href: '/invoices',
    },
    {
      label: 'Completadas hoy',
      value: summary.completedOrdersToday.toString(),
      hint: 'Ordenes cobradas en el dia',
      icon: CheckCircle2,
      tone: 'text-success',
      href: '/invoices',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-accent">Operacion en tiempo real</p>
        <h1 className="text-2xl font-semibold">Panel</h1>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          Indicadores calculados desde la base de datos para {session.tenantName}. Las ventas muestran cobros netos:
          total cobrado menos devoluciones completadas.
        </p>
      </div>

      {quickActions.length ? (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {quickActions.map((action) => {
            const Icon = action.icon;

            return (
              <Button key={action.href} asChild variant={action.variant} className="h-12 justify-start">
                <Link href={action.href}>
                  <Icon className="h-4 w-4" />
                  {action.label}
                </Link>
              </Button>
            );
          })}
        </section>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          const cardContent = (
            <CardContent className="flex items-center justify-between gap-4 p-4 sm:p-5">
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">{kpi.label}</p>
                <p className="mt-2 truncate text-xl font-semibold sm:text-2xl">{kpi.value}</p>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{kpi.hint}</p>
              </div>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-muted">
                <Icon className={`h-5 w-5 ${kpi.tone}`} />
              </div>
            </CardContent>
          );

          return (
            <Card key={kpi.label} className="transition hover:-translate-y-0.5 hover:shadow-md">
              {canAccessPath(session, kpi.href) ? (
                <Link href={kpi.href} aria-label={`Abrir ${kpi.label}`}>
                  {cardContent}
                </Link>
              ) : (
                cardContent
              )}
            </Card>
          );
        })}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <Card>
          <CardHeader>
            <CardTitle>Ventas netas</CardTitle>
            <CardDescription>Ultimos seis meses, restando devoluciones completadas.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-56 w-full sm:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={summary.salesSeries} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `${Number(value) / 1000}k`}
                  />
                  <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="hsl(var(--accent))"
                    fill="hsl(var(--accent) / 0.18)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Flujo operativo</CardTitle>
            <CardDescription>Ordenes, caja y devoluciones en estado accionable.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <StatusRow label="Ordenes por cobrar" value={summary.pendingOrders} href="/pos" session={session} />
            <StatusRow label="Ordenes tomadas en caja" value={summary.claimedOrders} href="/pos" session={session} />
            <StatusRow label="Cotizaciones pendientes" value={summary.pendingQuotations} href="/quotations" session={session} />
            <StatusRow label="Devoluciones por validar" value={summary.pendingReturns} href="/returns" session={session} />
            <StatusRow label="Facturas pendientes" value={summary.pendingInvoices} href="/invoices" session={session} />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Cajas abiertas</CardTitle>
            <CardDescription>Monto esperado segun apertura y movimientos en efectivo.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {summary.openCashSessionDetails.length ? (
              summary.openCashSessionDetails.map((cashSession) => (
                <Link
                  key={cashSession.id}
                  href="/cash/sessions"
                  className="block rounded-md border border-border p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{cashSession.registerName}</p>
                      <p className="text-xs text-muted-foreground">
                        {cashSession.openedByName} - {formatDate(cashSession.openedAt)}
                      </p>
                    </div>
                    <Badge variant="success">Abierta</Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Apertura</p>
                      <p className="font-semibold">{formatCurrency(cashSession.openingAmount)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Esperado</p>
                      <p className="font-semibold">{formatCurrency(cashSession.expectedCashAmount)}</p>
                    </div>
                  </div>
                </Link>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No hay cajas abiertas ahora.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Devoluciones recientes</CardTitle>
            <CardDescription>Solicitudes creadas, rechazadas o completadas.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {summary.recentReturns.length ? (
              summary.recentReturns.map((returnRequest) => (
                <Link
                  key={returnRequest.id}
                  href="/returns"
                  className="block rounded-md border border-border p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{returnRequest.invoiceNumber}</p>
                      <p className="line-clamp-1 text-xs text-muted-foreground">
                        {returnRequest.requestedByName} - {returnRequest.reason}
                      </p>
                    </div>
                    <Badge variant={getStatusVariant(returnRequest.status)}>
                      {translateStatus(returnRequest.status)}
                    </Badge>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{formatDate(returnRequest.createdAt)}</span>
                    <span className="font-semibold">{formatCurrency(returnRequest.refundAmount)}</span>
                  </div>
                </Link>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Sin devoluciones registradas.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Alertas de inventario</CardTitle>
            <CardDescription>Productos activos en o por debajo del minimo.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {summary.recentInventoryAlerts.length ? (
              summary.recentInventoryAlerts.map((product) => (
                <Link
                  key={product.id}
                  href="/products"
                  className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{product.name}</p>
                    <p className="text-xs text-muted-foreground">{product.sku ?? 'Sin SKU'}</p>
                  </div>
                  <Badge variant="danger">
                    {formatQuantity(Math.max(Number(product.stock) - Number(product.reservedStock), 0))}/
                    {formatQuantity(product.minStock)}
                  </Badge>
                </Link>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Sin alertas activas.</p>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Movimientos de caja</CardTitle>
            <CardDescription>Ultimos cobros, aperturas, cierres y devoluciones.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {summary.recentCashMovements.length ? (
              summary.recentCashMovements.map((movement) => (
                <div
                  key={movement.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{translateCashMovementType(movement.type)}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {movement.cashierName ?? movement.user?.name ?? 'Empleado'} -{' '}
                      {movement.reference ?? movement.invoiceNumber ?? 'Sin referencia'}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold">{formatCurrency(Number(movement.amount))}</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Sin movimientos recientes.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Logs de empleados</CardTitle>
            <CardDescription>Actividad operativa reciente del equipo.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {summary.recentEmployeeLogs.length ? (
              summary.recentEmployeeLogs.map((log) => (
                <div key={log.id} className="rounded-md border border-border p-3">
                  <p className="text-sm font-medium">
                    {log.employeeName ?? log.user?.name ?? 'Empleado'} - {translateEmployeeAction(log.action)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {translateEntity(log.entity)} {log.invoiceNumber ? `- ${log.invoiceNumber}` : ''}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Sin actividad reciente.</p>
            )}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Facturas recientes</CardTitle>
          <CardDescription>Ventas y facturas mas recientes del tenant actual.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Numero</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.recentInvoices.length ? (
                summary.recentInvoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
                    <TableCell>{invoice.customerName}</TableCell>
                    <TableCell>{formatDate(invoice.issuedAt ?? invoice.createdAt)}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusVariant(invoice.status)}>{translateStatus(invoice.status)}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {canAccessPath(session, `/invoices/${invoice.id}`) ? (
                        <Link href={`/invoices/${invoice.id}`} className="font-semibold text-accent">
                          {formatCurrency(invoice.total)}
                        </Link>
                      ) : (
                        <span className="font-semibold">{formatCurrency(invoice.total)}</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                    Todavia no hay facturas registradas.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function StatusRow({
  label,
  value,
  href,
  session,
}: {
  label: string;
  value: number;
  href: string;
  session: AuthSession;
}) {
  const content = (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-lg font-semibold">{value}</span>
    </div>
  );

  if (!canAccessPath(session, href)) {
    return content;
  }

  return <Link href={href}>{content}</Link>;
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-48 rounded-md bg-muted" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <Card key={index}>
            <CardContent className="p-5">
              <div className="h-4 w-24 rounded-sm bg-muted" />
              <div className="mt-4 h-7 w-32 rounded-sm bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="h-80 p-5" />
      </Card>
    </div>
  );
}
