'use client';

import { Barcode, Camera, Search, ScanLine, X } from 'lucide-react';
import { FormEvent, RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type BarcodeInputProps = {
  barcode: string;
  scannerEnabled: boolean;
  cameraActive: boolean;
  scannerMessage: string | null;
  barcodeInputRef: RefObject<HTMLInputElement | null>;
  videoRef: RefObject<HTMLVideoElement | null>;
  isPending: boolean;
  onBarcodeChange: (value: string) => void;
  onSubmit: (code: string) => void;
  onEnableScanner: () => void;
  onDisableScanner: () => void;
  onStartCamera: () => void;
};

export function BarcodeInput({
  barcode,
  scannerEnabled,
  cameraActive,
  scannerMessage,
  barcodeInputRef,
  videoRef,
  isPending,
  onBarcodeChange,
  onSubmit,
  onEnableScanner,
  onDisableScanner,
  onStartCamera,
}: BarcodeInputProps) {
  function submitBarcode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = barcode.trim();
    if (code) {
      onSubmit(code);
    }
  }

  return (
    <div className="rounded-md border border-zinc-200 bg-white p-3 shadow-sm">
      <div className="mb-3 flex flex-wrap gap-2">
        <Button type="button" variant={scannerEnabled ? 'default' : 'outline'} onClick={onEnableScanner}>
          <ScanLine className="h-4 w-4" />
          Activar lector
        </Button>
        <Button type="button" variant="outline" onClick={onStartCamera}>
          <Camera className="h-4 w-4" />
          Camara QR
        </Button>
        {scannerEnabled ? (
          <Button type="button" variant="ghost" onClick={onDisableScanner}>
            <X className="h-4 w-4" />
            Apagar
          </Button>
        ) : null}
      </div>

      <form className="flex gap-2" onSubmit={submitBarcode}>
        <div className="relative flex-1">
          <Barcode className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={barcodeInputRef}
            value={barcode}
            onChange={(event) => onBarcodeChange(event.target.value)}
            className="pl-9"
            placeholder="Escanea o escribe codigo QR o codigo de barras"
            autoComplete="off"
            inputMode="text"
          />
        </div>
        <Button type="submit" disabled={isPending} aria-label="Buscar por codigo">
          <Search className="h-4 w-4" />
        </Button>
      </form>

      {cameraActive ? (
        <video ref={videoRef} className="mt-3 aspect-video w-full rounded-md bg-black object-cover" muted />
      ) : null}

      {scannerMessage ? <p className="mt-2 text-sm text-muted-foreground">{scannerMessage}</p> : null}
    </div>
  );
}
