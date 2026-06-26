'use client';

import { AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

type CancelReasonModalProps = {
  open: boolean;
  title: string;
  description: string;
  reason: string;
  confirmLabel?: string;
  isPending?: boolean;
  onReasonChange: (reason: string) => void;
  onClose: () => void;
  onConfirm: () => void;
};

export function CancelReasonModal({
  open,
  title,
  description,
  reason,
  confirmLabel = 'Confirmar cancelacion',
  isPending = false,
  onReasonChange,
  onClose,
  onConfirm,
}: CancelReasonModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/65 px-4 backdrop-blur-sm">
      <div className="w-full max-w-lg overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-2xl">
        <div className="border-b border-[#f36c10]/20 bg-[#f36c10]/10 px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex gap-3">
              <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#f36c10] text-white">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-zinc-950">{title}</h2>
                <p className="mt-1 text-sm leading-5 text-zinc-700">{description}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-zinc-500 hover:bg-white/70 hover:text-zinc-950"
              aria-label="Cerrar modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="space-y-3 px-5 py-5">
          <div className="space-y-2">
            <Label htmlFor="cancelReason">
              Motivo <span className="text-danger">*</span>
            </Label>
            <textarea
              id="cancelReason"
              value={reason}
              onChange={(event) => onReasonChange(event.target.value)}
              className="min-h-28 w-full rounded-md border border-input bg-white px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#f36c10]"
              maxLength={300}
              placeholder="Ejemplo: el cliente solicito cambiar productos o no aprobo la cotizacion."
              autoFocus
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Este motivo quedara guardado en el historial de la orden para auditoria.
          </p>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-zinc-200 bg-zinc-50 px-5 py-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
            Atras
          </Button>
          <Button
            type="button"
            className="bg-danger text-white hover:bg-danger/90"
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending ? 'Procesando...' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
