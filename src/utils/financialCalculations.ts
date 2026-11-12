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
  unitPrice?: number;
  totalQuantity?: number;
  totalRevenue?: number;
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

export interface FinancialMetricsSummary {
  startDate: string;
  endDate: string;
  // Satışlar (Gəlir tərəfi)
  grossSalesTotal: number;      // Ümumi satış məbləği (Nağd + Kart + POS + Balans + Borc)
  salesCount: number;
  cashSales: number;            // Nağd satış məbləği
  cardSales: number;            // Kartla satış məbləği
  posSales: number;             // POS/Köçürmə satış məbləği
  balanceSales: number;         // Müştəri depozit balansından satış (kassaya yeni pul girmir)
  creditSales: number;          // Borcla satış məbləği (kassaya əlavə edilmir!)
  salesRealInflow: number;      // Satışdan faktiki kassaya girən (Nağd + Kart + POS)

  // Geri alınan borclar (Ödənilmə tarixinə görə kassaya əlavə olunur)
  debtCollectedTotal: number;   // Seçilmiş dövrdə geri qaytarılan borc məbləği
  debtCollectedCash: number;
  debtCollectedCard: number;
  debtCollectedPos: number;
  debtCollectedCount: number;

  // Kassanın faktiki daxilolmaları (Metod üzrə)
  drawerCashInflow: number;     // cashSales + debtCollectedCash
  drawerCardInflow: number;     // cardSales + debtCollectedCard
  drawerPosInflow: number;      // posSales + debtCollectedPos
  actualDrawerInflow: number;   // Faktiki kassaya daxil olan pul (salesRealInflow + debtCollectedTotal)

  // Çıxan pullar və Xalis Kassa Balansı
  purchasesOutflow: number;     // Mal alışına gedən pul
  expensesOutflow: number;      // Digər xərclər
  totalCashOutflow: number;     // Cəmi çıxan pul
  netCashBalance: number;       // Kassanın faktiki xalis balansı (actualDrawerInflow - totalCashOutflow)

  // Ümumi sistem üzrə ödənilməmiş borclar
  totalUnpaidDebts: number;     // Hal-hazırda ödənilməmiş borcların ümumi qalıq məbləği
}

/**
 * Authoritative financial calculation shared across POS, Daily Report, and Dashboard.
 * Rules:
 * 1. Gross sales include all confirmed sales (including credit/'borc' as revenue).
 * 2. Credit sales ('borc') NEVER enter actual cash drawer inflow when created.
 * 3. Debt collections enter actual cash drawer inflow on the exact `paidAt` date, separated cleanly as `debtCollectedTotal`.
 * 4. Net cash balance = actualDrawerInflow - (purchases + expenses).
 */
