import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateProductStock,
  calculateAllProductStocks,
  getLowStockProducts,
} from './stockCalculations';
import {
  calculatePaymentBreakdown,
  calculateNetProfit,
  checkDailyReportDiscrepancy,
  checkCustomerDebt,
  calculateDebtOverview,
  calculateFinancialMetricsForRange,
} from './financialCalculations';
import {
  normalizeBarcode,
  findProductByBarcode,
  hasLongerBarcodePrefix,
  isRapidScanSequence,
} from './barcodeUtils';
import { Product, PurchaseIntake, Sale, DebtRecord, DailyReport } from '../types';

test('Active stock calculation: initial + purchased - sold', () => {
  const dummyProduct: Product = {
    id: 'p1',
    name: '0.5 L Su',
    barcode: '47600101',
    salePrice: 0.5,
    buyPrice: 0.25,
    category: 'Su',
    initialStock: 100,
    minStockAlert: 5,
    createdAt: '2026-01-01',
  };

  const purchases: PurchaseIntake[] = [
    {
      id: 'pur-1',
      date: '2026-11-01',
      productId: 'p1',
      productName: '0.5 L Su',
      quantity: 50,
      paidAmount: 12.5,
      createdAt: '2026-11-01',
      createdBy: 'admin',
    },
  ];

  const sales: Sale[] = [
    {
      id: 's-1',
      date: '2026-11-02',
      time: '12:00',
      items: [{ productId: 'p1', productName: '0.5 L Su', quantity: 60, unitPrice: 0.5, totalPrice: 30 }],
      totalAmount: 30,
      paymentType: 'naqd',
      isConfirmed: true,
      createdAt: '2026-11-02',
      createdBy: 'isci',
    },
    {
      // Unconfirmed card sale should not be deducted yet if not confirmed
      id: 's-2',
      date: '2026-11-03',
      time: '13:00',
      items: [{ productId: 'p1', productName: '0.5 L Su', quantity: 10, unitPrice: 0.5, totalPrice: 5 }],
      totalAmount: 5,
      paymentType: 'kart',
      isConfirmed: false,
      createdAt: '2026-11-03',
      createdBy: 'isci',
    },
  ];

  // Expected: initial 100 + purchased 50 - confirmed sold 60 = 90
  const stock = calculateProductStock(dummyProduct, purchases, sales, 5);
  assert.equal(stock.activeStock, 90);
  assert.equal(stock.isLowStock, false);
});

test('Credit (borc) sale deducts stock immediately and consolidates multi-line product quantities', () => {
  const dummyProduct: Product = {
    id: 'p-credit',
    name: 'BCAA',
    barcode: '47600999',
    salePrice: 4.0,
    buyPrice: 2.0,
    category: 'Əlavələr',
    initialStock: 20,
    minStockAlert: 5,
    createdAt: '2026-11-01',
  };

  const sales: Sale[] = [
    {
      id: 's-borc-1',
      date: '2026-11-10',
      time: '15:00',
      items: [
        { productId: 'p-credit', productName: 'BCAA', quantity: 2, unitPrice: 4.0, totalPrice: 8.0 },
        { productId: 'p-credit', productName: 'BCAA', quantity: 3, unitPrice: 4.0, totalPrice: 12.0 },
      ],
      totalAmount: 20.0,
      paymentType: 'borc',
      debtorName: 'Kamran',
      isConfirmed: false, // Even if unconfirmed flag is false, borc deducts immediately
      createdAt: '2026-11-10T15:00:00Z',
      createdBy: 'isci',
    },
  ];

  const stock = calculateProductStock(dummyProduct, [], sales, 5);
  assert.equal(stock.totalSold, 5);
  assert.equal(stock.activeStock, 15);
});

test('Low stock trigger when active stock <= minStockAlert', () => {
  const dummyProduct: Product = {
    id: 'p2',
    name: 'Protein Bar',
    barcode: '47600109',
    salePrice: 2.0,
    buyPrice: 1.0,
    category: 'Qida',
    initialStock: 10,
    minStockAlert: 5,
    createdAt: '2026-01-01',
  };

  const purchases: PurchaseIntake[] = [];
  const sales: Sale[] = [
    {
      id: 's-3',
      date: '2026-11-02',
      time: '14:00',
      items: [{ productId: 'p2', productName: 'Protein Bar', quantity: 6, unitPrice: 2.0, totalPrice: 12 }],
      totalAmount: 12,
      paymentType: 'naqd',
      isConfirmed: true,
      createdAt: '2026-11-02',
      createdBy: 'isci',
    },
  ];

  // 10 - 6 = 4 <= 5 -> low stock trigger!
  const stock = calculateProductStock(dummyProduct, purchases, sales, 5);
  assert.equal(stock.activeStock, 4);
  assert.equal(stock.isLowStock, true);

  const lowList = getLowStockProducts([dummyProduct], purchases, sales, 5);
  assert.equal(lowList.length, 1);
});

