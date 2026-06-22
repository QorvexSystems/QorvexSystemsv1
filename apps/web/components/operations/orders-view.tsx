'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardCheck, Search, Send, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  cancelSalesOrder,
  createSalesOrder,
  getCustomers,
  getOrderProductByBarcode,
  getSalesOrders,
  searchOrderProducts,
  type Product,
  type SalesOrder,
} from '@/lib/api';
import { canTakeOrders } from '@/lib/authorization';
import { getStatusVariant, translateStatus } from '@/lib/display-labels';
import { formatCurrency, formatDate } from '@/lib/utils';
import { ModuleHeader } from './module-header';
import { BarcodeInput } from './pos/barcode-input';
import { PosCart } from './pos/pos-cart';
import { PosProductGrid } from './pos/pos-product-grid';
import { canAddProduct, getAvailableStock, getProductPrice, uniqueValues } from './pos/pos-utils';
import { playScanFeedback } from './pos/scan-feedback';
import type { CartItem } from './pos/types';
import { SessionRequired, useCurrentSession } from './session-required';

type BarcodeDetectorResult = { rawValue: string };
type BarcodeDetectorInstance = {
  detect(source: HTMLVideoElement): Promise<BarcodeDetectorResult[]>;
};
type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorInstance;
type WindowWithBarcodeDetector = Window & typeof globalThis & { BarcodeDetector?: BarcodeDetectorConstructor };

