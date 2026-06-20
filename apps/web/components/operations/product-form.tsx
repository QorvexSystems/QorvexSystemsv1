'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { FormEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createProduct, getProduct, updateProduct } from '@/lib/api';
import { ModuleHeader } from './module-header';
import { BarcodeCameraScanner } from './barcode-camera-scanner';
import { SessionRequired, useCurrentSession } from './session-required';

type ProductFormState = {
  name: string;
  sku: string;
  barcode: string;
  imageUrl: string;
  brand: string;
  unit: string;
  price: string;
  cost: string;
  taxRate: string;
  stock: string;
  minStock: string;
  status: string;
  trackInventory: boolean;
};

const defaultState: ProductFormState = {
  name: '',
  sku: '',
  barcode: '',
  imageUrl: '',
  brand: '',
  unit: 'UNIT',
  price: '0',
  cost: '0',
  taxRate: '0.18',
  stock: '0',
  minStock: '0',
  status: 'ACTIVE',
  trackInventory: true,
};

export function ProductForm({ productId }: { productId?: string }) {
  const session = useCurrentSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<ProductFormState>(defaultState);
  const [loadedProductId, setLoadedProductId] = useState<string | null>(null);
  const [imagePreviewFailed, setImagePreviewFailed] = useState(false);

  const productQuery = useQuery({
    queryKey: ['product', productId, session?.tenantId],
    queryFn: () => getProduct(session?.tenantId ?? '', session?.accessToken ?? '', productId ?? ''),
    enabled: Boolean(session && productId),
  });

  useEffect(() => {
    if (productQuery.data && loadedProductId !== productQuery.data.id) {
      setLoadedProductId(productQuery.data.id);
      setForm({
        name: productQuery.data.name,
        sku: productQuery.data.sku ?? '',
        barcode: productQuery.data.barcode ?? '',
        imageUrl: productQuery.data.imageUrl ?? '',
        brand: productQuery.data.brand ?? '',
        unit: productQuery.data.unit,
        price: productQuery.data.salePrice || productQuery.data.price,
        cost: productQuery.data.cost ?? '0',
        taxRate: productQuery.data.taxRate,
        stock: String(productQuery.data.stock),
        minStock: String(productQuery.data.minStock),
        status: productQuery.data.status,
        trackInventory: productQuery.data.trackInventory,
      });
    }
  }, [loadedProductId, productQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!session) {
        throw new Error('Sesion requerida.');
      }

      const payload = {
        name: form.name,
        sku: form.sku || undefined,
        barcode: form.barcode || undefined,
        imageUrl: form.imageUrl || undefined,
        brand: form.brand || undefined,
        unit: form.unit,
        price: Number(form.price),
        cost: Number(form.cost),
        taxRate: Number(form.taxRate),
        stock: Number(form.stock),
        minStock: Number(form.minStock),
        status: form.status,
        trackInventory: form.trackInventory,
      };

      if (productId) {
        return updateProduct(session.tenantId, session.accessToken, productId, payload);
      }

      return createProduct(session.tenantId, session.accessToken, payload);
    },
    onSuccess: async (product) => {
      await queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Producto guardado', { description: product.name });
      router.push('/products');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar el producto.');
    },
  });

  if (!session) {
    return <SessionRequired session={session} />;
  }

  function updateField<K extends keyof ProductFormState>(key: K, value: ProductFormState[K]) {
    if (key === 'imageUrl') {
      setImagePreviewFailed(false);
    }

    setForm((current) => ({ ...current, [key]: value }));
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    saveMutation.mutate();
  }

  return (
    <div className="space-y-6">
      <ModuleHeader
        title={productId ? 'Editar producto' : 'Nuevo producto'}
        description="Datos persistidos en PostgreSQL para el catalogo operativo de Ferreteria RIVNU."
      />

      <Card>
        <CardHeader>
          <CardTitle>Ficha del producto</CardTitle>
          <CardDescription>Qorvex valida duplicados de SKU y codigo de barras dentro del tenant RIVNU.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-2" onSubmit={onSubmit}>
            <Field label="Nombre">
              <Input value={form.name} onChange={(event) => updateField('name', event.target.value)} required />
            </Field>
            <Field label="SKU">
              <Input value={form.sku} onChange={(event) => updateField('sku', event.target.value)} />
            </Field>
            <Field label="Codigo de barras">
              <div className="space-y-2">
                <Input
                  value={form.barcode}
                  onChange={(event) => updateField('barcode', event.target.value)}
                  placeholder="Escanea con pistola USB o escribe el codigo"
                  autoComplete="off"
                />
                <BarcodeCameraScanner onDetected={(value) => updateField('barcode', value)} />
              </div>
            </Field>
            <Field label="Imagen del producto">
              <div className="space-y-2">
                <Input
                  value={form.imageUrl}
                  onChange={(event) => updateField('imageUrl', event.target.value)}
                  placeholder="/products/tools.svg"
                />
                {form.imageUrl ? (
                  <div className="flex aspect-[4/3] w-full items-center justify-center rounded-md border border-border bg-zinc-50 p-3">
                    {imagePreviewFailed ? (
                      <span className="text-sm text-muted-foreground">No se pudo cargar la imagen.</span>
                    ) : (
                      <img
                        src={form.imageUrl}
                        alt="Vista previa del producto"
                        className="max-h-full max-w-full object-contain"
                        onError={() => setImagePreviewFailed(true)}
                      />
                    )}
                  </div>
                ) : null}
              </div>
            </Field>
            <Field label="Marca">
              <Input value={form.brand} onChange={(event) => updateField('brand', event.target.value)} />
            </Field>
            <Field label="Unidad">
              <select
                value={form.unit}
                onChange={(event) => updateField('unit', event.target.value)}
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
              >
                <option value="UNIT">Unidad</option>
                <option value="BAG">Saco</option>
                <option value="METER">Metro</option>
                <option value="ROLL">Rollo</option>
                <option value="POUND">Libra</option>
                <option value="GALLON">Galon</option>
                <option value="PACK">Paquete</option>
              </select>
            </Field>
            <Field label="Estado">
              <select
                value={form.status}
                onChange={(event) => updateField('status', event.target.value)}
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
              >
                <option value="ACTIVE">Activo</option>
                <option value="INACTIVE">Inactivo</option>
                <option value="DISCONTINUED">Descontinuado</option>
              </select>
            </Field>
            <Field label="Precio">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.price}
                onChange={(event) => updateField('price', event.target.value)}
              />
            </Field>
            <Field label="Costo">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.cost}
                onChange={(event) => updateField('cost', event.target.value)}
              />
            </Field>
            <Field label="ITBIS">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.taxRate}
                onChange={(event) => updateField('taxRate', event.target.value)}
              />
            </Field>
            <Field label="Stock actual">
              <Input
                type="number"
                min="0"
                value={form.stock}
                onChange={(event) => updateField('stock', event.target.value)}
              />
            </Field>
            <Field label="Stock minimo">
              <Input
                type="number"
                min="0"
                value={form.minStock}
                onChange={(event) => updateField('minStock', event.target.value)}
              />
            </Field>
            <label className="flex items-center gap-2 pt-7 text-sm font-medium">
              <input
                type="checkbox"
                checked={form.trackInventory}
                onChange={(event) => updateField('trackInventory', event.target.checked)}
              />
              Controlar inventario
            </label>
            <div className="md:col-span-2">
              <Button type="submit" disabled={saveMutation.isPending}>
                <Save className="h-4 w-4" />
                Guardar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