test('Net profit calculation: revenue - goods purchases - other expenses', () => {
  const res = calculateNetProfit(1000, 400, 150);
  // Net profit = 1000 - 400 - 150 = 450
  assert.equal(res.netProfit, 450);
});

test('Payment breakdown splits into Cash, Card, POS, and Debt', () => {
  const sales: Sale[] = [
    {
      id: '1',
      date: '2026-11-08',
      time: '10:00',
      items: [],
      totalAmount: 50,
      paymentType: 'naqd',
      isConfirmed: true,
      createdAt: '',
      createdBy: '',
    },
    {
      id: '2',
      date: '2026-11-08',
      time: '11:00',
      items: [],
      totalAmount: 30,
      paymentType: 'kart',
      isConfirmed: true,
      createdAt: '',
      createdBy: '',
    },
    {
      id: '3',
      date: '2026-11-08',
      time: '12:00',
      items: [],
      totalAmount: 20,
      paymentType: 'pos',
      isConfirmed: true,
      createdAt: '',
      createdBy: '',
    },
    {
      id: '4',
      date: '2026-11-08',
      time: '13:00',
      items: [],
      totalAmount: 15,
      paymentType: 'borc',
      isConfirmed: true,
      createdAt: '',
      createdBy: '',
    },
  ];

  const breakdown = calculatePaymentBreakdown(sales);
  assert.equal(breakdown.cash, 50);
  assert.equal(breakdown.card, 30);
  assert.equal(breakdown.pos, 20);
  assert.equal(breakdown.debt, 15);
  assert.equal(breakdown.total, 115);
});

test('Financial metrics separate discounts, sold items, credit exclusion, and paidAt debt collection', () => {
  const sales: Sale[] = [
    {
      id: 's-cash',
      date: '2026-11-14',
      time: '10:00',
      items: [{ productId: 'p1', productName: 'Su', quantity: 4, unitPrice: 2.5, totalPrice: 10 }],
      subtotalAmount: 10,
      discountAmount: 2,
      totalAmount: 8,
      paymentType: 'naqd',
      isConfirmed: true,
      createdAt: '2026-11-14T10:00:00Z',
      createdBy: 'isci',
    },
    {
      id: 's-credit',
      date: '2026-11-14',
      time: '11:00',
      items: [{ productId: 'p2', productName: 'Shake', quantity: 2, unitPrice: 5, totalPrice: 10 }],
      subtotalAmount: 10,
      discountAmount: 0,
      totalAmount: 10,
      paymentType: 'borc',
      debtorName: 'Rəşad',
      isConfirmed: true,
      createdAt: '2026-11-14T11:00:00Z',
      createdBy: 'isci',
    },
  ];

  const debts: DebtRecord[] = [
    {
      id: 'd-old',
      debtorName: 'Əli',
      debtorPhone: '0501112233',
      items: [{ productName: 'Protein', quantity: 1, unitPrice: 12 }],
      totalAmount: 12,
      paidAmount: 5,
      remainingAmount: 7,
      date: '2026-11-10',
      status: 'qismen',
      payments: [
        {
          id: 'pay-1',
          debtId: 'd-old',
          date: '2026-11-14',
          paidAt: '2026-11-14',
          amount: 5,
          paymentMethod: 'kart',
          receivedBy: 'admin',
          createdAt: '2026-11-14T12:00:00Z',
        },
      ],
      createdAt: '2026-11-10T09:00:00Z',
      updatedAt: '2026-11-14T12:00:00Z',
    },
    {
      id: 'd-new',
      debtorName: 'Rəşad',
      items: [{ productName: 'Shake', quantity: 2, unitPrice: 5 }],
      totalAmount: 10,
      paidAmount: 0,
      remainingAmount: 10,
      date: '2026-11-14',
      status: 'borcdadir',
      payments: [],
      createdAt: '2026-11-14T11:00:00Z',
      updatedAt: '2026-11-14T11:00:00Z',
    },
  ];

  const metricsToday = calculateFinancialMetricsForRange({
    sales,
    debts,
    startDate: '2026-11-14',
    endDate: '2026-11-14',
  });

  assert.equal(metricsToday.grossSalesTotal, 18); // 8 cash + 10 credit
  assert.equal(metricsToday.totalDiscounts, 2);
  assert.equal(metricsToday.grossBeforeDiscount, 20);
  assert.equal(metricsToday.totalItemsSold, 6); // 4 + 2
  assert.equal(metricsToday.cashSales, 8);
  assert.equal(metricsToday.creditSales, 10);
  assert.equal(metricsToday.debtCollectedCard, 5);
  assert.equal(metricsToday.actualDrawerInflow, 13); // 8 cash + 5 debt card (credit excluded!)
  assert.equal(metricsToday.totalUnpaidDebts, 17); // 7 + 10

  // Earlier date should NOT see the 2026-11-14 payment in its drawer inflow
  const metricsNov10 = calculateFinancialMetricsForRange({
    sales,
    debts,
    startDate: '2026-11-10',
    endDate: '2026-11-10',
  });
  assert.equal(metricsNov10.actualDrawerInflow, 0);
  assert.equal(metricsNov10.debtCollectedTotal, 0);
});

