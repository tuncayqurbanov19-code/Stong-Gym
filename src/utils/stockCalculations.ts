import { DepoMovement, Product, PurchaseIntake, Sale } from '../types';

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
 * Active Stock = Initial Stock + Total Purchased - Total Sold (from confirmed sales, balance product withdrawals, and debt sales)
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

  // Sum total sold quantity for this product from confirmed sales AND credit ('borc') sales immediately
  const totalSold = sales
    .filter(s => s.isConfirmed || s.paymentType === 'borc')
    .reduce((sum, s) => {
      const matchingQty = (s.items || [])
        .filter(i => i.productId === product.id)
        .reduce((itemSum, i) => itemSum + (Number(i.quantity) || 0), 0);
      return sum + matchingQty;
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

export interface DepoLedgerSummary {
  movements: DepoMovement[];
  normalSaleOutQty: number;
  balanceProductOutQty: number;
  purchaseInQty: number;
  manualAdjustmentNetDelta: number;
  counts: {
    normal_sale_out: number;
    balance_product_out: number;
    purchase_in: number;
    manual_adjustment: number;
  };
}

/**
 * Builds unified Depo movement history separated into the 4 authoritative categories:
 * 1. Adi satışdan çıxan məhsullar (`normal_sale_out`)
 * 2. Balansdan çıxan məhsullar (`balance_product_out` — 'Müştəri balansından çıxarış')
 * 3. Anbara daxil olan məhsullar (`purchase_in`)
 * 4. Əl ilə edilən depo düzəlişləri (`manual_adjustment`)
 */
export function buildDepoMovementsLedger(params: {
  purchases: PurchaseIntake[];
  sales: Sale[];
  manualAdjustments?: DepoMovement[];
}): DepoLedgerSummary {
  const { purchases, sales, manualAdjustments = [] } = params;
  const movements: DepoMovement[] = [];

  let normalSaleOutQty = 0;
  let balanceProductOutQty = 0;
  let purchaseInQty = 0;
  let manualAdjustmentNetDelta = 0;
  const counts = {
    normal_sale_out: 0,
    balance_product_out: 0,
    purchase_in: 0,
    manual_adjustment: 0,
  };

  // 1 & 2. Outbound movements from confirmed / credit sales
  for (const sale of sales) {
    if (!sale.isConfirmed && sale.paymentType !== 'borc') continue;
    const isBalanceOut = sale.paymentType === 'balans';

    (sale.items || []).forEach((item, idx) => {
      const qty = Math.abs(Number(item.quantity) || 0);
      if (qty <= 0) return;

      const movementType = isBalanceOut ? 'balance_product_out' : 'normal_sale_out';
      if (isBalanceOut) {
        balanceProductOutQty += qty;
        counts.balance_product_out += 1;
      } else {
        normalSaleOutQty += qty;
        counts.normal_sale_out += 1;
      }

      movements.push({
        id: `dm-${sale.id}-${item.productId}-${idx}`,
        movementType,
        productId: item.productId,
        productName: item.productName,
        quantityDelta: -qty,
        unitPrice: Number(item.unitPrice) || 0,
        totalAmount: Number(item.totalPrice) || Math.round((Number(item.unitPrice) || 0) * qty * 100) / 100,
        customerName: sale.debtorName,
        referenceId: sale.id,
        date: sale.date,
        time: sale.time || '00:00',
        sourceLabel: isBalanceOut
          ? 'Müştəri balansından çıxarış'
          : `Adi satış (${sale.paymentType.toUpperCase()})`,
        note: isBalanceOut
          ? `${sale.debtorName ? `${sale.debtorName} · ` : ''}Müştəri balansından çıxarış`
          : sale.debtorName
          ? `Müştəri: ${sale.debtorName}`
          : undefined,
        createdBy: sale.createdBy || 'isci',
        createdAt: sale.createdAt || `${sale.date}T${sale.time || '00:00'}:00.000Z`,
      });
    });
  }

  // 3. Warehouse intakes
  for (const pur of purchases) {
    const qty = Math.abs(Number(pur.quantity) || 0);
    if (qty <= 0) continue;
    purchaseInQty += qty;
    counts.purchase_in += 1;

    movements.push({
      id: `dm-${pur.id}`,
      movementType: 'purchase_in',
      productId: pur.productId,
      productName: pur.productName,
      quantityDelta: qty,
      totalAmount: Number(pur.paidAmount) || 0,
      referenceId: pur.id,
      date: pur.date,
      time: (pur.createdAt || '').slice(11, 16) || '00:00',
      sourceLabel: 'Anbara mal qəbulu',
      note: pur.note,
      createdBy: pur.createdBy || 'admin',
      createdAt: pur.createdAt || `${pur.date}T00:00:00.000Z`,
    });
  }

  // 4. Manual adjustments
  for (const adj of manualAdjustments) {
    if (adj.movementType !== 'manual_adjustment') continue;
    const delta = Number(adj.quantityDelta) || 0;
    manualAdjustmentNetDelta += delta;
    counts.manual_adjustment += 1;

    movements.push({
      ...adj,
      sourceLabel: adj.sourceLabel || 'Əl ilə edilən depo düzəlişi',
    });
  }

  movements.sort((a, b) => {
    const dCmp = b.date.localeCompare(a.date);
    if (dCmp !== 0) return dCmp;
    const tCmp = (b.time || '').localeCompare(a.time || '');
    if (tCmp !== 0) return tCmp;
    return (b.createdAt || '').localeCompare(a.createdAt || '');
  });

  return {
    movements,
    normalSaleOutQty,
    balanceProductOutQty,
    purchaseInQty,
    manualAdjustmentNetDelta,
    counts,
  };
}
