'use client';

import { useQuery } from '@tanstack/react-query';
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
import { getCashMovements, getEmployeeLogs } from '@/lib/api';
import { translateCashMovementType, translateEmployeeAction, translateEntity } from '@/lib/display-labels';
import { formatCurrency, formatDate } from '@/lib/utils';
import { ModuleHeader } from './module-header';
import { SessionRequired, useCurrentSession } from './session-required';

export function CashLogsView() {
  const session = useCurrentSession();
  const cashQuery = useQuery({
    queryKey: ['cash-movements', session?.tenantId],
    queryFn: () => getCashMovements(session?.tenantId ?? '', session?.accessToken ?? ''),
    enabled: Boolean(session),
  });
  const logsQuery = useQuery({
    queryKey: ['employee-logs', session?.tenantId],
    queryFn: () => getEmployeeLogs(session?.tenantId ?? '', session?.accessToken ?? ''),
    enabled: Boolean(session),
  });

  if (!session) {
    return <SessionRequired session={session} />;
  }

  return (
    <div className="space-y-6">
      <ModuleHeader title="Logs de caja" description="Movimientos de efectivo y actividad de empleados RIVNU." />

      <Card>
        <CardHeader>
          <CardTitle>Movimientos de caja</CardTitle>
          <CardDescription>{cashQuery.data?.length ?? 0} movimientos registrados.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Cajero</TableHead>
                <TableHead>Referencia</TableHead>
                <TableHead className="text-right">Monto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(cashQuery.data ?? []).map((movement) => (
                <TableRow key={movement.id}>
                  <TableCell>{formatDate(movement.createdAt)}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{translateCashMovementType(movement.type)}</Badge>
                  </TableCell>
                  <TableCell>{movement.user?.name ?? movement.cashierName ?? 'Empleado'}</TableCell>
                  <TableCell>{movement.reference ?? movement.invoiceNumber ?? '-'}</TableCell>
                  <TableCell className="text-right">{formatCurrency(Number(movement.amount))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Actividad de empleados</CardTitle>
          <CardDescription>Eventos operativos auditables del tenant.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(logsQuery.data ?? []).map((log) => (
            <div key={log.id} className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
              <div>
                <p className="text-sm font-medium">
                  {log.user?.name ?? log.employeeName ?? 'Empleado'} - {translateEmployeeAction(log.action)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {translateEntity(log.entity)} {log.invoiceNumber ? `- ${log.invoiceNumber}` : ''}
                </p>
              </div>
              <span className="text-xs text-muted-foreground">{formatDate(log.createdAt)}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
