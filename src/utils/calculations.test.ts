import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateProductStock,
  calculateAllProductStocks,
  getLowStockProducts,
  buildDepoMovementsLedger,
} from './stockCalculations';
import {
  calculatePaymentBreakdown,
  calculateNetProfit,
  checkDailyReportDiscrepancy,
  checkCustomerDebt,
  calculateDebtOverview,
  calculateFinancialMetricsForRange,
  extractBalanceProductWithdrawals,
  extractBalanceCashWithdrawals,
} from './financialCalculations';
import {
  normalizeBarcode,
  findProductByBarcode,
  hasLongerBarcodePrefix,
  isRapidScanSequence,
  buildBarcodeIndex,
  lookupBarcodeInIndex,
  hasLongerBarcodePrefixInIndex,
} from './barcodeUtils';
import {
  Product,
  PurchaseIntake,
  Sale,
  DebtRecord,
  DailyReport,
  CustomerAccount,
  DepoMovement,
} from '../types';

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

  // O(1) barcode index verification
  const idx = buildBarcodeIndex(sampleProducts);
  assert.equal(lookupBarcodeInIndex(idx, '47600106\r\n')?.id, 'p-1');
  assert.equal(lookupBarcodeInIndex(idx, '047600106')?.id, 'p-1');
  assert.equal(lookupBarcodeInIndex(idx, '05su')?.id, 'p-2');
  assert.equal(lookupBarcodeInIndex(idx, 'unknown-code'), undefined);
  assert.equal(hasLongerBarcodePrefixInIndex(idx, '10', 'p-3'), true);
  assert.equal(hasLongerBarcodePrefixInIndex(idx, '47600106', 'p-1'), false);
});

