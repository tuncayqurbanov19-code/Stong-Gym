import { DailyReport, DebtRecord, Expense, Product, PurchaseIntake, Sale } from '../types';

export interface PaymentBreakdown {
  cash: number;
  card: number;
  pos: number;
  debt: number;
  balance: number;
  total: number;
}

export interface ProductSaleCount {
  productId: string;
  productName: string;
  quantity: number;
  revenue: number;
}

export interface CategoryProductStat {
  productId: string;
  productName: string;
  quantity: number;
  revenue: number;
  unitPrice: number;
  percentageOfCategory: number;
}

export interface CategoryBreakdownItem {
  categoryName: string;
  revenue: number;
  quantity: number;
  totalRevenue: number;
  totalQuantity: number;
  percentageOfTotal: number;
  products: CategoryProductStat[];
}

export interface CategorySalesSummary {
  totalRevenue: number;
  totalQuantity: number;
  categories: CategoryBreakdownItem[];
}

export interface DiscrepancyResult {
  dailyReportTotal: number;
  salesTotal: number;
  difference: number;
  isMatching: boolean;
  message: string;
}

export interface CustomerDebtCheck {
  hasDebt: boolean;
  debtorName: string;
  totalRemainingDebt: number;
  unpaidDebtCount: number;
  warningMessage: string;
}

/**
 * Calculates payment breakdown for a list of sales
 */
export function calculatePaymentBreakdown(sales: Sale[]): PaymentBreakdown {
  const result: PaymentBreakdown = {
    cash: 0,
    card: 0,
    pos: 0,
    debt: 0,
    balance: 0,
    total: 0,
  };

  for (const sale of sales) {
    const amount = Number(sale.totalAmount) || 0;
    result.total += amount;
    switch (sale.paymentType) {
      case 'naqd':
        result.cash += amount;
        break;
      case 'kart':
        result.card += amount;
        break;
      case 'pos':
        result.pos += amount;
        break;
      case 'borc':
        result.debt += amount;
        break;
      case 'balans':
        result.balance += amount;
        break;
    }
  }

  return result;
}

/**
 * Calculates category breakdown and product level details for given sales
 * (e.g. Su: 14.80 AZN (68%) / 12 pcs, with detailed products list inside)
 */
