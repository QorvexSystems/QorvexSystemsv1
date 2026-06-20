import type { Product } from '@/lib/api';

export function getProductPrice(product: Product) {
  const salePrice = Number(product.salePrice);
  return salePrice > 0 ? salePrice : Number(product.price);
}

export function uniqueValues(values: string[]) {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
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

  return product.stock > currentQuantity;
}
