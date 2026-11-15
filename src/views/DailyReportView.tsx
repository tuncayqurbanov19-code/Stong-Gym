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
import { TablePagination } from '../components/TablePagination';

type ProductMethodTab = ProductMethodBreakdownSummary['paymentMethod'];
const REPORT_PAGE_SIZE = 15;

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
  const primaryColor = settings.primaryColor || '#E32636';

  const todayISO = getTodayISODate();
  const [selectedDate, setSelectedDate] = useState(todayISO);
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthKey());

  // Product & Customer Search filters for detailed breakdown
  const [productSearch, setProductSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [productTabFilter, setProductTabFilter] = useState<ProductMethodTab>('all');
  const [expandedProductKey, setExpandedProductKey] = useState<string | null>(null);
  const [productBreakdownPage, setProductBreakdownPage] = useState(1);
  const [balProdPage, setBalProdPage] = useState(1);
  const [balCashPage, setBalCashPage] = useState(1);

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

  useEffect(() => {
    setProductBreakdownPage(1);
  }, [selectedDate, productTabFilter, productSearch, customerSearch]);

  useEffect(() => {
    setBalProdPage(1);
    setBalCashPage(1);
  }, [selectedDate]);

  const productBreakdownTotalPages = Math.max(
    1,
    Math.ceil(productBreakdownFiltered.items.length / REPORT_PAGE_SIZE)
  );
  const safeProductBreakdownPage = Math.min(productBreakdownPage, productBreakdownTotalPages);
  const paginatedProductBreakdown = productBreakdownFiltered.items.slice(
    (safeProductBreakdownPage - 1) * REPORT_PAGE_SIZE,
    safeProductBreakdownPage * REPORT_PAGE_SIZE
  );

  const balProdTotalPages = Math.max(1, Math.ceil(balanceProductWithdrawals.length / REPORT_PAGE_SIZE));
  const safeBalProdPage = Math.min(balProdPage, balProdTotalPages);
  const paginatedBalProdWithdrawals = balanceProductWithdrawals.slice(
    (safeBalProdPage - 1) * REPORT_PAGE_SIZE,
    safeBalProdPage * REPORT_PAGE_SIZE
  );

  const balCashTotalPages = Math.max(1, Math.ceil(balanceCashWithdrawalsList.length / REPORT_PAGE_SIZE));
  const safeBalCashPage = Math.min(balCashPage, balCashTotalPages);
  const paginatedBalCashWithdrawals = balanceCashWithdrawalsList.slice(
    (safeBalCashPage - 1) * REPORT_PAGE_SIZE,
    safeBalCashPage * REPORT_PAGE_SIZE
  );

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
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[#E5E5E5] dark:border-[#262626]">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-[#171717] dark:text-white tracking-tight">
            Gündəlik Kassa və Maliyyə Hesabatı
          </h2>
          <p className="text-xs sm:text-sm text-[#888888] mt-0.5">
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
            style={{ backgroundColor: primaryColor }}
            className="px-3.5 py-2 text-xs font-semibold text-white hover:opacity-90 rounded-[10px] transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Tam Hesabatı Excel-ə Yüklə</span>
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={() => exportDailyReportsToCSV(dailyReports)}
              className="px-3.5 py-2 text-xs font-semibold bg-white dark:bg-[#222222] border border-[#E5E5E5] dark:border-[#262626] hover:bg-[#F5F5F5] dark:hover:bg-[#2B2B2B] text-[#171717] dark:text-white rounded-[10px] transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5 text-[#888888]" />
              <span>Kassa Jurnalı</span>
            </button>
          )}
        </div>
      </div>

      {/* Top Filter Toolbar */}
      <div className="p-4 bg-white dark:bg-[#171717] rounded-[14px] border border-[#E5E5E5] dark:border-[#262626] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider text-[#888888] block mb-1.5">
            Hesabat Tarixi {isAdmin ? '(Admin seçə bilər)' : '(Bugünkü gün)'}
          </label>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[#E32636] shrink-0" />
            {isAdmin ? (
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                aria-label="Hesabat tarixi"
                className="w-full px-3 py-1.5 text-xs font-mono tabular-nums font-semibold rounded-[10px] border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#E32636]"
              />
            ) : (
              <span className="font-mono text-sm font-bold text-[#171717] dark:text-white">
                {formatDateAZ(todayISO)} (Bugün)
              </span>
            )}
          </div>
        </div>

        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider text-[#888888] block mb-1.5">
            Məhsul Üzrə Axtarış
          </label>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#888888]" />
            <input
              type="text"
              value={productSearch}
              onChange={e => setProductSearch(e.target.value)}
              placeholder="məs: Su, Protein..."
              className="w-full pl-8 pr-7 py-1.5 text-xs rounded-[10px] border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-white placeholder:text-[#888888] focus:outline-none focus:ring-2 focus:ring-[#E32636]"
            />
            {productSearch && (
              <button
                type="button"
                onClick={() => setProductSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[#888888] hover:text-[#171717] dark:hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider text-[#888888] block mb-1.5">
            Müştəri Üzrə Axtarış
          </label>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#888888]" />
            <input
              type="text"
              value={customerSearch}
              onChange={e => setCustomerSearch(e.target.value)}
              placeholder="Müştəri adı..."
              className="w-full pl-8 pr-7 py-1.5 text-xs rounded-[10px] border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-white placeholder:text-[#888888] focus:outline-none focus:ring-2 focus:ring-[#E32636]"
            />
            {customerSearch && (
              <button
                type="button"
                onClick={() => setCustomerSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[#888888] hover:text-[#171717] dark:hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between lg:justify-end gap-2">
          {isSavedSuccess ? (
            <div className="px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/25 text-emerald-700 dark:text-emerald-300 rounded-[10px] text-xs font-semibold flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              <span>Yadda saxlanıldı</span>
            </div>
          ) : (
            <div className="text-right">
              <span className="text-[10px] uppercase font-semibold text-[#888888] block font-mono">
                {formatDateAZ(selectedDate)}
              </span>
              <span className="text-xs font-semibold text-[#171717] dark:text-zinc-200 font-mono tabular-nums">
                {dayMetrics.salesCount} aktiv satış · {dayMetrics.totalItemsSold} ədəd
              </span>
            </div>
          )}
        </div>
      </div>

      {dayMetrics.cancelledSalesCount > 0 && (
        <div className="px-4 py-2.5 rounded-[12px] bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
          <Info className="w-4 h-4 shrink-0" />
          <span>
            Seçilmiş tarixdə <strong>{dayMetrics.cancelledSalesCount} ədəd ləğv edilmiş satış</strong> var — satış dövriyyəsindən və faktiki kassadan avtomatik çıxarılıb.
          </span>
        </div>
      )}

      {/* SECTIONS A, B, C */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* SECTION A */}
        <div className="p-5 rounded-[14px] bg-white dark:bg-[#171717] border border-[#E5E5E5] dark:border-[#262626] flex flex-col justify-between space-y-4">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#888888]">
                A. Ümumi Satış Dövriyyəsi
              </span>
              <TrendingUp className="w-4 h-4 text-[#888888]" />
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-[#171717] dark:text-white">
              {formatAZN(dayMetrics.grossSalesTotal)}
            </div>
            <p className="text-[11px] text-[#888888] font-mono tabular-nums">
              {dayMetrics.salesCount} satış · {dayMetrics.totalItemsSold} ədəd məhsul
            </p>
          </div>

          <div className="divide-y divide-[#E5E5E5] dark:divide-[#262626] text-xs">
            <div className="py-2 flex items-center justify-between">
              <span className="text-[#888888]">Nağd satış</span>
              <span className="font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400">
                {formatAZN(dayMetrics.cashSales)}
              </span>
            </div>
            <div className="py-2 flex items-center justify-between">
              <span className="text-[#888888]">Kartla satış</span>
              <span className="font-mono tabular-nums font-bold text-blue-600 dark:text-blue-400">
                {formatAZN(dayMetrics.cardSales)}
              </span>
            </div>
            <div className="py-2 flex items-center justify-between">
              <span className="text-[#888888]">POS / Köçürmə</span>
              <span className="font-mono tabular-nums font-bold text-[#171717] dark:text-white">
                {formatAZN(dayMetrics.posSales)}
              </span>
            </div>
            <div className="py-2 flex items-center justify-between">
              <span className="text-[#E32636] font-medium">Nisyə (Borc) satış</span>
              <span className="font-mono tabular-nums font-bold text-[#E32636]">
                {formatAZN(dayMetrics.creditSales)}
              </span>
            </div>
            <div className="py-2 flex items-center justify-between">
              <span className="text-cyan-600 dark:text-cyan-400 font-medium">Balansdan məhsul götürülməsi</span>
              <span className="font-mono tabular-nums font-bold text-cyan-600 dark:text-cyan-400">
                {formatAZN(dayMetrics.balanceSales)}
              </span>
            </div>
            <div className="py-2 flex items-center justify-between text-[11px]">
              <span className="text-[#888888]">Verilən endirimlər</span>
              <span className="font-mono tabular-nums font-semibold text-amber-600 dark:text-amber-400">
                {formatAZN(dayMetrics.totalDiscounts)}
              </span>
            </div>
          </div>

          <div className="pt-2 border-t border-[#E5E5E5] dark:border-[#262626] text-[10px] text-[#888888]">
            Ümumi satış = Nağd + Kart + POS + Borc + Balansdan məhsul
          </div>
        </div>

        {/* SECTION B */}
        <div className="p-5 rounded-[14px] bg-white dark:bg-[#171717] border border-emerald-500/30 flex flex-col justify-between space-y-4">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
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

            <div className="divide-y divide-[#E5E5E5] dark:divide-[#262626] text-xs">
              <div className="py-2 flex items-center justify-between">
                <span className="text-[#888888]">Satışdan Nağd</span>
                <span className="font-mono tabular-nums font-bold text-[#171717] dark:text-white">
                  {formatAZN(dayMetrics.cashSales)}
                </span>
              </div>
              <div className="py-2 flex items-center justify-between">
                <span className="text-[#888888]">Satışdan Bank Kartı</span>
                <span className="font-mono tabular-nums font-bold text-[#171717] dark:text-white">
                  {formatAZN(dayMetrics.cardSales)}
                </span>
              </div>
              <div className="py-2 flex items-center justify-between">
                <span className="text-[#888888]">Satışdan POS Terminal</span>
                <span className="font-mono tabular-nums font-bold text-[#171717] dark:text-white">
                  {formatAZN(dayMetrics.posSales)}
                </span>
              </div>
              <div className="py-2 flex items-center justify-between">
                <span className="text-amber-600 dark:text-amber-400 font-semibold">
                  Əvvəlki borcların ödənişi ({dayMetrics.debtCollectedCount} əd.)
                </span>
                <span className="font-mono tabular-nums font-bold text-amber-600 dark:text-amber-400">
                  +{formatAZN(dayMetrics.debtCollectedTotal)}
                </span>
              </div>
              {dayMetrics.debtCollectedTotal > 0 && (
                <div className="py-2 flex items-center justify-between text-[11px] text-[#888888] font-mono tabular-nums">
                  <span>Borc ödəniş bölgüsü:</span>
                  <span>
                    Nağd {formatAZN(dayMetrics.debtCollectedCash)} · Kart {formatAZN(dayMetrics.debtCollectedCard)} · POS {formatAZN(dayMetrics.debtCollectedPos)}
                  </span>
                </div>
              )}
              <div className="py-2 flex items-center justify-between bg-emerald-500/10 px-2.5 rounded-[8px] font-bold">
                <span className="text-emerald-700 dark:text-emerald-300">Yekun Faktiki Daxilolma</span>
                <span className="font-mono tabular-nums text-emerald-700 dark:text-emerald-300">
                  {formatAZN(dayMetrics.actualDrawerInflow)}
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-[#E5E5E5] dark:border-[#262626] text-[10px] text-[#888888]">
              Balans açılışı/artımı ({formatAZN(dayMetrics.balanceDepositsTotal)}) satış gəliri deyil
            </div>
          </div>

          {/* SECTION C */}
          <div className="p-5 rounded-[14px] bg-white dark:bg-[#171717] border border-[#E5E5E5] dark:border-[#262626] flex flex-col justify-between space-y-4">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#888888]">
                  C. Pul Çıxışları və Xalis Kassa
                </span>
                <AlertTriangle className="w-4 h-4 text-amber-500" />
              </div>
              <div
                className={`text-2xl font-bold font-mono tabular-nums ${
                  dayMetrics.netCashBalance >= 0
                    ? 'text-[#171717] dark:text-white'
                    : 'text-[#E32636]'
                }`}
              >
                {formatAZN(dayMetrics.netCashBalance)}
              </div>
              <p className="text-[11px] text-[#888888]">
                Kassada olması lazım olan xalis məbləğ (Daxil − Çıxış)
              </p>
            </div>

            <div className="divide-y divide-[#E5E5E5] dark:divide-[#262626] text-xs">
              <div className="py-2 flex items-center justify-between">
                <span className="text-[#888888]">Mal alışı (Depo)</span>
                <span className="font-mono tabular-nums font-bold text-[#E32636]">
                  − {formatAZN(dayMetrics.purchasesOutflow)}
                </span>
              </div>
              <div className="py-2 flex items-center justify-between">
                <span className="text-[#888888]">Digər xərclər</span>
                <span className="font-mono tabular-nums font-bold text-[#E32636]">
                  − {formatAZN(dayMetrics.expensesOutflow)}
                </span>
              </div>
              <div className="py-2 flex items-center justify-between">
                <span className="text-[#888888]">Balansdan sərbəst pul çıxışı</span>
                <span className="font-mono tabular-nums font-bold text-[#E32636]">
                  − {formatAZN(dayMetrics.balanceCashWithdrawals)}
                </span>
              </div>
              <div className="py-2 flex items-center justify-between font-bold">
                <span className="text-[#171717] dark:text-white">Ümumi Pul Çıxışı</span>
                <span className="font-mono tabular-nums text-[#E32636]">
                  − {formatAZN(dayMetrics.totalCashOutflow)}
                </span>
              </div>
              <div className="py-2 flex items-center justify-between">
                <span className="text-[#888888]">Sistem üzrə aktiv borc qalığı</span>
                <span className="font-mono tabular-nums font-bold text-[#E32636]">
                  {formatAZN(dayMetrics.totalUnpaidDebts)}
                </span>
              </div>
              <div className="py-2 flex items-center justify-between">
                <span className="text-[#888888]">Günün xalis gəliri (Satış − Alış/Xərc)</span>
                <span
                  className={`font-mono tabular-nums font-bold ${
                    dayProfit.isProfit ? 'text-emerald-600 dark:text-emerald-400' : 'text-[#E32636]'
                  }`}
                >
                  {formatAZN(dayProfit.netProfit)}
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-[#E5E5E5] dark:border-[#262626] text-[10px] text-[#888888]">
              Faktiki daxilolma: {formatAZN(dayMetrics.actualDrawerInflow)} − Çıxış: {formatAZN(dayMetrics.totalCashOutflow)}
            </div>
          </div>
      </section>

      {/* ÖDƏNİŞ NÖVÜNƏ GÖRƏ MƏHSUL ÜZRƏ DETALLI HESABAT */}
      <section className="bg-white dark:bg-[#171717] rounded-[14px] border border-[#E5E5E5] dark:border-[#262626] overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-[#E5E5E5] dark:border-[#262626] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-[#171717] dark:text-white flex items-center gap-2">
              <PackageCheck className="w-4 h-4 text-[#E32636]" />
              <span>Ödəniş Növünə Görə Məhsul Üzrə Detallı Hesabat</span>
            </h3>
            <p className="text-xs text-[#888888] mt-0.5">
              Hansı məhsulun neçə ədəd və hansı ödəniş növü ilə satıldığını görmək üçün məhsul sətrinə klikləyin
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1 p-1 bg-[#F5F5F5] dark:bg-[#222222] border border-[#E5E5E5] dark:border-[#262626] rounded-[10px]">
            {productTabs.map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setProductTabFilter(tab.id);
                  setExpandedProductKey(null);
                }}
                style={productTabFilter === tab.id ? { backgroundColor: primaryColor } : undefined}
                className={`px-2.5 py-1.5 text-xs font-semibold rounded-[8px] transition-all whitespace-nowrap flex items-center gap-1.5 ${
                  productTabFilter === tab.id
                    ? 'text-white shadow-xs'
                    : 'text-[#888888] hover:text-[#171717] dark:hover:text-white'
                }`}
              >
                <span>{tab.label}</span>
                <span className={`text-[10px] font-mono tabular-nums ${productTabFilter === tab.id ? 'opacity-90' : 'text-[#888888]'}`}>
                  {formatAZN(tab.amount)}
                </span>
              </button>
            ))}
          </div>
        </div>

        {productBreakdownFiltered.items.length === 0 ? (
          <div className="py-12 text-center text-xs text-[#888888]">
            Seçilmiş tarix və filtrlər üzrə məhsul satışı tapılmadı.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[600px]">
                <thead className="bg-[#FAFAFA] dark:bg-[#141414] text-[10px] uppercase tracking-wider text-[#888888] border-b border-[#E5E5E5] dark:border-[#262626] font-semibold">
                  <tr>
                    <th className="py-3 px-4">Məhsul</th>
                    <th className="py-3 px-4 text-right">Satılan Say</th>
                    <th className="py-3 px-4 text-right">Orta Vahid Qiymət</th>
                    <th className="py-3 px-4 text-right">Cəmi Məbləğ</th>
                    <th className="py-3 px-4 text-center">Detal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E5E5] dark:divide-[#262626]">
                  {paginatedProductBreakdown.map(row => {
                    const rowKey = `${row.productId}:${row.productName}`;
                    const isExpanded = expandedProductKey === rowKey;
                    return (
                      <React.Fragment key={rowKey}>
                        <tr
                          onClick={() => setExpandedProductKey(isExpanded ? null : rowKey)}
                          className="cursor-pointer hover:bg-[#FAFAFA] dark:hover:bg-[#222222]/50 transition-colors"
                        >
                          <td className="py-3 px-4 font-semibold text-[#171717] dark:text-white">
                            {row.productName}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-[#171717] dark:text-zinc-300">
                            {row.quantity} əd.
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-[#888888]">
                            {formatAZN(row.unitPrice)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-[#171717] dark:text-white">
                            {formatAZN(row.totalAmount)}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[8px] bg-[#F5F5F5] dark:bg-[#222222] border border-[#E5E5E5] dark:border-[#2E2E2E] text-[10px] font-semibold text-[#888888] whitespace-nowrap">
                              <span>{row.occurrences.length} əməliyyat</span>
                              {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </span>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr className="bg-[#FAFAFA] dark:bg-[#141414]">
                            <td colSpan={5} className="px-6 py-3">
                              <div className="rounded-[10px] border border-[#E5E5E5] dark:border-[#262626] bg-white dark:bg-[#171717] overflow-hidden">
                                <table className="w-full text-left text-[11px]">
                                  <thead className="bg-[#F5F5F5] dark:bg-[#222222] text-[#888888] uppercase text-[10px] border-b border-[#E5E5E5] dark:border-[#262626]">
                                    <tr>
                                      <th className="py-2 px-3">Saat</th>
                                      <th className="py-2 px-3 text-right">Say</th>
                                      <th className="py-2 px-3 text-right">Məbləğ</th>
                                      <th className="py-2 px-3">Ödəniş Növü</th>
                                      <th className="py-2 px-3">Müştəri</th>
                                      <th className="py-2 px-3">Məsul Əməkdaş</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-[#E5E5E5] dark:divide-[#262626]">
                                    {row.occurrences.map((occ, idx) => (
                                      <tr key={`${occ.saleId}-${idx}`}>
                                        <td className="py-2 px-3 font-mono tabular-nums text-[#888888]">
                                          {occ.time || '—'}
                                        </td>
                                        <td className="py-2 px-3 text-right font-mono tabular-nums font-semibold">
                                          {occ.quantity} əd.
                                        </td>
                                        <td className="py-2 px-3 text-right font-mono tabular-nums font-bold text-[#171717] dark:text-white">
                                          {formatAZN(occ.amount)}
                                        </td>
                                        <td className="py-2 px-3 font-semibold text-[#171717] dark:text-zinc-300">
                                          {occ.paymentLabel}
                                        </td>
                                        <td className="py-2 px-3 text-[#171717] dark:text-zinc-300">
                                          {occ.customerName || '—'}
                                        </td>
                                        <td className="py-2 px-3 font-mono text-[#888888]">
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
                <tfoot className="bg-[#FAFAFA] dark:bg-[#141414] border-t border-[#E5E5E5] dark:border-[#262626] font-bold text-[#171717] dark:text-white">
                  <tr>
                    <td className="py-3 px-4 uppercase text-[11px] tracking-wider">CƏMİ</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      {productBreakdownFiltered.totalQuantity} əd.
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-[#888888]">—</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-sm">
                      {formatAZN(productBreakdownFiltered.totalAmount)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
            <TablePagination
              totalItems={productBreakdownFiltered.items.length}
              pageSize={REPORT_PAGE_SIZE}
              currentPage={safeProductBreakdownPage}
              onPageChange={setProductBreakdownPage}
              primaryColor={primaryColor}
            />
          </>
        )}
      </section>

      {/* Balansdan Məhsul & Sərbəst Pul Çıxarışları */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-[#171717] rounded-[14px] border border-[#E5E5E5] dark:border-[#262626] overflow-hidden flex flex-col justify-between">
          <div>
            <div className="px-4 py-3.5 border-b border-[#E5E5E5] dark:border-[#262626] flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-[#171717] dark:text-white flex items-center gap-1.5">
                  <ShoppingBag className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                  <span>Balansdan Məhsul Çıxarışları</span>
                </h4>
                <p className="text-[10px] text-[#888888]">
                  Satış dövriyyəsinə daxildir · Depodan çıxılıb · Kassaya əlavə edilmir
                </p>
              </div>
              <span className="font-mono tabular-nums text-xs font-bold text-cyan-600 dark:text-cyan-400">
                {formatAZN(dayMetrics.balanceSales)}
              </span>
            </div>

            {balanceProductWithdrawals.length === 0 ? (
              <p className="p-6 text-center text-xs text-[#888888]">
                Seçilmiş gündə balansdan məhsul çıxarışı olmayıb.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs min-w-[500px]">
                  <thead className="bg-[#FAFAFA] dark:bg-[#141414] text-[10px] uppercase text-[#888888] border-b border-[#E5E5E5] dark:border-[#262626]">
                    <tr>
                      <th className="py-2.5 px-3.5">Məhsul</th>
                      <th className="py-2.5 px-3.5 text-right">Say</th>
                      <th className="py-2.5 px-3.5 text-right">Cəmi</th>
                      <th className="py-2.5 px-3.5">Müştəri</th>
                      <th className="py-2.5 px-3.5">Saat / Məsul</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E5E5] dark:divide-[#262626]">
                    {paginatedBalProdWithdrawals.map(item => (
                      <tr key={item.id} className="hover:bg-[#FAFAFA] dark:hover:bg-[#222222]/50">
                        <td className="py-2.5 px-3.5 font-semibold text-[#171717] dark:text-white">
                          {item.productName}
                        </td>
                        <td className="py-2.5 px-3.5 text-right font-mono tabular-nums">
                          {item.quantity} əd.
                        </td>
                        <td className="py-2.5 px-3.5 text-right font-mono tabular-nums font-bold text-cyan-600 dark:text-cyan-400">
                          {formatAZN(item.totalAmount)}
                        </td>
                        <td className="py-2.5 px-3.5 font-medium text-[#171717] dark:text-zinc-200">
                          {item.customerName}
                        </td>
                        <td className="py-2.5 px-3.5 font-mono text-[11px] text-[#888888] whitespace-nowrap">
                          {item.time} · @{item.createdBy}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <TablePagination
            totalItems={balanceProductWithdrawals.length}
            pageSize={REPORT_PAGE_SIZE}
            currentPage={safeBalProdPage}
            onPageChange={setBalProdPage}
            primaryColor={primaryColor}
          />
        </div>

        <div className="bg-white dark:bg-[#171717] rounded-[14px] border border-[#E5E5E5] dark:border-[#262626] overflow-hidden flex flex-col justify-between">
          <div>
            <div className="px-4 py-3.5 border-b border-[#E5E5E5] dark:border-[#262626] flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-[#171717] dark:text-white flex items-center gap-1.5">
                  <ArrowUpRight className="w-3.5 h-3.5 text-[#E32636]" />
                  <span>Balansdan Sərbəst Pul Çıxarışları</span>
                </h4>
                <p className="text-[10px] text-[#888888]">
                  Satış gəliri deyil · Kassa çıxışı kimi hesablanır
                </p>
              </div>
              <span className="font-mono tabular-nums text-xs font-bold text-[#E32636]">
                − {formatAZN(dayMetrics.balanceCashWithdrawals)}
              </span>
            </div>

            {balanceCashWithdrawalsList.length === 0 ? (
              <p className="p-6 text-center text-xs text-[#888888]">
                Seçilmiş gündə balansdan sərbəst pul çıxarışı olmayıb.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs min-w-[440px]">
                  <thead className="bg-[#FAFAFA] dark:bg-[#141414] text-[10px] uppercase text-[#888888] border-b border-[#E5E5E5] dark:border-[#262626]">
                    <tr>
                      <th className="py-2.5 px-3.5">Müştəri</th>
                      <th className="py-2.5 px-3.5 text-right">Məbləğ (−)</th>
                      <th className="py-2.5 px-3.5">Üsul</th>
                      <th className="py-2.5 px-3.5">Saat</th>
                      <th className="py-2.5 px-3.5">Qeyd</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E5E5] dark:divide-[#262626]">
                    {paginatedBalCashWithdrawals.map(w => (
                      <tr key={w.id} className="hover:bg-[#FAFAFA] dark:hover:bg-[#222222]/50">
                        <td className="py-2.5 px-3.5 font-semibold text-[#171717] dark:text-white">
                          {w.customerName}
                        </td>
                        <td className="py-2.5 px-3.5 text-right font-mono tabular-nums font-bold text-[#E32636]">
                          − {formatAZN(w.amount)}
                        </td>
                        <td className="py-2.5 px-3.5 uppercase font-bold text-[10px] text-[#888888]">
                          {w.paymentMethod}
                        </td>
                        <td className="py-2.5 px-3.5 font-mono text-[11px] text-[#888888] whitespace-nowrap">
                          {w.time}
                        </td>
                        <td className="py-2.5 px-3.5 text-[11px] text-[#888888] truncate max-w-[140px]">
                          {w.note || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <TablePagination
            totalItems={balanceCashWithdrawalsList.length}
            pageSize={REPORT_PAGE_SIZE}
            currentPage={safeBalCashPage}
            onPageChange={setBalCashPage}
            primaryColor={primaryColor}
          />
        </div>
      </section>

      {/* Staff × Payment Method Breakdown & Sold Products */}
      <StaffPaymentBreakdown defaultDate={selectedDate} />

      {/* Daily Drawer Verification Form */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <form
          onSubmit={handleSave}
          className="lg:col-span-7 bg-white dark:bg-[#171717] rounded-[14px] border border-[#E5E5E5] dark:border-[#262626] p-6 space-y-5"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#E5E5E5] dark:border-[#262626]">
            <h3 className="text-base font-bold text-[#171717] dark:text-white">
              {formatDateAZ(selectedDate)} Tarixli Kassa Təsdiqi
            </h3>
            <span className="text-xs text-[#888888]">
              Satış + borc ödənişlərindən hesablanıb
            </span>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
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
                className="w-full px-4 py-2.5 text-base font-mono tabular-nums font-bold rounded-[10px] border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
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
                className="w-full px-4 py-2.5 text-base font-mono tabular-nums font-bold rounded-[10px] border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#E32636] uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
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
                className="w-full px-4 py-2.5 text-base font-mono tabular-nums font-bold rounded-[10px] border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#E32636]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#888888] uppercase tracking-wider mb-1.5">
                Qeyd və Şərhlər
              </label>
              <input
                type="text"
                value={reportNotes}
                onChange={e => setReportNotes(e.target.value)}
                placeholder="məs: Kassa tam uyğundur, növbə təhvil verildi"
                className="w-full px-3.5 py-2.5 text-sm rounded-[10px] border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-white placeholder:text-[#888888] focus:outline-none focus:ring-2 focus:ring-[#E32636]"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-[#E5E5E5] dark:border-[#262626] flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="text-[10px] text-[#888888] uppercase font-semibold block">
                Hesablanan Kassa Cəmi
              </span>
              <span className="text-xl font-bold font-mono tabular-nums text-[#171717] dark:text-white">
                {formatAZN(currentTotal)}
              </span>
            </div>

            <button
              type="submit"
              style={{ backgroundColor: primaryColor }}
              className="py-2.5 px-5 hover:opacity-90 text-white font-semibold text-xs rounded-[10px] transition-all flex items-center gap-2 whitespace-nowrap shadow-xs"
            >
              <Save className="w-4 h-4" />
              <span>Gündəlik Hesabatı Təsdiqlə və Saxla</span>
            </button>
          </div>
        </form>

        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white dark:bg-[#171717] rounded-[14px] border border-[#E5E5E5] dark:border-[#262626] p-6 space-y-4">
            <h4 className="text-sm font-bold text-[#171717] dark:text-white">
              Kassa və Sistem Uyğunluğu Yoxlanışı
            </h4>

            <div
              className={`p-4 rounded-[12px] border ${
                isMatch
                  ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-700 dark:text-emerald-300'
                  : 'bg-[#E32636]/10 border-[#E32636]/25 text-[#E32636]'
              }`}
            >
              <div className="flex items-center gap-2 font-bold text-sm">
                {isMatch ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-[#E32636]" />
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

            <div className="divide-y divide-[#E5E5E5] dark:divide-[#262626] text-xs">
              <div className="py-2.5 flex justify-between">
                <span className="text-[#888888]">Daxil Edilən Kassa Cəmi:</span>
                <span className="font-mono tabular-nums font-bold text-[#171717] dark:text-white">
                  {formatAZN(currentTotal)}
                </span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-[#888888]">Satışdan Gələn (Nağd/Kart/POS):</span>
                <span className="font-mono tabular-nums font-semibold text-[#171717] dark:text-zinc-200">
                  {formatAZN(dayInflowStats.salesTotal)}
                </span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-[#888888]">
                  Əvvəlki Borc Ödənişindən ({dayInflowStats.debtPaymentsCount} əd.):
                </span>
                <span className="font-mono tabular-nums font-semibold text-amber-600 dark:text-amber-400">
                  {formatAZN(dayInflowStats.debtTotal)}
                </span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-[#171717] dark:text-white font-semibold">
                  Gözlənilən Faktiki Daxilolma:
                </span>
                <span className="font-mono tabular-nums font-bold text-[#171717] dark:text-white">
                  {formatAZN(dayInflowStats.expectedTotal)}
                </span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-[#888888]">Fərq Məbləği:</span>
                <span
                  className={`font-mono tabular-nums font-bold ${
                    isMatch ? 'text-emerald-600 dark:text-emerald-400' : 'text-[#E32636]'
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
        <div className="bg-white dark:bg-[#171717] rounded-[14px] border border-[#E5E5E5] dark:border-[#262626] p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-[#E5E5E5] dark:border-[#262626]">
            <div>
              <h3 className="text-base font-bold text-[#171717] dark:text-white">
                Aylıq Kassa Yığımı (Nağd / Kart / POS)
              </h3>
              <p className="text-xs text-[#888888]">
                Seçilmiş ay üzrə bütün təsdiqlənmiş gündəlik hesabatların cəmi
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="month"
                value={selectedMonth}
                onChange={e => setSelectedMonth(e.target.value)}
                className="font-mono text-xs font-semibold px-3 py-1.5 rounded-[10px] border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-4 rounded-[12px] bg-[#FAFAFA] dark:bg-[#222222] border border-[#E5E5E5] dark:border-[#262626]">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block">
                Aylıq Nağd
              </span>
              <span className="text-lg font-bold font-mono tabular-nums text-[#171717] dark:text-white mt-1 block">
                {formatAZN(monthCash)}
              </span>
            </div>

            <div className="p-4 rounded-[12px] bg-[#FAFAFA] dark:bg-[#222222] border border-[#E5E5E5] dark:border-[#262626]">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400 block">
                Aylıq Bank Kartı
              </span>
              <span className="text-lg font-bold font-mono tabular-nums text-[#171717] dark:text-white mt-1 block">
                {formatAZN(monthCard)}
              </span>
            </div>

            <div className="p-4 rounded-[12px] bg-[#FAFAFA] dark:bg-[#222222] border border-[#E5E5E5] dark:border-[#262626]">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#E32636] block">
                Aylıq POS Terminal
              </span>
              <span className="text-lg font-bold font-mono tabular-nums text-[#171717] dark:text-white mt-1 block">
                {formatAZN(monthPos)}
              </span>
            </div>

            <div className="p-4 rounded-[12px] bg-[#E32636]/10 border border-[#E32636]/25">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#E32636] block">
                Aylıq Ümumi Kassa
              </span>
              <span className="text-lg font-bold font-mono tabular-nums text-[#171717] dark:text-white mt-1 block">
                {formatAZN(monthTotal)}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-4 rounded-[14px] bg-white dark:bg-[#171717] border border-[#E5E5E5] dark:border-[#262626] text-center text-xs text-[#888888] flex items-center justify-center gap-2">
          <Info className="w-4 h-4 text-[#888888]" />
          <span>
            İşçi rolunda yalnız günün kassa hesabatını daxil etmək və öz əməliyyatlarınızı görmək mümkündür. Aylıq və ümumi hesabatlar yalnız adminə görünür.
          </span>
        </div>
      )}
    </div>
  );
};
