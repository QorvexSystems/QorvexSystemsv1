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
import { getFiscalSequences } from '@/lib/api';
import {
  getStatusVariant,
  translateInvoiceDocumentType,
  translateStatus,
} from '@/lib/display-labels';
import { formatDate } from '@/lib/utils';
import { ModuleHeader } from './module-header';
import { SessionRequired, useCurrentSession } from './session-required';

export function FiscalSequencesView() {
  const session = useCurrentSession();
  const sequencesQuery = useQuery({
    queryKey: ['fiscal-sequences', session?.tenantId],
    queryFn: () => getFiscalSequences(session?.tenantId ?? '', session?.accessToken ?? ''),
    enabled: Boolean(session),
  });

  if (!session) {
    return <SessionRequired session={session} />;
  }

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Secuencias fiscales"
        description="Preparacion DGII/e-CF. La emision real DGII queda apagada por ahora."
      />

      <Card>
        <CardHeader>
          <CardTitle>NCF/e-NCF disponibles</CardTitle>
          <CardDescription>
            POS reserva estas secuencias al facturar dentro del tenant.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Prefijo</TableHead>
                <TableHead>Siguiente</TableHead>
                <TableHead>Final</TableHead>
                <TableHead>Restantes</TableHead>
                <TableHead>Vigencia</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(sequencesQuery.data ?? []).map((sequence) => (
                <TableRow key={sequence.id}>
                  <TableCell>{translateInvoiceDocumentType(sequence.documentType)}</TableCell>
                  <TableCell>{sequence.prefix}</TableCell>
                  <TableCell className="font-medium">
                    {formatFiscalNumber(sequence.prefix, sequence.nextNumber)}
                  </TableCell>
                  <TableCell>{formatFiscalNumber(sequence.prefix, sequence.endNumber)}</TableCell>
                  <TableCell>{Math.max(sequence.endNumber - sequence.nextNumber + 1, 0)}</TableCell>
                  <TableCell>
                    {sequence.validUntil ? formatDate(sequence.validUntil) : '-'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={getStatusVariant(sequence.status)}>
                      {translateStatus(sequence.status)}
                    </Badge>
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

function formatFiscalNumber(prefix: string, number: number) {
  const digits = prefix === 'BA' ? 4 : 10;

  return `${prefix}${String(number).padStart(digits, '0')}`;
}