export function calculateFinancialMetricsForRange(params: {
  sales: Sale[];
  debts: DebtRecord[];
  purchases?: PurchaseIntake[];
  expenses?: Expense[];
  startDate: string;
  endDate: string;
  includeUnconfirmedSales?: boolean;
}): FinancialMetricsSummary {
  const {
    sales,
    debts,
    purchases = [],
    expenses = [],
    startDate,
    endDate,
    includeUnconfirmedSales = false,
  } = params;

  const filteredSales = sales.filter(
    s =>
      s.date >= startDate &&
      s.date <= endDate &&
      (includeUnconfirmedSales || s.isConfirmed)
  );

  const breakdown = calculatePaymentBreakdown(filteredSales);
  const round2 = (v: number) => Math.round(v * 100) / 100;

  const salesRealInflow = round2(breakdown.cash + breakdown.card + breakdown.pos);

  let debtCollectedCash = 0;
  let debtCollectedCard = 0;
  let debtCollectedPos = 0;
  let debtCollectedCount = 0;

  for (const debt of debts) {
    for (const p of debt.payments || []) {
      const paidDate = (p.paidAt || p.date || '').split('T')[0];
      if (!paidDate || paidDate < startDate || paidDate > endDate) continue;

      const amt = Number(p.amount) || 0;
      if (amt <= 0) continue;

      debtCollectedCount += 1;
      const m = (p.paymentMethod || 'naqd').toLowerCase();
      if (m === 'kart') debtCollectedCard += amt;
      else if (m === 'pos' || m === 'kocurme') debtCollectedPos += amt;
      else debtCollectedCash += amt;
    }
  }

  const debtCollectedTotal = round2(debtCollectedCash + debtCollectedCard + debtCollectedPos);
  const drawerCashInflow = round2(breakdown.cash + debtCollectedCash);
  const drawerCardInflow = round2(breakdown.card + debtCollectedCard);
  const drawerPosInflow = round2(breakdown.pos + debtCollectedPos);
  const actualDrawerInflow = round2(salesRealInflow + debtCollectedTotal);

  const purchasesOutflow = round2(
    purchases
      .filter(p => p.date >= startDate && p.date <= endDate)
      .reduce((sum, p) => sum + (Number(p.paidAmount) || 0), 0)
  );
  const expensesOutflow = round2(
    expenses
      .filter(e => e.date >= startDate && e.date <= endDate)
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
  );
  const totalCashOutflow = round2(purchasesOutflow + expensesOutflow);
  const netCashBalance = round2(actualDrawerInflow - totalCashOutflow);

  const totalUnpaidDebts = round2(
    debts
      .filter(d => (d.status === 'borcdadir' || d.status === 'qismen') && Number(d.remainingAmount) > 0)
      .reduce((sum, d) => sum + (Number(d.remainingAmount) || 0), 0)
  );

  return {
    startDate,
    endDate,
    grossSalesTotal: round2(breakdown.total),
    salesCount: filteredSales.length,
    cashSales: round2(breakdown.cash),
    cardSales: round2(breakdown.card),
    posSales: round2(breakdown.pos),
    balanceSales: round2(breakdown.balance),
    creditSales: round2(breakdown.debt),
    salesRealInflow,
    debtCollectedTotal,
    debtCollectedCash: round2(debtCollectedCash),
    debtCollectedCard: round2(debtCollectedCard),
    debtCollectedPos: round2(debtCollectedPos),
    debtCollectedCount,
    drawerCashInflow,
    drawerCardInflow,
    drawerPosInflow,
    actualDrawerInflow,
    purchasesOutflow,
    expensesOutflow,
    totalCashOutflow,
    netCashBalance,
    totalUnpaidDebts,
  };
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

  return Object.values(map)
    .map(p => ({
      ...p,
      unitPrice: p.quantity > 0 ? Math.round((p.revenue / p.quantity) * 100) / 100 : 0,
      totalQuantity: p.quantity,
      totalRevenue: p.revenue,
    }))
    .sort((a, b) => b.quantity - a.quantity);
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
  isProfit: boolean;
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
    isProfit: net >= 0,
  };
}

/**
 * Checks discrepancy between daily report and sales + collected debt payments for a given date
 */
export function checkDailyReportDiscrepancy(
  dailyReport: DailyReport | undefined,
  salesForDay: Sale[],
  debtPaymentsForDay: DebtRecord['payments'] = []
): DiscrepancyResult {
  const salesTotal = salesForDay
    .filter(s => s.isConfirmed && s.paymentType !== 'borc' && s.paymentType !== 'balans')
    .reduce((sum, s) => sum + (Number(s.totalAmount) || 0), 0);

  const debtCollectedTotal = debtPaymentsForDay.reduce(
    (sum, p) => sum + (Number(p.amount) || 0),
    0
  );

  const expectedDrawerTotal = Math.round((salesTotal + debtCollectedTotal) * 100) / 100;
  const reportTotal = dailyReport ? Number(dailyReport.totalAmount) || 0 : 0;
  const diff = Math.round((reportTotal - expectedDrawerTotal) * 100) / 100;
  const isMatching = Math.abs(diff) < 0.01;

  let message = 'Uyğundur';
  if (!isMatching) {
    const diffText = diff > 0 ? `+${diff.toFixed(2)} ₼ artıq` : `${diff.toFixed(2)} ₼ əskik`;
    message = `Fərq var – yoxlayın (${diffText})`;
  }

  return {
    dailyReportTotal: reportTotal,
    salesTotal: expectedDrawerTotal,
    difference: diff,
    isMatching,
    message,
  };
}

