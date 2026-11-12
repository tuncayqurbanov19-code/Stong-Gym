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
} from '../utils/financialCalculations';
import { exportSalesToCSV } from '../utils/exportUtils';

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
  const primaryColor = settings.primaryColor || '#dc2626';

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

  // Expanded categories state in Products tab
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    'Su': true,
    'Protein': true,
    'Əlavələr': true,
    'Digər': true,
  });

  const toggleCategoryExpand = (catName: string) => {
    setExpandedCategories(prev => ({
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
      return { startDate: `${y}-${m}-${day}`, endDate: todayISO, label: 'Son 7 gün (Həftəlik)' };
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

  // Filtered dataset for selected period
  const confirmedSales = useMemo(() => sales.filter(s => s.isConfirmed), [sales]);

  const periodSales = useMemo(() => {
    return confirmedSales.filter(
      s => s.date >= dateRange.startDate && s.date <= dateRange.endDate
    );
  }, [confirmedSales, dateRange]);

  const periodPurchases = useMemo(() => {
    return purchases.filter(
      p => p.date >= dateRange.startDate && p.date <= dateRange.endDate
    );
  }, [purchases, dateRange]);

  const periodExpenses = useMemo(() => {
    return expenses.filter(
      e => e.date >= dateRange.startDate && e.date <= dateRange.endDate
    );
  }, [expenses, dateRange]);

  // Unified authoritative financial metrics for the selected period
  const periodMetrics = useMemo(
    () =>
      calculateFinancialMetricsForRange({
        sales,
        debts,
        purchases,
        expenses,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      }),
    [sales, debts, purchases, expenses, dateRange]
  );

  // Collected debt payments count / total in selected period
  const periodDebtCollected = periodMetrics.debtCollectedTotal;

  // Period Financials
  const periodRevenue = periodMetrics.grossSalesTotal;
  const periodPurchasesAmount = periodMetrics.purchasesOutflow;
  const periodExpensesAmount = periodMetrics.expensesOutflow;
  const periodProfit = useMemo(
    () => calculateNetProfit(periodRevenue, periodPurchasesAmount, periodExpensesAmount),
    [periodRevenue, periodPurchasesAmount, periodExpensesAmount]
  );

  // Period Payments (Actual Cash Drawer Inflows vs Non-cash Balance & Unpaid Credit Sales)
  const periodPayments = useMemo(
    () => calculatePaymentBreakdown(periodSales),
    [periodSales]
  );
  const combinedCash = periodMetrics.drawerCashInflow;
  const combinedCard = periodMetrics.drawerCardInflow;
  const combinedPos = periodMetrics.drawerPosInflow;
  const totalPaid = periodMetrics.actualDrawerInflow; // Only real cash/card/pos inflows (excludes credit & balance)

  const cashPct = totalPaid > 0 ? Math.round((combinedCash / totalPaid) * 100) : 0;
  const cardPct = totalPaid > 0 ? Math.round((combinedCard / totalPaid) * 100) : 0;
  const posPct = totalPaid > 0 ? Math.round((combinedPos / totalPaid) * 100) : 0;
  const balancePct = periodRevenue > 0 ? Math.round((periodMetrics.balanceSales / periodRevenue) * 100) : 0;

  // Period Category & Product level breakdown
  const categorySummary = useMemo(
    () => calculateCategoryBreakdown(periodSales, products),
    [periodSales, products]
  );

  // Period Top Product Stats
  const productSaleStats = useMemo(
    () => calculateProductSaleCounts(periodSales),
    [periodSales]
  );

  // Stock calculations (All-time inventory balances)
  const allStocks = useMemo(
    () => calculateAllProductStocks(products, purchases, sales, settings.minStockThreshold),
    [products, purchases, sales, settings.minStockThreshold]
  );
  const allStocksList = useMemo(() => Object.values(allStocks), [allStocks]);
  const lowStockItems = useMemo(
    () => getLowStockProducts(products, purchases, sales, settings.minStockThreshold),
    [products, purchases, sales, settings.minStockThreshold]
  );

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

  // Today's debt payments for drawer discrepancy verification
  const todayDebtPayments = useMemo(
    () =>
      debts
        .flatMap(d => d.payments || [])
        .filter(p => (p.paidAt || p.date || '').split('T')[0] === todayISO),
    [debts, todayISO]
  );
  const todayDebtTotal = useMemo(
    () => todayDebtPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0),
    [todayDebtPayments]
  );

  // Discrepancy check for current day (includes today's collected debt payments)
  const todayReport = dailyReports.find(r => r.date === todayISO);
  const discrepancy = checkDailyReportDiscrepancy(
    todayReport,
    sales.filter(s => s.date === todayISO),
    todayDebtPayments
  );

  // Sales timeline chart data for the AreaChart
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

      return Object.values(hoursMap).map(item => ({
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
        const daySales = confirmedSales.filter(s => s.date === dateStr);
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
        const daySales = confirmedSales.filter(s => s.date === dateStr);
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

    // Custom date range
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

      const daySales = confirmedSales.filter(s => s.date === dateStr);
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

  // Natural language summary string
  const categoryNarrative = useMemo(() => {
    if (categorySummary.categories.length === 0) {
      return 'Bu dövrdə hələ ki heç bir təsdiqlənmiş satış qeydə alınmayıb.';
    }
    const parts = categorySummary.categories.map(
      cat => `${cat.categoryName}: ${formatAZN(cat.revenue)} (${cat.percentageOfTotal}%)`
    );
    return `Seçilən dövrün xülasəsi: Ümumi dövriyyə ${formatAZN(categorySummary.totalRevenue)} (${categorySummary.totalQuantity} ədəd məhsul). Bölgü: ${parts.join(' · ')}.`;
  }, [categorySummary]);

  // Color generator for categories
  const getCategoryTheme = (name: string) => {
    const norm = name.toLowerCase();
    if (norm.includes('su')) {
      return {
        badgeBg: 'bg-cyan-50 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800',
        barBg: 'bg-cyan-500',
        text: 'text-cyan-600 dark:text-cyan-400',
        icon: <Droplets className="w-4 h-4 text-cyan-500 dark:text-cyan-400" />,
      };
    }
    if (norm.includes('protein')) {
      return {
        badgeBg: 'bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
        barBg: 'bg-red-500',
        text: 'text-red-600 dark:text-red-400',
        icon: <Dumbbell className="w-4 h-4 text-red-500 dark:text-red-400" />,
      };
    }
    if (norm.includes('əlavə') || norm.includes('elave')) {
      return {
        badgeBg: 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
        barBg: 'bg-amber-500',
        text: 'text-amber-600 dark:text-amber-400',
        icon: <Sparkles className="w-4 h-4 text-amber-500 dark:text-amber-400" />,
      };
    }
    return {
      badgeBg: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700',
      barBg: 'bg-zinc-500 dark:bg-zinc-400',
      text: 'text-zinc-700 dark:text-zinc-300',
      icon: <Layers className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />,
    };
  };

  return (
    <div className="space-y-6 pb-14 max-w-7xl mx-auto">
      {/* ─────────────────────────────────────────────────────────
          TOP BAR & PERIOD SELECTOR (Günlük, Həftəlik, Aylıq, Xüsusi)
         ───────────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-zinc-200 dark:border-zinc-800">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-white tracking-tight">
              Xülasə & Hesabat Mərkəzi
            </h2>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/80">
              Admin
            </span>
          </div>
          <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
            Dövr: <span className="font-semibold text-zinc-800 dark:text-zinc-200">{dateRange.label}</span> · Valyuta: AZN
          </p>
        </div>

        {/* Period Selection Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Segmented Period Tabs */}
          <div className="flex items-center p-1 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl">
            <button
              type="button"
              onClick={() => setPeriod('today')}
              style={period === 'today' ? { backgroundColor: primaryColor } : undefined}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                period === 'today'
                  ? 'text-white shadow-sm'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
              }`}
            >
              Günlük
            </button>
            <button
              type="button"
              onClick={() => setPeriod('week')}
              style={period === 'week' ? { backgroundColor: primaryColor } : undefined}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                period === 'week'
                  ? 'text-white shadow-sm'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
              }`}
            >
              Həftəlik
            </button>
            <button
              type="button"
              onClick={() => setPeriod('month')}
              style={period === 'month' ? { backgroundColor: primaryColor } : undefined}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                period === 'month'
                  ? 'text-white shadow-sm'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
              }`}
            >
              Aylıq
            </button>
            <button
              type="button"
              onClick={() => setPeriod('custom')}
              style={period === 'custom' ? { backgroundColor: primaryColor } : undefined}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1 ${
                period === 'custom'
                  ? 'text-white shadow-sm'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Xüsusi aralıq</span>
            </button>
          </div>

          {/* Quick Actions */}
          <button
            type="button"
            onClick={() => exportSalesToCSV(periodSales)}
            className="px-3 py-1.5 text-xs font-semibold bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl transition-colors flex items-center gap-1.5 shadow-sm"
            title="Dövrün satışlarını CSV formatında endir"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('pos')}
            style={{ backgroundColor: primaryColor }}
            className="px-3.5 py-1.5 text-xs font-bold text-white rounded-xl transition-all shadow-md hover:opacity-90 flex items-center gap-1.5"
          >
            <span>Kassa (POS)</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Custom Date Range Picker when 'custom' is active */}
      {period === 'custom' && (
        <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-wrap items-center gap-4 animate-in fade-in">
          <div className="flex items-center gap-2 text-xs font-bold text-zinc-700 dark:text-zinc-300">
            <Filter className="w-4 h-4 text-red-500" />
            <span>Xüsusi Tarix Aralığı:</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-zinc-500 dark:text-zinc-400">Başlanğıc:</span>
            <input
              type="date"
              value={customStart}
              onChange={e => setCustomStart(e.target.value)}
              className="px-3 py-1.5 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white text-xs font-mono focus:outline-none focus:border-red-500"
            />
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-zinc-500 dark:text-zinc-400">Son:</span>
            <input
              type="date"
              value={customEnd}
              onChange={e => setCustomEnd(e.target.value)}
              className="px-3 py-1.5 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white text-xs font-mono focus:outline-none focus:border-red-500"
            />
          </div>
          <span className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">
            {periodSales.length} satış tapıldı
          </span>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────
          4 ALT-TAB NAVİQASİYASI (İcmal, Məhsullar, Maliyyə, Depo)
         ───────────────────────────────────────────────────────── */}
      <div className="flex items-center p-1.5 bg-zinc-100 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-x-auto gap-1">
        <button
          type="button"
          onClick={() => setActiveSubTab('summary')}
          className={`flex-1 min-w-[120px] py-2 px-3 text-xs sm:text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 whitespace-nowrap ${
            activeSubTab === 'summary'
              ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm border border-zinc-200 dark:border-zinc-700'
              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-zinc-800/40'
          }`}
        >
          <PieChart className="w-4 h-4 text-red-500" />
          <span>İcmal (Ümumi)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('products')}
          className={`flex-1 min-w-[140px] py-2 px-3 text-xs sm:text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 whitespace-nowrap ${
            activeSubTab === 'products'
              ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm border border-zinc-200 dark:border-zinc-700'
              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-zinc-800/40'
          }`}
        >
          <Droplets className="w-4 h-4 text-cyan-500 dark:text-cyan-400" />
          <span>Məhsul Satışları ({categorySummary.totalQuantity})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('finance')}
          className={`flex-1 min-w-[120px] py-2 px-3 text-xs sm:text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 whitespace-nowrap ${
            activeSubTab === 'finance'
              ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm border border-zinc-200 dark:border-zinc-700'
              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-zinc-800/40'
          }`}
        >
          <DollarSign className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span>Maliyyə & Balans</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('stock')}
          className={`flex-1 min-w-[120px] py-2 px-3 text-xs sm:text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 whitespace-nowrap ${
            activeSubTab === 'stock'
              ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm border border-zinc-200 dark:border-zinc-700'
              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-zinc-800/40'
          }`}
        >
          <PackageCheck className="w-4 h-4 text-amber-500 dark:text-amber-400" />
          <span>Depo & Qalıqlar</span>
          {lowStockItems.length > 0 && (
            <span className="px-1.5 py-0.5 text-[10px] font-mono font-bold rounded-md bg-red-600 text-white">
              {lowStockItems.length}
            </span>
          )}
        </button>
      </div>

      {/* ─────────────────────────────────────────────────────────
          TAB 1: İCMAL (Minimal KPI kartları, Ödənişlər, Kateqoriya Zolağı)
         ───────────────────────────────────────────────────────── */}
      {activeSubTab === 'summary' && (
        <div className="space-y-6">
          {/* Minimal KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Period Sales Revenue (Gross Sales including credit sales) */}
            <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800/90 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                  Ümumi Satış (Dövriyyə)
                </span>
                <div className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-950/80 text-red-600 dark:text-red-400 flex items-center justify-center border border-red-200 dark:border-red-900/60">
                  <TrendingUp className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-black text-zinc-900 dark:text-white font-mono tracking-tight">
                  {formatAZN(periodRevenue)}
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 flex flex-wrap items-center gap-1.5">
                  <span>{periodSales.length} satış ({categorySummary.totalQuantity} əd.)</span>
                  {periodMetrics.creditSales > 0 && (
                    <span className="text-rose-600 dark:text-rose-400 font-semibold">
                      · Borcla: {formatAZN(periodMetrics.creditSales)}
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Actual Cash Drawer Inflow & Net Cash Balance */}
            <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-emerald-200 dark:border-emerald-900/70 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                  Faktiki Kassaya Girən
                </span>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center border bg-emerald-50 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/60">
                  <DollarSign className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-black font-mono tracking-tight text-emerald-600 dark:text-emerald-400">
                  {formatAZN(periodMetrics.actualDrawerInflow)}
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  Xalis pul balansı:{' '}
                  <strong className={periodMetrics.netCashBalance >= 0 ? 'text-zinc-800 dark:text-zinc-200 font-mono' : 'text-red-600 dark:text-red-400 font-mono'}>
                    {formatAZN(periodMetrics.netCashBalance)}
                  </strong>
                  {periodDebtCollected > 0 && (
                    <span className="text-amber-600 dark:text-amber-400 font-semibold"> · Borcdan: +{formatAZN(periodDebtCollected)}</span>
                  )}
                </p>
              </div>
            </div>

            {/* Total Remaining Debt */}
            <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800/90 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                  Qalıq Nisyə (Borc)
                </span>
                <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-200 dark:border-amber-900/60">
                  <Users className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-black text-zinc-900 dark:text-white font-mono tracking-tight">
                  {formatAZN(debtOverview.totalRemainingDebt)}
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  Borclu: <span className="font-semibold text-amber-600 dark:text-amber-400">{debtOverview.debtorCount} nəfər</span>
                  {periodDebtCollected > 0 && (
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold"> · Geri alınıb: {formatAZN(periodDebtCollected)}</span>
                  )}
                </p>
              </div>
            </div>

            {/* Net Profit Card */}
            <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800/90 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                  Xalis Mənfəət (Gəlir − Xərc)
                </span>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${
                  periodProfit.isProfit
                    ? 'bg-cyan-50 dark:bg-cyan-950/80 text-cyan-600 dark:text-cyan-400 border-cyan-200 dark:border-cyan-900/60'
                    : 'bg-red-50 dark:bg-red-950/80 text-red-600 dark:text-red-400 border-red-200 dark:border-red-900/60'
                }`}>
                  <Wallet className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <div className={`text-2xl font-black font-mono tracking-tight ${
                  periodProfit.isProfit ? 'text-cyan-600 dark:text-cyan-400' : 'text-red-600 dark:text-red-400'
                }`}>
                  {formatAZN(periodProfit.netProfit)}
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  Alış: {formatAZN(periodPurchasesAmount)} · Xərc: {formatAZN(periodExpensesAmount)}
                </p>
              </div>
            </div>
          </div>

          {/* Dynamic Natural Language Summary & Color Multi-Segment Bar */}
          <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Droplets className="w-4 h-4 text-cyan-500 dark:text-cyan-400" />
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white tracking-wide">
                  Dövrün Kateqoriya Dövriyyəsi
                </h3>
              </div>
              <span className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">
                Cəmi: {formatAZN(categorySummary.totalRevenue)}
              </span>
            </div>

            {/* Dynamic narrative */}
            <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed bg-zinc-50 dark:bg-zinc-950/60 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800/80">
              {categoryNarrative}
            </p>

            {/* Visual multi-segment bar */}
            {categorySummary.totalRevenue > 0 && (
              <div className="space-y-2">
                <div className="h-3 w-full bg-zinc-100 dark:bg-zinc-950 rounded-full overflow-hidden flex shadow-inner">
                  {categorySummary.categories.map((cat, idx) => {
                    const themeStyle = getCategoryTheme(cat.categoryName);
                    return (
                      <div
                        key={idx}
                        style={{ width: `${cat.percentageOfTotal}%` }}
                        className={`${themeStyle.barBg} transition-all hover:opacity-90`}
                        title={`${cat.categoryName}: ${formatAZN(cat.revenue)} (${cat.percentageOfTotal}%)`}
                      />
                    );
                  })}
                </div>

                {/* Legend */}
                <div className="flex flex-wrap items-center gap-4 pt-1 text-xs">
                  {categorySummary.categories.map((cat, idx) => {
                    const themeStyle = getCategoryTheme(cat.categoryName);
                    return (
                      <div key={idx} className="flex items-center gap-1.5">
                        <span className={`w-2.5 h-2.5 rounded-full ${themeStyle.barBg}`} />
                        <span className="text-zinc-600 dark:text-zinc-300 font-medium">{cat.categoryName}:</span>
                        <span className="font-mono font-bold text-zinc-900 dark:text-white">{formatAZN(cat.revenue)}</span>
                        <span className="text-zinc-500 dark:text-zinc-400">({cat.percentageOfTotal}%)</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* ─────────────────────────────────────────────────────────
              RECHARTS AREA CHART: SATIŞLARIN ZAMAN ÜZRƏ DİNAMİKASI
             ───────────────────────────────────────────────────────── */}
          <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-red-500" />
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white tracking-wide">
                  Satışların Zaman Üzrə Dinamikası (Sahə Qrafiki)
                </h3>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-zinc-500 dark:text-zinc-400">Dövr üzrə ümumi gəlir:</span>
                <span className="font-mono font-black text-red-600 dark:text-red-400 text-sm">
                  {formatAZN(periodRevenue)}
                </span>
              </div>
            </div>

            <div className="h-64 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={timelineChartData}
                  margin={{ top: 10, right: 10, left: -15, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="salesAreaGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={primaryColor} stopOpacity={0.42} />
                      <stop offset="95%" stopColor={primaryColor} stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={isDark ? '#27272a' : '#e4e4e7'}
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    stroke={isDark ? '#71717a' : '#71717a'}
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke={isDark ? '#71717a' : '#71717a'}
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
                          <div className="bg-white dark:bg-zinc-950/95 border border-zinc-200 dark:border-zinc-800 p-3 rounded-xl shadow-xl text-xs space-y-1">
                            <p className="font-bold text-zinc-800 dark:text-zinc-300">{data.fullDate || label}</p>
                            <div className="flex items-center gap-2">
                              <span
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: primaryColor }}
                              />
                              <span className="text-zinc-500 dark:text-zinc-400">Satış Gəliri:</span>
                              <span className="font-mono text-sm font-black text-zinc-900 dark:text-white">
                                {formatAZN(Number(payload[0].value))}
                              </span>
                            </div>
                            <p className="text-[11px] text-zinc-500 font-medium">
                              Əməliyyat sayı: <strong className="text-zinc-800 dark:text-zinc-300 font-mono">{data.salesCount}</strong>
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
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#salesAreaGradient)"
                    dot={{ r: 3, fill: primaryColor, strokeWidth: 1, stroke: '#ffffff' }}
                    activeDot={{ r: 6, fill: primaryColor, strokeWidth: 2, stroke: '#ffffff' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Payment Methods & Daily Discrepancy Verification */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Payment Methods Breakdown */}
            <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-red-500" />
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                    Faktiki Kassa Daxilolmaları (Nağd / Kart / POS)
                  </h3>
                </div>
                <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  {formatAZN(totalPaid)}
                </span>
              </div>

              <div className="space-y-3">
                {/* Cash */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                      <Banknote className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" /> Nağd Kassa
                    </span>
                    <span className="font-mono font-bold text-zinc-900 dark:text-white">
                      {formatAZN(combinedCash)} ({cashPct}%)
                    </span>
                  </div>
                  <div className="h-1.5 bg-zinc-100 dark:bg-zinc-950 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500" style={{ width: `${cashPct}%` }} />
                  </div>
                </div>

                {/* Card */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" /> Bank Kartı
                    </span>
                    <span className="font-mono font-bold text-zinc-900 dark:text-white">
                      {formatAZN(combinedCard)} ({cardPct}%)
                    </span>
                  </div>
                  <div className="h-1.5 bg-zinc-100 dark:bg-zinc-950 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500" style={{ width: `${cardPct}%` }} />
                  </div>
                </div>

                {/* POS */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                      <Smartphone className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" /> POS Terminal
                    </span>
                    <span className="font-mono font-bold text-zinc-900 dark:text-white">
                      {formatAZN(combinedPos)} ({posPct}%)
                    </span>
                  </div>
                  <div className="h-1.5 bg-zinc-100 dark:bg-zinc-950 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500" style={{ width: `${posPct}%` }} />
                  </div>
                </div>

                {/* Non-drawer items separated clearly */}
                <div className="pt-2.5 mt-2 border-t border-zinc-200 dark:border-zinc-800 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-rose-700 dark:text-rose-400 font-semibold">
                      Borcla Satış (Kassaya əlavə edilmir):
                    </span>
                    <span className="font-mono font-bold text-rose-700 dark:text-rose-400">
                      {formatAZN(periodMetrics.creditSales)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-600 dark:text-zinc-400 flex items-center gap-1.5">
                      <Wallet className="w-3.5 h-3.5 text-cyan-500 dark:text-cyan-400" /> Müştəri Balansından ({balancePct}%):
                    </span>
                    <span className="font-mono font-bold text-cyan-700 dark:text-cyan-400">
                      {formatAZN(periodPayments.balance)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Daily Discrepancy & Shift Check */}
            <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                    Gündəlik Kassa və Hesabat Fərqi
                  </h3>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  discrepancy.isMatching
                    ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                    : 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800'
                }`}>
                  {discrepancy.isMatching ? 'Uyğundur' : 'Fərq Var'}
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-800/80 space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-zinc-600 dark:text-zinc-400">
                    Gözlənilən Kassa (Satış + {formatAZN(todayDebtTotal)} Borc Ödənişi):
                  </span>
                  <span className="font-mono font-bold text-zinc-900 dark:text-white">{formatAZN(discrepancy.salesTotal)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-600 dark:text-zinc-400">İşçinin Gündəlik Hesabatı:</span>
                  <span className="font-mono font-bold text-zinc-900 dark:text-white">{formatAZN(discrepancy.dailyReportTotal)}</span>
                </div>
                <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 flex justify-between items-center font-bold">
                  <span className="text-zinc-700 dark:text-zinc-300">Fərq:</span>
                  <span className={`font-mono ${discrepancy.difference === 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                    {formatAZN(discrepancy.difference)}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onNavigate('daily-report')}
                className="w-full py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-semibold rounded-xl transition-colors border border-zinc-200 dark:border-zinc-700/80"
              >
                Gündəlik Hesabat Səhifəsinə Keç
              </button>
            </div>
          </div>

          {/* Recent Sales in Period */}
          <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                  Seçilən Dövrün Son Satışları ({periodSales.length})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('pos')}
                className="text-xs text-red-600 dark:text-red-400 hover:underline font-semibold"
              >
                Hamısını Gör
              </button>
            </div>

            {periodSales.length === 0 ? (
              <p className="text-xs text-zinc-500 py-4 text-center">
                Bu dövr üçün heç bir satış qeydə alınmayıb.
              </p>
            ) : (
              <div className="divide-y divide-zinc-200 dark:divide-zinc-800/80">
                {periodSales.slice(0, 5).map(sale => (
                  <div key={sale.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-semibold text-zinc-900 dark:text-white">
                        {sale.items.map(i => `${i.productName} (${i.quantity}x)`).join(', ')}
                      </div>
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                        {formatDateAZ(sale.date)} {sale.time} · Ödəniş:{' '}
                        <span className="capitalize text-zinc-700 dark:text-zinc-300">{sale.paymentType}</span>
                        {sale.createdBy && (
                          <span> · Məsul: <strong className="text-zinc-700 dark:text-zinc-300">@{sale.createdBy}</strong></span>
                        )}
                      </div>
                    </div>
                    <div className="font-mono font-bold text-zinc-900 dark:text-white text-sm">
                      {formatAZN(sale.totalAmount)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────
          TAB 2: MƏHSUL SATIŞLARI (Məs: 1 L Su 10 ədəd 10 AZN, Kateqoriyalar)
         ───────────────────────────────────────────────────────── */}
      {activeSubTab === 'products' && (
        <div className="space-y-6 animate-in fade-in">
          {/* Header Note */}
          <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-50 dark:bg-cyan-950 text-cyan-600 dark:text-cyan-400 flex items-center justify-center border border-cyan-200 dark:border-cyan-900/60 shrink-0">
                <ShoppingBag className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                  Məhsul və Kateqoriyalar Üzrə Satış Hesabatı
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Seçilən dövrdə ({dateRange.label}) hər kateqoriya və məhsuldan neçə ədəd satıldığı və əldə olunan dövriyyə.
                </p>
              </div>
            </div>

            <div className="text-right shrink-0">
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400 block">Dövrün Satış Cəmi</span>
              <span className="text-lg font-black text-zinc-900 dark:text-white font-mono">
                {formatAZN(categorySummary.totalRevenue)}
              </span>
            </div>
          </div>

          {/* If no sales in period */}
          {categorySummary.categories.length === 0 ? (
            <div className="p-8 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-center space-y-2">
              <p className="text-sm font-bold text-zinc-700 dark:text-zinc-300">
                Seçilən dövr üçün ({dateRange.label}) heç bir məhsul satışı qeydə alınmayıb.
              </p>
              <p className="text-xs text-zinc-500">
                Dövrü dəyişərək "Bu ay" və ya "Həftəlik" seçə bilərsiniz.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5">
              {categorySummary.categories.map((cat, idx) => {
                const themeStyle = getCategoryTheme(cat.categoryName);
                const isExpanded = expandedCategories[cat.categoryName] ?? true;

                return (
                  <div
                    key={idx}
                    className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4"
                  >
                    {/* Category Header */}
                    <div
                      onClick={() => toggleCategoryExpand(cat.categoryName)}
                      className="flex items-center justify-between cursor-pointer select-none pb-2 border-b border-zinc-200 dark:border-zinc-800"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center shrink-0">
                          {themeStyle.icon}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-base font-bold text-zinc-900 dark:text-white">
                              {cat.categoryName} Bölməsi
                            </h4>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${themeStyle.badgeBg}`}>
                              {cat.percentageOfTotal}% Dövriyyə
                            </span>
                          </div>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                            Cəmi: <span className="font-bold text-zinc-900 dark:text-white">{cat.quantity} ədəd</span> · Məhsul çeşidi: {cat.products.length}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <span className="text-base font-black text-zinc-900 dark:text-white font-mono block">
                            {formatAZN(cat.revenue)}
                          </span>
                          <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
                            {cat.quantity} ədəd satılıb
                          </span>
                        </div>
                        <button type="button" className="text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white p-1">
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {/* Category Products Table */}
                    {isExpanded && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-zinc-200 dark:border-zinc-800/80 text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                              <th className="py-2 px-3">Məhsul Adı</th>
                              <th className="py-2 px-3 text-right">Vahid Qiyməti</th>
                              <th className="py-2 px-3 text-right">Satılan Say</th>
                              <th className="py-2 px-3 text-right">Cəmi Gəlir</th>
                              <th className="py-2 px-3 text-right">Bölmədəki Payı</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
                            {cat.products.map(prod => (
                              <tr
                                key={prod.productId}
                                className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors"
                              >
                                <td className="py-2.5 px-3 font-semibold text-zinc-900 dark:text-white">
                                  {prod.productName}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono text-zinc-600 dark:text-zinc-300">
                                  {formatAZN(prod.unitPrice)}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono font-bold text-red-600 dark:text-red-400">
                                  {prod.quantity} ədəd
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono font-black text-zinc-900 dark:text-white">
                                  {formatAZN(prod.revenue)}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono text-zinc-500 dark:text-zinc-400">
                                  <div className="flex items-center justify-end gap-1.5">
                                    <span>{prod.percentageOfCategory}%</span>
                                    <div className="w-12 h-1 bg-zinc-200 dark:bg-zinc-950 rounded-full overflow-hidden inline-block">
                                      <div
                                        className={`h-full ${themeStyle.barBg}`}
                                        style={{ width: `${prod.percentageOfCategory}%` }}
                                      />
                                    </div>
                                  </div>
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

          {/* Top Selling Products List */}
          {productSaleStats.length > 0 && (
            <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                    Dövrün Ən Çox Satılan Top Məhsulları
                  </h3>
                </div>
                <span className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">
                  {productSaleStats.length} məhsul növü
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {productSaleStats.slice(0, 6).map((item, idx) => (
                  <div
                    key={item.productId}
                    className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-950/70 border border-zinc-200 dark:border-zinc-800/80 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="w-6 h-6 rounded-lg bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-bold flex items-center justify-center text-[11px]">
                        {idx + 1}
                      </span>
                      <div>
                        <div className="font-bold text-zinc-900 dark:text-white">{item.productName}</div>
                        <div className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono">
                          {formatAZN(item.unitPrice)} / ədəd
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-red-600 dark:text-red-400 font-mono">{item.totalQuantity} ədəd</div>
                      <div className="font-black text-zinc-900 dark:text-white font-mono">{formatAZN(item.totalRevenue)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────
          TAB 3: MALİYYƏ & BALANS (Dövriyyə, Alış, Xərc, Borc, Depozit)
         ───────────────────────────────────────────────────────── */}
      {activeSubTab === 'finance' && (
        <div className="space-y-6 animate-in fade-in">
          {/* Real Cash Balance Card (Actual Cash Inflow - Actual Cash Outflow) */}
          <div className="p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-emerald-200 dark:border-emerald-900/60 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <Banknote className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                <div>
                  <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                    Kassanın Faktiki Pul Balansı (Real Daxil Olan − Çıxan)
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Borcla satış ({formatAZN(periodMetrics.creditSales)}) ödənilənə qədər faktiki kassa balansına daxil edilmir
                  </p>
                </div>
              </div>
              <span className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">
                {dateRange.label}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
              <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-center">
                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider block">
                  Satışdan Real Daxilolma
                </span>
                <span className="text-xl font-black text-zinc-900 dark:text-white font-mono mt-1 block">
                  {formatAZN(periodMetrics.salesRealInflow)}
                </span>
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  Nağd + Kart + POS
                </span>
              </div>

              <div className="p-4 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 text-center">
                <span className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider block">
                  Geri Alınan Borclar (+)
                </span>
                <span className="text-xl font-black text-amber-700 dark:text-amber-400 font-mono mt-1 block">
                  +{formatAZN(periodMetrics.debtCollectedTotal)}
                </span>
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  {periodMetrics.debtCollectedCount} borc ödənişi qəbulu
                </span>
              </div>

              <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-center">
                <span className="text-xs font-bold text-red-600 dark:text-red-400 uppercase tracking-wider block">
                  Çıxan Pullar (Alış + Xərc) (−)
                </span>
                <span className="text-xl font-black text-red-600 dark:text-red-400 font-mono mt-1 block">
                  − {formatAZN(periodMetrics.totalCashOutflow)}
                </span>
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  Alış: {formatAZN(periodPurchasesAmount)} · Xərc: {formatAZN(periodExpensesAmount)}
                </span>
              </div>

              <div className={`p-4 rounded-xl border text-center ${
                periodMetrics.netCashBalance >= 0
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                  : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
              }`}>
                <span className="text-xs font-bold uppercase tracking-wider block">
                  Faktiki Kassa Pul Qalığı (=)
                </span>
                <span className="text-2xl font-black font-mono mt-1 block">
                  {formatAZN(periodMetrics.netCashBalance)}
                </span>
                <span className="text-[11px] font-mono">
                  Cəmi daxil: {formatAZN(periodMetrics.actualDrawerInflow)}
                </span>
              </div>
            </div>
          </div>

          {/* Net Profit Mathematical Formula Card (Accrual: includes credit sales as earned revenue) */}
          <div className="p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                  Dövrün Ümumi Satış Gəliri və Xalis Mənfəət
                </h3>
              </div>
              <span className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">
                {dateRange.label}
              </span>
            </div>

            {/* Formula Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
              {/* Revenue */}
              <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-center">
                <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider block">
                  Ümumi Satış Gəliri (+)
                </span>
                <span className="text-xl font-black text-zinc-900 dark:text-white font-mono mt-1 block">
                  {formatAZN(periodRevenue)}
                </span>
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  {periodSales.length} satış (Borcla: {formatAZN(periodMetrics.creditSales)})
                </span>
              </div>

              {/* Purchases */}
              <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-center">
                <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider block">
                  Mal Alışı (−)
                </span>
                <span className="text-xl font-black text-red-600 dark:text-red-400 font-mono mt-1 block">
                  − {formatAZN(periodPurchasesAmount)}
                </span>
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  {periodPurchases.length} mal qəbulu
                </span>
              </div>

              {/* Expenses */}
              <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-center">
                <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider block">
                  Digər Xərclər (−)
                </span>
                <span className="text-xl font-black text-amber-600 dark:text-amber-400 font-mono mt-1 block">
                  − {formatAZN(periodExpensesAmount)}
                </span>
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  İcarə, maaş, kommunal
                </span>
              </div>

              {/* Net Profit Result */}
              <div className={`p-4 rounded-xl border text-center ${
                periodProfit.isProfit
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                  : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
              }`}>
                <span className="text-xs font-bold uppercase tracking-wider block">
                  Xalis Mənfəət (=)
                </span>
                <span className="text-2xl font-black font-mono mt-1 block">
                  {formatAZN(periodProfit.netProfit)}
                </span>
                <span className="text-[11px]">
                  {periodProfit.isProfit ? 'Müsbət Gəlir' : 'Zərər'}
                </span>
              </div>
            </div>
          </div>

          {/* Customer Balances & Debts Overview */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Customer Deposit Accounts */}
            <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                    Müştəri Depozit Balansları
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('debts')}
                  className="text-xs text-red-600 dark:text-red-400 hover:underline font-semibold"
                >
                  Hesablara Keç
                </button>
              </div>

              <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-950/70 border border-zinc-200 dark:border-zinc-800/80 space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-500 dark:text-zinc-400">Cari Aktiv Müştəri Depoziti:</span>
                  <span className="font-mono font-bold text-cyan-600 dark:text-cyan-400 text-base">
                    {formatAZN(totalCustomerBalance)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-500 dark:text-zinc-400">Depozitli Müştəri Sayı:</span>
                  <span className="font-mono font-bold text-zinc-900 dark:text-white">
                    {customerAccounts.length} nəfər
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs pt-2 border-t border-zinc-200 dark:border-zinc-800">
                  <span className="text-zinc-500 dark:text-zinc-400">İndiyədək Qoyulan Ümumi Depozit:</span>
                  <span className="font-mono font-bold text-zinc-700 dark:text-zinc-300">
                    {formatAZN(totalDepositedAllTime)}
                  </span>
                </div>
              </div>

              {customerAccounts.length > 0 && (
                <div className="divide-y divide-zinc-200 dark:divide-zinc-800/80 text-xs">
                  {customerAccounts.slice(0, 3).map(c => (
                    <div key={c.id} className="py-2 flex items-center justify-between">
                      <span className="font-semibold text-zinc-900 dark:text-white">{c.name}</span>
                      <span className="font-mono font-bold text-cyan-600 dark:text-cyan-400">
                        {formatAZN(c.balance)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Debts Overview */}
            <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-amber-500 dark:text-amber-400" />
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                    Nisyə (Borc) Vəziyyəti
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('debts')}
                  className="text-xs text-red-600 dark:text-red-400 hover:underline font-semibold"
                >
                  Borclulara Keç
                </button>
              </div>

              <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-950/70 border border-zinc-200 dark:border-zinc-800/80 space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-500 dark:text-zinc-400">Ümumi Qalıq Borc:</span>
                  <span className="font-mono font-bold text-amber-600 dark:text-amber-400 text-base">
                    {formatAZN(debtOverview.totalRemainingDebt)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-500 dark:text-zinc-400">Aktiv Borclu Sayı:</span>
                  <span className="font-mono font-bold text-zinc-900 dark:text-white">
                    {debtOverview.debtorCount} nəfər
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs pt-2 border-t border-zinc-200 dark:border-zinc-800">
                  <span className="text-zinc-500 dark:text-zinc-400">Ödənilmiş Nisyə Cəmi:</span>
                  <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    {formatAZN(debtOverview.totalPaidDebt)}
                  </span>
                </div>
              </div>

              {debts.filter(d => d.remainingAmount > 0).length > 0 && (
                <div className="divide-y divide-zinc-200 dark:divide-zinc-800/80 text-xs">
                  {debts
                    .filter(d => d.remainingAmount > 0)
                    .slice(0, 3)
                    .map(d => (
                      <div key={d.id} className="py-2 flex items-center justify-between">
                        <span className="font-semibold text-zinc-900 dark:text-white">{d.debtorName}</span>
                        <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                          {formatAZN(d.remainingAmount)}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────
          TAB 4: DEPO & QALIQLAR (Aktiv Qalıqlar, Kritik Hədlər)
         ───────────────────────────────────────────────────────── */}
      {activeSubTab === 'stock' && (
        <div className="space-y-6 animate-in fade-in">
          {/* Low Stock Warning Alert if any */}
          {lowStockItems.length > 0 ? (
            <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-600 text-white flex items-center justify-center shrink-0 shadow-md">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-red-900 dark:text-red-200">
                    Depoda {lowStockItems.length} məhsulun qalığı kritik həddədir ({settings.minStockThreshold} ədəd və ya az)!
                  </h4>
                  <p className="text-xs text-red-700 dark:text-red-300/80 mt-0.5">
                    {lowStockItems.map(i => `${i.product.name} (${i.activeStock} ədəd)`).join(' · ')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('purchases')}
                className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl transition-colors shrink-0 shadow-sm"
              >
                Mal Qəbulu Et
              </button>
            </div>
          ) : (
            <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 text-emerald-800 dark:text-emerald-300 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <div className="text-xs">
                <span className="font-bold">Bütün məhsulların anbar qalığı normal səviyyədədir.</span> Heç bir məhsul minimum həddən ({settings.minStockThreshold} ədəd) aşağı düşməyib.
              </div>
            </div>
          )}

          {/* Inventory Stock Table */}
          <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <PackageCheck className="w-5 h-5 text-amber-500 dark:text-amber-400" />
                <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                  Depo Məhsullarının Aktiv Qalıq Cədvəli ({allStocksList.length} Məhsul)
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onNavigate('purchases')}
                  className="px-3 py-1.5 text-xs font-bold bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-white rounded-xl border border-zinc-200 dark:border-zinc-700 transition-colors"
                >
                  Mal Qəbulu
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('products')}
                  style={{ backgroundColor: primaryColor }}
                  className="px-3 py-1.5 text-xs font-bold text-white rounded-xl transition-colors hover:opacity-90"
                >
                  Məhsul Əlavə Et
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-800 text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                    <th className="py-2.5 px-3">Məhsul</th>
                    <th className="py-2.5 px-3">Kateqoriya</th>
                    <th className="py-2.5 px-3 text-right">Qiymət</th>
                    <th className="py-2.5 px-3 text-right">Daxil Olan</th>
                    <th className="py-2.5 px-3 text-right">Satılan</th>
                    <th className="py-2.5 px-3 text-right">Aktiv Qalıq</th>
                    <th className="py-2.5 px-3 text-right">Vəziyyət</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                  {allStocksList.map(stock => {
                    const isLow = stock.isLowStock;
                    const isOut = stock.activeStock <= 0;

                    return (
                      <tr key={stock.product.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors">
                        <td className="py-3 px-3 font-semibold text-zinc-900 dark:text-white">
                          <div>{stock.product.name}</div>
                          {stock.product.barcode && (
                            <div className="text-[10px] text-zinc-500 font-mono">
                              Barkod: {stock.product.barcode}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 text-zinc-600 dark:text-zinc-400">
                          {stock.product.category}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-zinc-700 dark:text-zinc-300">
                          {formatAZN(stock.product.salePrice)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-zinc-600 dark:text-zinc-400">
                          {stock.initialStock + stock.totalPurchased}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-zinc-600 dark:text-zinc-400">
                          {stock.totalSold}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-black text-sm">
                          <span
                            className={
                              isOut
                                ? 'text-red-600 dark:text-red-500'
                                : isLow
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-zinc-900 dark:text-white'
                            }
                          >
                            {stock.activeStock}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              isOut
                                ? 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800'
                                : isLow
                                ? 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800'
                                : 'bg-emerald-50 dark:bg-zinc-800 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-zinc-700'
                            }`}
                          >
                            {isOut ? 'Bitib' : isLow ? 'Kritik Qalıq' : 'Normal'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
