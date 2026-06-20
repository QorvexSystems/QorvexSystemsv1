'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, DoorClosed, DoorOpen, Search, ShieldCheck, Store } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  closeCashSession,
  completePosSale,
  getCashRegisters,
  getCashSessions,
  getCurrentCashSession,
  getCustomers,
  getPosProductByBarcode,
  openCashSession,
  searchPosProducts,
  type Invoice,
  type Product,
} from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { isAdminSession } from '@/lib/authorization';
import { ModuleHeader } from './module-header';
import { BarcodeInput } from './pos/barcode-input';
import { PosCart } from './pos/pos-cart';
import { PosPaymentPanel } from './pos/pos-payment-panel';
import { PosProductGrid } from './pos/pos-product-grid';
import { canAddProduct, getProductPrice, uniqueValues } from './pos/pos-utils';
import type { CartItem } from './pos/types';
import { SessionRequired, useCurrentSession } from './session-required';

type BarcodeDetectorResult = { rawValue: string };
type BarcodeDetectorInstance = {
  detect(source: HTMLVideoElement): Promise<BarcodeDetectorResult[]>;
};
type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorInstance;
type WindowWithBarcodeDetector = Window & typeof globalThis & { BarcodeDetector?: BarcodeDetectorConstructor };

export function PosView() {
  const session = useCurrentSession();
  const queryClient = useQueryClient();
  const router = useRouter();
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanFrameRef = useRef<number | null>(null);

  const [customerId, setCustomerId] = useState('');
  const [documentType, setDocumentType] = useState('CONSUMER_ELECTRONIC_32');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [amountReceived, setAmountReceived] = useState('');
  const [barcode, setBarcode] = useState('');
  const [scannerEnabled, setScannerEnabled] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [scannerMessage, setScannerMessage] = useState<string | null>(null);
  const [lastScannedProduct, setLastScannedProduct] = useState<Product | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [brandFilter, setBrandFilter] = useState('ALL');
  const [selectedRegisterId, setSelectedRegisterId] = useState('');
  const [openingAmount, setOpeningAmount] = useState('5000');
  const [closingAmount, setClosingAmount] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [lastInvoice, setLastInvoice] = useState<Invoice | null>(null);

  const customersQuery = useQuery({
    queryKey: ['pos-customers', session?.tenantId],
    queryFn: () => getCustomers(session?.tenantId ?? '', session?.accessToken ?? ''),
    enabled: Boolean(session),
  });
  const registersQuery = useQuery({
    queryKey: ['cash-registers', session?.tenantId],
    queryFn: () => getCashRegisters(session?.tenantId ?? '', session?.accessToken ?? ''),
    enabled: Boolean(session),
  });
  const currentSessionQuery = useQuery({
    queryKey: ['cash-session-current', session?.tenantId],
    queryFn: () => getCurrentCashSession(session?.tenantId ?? '', session?.accessToken ?? ''),
    enabled: Boolean(session),
  });
  const cashSessionsQuery = useQuery({
    queryKey: ['cash-sessions', session?.tenantId, 'pos'],
    queryFn: () => getCashSessions(session?.tenantId ?? '', session?.accessToken ?? ''),
    enabled: Boolean(session && isAdminSession(session)),
  });
  const productsQuery = useQuery({
    queryKey: ['pos-products-search', session?.tenantId, search],
    queryFn: () => searchPosProducts(session?.tenantId ?? '', session?.accessToken ?? '', search || 'RIV'),
    enabled: Boolean(session && currentSessionQuery.data),
  });

  const currentCashSession = currentSessionQuery.data;
  const canUsePos = session?.permissions.canUsePos ?? ['ADMIN', 'SUPER_ADMIN', 'QORVEX_SUPER_ADMIN'].includes(session?.role ?? '');
  const canOpenCashSession = session?.permissions.canOpenCashSession ?? ['ADMIN', 'SUPER_ADMIN', 'QORVEX_SUPER_ADMIN'].includes(session?.role ?? '');
  const canCloseCashSession = session?.permissions.canCloseCashSession ?? ['ADMIN', 'SUPER_ADMIN', 'QORVEX_SUPER_ADMIN'].includes(session?.role ?? '');

  useEffect(() => {
    const firstRegister = registersQuery.data?.find((register) => register.status === 'ACTIVE');
    if (!selectedRegisterId && firstRegister) {
      setSelectedRegisterId(firstRegister.id);
    }
  }, [registersQuery.data, selectedRegisterId]);

  useEffect(() => {
    if (currentCashSession) {
      setScannerEnabled(true);
      window.setTimeout(() => barcodeInputRef.current?.focus(), 0);
    }
  }, [currentCashSession?.id]);

  useEffect(() => {
    if (scannerEnabled) {
      barcodeInputRef.current?.focus();
    }
  }, [scannerEnabled]);

  const totals = useMemo(() => {
    const subtotal = cart.reduce((sum, item) => sum + getProductPrice(item.product) * item.quantity, 0);
    const tax = cart.reduce(
      (sum, item) => sum + getProductPrice(item.product) * item.quantity * Number(item.product.taxRate),
      0,
    );
    const total = subtotal + tax;
    const received = Number(amountReceived || 0);

    return {
      subtotal,
      discount: 0,
      tax,
      total,
      received,
      change: paymentMethod === 'CASH' && received > total ? received - total : 0,
    };
  }, [amountReceived, cart, paymentMethod]);

  useEffect(() => {
    if (paymentMethod !== 'CASH' && totals.total > 0) {
      setAmountReceived(totals.total.toFixed(2));
    }
  }, [paymentMethod, totals.total]);

  useEffect(() => () => stopCameraScan(), []);

  const activeCustomers = (customersQuery.data ?? []).filter((customer) => customer.status === 'ACTIVE');
  const productPool = productsQuery.data ?? [];
  const categories = uniqueValues(
    productPool.map((product) => product.category?.name).filter((value): value is string => Boolean(value)),
  );
  const brands = uniqueValues(
    productPool.map((product) => product.brand).filter((value): value is string => Boolean(value)),
  );
  const filteredProducts = productPool
    .filter((product) => categoryFilter === 'ALL' || product.category?.name === categoryFilter)
    .filter((product) => brandFilter === 'ALL' || product.brand === brandFilter);
  const quantitiesByProduct = Object.fromEntries(cart.map((item) => [item.product.id, item.quantity]));
  const canCompleteSale = cart.length > 0 && Boolean(currentCashSession);
  const selectedOpenSession = (cashSessionsQuery.data ?? []).find(
    (cashSession) => cashSession.status === 'OPEN' && cashSession.cashRegister.id === selectedRegisterId,
  );
  const selectedRegisterOccupied =
    Boolean(selectedOpenSession) && selectedOpenSession?.openedBy?.id !== session?.user.id;

  const openSessionMutation = useMutation({
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
      await invalidateCashQueries();
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'No se pudo abrir la caja.';
      setMessage(message);
      toast.error(message);
    },
  });

  const closeSessionMutation = useMutation({
    mutationFn: () => {
      if (!session || !currentCashSession) {
        throw new Error('Sesion requerida.');
      }

      return closeCashSession(session.tenantId, session.accessToken, currentCashSession.id, {
        closingAmount: Number(closingAmount),
        notes: 'Cierre desde caja',
      });
    },
    onSuccess: async () => {
      setMessage('Caja cerrada correctamente.');
      toast.success('Caja cerrada correctamente.');
      setClosingAmount('');
      setCart([]);
      setAmountReceived('');
      await invalidateCashQueries();
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'No se pudo cerrar la caja.';
      setMessage(message);
      toast.error(message);
    },
  });

  const barcodeMutation = useMutation({
    mutationFn: (code: string) => {
      if (!session) {
        throw new Error('Sesion requerida.');
      }
      return getPosProductByBarcode(session.tenantId, session.accessToken, code);
    },
    onSuccess: (product) => {
      addProduct(product);
      setBarcode('');
      setLastScannedProduct(product);
      setScannerMessage(`Producto agregado: ${product.name}`);
      toast.success('Producto agregado', { description: product.name });
    },
    onError: () => {
      setBarcode('');
      setScannerMessage('Producto no encontrado.');
      toast.error('Producto no encontrado.');
    },
  });

  const completeSaleMutation = useMutation({
    mutationFn: () => {
      if (!session) {
        throw new Error('Sesion requerida.');
      }

      return completePosSale(session.tenantId, session.accessToken, {
        customerId: customerId || undefined,
        documentType,
        paymentMethod,
        cashSessionId: currentCashSession?.id,
        amountReceived: amountReceived ? Number(amountReceived) : undefined,
        items: cart.map((item) => ({
          productId: item.product.id,
          quantity: item.quantity,
        })),
      });
    },
    onSuccess: async (invoice) => {
      setMessage(`Factura ${invoice.invoiceNumber} creada correctamente.`);
      setLastInvoice(invoice);
      setCart([]);
      setAmountReceived('');
      await queryClient.invalidateQueries({ queryKey: ['invoices'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      await queryClient.invalidateQueries({ queryKey: ['products'] });
      await queryClient.invalidateQueries({ queryKey: ['inventory-movements'] });
      await queryClient.invalidateQueries({ queryKey: ['cash-movements'] });
      await queryClient.invalidateQueries({ queryKey: ['employee-logs'] });
      await invalidateCashQueries();
      toast.dismiss();
      router.push(`/invoices/${invoice.id}/print?autoPrint=1`);
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : 'No se pudo completar la venta.');
      toast.error(error instanceof Error ? error.message : 'No se pudo completar la venta.');
    },
  });

  if (!session) {
    return <SessionRequired session={session} />;
  }

  async function invalidateCashQueries() {
    await queryClient.invalidateQueries({ queryKey: ['cash-session-current'] });
    await queryClient.invalidateQueries({ queryKey: ['cash-sessions'] });
    await queryClient.invalidateQueries({ queryKey: ['cash-movements'] });
    await queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
  }

  function addProduct(product: Product) {
    const currentQuantity = quantitiesByProduct[product.id] ?? 0;

    if (!canAddProduct(product, currentQuantity)) {
      setMessage(`No hay stock disponible para ${product.name}.`);
      return;
    }

    setMessage(null);
    setLastInvoice(null);
    setCart((current) => {
      const existing = current.find((item) => item.product.id === product.id);

      if (existing) {
        return current.map((item) =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }

      return [...current, { product, quantity: 1 }];
    });
  }

  function updateQuantity(productId: string, quantity: number) {
    setCart((current) =>
      current
        .map((item) => {
          if (item.product.id !== productId) {
            return item;
          }

          const nextQuantity = item.product.trackInventory
            ? Math.min(quantity, item.product.stock)
            : quantity;

          return { ...item, quantity: nextQuantity };
        })
        .filter((item) => item.quantity > 0),
    );
  }

  function enableScanner() {
    setScannerEnabled(true);
    setScannerMessage('Lector activo. Escanea con pistola USB o usa camara si el navegador lo soporta.');
    window.setTimeout(() => barcodeInputRef.current?.focus(), 0);
  }

  function disableScanner() {
    setScannerEnabled(false);
    setScannerMessage(null);
    stopCameraScan();
  }

  async function startCameraScan() {
    setScannerEnabled(true);
    setScannerMessage(null);

    const detectorConstructor = (window as WindowWithBarcodeDetector).BarcodeDetector;
    if (!detectorConstructor || !navigator.mediaDevices?.getUserMedia) {
      setScannerMessage('Camara QR no disponible en este navegador. Usa el lector USB o escribe el codigo.');
      barcodeInputRef.current?.focus();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      setCameraActive(true);

      if (!videoRef.current) {
        return;
      }

      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      const detector = new detectorConstructor({
        formats: ['qr_code', 'code_128', 'ean_13', 'upc_a'],
      });

      const scan = async () => {
        if (!videoRef.current || !streamRef.current) {
          return;
        }

        try {
          const results = await detector.detect(videoRef.current);
          const value = results[0]?.rawValue;
          if (value) {
            setBarcode(value);
            stopCameraScan();
            barcodeMutation.mutate(value);
            return;
          }
        } catch {
          setScannerMessage('No pude leer el codigo todavia. Manten el codigo frente a la camara.');
        }

        scanFrameRef.current = window.requestAnimationFrame(scan);
      };

      scanFrameRef.current = window.requestAnimationFrame(scan);
    } catch {
      setScannerMessage('No se pudo activar la camara. Puedes usar el lector USB o escribir el codigo.');
      barcodeInputRef.current?.focus();
    }
  }

  function stopCameraScan() {
    if (scanFrameRef.current) {
      window.cancelAnimationFrame(scanFrameRef.current);
      scanFrameRef.current = null;
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraActive(false);
  }

  return (
    <div className="space-y-5">
      <ModuleHeader
        title="Caja"
        description="Ventas rapidas, lector de codigos, cobro y cierre de Ferreteria RIVNU."
      />

      <CashStatusHeader
        sessionName={session.user.name}
        isOpen={Boolean(currentCashSession)}
        registerName={currentCashSession?.cashRegister.name}
        openedAt={currentCashSession?.openedAt}
        openingAmount={currentCashSession?.openingAmount}
      />

      {!canUsePos ? (
        <Card>
          <CardHeader>
            <CardTitle>Caja bloqueada</CardTitle>
            <CardDescription>Tu usuario no tiene permiso para operar esta caja.</CardDescription>
          </CardHeader>
        </Card>
      ) : !currentCashSession ? (
        <ClosedCashPanel
          registers={registersQuery.data ?? []}
          selectedRegisterId={selectedRegisterId}
          openingAmount={openingAmount}
          canOpenCashSession={canOpenCashSession}
          isOpening={openSessionMutation.isPending}
          message={message}
          occupiedBy={selectedRegisterOccupied ? selectedOpenSession?.openedBy?.name ?? 'otro cajero' : null}
          onRegisterChange={setSelectedRegisterId}
          onOpeningAmountChange={setOpeningAmount}
          onOpen={() => openSessionMutation.mutate()}
        />
      ) : (
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(24rem,0.8fr)] xl:items-start">
          <div className="space-y-4">
            <Card className="border-zinc-200 bg-zinc-50">
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle>Productos</CardTitle>
                    <CardDescription>Busca por tipo, proveedor, nombre, SKU o codigo.</CardDescription>
                  </div>
                  {lastScannedProduct ? (
                    <Badge variant="success">Ultimo escaneo: {lastScannedProduct.name}</Badge>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <BarcodeInput
                  barcode={barcode}
                  scannerEnabled={scannerEnabled}
                  cameraActive={cameraActive}
                  scannerMessage={scannerMessage}
                  barcodeInputRef={barcodeInputRef}
                  videoRef={videoRef}
                  isPending={barcodeMutation.isPending}
                  onBarcodeChange={setBarcode}
                  onSubmit={(code) => barcodeMutation.mutate(code)}
                  onEnableScanner={enableScanner}
                  onDisableScanner={disableScanner}
                  onStartCamera={startCameraScan}
                />

                <div className="grid gap-3 md:grid-cols-[1.2fr_0.9fr_0.9fr]">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      className="bg-white pl-9"
                      placeholder="Buscar producto"
                    />
                  </div>
                  <select
                    value={categoryFilter}
                    onChange={(event) => setCategoryFilter(event.target.value)}
                    className="h-10 rounded-md border border-input bg-white px-3 text-sm"
                  >
                    <option value="ALL">Todos los tipos</option>
                    {categories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                  <select
                    value={brandFilter}
                    onChange={(event) => setBrandFilter(event.target.value)}
                    className="h-10 rounded-md border border-input bg-white px-3 text-sm"
                  >
                    <option value="ALL">Marca/proveedor</option>
                    {brands.map((brand) => (
                      <option key={brand} value={brand}>
                        {brand}
                      </option>
                    ))}
                  </select>
                </div>
              </CardContent>
            </Card>

            <PosProductGrid
              products={filteredProducts}
              quantitiesByProduct={quantitiesByProduct}
              isLoading={productsQuery.isLoading}
              onAddProduct={addProduct}
            />
          </div>

          <div className="space-y-3 xl:sticky xl:top-24">
            <PosCart items={cart} onUpdateQuantity={updateQuantity} onClear={() => setCart([])} />
            <PosPaymentPanel
              customers={activeCustomers}
              customerId={customerId}
              documentType={documentType}
              paymentMethod={paymentMethod}
              amountReceived={amountReceived}
              totals={totals}
              message={message}
              lastInvoice={lastInvoice}
              canCompleteSale={canCompleteSale}
              isCompleting={completeSaleMutation.isPending}
              onCustomerChange={setCustomerId}
              onDocumentTypeChange={setDocumentType}
              onPaymentMethodChange={setPaymentMethod}
              onAmountReceivedChange={setAmountReceived}
              onCompleteSale={() => completeSaleMutation.mutate()}
            />

            <CloseCashPanel
              canCloseCashSession={canCloseCashSession}
              cartHasItems={cart.length > 0}
              closingAmount={closingAmount}
              isClosing={closeSessionMutation.isPending}
              onClosingAmountChange={setClosingAmount}
              onClose={(event) => {
                event.preventDefault();
                closeSessionMutation.mutate();
              }}
            />
          </div>
        </section>
      )}
    </div>
  );
}

function CashStatusHeader({
  sessionName,
  isOpen,
  registerName,
  openedAt,
  openingAmount,
}: {
  sessionName: string;
  isOpen: boolean;
  registerName?: string;
  openedAt?: string;
  openingAmount?: string | number | null;
}) {
  return (
    <div className="grid gap-3 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm lg:grid-cols-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#f36c10]/10 text-[#f36c10]">
          <Store className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Estado</p>
          <p className="font-semibold">{isOpen ? 'Caja abierta' : 'Caja cerrada'}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-5 w-5 text-zinc-500" />
        <div>
          <p className="text-xs text-muted-foreground">Cajero</p>
          <p className="font-semibold">{sessionName}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <CalendarClock className="h-5 w-5 text-zinc-500" />
        <div>
          <p className="text-xs text-muted-foreground">Apertura</p>
          <p className="font-semibold">{openedAt ? formatDate(openedAt) : 'Pendiente'}</p>
        </div>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Caja / monto inicial</p>
        <p className="font-semibold">
          {registerName ?? 'Sin caja'} - {formatCurrency(Number(openingAmount ?? 0))}
        </p>
      </div>
    </div>
  );
}

function ClosedCashPanel({
  registers,
  selectedRegisterId,
  openingAmount,
  canOpenCashSession,
  isOpening,
  message,
  occupiedBy,
  onRegisterChange,
  onOpeningAmountChange,
  onOpen,
}: {
  registers: Array<{ id: string; name: string; status: string }>;
  selectedRegisterId: string;
  openingAmount: string;
  canOpenCashSession: boolean;
  isOpening: boolean;
  message: string | null;
  occupiedBy: string | null;
  onRegisterChange: (value: string) => void;
  onOpeningAmountChange: (value: string) => void;
  onOpen: () => void;
}) {
  return (
    <Card className="overflow-hidden border-zinc-200">
      <div className="grid lg:grid-cols-[0.85fr_1.15fr]">
        <div className="bg-zinc-950 p-6 text-white">
          <Badge variant="warning">Caja cerrada</Badge>
          <h2 className="mt-4 text-2xl font-bold">Para iniciar ventas debes abrir una sesion de caja.</h2>
          <p className="mt-3 text-sm leading-6 text-zinc-300">
            Declara el fondo inicial, selecciona la caja fisica y el sistema registrara la apertura, el
            movimiento de caja y la actividad del empleado.
          </p>
        </div>
        <CardContent className="p-6">
          <form
            className="grid gap-4 md:grid-cols-[1fr_1fr_auto]"
            onSubmit={(event) => {
              event.preventDefault();
              onOpen();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="cashRegister">Caja</Label>
              <select
                id="cashRegister"
                value={selectedRegisterId}
                onChange={(event) => onRegisterChange(event.target.value)}
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                required
              >
                {registers.map((register) => (
                  <option key={register.id} value={register.id}>
                    {register.name}
                  </option>
                ))}
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
                onChange={(event) => onOpeningAmountChange(event.target.value)}
                required
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={!selectedRegisterId || isOpening || !canOpenCashSession || Boolean(occupiedBy)}>
                <DoorOpen className="h-4 w-4" />
                Abrir caja
              </Button>
            </div>
          </form>
          {!canOpenCashSession ? (
            <p className="mt-3 text-sm text-danger">Tu usuario no tiene permiso para abrir caja.</p>
          ) : null}
          {occupiedBy ? (
            <p className="mt-3 rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">
              Esta caja ya esta abierta por {occupiedBy}. Cierra esa sesion o selecciona otra caja.
            </p>
          ) : null}
          {message ? <p className="mt-3 text-sm text-muted-foreground">{message}</p> : null}
        </CardContent>
      </div>
    </Card>
  );
}

function CloseCashPanel({
  canCloseCashSession,
  cartHasItems,
  closingAmount,
  isClosing,
  onClosingAmountChange,
  onClose,
}: {
  canCloseCashSession: boolean;
  cartHasItems: boolean;
  closingAmount: string;
  isClosing: boolean;
  onClosingAmountChange: (value: string) => void;
  onClose: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className="rounded-md border border-zinc-200 bg-white p-3 shadow-sm" onSubmit={onClose}>
      <Label htmlFor="closingAmount">Cierre de caja</Label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <Input
          id="closingAmount"
          type="number"
          min="0"
          step="0.01"
          value={closingAmount}
          onChange={(event) => onClosingAmountChange(event.target.value)}
          placeholder="Monto contado"
          required
        />
        <Button type="submit" variant="outline" disabled={!canCloseCashSession || isClosing || cartHasItems}>
          <DoorClosed className="h-4 w-4" />
          Cerrar
        </Button>
      </div>
      {cartHasItems ? <p className="mt-2 text-xs text-muted-foreground">Limpia o factura el carrito antes de cerrar.</p> : null}
      {!canCloseCashSession ? <p className="mt-2 text-xs text-danger">Sin permiso para cerrar caja.</p> : null}
    </form>
  );
}