export function OrdersView() {
  const session = useCurrentSession();
  const queryClient = useQueryClient();
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanFrameRef = useRef<number | null>(null);

  const [customerId, setCustomerId] = useState('');
  const [notes, setNotes] = useState('');
  const [barcode, setBarcode] = useState('');
  const [scannerEnabled, setScannerEnabled] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [scannerMessage, setScannerMessage] = useState<string | null>(null);
  const [lastScannedProduct, setLastScannedProduct] = useState<Product | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [brandFilter, setBrandFilter] = useState('ALL');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const customersQuery = useQuery({
    queryKey: ['order-customers', session?.tenantId],
    queryFn: () => getCustomers(session?.tenantId ?? '', session?.accessToken ?? ''),
    enabled: Boolean(session),
  });
  const productsQuery = useQuery({
    queryKey: ['order-products-search', session?.tenantId, search],
    queryFn: () => searchOrderProducts(session?.tenantId ?? '', session?.accessToken ?? '', search || 'RIV'),
    enabled: Boolean(session),
  });
  const pendingOrdersQuery = useQuery({
    queryKey: ['sales-orders', session?.tenantId, 'OPEN'],
    queryFn: () => getSalesOrders(session?.tenantId ?? '', session?.accessToken ?? '', 'OPEN'),
    enabled: Boolean(session),
  });

  useEffect(() => {
    if (scannerEnabled) {
      barcodeInputRef.current?.focus();
    }
  }, [scannerEnabled]);

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
  const totals = useMemo(() => {
    const subtotal = cart.reduce((sum, item) => sum + getProductPrice(item.product) * item.quantity, 0);
    const tax = cart.reduce(
      (sum, item) => sum + getProductPrice(item.product) * item.quantity * Number(item.product.taxRate),
      0,
    );

    return {
      subtotal,
      tax,
      total: subtotal + tax,
    };
  }, [cart]);

  const barcodeMutation = useMutation({
    mutationFn: (code: string) => {
      if (!session) {
        throw new Error('Sesion requerida.');
      }

      return getOrderProductByBarcode(session.tenantId, session.accessToken, code);
    },
    onSuccess: (product) => {
      const added = addProduct(product);
      setBarcode('');
      if (added) {
        playScanFeedback('success');
        setLastScannedProduct(product);
        setScannerMessage(`Producto agregado: ${product.name}`);
        toast.success('Producto agregado', { description: product.name });
      } else {
        playScanFeedback('error');
      }
    },
    onError: () => {
      setBarcode('');
      playScanFeedback('error');
      setScannerMessage('Producto no encontrado.');
      toast.error('Producto no encontrado.');
    },
  });

  const createOrderMutation = useMutation({
    mutationFn: () => {
      if (!session) {
        throw new Error('Sesion requerida.');
      }

      return createSalesOrder(session.tenantId, session.accessToken, {
        customerId: customerId || undefined,
        notes: notes.trim() || undefined,
        items: cart.map((item) => ({
          productId: item.product.id,
          quantity: item.quantity,
        })),
      });
    },
    onSuccess: async (order) => {
      setMessage(`Ticket pendiente ${order.orderNumber} enviado a caja. No es una factura fiscal.`);
      setCart([]);
      setNotes('');
      setCustomerId('');
      await queryClient.invalidateQueries({ queryKey: ['sales-orders'] });
      toast.success('Ticket enviado a caja', { description: order.orderNumber });
    },
    onError: (error) => {
      const nextMessage = error instanceof Error ? error.message : 'No se pudo enviar la orden.';
      setMessage(nextMessage);
      toast.error(nextMessage);
    },
  });

  const cancelOrderMutation = useMutation({
    mutationFn: ({ orderId, reason }: { orderId: string; reason?: string }) => {
      if (!session) {
        throw new Error('Sesion requerida.');
      }

      return cancelSalesOrder(session.tenantId, session.accessToken, orderId, reason);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['sales-orders'] });
      toast.success('Orden cancelada.');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'No se pudo cancelar la orden.');
    },
  });

  if (!session) {
    return <SessionRequired session={session} />;
  }

  if (!canTakeOrders(session)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Toma de ordenes bloqueada</CardTitle>
          <CardDescription>Tu usuario no tiene permiso para crear ordenes.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  function addProduct(product: Product) {
    const currentQuantity = quantitiesByProduct[product.id] ?? 0;

    if (!canAddProduct(product, currentQuantity)) {
      setMessage(`No hay stock disponible para ${product.name}.`);
      return false;
    }

    setMessage(null);
    setCart((current) => {
      const existing = current.find((item) => item.product.id === product.id);

      if (existing) {
        return current.map((item) =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }

      return [...current, { product, quantity: 1 }];
    });

    return true;
  }

  function updateQuantity(productId: string, quantity: number) {
    setCart((current) =>
      current
        .map((item) => {
          if (item.product.id !== productId) {
            return item;
          }

          const availableStock = getAvailableStock(item.product);
          const nextQuantity = item.product.trackInventory
            ? Math.min(quantity, availableStock)
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
        title="Toma de ordenes"
        description="Modo escaner para crear tickets pendientes. La factura se emite solamente cuando caja cobra."
      />

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
                keepFocus
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
          <Card>
            <CardHeader>
              <CardTitle>Enviar a caja</CardTitle>
              <CardDescription>
                Esto crea una preventa/ticket pendiente para caja. No emite factura fiscal.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  createOrderMutation.mutate();
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="orderCustomer">Cliente</Label>
                  <select
                    id="orderCustomer"
                    value={customerId}
                    onChange={(event) => setCustomerId(event.target.value)}
                    className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm"
                  >
                    <option value="">Consumidor final</option>
                    {activeCustomers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="orderNotes">Notas</Label>
                  <textarea
                    id="orderNotes"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    className="min-h-20 w-full rounded-md border border-input bg-white px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    maxLength={500}
                    placeholder="Referencia del cliente o comentario interno"
                  />
                </div>

                <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <strong>{formatCurrency(totals.subtotal)}</strong>
                  </div>
                  <div className="mt-2 flex justify-between">
                    <span>ITBIS</span>
                    <strong>{formatCurrency(totals.tax)}</strong>
                  </div>
                  <div className="mt-3 flex justify-between border-t border-zinc-200 pt-3 text-base">
                    <span>Total</span>
                    <strong>{formatCurrency(totals.total)}</strong>
                  </div>
                </div>

                {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}

                <Button
                  type="submit"
                  className="h-14 w-full bg-[#f36c10] text-base text-white hover:bg-[#d85f0e]"
                  disabled={!cart.length || createOrderMutation.isPending}
                >
                  <Send className="h-5 w-5" />
                  Enviar a caja
                </Button>
              </form>
            </CardContent>
          </Card>

          <PendingOrdersPanel
            orders={pendingOrdersQuery.data ?? []}
            loading={pendingOrdersQuery.isLoading}
            cancellingId={cancelOrderMutation.variables?.orderId}
            onCancel={(orderId) => {
              const reason = window.prompt('Motivo de cancelacion de la orden');
              if (reason === null) {
                return;
              }
              cancelOrderMutation.mutate({ orderId, reason: reason.trim() || undefined });
            }}
          />
        </div>
      </section>
    </div>
  );
}

function PendingOrdersPanel({
  orders,
  loading,
  cancellingId,
  onCancel,
}: {
  orders: SalesOrder[];
  loading: boolean;
  cancellingId?: string;
  onCancel: (orderId: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Tickets en caja</CardTitle>
        <CardDescription>Preventas pendientes de cobro. Aun no son facturas.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <p className="rounded-md bg-zinc-50 px-3 py-2 text-sm text-muted-foreground">Cargando ordenes...</p>
        ) : orders.length ? (
          orders.map((order) => (
            <div key={order.id} className="rounded-md border border-zinc-200 bg-white p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-zinc-950">{order.orderNumber}</p>
                    <Badge variant={getStatusVariant(order.status)}>{translateStatus(order.status)}</Badge>
                    <Badge variant={getWaitingVariant(order)}>{getWaitingMinutes(order)} min</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {order.customer?.name ?? 'Consumidor final'} - {formatDate(order.sentToCashierAt ?? order.createdAt)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">Creada por {order.createdBy.name}</p>
                  {order.claimedBy ? (
                    <p className="mt-1 text-xs text-warning">
                      Tomada por {order.claimedBy.name}
                      {order.claimedCashSession?.cashRegister.name
                        ? ` en ${order.claimedCashSession.cashRegister.name}`
                        : ''}
                    </p>
                  ) : null}
                </div>
                <p className="shrink-0 text-sm font-bold">{formatCurrency(Number(order.total))}</p>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">{order.items.length} producto(s)</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onCancel(order.id)}
                  disabled={cancellingId === order.id || order.status === 'IN_CASHIER'}
                >
                  <X className="h-4 w-4" />
                  Cancelar
                </Button>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-md border border-dashed border-zinc-300 bg-zinc-50 p-4 text-center">
            <ClipboardCheck className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">No hay tickets pendientes.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function getWaitingMinutes(order: SalesOrder) {
  const startedAt = new Date(order.sentToCashierAt ?? order.createdAt).getTime();
  return Math.max(Math.floor((Date.now() - startedAt) / 60000), 0);
}

function getWaitingVariant(order: SalesOrder) {
  const minutes = getWaitingMinutes(order);

  if (minutes >= 30) {
    return 'danger' as const;
  }

  if (minutes >= 10) {
    return 'warning' as const;
  }

  return 'outline' as const;
}