/**
 * Checks if a customer already has existing unpaid or partially paid debt
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
    if ((d.status !== 'borcdadir' && d.status !== 'qismen') || Number(d.remainingAmount) <= 0) {
      return false;
    }
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
      ? `${properName} adlı müştərinin ${formattedDebt} ₼ borcu var idi!`
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
  debtorCount: number;
  totalPaidDebt: number;
  partialCount: number;
} {
  const unpaidDebts = debts.filter(
    d => (d.status === 'borcdadir' || d.status === 'qismen') && Number(d.remainingAmount) > 0
  );

  const partialCount = debts.filter(d => d.status === 'qismen').length;

  const totalRemainingDebt = unpaidDebts.reduce(
    (sum, d) => sum + (Number(d.remainingAmount) || 0),
    0
  );

  const totalPaidDebt = debts.reduce(
    (sum, d) => sum + (Number(d.paidAmount) || 0),
    0
  );

  const uniqueUnpaid = new Set(
    unpaidDebts.map(d => d.debtorName.trim().toLowerCase())
  );
  const allUnique = new Set(
    debts.map(d => d.debtorName.trim().toLowerCase())
  );

  return {
    totalRemainingDebt: Math.round(totalRemainingDebt * 100) / 100,
    totalDebtorsCount: allUnique.size,
    unpaidDebtorsCount: uniqueUnpaid.size,
    debtorCount: uniqueUnpaid.size,
    totalPaidDebt: Math.round(totalPaidDebt * 100) / 100,
    partialCount,
  };
}

export interface StaffOperationItem {
  id: string;
  kind: 'sale' | 'debt_payment';
  date: string;
  time: string;
  staffUsername: string;
  paymentMethod: 'naqd' | 'kart' | 'pos' | 'balans' | 'borc';
  amount: number;
  description: string;
  customerOrNote?: string;
  badgeText?: string;
}

export interface StaffPaymentRow {
  staffUsername: string;
  staffName: string;
  naqd: number;
  kart: number;
  pos: number;
  balans: number;
  nisye: number;
  salesCount: number;
  debtPaymentsCount: number;
  avgCheck: number;
  salesInflow: number;
  debtInflow: number;
  totalInflow: number;
  operations: StaffOperationItem[];
}

export interface DailyStaffBreakdownSummary {
  rows: StaffPaymentRow[];
  totals: {
    naqd: number;
    kart: number;
    pos: number;
    balans: number;
    nisye: number;
    salesCount: number;
    debtPaymentsCount: number;
    avgCheck: number;
    salesInflow: number;
    debtInflow: number;
    totalInflow: number;
  };
  allOperations: StaffOperationItem[];
}

/**
 * Groups confirmed sales and collected debt payments by responsible staff member
 * and payment method without double counting.
 *
 * No double counting:
 * - Credit sales (`borc`) appear ONLY in `nisye` (not counted in drawer cash/card/pos inflow).
 * - Debt collections (`debt.payments`) appear in `naqd`/`kart`/`pos` & `debtInflow` on their `paidAt` date,
 *   never as duplicate product sales.
 */