test('Customer existing debt check detects previous unpaid debt and formats message', () => {
  const debts: DebtRecord[] = [
    {
      id: 'd-1',
      debtorName: 'Əli',
      items: [{ productName: '0.5 L Su', quantity: 2, unitPrice: 0.5 }],
      totalAmount: 2.0,
      paidAmount: 0,
      remainingAmount: 2.0,
      date: '2026-11-01',
      status: 'borcdadir',
      payments: [],
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'd-2',
      debtorName: 'Vəli',
      items: [],
      totalAmount: 5.0,
      paidAmount: 5.0,
      remainingAmount: 0,
      date: '2026-11-01',
      status: 'odanilib',
      payments: [],
      createdAt: '',
      updatedAt: '',
    },
  ];

  const checkEli = checkCustomerDebt('əli ', debts);
  assert.equal(checkEli.hasDebt, true);
  assert.equal(checkEli.totalRemainingDebt, 2.0);
  assert.match(checkEli.warningMessage, /Əli adlı müştərinin 2.00 (AZN|₼) borcu var idi!/);

  const checkVeli = checkCustomerDebt('Vəli', debts);
  assert.equal(checkVeli.hasDebt, false);

  const checkMurad = checkCustomerDebt('Murad', debts);
  assert.equal(checkMurad.hasDebt, false);

  const overview = calculateDebtOverview(debts);
  assert.equal(overview.totalRemainingDebt, 2.0);
  assert.equal(overview.unpaidDebtorsCount, 1);
});

test('Daily report discrepancy check: exact match vs discrepancy', () => {
  const sales: Sale[] = [
    {
      id: '1',
      date: '2026-11-08',
      time: '10:00',
      items: [],
      totalAmount: 100,
      paymentType: 'naqd',
      isConfirmed: true,
      createdAt: '',
      createdBy: '',
    },
  ];

  const matchingReport: DailyReport = {
    id: 'r1',
    date: '2026-11-08',
    cashAmount: 100,
    cardAmount: 0,
    posAmount: 0,
    totalAmount: 100,
    isManuallyAdjusted: false,
    difference: 0,
    updatedBy: 'isci',
    updatedAt: '',
  };

  const matchRes = checkDailyReportDiscrepancy(matchingReport, sales);
  assert.equal(matchRes.isMatching, true);
  assert.equal(matchRes.message, 'Uyğundur');

  const mismatchedReport: DailyReport = {
    ...matchingReport,
    totalAmount: 95,
  };
  const mismatchRes = checkDailyReportDiscrepancy(mismatchedReport, sales);
  assert.equal(mismatchRes.isMatching, false);
  assert.match(mismatchRes.message, /Fərq var – yoxlayın/);
});

test('POS barcode scanner matching supports exact, whitespace/newline trim, leading zero strip, prefix safety, and rapid burst detection', () => {
  const sampleProducts: Product[] = [
    {
      id: 'p-1',
      name: 'Protein (iso)',
      barcode: '47600106',
      salePrice: 6,
      buyPrice: 3,
      category: 'Protein',
      initialStock: 10,
      minStockAlert: 5,
      createdAt: '',
    },
    {
      id: 'p-2',
      name: '0.5L Su',
      barcode: '05su',
      salePrice: 0.6,
      buyPrice: 0.3,
      category: 'Su',
      initialStock: 20,
      minStockAlert: 5,
      createdAt: '',
    },
    {
      id: 'p-3',
      name: 'Kreatin',
      barcode: '10',
      salePrice: 3,
      buyPrice: 1.5,
      category: 'Protein',
      initialStock: 10,
      minStockAlert: 5,
      createdAt: '',
    },
    {
      id: 'p-4',
      name: 'BCAA',
      barcode: '1050',
      salePrice: 4,
      buyPrice: 2,
      category: 'Protein',
      initialStock: 10,
      minStockAlert: 5,
      createdAt: '',
    },
  ];

  assert.equal(normalizeBarcode('  47600106\r\n\t '), '47600106');
  assert.equal(findProductByBarcode(sampleProducts, '47600106\n')?.id, 'p-1');
  assert.equal(findProductByBarcode(sampleProducts, '047600106')?.id, 'p-1');
  assert.equal(findProductByBarcode(sampleProducts, '05SU')?.id, 'p-2');
  assert.equal(findProductByBarcode(sampleProducts, '999999'), undefined);

  // Prefix ambiguity check prevents early trigger on '10' when '1050' exists
  assert.equal(hasLongerBarcodePrefix(sampleProducts, '10', 'p-3'), true);
  assert.equal(hasLongerBarcodePrefix(sampleProducts, '47600106', 'p-1'), false);

  // Rapid HID hardware scanner timing vs slow manual typing
  assert.equal(isRapidScanSequence([18, 22, 15, 25, 19]), true);
  assert.equal(isRapidScanSequence([160, 210, 140, 195]), false);
});

