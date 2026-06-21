'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getEmployee } from '@/lib/api';
import { getStatusVariant, translateRole, translateStatus } from '@/lib/display-labels';
import { ModuleHeader } from './module-header';
import { SessionRequired, useCurrentSession } from './session-required';

export function EmployeeDetail({ employeeId }: { employeeId: string }) {
  const session = useCurrentSession();
  const employeeQuery = useQuery({
    queryKey: ['employee', employeeId, session?.tenantId],
    queryFn: () => getEmployee(session?.tenantId ?? '', session?.accessToken ?? '', employeeId),
    enabled: Boolean(session),
  });

  if (!session) {
    return <SessionRequired session={session} />;
  }

  const employee = employeeQuery.data;
  const membership = employee?.user.memberships[0];

  return (
    <div className="space-y-6">
      <ModuleHeader title="Empleado" description="Detalle operativo y permisos del usuario en Ferreteria RIVNU." />

      <Card>
        <CardHeader>
          <CardTitle>{employee?.user.name ?? 'Cargando empleado'}</CardTitle>
          <CardDescription>{employee?.user.email ?? 'Consultando PostgreSQL'}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {employee ? (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <Info label="Codigo" value={employee.employeeCode ?? 'Sin codigo'} />
                <Info label="Cargo" value={employee.jobTitle ?? 'Sin cargo'} />
                <Info label="Rol" value={translateRole(membership?.role)} />
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant={getStatusVariant(employee.status)}>{translateStatus(employee.status)}</Badge>
                {membership?.canUsePos ? <Badge variant="success">Usar caja</Badge> : null}
                {membership?.canOpenCashSession ? <Badge variant="outline">Abrir caja</Badge> : null}
                {membership?.canManageProducts ? <Badge variant="outline">Productos</Badge> : null}
                {membership?.canManageEmployees ? <Badge variant="outline">Empleados</Badge> : null}
              </div>
              <Button asChild>
                <Link href={`/employees/${employee.id}/edit`}>Editar empleado</Link>
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Cargando empleado...</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}