export function calculateDailyStaffBreakdown(params: {
  sales: Sale[];
  debts: DebtRecord[];
  staffDisplayMap?: Record<string, string>;
  startDate: string;
  endDate: string;
  staffFilter?: string; // 'all' or username
  paymentFilter?: string; // 'all' | 'naqd' | 'kart' | 'pos' | 'balans' | 'borc'
}): DailyStaffBreakdownSummary {
  const {
    sales,
    debts,
    staffDisplayMap = {},
    startDate,
    endDate,
    staffFilter = 'all',
    paymentFilter = 'all',
  } = params;

  const normalizeStaff = (raw?: string) => (raw || 'admin').trim() || 'admin';
  const normalizedStaffFilter = staffFilter.toLowerCase();

  const rowMap: Record<string, StaffPaymentRow> = {};
  const ensureRow = (username: string): StaffPaymentRow => {
    const key = username.toLowerCase();
    if (!rowMap[key]) {
      rowMap[key] = {
        staffUsername: username,
        staffName: staffDisplayMap[key] || username,
        naqd: 0,
        kart: 0,
        pos: 0,
        balans: 0,
        nisye: 0,
        salesCount: 0,
        debtPaymentsCount: 0,
        avgCheck: 0,
        salesInflow: 0,
        debtInflow: 0,
        totalInflow: 0,
        operations: [],
      };
    }
    return rowMap[key];
  };

  // Track gross sales per staff for average check
  const grossSalesSumByStaff: Record<string, number> = {};

  // 1. Aggregate confirmed sales
  for (const s of sales) {
    if (!s.isConfirmed) continue;
    if (s.date < startDate || s.date > endDate) continue;

    const staffUser = normalizeStaff(s.createdBy);
    if (normalizedStaffFilter !== 'all' && staffUser.toLowerCase() !== normalizedStaffFilter) {
      continue;
    }

    if (paymentFilter !== 'all' && s.paymentType !== paymentFilter) {
      continue;
    }

    const row = ensureRow(staffUser);
    const amt = Number(s.totalAmount) || 0;
    row.salesCount += 1;
    grossSalesSumByStaff[staffUser.toLowerCase()] =
      (grossSalesSumByStaff[staffUser.toLowerCase()] || 0) + amt;

    switch (s.paymentType) {
      case 'naqd':
        row.naqd += amt;
        row.salesInflow += amt;
        break;
      case 'kart':
        row.kart += amt;
        row.salesInflow += amt;
        break;
      case 'pos':
        row.pos += amt;
        row.salesInflow += amt;
        break;
      case 'balans':
        row.balans += amt;
        break;
      case 'borc':
        row.nisye += amt;
        break;
    }

    row.operations.push({
      id: s.id,
      kind: 'sale',
      date: s.date,
      time: s.time || '--:--',
      staffUsername: staffUser,
      paymentMethod: s.paymentType,
      amount: amt,
      description: s.items.map(i => `${i.productName} (${i.quantity}x)`).join(', '),
      customerOrNote: s.debtorName,
      badgeText: s.paymentType === 'borc' ? 'Nisyə satış' : 'Satış',
    });
  }

  // 2. Aggregate collected debt payments (without double counting!)
  for (const debt of debts) {
    for (const p of debt.payments || []) {
      const paidDate = (p.paidAt || p.date || '').split('T')[0];
      if (!paidDate || paidDate < startDate || paidDate > endDate) continue;

      const staffUser = normalizeStaff(p.receivedBy);
      if (normalizedStaffFilter !== 'all' && staffUser.toLowerCase() !== normalizedStaffFilter) {
        continue;
      }

      const rawMethod = (p.paymentMethod || 'naqd').toLowerCase();
      const mappedMethod: 'naqd' | 'kart' | 'pos' =
        rawMethod === 'kart' ? 'kart' : rawMethod === 'pos' || rawMethod === 'kocurme' ? 'pos' : 'naqd';

      if (paymentFilter !== 'all' && mappedMethod !== paymentFilter) {
        continue;
      }

      const row = ensureRow(staffUser);
      const amt = Number(p.amount) || 0;
      row.debtPaymentsCount += 1;
      row.debtInflow += amt;

      if (mappedMethod === 'naqd') row.naqd += amt;
      else if (mappedMethod === 'kart') row.kart += amt;
      else row.pos += amt;

      const timeStr = p.createdAt && p.createdAt.includes('T')
        ? new Date(p.createdAt).toLocaleTimeString('az-AZ', { hour: '2-digit', minute: '2-digit' })
        : '--:--';

      row.operations.push({
        id: p.id,
        kind: 'debt_payment',
        date: paidDate,
        time: timeStr,
        staffUsername: staffUser,
        paymentMethod: mappedMethod,
        amount: amt,
        description: `${debt.debtorName} — ${debt.items.map(i => i.productName).join(', ') || 'Borc'}`,
        customerOrNote: p.note || 'Borc ödənişi',
        badgeText: 'Borc ödənişi (ödənildi)',
      });
    }
  }

  const rows: StaffPaymentRow[] = Object.values(rowMap)
    .map(r => {
      const grossSales = grossSalesSumByStaff[r.staffUsername.toLowerCase()] || 0;
      const totalInflow = Math.round((r.salesInflow + r.debtInflow) * 100) / 100;
      const avgCheck = r.salesCount > 0 ? Math.round((grossSales / r.salesCount) * 100) / 100 : 0;
      const sortedOps = [...r.operations].sort((a, b) => {
        const cmpDate = b.date.localeCompare(a.date);
        if (cmpDate !== 0) return cmpDate;
        return b.time.localeCompare(a.time);
      });

      return {
        ...r,
        naqd: Math.round(r.naqd * 100) / 100,
        kart: Math.round(r.kart * 100) / 100,
        pos: Math.round(r.pos * 100) / 100,
        balans: Math.round(r.balans * 100) / 100,
        nisye: Math.round(r.nisye * 100) / 100,
        salesInflow: Math.round(r.salesInflow * 100) / 100,
        debtInflow: Math.round(r.debtInflow * 100) / 100,
        totalInflow,
        avgCheck,
        operations: sortedOps,
      };
    })
    .sort((a, b) => b.totalInflow - a.totalInflow || a.staffName.localeCompare(b.staffName));

  const totals = rows.reduce(
    (acc, r) => ({
      naqd: acc.naqd + r.naqd,
      kart: acc.kart + r.kart,
      pos: acc.pos + r.pos,
      balans: acc.balans + r.balans,
      nisye: acc.nisye + r.nisye,
      salesCount: acc.salesCount + r.salesCount,
      debtPaymentsCount: acc.debtPaymentsCount + r.debtPaymentsCount,
      avgCheck: 0,
      salesInflow: acc.salesInflow + r.salesInflow,
      debtInflow: acc.debtInflow + r.debtInflow,
      totalInflow: acc.totalInflow + r.totalInflow,
    }),
    {
      naqd: 0,
      kart: 0,
      pos: 0,
      balans: 0,
      nisye: 0,
      salesCount: 0,
      debtPaymentsCount: 0,
      avgCheck: 0,
      salesInflow: 0,
      debtInflow: 0,
      totalInflow: 0,
    }
  );

  const totalGrossSales = Object.values(grossSalesSumByStaff).reduce((s, v) => s + v, 0);
  totals.avgCheck =
    totals.salesCount > 0 ? Math.round((totalGrossSales / totals.salesCount) * 100) / 100 : 0;
  totals.naqd = Math.round(totals.naqd * 100) / 100;
  totals.kart = Math.round(totals.kart * 100) / 100;
  totals.pos = Math.round(totals.pos * 100) / 100;
  totals.balans = Math.round(totals.balans * 100) / 100;
  totals.nisye = Math.round(totals.nisye * 100) / 100;
  totals.salesInflow = Math.round(totals.salesInflow * 100) / 100;
  totals.debtInflow = Math.round(totals.debtInflow * 100) / 100;
  totals.totalInflow = Math.round(totals.totalInflow * 100) / 100;

  const allOperations = rows
    .flatMap(r => r.operations)
    .sort((a, b) => {
      const cmp = b.date.localeCompare(a.date);
      if (cmp !== 0) return cmp;
      return b.time.localeCompare(a.time);
    });

  return { rows, totals, allOperations };
}
