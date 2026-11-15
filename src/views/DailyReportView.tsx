import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar,
  Save,
  CheckCircle2,
  AlertTriangle,
  Download,
  Banknote,
  CreditCard,
  Smartphone,
  Info,
  TrendingUp,
  Wallet,
  ShoppingBag,
  ArrowUpRight,
  Search,
  ChevronDown,
  ChevronUp,
  PackageCheck,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatAZN, formatDateAZ, getTodayISODate, getCurrentMonthKey } from '../utils/dateUtils';
import {
  calculateDailyStaffBreakdown,
  calculateFinancialMetricsForRange,
  calculateNetProfit,
  calculateProductBreakdownByPaymentMethod,
  extractBalanceCashWithdrawals,
  extractBalanceProductWithdrawals,
  ProductMethodBreakdownSummary,
} from '../utils/financialCalculations';
import { exportDailyReportsToCSV, exportFullDailyReportToCSV } from '../utils/exportUtils';
import { StaffPaymentBreakdown } from '../components/StaffPaymentBreakdown';

type ProductMethodTab = ProductMethodBreakdownSummary['paymentMethod'];

export const DailyReportView: React.FC = () => {
  const {
    dailyReports,
    sales,
    debts,
    purchases,
    expenses,
    customerAccounts,
    users,
    saveDailyReport,
    currentUser,
    settings,
  } = useApp();
  const isAdmin = currentUser?.role === 'admin';

  const todayISO = getTodayISODate();
  const [selectedDate, setSelectedDate] = useState(todayISO);
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthKey());

  // Product & Customer Search filters for detailed breakdown
  const [productSearch, setProductSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [productTabFilter, setProductTabFilter] = useState<ProductMethodTab>('all');
  const [expandedProductKey, setExpandedProductKey] = useState<string | null>(null);

  // Current day drawer inputs
  const [cashInput, setCashInput] = useState('');
  const [cardInput, setCardInput] = useState('');
  const [posInput, setPosInput] = useState('');
  const [reportNotes, setReportNotes] = useState('');
  const [isSavedSuccess, setIsSavedSuccess] = useState(false);

  // Authoritative metrics for selectedDate
  const dayMetrics = useMemo(
    () =>
      calculateFinancialMetricsForRange({
        sales,
        debts,
        purchases,
        expenses,
        customerAccounts,
        startDate: selectedDate,
        endDate: selectedDate,
      }),
    [sales, debts, purchases, expenses, customerAccounts, selectedDate]
  );

  const staffDisplayMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const u of users) {
      map[u.username.toLowerCase()] = u.name;
    }
    return map;
  }, [users]);

  // Product breakdown by payment method (for active tab + full export)
  const productBreakdownFiltered = useMemo(
    () =>
      calculateProductBreakdownByPaymentMethod({
        sales,
        staffDisplayMap,
        startDate: selectedDate,
        endDate: selectedDate,
        paymentMethod: productTabFilter,
        productSearch,
        customerSearch,
      }),
    [sales, staffDisplayMap, selectedDate, productTabFilter, productSearch, customerSearch]
  );

  const productMethodsForExport = useMemo(
    () => [
      {
        label: 'Nağd',
        summary: calculateProductBreakdownByPaymentMethod({
          sales,
          staffDisplayMap,
          startDate: selectedDate,
          endDate: selectedDate,
          paymentMethod: 'naqd',
          productSearch,
          customerSearch,
        }),
      },
      {
        label: 'Kart',
        summary: calculateProductBreakdownByPaymentMethod({
          sales,
          staffDisplayMap,
          startDate: selectedDate,
          endDate: selectedDate,
          paymentMethod: 'kart',
          productSearch,
          customerSearch,
        }),
      },
      {
        label: 'POS',
        summary: calculateProductBreakdownByPaymentMethod({
          sales,
          staffDisplayMap,
          startDate: selectedDate,
          endDate: selectedDate,
          paymentMethod: 'pos',
          productSearch,
          customerSearch,
        }),
      },
      {
        label: 'Borc',
        summary: calculateProductBreakdownByPaymentMethod({
          sales,
          staffDisplayMap,
          startDate: selectedDate,
          endDate: selectedDate,
          paymentMethod: 'borc',
          productSearch,
          customerSearch,
        }),
      },
      {
        label: 'Balansdan',
        summary: calculateProductBreakdownByPaymentMethod({
          sales,
          staffDisplayMap,
          startDate: selectedDate,
          endDate: selectedDate,
          paymentMethod: 'balans',
          productSearch,
          customerSearch,
        }),
      },
    ],
    [sales, staffDisplayMap, selectedDate, productSearch, customerSearch]
  );

  const dayStaffBreakdown = useMemo(
    () =>
      calculateDailyStaffBreakdown({
        sales,
        debts,
        staffDisplayMap,
        startDate: selectedDate,
        endDate: selectedDate,
        staffFilter: isAdmin ? 'all' : currentUser?.username || 'all',
      }),
    [sales, debts, staffDisplayMap, selectedDate, isAdmin, currentUser?.username]
  );

  const balanceProductWithdrawals = useMemo(
    () => extractBalanceProductWithdrawals(sales, selectedDate, selectedDate),
    [sales, selectedDate]
  );

  const balanceCashWithdrawalsList = useMemo(
    () => extractBalanceCashWithdrawals(customerAccounts, selectedDate, selectedDate),
    [customerAccounts, selectedDate]
  );

  const dayProfit = useMemo(
    () =>
      calculateNetProfit(
        dayMetrics.grossSalesTotal,
        dayMetrics.purchasesOutflow,
        dayMetrics.expensesOutflow
      ),
    [dayMetrics]
  );

  // Expected inflows for selectedDate (Sales cash/card/pos + Debt collections)
  const dayInflowStats = useMemo(
    () => ({
      expectedCash: dayMetrics.drawerCashInflow,
      expectedCard: dayMetrics.drawerCardInflow,
      expectedPos: dayMetrics.drawerPosInflow,
      salesTotal: dayMetrics.salesRealInflow,
      debtTotal: dayMetrics.debtCollectedTotal,
      debtPaymentsCount: dayMetrics.debtCollectedCount,
      expectedTotal: dayMetrics.actualDrawerInflow,
    }),
    [dayMetrics]
  );

  useEffect(() => {
    const existing = dailyReports.find(r => r.date === selectedDate);
    if (existing) {
      setCashInput(String(existing.cashAmount));
      setCardInput(String(existing.cardAmount));
      setPosInput(String(existing.posAmount));
      setReportNotes(existing.notes || '');
    } else {
      setCashInput(String(dayInflowStats.expectedCash));
      setCardInput(String(dayInflowStats.expectedCard));
      setPosInput(String(dayInflowStats.expectedPos));
      setReportNotes('Kassa qeydiyyatı');
    }
    setIsSavedSuccess(false);
    setExpandedProductKey(null);
  }, [selectedDate, dailyReports, dayInflowStats]);

  const cashVal = parseFloat(cashInput) || 0;
  const cardVal = parseFloat(cardInput) || 0;
  const posVal = parseFloat(posInput) || 0;
  const currentTotal = Math.round((cashVal + cardVal + posVal) * 100) / 100;

  const discrepancy = Math.round((currentTotal - dayInflowStats.expectedTotal) * 100) / 100;
  const isMatch = Math.abs(discrepancy) < 0.01;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    saveDailyReport({
      date: selectedDate,
      cashAmount: cashVal,
      cardAmount: cardVal,
      posAmount: posVal,
      notes: reportNotes.trim() || undefined,
    });
    setIsSavedSuccess(true);
    setTimeout(() => setIsSavedSuccess(false), 3000);
  };

  const monthReports = dailyReports.filter(r => r.date.startsWith(selectedMonth));
  const monthCash = monthReports.reduce((sum, r) => sum + r.cashAmount, 0);
  const monthCard = monthReports.reduce((sum, r) => sum + r.cardAmount, 0);
  const monthPos = monthReports.reduce((sum, r) => sum + r.posAmount, 0);
  const monthTotal = monthCash + monthCard + monthPos;

  const productTabs: Array<{ id: ProductMethodTab; label: string; amount: number }> = [
    { id: 'all', label: 'Hamısı', amount: dayMetrics.grossSalesTotal },
    { id: 'naqd', label: 'Nağd', amount: dayMetrics.cashSales },
    { id: 'kart', label: 'Kart', amount: dayMetrics.cardSales },
    { id: 'pos', label: 'POS', amount: dayMetrics.posSales },
    { id: 'borc', label: 'Borc', amount: dayMetrics.creditSales },
    { id: 'balans', label: 'Balansdan', amount: dayMetrics.balanceSales },
  ];

  return (
    <div className="space-y-6 pb-12 max-w-7xl mx-auto">
      {/* Header & Executive Filter Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-3 border-b border-zinc-200 dark:border-zinc-800">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-white tracking-tight">
            Gündəlik Kassa və Maliyyə Hesabatı
          </h2>
          <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
            Bir səhifədə günün bütün satış dövriyyəsi, faktiki kassa daxilolmaları, xərclər və məhsul/əməkdaş detalları
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() =>
              exportFullDailyReportToCSV({
                date: selectedDate,
                appName: settings.barName || 'StrongBar',
                metrics: dayMetrics,
                productMethods: productMethodsForExport,
                staffSummary: dayStaffBreakdown,
                balanceProductWithdrawals,
                balanceCashWithdrawals: balanceCashWithdrawalsList,
              })
            }
            style={{ backgroundColor: settings.primaryColor || '#dc2626' }}
            className="px-3.5 py-2 text-xs font-bold text-white hover:opacity-95 rounded-xl transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Tam Hesabatı Excel-ə Yüklə</span>
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={() => exportDailyReportsToCSV(dailyReports)}
              className="px-3 py-2 text-xs font-semibold bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Kassa Jurnalı</span>
            </button>
          )}
        </div>
      </div>

      {/* Top Filter Toolbar: Date + Product Search + Customer Search */}
      <div className="p-4 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 block mb-1">
            Hesabat Tarixi {isAdmin ? '(Admin seçə bilər)' : '(Bugünkü gün)'}
          </label>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-red-500 shrink-0" />
            {isAdmin ? (
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                aria-label="Hesabat tarixi"
                className="w-full px-3 py-1.5 text-xs font-mono tabular-nums font-bold rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white"
              />
            ) : (
              <span className="font-mono text-sm font-bold text-zinc-900 dark:text-white">
                {formatDateAZ(todayISO)} (Bugün)
              </span>
            )}
          </div>
        </div>

        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 block mb-1">
            Məhsul Üzrə Axtarış
          </label>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={productSearch}
              onChange={e => setProductSearch(e.target.value)}
              placeholder="məs: Su, Protein..."
              className="w-full pl-8 pr-7 py-1.5 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white"
            />
            {productSearch && (
              <button
                type="button"
                onClick={() => setProductSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 dark:hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 block mb-1">
            Müştəri Üzrə Axtarış
          </label>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={customerSearch}
              onChange={e => setCustomerSearch(e.target.value)}
              placeholder="Müştəri adı..."
              className="w-full pl-8 pr-7 py-1.5 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white"
            />
            {customerSearch && (
              <button
                type="button"
                onClick={() => setCustomerSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 dark:hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between lg:justify-end gap-2">
          {isSavedSuccess ? (
            <div className="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 rounded-xl text-xs font-bold flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              <span>Yadda saxlanıldı</span>
            </div>
          ) : (
            <div className="text-right">
              <span className="text-[10px] uppercase font-bold text-zinc-500 block">
                {formatDateAZ(selectedDate)}
              </span>
              <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                {dayMetrics.salesCount} aktiv satış · {dayMetrics.totalItemsSold} ədəd
              </span>
            </div>
          )}
        </div>
      </div>

      {dayMetrics.cancelledSalesCount > 0 && (
        <div className="px-4 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/70 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
          <Info className="w-4 h-4 shrink-0" />
          <span>
            Seçilmiş tarixdə <strong>{dayMetrics.cancelledSalesCount} ədəd ləğv edilmiş satış</strong> var — satış dövriyyəsindən və faktiki kassadan avtomatik çıxarılıb.
          </span>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────
          SINGLE-PAGE EXECUTIVE FINANCIAL SECTIONS: A, B, C
         ───────────────────────────────────────────────────────── */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* SECTION A: Ümumi Satış Dövriyyəsi */}
        <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex flex-col justify-between space-y-4">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                A. Ümumi Satış Dövriyyəsi
              </span>
              <TrendingUp className="w-4 h-4 text-zinc-400" />
            </div>
            <div className="text-2xl font-black font-mono tabular-nums text-zinc-900 dark:text-white">
              {formatAZN(dayMetrics.grossSalesTotal)}
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              {dayMetrics.salesCount} satış · {dayMetrics.totalItemsSold} ədəd məhsul
            </p>
          </div>

          <div className="divide-y divide-zinc-100 dark:divide-zinc-800 text-xs">
            <div className="py-2 flex items-center justify-between">
              <span className="text-zinc-600 dark:text-zinc-400">Nağd satış</span>
              <span className="font-mono tabular-nums font-bold text-emerald-700 dark:text-emerald-400">
                {formatAZN(dayMetrics.cashSales)}
              </span>
            </div>
            <div className="py-2 flex items-center justify-between">
              <span className="text-zinc-600 dark:text-zinc-400">Kartla satış</span>
              <span className="font-mono tabular-nums font-bold text-blue-700 dark:text-blue-400">
                {formatAZN(dayMetrics.cardSales)}
              </span>
            </div>
            <div className="py-2 flex items-center justify-between">
              <span className="text-zinc-600 dark:text-zinc-400">POS / Köçürmə</span>
              <span className="font-mono tabular-nums font-bold text-zinc-800 dark:text-zinc-200">
                {formatAZN(dayMetrics.posSales)}
              </span>
            </div>
            <div className="py-2 flex items-center justify-between">
              <span className="text-rose-700 dark:text-rose-400 font-medium">Nisyə (Borc) satış</span>
              <span className="font-mono tabular-nums font-bold text-rose-700 dark:text-rose-400">
                {formatAZN(dayMetrics.creditSales)}
              </span>
            </div>
            <div className="py-2 flex items-center justify-between">
              <span className="text-cyan-700 dark:text-cyan-400 font-medium">Balansdan məhsul götürülməsi</span>
              <span className="font-mono tabular-nums font-bold text-cyan-700 dark:text-cyan-400">
                {formatAZN(dayMetrics.balanceSales)}
              </span>
            </div>
            <div className="py-2 flex items-center justify-between text-[11px]">
              <span className="text-zinc-500">Verilən endirimlər</span>
              <span className="font-mono tabular-nums font-semibold text-amber-600 dark:text-amber-400">
                {formatAZN(dayMetrics.totalDiscounts)}
              </span>
            </div>
          </div>

          <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 text-[10px] text-zinc-500">
            Ümumi satış = Nağd + Kart + POS + Borc + Balansdan məhsul
          </div>
        </div>

        {/* SECTION B: Faktiki Kassaya Daxil Olan Vəsaİt */}
        <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-emerald-200 dark:border-emerald-900/70 flex flex-col justify-between space-y-4">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                B. Faktiki Kassaya Daxil Olan Vəsait
              </span>
              <Wallet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="text-2xl font-black font-mono tabular-nums text-emerald-700 dark:text-emerald-300">
              {formatAZN(dayMetrics.actualDrawerInflow)}
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Yalnız real pul daxilolmaları (borc və balans satışları xaric)
            </p>
          </div>

          <div className="divide-y divide-zinc-100 dark:divide-zinc-800 text-xs">
            <div className="py-2 flex items-center justify-between">
              <span className="text-zinc-600 dark:text-zinc-400">Satışdan Nağd</span>
              <span className="font-mono tabular-nums font-bold text-zinc-900 dark:text-white">
                {formatAZN(dayMetrics.cashSales)}
              </span>
            </div>
            <div className="py-2 flex items-center justify-between">
              <span className="text-zinc-600 dark:text-zinc-400">Satışdan Bank Kartı</span>
              <span className="font-mono tabular-nums font-bold text-zinc-900 dark:text-white">
                {formatAZN(dayMetrics.cardSales)}
              </span>
            </div>
            <div className="py-2 flex items-center justify-between">
              <span className="text-zinc-600 dark:text-zinc-400">Satışdan POS Terminal</span>
              <span className="font-mono tabular-nums font-bold text-zinc-900 dark:text-white">
                {formatAZN(dayMetrics.posSales)}
              </span>
            </div>
            <div className="py-2 flex items-center justify-between">
              <span className="text-amber-700 dark:text-amber-400 font-semibold">
                Əvvəlki borcların ödənişi ({dayMetrics.debtCollectedCount} əd.)
              </span>
              <span className="font-mono tabular-nums font-bold text-amber-700 dark:text-amber-400">
                +{formatAZN(dayMetrics.debtCollectedTotal)}
              </span>
            </div>
            {dayMetrics.debtCollectedTotal > 0 && (
              <div className="py-2 flex items-center justify-between text-[11px] text-zinc-500 font-mono tabular-nums">
                <span>Borc ödəniş bölgüsü:</span>
                <span>
                  Nağd {formatAZN(dayMetrics.debtCollectedCash)} · Kart {formatAZN(dayMetrics.debtCollectedCard)} · POS {formatAZN(dayMetrics.debtCollectedPos)}
                </span>
              </div>
            )}
            <div className="py-2 flex items-center justify-between bg-emerald-50/70 dark:bg-emerald-950/30 px-2 rounded-lg font-bold">
              <span className="text-emerald-800 dark:text-emerald-300">Yekun Faktiki Daxilolma</span>
              <span className="font-mono tabular-nums text-emerald-800 dark:text-emerald-300">
                {formatAZN(dayMetrics.actualDrawerInflow)}
              </span>
            </div>
          </div>

          <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 text-[10px] text-zinc-500">
            Balans açılışı/artımı ({formatAZN(dayMetrics.balanceDepositsTotal)}) satış gəliri deyil
          </div>
        </div>

        {/* SECTION C: Pul Çıxışları & Kassada Olmalı Məbləğ */}
        <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex flex-col justify-between space-y-4">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                C. Pul Çıxışları və Xalis Kassa
              </span>
              <AlertTriangle className="w-4 h-4 text-amber-500" />
            </div>
            <div
              className={`text-2xl font-black font-mono tabular-nums ${
                dayMetrics.netCashBalance >= 0
                  ? 'text-zinc-900 dark:text-white'
                  : 'text-red-600 dark:text-red-400'
              }`}
            >
              {formatAZN(dayMetrics.netCashBalance)}
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Kassada olması lazım olan xalis məbləğ (Daxil − Çıxış)
            </p>
          </div>

          <div className="divide-y divide-zinc-100 dark:divide-zinc-800 text-xs">
            <div className="py-2 flex items-center justify-between">
              <span className="text-zinc-600 dark:text-zinc-400">Mal alışı (Depo)</span>
              <span className="font-mono tabular-nums font-bold text-red-600 dark:text-red-400">
                − {formatAZN(dayMetrics.purchasesOutflow)}
              </span>
            </div>
            <div className="py-2 flex items-center justify-between">
              <span className="text-zinc-600 dark:text-zinc-400">Digər xərclər</span>
              <span className="font-mono tabular-nums font-bold text-red-600 dark:text-red-400">
                − {formatAZN(dayMetrics.expensesOutflow)}
              </span>
            </div>
            <div className="py-2 flex items-center justify-between">
              <span className="text-zinc-600 dark:text-zinc-400">Balansdan sərbəst pul çıxışı</span>
              <span className="font-mono tabular-nums font-bold text-rose-600 dark:text-rose-400">
                − {formatAZN(dayMetrics.balanceCashWithdrawals)}
              </span>
            </div>
            <div className="py-2 flex items-center justify-between font-bold">
              <span className="text-zinc-800 dark:text-zinc-200">Ümumi Pul Çıxışı</span>
              <span className="font-mono tabular-nums text-red-600 dark:text-red-400">
                − {formatAZN(dayMetrics.totalCashOutflow)}
              </span>
            </div>
            <div className="py-2 flex items-center justify-between">
              <span className="text-zinc-600 dark:text-zinc-400">Sistem üzrə aktiv borc qalığı</span>
              <span className="font-mono tabular-nums font-bold text-rose-600 dark:text-rose-400">
                {formatAZN(dayMetrics.totalUnpaidDebts)}
              </span>
            </div>
            <div className="py-2 flex items-center justify-between">
              <span className="text-zinc-600 dark:text-zinc-400">Günün xalis gəliri (Satış − Alış/Xərc)</span>
              <span
                className={`font-mono tabular-nums font-bold ${
                  dayProfit.isProfit ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                }`}
              >
                {formatAZN(dayProfit.netProfit)}
              </span>
            </div>
          </div>

          <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 text-[10px] text-zinc-500">
            Faktiki daxilolma: {formatAZN(dayMetrics.actualDrawerInflow)} − Çıxış: {formatAZN(dayMetrics.totalCashOutflow)}
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────
          ÖDƏNİŞ NÖVÜNƏ GÖRƏ MƏHSUL ÜZRƏ DETALLI HESABAT
         ───────────────────────────────────────────────────────── */}
      <section className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-zinc-200 dark:border-zinc-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm sm:text-base font-extrabold text-zinc-900 dark:text-white flex items-center gap-2">
              <PackageCheck className="w-4 h-4 text-red-500" />
              <span>Ödəniş Növünə Görə Məhsul Üzrə Detallı Hesabat</span>
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Hansı məhsulun neçə ədəd və hansı ödəniş növü ilə satıldığını görmək üçün məhsul sətrinə klikləyin
            </p>
          </div>

          {/* Payment Method Filter Tabs */}
          <div className="flex flex-wrap items-center gap-1 p-1 bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl">
            {productTabs.map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setProductTabFilter(tab.id);
                  setExpandedProductKey(null);
                }}
                style={productTabFilter === tab.id ? { backgroundColor: settings.primaryColor || '#dc2626' } : undefined}
                className={`px-2.5 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap flex items-center gap-1.5 ${
                  productTabFilter === tab.id
                    ? 'text-white shadow-sm'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                }`}
              >
                <span>{tab.label}</span>
                <span className={`text-[10px] font-mono tabular-nums ${productTabFilter === tab.id ? 'opacity-90' : 'text-zinc-500'}`}>
                  {formatAZN(tab.amount)}
                </span>
              </button>
            ))}
          </div>
        </div>

        {productBreakdownFiltered.items.length === 0 ? (
          <div className="py-12 text-center text-xs text-zinc-500 dark:text-zinc-400">
            Seçilmiş tarix və filtrlər üzrə məhsul satışı tapılmadı.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[600px]">
              <thead className="bg-zinc-50 dark:bg-zinc-950 text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800 font-bold">
                <tr>
                  <th className="py-3 px-4">Məhsul</th>
                  <th className="py-3 px-4 text-right">Satılan Say</th>
                  <th className="py-3 px-4 text-right">Orta Vahid Qiymət</th>
                  <th className="py-3 px-4 text-right">Cəmi Məbləğ</th>
                  <th className="py-3 px-4 text-center">Detal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {productBreakdownFiltered.items.map(row => {
                  const rowKey = `${row.productId}:${row.productName}`;
                  const isExpanded = expandedProductKey === rowKey;
                  return (
                    <React.Fragment key={rowKey}>
                      <tr
                        onClick={() => setExpandedProductKey(isExpanded ? null : rowKey)}
                        className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors"
                      >
                        <td className="py-3 px-4 font-bold text-zinc-900 dark:text-white">
                          {row.productName}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-zinc-700 dark:text-zinc-300">
                          {row.quantity} əd.
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-zinc-500">
                          {formatAZN(row.unitPrice)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-extrabold text-zinc-900 dark:text-white">
                          {formatAZN(row.totalAmount)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-[10px] font-semibold text-zinc-600 dark:text-zinc-300">
                            <span>{row.occurrences.length} əməliyyat</span>
                            {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          </span>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="bg-zinc-50/90 dark:bg-zinc-950/70">
                          <td colSpan={5} className="px-6 py-3">
                            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
                              <table className="w-full text-left text-[11px]">
                                <thead className="bg-zinc-100 dark:bg-zinc-950 text-zinc-500 uppercase text-[10px] border-b border-zinc-200 dark:border-zinc-800">
                                  <tr>
                                    <th className="py-2 px-3">Saat</th>
                                    <th className="py-2 px-3 text-right">Say</th>
                                    <th className="py-2 px-3 text-right">Məbləğ</th>
                                    <th className="py-2 px-3">Ödəniş Növü</th>
                                    <th className="py-2 px-3">Müştəri</th>
                                    <th className="py-2 px-3">Məsul Əməkdaş</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                                  {row.occurrences.map((occ, idx) => (
                                    <tr key={`${occ.saleId}-${idx}`}>
                                      <td className="py-2 px-3 font-mono tabular-nums text-zinc-600 dark:text-zinc-400">
                                        {occ.time || '—'}
                                      </td>
                                      <td className="py-2 px-3 text-right font-mono tabular-nums font-semibold">
                                        {occ.quantity} əd.
                                      </td>
                                      <td className="py-2 px-3 text-right font-mono tabular-nums font-bold text-zinc-900 dark:text-white">
                                        {formatAZN(occ.amount)}
                                      </td>
                                      <td className="py-2 px-3 font-semibold text-zinc-700 dark:text-zinc-300">
                                        {occ.paymentLabel}
                                      </td>
                                      <td className="py-2 px-3 text-zinc-700 dark:text-zinc-300">
                                        {occ.customerName || '—'}
                                      </td>
                                      <td className="py-2 px-3 font-mono text-zinc-500">
                                        @{occ.staffUsername}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
              <tfoot className="bg-zinc-100 dark:bg-zinc-950 border-t border-zinc-200 dark:border-zinc-800 font-bold text-zinc-900 dark:text-white">
                <tr>
                  <td className="py-3 px-4 uppercase text-[11px] tracking-wider">CƏMİ</td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums">
                    {productBreakdownFiltered.totalQuantity} əd.
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-zinc-400">—</td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-sm">
                    {formatAZN(productBreakdownFiltered.totalAmount)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* Balansdan Məhsul & Sərbəst Pul Çıxarışları */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
            <div>
              <h4 className="text-xs font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                <ShoppingBag className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                <span>Balansdan Məhsul Çıxarışları</span>
              </h4>
              <p className="text-[10px] text-zinc-500">
                Satış dövriyyəsinə daxildir · Depodan çıxılıb · Kassaya əlavə edilmir
              </p>
            </div>
            <span className="font-mono tabular-nums text-xs font-bold text-cyan-600 dark:text-cyan-400">
              {formatAZN(dayMetrics.balanceSales)}
            </span>
          </div>

          {balanceProductWithdrawals.length === 0 ? (
            <p className="p-6 text-center text-xs text-zinc-500">
              Seçilmiş gündə balansdan məhsul çıxarışı olmayıb.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[500px]">
                <thead className="bg-zinc-50 dark:bg-zinc-950 text-[10px] uppercase text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                  <tr>
                    <th className="py-2 px-3">Məhsul</th>
                    <th className="py-2 px-3 text-right">Say</th>
                    <th className="py-2 px-3 text-right">Cəmi</th>
                    <th className="py-2 px-3">Müştəri</th>
                    <th className="py-2 px-3">Saat / Məsul</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {balanceProductWithdrawals.map(item => (
                    <tr key={item.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-950/60">
                      <td className="py-2 px-3 font-semibold text-zinc-900 dark:text-white">
                        {item.productName}
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums">
                        {item.quantity} əd.
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums font-bold text-cyan-700 dark:text-cyan-400">
                        {formatAZN(item.totalAmount)}
                      </td>
                      <td className="py-2 px-3 font-medium text-zinc-800 dark:text-zinc-200">
                        {item.customerName}
                      </td>
                      <td className="py-2 px-3 font-mono text-[11px] text-zinc-500 whitespace-nowrap">
                        {item.time} · @{item.createdBy}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
            <div>
              <h4 className="text-xs font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                <ArrowUpRight className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                <span>Balansdan Sərbəst Pul Çıxarışları</span>
              </h4>
              <p className="text-[10px] text-zinc-500">
                Satış gəliri deyil · Kassa çıxışı kimi hesablanır
              </p>
            </div>
            <span className="font-mono tabular-nums text-xs font-bold text-rose-600 dark:text-rose-400">
              − {formatAZN(dayMetrics.balanceCashWithdrawals)}
            </span>
          </div>

          {balanceCashWithdrawalsList.length === 0 ? (
            <p className="p-6 text-center text-xs text-zinc-500">
              Seçilmiş gündə balansdan sərbəst pul çıxarışı olmayıb.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[440px]">
                <thead className="bg-zinc-50 dark:bg-zinc-950 text-[10px] uppercase text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                  <tr>
                    <th className="py-2 px-3">Müştəri</th>
                    <th className="py-2 px-3 text-right">Məbləğ (−)</th>
                    <th className="py-2 px-3">Üsul</th>
                    <th className="py-2 px-3">Saat</th>
                    <th className="py-2 px-3">Qeyd</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {balanceCashWithdrawalsList.map(w => (
                    <tr key={w.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-950/60">
                      <td className="py-2 px-3 font-semibold text-zinc-900 dark:text-white">
                        {w.customerName}
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums font-bold text-rose-600 dark:text-rose-400">
                        − {formatAZN(w.amount)}
                      </td>
                      <td className="py-2 px-3 uppercase font-bold text-[10px] text-zinc-600 dark:text-zinc-300">
                        {w.paymentMethod}
                      </td>
                      <td className="py-2 px-3 font-mono text-[11px] text-zinc-500 whitespace-nowrap">
                        {w.time}
                      </td>
                      <td className="py-2 px-3 text-[11px] text-zinc-500 truncate max-w-[140px]">
                        {w.note || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Staff × Payment Method Breakdown & Sold Products */}
      <StaffPaymentBreakdown defaultDate={selectedDate} />

      {/* Daily Drawer Verification Form */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <form
          onSubmit={handleSave}
          className="lg:col-span-7 bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 p-6 space-y-5"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-zinc-200 dark:border-zinc-800">
            <h3 className="text-base font-bold text-zinc-900 dark:text-white">
              {formatDateAZ(selectedDate)} Tarixli Kassa Təsdiqi
            </h3>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              Satış + borc ödənişlərindən hesablanıb
            </span>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Banknote className="w-4 h-4" />
                <span>Nağd Kassa (AZN)</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={cashInput}
                onChange={e => setCashInput(e.target.value)}
                className="w-full px-4 py-2.5 text-base font-mono tabular-nums font-bold rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <CreditCard className="w-4 h-4" />
                <span>Bank Kartı (AZN)</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={cardInput}
                onChange={e => setCardInput(e.target.value)}
                className="w-full px-4 py-2.5 text-base font-mono tabular-nums font-bold rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-red-600 dark:text-red-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Smartphone className="w-4 h-4" />
                <span>POS Terminal (AZN)</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={posInput}
                onChange={e => setPosInput(e.target.value)}
                className="w-full px-4 py-2.5 text-base font-mono tabular-nums font-bold rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1.5">
                Qeyd və Şərhlər
              </label>
              <input
                type="text"
                value={reportNotes}
                onChange={e => setReportNotes(e.target.value)}
                placeholder="məs: Kassa tam uyğundur, növbə təhvil verildi"
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="text-[10px] text-zinc-500 dark:text-zinc-400 uppercase font-bold block">
                Hesablanan Kassa Cəmi
              </span>
              <span className="text-xl font-black font-mono tabular-nums text-zinc-900 dark:text-white">
                {formatAZN(currentTotal)}
              </span>
            </div>

            <button
              type="submit"
              style={{ backgroundColor: settings.primaryColor || '#dc2626' }}
              className="py-3 px-6 hover:opacity-95 text-white font-bold text-xs rounded-xl transition-all shadow-md flex items-center gap-2 active:scale-95"
            >
              <Save className="w-4 h-4" />
              <span>Gündəlik Hesabatı Təsdiqlə və Saxla</span>
            </button>
          </div>
        </form>

        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 p-6 space-y-4">
            <h4 className="text-sm font-bold text-zinc-900 dark:text-white">
              Kassa və Sistem Uyğunluğu Yoxlanışı
            </h4>

            <div
              className={`p-4 rounded-2xl border ${
                isMatch
                  ? 'bg-emerald-50 dark:bg-zinc-950 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300'
                  : 'bg-red-50 dark:bg-zinc-950 border-red-200 dark:border-red-900 text-red-800 dark:text-red-300'
              }`}
            >
              <div className="flex items-center gap-2 font-bold text-sm">
                {isMatch ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
                )}
                <span>
                  {isMatch ? 'Uyğundur: Kassa və Sistem Fərqi 0-dır' : 'Fərq var – yoxlayın!'}
                </span>
              </div>
              {!isMatch && (
                <p className="text-xs mt-1.5">
                  Fərq:{' '}
                  <strong className="font-mono tabular-nums">
                    {discrepancy > 0
                      ? `+${formatAZN(discrepancy)} artıq`
                      : `${formatAZN(discrepancy)} əskik`}
                  </strong>
                  . Daxil edilən kassa məbləği ilə günün faktiki daxilolması arasında fərq var.
                </p>
              )}
            </div>

            <div className="divide-y divide-zinc-200 dark:divide-zinc-800 text-xs">
              <div className="py-2.5 flex justify-between">
                <span className="text-zinc-500 dark:text-zinc-400">Daxil Edilən Kassa Cəmi:</span>
                <span className="font-mono tabular-nums font-bold text-zinc-900 dark:text-white">
                  {formatAZN(currentTotal)}
                </span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-zinc-500 dark:text-zinc-400">Satışdan Gələn (Nağd/Kart/POS):</span>
                <span className="font-mono tabular-nums font-semibold text-zinc-800 dark:text-zinc-200">
                  {formatAZN(dayInflowStats.salesTotal)}
                </span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-zinc-500 dark:text-zinc-400">
                  Əvvəlki Borc Ödənişindən ({dayInflowStats.debtPaymentsCount} əd.):
                </span>
                <span className="font-mono tabular-nums font-semibold text-amber-600 dark:text-amber-400">
                  {formatAZN(dayInflowStats.debtTotal)}
                </span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-zinc-700 dark:text-zinc-300 font-semibold">
                  Gözlənilən Faktiki Daxilolma:
                </span>
                <span className="font-mono tabular-nums font-bold text-zinc-900 dark:text-white">
                  {formatAZN(dayInflowStats.expectedTotal)}
                </span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-zinc-500 dark:text-zinc-400">Fərq Məbləği:</span>
                <span
                  className={`font-mono tabular-nums font-bold ${
                    isMatch ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {formatAZN(discrepancy)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* MONTHLY REPORT ACCUMULATION (ADMIN ONLY) */}
      {isAdmin ? (
        <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-zinc-200 dark:border-zinc-800">
            <div>
              <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                Aylıq Kassa Yığımı (Nağd / Kart / POS)
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Seçilmiş ay üzrə bütün təsdiqlənmiş gündəlik hesabatların cəmi
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="month"
                value={selectedMonth}
                onChange={e => setSelectedMonth(e.target.value)}
                className="font-mono text-xs font-bold px-3 py-1.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block">
                Aylıq Nağd
              </span>
              <span className="text-lg font-black font-mono tabular-nums text-zinc-900 dark:text-white mt-1 block">
                {formatAZN(monthCash)}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 block">
                Aylıq Bank Kartı
              </span>
              <span className="text-lg font-black font-mono tabular-nums text-zinc-900 dark:text-white mt-1 block">
                {formatAZN(monthCard)}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
              <span className="text-[10px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400 block">
                Aylıq POS Terminal
              </span>
              <span className="text-lg font-black font-mono tabular-nums text-zinc-900 dark:text-white mt-1 block">
                {formatAZN(monthPos)}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800">
              <span className="text-[10px] font-bold uppercase tracking-wider text-red-700 dark:text-red-300 block">
                Aylıq Ümumi Kassa
              </span>
              <span className="text-lg font-black font-mono tabular-nums text-red-700 dark:text-white mt-1 block">
                {formatAZN(monthTotal)}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-center text-xs text-zinc-500 dark:text-zinc-400 flex items-center justify-center gap-2">
          <Info className="w-4 h-4 text-zinc-500" />
          <span>
            İşçi rolunda yalnız günün kassa hesabatını daxil etmək və öz əməliyyatlarınızı görmək mümkündür. Aylıq və ümumi hesabatlar yalnız adminə görünür.
          </span>
        </div>
      )}
    </div>
  );
};
