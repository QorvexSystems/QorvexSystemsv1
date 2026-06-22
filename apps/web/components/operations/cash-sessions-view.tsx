'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, DoorClosed, DoorOpen } from 'lucide-react';
import { Fragment, FormEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  closeCashSession,
  getCashRegisters,
  getCashSessions,
  openCashSession,
} from '@/lib/api';
import {
  getStatusVariant,
  translateCashMovementType,
  translatePaymentMethod,
  translateStatus,
} from '@/lib/display-labels';
import { formatCurrency, formatDate } from '@/lib/utils';
import { ModuleHeader } from './module-header';
import { SessionRequired, useCurrentSession } from './session-required';

export function CashSessionsView() {
  const session = useCurrentSession();
  const queryClient = useQueryClient();
  const [selectedRegisterId, setSelectedRegisterId] = useState('');
  const [selectedClosingSessionId, setSelectedClosingSessionId] = useState('');
  const [openingAmount, setOpeningAmount] = useState('5000');
  const [closingAmount, setClosingAmount] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);

  const sessionsQuery = useQuery({
    queryKey: ['cash-sessions', session?.tenantId],
    queryFn: () => getCashSessions(session?.tenantId ?? '', session?.accessToken ?? ''),
    enabled: Boolean(session),
  });
  const registersQuery = useQuery({
    queryKey: ['cash-registers', session?.tenantId],
    queryFn: () => getCashRegisters(session?.tenantId ?? '', session?.accessToken ?? ''),
    enabled: Boolean(session),
  });
  const openSessions = (sessionsQuery.data ?? []).filter((cashSession) => cashSession.status === 'OPEN');
  const selectedOpenSession = openSessions.find((cashSession) => cashSession.id === selectedClosingSessionId);
  const selectedRegisterOpenSession = openSessions.find(
    (cashSession) => cashSession.cashRegister.id === selectedRegisterId,
  );

  useEffect(() => {
    const firstRegister = registersQuery.data?.find(
      (register) =>
        register.status === 'ACTIVE' &&
        !openSessions.some((cashSession) => cashSession.cashRegister.id === register.id),
    );

    if (!selectedRegisterId && firstRegister) {
      setSelectedRegisterId(firstRegister.id);
    }
  }, [registersQuery.data, selectedRegisterId, sessionsQuery.data]);

  useEffect(() => {
    const firstOpenSession = sessionsQuery.data?.find((cashSession) => cashSession.status === 'OPEN');

    if (!selectedClosingSessionId && firstOpenSession) {
      setSelectedClosingSessionId(firstOpenSession.id);
    }
  }, [selectedClosingSessionId, sessionsQuery.data]);

  const openMutation = useMutation({
    mutationFn: () => {
      if (!session) {
        throw new Error('Sesion requerida.');
      }

      return openCashSession(session.tenantId, session.accessToken, {
        cashRegisterId: selectedRegisterId,
        openingAmount: Number(openingAmount),
      });
    },
    onSuccess: async () => {
      setMessage('Caja abierta correctamente.');
      toast.success('Caja abierta correctamente.');
      await invalidateCash();
    },
    onError: (error) => {
      const nextMessage = error instanceof Error ? error.message : 'No se pudo abrir la caja.';
      setMessage(nextMessage);
      toast.error(nextMessage);
    },
  });

  const closeMutation = useMutation({
    mutationFn: () => {
      if (!session || !selectedClosingSessionId) {
        throw new Error('Sesion requerida.');
      }

      return closeCashSession(session.tenantId, session.accessToken, selectedClosingSessionId, {
        closingAmount: Number(closingAmount),
        notes: 'Cierre desde modulo de caja',
      });
    },
    onSuccess: async (closedSession) => {
      setMessage('Caja cerrada correctamente.');
      toast.success('Caja cerrada correctamente.');
      setClosingAmount('');
      setSelectedClosingSessionId('');
      setExpandedSessionId(closedSession.id);
      await invalidateCash();
    },
    onError: (error) => {
      const nextMessage = error instanceof Error ? error.message : 'No se pudo cerrar la caja.';
      setMessage(nextMessage);
      toast.error(nextMessage);
    },
  });

  if (!session) {
    return <SessionRequired session={session} />;
  }

  async function invalidateCash() {
    await queryClient.invalidateQueries({ queryKey: ['cash-sessions'] });
    await queryClient.invalidateQueries({ queryKey: ['cash-session-current'] });
    await queryClient.invalidateQueries({ queryKey: ['cash-movements'] });
    await queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
  }

  function submitOpen(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    openMutation.mutate();
  }

  function submitClose(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    closeMutation.mutate();
  }

  return (
    <div className="space-y-6">
      <ModuleHeader title="Sesiones de caja" description="Apertura, control y cierre de caja de Ferreteria RIVNU." />

      <Card>
        <CardHeader>
          <CardTitle>Abrir caja</CardTitle>
          <CardDescription>
            Declara el monto inicial y selecciona una caja fisica disponible. Puedes abrir varias cajas a la vez
            si son cajas distintas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-[1fr_1fr_auto]" onSubmit={submitOpen}>
            <div className="space-y-2">
              <Label htmlFor="cashRegister">Caja</Label>
              <select
                id="cashRegister"
                value={selectedRegisterId}
                onChange={(event) => setSelectedRegisterId(event.target.value)}
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
                required
              >
                {(registersQuery.data ?? []).map((register) => {
                  const openSession = openSessions.find(
                    (cashSession) => cashSession.cashRegister.id === register.id,
                  );

                  return (
                    <option key={register.id} value={register.id}>
                      {register.name}
                      {openSession ? ` - abierta por ${openSession.openedBy?.name ?? 'otro empleado'}` : ''}
                    </option>
                  );
                })}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="openingAmount">Monto inicial</Label>
              <Input
                id="openingAmount"
                type="number"
                min="0"
                step="0.01"
                value={openingAmount}
                onChange={(event) => setOpeningAmount(event.target.value)}
                required
              />
            </div>
            <div className="flex items-end">
              <Button
                type="submit"
                disabled={!selectedRegisterId || openMutation.isPending || Boolean(selectedRegisterOpenSession)}
              >
                <DoorOpen className="h-4 w-4" />
                Abrir caja
              </Button>
            </div>
          </form>
          {selectedRegisterOpenSession ? (
            <p className="mt-3 rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">
              {selectedRegisterOpenSession.cashRegister.name} ya esta abierta por{' '}
              {selectedRegisterOpenSession.openedBy?.name ?? 'otro empleado'}. Selecciona otra caja fisica.
            </p>
          ) : null}
          {message ? <p className="mt-3 text-sm text-muted-foreground">{message}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cerrar caja</CardTitle>
          <CardDescription>
            {openSessions.length
              ? `${openSessions.length} sesion(es) abierta(s). Selecciona una para cierre.`
              : 'No hay cajas abiertas en este momento.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {openSessions.length ? (
            <form className="grid gap-4 md:grid-cols-[1fr_1fr_auto]" onSubmit={submitClose}>
              <div className="space-y-2">
                <Label htmlFor="openSession">Sesion abierta</Label>
                <select
                  id="openSession"
                  value={selectedClosingSessionId}
                  onChange={(event) => setSelectedClosingSessionId(event.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
                  required
                >
                  {openSessions.map((cashSession) => (
                    <option key={cashSession.id} value={cashSession.id}>
                      {cashSession.cashRegister.name} - {cashSession.openedBy?.name ?? 'Empleado'}
                    </option>
                  ))}
                </select>
                {selectedOpenSession ? (
                  <p className="text-xs text-muted-foreground">
                    Abierta el {formatDate(selectedOpenSession.openedAt)} con{' '}
                    {formatCurrency(Number(selectedOpenSession.openingAmount))}.
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="closingAmount">Monto contado para cierre</Label>
                <Input
                  id="closingAmount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={closingAmount}
                  onChange={(event) => setClosingAmount(event.target.value)}
                  required
                />
              </div>
              <div className="flex items-end">
                <Button type="submit" variant="outline" disabled={closeMutation.isPending}>
                  <DoorClosed className="h-4 w-4" />
                  Cerrar caja
                </Button>
              </div>
            </form>
          ) : (
            <p className="rounded-md bg-zinc-50 px-3 py-2 text-sm text-muted-foreground">
              Abre una caja para comenzar a registrar ventas y movimientos.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Historial</CardTitle>
          <CardDescription>
            {sessionsQuery.data?.length ?? 0} sesiones en historial con reporte de movimientos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-3 pr-4">Caja</th>
                  <th className="py-3 pr-4">Estado</th>
                  <th className="py-3 pr-4">Apertura</th>
                  <th className="py-3 pr-4">Cierre</th>
                  <th className="py-3 pr-4 text-right">Esperado</th>
                  <th className="py-3 pr-4 text-right">Contado</th>
                  <th className="py-3 pr-4 text-right">Diferencia</th>
                  <th className="py-3 text-right">Reporte</th>
                </tr>
              </thead>
              <tbody>
                {(sessionsQuery.data ?? []).map((cashSession) => {
                  const expanded = expandedSessionId === cashSession.id;

                  return (
                    <Fragment key={cashSession.id}>
                      <tr key={cashSession.id} className="border-b border-border">
                        <td className="py-3 pr-4">
                          <div className="font-medium">{cashSession.cashRegister.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {cashSession.openedBy?.name ?? 'Empleado'}
                          </div>
                        </td>
                        <td className="py-3 pr-4">
                          <Badge variant={getStatusVariant(cashSession.status)}>
                            {translateStatus(cashSession.status)}
                          </Badge>
                        </td>
                        <td className="py-3 pr-4">{formatDate(cashSession.openedAt)}</td>
                        <td className="py-3 pr-4">
                          {cashSession.closedAt ? formatDate(cashSession.closedAt) : '-'}
                        </td>
                        <td className="py-3 pr-4 text-right">
                          {formatCurrency(Number(cashSession.expectedAmount ?? cashSession.openingAmount))}
                        </td>
                        <td className="py-3 pr-4 text-right">
                          {cashSession.closingAmount ? formatCurrency(Number(cashSession.closingAmount)) : '-'}
                        </td>
                        <td className="py-3 pr-4 text-right">
                          {cashSession.difference ? formatCurrency(Number(cashSession.difference)) : '-'}
                        </td>
                        <td className="py-3 text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setExpandedSessionId(expanded ? null : cashSession.id)}
                          >
                            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            {expanded ? 'Ocultar' : 'Ver'}
                          </Button>
                        </td>
                      </tr>
                      {expanded ? (
                        <tr key={`${cashSession.id}-report`} className="border-b border-border bg-zinc-50/70">
                          <td colSpan={8} className="px-0 py-4">
                            <CashSessionReport cashSession={cashSession} />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function CashSessionReport({ cashSession }: { cashSession: NonNullable<Awaited<ReturnType<typeof closeCashSession>>> }) {
  const movements = cashSession.movements ?? [];
  const salesOrders = cashSession.claimedSalesOrders ?? [];
  const invoices = cashSession.invoices ?? [];
  const orderInvoices = invoices.filter((invoice) => invoice.salesOrder);
  const directInvoices = invoices.filter((invoice) => !invoice.salesOrder);
  const paymentTotals = getInvoicePaymentTotals(invoices);
  const summary = getCashSessionSummary(cashSession);

  return (
    <div className="space-y-4 px-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ReportMetric label="Fondo inicial" value={formatCurrency(summary.opening)} />
        <ReportMetric label="Ventas en efectivo" value={formatCurrency(summary.sales)} />
        <ReportMetric
          label="Facturas desde tickets"
          value={`${orderInvoices.length} / ${formatCurrency(sumInvoiceTotals(orderInvoices))}`}
        />
        <ReportMetric
          label="Ventas directas admin"
          value={`${directInvoices.length} / ${formatCurrency(sumInvoiceTotals(directInvoices))}`}
        />
        <ReportMetric label="Pagos efectivo" value={formatCurrency(paymentTotals.CASH)} />
        <ReportMetric label="Pagos tarjeta" value={formatCurrency(paymentTotals.CARD)} />
        <ReportMetric label="Pagos transferencia" value={formatCurrency(paymentTotals.TRANSFER)} />
        <ReportMetric label="Entradas manuales" value={formatCurrency(summary.cashIn)} />
        <ReportMetric label="Salidas y devoluciones" value={formatCurrency(summary.cashOut + summary.refunds)} />
        <ReportMetric label="Ordenes cobradas" value={String(salesOrders.filter((order) => order.status === 'COMPLETED').length)} />
        <ReportMetric label="Ajustes" value={formatCurrency(summary.adjustments)} />
        <ReportMetric label="Esperado" value={formatCurrency(Number(cashSession.expectedAmount ?? summary.expected))} />
        <ReportMetric label="Contado" value={cashSession.closingAmount ? formatCurrency(Number(cashSession.closingAmount)) : '-'} />
        <ReportMetric
          label="Diferencia"
          value={cashSession.difference ? formatCurrency(Number(cashSession.difference)) : '-'}
          tone={Number(cashSession.difference ?? 0) === 0 ? 'neutral' : 'warning'}
        />
      </div>

      <div className="overflow-x-auto rounded-md border border-border bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-zinc-50 text-left">
              <th className="px-3 py-2">Origen</th>
              <th className="px-3 py-2">Factura</th>
              <th className="px-3 py-2">Cliente</th>
              <th className="px-3 py-2">Cajero</th>
              <th className="px-3 py-2">Metodo</th>
              <th className="px-3 py-2 text-right">Pagado</th>
              <th className="px-3 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {invoices.length ? (
              invoices.map((invoice) => (
                <tr key={invoice.id} className="border-b border-border last:border-b-0">
                  <td className="px-3 py-2">
                    {invoice.salesOrder ? `Ticket ${invoice.salesOrder.orderNumber}` : 'Venta directa admin'}
                  </td>
                  <td className="px-3 py-2 font-medium">{invoice.invoiceNumber}</td>
                  <td className="px-3 py-2">{invoice.customer?.name ?? 'Consumidor final'}</td>
                  <td className="px-3 py-2">{invoice.issuedBy?.name ?? 'Empleado'}</td>
                  <td className="px-3 py-2">{translatePaymentMethod(invoice.paymentMethod)}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(Number(invoice.paidAmount))}</td>
                  <td className="px-3 py-2 text-right font-medium">{formatCurrency(Number(invoice.total))}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="px-3 py-4 text-center text-muted-foreground">
                  Esta sesion no tiene facturas emitidas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="overflow-x-auto rounded-md border border-border bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-zinc-50 text-left">
              <th className="px-3 py-2">Orden</th>
              <th className="px-3 py-2">Cliente</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Ordenanza</th>
              <th className="px-3 py-2">Factura</th>
              <th className="px-3 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {salesOrders.length ? (
              salesOrders.map((order) => (
                <tr key={order.id} className="border-b border-border last:border-b-0">
                  <td className="px-3 py-2 font-medium">{order.orderNumber}</td>
                  <td className="px-3 py-2">{order.customer?.name ?? 'Consumidor final'}</td>
                  <td className="px-3 py-2">
                    <Badge variant={getStatusVariant(order.status)}>{translateStatus(order.status)}</Badge>
                  </td>
                  <td className="px-3 py-2">{order.createdBy.name}</td>
                  <td className="px-3 py-2">{order.invoice?.invoiceNumber ?? '-'}</td>
                  <td className="px-3 py-2 text-right font-medium">{formatCurrency(Number(order.total))}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-center text-muted-foreground">
                  Esta sesion no tiene ordenes tomadas en caja.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="overflow-x-auto rounded-md border border-border bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-zinc-50 text-left">
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2">Usuario</th>
              <th className="px-3 py-2">Referencia</th>
              <th className="px-3 py-2">Metodo</th>
              <th className="px-3 py-2 text-right">Monto</th>
            </tr>
          </thead>
          <tbody>
            {movements.length ? (
              movements.map((movement) => (
                <tr key={movement.id} className="border-b border-border last:border-b-0">
                  <td className="px-3 py-2">{formatDate(movement.createdAt)}</td>
                  <td className="px-3 py-2">{translateCashMovementType(movement.type)}</td>
                  <td className="px-3 py-2">{movement.user?.name ?? 'Empleado'}</td>
                  <td className="px-3 py-2">
                    {movement.invoice?.invoiceNumber ?? movement.reference ?? movement.reason ?? '-'}
                  </td>
                  <td className="px-3 py-2">{translatePaymentMethod(movement.method)}</td>
                  <td className="px-3 py-2 text-right font-medium">
                    {formatCurrency(Number(movement.amount))}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-center text-muted-foreground">
                  Esta sesion no tiene movimientos registrados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReportMetric({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'warning';
}) {
  return (
    <div className="rounded-md border border-border bg-white p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={tone === 'warning' ? 'mt-1 font-semibold text-warning' : 'mt-1 font-semibold'}>{value}</p>
    </div>
  );
}

type ReportInvoice = NonNullable<
  NonNullable<Awaited<ReturnType<typeof closeCashSession>>>['invoices']
>[number];

function sumInvoiceTotals(invoices: ReportInvoice[]) {
  return invoices.reduce((sum, invoice) => sum + Number(invoice.total), 0);
}

function getInvoicePaymentTotals(invoices: ReportInvoice[]) {
  const totals = {
    CASH: 0,
    CARD: 0,
    TRANSFER: 0,
  };

  for (const invoice of invoices) {
    if (invoice.payments?.length) {
      for (const payment of invoice.payments) {
        if (payment.method in totals) {
          totals[payment.method as keyof typeof totals] += Number(payment.amount);
        }
      }
      continue;
    }

    if (invoice.paymentMethod && invoice.paymentMethod in totals) {
      totals[invoice.paymentMethod as keyof typeof totals] += Number(invoice.paidAmount);
    }
  }

  return totals;
}

function getCashSessionSummary(cashSession: NonNullable<Awaited<ReturnType<typeof closeCashSession>>>) {
  const summary = {
    opening: 0,
    sales: 0,
    cashIn: 0,
    cashOut: 0,
    refunds: 0,
    adjustments: 0,
    expected: 0,
  };

  for (const movement of cashSession.movements ?? []) {
    const amount = Number(movement.amount);
    const affectsCash = !movement.method || movement.method === 'CASH';

    if (movement.type === 'OPENING') {
      summary.opening += amount;
      summary.expected += amount;
    } else if (movement.type === 'SALE_PAYMENT') {
      if (affectsCash) {
        summary.sales += amount;
        summary.expected += amount;
      }
    } else if (movement.type === 'CASH_IN') {
      if (affectsCash) {
        summary.cashIn += amount;
        summary.expected += amount;
      }
    } else if (movement.type === 'CASH_OUT') {
      if (affectsCash) {
        summary.cashOut += amount;
        summary.expected -= amount;
      }
    } else if (movement.type === 'REFUND') {
      if (affectsCash) {
        summary.refunds += amount;
        summary.expected -= amount;
      }
    } else if (movement.type === 'ADJUSTMENT') {
      if (affectsCash) {
        summary.adjustments += amount;
        summary.expected += amount;
      }
    }
  }

  return summary;
}
