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
} from './financialCalculations';
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
      // Unconfirmed sale should not be deducted yet if not confirmed
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
  assert.match(checkEli.warningMessage, /Əli adlı müştərinin 2.00 AZN borcu var idi!/);

  const checkVeli = checkCustomerDebt('Vəli', debts);
  assert.equal(checkVeli.hasDebt, false);

  const checkMurad = checkCustomerDebt('Murad', debts);
  assert.equal(checkMurad.hasDebt, false);
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
