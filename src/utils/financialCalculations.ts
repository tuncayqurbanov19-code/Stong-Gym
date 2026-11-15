import { CustomerAccount, DailyReport, DebtRecord, Expense, PaymentType, Product, PurchaseIntake, Sale } from '../types';

export interface PaymentBreakdown {
  cash: number;
  card: number;
  pos: number;
  debt: number;
  balance: number;
  total: number;
}

export interface ResolvedSaleSplit {
  naqd: number;
  kart: number;
  pos: number;
  balans: number;
  borc: number;
}

const round2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;

/**
 * Resolves a sale's amount across the 5 financial channels (naqd, kart, pos, balans, borc),
 * handling legacy single-method sales, mixed ('qarisik') sales, and partial upfront credit sales.
 */
export function resolveSalePaymentSplit(sale: Sale): ResolvedSaleSplit {
  const amt = round2(sale.totalAmount);
  if (sale.paymentSplit) {
    const naqd = round2(sale.paymentSplit.naqd || 0);
    const kart = round2(sale.paymentSplit.kart || 0);
    const pos = round2(sale.paymentSplit.pos || 0);
    const balans = round2(sale.paymentSplit.balans || 0);
    const borc = round2(sale.paymentSplit.borc || 0);
    if (naqd + kart + pos + balans + borc > 0) {
      return { naqd, kart, pos, balans, borc };
    }
  }

  switch (sale.paymentType) {
    case 'naqd':
      return { naqd: amt, kart: 0, pos: 0, balans: 0, borc: 0 };
    case 'kart':
      return { naqd: 0, kart: amt, pos: 0, balans: 0, borc: 0 };
    case 'pos':
      return { naqd: 0, kart: 0, pos: amt, balans: 0, borc: 0 };
    case 'balans':
      return { naqd: 0, kart: 0, pos: 0, balans: amt, borc: 0 };
    case 'borc':
      return { naqd: 0, kart: 0, pos: 0, balans: 0, borc: amt };
    default:
      return { naqd: amt, kart: 0, pos: 0, balans: 0, borc: 0 };
  }
}

export function formatSalePaymentLabel(sale: Sale): string {
  const split = resolveSalePaymentSplit(sale);
  const parts: string[] = [];
  if (split.naqd > 0) parts.push(`${split.naqd.toFixed(2)} ₼ Nağd`);
  if (split.kart > 0) parts.push(`${split.kart.toFixed(2)} ₼ Kart`);
  if (split.pos > 0) parts.push(`${split.pos.toFixed(2)} ₼ POS`);
  if (split.balans > 0) parts.push(`${split.balans.toFixed(2)} ₼ Balans`);
  if (split.borc > 0) parts.push(`${split.borc.toFixed(2)} ₼ Borc`);

  if (parts.length > 1) {
    return `Qarışıq (${parts.join(' + ')})`;
  }
  switch (sale.paymentType) {
    case 'naqd':
      return 'Nağd';
    case 'kart':
      return 'Kart';
    case 'pos':
      return 'POS / Köçürmə';
    case 'balans':
      return 'Müştəri balansı';
    case 'borc':
      return 'Nisyə (Borc)';
    case 'qarisik':
      return parts.length === 1 ? parts[0] : 'Qarışıq';
    default:
      return 'Nağd';
  }
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
 * Calculates payment breakdown for a list of active (non-cancelled) sales
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
    if (sale.isCancelled) continue;
    const split = resolveSalePaymentSplit(sale);
    const amount = round2(sale.totalAmount);
    result.total += amount;
    result.cash += split.naqd;
    result.card += split.kart;
    result.pos += split.pos;
    result.debt += split.borc;
    result.balance += split.balans;
  }

  return {
    cash: round2(result.cash),
    card: round2(result.card),
    pos: round2(result.pos),
    debt: round2(result.debt),
    balance: round2(result.balance),
    total: round2(result.total),
  };
}

