import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  DollarSign,
  AlertTriangle,
  CreditCard,
  Banknote,
  Smartphone,
  CheckCircle2,
  Users,
  Download,
  Calendar,
  ArrowRight,
  PackageCheck,
  Layers,
  Droplets,
  Dumbbell,
  Sparkles,
  ChevronDown,
  ChevronUp,
  PieChart,
  ShoppingBag,
  Wallet,
  Clock,
  Filter,
  Warehouse,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { useApp } from '../context/AppContext';
import { formatAZN, formatDateAZ, getTodayISODate, getCurrentMonthKey } from '../utils/dateUtils';
import { calculateAllProductStocks, getLowStockProducts } from '../utils/stockCalculations';
import {
  calculatePaymentBreakdown,
  calculateProductSaleCounts,
  calculateNetProfit,
  checkDailyReportDiscrepancy,
  calculateDebtOverview,
  calculateCategoryBreakdown,
  calculateFinancialMetricsForRange,
  formatSalePaymentLabel,
} from '../utils/financialCalculations';
import { exportSalesToCSV } from '../utils/exportUtils';
import { TablePagination } from '../components/TablePagination';

export type DashboardPeriod = 'today' | 'week' | 'month' | 'custom';
export type DashboardSubTab = 'summary' | 'products' | 'finance' | 'stock';

