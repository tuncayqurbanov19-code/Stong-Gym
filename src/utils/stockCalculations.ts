import { Product, PurchaseIntake, Sale } from '../types';

export interface ProductStockInfo {
  product: Product;
  initialStock: number;
  totalPurchased: number;
  totalSold: number;
  activeStock: number;
  isLowStock: boolean;
  minThreshold: number;
}

/**
 * Calculates stock details for a single product.
 * Active Stock = Initial Stock + Total Purchased - Total Sold (from confirmed sales and debt sales)
 */
export function calculateProductStock(
  product: Product,
  purchases: PurchaseIntake[],
  sales: Sale[],
  defaultMinThreshold: number = 5
): ProductStockInfo {
  const minThreshold = product.minStockAlert ?? defaultMinThreshold;

  // Sum total purchased quantity for this product
  const totalPurchased = purchases
    .filter(p => p.productId === product.id)
    .reduce((sum, p) => sum + (Number(p.quantity) || 0), 0);

  // Sum total sold quantity for this product from confirmed sales
  const totalSold = sales
    .filter(s => s.isConfirmed)
    .reduce((sum, s) => {
      const item = s.items.find(i => i.productId === product.id);
      return sum + (item ? Number(item.quantity) || 0 : 0);
    }, 0);

  const initialStock = Number(product.initialStock) || 0;
  const activeStock = initialStock + totalPurchased - totalSold;

  return {
    product,
    initialStock,
    totalPurchased,
    totalSold,
    activeStock,
    isLowStock: activeStock <= minThreshold,
    minThreshold,
  };
}

/**
 * Calculates stock details for all products.
 */
export function calculateAllProductStocks(
  products: Product[],
  purchases: PurchaseIntake[],
  sales: Sale[],
  defaultMinThreshold: number = 5
): Record<string, ProductStockInfo> {
  const result: Record<string, ProductStockInfo> = {};
  for (const product of products) {
    result[product.id] = calculateProductStock(product, purchases, sales, defaultMinThreshold);
  }
  return result;
}

/**
 * Filters out products that have active stock <= threshold.
 */
export function getLowStockProducts(
  products: Product[],
  purchases: PurchaseIntake[],
  sales: Sale[],
  defaultMinThreshold: number = 5
): ProductStockInfo[] {
  const all = calculateAllProductStocks(products, purchases, sales, defaultMinThreshold);
  return Object.values(all).filter(item => item.isLowStock);
}