export interface FinancialMetricsSummary {
  startDate: string;
  endDate: string;
  // Satışlar (Gəlir tərəfi)
  grossBeforeDiscount: number;  // Endirimdən əvvəlki ümumi satış dəyəri
  totalDiscounts: number;       // Dövrdə verilən endirimlərin cəmi
  grossSalesTotal: number;      // Ümumi yekun satış məbləği (Adi satışlar + Balansdan məhsul çıxarışları)
  normalSalesTotal: number;     // Adi satışlar (Nağd + Kart + POS + Borc)
  salesCount: number;
  normalSalesCount: number;
  balanceProductOutCount: number;
  totalItemsSold: number;       // Satılan ümumi məhsul ədədi
  cashSales: number;            // Nağd satış məbləği
  cardSales: number;            // Kartla satış məbləği
  posSales: number;             // POS/Köçürmə satış məbləği
  balanceSales: number;         // Müştəri balansından məhsul çıxarışı (satış dövriyyəsinə daxildir, kassaya yeni pul girmir)
  creditSales: number;          // Borcla satış məbləği (kassaya əlavə edilmir!)
  salesRealInflow: number;      // Satışdan faktiki kassaya girən (Nağd + Kart + POS)

  // Geri alınan borclar (Ödənilmə tarixinə görə kassaya əlavə olunur)
  debtCollectedTotal: number;   // Seçilmiş dövrdə geri qaytarılan borc məbləği
  debtCollectedCash: number;
  debtCollectedCard: number;
  debtCollectedPos: number;
  debtCollectedCount: number;

  // Müştəri Balansı Hərəkətləri (Depozit & Sərbəst Pul Çıxarışı — Satış deyil!)
  balanceDepositsTotal: number;          // Açılan/artırılan depozit cəmi (satış gəliri deyil)
  balanceCashWithdrawals: number;        // Balansdan sərbəst pul çıxarışı (satış gəliri deyil, kassadan pul çıxışı!)
  balanceCashWithdrawalsCash: number;
  balanceCashWithdrawalsCard: number;
  balanceCashWithdrawalsPos: number;
  balanceCashWithdrawalsCount: number;

  // Kassanın faktiki daxilolmaları (Metod üzrə)
  drawerCashInflow: number;     // cashSales + debtCollectedCash
  drawerCardInflow: number;     // cardSales + debtCollectedCard
  drawerPosInflow: number;      // posSales + debtCollectedPos
  actualDrawerInflow: number;   // Faktiki kassaya daxil olan pul (salesRealInflow + debtCollectedTotal)

  // Çıxan pullar və Xalis Kassa Balansı
  purchasesOutflow: number;     // Mal alışına gedən pul
  expensesOutflow: number;      // Digər xərclər
  totalCashOutflow: number;     // Cəmi çıxan pul (purchases + expenses + balanceCashWithdrawals)
  netCashBalance: number;       // Kassanın faktiki xalis balansı (actualDrawerInflow - totalCashOutflow)

  // Ümumi sistem üzrə ödənilməmiş borclar & ləğv olunmuş satış sayı
  totalUnpaidDebts: number;     // Hal-hazırda ödənilməmiş borcların ümumi qalıq məbləği
  cancelledSalesCount: number;  // Dövrdə ləğv olunmuş satış sayı (tarixçədə qorunur, cəmə daxil edilmir)
}

/**
 * Authoritative financial calculation shared across POS, Daily Report, and Dashboard.
 * Rules:
 * 1. Gross sales include all confirmed non-cancelled sales, balance product withdrawals ('balans'), credit ('borc'), & mixed ('qarisik').
 * 2. Initial balance openings/top-ups ('open', 'deposit') and free cash withdrawals ('withdraw') are NEVER counted as sales revenue.
 * 3. Free cash withdrawals from balance ('withdraw') subtract from Net Cash Balance (`totalCashOutflow` & `netCashBalance`) cleanly.
 * 4. Credit portions ('borc') NEVER enter actual cash drawer inflow when created; upfront partial portions (`naqd`/`kart`/`pos`) DO enter drawer once.
 * 5. Subsequent debt collections (`!p.isUpfront`) enter actual cash drawer inflow on `paidAt` date without double-counting sales revenue.
 * 6. Cancelled sales and cancelled debts are excluded from financial totals while kept in audit history.
 */
