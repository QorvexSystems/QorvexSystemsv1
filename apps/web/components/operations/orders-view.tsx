'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardCheck, FileText, Search, Send, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
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
  getSalesOrder,
  getSalesOrders,
  searchOrderProducts,
  updateSalesOrder,
  type Product,
  type SalesOrder,
} from '@/lib/api';
import { canTakeOrders, isAdminSession } from '@/lib/authorization';
import { getStatusVariant, translateStatus } from '@/lib/display-labels';
import {
  normalizeDominicanDocument,
  validateDominicanCedula,
  validateDominicanRnc,
} from '@/lib/dominican-documents';
import { getOrderClientLabel, getOrderSearchLabel } from '@/lib/order-client';
import { formatCurrency, formatDate } from '@/lib/utils';
import { CancelReasonModal } from './cancel-reason-modal';
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
type WindowWithBarcodeDetector = Window &
  typeof globalThis & { BarcodeDetector?: BarcodeDetectorConstructor };

type OrderDestination = 'CASH_SALE' | 'QUOTATION';

export function OrdersView() {
  const session = useCurrentSession();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const editOrderId = searchParams.get('edit');
  const router = useRouter();
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanFrameRef = useRef<number | null>(null);
  const loadedEditOrderRef = useRef<string | null>(null);
  const editToastShownRef = useRef<string | null>(null);

  const [destination, setDestination] = useState<OrderDestination>('CASH_SALE');
  const [clientName, setClientName] = useState('');
  const [quotationDocumentType, setQuotationDocumentType] = useState<'RNC' | 'CEDULA'>('CEDULA');
  const [quotationDocumentNumber, setQuotationDocumentNumber] = useState('');
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
  const [loadedEditOrderId, setLoadedEditOrderId] = useState<string | null>(null);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null);
  const [cancelTargetLabel, setCancelTargetLabel] = useState('');
  const [cancelReason, setCancelReason] = useState('');

  const customersQuery = useQuery({
    queryKey: ['order-customers', session?.tenantId],
    queryFn: () => getCustomers(session?.tenantId ?? '', session?.accessToken ?? ''),
    enabled: Boolean(session),
  });
  const productsQuery = useQuery({
    queryKey: ['order-products-search', session?.tenantId, search],
    queryFn: () =>
      searchOrderProducts(session?.tenantId ?? '', session?.accessToken ?? '', search || 'RIV'),
    enabled: Boolean(session),
  });
  const pendingOrdersQuery = useQuery({
    queryKey: ['sales-orders', session?.tenantId, 'OPEN'],
    queryFn: () => getSalesOrders(session?.tenantId ?? '', session?.accessToken ?? '', 'OPEN'),
    enabled: Boolean(session),
  });
  const quotationsQuery = useQuery({
    queryKey: ['sales-orders', session?.tenantId, 'QUOTATION'],
    queryFn: () => getSalesOrders(session?.tenantId ?? '', session?.accessToken ?? '', 'QUOTATION'),
    enabled: Boolean(session),
  });

  useEffect(() => {
    if (scannerEnabled) {
      barcodeInputRef.current?.focus();
    }
  }, [scannerEnabled]);

  useEffect(() => () => stopCameraScan(), []);

  // Cargar orden para edición si está el parámetro 'edit'
  useEffect(() => {
    if (!editOrderId) {
      loadedEditOrderRef.current = null;
      editToastShownRef.current = null;
      return;
    }

    if (
      !session ||
      loadedEditOrderRef.current === editOrderId ||
      loadedEditOrderId === editOrderId
    ) {
      return;
    }

    let active = true;
    loadedEditOrderRef.current = editOrderId;

    async function loadOrder() {
      try {
        const order = await getSalesOrder(session!.tenantId, session!.accessToken, editOrderId!);
        if (!active) return;

        if (order.status !== 'QUOTATION') {
          toast.error('Solo se pueden modificar cotizaciones.');
          loadedEditOrderRef.current = null;
          router.replace('/orders');
          return;
        }

        // Cargar datos
        setDestination('QUOTATION');
        setClientName(order.clientName || '');
        setCustomerId(order.customerId || '');
        setNotes(order.notes || '');
        if (order.quotationDocumentType === 'RNC' || order.quotationDocumentType === 'CEDULA') {
          setQuotationDocumentType(order.quotationDocumentType);
        }
        setQuotationDocumentNumber(order.quotationDocumentNumber || '');

        // Cargar productos en el carrito
        const cartItems = order.items.map((item) => ({
          product: {
            ...item.product!,
            price: item.unitPrice,
            taxRate: item.taxRate,
          } as Product,
          quantity: Number(item.quantity),
        }));

        setCart(cartItems);
        setLoadedEditOrderId(editOrderId);
        loadedEditOrderRef.current = null;

        if (editToastShownRef.current !== editOrderId) {
          editToastShownRef.current = editOrderId;
          toast.info(`Editando cotizacion: ${order.orderNumber}`);
        }
      } catch (err) {
        if (!active) return;
        loadedEditOrderRef.current = null;
        toast.error('No se pudo cargar la cotizacion para editar.');
        router.replace('/orders');
      }
    }

    loadOrder();

    return () => {
      active = false;
      if (loadedEditOrderRef.current === editOrderId && loadedEditOrderId !== editOrderId) {
        loadedEditOrderRef.current = null;
      }
    };
  }, [editOrderId, session, router, loadedEditOrderId]);

  const activeCustomers = (customersQuery.data ?? []).filter(
    (customer) => customer.status === 'ACTIVE',
  );
  const productPool = productsQuery.data ?? [];
  const categories = uniqueValues(
    productPool
      .map((product) => product.category?.name)
      .filter((value): value is string => Boolean(value)),
  );
  const brands = uniqueValues(
    productPool.map((product) => product.brand).filter((value): value is string => Boolean(value)),
  );
  const filteredProducts = productPool
    .filter((product) => categoryFilter === 'ALL' || product.category?.name === categoryFilter)
    .filter((product) => brandFilter === 'ALL' || product.brand === brandFilter);
  const quantitiesByProduct = Object.fromEntries(
    cart.map((item) => [item.product.id, item.quantity]),
  );
  const totals = useMemo(() => {
    const subtotal = cart.reduce(
      (sum, item) => sum + getProductPrice(item.product) * item.quantity,
      0,
    );
    const tax = cart.reduce(
      (sum, item) =>
        sum + getProductPrice(item.product) * item.quantity * Number(item.product.taxRate),
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

      const trimmedClientName = clientName.trim();
      if (!trimmedClientName) {
        throw new Error('El nombre del cliente es requerido.');
      }

      if (destination === 'QUOTATION') {
        const normalizedDocument = normalizeDominicanDocument(quotationDocumentNumber);
        const isValidDocument =
          quotationDocumentType === 'RNC'
            ? validateDominicanRnc(normalizedDocument)
            : validateDominicanCedula(normalizedDocument);

        if (!normalizedDocument) {
          throw new Error('El numero de documento es requerido para cotizaciones.');
        }

        if (!isValidDocument) {
          throw new Error(
            quotationDocumentType === 'RNC' ? 'El RNC no es valido.' : 'La cedula no es valida.',
          );
        }
      }

      const payload = {
        destination,
        clientName: trimmedClientName,
        customerId: customerId || undefined,
        quotationDocumentType: destination === 'QUOTATION' ? quotationDocumentType : undefined,
        quotationDocumentNumber:
          destination === 'QUOTATION'
            ? normalizeDominicanDocument(quotationDocumentNumber)
            : undefined,
        notes: notes.trim() || undefined,
        items: cart.map((item) => ({
          productId: item.product.id,
          quantity: item.quantity,
        })),
      };

      if (editOrderId) {
        return updateSalesOrder(session.tenantId, session.accessToken, editOrderId, payload);
      }

      return createSalesOrder(session.tenantId, session.accessToken, payload);
    },
    onSuccess: async (order) => {
      const successMessage = editOrderId
        ? `Cotizacion ${order.orderNumber} actualizada correctamente.`
        : destination === 'QUOTATION'
          ? `Cotizacion ${order.orderNumber} registrada correctamente.`
          : `Ticket pendiente ${order.orderNumber} enviado a caja. No es una factura fiscal.`;
      setMessage(successMessage);
      setCart([]);
      setNotes('');
      setCustomerId('');
      setClientName('');
      setQuotationDocumentNumber('');
      setLoadedEditOrderId(null);
      loadedEditOrderRef.current = editOrderId ? editOrderId : null;
      editToastShownRef.current = null;
      await queryClient.invalidateQueries({ queryKey: ['sales-orders'] });
      toast.success(
        editOrderId
          ? 'Cotizacion actualizada'
          : destination === 'QUOTATION'
            ? 'Cotizacion creada'
            : 'Ticket enviado a caja',
        { description: order.orderNumber },
      );

      if (editOrderId) {
        router.push('/quotations');
      }
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
    setScannerMessage(
      'Lector activo. Escanea con pistola USB o usa camara si el navegador lo soporta.',
    );
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
      setScannerMessage(
        'Camara QR no disponible en este navegador. Usa el lector USB o escribe el codigo.',
      );
      barcodeInputRef.current?.focus();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
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
      setScannerMessage(
        'No se pudo activar la camara. Puedes usar el lector USB o escribir el codigo.',
      );
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
                  <CardDescription>
                    Busca por tipo, proveedor, nombre, SKU o codigo.
                  </CardDescription>
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
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle>
                    {editOrderId
                      ? 'Modificar cotizacion'
                      : destination === 'QUOTATION'
                        ? 'Registrar cotizacion'
                        : 'Enviar a caja'}
                  </CardTitle>
                  <CardDescription>
                    {editOrderId
                      ? 'Actualiza los productos o datos de la cotización existente.'
                      : destination === 'QUOTATION'
                        ? 'Genera una cotizacion sin enviarla a caja ni emitir factura.'
                        : 'Esto crea una preventa/ticket pendiente para caja. No emite factura fiscal.'}
                  </CardDescription>
                </div>
                {editOrderId ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-danger hover:bg-danger/5 hover:text-danger"
                    onClick={() => {
                      setCart([]);
                      setNotes('');
                      setCustomerId('');
                      setClientName('');
                      setQuotationDocumentNumber('');
                      setLoadedEditOrderId(null);
                      loadedEditOrderRef.current = editOrderId;
                      editToastShownRef.current = null;
                      router.replace('/orders');
                    }}
                  >
                    Cancelar edicion
                  </Button>
                ) : null}
              </div>
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
                  <Label>Destino de la orden</Label>
                  <div className="grid grid-cols-2 gap-2 rounded-md border border-zinc-200 bg-white p-1">
                    <button
                      type="button"
                      className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                        destination === 'CASH_SALE'
                          ? 'bg-[#f36c10] text-white shadow-sm'
                          : 'text-zinc-600 hover:bg-zinc-50'
                      }`}
                      onClick={() => setDestination('CASH_SALE')}
                    >
                      Venta de caja
                    </button>
                    <button
                      type="button"
                      className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                        destination === 'QUOTATION'
                          ? 'bg-[#f36c10] text-white shadow-sm'
                          : 'text-zinc-600 hover:bg-zinc-50'
                      }`}
                      onClick={() => setDestination('QUOTATION')}
                    >
                      Cotizacion
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="orderClientName">
                    Nombre del cliente <span className="text-danger">*</span>
                  </Label>
                  <Input
                    id="orderClientName"
                    value={clientName}
                    onChange={(event) => setClientName(event.target.value)}
                    placeholder="Nombre del cliente"
                    required
                  />
                </div>

                {destination === 'QUOTATION' ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="quotationDocumentType">Tipo de documento</Label>
                      <select
                        id="quotationDocumentType"
                        value={quotationDocumentType}
                        onChange={(event) =>
                          setQuotationDocumentType(event.target.value as 'RNC' | 'CEDULA')
                        }
                        className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm"
                      >
                        <option value="CEDULA">Cedula</option>
                        <option value="RNC">RNC</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="quotationDocumentNumber">
                        Numero de documento <span className="text-danger">*</span>
                      </Label>
                      <Input
                        id="quotationDocumentNumber"
                        value={quotationDocumentNumber}
                        onChange={(event) => setQuotationDocumentNumber(event.target.value)}
                        placeholder={quotationDocumentType === 'RNC' ? '123456789' : '00123456789'}
                        inputMode="numeric"
                        required
                      />
                    </div>
                  </>
                ) : null}

                <div className="space-y-2">
                  <Label htmlFor="orderCustomer">Cliente registrado (opcional)</Label>
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
                  {editOrderId ? (
                    <>
                      <FileText className="h-5 w-5" />
                      Actualizar cotizacion
                    </>
                  ) : destination === 'QUOTATION' ? (
                    <>
                      <FileText className="h-5 w-5" />
                      Guardar cotizacion
                    </>
                  ) : (
                    <>
                      <Send className="h-5 w-5" />
                      Enviar a caja
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          {destination === 'CASH_SALE' ? (
            <PendingOrdersPanel
              orders={pendingOrdersQuery.data ?? []}
              loading={pendingOrdersQuery.isLoading}
              cancellingId={cancelOrderMutation.variables?.orderId}
              onCancel={(order) => {
                setCancelTargetId(order.id);
                setCancelTargetLabel(order.orderNumber);
                setCancelReason('');
                setCancelModalOpen(true);
              }}
            />
          ) : null}

          <QuotationsPanel
            orders={quotationsQuery.data ?? []}
            loading={quotationsQuery.isLoading}
            showManagement={Boolean(isAdminSession(session) || canTakeOrders(session))}
            cancellingId={cancelOrderMutation.variables?.orderId}
            onCancel={(order) => {
              setCancelTargetId(order.id);
              setCancelTargetLabel(order.orderNumber);
              setCancelReason('');
              setCancelModalOpen(true);
            }}
          />
        </div>
      </section>

      <CancelReasonModal
        open={cancelModalOpen}
        title="Cancelar orden o cotizacion"
        description={
          cancelTargetLabel
            ? `Indica por que se cancela ${cancelTargetLabel}.`
            : 'Indica por que se cancela esta orden o cotizacion.'
        }
        reason={cancelReason}
        isPending={cancelOrderMutation.isPending}
        onReasonChange={setCancelReason}
        onClose={() => {
          setCancelModalOpen(false);
          setCancelTargetId(null);
          setCancelTargetLabel('');
          setCancelReason('');
        }}
        onConfirm={() => {
          const trimmedReason = cancelReason.trim();
          if (!trimmedReason) {
            toast.error('El motivo de cancelacion es requerido.');
            return;
          }
          if (cancelTargetId) {
            cancelOrderMutation.mutate({ orderId: cancelTargetId, reason: trimmedReason });
          }
          setCancelModalOpen(false);
          setCancelTargetId(null);
          setCancelTargetLabel('');
          setCancelReason('');
        }}
      />
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
  onCancel: (order: SalesOrder) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Tickets en caja</CardTitle>
        <CardDescription>Preventas pendientes de cobro. Aun no son facturas.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <p className="rounded-md bg-zinc-50 px-3 py-2 text-sm text-muted-foreground">
            Cargando ordenes...
          </p>
        ) : orders.length ? (
          orders.map((order) => (
            <div key={order.id} className="rounded-md border border-zinc-200 bg-white p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-zinc-950">{order.orderNumber}</p>
                    <Badge variant={getStatusVariant(order.status)}>
                      {translateStatus(order.status)}
                    </Badge>
                    <Badge variant={getWaitingVariant(order)}>{getWaitingMinutes(order)} min</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {getOrderSearchLabel(order)} -{' '}
                    {formatDate(order.sentToCashierAt ?? order.createdAt)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Creada por {order.createdBy.name}
                  </p>
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
                  onClick={() => onCancel(order)}
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

function QuotationsPanel({
  orders,
  loading,
  showManagement,
  cancellingId,
  onCancel,
}: {
  orders: SalesOrder[];
  loading: boolean;
  showManagement: boolean;
  cancellingId?: string;
  onCancel: (order: SalesOrder) => void;
}) {
  if (!showManagement) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cotizaciones</CardTitle>
        <CardDescription>
          Cotizaciones registradas sin cobro. Puedes imprimirlas o cancelarlas si aplica.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <p className="rounded-md bg-zinc-50 px-3 py-2 text-sm text-muted-foreground">
            Cargando cotizaciones...
          </p>
        ) : orders.length ? (
          orders.map((order) => (
            <div key={order.id} className="rounded-md border border-zinc-200 bg-white p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-zinc-950">{getOrderSearchLabel(order)}</p>
                    <Badge variant={getStatusVariant(order.status)}>
                      {translateStatus(order.status)}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Cliente: {getOrderClientLabel(order)}
                  </p>
                  {order.quotationDocumentType && order.quotationDocumentNumber ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {order.quotationDocumentType}: {order.quotationDocumentNumber}
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Creada por {order.createdBy.name} - {formatDate(order.createdAt)}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-bold">{formatCurrency(Number(order.total))}</p>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">{order.items.length} producto(s)</p>
                <div className="flex items-center gap-2">
                  <Button asChild type="button" variant="outline" size="sm">
                    <Link href={`/orders/${order.id}/print`}>Ver / imprimir</Link>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onCancel(order)}
                    disabled={cancellingId === order.id}
                  >
                    <X className="h-4 w-4" />
                    Cancelar
                  </Button>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-md border border-dashed border-zinc-300 bg-zinc-50 p-4 text-center">
            <FileText className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">No hay cotizaciones registradas.</p>
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