test('Customer balance integration: open/deposit excluded from sales, product_out included in sales & Depo stock, free cash withdraw deducts net cash balance', () => {
  const waterProduct: Product = {
    id: 'p-water',
    name: '0.5L Su',
    barcode: '47600101',
    salePrice: 1.0,
    buyPrice: 0.4,
    category: 'Su',
    initialStock: 6,
    minStockAlert: 2,
    createdAt: '2026-11-01',
  };

  // Scenario from prompt:
  // Nov 5: 50 AZN opened
  // Nov 6: 20 AZN deposited
  // Nov 7: 10 AZN free cash withdrawn + 2 waters (2 AZN) withdrawn via product_out
  // Nov 7: also 1 normal cash sale of 10 AZN
  const customerAccounts: CustomerAccount[] = [
    {
      id: 'cust-ali',
      name: 'Əli',
      balance: 58, // 50 + 20 - 10 - 2
      totalDeposited: 70,
      totalSpent: 2,
      totalWithdrawn: 10,
      openedDate: '2026-11-05',
      transactions: [
        {
          id: 'tx-1',
          type: 'open',
          amount: 50,
          balanceBefore: 0,
          balanceAfter: 50,
          paymentMethod: 'naqd',
          date: '2026-11-05',
          time: '10:00',
        },
        {
          id: 'tx-2',
          type: 'deposit',
          amount: 20,
          balanceBefore: 50,
          balanceAfter: 70,
          paymentMethod: 'naqd',
          date: '2026-11-06',
          time: '11:00',
        },
        {
          id: 'tx-3',
          type: 'withdraw',
          amount: 10,
          balanceBefore: 70,
          balanceAfter: 60,
          paymentMethod: 'naqd',
          date: '2026-11-07',
          time: '14:00',
          note: 'Sərbəst pul çıxarışı',
          createdBy: 'admin',
        },
        {
          id: 'tx-4',
          type: 'product_out',
          amount: 2,
          balanceBefore: 60,
          balanceAfter: 58,
          paymentMethod: 'balans',
          productId: 'p-water',
          productName: '0.5L Su',
          quantity: 2,
          unitPrice: 1,
          date: '2026-11-07',
          time: '15:30',
          createdBy: 'isci',
        },
      ],
      createdAt: '2026-11-05T10:00:00Z',
      updatedAt: '2026-11-07T15:30:00Z',
    },
  ];

  const sales: Sale[] = [
    {
      id: 'sale-normal-1',
      date: '2026-11-07',
      time: '12:00',
      items: [{ productId: 'p-shake', productName: 'Shake', quantity: 2, unitPrice: 5, totalPrice: 10 }],
      totalAmount: 10,
      paymentType: 'naqd',
      isConfirmed: true,
      createdAt: '2026-11-07T12:00:00Z',
      createdBy: 'isci',
    },
    {
      id: 'sale-bal-1',
      date: '2026-11-07',
      time: '15:30',
      items: [{ productId: 'p-water', productName: '0.5L Su', quantity: 2, unitPrice: 1, totalPrice: 2 }],
      totalAmount: 2,
      paymentType: 'balans',
      debtorName: 'Əli',
      isConfirmed: true,
      createdAt: '2026-11-07T15:30:00Z',
      createdBy: 'isci',
    },
  ];

  // Depo stock for 0.5L Su: initial 6 - 2 balance product_out = 4 left!
  const waterStock = calculateProductStock(waterProduct, [], sales, 2);
  assert.equal(waterStock.activeStock, 4);

  // Nov 5 & Nov 6: balance opening & top-up MUST NOT count as sales revenue
  const nov5Metrics = calculateFinancialMetricsForRange({
    sales,
    debts: [],
    customerAccounts,
    startDate: '2026-11-05',
    endDate: '2026-11-05',
  });
  assert.equal(nov5Metrics.grossSalesTotal, 0);
  assert.equal(nov5Metrics.balanceDepositsTotal, 50);

  // Nov 7: Normal sales = 10, Balance product out = 2 -> Gross sales = 12; Free cash withdrawal = 10 -> Net Cash = 10 - 10 = 0
  const nov7Metrics = calculateFinancialMetricsForRange({
    sales,
    debts: [],
    customerAccounts,
    startDate: '2026-11-07',
    endDate: '2026-11-07',
  });
  assert.equal(nov7Metrics.normalSalesTotal, 10);
  assert.equal(nov7Metrics.balanceSales, 2);
  assert.equal(nov7Metrics.grossSalesTotal, 12);
  assert.equal(nov7Metrics.balanceCashWithdrawals, 10);
  assert.equal(nov7Metrics.actualDrawerInflow, 10);
  assert.equal(nov7Metrics.totalCashOutflow, 10);
  assert.equal(nov7Metrics.netCashBalance, 0);

  const productOuts = extractBalanceProductWithdrawals(sales, '2026-11-07', '2026-11-07');
  assert.equal(productOuts.length, 1);
  assert.equal(productOuts[0].customerName, 'Əli');
  assert.equal(productOuts[0].productName, '0.5L Su');
  assert.equal(productOuts[0].quantity, 2);
  assert.equal(productOuts[0].totalAmount, 2);

  const cashOuts = extractBalanceCashWithdrawals(customerAccounts, '2026-11-07', '2026-11-07');
  assert.equal(cashOuts.length, 1);
  assert.equal(cashOuts[0].customerName, 'Əli');
  assert.equal(cashOuts[0].amount, 10);

  // Depo 4-category ledger separation
  const purchases: PurchaseIntake[] = [
    {
      id: 'pur-water',
      date: '2026-11-05',
      productId: 'p-water',
      productName: '0.5L Su',
      quantity: 12,
      paidAmount: 4.8,
      createdAt: '2026-11-05T09:00:00Z',
      createdBy: 'admin',
    },
  ];
  const manualAdjustments: DepoMovement[] = [
    {
      id: 'dm-adj-1',
      movementType: 'manual_adjustment',
      productId: 'p-water',
      productName: '0.5L Su',
      quantityDelta: -1,
      date: '2026-11-07',
      time: '18:00',
      sourceLabel: 'Əl ilə edilən depo düzəlişi',
      createdBy: 'admin',
      createdAt: '2026-11-07T18:00:00Z',
    },
  ];

  const ledger = buildDepoMovementsLedger({ purchases, sales, manualAdjustments });
  assert.equal(ledger.counts.normal_sale_out, 1);
  assert.equal(ledger.counts.balance_product_out, 1);
  assert.equal(ledger.counts.purchase_in, 1);
  assert.equal(ledger.counts.manual_adjustment, 1);
  const balanceMovement = ledger.movements.find(m => m.movementType === 'balance_product_out');
  assert.equal(balanceMovement?.sourceLabel, 'Müştəri balansından çıxarış');
  assert.equal(balanceMovement?.quantityDelta, -2);
});



