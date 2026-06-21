import type { Product } from '@/lib/api';

export type CartItem = {
  product: Product;
  quantity: number;
};

export type PosTotals = {
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  change: number;
  received: number;
};
