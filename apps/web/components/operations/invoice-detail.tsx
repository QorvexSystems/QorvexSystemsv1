'use client';

import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getInvoice } from '@/lib/api';
import { translatePaymentMethod, translateStatus } from '@/lib/display-labels';
import { formatCurrency, formatDate } from '@/lib/utils';
import { ModuleHeader } from './module-header';
import { SessionRequired, useCurrentSession } from './session-required';

export function InvoiceDetail({
  invoiceId,
  printMode = false,
  autoPrint = false,
}: {
  invoiceId: string;
  printMode?: boolean;
  autoPrint?: boolean;
}) {
  const session = useCurrentSession();
  const invoiceQuery = useQuery({
    queryKey: ['invoice', invoiceId, session?.tenantId],
    queryFn: () => getInvoice(session?.tenantId ?? '', session?.accessToken ?? '', invoiceId),
    enabled: Boolean(session),
  });
  const invoice = invoiceQuery.data;
  const autoPrintTriggeredRef = useRef(false);

  useEffect(() => {
    if (printMode && autoPrint && invoice && !autoPrintTriggeredRef.current) {
      autoPrintTriggeredRef.current = true;
      window.setTimeout(() => window.print(), 500);
    }
  }, [autoPrint, invoice, printMode]);

  if (!session) {
    return <SessionRequired session={session} />;
  }

  if (!invoice) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Factura</CardTitle>
          <CardDescription>Cargando datos desde PostgreSQL.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (printMode) {
    return (
      <main className="mx-auto max-w-sm bg-white p-4 text-zinc-950 print:max-w-none print:p-0">
        <Receipt invoice={invoice} />
        <div className="mt-4 print:hidden">
          <Button className="w-full" onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            Imprimir recibo
          </Button>
        </div>
      </main>
    );
  }

  return (
    <div className="space-y-6">
      <ModuleHeader title="Factura" description="Detalle persistido con items, pago, cajero y estado fiscal." />
      <Card>
        <CardHeader>
          <CardTitle>{invoice.invoiceNumber}</CardTitle>
          <CardDescription>
            {invoice.customer?.name ?? 'Consumidor final'} - {translateStatus(invoice.status)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Receipt invoice={invoice} />
        </CardContent>
      </Card>
    </div>
  );
}

function Receipt({ invoice }: { invoice: NonNullable<Awaited<ReturnType<typeof getInvoice>>> }) {
  const amountReceived = Number(invoice.amountReceived) > 0
    ? Number(invoice.amountReceived)
    : Number(invoice.paidAmount);
  const changeAmount = Number(invoice.changeAmount ?? 0);

  return (
    <section className="space-y-3 text-sm">
      <div className="flex flex-col items-center text-center">
        <div className="relative h-20 w-32">
          <Image src="/tenants/Ferreteria_RIVNU.jpeg" alt="Ferreteria RIVNU" fill className="object-contain" />
        </div>
        <p className="mt-2 font-semibold">{invoice.tenant?.commercialName ?? 'Ferreteria RIVNU'}</p>
        <p className="text-xs">{invoice.tenant?.rnc ? `RNC ${invoice.tenant.rnc}` : 'RNC no configurado'}</p>
        <p className="text-xs">{invoice.tenant?.address ?? 'Santo Domingo, RD'}</p>
      </div>

      <div className="border-y border-dashed border-zinc-400 py-2">
        <div className="flex justify-between">
          <span>Factura</span>
          <span>{invoice.invoiceNumber}</span>
        </div>
        <div className="flex justify-between">
          <span>e-NCF</span>
          <span>{invoice.eNcf ?? '-'}</span>
        </div>
        <div className="flex justify-between">
          <span>Fecha</span>
          <span>{formatDate(invoice.issuedAt ?? invoice.createdAt)}</span>
        </div>
        <div className="flex justify-between">
          <span>Cajero</span>
          <span>{invoice.issuedBy?.name ?? '-'}</span>
        </div>
        <div className="flex justify-between">
          <span>Cliente</span>
          <span>{invoice.customer?.name ?? 'Consumidor final'}</span>
        </div>
      </div>

      <div className="space-y-2">
        {invoice.items.map((item) => (
          <div key={item.id}>
            <div className="flex justify-between gap-3">
              <span>{item.description}</span>
              <span>{formatCurrency(Number(item.total))}</span>
            </div>
            <p className="text-xs text-zinc-600">
              {Number(item.quantity)} x {formatCurrency(Number(item.unitPrice))}
            </p>
          </div>
        ))}
      </div>

      <div className="border-t border-dashed border-zinc-400 pt-2">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{formatCurrency(Number(invoice.subtotal))}</span>
        </div>
        <div className="flex justify-between">
          <span>ITBIS</span>
          <span>{formatCurrency(Number(invoice.taxTotal))}</span>
        </div>
        <div className="flex justify-between font-semibold">
          <span>Total</span>
          <span>{formatCurrency(Number(invoice.total))}</span>
        </div>
        <div className="flex justify-between">
          <span>Pagado</span>
          <span>{formatCurrency(Number(invoice.paidAmount))}</span>
        </div>
        <div className="flex justify-between">
          <span>Metodo</span>
          <span>{translatePaymentMethod(invoice.paymentMethod)}</span>
        </div>
        <div className="flex justify-between">
          <span>Recibido</span>
          <span>{formatCurrency(amountReceived)}</span>
        </div>
        <div className="flex justify-between font-semibold">
          <span>Devuelta</span>
          <span>{formatCurrency(changeAmount)}</span>
        </div>
        <div className="flex justify-between">
          <span>Balance</span>
          <span>{formatCurrency(Number(invoice.balance))}</span>
        </div>
      </div>

      <p className="pt-2 text-center text-xs text-zinc-500">Powered by Qorvex</p>
    </section>
  );
}