export function calculateCategoryBreakdown(
  sales: Sale[],
  products: Product[]
): CategorySalesSummary {
  const prodMap = new Map<string, Product>();
  for (const p of products) {
    prodMap.set(p.id, p);
  }

  let totalRevenue = 0;
  let totalQuantity = 0;

  const categoryMap: Record<
    string,
    {
      categoryName: string;
      revenue: number;
      quantity: number;
      products: Record<
        string,
        {
          productId: string;
          productName: string;
          quantity: number;
          revenue: number;
          unitPrice: number;
        }
      >;
    }
  > = {};

  for (const sale of sales) {
    if (!sale.isConfirmed) continue;
    for (const item of sale.items) {
      const prod = prodMap.get(item.productId);
      const category = (prod?.category?.trim() || 'Digər');
      const itemQty = Number(item.quantity) || 0;
      const itemRev = Number(item.totalPrice) || 0;

      totalRevenue += itemRev;
      totalQuantity += itemQty;

      if (!categoryMap[category]) {
        categoryMap[category] = {
          categoryName: category,
          revenue: 0,
          quantity: 0,
          products: {},
        };
      }

      categoryMap[category].revenue += itemRev;
      categoryMap[category].quantity += itemQty;

      if (!categoryMap[category].products[item.productId]) {
        categoryMap[category].products[item.productId] = {
          productId: item.productId,
          productName: item.productName || prod?.name || 'Məhsul',
          quantity: 0,
          revenue: 0,
          unitPrice: Number(item.unitPrice) || prod?.salePrice || 0,
        };
      }

      categoryMap[category].products[item.productId].quantity += itemQty;
      categoryMap[category].products[item.productId].revenue += itemRev;
    }
  }

  const categories: CategoryBreakdownItem[] = Object.values(categoryMap)
    .map(cat => {
      const catRevenue = Math.round(cat.revenue * 100) / 100;
      const percentageOfTotal =
        totalRevenue > 0 ? Math.round((catRevenue / totalRevenue) * 1000) / 10 : 0;

      const prods: CategoryProductStat[] = Object.values(cat.products)
        .map(p => ({
          ...p,
          revenue: Math.round(p.revenue * 100) / 100,
          percentageOfCategory:
            catRevenue > 0 ? Math.round((p.revenue / catRevenue) * 1000) / 10 : 0,
        }))
        .sort((a, b) => b.revenue - a.revenue);

      return {
        categoryName: cat.categoryName,
        revenue: catRevenue,
        quantity: cat.quantity,
        totalRevenue: catRevenue,
        totalQuantity: cat.quantity,
        percentageOfTotal,
        products: prods,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  return {
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    totalQuantity,
    categories,
  };
}

/**
 * Calculates product sale counts for given sales (e.g., today's sales or month's sales)
 */
export function calculateProductSaleCounts(sales: Sale[]): ProductSaleCount[] {
  const map: Record<string, ProductSaleCount> = {};

  for (const sale of sales) {
    for (const item of sale.items) {
      if (!map[item.productId]) {
        map[item.productId] = {
          productId: item.productId,
          productName: item.productName,
          quantity: 0,
          revenue: 0,
        };
      }
      map[item.productId].quantity += Number(item.quantity) || 0;
      map[item.productId].revenue += Number(item.totalPrice) || 0;
    }
  }

  return Object.values(map).sort((a, b) => b.quantity - a.quantity);
}

/**
 * Calculates net profit: Gəlir - Mal alışı - Xərclər
 */
export function calculateNetProfit(
  totalRevenue: number,
  totalGoodsPurchases: number,
  totalExpenses: number
): {
  totalRevenue: number;
  totalGoodsPurchases: number;
  totalExpenses: number;
  netProfit: number;
} {
  const rev = Number(totalRevenue) || 0;
  const purchases = Number(totalGoodsPurchases) || 0;
  const exp = Number(totalExpenses) || 0;
  const net = rev - purchases - exp;

  return {
    totalRevenue: rev,
    totalGoodsPurchases: purchases,
    totalExpenses: exp,
    netProfit: net,
  };
}

/**
 * Checks discrepancy between daily report and sales for a given date
 */
export function checkDailyReportDiscrepancy(
  dailyReport: DailyReport | undefined,
  salesForDay: Sale[]
): DiscrepancyResult {
  const salesTotal = salesForDay
    .filter(s => s.isConfirmed)
    .reduce((sum, s) => sum + (Number(s.totalAmount) || 0), 0);

  const reportTotal = dailyReport ? Number(dailyReport.totalAmount) || 0 : 0;
  const diff = Math.round((reportTotal - salesTotal) * 100) / 100;
  const isMatching = Math.abs(diff) < 0.01;

  let message = 'Uyğundur';
  if (!isMatching) {
    const diffText = diff > 0 ? `+${diff.toFixed(2)} AZN artıq` : `${diff.toFixed(2)} AZN əskik`;
    message = `Fərq var – yoxlayın (${diffText})`;
  }

  return {
    dailyReportTotal: reportTotal,
    salesTotal,
    difference: diff,
    isMatching,
    message,
  };
}

/**
 * Checks if a customer already has existing unpaid debt
 */
export function checkCustomerDebt(
  customerName: string,
  debts: DebtRecord[]
): CustomerDebtCheck {
  const trimmed = customerName.trim().toLowerCase();
  if (!trimmed) {
    return {
      hasDebt: false,
      debtorName: customerName,
      totalRemainingDebt: 0,
      unpaidDebtCount: 0,
      warningMessage: '',
    };
  }

  const customerDebts = debts.filter(d => {
    if (d.status !== 'borcdadir' || Number(d.remainingAmount) <= 0) return false;
    const dName = d.debtorName.trim().toLowerCase();
    const dWords = dName.split(/\s+/);
    const inputWords = trimmed.split(/\s+/);
    return (
      dName === trimmed ||
      dName.startsWith(trimmed) ||
      trimmed.startsWith(dName) ||
      dWords.some(w => w === trimmed || (trimmed.length >= 3 && w.startsWith(trimmed))) ||
      inputWords.some(w => w === dName || (dName.length >= 3 && dName.startsWith(w)))
    );
  });

  const totalRemainingDebt = customerDebts.reduce(
    (sum, d) => sum + (Number(d.remainingAmount) || 0),
    0
  );

  const hasDebt = totalRemainingDebt > 0;
  const formattedDebt = totalRemainingDebt.toFixed(2);
  const properName = customerDebts[0]?.debtorName || customerName.trim();

  return {
    hasDebt,
    debtorName: properName,
    totalRemainingDebt,
    unpaidDebtCount: customerDebts.length,
    warningMessage: hasDebt
      ? `${properName} adlı müştərinin ${formattedDebt} AZN borcu var idi!`
      : '',
  };
}

/**
 * Calculates debt overview: total remaining debt and unique debtor count
 */
export function calculateDebtOverview(debts: DebtRecord[]): {
  totalRemainingDebt: number;
  totalDebtorsCount: number;
  unpaidDebtorsCount: number;
} {
  const unpaidDebts = debts.filter(
    d => d.status === 'borcdadir' && Number(d.remainingAmount) > 0
  );

  const totalRemainingDebt = unpaidDebts.reduce(
    (sum, d) => sum + (Number(d.remainingAmount) || 0),
    0
  );

  const uniqueUnpaid = new Set(
    unpaidDebts.map(d => d.debtorName.trim().toLowerCase())
  );
  const allUnique = new Set(
    debts.map(d => d.debtorName.trim().toLowerCase())
  );

  return {
    totalRemainingDebt,
    totalDebtorsCount: allUnique.size,
    unpaidDebtorsCount: uniqueUnpaid.size,
  };
}
