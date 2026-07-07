import type { Product } from '@/lib/api';

const fractionalUnits = new Set(['METER', 'FOOT', 'YARD', 'POUND']);

export function getProductPrice(product: Product) {
  const salePrice = Number(product.salePrice);
  return salePrice > 0 ? salePrice : Number(product.price);
}

export function uniqueValues(values: string[]) {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

export function getAvailableStock(product: Product) {
  return Math.max(Number(product.stock) - Number(product.reservedStock), 0);
}

export function allowsFractionalQuantity(product: Pick<Product, 'unit'>) {
  return fractionalUnits.has(product.unit);
}

export function getQuantityStep(product: Pick<Product, 'unit'>) {
  return allowsFractionalQuantity(product) ? 0.01 : 1;
}

export function getDefaultQuantity(product: Product) {
  if (!product.trackInventory) {
    return 1;
  }

  const availableStock = getAvailableStock(product);

  if (allowsFractionalQuantity(product) && availableStock > 0 && availableStock < 1) {
    return roundQuantity(availableStock);
  }

  return 1;
}

export function roundQuantity(value: number) {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

export function formatQuantity(value: number | string | null | undefined) {
  const numericValue = Number(value ?? 0);

  if (!Number.isFinite(numericValue)) {
    return '0';
  }

  return Number.isInteger(numericValue)
    ? String(numericValue)
    : numericValue.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

export function getProductInitials(product: Product) {
  return product.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('');
}

export function canAddProduct(product: Product, currentQuantity = 0) {
  if (!product.trackInventory) {
    return true;
  }

  return getAvailableStock(product) > currentQuantity;
}