export function calculateFinancialMetricsForRange(params: {
  sales: Sale[];
  debts: DebtRecord[];
  purchases?: PurchaseIntake[];
  expenses?: Expense[];
  customerAccounts?: CustomerAccount[];
  startDate: string;
  endDate: string;
  includeUnconfirmedSales?: boolean;
}): FinancialMetricsSummary {
  const {
    sales,
    debts,
    purchases = [],
    expenses = [],
    customerAccounts = [],
    startDate,
    endDate,
    includeUnconfirmedSales = false,
  } = params;

  const cancelledSalesCount = sales.filter(
    s => s.isCancelled && s.date >= startDate && s.date <= endDate
  ).length;

  const filteredSales = sales.filter(
    s =>
      !s.isCancelled &&
      s.date >= startDate &&
      s.date <= endDate &&
      (includeUnconfirmedSales || s.isConfirmed || s.paymentType === 'borc' || (Number(s.paymentSplit?.borc) || 0) > 0)
  );

  const breakdown = calculatePaymentBreakdown(filteredSales);

  let totalDiscounts = 0;
  let totalItemsSold = 0;
  let balanceProductOutCount = 0;
  let normalSalesCount = 0;

  for (const s of filteredSales) {
    totalDiscounts += Number(s.discountAmount) || 0;
    const split = resolveSalePaymentSplit(s);
    if (split.balans > 0) {
      balanceProductOutCount += 1;
    }
    if (split.naqd + split.kart + split.pos + split.borc > 0) {
      normalSalesCount += 1;
    }
    for (const item of s.items || []) {
      totalItemsSold += Number(item.quantity) || 0;
    }
  }
  totalDiscounts = round2(totalDiscounts);
  const grossBeforeDiscount = round2(breakdown.total + totalDiscounts);
  const normalSalesTotal = round2(breakdown.cash + breakdown.card + breakdown.pos + breakdown.debt);
  const salesRealInflow = round2(breakdown.cash + breakdown.card + breakdown.pos);

  let debtCollectedCash = 0;
  let debtCollectedCard = 0;
  let debtCollectedPos = 0;
  let debtCollectedCount = 0;

  for (const debt of debts) {
    if (debt.isCancelled) continue;
    for (const p of debt.payments || []) {
      if (p.isUpfront) continue; // Satış zamanı öndən ödənilən hissə artıq satış daxilolmasında hesablanıb
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

  let balanceDepositsTotal = 0;
  let balanceCashWithdrawalsCash = 0;
  let balanceCashWithdrawalsCard = 0;
  let balanceCashWithdrawalsPos = 0;
  let balanceCashWithdrawalsCount = 0;

  for (const cust of customerAccounts) {
    for (const tx of cust.transactions || []) {
      const txDate = (tx.date || '').split('T')[0];
      if (!txDate || txDate < startDate || txDate > endDate) continue;

      const amt = Number(tx.amount) || 0;
      if (amt <= 0) continue;

      if (tx.type === 'open' || tx.type === 'deposit') {
        balanceDepositsTotal += amt;
      } else if (tx.type === 'withdraw') {
        balanceCashWithdrawalsCount += 1;
        const m = (tx.paymentMethod || 'naqd').toLowerCase();
        if (m === 'kart') balanceCashWithdrawalsCard += amt;
        else if (m === 'pos' || m === 'kocurme') balanceCashWithdrawalsPos += amt;
        else balanceCashWithdrawalsCash += amt;
      }
    }
  }

  const balanceCashWithdrawals = round2(
    balanceCashWithdrawalsCash + balanceCashWithdrawalsCard + balanceCashWithdrawalsPos
  );
  balanceDepositsTotal = round2(balanceDepositsTotal);

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
  const totalCashOutflow = round2(purchasesOutflow + expensesOutflow + balanceCashWithdrawals);
  const netCashBalance = round2(actualDrawerInflow - totalCashOutflow);

  const totalUnpaidDebts = round2(
    debts
      .filter(d => !d.isCancelled && (d.status === 'borcdadir' || d.status === 'qismen') && Number(d.remainingAmount) > 0)
      .reduce((sum, d) => sum + (Number(d.remainingAmount) || 0), 0)
  );

  return {
    startDate,
    endDate,
    grossBeforeDiscount,
    totalDiscounts,
    grossSalesTotal: round2(breakdown.total),
    normalSalesTotal,
    salesCount: filteredSales.length,
    normalSalesCount,
    balanceProductOutCount,
    totalItemsSold,
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
    balanceDepositsTotal,
    balanceCashWithdrawals,
    balanceCashWithdrawalsCash: round2(balanceCashWithdrawalsCash),
    balanceCashWithdrawalsCard: round2(balanceCashWithdrawalsCard),
    balanceCashWithdrawalsPos: round2(balanceCashWithdrawalsPos),
    balanceCashWithdrawalsCount,
    drawerCashInflow,
    drawerCardInflow,
    drawerPosInflow,
    actualDrawerInflow,
    purchasesOutflow,
    expensesOutflow,
    totalCashOutflow,
    netCashBalance,
    totalUnpaidDebts,
    cancelledSalesCount,
  };
}

export interface BalanceProductWithdrawalItem {
  id: string;
  saleId: string;
  customerName: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  date: string;
  time: string;
  createdBy: string;
}

export interface BalanceCashWithdrawalItem {
  id: string;
  customerId: string;
  customerName: string;
  amount: number;
  paymentMethod: string;
  date: string;
  time: string;
  note?: string;
  createdBy: string;
}

/**
 * Extracts itemized product withdrawals from customer balance for Daily Sales Report
 */
export function extractBalanceProductWithdrawals(
  sales: Sale[],
  startDate: string,
  endDate: string
): BalanceProductWithdrawalItem[] {
  const result: BalanceProductWithdrawalItem[] = [];
  for (const s of sales) {
    if (s.isCancelled || !s.isConfirmed) continue;
    if (s.date < startDate || s.date > endDate) continue;
    const split = resolveSalePaymentSplit(s);
    if (split.balans <= 0) continue;

    const ratio = s.totalAmount > 0 ? split.balans / s.totalAmount : 0;
    const subtotal = (s.items || []).reduce((acc, i) => acc + (Number(i.totalPrice) || 0), 0);

    (s.items || []).forEach((item, idx) => {
      const rawTotal = Number(item.totalPrice) || 0;
      const itemAmount =
        ratio >= 0.9999
          ? rawTotal
          : subtotal > 0
          ? round2((rawTotal / subtotal) * split.balans)
          : round2(split.balans);
      const qty = Number(item.quantity) || 0;
      result.push({
        id: `${s.id}-item-${idx}`,
        saleId: s.id,
        customerName: s.debtorName || 'Müştəri',
        productId: item.productId,
        productName: item.productName,
        quantity: ratio >= 0.9999 ? qty : round2(qty * ratio),
        unitPrice: Number(item.unitPrice) || 0,
        totalAmount: itemAmount,
        date: s.date,
        time: s.time || '00:00',
        createdBy: s.createdBy || 'isci',
      });
    });
  }
  return result.sort((a, b) => {
    const dCmp = b.date.localeCompare(a.date);
    if (dCmp !== 0) return dCmp;
    return b.time.localeCompare(a.time);
  });
}

/**
 * Extracts itemized free cash withdrawals from customer balance (NOT sales revenue)
 */
export function extractBalanceCashWithdrawals(
  customerAccounts: CustomerAccount[],
  startDate: string,
  endDate: string
): BalanceCashWithdrawalItem[] {
  const result: BalanceCashWithdrawalItem[] = [];
  for (const cust of customerAccounts) {
    for (const tx of cust.transactions || []) {
      if (tx.type !== 'withdraw') continue;
      const txDate = (tx.date || '').split('T')[0];
      if (!txDate || txDate < startDate || txDate > endDate) continue;

      result.push({
        id: tx.id,
        customerId: cust.id,
        customerName: cust.name,
        amount: Number(tx.amount) || 0,
        paymentMethod: (tx.paymentMethod || 'naqd').toLowerCase(),
        date: txDate,
        time: tx.time || '00:00',
        note: tx.note,
        createdBy: tx.createdBy || 'admin',
      });
    }
  }
  return result.sort((a, b) => {
    const dCmp = b.date.localeCompare(a.date);
    if (dCmp !== 0) return dCmp;
    return b.time.localeCompare(a.time);
  });
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
    if (sale.isCancelled || !sale.isConfirmed) continue;
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
    if (sale.isCancelled || !sale.isConfirmed) continue;
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
    .filter(s => !s.isCancelled && s.isConfirmed)
    .reduce((sum, s) => {
      const split = resolveSalePaymentSplit(s);
      return sum + split.naqd + split.kart + split.pos;
    }, 0);

  const debtCollectedTotal = debtPaymentsForDay
    .filter(p => !p.isUpfront)
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

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
    if (d.isCancelled) return false;
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
  const activeDebts = debts.filter(d => !d.isCancelled);
  const unpaidDebts = activeDebts.filter(
    d => (d.status === 'borcdadir' || d.status === 'qismen') && Number(d.remainingAmount) > 0
  );

  const partialCount = activeDebts.filter(d => d.status === 'qismen').length;

  const totalRemainingDebt = unpaidDebts.reduce(
    (sum, d) => sum + (Number(d.remainingAmount) || 0),
    0
  );

  const totalPaidDebt = activeDebts.reduce(
    (sum, d) => sum + (Number(d.paidAmount) || 0),
    0
  );

  const uniqueUnpaid = new Set(
    unpaidDebts.map(d => d.debtorName.trim().toLowerCase())
  );
  const allUnique = new Set(
    activeDebts.map(d => d.debtorName.trim().toLowerCase())
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

export interface ProductMethodSaleOccurrence {
  saleId: string;
  date: string;
  time: string;
  quantity: number;
  rawQuantity: number;
  unitPrice: number;
  amount: number;
  customerName?: string;
  staffUsername: string;
  staffName: string;
  paymentType: PaymentType;
  isMixed: boolean;
  paymentLabel: string;
}

export interface ProductMethodBreakdownItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  salesCount: number;
  occurrences: ProductMethodSaleOccurrence[];
}

export interface ProductMethodBreakdownSummary {
  paymentMethod: 'all' | 'naqd' | 'kart' | 'pos' | 'borc' | 'balans';
  totalAmount: number;
  totalQuantity: number;
  items: ProductMethodBreakdownItem[];
}

/**
 * Per-payment-method product sales report (e.g. Nağd: Su 5 ədəd 5 AZN, Kofe 3 ədəd 9 AZN)
 * with full drilldown occurrences (time, quantity, customer, staff).
 */
export function calculateProductBreakdownByPaymentMethod(params: {
  sales: Sale[];
  staffDisplayMap?: Record<string, string>;
  paymentMethod: 'all' | 'naqd' | 'kart' | 'pos' | 'borc' | 'balans';
  startDate: string;
  endDate: string;
  productSearch?: string;
  customerSearch?: string;
}): ProductMethodBreakdownSummary {
  const {
    sales,
    staffDisplayMap = {},
    paymentMethod,
    startDate,
    endDate,
    productSearch = '',
    customerSearch = '',
  } = params;

  const prodQuery = productSearch.trim().toLowerCase();
  const custQuery = customerSearch.trim().toLowerCase();
  const productMap: Record<string, ProductMethodBreakdownItem> = {};

  let totalAmount = 0;
  let totalQuantity = 0;

  for (const s of sales) {
    if (s.isCancelled) continue;
    if (!s.isConfirmed && s.paymentType !== 'borc' && !(Number(s.paymentSplit?.borc) > 0)) continue;
    if (s.date < startDate || s.date > endDate) continue;

    if (custQuery && !(s.debtorName || '').toLowerCase().includes(custQuery)) {
      continue;
    }

    const split = resolveSalePaymentSplit(s);
    const channelAmount =
      paymentMethod === 'all' ? round2(s.totalAmount) : round2(split[paymentMethod] || 0);
    if (channelAmount <= 0) continue;

    const saleTotal = round2(s.totalAmount);
    const ratio = saleTotal > 0 ? channelAmount / saleTotal : 0;
    const isMixed =
      s.paymentType === 'qarisik' ||
      [split.naqd, split.kart, split.pos, split.balans, split.borc].filter(v => v > 0).length > 1;

    const itemsSubtotal = (s.items || []).reduce(
      (sum, item) => sum + (Number(item.totalPrice) || (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0)),
      0
    );

    const staffKey = (s.createdBy || 'isci').trim() || 'isci';
    const staffName = staffDisplayMap[staffKey.toLowerCase()] || staffKey;

    for (const item of s.items || []) {
      const pName = (item.productName || 'Məhsul').trim();
      if (prodQuery && !pName.toLowerCase().includes(prodQuery)) continue;

      const rawQty = Number(item.quantity) || 0;
      const unitPrice = Number(item.unitPrice) || 0;
      const rawItemTotal = Number(item.totalPrice) || round2(rawQty * unitPrice);
      const itemAmount =
        ratio >= 0.9999 && itemsSubtotal > 0 && Math.abs(itemsSubtotal - saleTotal) < 0.01
          ? round2(rawItemTotal)
          : itemsSubtotal > 0
          ? round2((rawItemTotal / itemsSubtotal) * channelAmount)
          : round2(channelAmount);

      const allocQty = ratio >= 0.9999 ? rawQty : round2(rawQty * ratio);
      const key = item.productId || pName.toLowerCase();

      if (!productMap[key]) {
        productMap[key] = {
          productId: item.productId || key,
          productName: pName,
          quantity: 0,
          unitPrice,
          totalAmount: 0,
          salesCount: 0,
          occurrences: [],
        };
      }

      productMap[key].quantity = round2(productMap[key].quantity + allocQty);
      productMap[key].totalAmount = round2(productMap[key].totalAmount + itemAmount);
      productMap[key].salesCount += 1;
      productMap[key].occurrences.push({
        saleId: s.id,
        date: s.date,
        time: s.time || '--:--',
        quantity: allocQty,
        rawQuantity: rawQty,
        unitPrice,
        amount: itemAmount,
        customerName: s.debtorName,
        staffUsername: staffKey,
        staffName,
        paymentType: s.paymentType,
        isMixed,
        paymentLabel: formatSalePaymentLabel(s),
      });

      totalAmount = round2(totalAmount + itemAmount);
      totalQuantity = round2(totalQuantity + allocQty);
    }
  }

  const items = Object.values(productMap)
    .map(entry => ({
      ...entry,
      unitPrice: entry.quantity > 0 ? round2(entry.totalAmount / entry.quantity) : entry.unitPrice,
      occurrences: [...entry.occurrences].sort((a, b) => {
        const d = b.date.localeCompare(a.date);
        if (d !== 0) return d;
        return b.time.localeCompare(a.time);
      }),
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount || b.quantity - a.quantity);

  return {
    paymentMethod,
    totalAmount,
    totalQuantity,
    items,
  };
}

export interface StaffOperationItem {
  id: string;
  kind: 'sale' | 'debt_payment';
  date: string;
  time: string;
  staffUsername: string;
  paymentMethod: 'naqd' | 'kart' | 'pos' | 'balans' | 'borc' | 'qarisik';
  amount: number;
  description: string;
  customerOrNote?: string;
  badgeText?: string;
}

export interface StaffSoldProductItem {
  productId: string;
  productName: string;
  quantity: number;
  totalAmount: number;
}

export interface StaffPaymentRow {
  staffUsername: string;
  staffName: string;
  naqd: number;
  kart: number;
  pos: number;
  balans: number;
  nisye: number;
  grossSales: number;
  salesCount: number;
  debtPaymentsCount: number;
  avgCheck: number;
  salesInflow: number;
  debtInflow: number;
  totalInflow: number;
  soldProducts: StaffSoldProductItem[];
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
    grossSales: number;
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
 * Groups confirmed non-cancelled sales (including mixed/split payments) and collected debt payments
 * by responsible staff member and payment method without double counting.
 *
 * No double counting:
 * - Credit portions (`borc`) appear ONLY in `nisye` (never in drawer cash/card/pos inflow).
 * - Upfront partial payments on split credit sales count ONLY via `sale.paymentSplit` in `naqd`/`kart`/`pos`.
 * - Subsequent debt collections (`!p.isUpfront`) appear in `naqd`/`kart`/`pos` & `debtInflow` on their `paidAt` date.
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
  const soldProductMapByStaff: Record<string, Record<string, StaffSoldProductItem>> = {};
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
        grossSales: 0,
        salesCount: 0,
        debtPaymentsCount: 0,
        avgCheck: 0,
        salesInflow: 0,
        debtInflow: 0,
        totalInflow: 0,
        soldProducts: [],
        operations: [],
      };
      soldProductMapByStaff[key] = {};
    }
    return rowMap[key];
  };

  // Track gross sales per staff for average check
  const grossSalesSumByStaff: Record<string, number> = {};

  // 1. Aggregate confirmed non-cancelled sales
  for (const s of sales) {
    if (s.isCancelled) continue;
    if (!s.isConfirmed && s.paymentType !== 'borc' && !(Number(s.paymentSplit?.borc) > 0)) continue;
    if (s.date < startDate || s.date > endDate) continue;

    const staffUser = normalizeStaff(s.createdBy);
    const staffKey = staffUser.toLowerCase();
    if (normalizedStaffFilter !== 'all' && staffKey !== normalizedStaffFilter) {
      continue;
    }

    const split = resolveSalePaymentSplit(s);
    const filteredAmt =
      paymentFilter === 'all'
        ? round2(s.totalAmount)
        : paymentFilter === 'naqd'
        ? split.naqd
        : paymentFilter === 'kart'
        ? split.kart
        : paymentFilter === 'pos'
        ? split.pos
        : paymentFilter === 'balans'
        ? split.balans
        : paymentFilter === 'borc'
        ? split.borc
        : 0;

    if (filteredAmt <= 0) continue;

    const row = ensureRow(staffUser);
    row.salesCount += 1;
    grossSalesSumByStaff[staffKey] = (grossSalesSumByStaff[staffKey] || 0) + filteredAmt;
    row.grossSales += filteredAmt;

    if (paymentFilter === 'all') {
      row.naqd += split.naqd;
      row.kart += split.kart;
      row.pos += split.pos;
      row.balans += split.balans;
      row.nisye += split.borc;
      row.salesInflow += split.naqd + split.kart + split.pos;
    } else if (paymentFilter === 'naqd') {
      row.naqd += split.naqd;
      row.salesInflow += split.naqd;
    } else if (paymentFilter === 'kart') {
      row.kart += split.kart;
      row.salesInflow += split.kart;
    } else if (paymentFilter === 'pos') {
      row.pos += split.pos;
      row.salesInflow += split.pos;
    } else if (paymentFilter === 'balans') {
      row.balans += split.balans;
    } else if (paymentFilter === 'borc') {
      row.nisye += split.borc;
    }

    const ratio = s.totalAmount > 0 ? filteredAmt / s.totalAmount : 1;
    for (const item of s.items || []) {
      const prodKey = item.productId || (item.productName || '').toLowerCase();
      if (!soldProductMapByStaff[staffKey][prodKey]) {
        soldProductMapByStaff[staffKey][prodKey] = {
          productId: item.productId || prodKey,
          productName: item.productName || 'Məhsul',
          quantity: 0,
          totalAmount: 0,
        };
      }
      soldProductMapByStaff[staffKey][prodKey].quantity = round2(
        soldProductMapByStaff[staffKey][prodKey].quantity + (Number(item.quantity) || 0) * ratio
      );
      soldProductMapByStaff[staffKey][prodKey].totalAmount = round2(
        soldProductMapByStaff[staffKey][prodKey].totalAmount + (Number(item.totalPrice) || 0) * ratio
      );
    }

    row.operations.push({
      id: s.id,
      kind: 'sale',
      date: s.date,
      time: s.time || '--:--',
      staffUsername: staffUser,
      paymentMethod: s.paymentType,
      amount: filteredAmt,
      description: s.items.map(i => `${i.productName} (${i.quantity}x)`).join(', '),
      customerOrNote: s.debtorName,
      badgeText:
        s.paymentType === 'qarisik'
          ? formatSalePaymentLabel(s)
          : s.paymentType === 'borc'
          ? 'Nisyə satış'
          : s.paymentType === 'balans'
          ? 'Balansdan məhsul'
          : 'Satış',
    });
  }

  // 2. Aggregate collected subsequent debt payments (without double counting!)
  for (const debt of debts) {
    if (debt.isCancelled) continue;
    for (const p of debt.payments || []) {
      if (p.isUpfront) continue;
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

      const timeStr =
        p.createdAt && p.createdAt.includes('T')
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
      const staffKey = r.staffUsername.toLowerCase();
      const grossSales = round2(grossSalesSumByStaff[staffKey] || 0);
      const totalInflow = round2(r.salesInflow + r.debtInflow);
      const avgCheck = r.salesCount > 0 ? round2(grossSales / r.salesCount) : 0;
      const sortedOps = [...r.operations].sort((a, b) => {
        const cmpDate = b.date.localeCompare(a.date);
        if (cmpDate !== 0) return cmpDate;
        return b.time.localeCompare(a.time);
      });
      const soldProducts = Object.values(soldProductMapByStaff[staffKey] || {}).sort(
        (a, b) => b.totalAmount - a.totalAmount || b.quantity - a.quantity
      );

      return {
        ...r,
        naqd: round2(r.naqd),
        kart: round2(r.kart),
        pos: round2(r.pos),
        balans: round2(r.balans),
        nisye: round2(r.nisye),
        grossSales,
        salesInflow: round2(r.salesInflow),
        debtInflow: round2(r.debtInflow),
        totalInflow,
        avgCheck,
        soldProducts,
        operations: sortedOps,
      };
    })
    .sort((a, b) => b.totalInflow - a.totalInflow || b.grossSales - a.grossSales || a.staffName.localeCompare(b.staffName));

  const totals = rows.reduce(
    (acc, r) => ({
      naqd: acc.naqd + r.naqd,
      kart: acc.kart + r.kart,
      pos: acc.pos + r.pos,
      balans: acc.balans + r.balans,
      nisye: acc.nisye + r.nisye,
      grossSales: acc.grossSales + r.grossSales,
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
      grossSales: 0,
      salesCount: 0,
      debtPaymentsCount: 0,
      avgCheck: 0,
      salesInflow: 0,
      debtInflow: 0,
      totalInflow: 0,
    }
  );

  const totalGrossSales = Object.values(grossSalesSumByStaff).reduce((s, v) => s + v, 0);
  totals.avgCheck = totals.salesCount > 0 ? round2(totalGrossSales / totals.salesCount) : 0;
  totals.naqd = round2(totals.naqd);
  totals.kart = round2(totals.kart);
  totals.pos = round2(totals.pos);
  totals.balans = round2(totals.balans);
  totals.nisye = round2(totals.nisye);
  totals.grossSales = round2(totals.grossSales);
  totals.salesInflow = round2(totals.salesInflow);
  totals.debtInflow = round2(totals.debtInflow);
  totals.totalInflow = round2(totals.totalInflow);

  const allOperations = rows
    .flatMap(r => r.operations)
    .sort((a, b) => {
      const cmp = b.date.localeCompare(a.date);
      if (cmp !== 0) return cmp;
      return b.time.localeCompare(a.time);
    });

  return { rows, totals, allOperations };
}
