'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileText,
  Landmark,
  PackageCheck,
  ReceiptText,
  UserCheck,
  Users,
  XCircle,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { getDashboardSummary } from '@/lib/api';
import { getSession } from '@/lib/auth-session';
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
            Revisa que el API este corriendo, que PostgreSQL tenga seed y que tu sesion tenga acceso al tenant.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const summary = summaryQuery.data;
  const kpis = [
    {
      label: 'Facturado mes',
      value: formatCurrency(summary.totalBilledMonth),
      icon: ReceiptText,
      tone: 'text-accent',
      href: '/invoices',
    },
    {
      label: 'Facturado hoy',
      value: formatCurrency(summary.totalBilledToday),
      icon: Activity,
      tone: 'text-success',
      href: '/invoices',
    },
    {
      label: 'Pendientes',
      value: summary.pendingInvoices.toString(),
      icon: Clock3,
      tone: 'text-warning',
      href: '/invoices',
    },
    {
      label: 'Pagadas',
      value: summary.paidInvoices.toString(),
      icon: CheckCircle2,
      tone: 'text-success',
      href: '/invoices',
    },
    {
      label: 'Clientes activos',
      value: summary.activeCustomers.toString(),
      icon: Users,
      tone: 'text-accent',
      href: '/customers',
    },
    {
      label: 'Productos activos',
      value: summary.activeProducts.toString(),
      icon: PackageCheck,
      tone: 'text-primary',
      href: '/products',
    },
    {
      label: 'Borradores',
      value: summary.draftInvoices.toString(),
      icon: FileText,
      tone: 'text-muted-foreground',
      href: '/invoices',
    },
    {
      label: 'Bajo stock',
      value: summary.lowStockProducts.toString(),
      icon: AlertTriangle,
      tone: 'text-danger',
      href: '/products',
    },
    {
      label: 'Empleados',
      value: summary.activeEmployees.toString(),
      icon: UserCheck,
      tone: 'text-primary',
      href: '/employees',
    },
    {
      label: 'Cajas abiertas',
      value: summary.openCashSessions.toString(),
      icon: Landmark,
      tone: 'text-success',
      href: '/cash/sessions',
    },
    {
      label: 'Canceladas',
      value: summary.cancelledInvoices.toString(),
      icon: XCircle,
      tone: 'text-danger',
      href: '/invoices',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-accent">Operacion ejecutiva</p>
        <h1 className="text-2xl font-semibold">Panel</h1>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          Indicadores calculados desde PostgreSQL para {session.tenantName}.
        </p>
      </div>

      <section className="grid gap-3 md:grid-cols-4">
        <Button asChild className="h-12 justify-start">
          <Link href="/pos">
            <ReceiptText className="h-4 w-4" />
            Nueva venta
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-12 justify-start">
          <Link href="/products/new">
            <PackageCheck className="h-4 w-4" />
            Agregar producto
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-12 justify-start">
          <Link href="/invoices">
            <FileText className="h-4 w-4" />
            Ver facturas
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-12 justify-start">
          <Link href="/settings/imports">
            <Activity className="h-4 w-4" />
            Importaciones
          </Link>
        </Button>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="transition hover:-translate-y-0.5 hover:shadow-md">
            <Link href={kpi.href} aria-label={`Abrir ${kpi.label}`}>
            <CardContent className="flex items-center justify-between gap-4 p-4 sm:p-5">
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">{kpi.label}</p>
                <p className="mt-2 truncate text-xl font-semibold sm:text-2xl">{kpi.value}</p>
              </div>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-muted">
                <kpi.icon className={`h-5 w-5 ${kpi.tone}`} />
              </div>
            </CardContent>
            </Link>
          </Card>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <Card>
          <CardHeader>
            <CardTitle>Ventas facturadas</CardTitle>
            <CardDescription>Ultimos seis meses con facturas emitidas o pagadas.</CardDescription>
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
                    {product.stock}/{product.minStock}
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
            <CardDescription>Ultimos cobros y movimientos de la caja RIVNU.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {summary.recentCashMovements.length ? (
              summary.recentCashMovements.map((movement) => (
                <div
                  key={movement.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
                >
                  <div>
                    <p className="text-sm font-medium">{translateCashMovementType(movement.type)}</p>
                    <p className="text-xs text-muted-foreground">
                      {movement.cashierName ?? movement.user?.name ?? 'Empleado'} -{' '}
                      {movement.reference ?? movement.invoiceNumber ?? 'Sin referencia'}
                    </p>
                  </div>
                  <span className="text-sm font-semibold">{formatCurrency(Number(movement.amount))}</span>
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
          <CardDescription>Actividad mas reciente del tenant actual.</CardDescription>
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
              {summary.recentInvoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
                  <TableCell>{invoice.customerName}</TableCell>
                  <TableCell>{formatDate(invoice.issuedAt ?? invoice.createdAt)}</TableCell>
                  <TableCell>
                    <Badge variant={getStatusVariant(invoice.status)}>{translateStatus(invoice.status)}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Link href={`/invoices/${invoice.id}`} className="font-semibold text-accent">
                      {formatCurrency(invoice.total)}
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
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
