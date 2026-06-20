'use client';

import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getImportBatches } from '@/lib/api';
import { getStatusVariant, translateImportType, translateStatus } from '@/lib/display-labels';
import { formatDate } from '@/lib/utils';
import { ModuleHeader } from './module-header';
import { SessionRequired, useCurrentSession } from './session-required';

export function ImportsView() {
  const session = useCurrentSession();
  const importsQuery = useQuery({
    queryKey: ['imports', session?.tenantId],
    queryFn: () => getImportBatches(session?.tenantId ?? '', session?.accessToken ?? ''),
    enabled: Boolean(session),
  });

  if (!session) {
    return <SessionRequired session={session} />;
  }

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Importaciones"
        description="Base preparada para cargar productos, clientes, inventario inicial e historicos."
      />

      <Card>
        <CardHeader>
          <CardTitle>Lotes de importacion</CardTitle>
          <CardDescription>Registros persistidos como lotes de importacion para Ferreteria RIVNU.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(importsQuery.data ?? []).map((batch) => (
            <div key={batch.id} className="rounded-md border border-border p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{batch.filename}</p>
                  <p className="text-xs text-muted-foreground">
                    {translateImportType(batch.type)} - {formatDate(batch.createdAt)}
                  </p>
                </div>
                <Badge variant={getStatusVariant(batch.status)}>{translateStatus(batch.status)}</Badge>
              </div>
              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-4">
                <span>Total: {batch.totalRows}</span>
                <span>Validas: {batch.validRows}</span>
                <span>Invalidas: {batch.invalidRows}</span>
                <span>Importadas: {batch.importedRows}</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