export const DashboardView: React.FC<{ onNavigate: (tab: string) => void }> = ({ onNavigate }) => {
  const {
    products,
    purchases,
    sales,
    debts,
    customerAccounts,
    dailyReports,
    expenses,
    settings,
    theme,
  } = useApp();

  const isDark = theme === 'dark';
  const primaryColor = settings.primaryColor || '#E32636';

  // Period State: Günlük, Həftəlik, Aylıq, Xüsusi aralıq
  const [period, setPeriod] = useState<DashboardPeriod>('today');
  const todayISO = getTodayISODate();
  const currentMonth = getCurrentMonthKey();

  const [customStart, setCustomStart] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  });
  const [customEnd, setCustomEnd] = useState<string>(todayISO);

  // Sub-tab State: İcmal, Məhsullar, Maliyyə, Depo
  const [activeSubTab, setActiveSubTab] = useState<DashboardSubTab>('summary');
  const [stockPage, setStockPage] = useState(1);

  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    Su: true,
    Protein: true,
    Əlavələr: true,
    Digər: true,
  });

  const toggleCategoryExpand = (catName: string) => {
    setExpandedCategories((prev) => ({
      ...prev,
      [catName]: !prev[catName],
    }));
  };

  // Date Range calculation
  const dateRange = useMemo(() => {
    if (period === 'today') {
      return { startDate: todayISO, endDate: todayISO, label: 'Bu gün' };
    }
    if (period === 'week') {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return { startDate: `${y}-${m}-${day}`, endDate: todayISO, label: 'Son 7 gün' };
    }
    if (period === 'month') {
      return { startDate: `${currentMonth}-01`, endDate: todayISO, label: 'Bu ay' };
    }
    return {
      startDate: customStart || todayISO,
      endDate: customEnd || todayISO,
      label: `${formatDateAZ(customStart)} – ${formatDateAZ(customEnd)}`,
    };
  }, [period, todayISO, currentMonth, customStart, customEnd]);

  const confirmedSales = useMemo(() => sales.filter((s) => !s.isCancelled && s.isConfirmed), [sales]);

  const periodSales = useMemo(
    () => confirmedSales.filter((s) => s.date >= dateRange.startDate && s.date <= dateRange.endDate),
    [confirmedSales, dateRange]
  );

  const periodPurchases = useMemo(
    () => purchases.filter((p) => p.date >= dateRange.startDate && p.date <= dateRange.endDate),
    [purchases, dateRange]
  );

  const periodExpenses = useMemo(
    () => expenses.filter((e) => e.date >= dateRange.startDate && e.date <= dateRange.endDate),
    [expenses, dateRange]
  );

  const periodMetrics = useMemo(
    () =>
      calculateFinancialMetricsForRange({
        sales,
        debts,
        purchases,
        expenses,
        customerAccounts,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      }),
    [sales, debts, purchases, expenses, customerAccounts, dateRange]
  );

  const periodDebtCollected = periodMetrics.debtCollectedTotal;
  const periodRevenue = periodMetrics.grossSalesTotal;
  const periodPurchasesAmount = periodMetrics.purchasesOutflow;
  const periodExpensesAmount = periodMetrics.expensesOutflow;
  const periodProfit = useMemo(
    () => calculateNetProfit(periodRevenue, periodPurchasesAmount, periodExpensesAmount),
    [periodRevenue, periodPurchasesAmount, periodExpensesAmount]
  );

  const periodPayments = useMemo(() => calculatePaymentBreakdown(periodSales), [periodSales]);
  const combinedCash = periodMetrics.drawerCashInflow;
  const combinedCard = periodMetrics.drawerCardInflow;
  const combinedPos = periodMetrics.drawerPosInflow;
  const totalPaid = periodMetrics.actualDrawerInflow;

  const cashPct = totalPaid > 0 ? Math.round((combinedCash / totalPaid) * 100) : 0;
  const cardPct = totalPaid > 0 ? Math.round((combinedCard / totalPaid) * 100) : 0;
  const posPct = totalPaid > 0 ? Math.round((combinedPos / totalPaid) * 100) : 0;
  const balancePct = periodRevenue > 0 ? Math.round((periodMetrics.balanceSales / periodRevenue) * 100) : 0;

  const categorySummary = useMemo(
    () => calculateCategoryBreakdown(periodSales, products),
    [periodSales, products]
  );

  const productSaleStats = useMemo(() => calculateProductSaleCounts(periodSales), [periodSales]);

  // Stock calculations
  const allStocks = useMemo(
    () => calculateAllProductStocks(products, purchases, sales, settings.minStockThreshold),
    [products, purchases, sales, settings.minStockThreshold]
  );
  const allStocksList = useMemo(() => Object.values(allStocks), [allStocks]);
  const totalDepoUnits = useMemo(
    () => allStocksList.reduce((sum, s) => sum + Math.max(0, s.activeStock), 0),
    [allStocksList]
  );
  const lowStockItems = useMemo(
    () => getLowStockProducts(products, purchases, sales, settings.minStockThreshold),
    [products, purchases, sales, settings.minStockThreshold]
  );

  // Paginated Depo Stock table (15 rows/page)
  const STOCK_PAGE_SIZE = 15;
  const paginatedStocks = useMemo(() => {
    const start = (stockPage - 1) * STOCK_PAGE_SIZE;
    return allStocksList.slice(start, start + STOCK_PAGE_SIZE);
  }, [allStocksList, stockPage]);

  // Debt & Customer Balances overview
  const debtOverview = useMemo(() => calculateDebtOverview(debts), [debts]);
  const totalCustomerBalance = useMemo(
    () => customerAccounts.reduce((sum, c) => sum + c.balance, 0),
    [customerAccounts]
  );
  const totalDepositedAllTime = useMemo(
    () => customerAccounts.reduce((sum, c) => sum + c.totalDeposited, 0),
    [customerAccounts]
  );

  const todayDebtPayments = useMemo(
    () =>
      debts
        .filter((d) => !d.isCancelled)
        .flatMap((d) => d.payments || [])
        .filter((p) => !p.isUpfront && (p.paidAt || p.date || '').split('T')[0] === todayISO),
    [debts, todayISO]
  );
  const todayDebtTotal = useMemo(
    () => todayDebtPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0),
    [todayDebtPayments]
  );

  const todayReport = dailyReports.find((r) => r.date === todayISO);
  const discrepancy = checkDailyReportDiscrepancy(
    todayReport,
    sales.filter((s) => !s.isCancelled && s.date === todayISO),
    todayDebtPayments
  );

  // Sales timeline chart data
  const timelineChartData = useMemo(() => {
    if (period === 'today') {
      const hoursMap: Record<string, { amount: number; count: number; hourLabel: string }> = {};
      const standardHours = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '22:00'];
      for (const h of standardHours) {
        hoursMap[h] = { amount: 0, count: 0, hourLabel: h };
      }

      for (const s of periodSales) {
        const h = s.time ? parseInt(s.time.split(':')[0], 10) : 12;
        const roundedHour = Math.min(Math.max(Math.floor(h / 2) * 2, 8), 22);
        const slotKey = `${String(roundedHour).padStart(2, '0')}:00`;
        if (!hoursMap[slotKey]) {
          hoursMap[slotKey] = { amount: 0, count: 0, hourLabel: slotKey };
        }
        hoursMap[slotKey].amount = Math.round((hoursMap[slotKey].amount + (s.totalAmount || 0)) * 100) / 100;
        hoursMap[slotKey].count += 1;
      }

      return Object.values(hoursMap).map((item) => ({
        label: item.hourLabel,
        fullDate: `${formatDateAZ(todayISO)} saat ${item.hourLabel}`,
        amount: item.amount,
        salesCount: item.count,
      }));
    }

    if (period === 'week') {
      const points = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${day}`;
        const daySales = confirmedSales.filter((s) => s.date === dateStr);
        const dayTotal = daySales.reduce((sum, s) => sum + s.totalAmount, 0);
        points.push({
          label: `${day}.${m}`,
          fullDate: formatDateAZ(dateStr),
          amount: Math.round(dayTotal * 100) / 100,
          salesCount: daySales.length,
        });
      }
      return points;
    }

    if (period === 'month') {
      const points = [];
      const now = new Date();
      const currentDay = now.getDate();
      const currentMonthStr = getCurrentMonthKey();
      for (let dayNum = 1; dayNum <= currentDay; dayNum++) {
        const dayStr = String(dayNum).padStart(2, '0');
        const dateStr = `${currentMonthStr}-${dayStr}`;
        const daySales = confirmedSales.filter((s) => s.date === dateStr);
        const dayTotal = daySales.reduce((sum, s) => sum + s.totalAmount, 0);
        points.push({
          label: `${dayStr}.${currentMonthStr.split('-')[1]}`,
          fullDate: formatDateAZ(dateStr),
          amount: Math.round(dayTotal * 100) / 100,
          salesCount: daySales.length,
        });
      }
      return points;
    }

    const points = [];
    const start = new Date(dateRange.startDate);
    const end = new Date(dateRange.endDate);
    const diffDays = Math.min(Math.max(Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)), 1), 60);

    for (let i = 0; i <= diffDays; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${day}`;
      if (dateStr > dateRange.endDate) break;

      const daySales = confirmedSales.filter((s) => s.date === dateStr);
      const dayTotal = daySales.reduce((sum, s) => sum + s.totalAmount, 0);
      points.push({
        label: `${day}.${m}`,
        fullDate: formatDateAZ(dateStr),
        amount: Math.round(dayTotal * 100) / 100,
        salesCount: daySales.length,
      });
    }
    return points;
  }, [period, periodSales, confirmedSales, dateRange, todayISO]);

  const categoryNarrative = useMemo(() => {
    if (categorySummary.categories.length === 0) {
      return 'Bu dövrdə hələ ki heç bir təsdiqlənmiş satış qeydə alınmayıb.';
    }
    const parts = categorySummary.categories.map(
      (cat) => `${cat.categoryName}: ${formatAZN(cat.revenue)} (${cat.percentageOfTotal}%)`
    );
    return `Ümumi dövriyyə ${formatAZN(categorySummary.totalRevenue)} (${categorySummary.totalQuantity} ədəd məhsul). Bölgü: ${parts.join(' · ')}.`;
  }, [categorySummary]);

  const getCategoryTheme = (name: string) => {
    const norm = name.toLowerCase();
    if (norm.includes('su')) {
      return {
        badgeBg: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/30',
        barBg: 'bg-cyan-500',
        icon: <Droplets className="w-4 h-4 text-cyan-500" />,
      };
    }
    if (norm.includes('protein')) {
      return {
        badgeBg: 'bg-[#E32636]/10 text-[#E32636] border-[#E32636]/30',
        barBg: 'bg-[#E32636]',
        icon: <Dumbbell className="w-4 h-4 text-[#E32636]" />,
      };
    }
    if (norm.includes('əlavə') || norm.includes('elave')) {
      return {
        badgeBg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
        barBg: 'bg-amber-500',
        icon: <Sparkles className="w-4 h-4 text-amber-500" />,
      };
    }
    return {
      badgeBg: 'bg-[#F5F5F5] dark:bg-[#222222] text-[#525252] dark:text-zinc-300 border-[#E5E5E5] dark:border-[#2E2E2E]',
      barBg: 'bg-[#888888]',
      icon: <Layers className="w-4 h-4 text-[#888888]" />,
    };
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Header & Period Switcher */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[#E5E5E5] dark:border-[#262626]">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#171717] dark:text-white tracking-tight">
            Dashboard & Xülasə
          </h1>
          <p className="text-xs sm:text-sm text-[#888888] mt-0.5">
            Aktiv dövr: <span className="font-medium text-[#171717] dark:text-zinc-200">{dateRange.label}</span> · Valyuta: AZN
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center p-1 bg-white dark:bg-[#171717] border border-[#E5E5E5] dark:border-[#262626] rounded-[12px]">
            {(
              [
                { id: 'today', label: 'Günlük' },
                { id: 'week', label: 'Həftəlik' },
                { id: 'month', label: 'Aylıq' },
              ] as { id: DashboardPeriod; label: string }[]
            ).map((btn) => (
              <button
                key={btn.id}
                type="button"
                onClick={() => setPeriod(btn.id)}
                style={period === btn.id ? { backgroundColor: primaryColor } : undefined}
                className={`px-3 py-1.5 text-xs font-semibold rounded-[8px] transition-colors whitespace-nowrap ${
                  period === btn.id
                    ? 'text-white'
                    : 'text-[#888888] hover:text-[#171717] dark:hover:text-white'
                }`}
              >
                {btn.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPeriod('custom')}
              style={period === 'custom' ? { backgroundColor: primaryColor } : undefined}
              className={`px-3 py-1.5 text-xs font-semibold rounded-[8px] transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                period === 'custom'
                  ? 'text-white'
                  : 'text-[#888888] hover:text-[#171717] dark:hover:text-white'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Tarix</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => exportSalesToCSV(periodSales)}
            className="px-3 py-2 text-xs font-semibold bg-white dark:bg-[#171717] border border-[#E5E5E5] dark:border-[#262626] hover:bg-[#FAFAFA] dark:hover:bg-[#222222] text-[#171717] dark:text-white rounded-[10px] transition-colors flex items-center gap-1.5 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5 text-[#888888]" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('pos')}
            style={{ backgroundColor: primaryColor }}
            className="px-3.5 py-2 text-xs font-semibold text-white rounded-[10px] transition-opacity hover:opacity-95 flex items-center gap-1.5 whitespace-nowrap"
          >
            <span>Yeni Satış</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Custom Date Range */}
      {period === 'custom' && (
        <div className="p-4 rounded-[14px] bg-white dark:bg-[#171717] border border-[#E5E5E5] dark:border-[#262626] flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#171717] dark:text-white">
            <Filter className="w-4 h-4 text-[#E32636]" />
            <span>Tarix Aralığı:</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-[#888888]">Başlanğıc:</span>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="px-3 py-1.5 rounded-[10px] bg-[#F5F5F5] dark:bg-[#222222] border border-[#E5E5E5] dark:border-[#2E2E2E] text-[#171717] dark:text-white text-xs font-mono focus:outline-none focus:border-[#E32636]"
            />
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-[#888888]">Son:</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="px-3 py-1.5 rounded-[10px] bg-[#F5F5F5] dark:bg-[#222222] border border-[#E5E5E5] dark:border-[#2E2E2E] text-[#171717] dark:text-white text-xs font-mono focus:outline-none focus:border-[#E32636]"
            />
          </div>
          <span className="text-xs text-[#888888] font-mono tabular-nums">
            {periodSales.length} satış tapıldı
          </span>
        </div>
      )}

      {/* Sub-navigation Tabs */}
      <div className="flex items-center p-1 bg-white dark:bg-[#171717] border border-[#E5E5E5] dark:border-[#262626] rounded-[12px] overflow-x-auto gap-1">
        <button
          type="button"
          onClick={() => setActiveSubTab('summary')}
          className={`flex-1 min-w-[120px] py-2 px-3 text-xs sm:text-sm font-semibold rounded-[8px] transition-colors flex items-center justify-center gap-2 whitespace-nowrap ${
            activeSubTab === 'summary'
              ? 'bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-white'
              : 'text-[#888888] hover:text-[#171717] dark:hover:text-white'
          }`}
        >
          <PieChart className="w-4 h-4 text-[#E32636]" />
          <span>İcmal</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('products')}
          className={`flex-1 min-w-[140px] py-2 px-3 text-xs sm:text-sm font-semibold rounded-[8px] transition-colors flex items-center justify-center gap-2 whitespace-nowrap ${
            activeSubTab === 'products'
              ? 'bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-white'
              : 'text-[#888888] hover:text-[#171717] dark:hover:text-white'
          }`}
        >
          <ShoppingBag className="w-4 h-4 text-[#888888]" />
          <span>Məhsul Satışları ({categorySummary.totalQuantity})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('finance')}
          className={`flex-1 min-w-[120px] py-2 px-3 text-xs sm:text-sm font-semibold rounded-[8px] transition-colors flex items-center justify-center gap-2 whitespace-nowrap ${
            activeSubTab === 'finance'
              ? 'bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-white'
              : 'text-[#888888] hover:text-[#171717] dark:hover:text-white'
          }`}
        >
          <DollarSign className="w-4 h-4 text-emerald-500" />
          <span>Maliyyə & Balans</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('stock')}
          className={`flex-1 min-w-[130px] py-2 px-3 text-xs sm:text-sm font-semibold rounded-[8px] transition-colors flex items-center justify-center gap-2 whitespace-nowrap ${
            activeSubTab === 'stock'
              ? 'bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-white'
              : 'text-[#888888] hover:text-[#171717] dark:hover:text-white'
          }`}
        >
          <Warehouse className="w-4 h-4 text-amber-500" />
          <span>Depo & Qalıqlar</span>
          {lowStockItems.length > 0 && (
            <span className="px-1.5 py-0.5 text-[10px] font-mono font-bold rounded-[6px] bg-[#E32636] text-white">
              {lowStockItems.length}
            </span>
          )}
        </button>
      </div>

      {/* TAB 1: SUMMARY (All 10 Dashboard sections surfaced cleanly) */}
      {activeSubTab === 'summary' && (
        <div className="space-y-5">
          {/* 1–4. Core KPI Grid: Günlük Satış, Faktiki Daxil Olan Pul, Ümumi Müştəri Borcu, Müştəri Balansları */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {/* 1. Günlük Satış */}
            <div className="p-5 rounded-[14px] bg-white dark:bg-[#171717] border border-[#E5E5E5] dark:border-[#262626] flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-[#888888] uppercase tracking-wider">
                  {period === 'today' ? 'Günlük Satış' : 'Dövr Satışı'}
                </span>
                <div className="w-8 h-8 rounded-[10px] bg-[#E32636]/10 text-[#E32636] flex items-center justify-center">
                  <TrendingUp className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-bold text-[#171717] dark:text-white font-mono tabular-nums tracking-tight">
                  {formatAZN(periodRevenue)}
                </div>
                <p className="text-xs text-[#888888] mt-1 flex flex-wrap items-center gap-1.5">
                  <span>{periodSales.length} satış ({categorySummary.totalQuantity} ədəd)</span>
                  {periodMetrics.creditSales > 0 && (
                    <span className="text-[#E32636] font-medium">
                      · Nisyə: {formatAZN(periodMetrics.creditSales)}
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* 2. Faktiki Daxil Olan Pul */}
            <div className="p-5 rounded-[14px] bg-white dark:bg-[#171717] border border-[#E5E5E5] dark:border-[#262626] flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-[#888888] uppercase tracking-wider">
                  Faktiki Daxil Olan Pul
                </span>
                <div className="w-8 h-8 rounded-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <Banknote className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-bold font-mono tabular-nums tracking-tight text-emerald-600 dark:text-emerald-400">
                  {formatAZN(periodMetrics.actualDrawerInflow)}
                </div>
                <p className="text-xs text-[#888888] mt-1">
                  Xalis qalıq:{' '}
                  <span className="font-mono font-semibold text-[#171717] dark:text-zinc-200">
                    {formatAZN(periodMetrics.netCashBalance)}
                  </span>
                  {periodDebtCollected > 0 && (
                    <span className="text-amber-600 dark:text-amber-400 font-medium">
                      {' '}· Borc ödənişi: +{formatAZN(periodDebtCollected)}
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* 3. Ümumi Müştəri Borcu */}
            <button
              type="button"
              onClick={() => onNavigate('debts')}
              className="p-5 rounded-[14px] bg-white dark:bg-[#171717] border border-[#E5E5E5] dark:border-[#262626] hover:border-[#E32636]/50 transition-colors text-left flex flex-col justify-between"
            >
              <div className="flex items-center justify-between w-full">
                <span className="text-[11px] font-semibold text-[#888888] uppercase tracking-wider">
                  Ümumi Müştəri Borcu
                </span>
                <div className="w-8 h-8 rounded-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                  <Users className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-bold text-[#171717] dark:text-white font-mono tabular-nums tracking-tight">
                  {formatAZN(debtOverview.totalRemainingDebt)}
                </div>
                <p className="text-xs text-[#888888] mt-1">
                  Aktiv borclu:{' '}
                  <span className="font-semibold text-amber-600 dark:text-amber-400">
                    {debtOverview.debtorCount} nəfər
                  </span>
                </p>
              </div>
            </button>

            {/* 4. Müştəri Balansları */}
            <button
              type="button"
              onClick={() => onNavigate('balances')}
              className="p-5 rounded-[14px] bg-white dark:bg-[#171717] border border-[#E5E5E5] dark:border-[#262626] hover:border-[#E32636]/50 transition-colors text-left flex flex-col justify-between"
            >
              <div className="flex items-center justify-between w-full">
                <span className="text-[11px] font-semibold text-[#888888] uppercase tracking-wider">
                  Müştəri Balansları
                </span>
                <div className="w-8 h-8 rounded-[10px] bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-white flex items-center justify-center">
                  <Wallet className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-bold text-[#171717] dark:text-white font-mono tabular-nums tracking-tight">
                  {formatAZN(totalCustomerBalance)}
                </div>
                <p className="text-xs text-[#888888] mt-1">
                  Aktiv hesab sayı:{' '}
                  <span className="font-semibold text-[#171717] dark:text-zinc-200">
                    {customerAccounts.length} müştəri
                  </span>
                </p>
              </div>
            </button>
          </div>

          {/* 5 & 6. Depodakı Məhsullar & Azalan Stok Xəbərdarlıqları */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-4 p-5 rounded-[14px] bg-white dark:bg-[#171717] border border-[#E5E5E5] dark:border-[#262626] flex flex-col justify-between">
              <div className="flex items-center justify-between pb-3 border-b border-[#E5E5E5] dark:border-[#262626]">
                <div className="flex items-center gap-2">
                  <Warehouse className="w-4 h-4 text-[#888888]" />
                  <h3 className="text-sm font-semibold text-[#171717] dark:text-white">
                    Depodakı Məhsullar
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('depo')}
                  className="text-xs font-semibold text-[#E32636] hover:underline"
                >
                  Depo →
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3 my-4">
                <div className="p-3 rounded-[10px] bg-[#F5F5F5] dark:bg-[#222222]">
                  <div className="text-[11px] text-[#888888]">Məhsul Çeşidi</div>
                  <div className="text-xl font-bold font-mono tabular-nums text-[#171717] dark:text-white mt-0.5">
                    {products.length}
                  </div>
                </div>
                <div className="p-3 rounded-[10px] bg-[#F5F5F5] dark:bg-[#222222]">
                  <div className="text-[11px] text-[#888888]">Ümumi Aktiv Stok</div>
                  <div className="text-xl font-bold font-mono tabular-nums text-[#171717] dark:text-white mt-0.5">
                    {totalDepoUnits} əd.
                  </div>
                </div>
              </div>
              <div className="text-xs text-[#888888] flex items-center justify-between">
                <span>Minimum xəbərdarlıq həddi:</span>
                <span className="font-mono font-semibold text-[#171717] dark:text-white">
                  {settings.minStockThreshold} ədəd
                </span>
              </div>
            </div>

            <div className="lg:col-span-8 p-5 rounded-[14px] bg-white dark:bg-[#171717] border border-[#E5E5E5] dark:border-[#262626] flex flex-col justify-between">
              <div className="flex items-center justify-between pb-3 border-b border-[#E5E5E5] dark:border-[#262626]">
                <div className="flex items-center gap-2">
                  <AlertTriangle
                    className={`w-4 h-4 ${lowStockItems.length > 0 ? 'text-[#E32636]' : 'text-emerald-500'}`}
                  />
                  <h3 className="text-sm font-semibold text-[#171717] dark:text-white">
                    Azalan Stok Xəbərdarlıqları
                  </h3>
                </div>
                <span
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded-[6px] font-mono ${
                    lowStockItems.length > 0
                      ? 'bg-[#E32636]/10 text-[#E32636]'
                      : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  {lowStockItems.length > 0 ? `${lowStockItems.length} kritik` : 'Normal'}
                </span>
              </div>

              {lowStockItems.length === 0 ? (
                <div className="py-5 flex items-center gap-3 text-xs text-[#888888]">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                  <span>
                    Bütün məhsulların anbar qalığı normal səviyyədədir. Kritik azalan məhsul yoxdur.
                  </span>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-3">
                  {lowStockItems.slice(0, 6).map((item) => (
                    <div
                      key={item.product.id}
                      className="p-3 rounded-[10px] bg-[#E32636]/5 border border-[#E32636]/25 flex items-center justify-between gap-2"
                    >
                      <span className="text-xs font-semibold text-[#171717] dark:text-white truncate">
                        {item.product.name}
                      </span>
                      <span className="text-xs font-mono font-bold text-[#E32636] shrink-0">
                        {item.activeStock} əd.
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="pt-3 mt-2 border-t border-[#E5E5E5] dark:border-[#262626] flex items-center justify-between text-xs">
                <span className="text-[#888888]">Anbarı yeniləmək üçün mal qəbulu bölməsinə keçin</span>
                <button
                  type="button"
                  onClick={() => onNavigate('purchases')}
                  className="font-semibold text-[#E32636] hover:underline whitespace-nowrap"
                >
                  Mal Qəbulu Et →
                </button>
              </div>
            </div>
          </div>

          {/* 7. Satış Statistikası (Recharts Area Chart) */}
          <div className="p-5 rounded-[14px] bg-white dark:bg-[#171717] border border-[#E5E5E5] dark:border-[#262626] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#E5E5E5] dark:border-[#262626]">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-[#E32636]" />
                <h3 className="text-sm font-semibold text-[#171717] dark:text-white">
                  Satış Statistikası
                </h3>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-[#888888]">Dövr gəliri:</span>
                <span className="font-mono tabular-nums font-bold text-[#E32636] text-sm">
                  {formatAZN(periodRevenue)}
                </span>
              </div>
            </div>

            <div className="h-64 w-full pt-1">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={timelineChartData}
                  margin={{ top: 10, right: 10, left: -15, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="salesAreaGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={primaryColor} stopOpacity={0.35} />
                      <stop offset="95%" stopColor={primaryColor} stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={isDark ? '#262626' : '#E5E5E5'}
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    stroke="#888888"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="#888888"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(val) => `${val} ₼`}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-white dark:bg-[#171717] border border-[#E5E5E5] dark:border-[#2E2E2E] p-3 rounded-[10px] shadow-xl text-xs space-y-1">
                            <p className="font-semibold text-[#171717] dark:text-white">
                              {data.fullDate || label}
                            </p>
                            <div className="flex items-center gap-2">
                              <span
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: primaryColor }}
                              />
                              <span className="text-[#888888]">Satış:</span>
                              <span className="font-mono text-sm font-bold text-[#171717] dark:text-white">
                                {formatAZN(Number(payload[0].value))}
                              </span>
                            </div>
                            <p className="text-[11px] text-[#888888]">
                              Əməliyyat: <strong className="font-mono text-[#171717] dark:text-zinc-200">{data.salesCount}</strong>
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="amount"
                    name="Satış Məbləği"
                    stroke={primaryColor}
                    strokeWidth={2.2}
                    fillOpacity={1}
                    fill="url(#salesAreaGradient)"
                    dot={{ r: 3, fill: primaryColor, strokeWidth: 1, stroke: isDark ? '#171717' : '#ffffff' }}
                    activeDot={{ r: 5, fill: primaryColor, strokeWidth: 2, stroke: '#ffffff' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 8. Ən Çox Satılan Məhsullar & Kateqoriya Dövriyyəsi */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-6 p-5 rounded-[14px] bg-white dark:bg-[#171717] border border-[#E5E5E5] dark:border-[#262626] space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[#E5E5E5] dark:border-[#262626]">
                <div className="flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-[#E32636]" />
                  <h3 className="text-sm font-semibold text-[#171717] dark:text-white">
                    Ən Çox Satılan Məhsullar
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveSubTab('products')}
                  className="text-xs font-semibold text-[#E32636] hover:underline"
                >
                  Ətraflı →
                </button>
              </div>

              {productSaleStats.length === 0 ? (
                <p className="text-xs text-[#888888] py-6 text-center">
                  Seçilən dövr üçün məhsul satışı yoxdur.
                </p>
              ) : (
                <div className="space-y-2">
                  {productSaleStats.slice(0, 5).map((item, idx) => (
                    <div
                      key={item.productId}
                      className="px-3 py-2.5 rounded-[10px] bg-[#F5F5F5] dark:bg-[#222222] flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-6 h-6 rounded-[8px] bg-white dark:bg-[#171717] border border-[#E5E5E5] dark:border-[#2E2E2E] text-[#171717] dark:text-white font-mono font-semibold flex items-center justify-center text-[11px] shrink-0">
                          {idx + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="font-semibold text-[#171717] dark:text-white truncate">
                            {item.productName}
                          </div>
                          <div className="text-[11px] text-[#888888] font-mono">
                            {formatAZN(item.unitPrice)} / ədəd
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <div className="font-mono font-bold text-[#171717] dark:text-white">
                          {formatAZN(item.totalRevenue)}
                        </div>
                        <div className="text-[11px] font-mono font-semibold text-[#E32636]">
                          {item.totalQuantity} ədəd
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 10. Günlük Maliyyə Hesabatı & Ödəniş Bölgüsü */}
            <div className="lg:col-span-6 p-5 rounded-[14px] bg-white dark:bg-[#171717] border border-[#E5E5E5] dark:border-[#262626] space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[#E5E5E5] dark:border-[#262626]">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-[#888888]" />
                  <h3 className="text-sm font-semibold text-[#171717] dark:text-white">
                    Günlük Maliyyə Hesabatı & Ödənişlər
                  </h3>
                </div>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-[6px] border ${
                    discrepancy.isMatching
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                      : 'bg-[#E32636]/10 text-[#E32636] border-[#E32636]/30'
                  }`}
                >
                  {discrepancy.isMatching ? 'Kassa Uyğundur' : `Fərq: ${formatAZN(discrepancy.difference)}`}
                </span>
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#525252] dark:text-zinc-300 flex items-center gap-1.5">
                      <Banknote className="w-3.5 h-3.5 text-emerald-500" /> Nağd
                    </span>
                    <span className="font-mono font-semibold text-[#171717] dark:text-white">
                      {formatAZN(combinedCash)} ({cashPct}%)
                    </span>
                  </div>
                  <div className="h-1.5 bg-[#F5F5F5] dark:bg-[#222222] rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500" style={{ width: `${cashPct}%` }} />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#525252] dark:text-zinc-300 flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5 text-blue-500" /> Kart
                    </span>
                    <span className="font-mono font-semibold text-[#171717] dark:text-white">
                      {formatAZN(combinedCard)} ({cardPct}%)
                    </span>
                  </div>
                  <div className="h-1.5 bg-[#F5F5F5] dark:bg-[#222222] rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500" style={{ width: `${cardPct}%` }} />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#525252] dark:text-zinc-300 flex items-center gap-1.5">
                      <Smartphone className="w-3.5 h-3.5 text-[#E32636]" /> POS Terminal
                    </span>
                    <span className="font-mono font-semibold text-[#171717] dark:text-white">
                      {formatAZN(combinedPos)} ({posPct}%)
                    </span>
                  </div>
                  <div className="h-1.5 bg-[#F5F5F5] dark:bg-[#222222] rounded-full overflow-hidden">
                    <div className="h-full bg-[#E32636]" style={{ width: `${posPct}%` }} />
                  </div>
                </div>

                <div className="p-3 rounded-[10px] bg-[#F5F5F5] dark:bg-[#222222] grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <div className="text-[#888888] text-[11px]">Xalis Mənfəət</div>
                    <div
                      className={`font-mono font-bold text-sm mt-0.5 ${
                        periodProfit.isProfit ? 'text-emerald-600 dark:text-emerald-400' : 'text-[#E32636]'
                      }`}
                    >
                      {formatAZN(periodProfit.netProfit)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[#888888] text-[11px]">Gözlənilən Günlük Kassa</div>
                    <div className="font-mono font-bold text-sm text-[#171717] dark:text-white mt-0.5">
                      {formatAZN(discrepancy.salesTotal)}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onNavigate('daily-report')}
                  className="w-full py-2 bg-[#F5F5F5] dark:bg-[#222222] hover:bg-[#EBEBEB] dark:hover:bg-[#2A2A2A] text-[#171717] dark:text-white text-xs font-semibold rounded-[10px] transition-colors border border-[#E5E5E5] dark:border-[#2E2E2E]"
                >
                  Günlük Maliyyə Hesabatına Keç
                </button>
              </div>
            </div>
          </div>

          {/* Kateqoriya Dövriyyəsi Bar */}
          <div className="p-5 rounded-[14px] bg-white dark:bg-[#171717] border border-[#E5E5E5] dark:border-[#262626] space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-[#171717] dark:text-white">
                Kateqoriya Üzrə Dövriyyə
              </h3>
              <span className="text-xs text-[#888888] font-mono tabular-nums">
                Cəmi: {formatAZN(categorySummary.totalRevenue)}
              </span>
            </div>
            <p className="text-xs text-[#888888]">{categoryNarrative}</p>
            {categorySummary.totalRevenue > 0 && (
              <div className="space-y-2.5 pt-1">
                <div className="h-2.5 w-full bg-[#F5F5F5] dark:bg-[#222222] rounded-full overflow-hidden flex">
                  {categorySummary.categories.map((cat, idx) => {
                    const themeStyle = getCategoryTheme(cat.categoryName);
                    return (
                      <div
                        key={idx}
                        style={{ width: `${cat.percentageOfTotal}%` }}
                        className={`${themeStyle.barBg}`}
                        title={`${cat.categoryName}: ${formatAZN(cat.revenue)} (${cat.percentageOfTotal}%)`}
                      />
                    );
                  })}
                </div>
                <div className="flex flex-wrap items-center gap-4 text-xs">
                  {categorySummary.categories.map((cat, idx) => {
                    const themeStyle = getCategoryTheme(cat.categoryName);
                    return (
                      <div key={idx} className="flex items-center gap-1.5">
                        <span className={`w-2.5 h-2.5 rounded-full ${themeStyle.barBg}`} />
                        <span className="text-[#888888]">{cat.categoryName}:</span>
                        <span className="font-mono font-semibold text-[#171717] dark:text-white">
                          {formatAZN(cat.revenue)}
                        </span>
                        <span className="text-[#888888]">({cat.percentageOfTotal}%)</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* 9. Son Əməliyyatlar */}
          <div className="rounded-[14px] bg-white dark:bg-[#171717] border border-[#E5E5E5] dark:border-[#262626] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#E5E5E5] dark:border-[#262626] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#888888]" />
                <h3 className="text-sm font-semibold text-[#171717] dark:text-white">
                  Son Əməliyyatlar ({periodSales.length})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('pos')}
                className="text-xs text-[#E32636] hover:underline font-semibold"
              >
                Hamısını Gör →
              </button>
            </div>

            {periodSales.length === 0 ? (
              <p className="text-xs text-[#888888] py-8 text-center">
                Bu dövr üçün satış qeydə alınmayıb.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#FAFAFA] dark:bg-[#141414] border-b border-[#E5E5E5] dark:border-[#262626] text-[10px] font-semibold uppercase tracking-wider text-[#888888]">
                    <tr>
                      <th className="py-2.5 px-5">Məhsullar</th>
                      <th className="py-2.5 px-3">Tarix & Saat</th>
                      <th className="py-2.5 px-3">Ödəniş Növü</th>
                      <th className="py-2.5 px-3">Məsul</th>
                      <th className="py-2.5 px-5 text-right">Məbləğ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E5E5] dark:divide-[#262626]">
                    {periodSales.slice(0, 8).map((sale) => (
                      <tr
                        key={sale.id}
                        className="hover:bg-[#FAFAFA] dark:hover:bg-[#1E1E1E] transition-colors"
                      >
                        <td className="py-3 px-5 font-medium text-[#171717] dark:text-white">
                          {sale.items.map((i) => `${i.productName} ×${i.quantity}`).join(', ')}
                        </td>
                        <td className="py-3 px-3 font-mono tabular-nums text-[#888888] whitespace-nowrap">
                          {formatDateAZ(sale.date)} {sale.time}
                        </td>
                        <td className="py-3 px-3">
                          <span className="inline-block px-2 py-0.5 rounded-[6px] text-[10px] font-semibold bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-zinc-300 border border-[#E5E5E5] dark:border-[#2E2E2E]">
                            {formatSalePaymentLabel(sale)}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-[#888888] font-mono">
                          {sale.createdBy ? `@${sale.createdBy}` : '—'}
                        </td>
                        <td className="py-3 px-5 text-right font-mono tabular-nums font-bold text-[#171717] dark:text-white">
                          {formatAZN(sale.totalAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: MƏHSUL SATIŞLARI */}
      {activeSubTab === 'products' && (
        <div className="space-y-5">
          <div className="p-4 rounded-[14px] bg-white dark:bg-[#171717] border border-[#E5E5E5] dark:border-[#262626] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-[10px] bg-[#E32636]/10 text-[#E32636] flex items-center justify-center shrink-0">
                <ShoppingBag className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[#171717] dark:text-white">
                  Məhsul və Kateqoriyalar Üzrə Satış Hesabatı
                </h3>
                <p className="text-xs text-[#888888] mt-0.5">
                  {dateRange.label} üzrə hər kateqoriya və məhsulun satış sayı və dövriyyəsi
                </p>
              </div>
            </div>
            <div className="text-right shrink-0">
              <span className="text-[11px] text-[#888888] block">Dövrün Satış Cəmi</span>
              <span className="text-lg font-bold text-[#171717] dark:text-white font-mono tabular-nums">
                {formatAZN(categorySummary.totalRevenue)}
              </span>
            </div>
          </div>

          {categorySummary.categories.length === 0 ? (
            <div className="p-8 rounded-[14px] bg-white dark:bg-[#171717] border border-[#E5E5E5] dark:border-[#262626] text-center space-y-2">
              <p className="text-sm font-semibold text-[#171717] dark:text-white">
                Seçilən dövr üçün ({dateRange.label}) heç bir məhsul satışı yoxdur.
              </p>
              <p className="text-xs text-[#888888]">
                Yuxarıdan "Aylıq" və ya "Həftəlik" dövrünü seçə bilərsiniz.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {categorySummary.categories.map((cat, idx) => {
                const themeStyle = getCategoryTheme(cat.categoryName);
                const isExpanded = expandedCategories[cat.categoryName] ?? true;

                return (
                  <div
                    key={idx}
                    className="rounded-[14px] bg-white dark:bg-[#171717] border border-[#E5E5E5] dark:border-[#262626] overflow-hidden"
                  >
                    <div
                      onClick={() => toggleCategoryExpand(cat.categoryName)}
                      className="px-5 py-4 flex items-center justify-between cursor-pointer select-none border-b border-[#E5E5E5] dark:border-[#262626]"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-[10px] bg-[#F5F5F5] dark:bg-[#222222] flex items-center justify-center shrink-0">
                          {themeStyle.icon}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-semibold text-[#171717] dark:text-white">
                              {cat.categoryName}
                            </h4>
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-[6px] border ${themeStyle.badgeBg}`}>
                              {cat.percentageOfTotal}%
                            </span>
                          </div>
                          <p className="text-xs text-[#888888] mt-0.5">
                            {cat.quantity} ədəd · {cat.products.length} məhsul növü
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <span className="text-base font-bold text-[#171717] dark:text-white font-mono tabular-nums">
                          {formatAZN(cat.revenue)}
                        </span>
                        <span className="text-[#888888]">
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </span>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-[#FAFAFA] dark:bg-[#141414] border-b border-[#E5E5E5] dark:border-[#262626] text-[10px] font-semibold text-[#888888] uppercase tracking-wider">
                            <tr>
                              <th className="py-2.5 px-5">Məhsul Adı</th>
                              <th className="py-2.5 px-3 text-right">Vahid Qiyməti</th>
                              <th className="py-2.5 px-3 text-right">Satılan Say</th>
                              <th className="py-2.5 px-3 text-right">Cəmi Gəlir</th>
                              <th className="py-2.5 px-5 text-right">Pay</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#E5E5E5] dark:divide-[#262626]">
                            {cat.products.map((prod) => (
                              <tr key={prod.productId} className="hover:bg-[#FAFAFA] dark:hover:bg-[#1E1E1E]">
                                <td className="py-2.5 px-5 font-medium text-[#171717] dark:text-white">
                                  {prod.productName}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#888888]">
                                  {formatAZN(prod.unitPrice)}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-[#E32636]">
                                  {prod.quantity} ədəd
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-[#171717] dark:text-white">
                                  {formatAZN(prod.revenue)}
                                </td>
                                <td className="py-2.5 px-5 text-right font-mono tabular-nums text-[#888888]">
                                  {prod.percentageOfCategory}%
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: MALİYYƏ & BALANS */}
      {activeSubTab === 'finance' && (
        <div className="space-y-5">
          <div className="p-5 rounded-[14px] bg-white dark:bg-[#171717] border border-[#E5E5E5] dark:border-[#262626] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#E5E5E5] dark:border-[#262626]">
              <div>
                <h3 className="text-sm font-semibold text-[#171717] dark:text-white">
                  Kassanın Faktiki Pul Balansı (Real Daxil Olan − Çıxan)
                </h3>
                <p className="text-xs text-[#888888] mt-0.5">
                  Nisyə satış ({formatAZN(periodMetrics.creditSales)}) ödənilənə qədər faktiki kassa balansına daxil edilmir
                </p>
              </div>
              <span className="text-xs text-[#888888] font-mono">{dateRange.label}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-4 rounded-[10px] bg-[#F5F5F5] dark:bg-[#222222] text-center">
                <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">
                  Satışdan Daxilolma
                </span>
                <span className="text-xl font-bold text-[#171717] dark:text-white font-mono tabular-nums mt-1 block">
                  {formatAZN(periodMetrics.salesRealInflow)}
                </span>
                <span className="text-[11px] text-[#888888]">Nağd + Kart + POS</span>
              </div>

              <div className="p-4 rounded-[10px] bg-[#F5F5F5] dark:bg-[#222222] text-center">
                <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider block">
                  Geri Alınan Borclar (+)
                </span>
                <span className="text-xl font-bold text-amber-600 dark:text-amber-400 font-mono tabular-nums mt-1 block">
                  +{formatAZN(periodMetrics.debtCollectedTotal)}
                </span>
                <span className="text-[11px] text-[#888888]">
                  {periodMetrics.debtCollectedCount} ödəniş
                </span>
              </div>

              <div className="p-4 rounded-[10px] bg-[#F5F5F5] dark:bg-[#222222] text-center">
                <span className="text-[10px] font-semibold text-[#E32636] uppercase tracking-wider block">
                  Çıxan Pullar (−)
                </span>
                <span className="text-xl font-bold text-[#E32636] font-mono tabular-nums mt-1 block">
                  − {formatAZN(periodMetrics.totalCashOutflow)}
                </span>
                <span className="text-[11px] text-[#888888]">
                  Alış: {formatAZN(periodPurchasesAmount)} · Xərc: {formatAZN(periodExpensesAmount)}
                </span>
              </div>

              <div className="p-4 rounded-[10px] bg-emerald-500/10 border border-emerald-500/30 text-center">
                <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider block">
                  Faktiki Kassa Qalığı (=)
                </span>
                <span className="text-xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-300 mt-1 block">
                  {formatAZN(periodMetrics.netCashBalance)}
                </span>
                <span className="text-[11px] text-emerald-700/80 dark:text-emerald-400/80 font-mono">
                  Daxil: {formatAZN(periodMetrics.actualDrawerInflow)}
                </span>
              </div>
            </div>
          </div>

          {/* Net Profit Breakdown */}
          <div className="p-5 rounded-[14px] bg-white dark:bg-[#171717] border border-[#E5E5E5] dark:border-[#262626] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#E5E5E5] dark:border-[#262626]">
              <h3 className="text-sm font-semibold text-[#171717] dark:text-white">
                Ümumi Satış Gəliri və Xalis Mənfəət
              </h3>
              <span className="text-xs text-[#888888] font-mono">{dateRange.label}</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="p-4 rounded-[10px] bg-[#F5F5F5] dark:bg-[#222222] text-center">
                <span className="text-[10px] font-semibold text-[#888888] uppercase tracking-wider block">
                  Ümumi Satış (+)
                </span>
                <span className="text-xl font-bold text-[#171717] dark:text-white font-mono tabular-nums mt-1 block">
                  {formatAZN(periodRevenue)}
                </span>
                <span className="text-[11px] text-[#888888]">{periodSales.length} əməliyyat</span>
              </div>

              <div className="p-4 rounded-[10px] bg-[#F5F5F5] dark:bg-[#222222] text-center">
                <span className="text-[10px] font-semibold text-[#888888] uppercase tracking-wider block">
                  Mal Alışı (−)
                </span>
                <span className="text-xl font-bold text-[#E32636] font-mono tabular-nums mt-1 block">
                  − {formatAZN(periodPurchasesAmount)}
                </span>
                <span className="text-[11px] text-[#888888]">{periodPurchases.length} qəbul</span>
              </div>

              <div className="p-4 rounded-[10px] bg-[#F5F5F5] dark:bg-[#222222] text-center">
                <span className="text-[10px] font-semibold text-[#888888] uppercase tracking-wider block">
                  Digər Xərclər (−)
                </span>
                <span className="text-xl font-bold text-amber-600 dark:text-amber-400 font-mono tabular-nums mt-1 block">
                  − {formatAZN(periodExpensesAmount)}
                </span>
                <span className="text-[11px] text-[#888888]">{periodExpenses.length} qeyd</span>
              </div>

              <div
                className={`p-4 rounded-[10px] border text-center ${
                  periodProfit.isProfit
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                    : 'bg-[#E32636]/10 border-[#E32636]/30 text-[#E32636]'
                }`}
              >
                <span className="text-[10px] font-semibold uppercase tracking-wider block">
                  Xalis Mənfəət (=)
                </span>
                <span className="text-xl font-bold font-mono tabular-nums mt-1 block">
                  {formatAZN(periodProfit.netProfit)}
                </span>
                <span className="text-[11px]">
                  {periodProfit.isProfit ? 'Müsbət balans' : 'Zərər'}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="p-5 rounded-[14px] bg-white dark:bg-[#171717] border border-[#E5E5E5] dark:border-[#262626] space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-[#E5E5E5] dark:border-[#262626]">
                <h3 className="text-sm font-semibold text-[#171717] dark:text-white">
                  Müştəri Balansları
                </h3>
                <button
                  type="button"
                  onClick={() => onNavigate('balances')}
                  className="text-xs text-[#E32636] hover:underline font-semibold"
                >
                  Hesablara Keç →
                </button>
              </div>
              <div className="p-3.5 rounded-[10px] bg-[#F5F5F5] dark:bg-[#222222] space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-[#888888]">Aktiv Depozit Qalığı:</span>
                  <span className="font-mono font-bold text-[#171717] dark:text-white">
                    {formatAZN(totalCustomerBalance)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#888888]">Cəmi Yüklənən Depozit:</span>
                  <span className="font-mono text-[#888888]">
                    {formatAZN(totalDepositedAllTime)}
                  </span>
                </div>
              </div>
              {customerAccounts.slice(0, 4).map((c) => (
                <div
                  key={c.id}
                  className="py-2 border-b last:border-b-0 border-[#E5E5E5] dark:border-[#262626] flex items-center justify-between text-xs"
                >
                  <span className="font-medium text-[#171717] dark:text-white">{c.name}</span>
                  <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                    {formatAZN(c.balance)}
                  </span>
                </div>
              ))}
            </div>

            <div className="p-5 rounded-[14px] bg-white dark:bg-[#171717] border border-[#E5E5E5] dark:border-[#262626] space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-[#E5E5E5] dark:border-[#262626]">
                <h3 className="text-sm font-semibold text-[#171717] dark:text-white">
                  Nisyə (Borc) Vəziyyəti
                </h3>
                <button
                  type="button"
                  onClick={() => onNavigate('debts')}
                  className="text-xs text-[#E32636] hover:underline font-semibold"
                >
                  Borclulara Keç →
                </button>
              </div>
              <div className="p-3.5 rounded-[10px] bg-[#F5F5F5] dark:bg-[#222222] space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-[#888888]">Ümumi Qalıq Borc:</span>
                  <span className="font-mono font-bold text-[#E32636]">
                    {formatAZN(debtOverview.totalRemainingDebt)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#888888]">Ödənilmiş Nisyə Cəmi:</span>
                  <span className="font-mono text-emerald-600 dark:text-emerald-400">
                    {formatAZN(debtOverview.totalPaidDebt)}
                  </span>
                </div>
              </div>
              {debts
                .filter((d) => d.remainingAmount > 0)
                .slice(0, 4)
                .map((d) => (
                  <div
                    key={d.id}
                    className="py-2 border-b last:border-b-0 border-[#E5E5E5] dark:border-[#262626] flex items-center justify-between text-xs"
                  >
                    <span className="font-medium text-[#171717] dark:text-white">{d.debtorName}</span>
                    <span className="font-mono font-semibold text-[#E32636]">
                      {formatAZN(d.remainingAmount)}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: DEPO & QALIQLAR */}
      {activeSubTab === 'stock' && (
        <div className="space-y-5">
          {lowStockItems.length > 0 ? (
            <div className="p-4 rounded-[14px] bg-[#E32636]/10 border border-[#E32636]/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-[10px] bg-[#E32636] text-white flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-[#171717] dark:text-white">
                    {lowStockItems.length} məhsulun qalığı kritik həddədir ({settings.minStockThreshold} əd. və ya az)
                  </h4>
                  <p className="text-xs text-[#525252] dark:text-zinc-300 mt-0.5">
                    {lowStockItems.map((i) => `${i.product.name} (${i.activeStock} əd.)`).join(' · ')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('purchases')}
                className="px-3.5 py-2 bg-[#E32636] hover:bg-[#c91e2d] text-white font-semibold text-xs rounded-[10px] transition-colors shrink-0"
              >
                Mal Qəbulu Et
              </button>
            </div>
          ) : (
            <div className="p-4 rounded-[14px] bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 flex items-center gap-3 text-xs font-medium">
              <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
              <span>Bütün məhsulların anbar qalığı normal səviyyədədir.</span>
            </div>
          )}

          <div className="rounded-[14px] bg-white dark:bg-[#171717] border border-[#E5E5E5] dark:border-[#262626] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#E5E5E5] dark:border-[#262626] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <PackageCheck className="w-5 h-5 text-[#E32636]" />
                <h3 className="text-sm font-semibold text-[#171717] dark:text-white">
                  Depo Məhsullarının Aktiv Qalığı ({allStocksList.length})
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onNavigate('depo')}
                  className="px-3 py-1.5 text-xs font-semibold bg-[#F5F5F5] dark:bg-[#222222] hover:bg-[#EBEBEB] dark:hover:bg-[#2A2A2A] text-[#171717] dark:text-white rounded-[10px] border border-[#E5E5E5] dark:border-[#2E2E2E] transition-colors"
                >
                  Depo Jurnalı
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('products')}
                  style={{ backgroundColor: primaryColor }}
                  className="px-3 py-1.5 text-xs font-semibold text-white rounded-[10px] transition-opacity hover:opacity-90"
                >
                  Məhsul Əlavə Et
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#FAFAFA] dark:bg-[#141414] border-b border-[#E5E5E5] dark:border-[#262626] text-[10px] font-semibold text-[#888888] uppercase tracking-wider">
                  <tr>
                    <th className="py-2.5 px-5">Məhsul</th>
                    <th className="py-2.5 px-3">Kateqoriya</th>
                    <th className="py-2.5 px-3 text-right">Qiymət</th>
                    <th className="py-2.5 px-3 text-right">Daxil Olan</th>
                    <th className="py-2.5 px-3 text-right">Satılan</th>
                    <th className="py-2.5 px-3 text-right">Aktiv Qalıq</th>
                    <th className="py-2.5 px-5 text-right">Vəziyyət</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E5E5] dark:divide-[#262626]">
                  {paginatedStocks.map((stock) => {
                    const isLow = stock.isLowStock;
                    const isOut = stock.activeStock <= 0;

                    return (
                      <tr
                        key={stock.product.id}
                        className="hover:bg-[#FAFAFA] dark:hover:bg-[#1E1E1E] transition-colors"
                      >
                        <td className="py-3 px-5 font-medium text-[#171717] dark:text-white">
                          <div>{stock.product.name}</div>
                          {stock.product.barcode && (
                            <div className="text-[10px] text-[#888888] font-mono">
                              {stock.product.barcode}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 text-[#888888]">{stock.product.category}</td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-[#525252] dark:text-zinc-300">
                          {formatAZN(stock.product.salePrice)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-[#888888]">
                          {stock.initialStock + stock.totalPurchased}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-[#888888]">
                          {stock.totalSold}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums font-bold text-sm">
                          <span
                            className={
                              isOut
                                ? 'text-[#E32636]'
                                : isLow
                                ? 'text-amber-500'
                                : 'text-[#171717] dark:text-white'
                            }
                          >
                            {stock.activeStock}
                          </span>
                        </td>
                        <td className="py-3 px-5 text-right">
                          <span
                            className={`px-2 py-0.5 rounded-[6px] text-[10px] font-semibold border ${
                              isOut
                                ? 'bg-[#E32636]/10 text-[#E32636] border-[#E32636]/30'
                                : isLow
                                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'
                                : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                            }`}
                          >
                            {isOut ? 'Bitib' : isLow ? 'Az qalıb' : 'Normal'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <TablePagination
              totalItems={allStocksList.length}
              pageSize={STOCK_PAGE_SIZE}
              currentPage={stockPage}
              onPageChange={setStockPage}
              primaryColor={primaryColor}
            />
          </div>
        </div>
      )}
    </div>
  );
};
