'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileUp } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { getImportBatches, importProductsFile } from '@/lib/api';
import { getStatusVariant, translateImportType, translateStatus } from '@/lib/display-labels';
import { formatDate } from '@/lib/utils';
import { ModuleHeader } from './module-header';
import { SessionRequired, useCurrentSession } from './session-required';

export function ImportsView() {
  const session = useCurrentSession();
  const queryClient = useQueryClient();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const importsQuery = useQuery({
    queryKey: ['imports', session?.tenantId],
    queryFn: () => getImportBatches(session?.tenantId ?? '', session?.accessToken ?? ''),
    enabled: Boolean(session),
  });
  const importMutation = useMutation({
    mutationFn: (file: File) => {
      if (!session) {
        throw new Error('Sesion requerida.');
      }

      return importProductsFile(session.tenantId, session.accessToken, file);
    },
    onSuccess: async (batch) => {
      setSelectedFile(null);
      await queryClient.invalidateQueries({ queryKey: ['imports'] });
      await queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Importacion procesada', {
        description: `${batch.importedRows} producto(s) importado(s).`,
      });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'No se pudo importar el archivo.');
    },
  });

  if (!session) {
    return <SessionRequired session={session} />;
  }

  function submitImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (selectedFile) {
      importMutation.mutate(selectedFile);
    }
  }

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Importaciones"
        description="Base preparada para cargar productos, clientes, inventario inicial e historicos."
      />

      <Card>
        <CardHeader>
          <CardTitle>Importar productos</CardTitle>
          <CardDescription>
            Carga masiva del catalogo e inventario inicial desde Excel.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-[1fr_auto]" onSubmit={submitImport}>
            <Input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
            />
            <Button type="submit" disabled={!selectedFile || importMutation.isPending}>
              <FileUp className="h-4 w-4" />
              {importMutation.isPending ? 'Importando...' : 'Importar productos'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lotes de importacion</CardTitle>
          <CardDescription>
            Registros persistidos como lotes de importacion para Ferreteria RIVNU.
          </CardDescription>
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
                <Badge variant={getStatusVariant(batch.status)}>
                  {translateStatus(batch.status)}
                </Badge>
              </div>
              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-4">
                <span>Total: {batch.totalRows}</span>
                <span>Validas: {batch.validRows}</span>
                <span>Invalidas: {batch.invalidRows}</span>
                <span>Importadas: {batch.importedRows}</span>
              </div>
              {batch.errors.length ? (
                <div className="mt-3 rounded-md bg-danger/5 px-3 py-2 text-sm text-danger">
                  {batch.errors.slice(0, 5).map((error) => (
                    <p key={error.id}>
                      Fila {error.rowNumber}: {error.message}
                    </p>
                  ))}
                  {batch.errors.length > 5 ? (
                    <p>+{batch.errors.length - 5} error(es) mas.</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
