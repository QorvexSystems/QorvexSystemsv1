'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Barcode, Pencil, Plus, Printer, Search, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { deleteProduct, generateProductBarcode, getProductLabel, getProducts } from '@/lib/api';
import { getStatusVariant, translateBarcodeType, translateStatus } from '@/lib/display-labels';
import { formatCurrency } from '@/lib/utils';
import { ModuleHeader } from './module-header';
import { formatQuantity } from './pos/pos-utils';
import { SessionRequired, useCurrentSession } from './session-required';

export function ProductsView() {
  const session = useCurrentSession();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');

  useEffect(() => {
    const query = new URLSearchParams(window.location.search).get('q');
    if (query) {
      setSearch(query);
    }
  }, []);

  const productsQuery = useQuery({
    queryKey: ['products', session?.tenantId, search],
    queryFn: () => getProducts(session?.tenantId ?? '', session?.accessToken ?? '', search),
    enabled: Boolean(session),
  });
  const generateMutation = useMutation({
    mutationFn: (productId: string) => {
      if (!session) {
        throw new Error('Sesion requerida.');
      }

      return generateProductBarcode(session.tenantId, session.accessToken, productId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Codigo generado correctamente.');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'No se pudo generar el codigo.');
    },
  });
  const labelMutation = useMutation({
    mutationFn: (productId: string) => {
      if (!session) {
        throw new Error('Sesion requerida.');
      }

      return getProductLabel(session.tenantId, session.accessToken, productId);
    },
    onSuccess: (label) => {
      toast.success('Etiqueta lista para imprimir', {
        description: `${label.name} - ${label.barcode}`,
      });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'No se pudo preparar la etiqueta.');
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (productId: string) => {
      if (!session) {
        throw new Error('Sesion requerida.');
      }

      return deleteProduct(session.tenantId, session.accessToken, productId);
    },
    onSuccess: async (product) => {
      await queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Producto desactivado', { description: product.name });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'No se pudo desactivar el producto.');
    },
  });

  if (!session) {
    return <SessionRequired session={session} />;
  }

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Productos"
        description="Catalogo de productos/servicios de Ferreteria RIVNU, precios e inventario desde PostgreSQL."
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="bg-white pl-9"
            placeholder="Buscar nombre, SKU, marca o codigo"
          />
        </div>
        <Button asChild>
          <Link href="/products/new">
            <Plus className="h-4 w-4" />
            Nuevo producto
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Catalogo</CardTitle>
          <CardDescription>{productsQuery.data?.length ?? 0} productos activos o inactivos.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 md:hidden">
            {(productsQuery.data ?? []).map((product) => {
              const availableStock = getAvailableStock(product);
              const lowStock = product.trackInventory && availableStock <= Number(product.minStock);
              return (
                <div key={product.id} className="rounded-md border border-border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{product.name}</p>
                      <p className="text-xs text-muted-foreground">{product.sku ?? 'Sin SKU'}</p>
                    </div>
                    <Badge variant={getStatusVariant(product.status)}>{translateStatus(product.status)}</Badge>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                    <span className="font-semibold">{formatCurrency(Number(product.price))}</span>
                    {product.trackInventory ? (
                      <Badge variant={lowStock ? 'danger' : 'success'}>
                        {formatQuantity(availableStock)} disp. /{' '}
                        {formatQuantity(product.reservedStock)} res.
                      </Badge>
                    ) : (
                      <Badge variant="outline">Servicio</Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="hidden md:block">
            <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Precio</TableHead>
                <TableHead>Codigo</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(productsQuery.data ?? []).map((product) => {
                const availableStock = getAvailableStock(product);
                const lowStock = product.trackInventory && availableStock <= Number(product.minStock);
                return (
                  <TableRow key={product.id}>
                    <TableCell>
                      <div className="font-medium">{product.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {product.sku ?? 'Sin SKU'} {product.brand ? `- ${product.brand}` : ''}
                      </div>
                    </TableCell>
                    <TableCell>{product.category?.name ?? 'Sin categoria'}</TableCell>
                    <TableCell>{formatCurrency(Number(product.price))}</TableCell>
                    <TableCell>
                      <div className="text-sm">{product.barcode ?? 'Sin codigo'}</div>
                      <div className="text-xs text-muted-foreground">{translateBarcodeType(product.barcodeType)}</div>
                    </TableCell>
                    <TableCell>
                      {product.trackInventory ? (
                        <div>
                          <Badge variant={lowStock ? 'danger' : 'success'}>
                            {formatQuantity(availableStock)} disp. /{' '}
                            {formatQuantity(product.reservedStock)} res.
                          </Badge>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Total {formatQuantity(product.stock)} / min{' '}
                            {formatQuantity(product.minStock)}
                          </p>
                        </div>
                      ) : (
                        <Badge variant="outline">Servicio</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusVariant(product.status)}>{translateStatus(product.status)}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {!product.barcode ? (
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => generateMutation.mutate(product.id)}
                            aria-label="Generar codigo de barras"
                          >
                            <Barcode className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => labelMutation.mutate(product.id)}
                            aria-label="Imprimir etiqueta"
                          >
                            <Printer className="h-4 w-4" />
                          </Button>
                        )}
                        <Button asChild variant="ghost" size="icon">
                          <Link href={`/products/${product.id}/edit`} aria-label="Editar producto">
                            <Pencil className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={deleteMutation.isPending}
                          onClick={() => {
                            if (window.confirm(`Desactivar ${product.name}?`)) {
                              deleteMutation.mutate(product.id);
                            }
                          }}
                          aria-label="Desactivar producto"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function getAvailableStock(product: { stock: number | string; reservedStock: number | string }) {
  return Math.max(Number(product.stock) - Number(product.reservedStock), 0);
}
