'use client';

import { ReceiptText } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Customer, Invoice } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { PaymentCalculator } from './payment-calculator';
import type { PosTotals } from './types';

type PosPaymentPanelProps = {
  customers: Customer[];
  customerId: string;
  documentType: string;
  paymentMethod: string;
  amountReceived: string;
  totals: PosTotals;
  message: string | null;
  lastInvoice: Invoice | null;
  canCompleteSale: boolean;
  isCompleting: boolean;
  onCustomerChange: (value: string) => void;
  onDocumentTypeChange: (value: string) => void;
  onPaymentMethodChange: (value: string) => void;
  onAmountReceivedChange: (value: string) => void;
  onCompleteSale: () => void;
};

export function PosPaymentPanel({
  customers,
  customerId,
  documentType,
  paymentMethod,
  amountReceived,
  totals,
  message,
  lastInvoice,
  canCompleteSale,
  isCompleting,
  onCustomerChange,
  onDocumentTypeChange,
  onPaymentMethodChange,
  onAmountReceivedChange,
  onCompleteSale,
}: PosPaymentPanelProps) {
  const cashInsufficient = paymentMethod === 'CASH' && totals.total > 0 && totals.received < totals.total;
  const cashPayment = paymentMethod === 'CASH';

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="customer">Cliente</Label>
            <select
              id="customer"
              value={customerId}
              onChange={(event) => onCustomerChange(event.target.value)}
              className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Consumidor final</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="documentType">Comprobante</Label>
            <select
              id="documentType"
              value={documentType}
              onChange={(event) => onDocumentTypeChange(event.target.value)}
              className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="CONSUMER_ELECTRONIC_32">Factura consumo e-CF 32</option>
              <option value="FISCAL_CREDIT_ELECTRONIC_31">Credito fiscal e-CF 31</option>
            </select>
          </div>
        </div>

        <div className="mt-3 grid gap-3">
          <div className="space-y-2">
            <Label htmlFor="paymentMethod">Metodo de pago</Label>
            <select
              id="paymentMethod"
              value={paymentMethod}
              onChange={(event) => onPaymentMethodChange(event.target.value)}
              className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="CASH">Efectivo</option>
              <option value="CARD">Tarjeta</option>
              <option value="TRANSFER">Transferencia</option>
            </select>
          </div>
        </div>
      </div>

      <div className="rounded-md border-2 border-[#f36c10]/30 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-2">
            <Label htmlFor="amountReceived">
              {cashPayment ? 'Monto entregado por el cliente' : 'Monto pagado'}
            </Label>
            <Input
              id="amountReceived"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={amountReceived}
              disabled={!cashPayment}
              onChange={(event) => onAmountReceivedChange(event.target.value)}
              placeholder={totals.total ? totals.total.toFixed(2) : '0.00'}
              className="h-12 text-xl font-semibold"
            />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:w-56">
            <div className="rounded-md bg-zinc-950 px-3 py-2 text-white">
              <p className="text-xs text-zinc-300">Total</p>
              <p className="text-lg font-bold">{formatCurrency(totals.total)}</p>
            </div>
            <div className="rounded-md bg-success/10 px-3 py-2 text-success">
              <p className="text-xs">Devuelta</p>
              <p className="text-lg font-bold">{formatCurrency(totals.change)}</p>
            </div>
          </div>
        </div>
        {!cashPayment ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Tarjeta y transferencia se registran por el total exacto de la factura.
          </p>
        ) : null}
      </div>

      <PaymentCalculator
        total={totals.total}
        amountReceived={amountReceived}
        disabled={!cashPayment}
        onAmountChange={onAmountReceivedChange}
      />

      <div className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{formatCurrency(totals.subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span>Descuento</span>
            <span>{formatCurrency(totals.discount)}</span>
          </div>
          <div className="flex justify-between">
            <span>ITBIS</span>
            <span>{formatCurrency(totals.tax)}</span>
          </div>
          <div className="flex justify-between border-t border-zinc-200 pt-3 text-xl font-bold text-zinc-950">
            <span>Total</span>
            <span>{formatCurrency(totals.total)}</span>
          </div>
          <div className="flex justify-between text-base font-semibold text-success">
            <span>Devuelta</span>
            <span>{formatCurrency(totals.change)}</span>
          </div>
        </div>

        {cashInsufficient ? (
          <p className="mt-3 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
            El efectivo recibido debe cubrir el total para completar la venta.
          </p>
        ) : null}

        {message ? <p className="mt-3 text-sm text-muted-foreground">{message}</p> : null}

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            className="h-12 flex-1 bg-[#f36c10] text-base text-white hover:bg-[#d85f0e]"
            disabled={!canCompleteSale || cashInsufficient || isCompleting}
            onClick={onCompleteSale}
          >
            <ReceiptText className="h-4 w-4" />
            Completar venta
          </Button>
          {lastInvoice ? (
            <Button asChild variant="outline" className="h-12 flex-1">
              <Link href={`/invoices/${lastInvoice.id}/print`}>Imprimir</Link>
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
