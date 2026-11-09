import React, { useState } from 'react';
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
  BellRing,
  PackageCheck,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatAZN, formatDateAZ, getTodayISODate, getCurrentMonthKey } from '../utils/dateUtils';
import { calculateAllProductStocks, getLowStockProducts } from '../utils/stockCalculations';
import {
  calculatePaymentBreakdown,
  calculateProductSaleCounts,
  calculateNetProfit,
  checkDailyReportDiscrepancy,
  calculateDebtOverview,
} from '../utils/financialCalculations';
import { exportSalesToCSV } from '../utils/exportUtils';
import { PWAInstallButton } from '../components/PWAInstallButton';

export const DashboardView: React.FC<{ onNavigate: (tab: string) => void }> = ({ onNavigate }) => {
  const {
    products,
    purchases,
    sales,
    debts,
    dailyReports,
    expenses,
    settings,
    notificationPermission,
    requestPushPermission,
  } = useApp();

  const [productPeriod, setProductPeriod] = useState<'today' | 'month'>('today');

  const todayISO = getTodayISODate();
  const currentMonth = getCurrentMonthKey();

  // Stock calculations
  const allStocks = calculateAllProductStocks(products, purchases, sales, settings.minStockThreshold);
  const lowStockItems = getLowStockProducts(products, purchases, sales, settings.minStockThreshold);

  // Sales filters
  const confirmedSales = sales.filter(s => s.isConfirmed);
  const todaySales = confirmedSales.filter(s => s.date === todayISO);
  const monthSales = confirmedSales.filter(s => s.date.startsWith(currentMonth));

  // Revenues
  const todayRevenue = todaySales.reduce((sum, s) => sum + s.totalAmount, 0);
  const monthRevenue = monthSales.reduce((sum, s) => sum + s.totalAmount, 0);
  const totalRevenue = confirmedSales.reduce((sum, s) => sum + s.totalAmount, 0);

  // Purchases and Expenses
  const totalGoodsPurchases = purchases.reduce((sum, p) => sum + p.paidAmount, 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

  // Net Profit: Gəlir - Mal alışı - Xərclər
  const profitData = calculateNetProfit(totalRevenue, totalGoodsPurchases, totalExpenses);

  // Payment Breakdown
  const paymentBreakdown = calculatePaymentBreakdown(confirmedSales);
  const totalPaid = (paymentBreakdown.cash + paymentBreakdown.card + paymentBreakdown.pos) || 0;
  const cashPct = totalPaid > 0 ? Math.round((paymentBreakdown.cash / totalPaid) * 100) : 0;
  const cardPct = totalPaid > 0 ? Math.round((paymentBreakdown.card / totalPaid) * 100) : 0;
  const posPct = totalPaid > 0 ? Math.round((paymentBreakdown.pos / totalPaid) * 100) : 0;

  // Top products sold
  const targetSales = productPeriod === 'today' ? todaySales : monthSales;
  const productSaleStats = calculateProductSaleCounts(targetSales);

  // Debt overview
  const debtOverview = calculateDebtOverview(debts);

  // Discrepancy check for today
  const todayReport = dailyReports.find(r => r.date === todayISO);
  const discrepancy = checkDailyReportDiscrepancy(todayReport, sales.filter(s => s.date === todayISO));

  // Last 7 days trend
  const last7Days: { dateStr: string; label: string; amount: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${day}`;
    const dayTotal = confirmedSales
      .filter(s => s.date === dateStr)
      .reduce((sum, s) => sum + s.totalAmount, 0);
    last7Days.push({
      dateStr,
      label: `${day}.${m}`,
      amount: dayTotal,
    });
  }
  const maxDayAmount = Math.max(...last7Days.map(d => d.amount), 10);

  return (
    <div className="space-y-6 pb-12 max-w-7xl mx-auto">
      {/* Top Banner & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-zinc-800">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <span>Xülasə & Dashboard</span>
            <span className="text-xs bg-red-600 text-white font-bold px-2.5 py-0.5 rounded-full shadow-sm shadow-red-600/30">
              Canlı
            </span>
          </h2>
          <p className="text-xs sm:text-sm text-zinc-400">
            Tarix: <span className="font-semibold text-zinc-200">{formatDateAZ(todayISO)}</span> · Valyuta: AZN
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <PWAInstallButton variant="compact" />

          {notificationPermission !== 'granted' && (
            <button
              onClick={() => requestPushPermission()}
              className="px-3 py-1.5 text-xs font-semibold bg-zinc-900 border border-red-900/80 hover:bg-zinc-800 text-red-400 rounded-xl transition-colors flex items-center gap-1.5 shadow-sm"
              title="Qalıq minimum həddə çatanda bildiriş al"
            >
              <BellRing className="w-3.5 h-3.5 text-red-500" />
              <span>Bildirişləri Aktivləşdir</span>
            </button>
          )}

          <button
            onClick={() => exportSalesToCSV(sales)}
            className="px-3 py-1.5 text-xs font-semibold bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 rounded-xl transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Satışları Export Et</span>
          </button>
          <button
            onClick={() => onNavigate('pos')}
            className="px-4 py-1.5 text-xs font-bold bg-red-600 hover:bg-red-700 text-white rounded-xl transition-all shadow-md shadow-red-600/30 flex items-center gap-1.5"
          >
            <span>Kassaya Keç (POS)</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Mobile PWA Install Quick Banner */}
      <div className="lg:hidden">
        <PWAInstallButton variant="banner" />
      </div>

      {/* Low Stock Warning Alert if any */}
      {lowStockItems.length > 0 && (
        <div className="p-4 rounded-2xl bg-red-950/40 border border-red-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-red-600/40">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-red-200">
                Depoda {lowStockItems.length} məhsulun qalığı kritik həddədir ({settings.minStockThreshold} və ya az)!
              </h4>
              <p className="text-xs text-red-300/80">
                {lowStockItems.map(i => `${i.product.name} (${i.activeStock} ədəd qalıb)`).join(' · ')}
              </p>
            </div>
          </div>
          <button
            onClick={() => onNavigate('purchases')}
            className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl transition-colors shrink-0 shadow-sm"
          >
            Mal Qəbulu Et
          </button>
        </div>
      )}

      {/* Discrepancy Verification Status Card */}
      <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
        discrepancy.isMatching
          ? 'bg-zinc-900 border-emerald-900/60 text-emerald-300'
          : 'bg-zinc-900 border-red-900 text-red-300'
      }`}>
        <div className="flex items-start sm:items-center gap-3">
          {discrepancy.isMatching ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5 sm:mt-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5 sm:mt-0" />
          )}
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-300">Gündəlik Kassa Yoxlaması:</span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full inline-block ${
                discrepancy.isMatching
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                  : 'bg-red-950 text-red-300 border border-red-800'
              }`}>
                {discrepancy.message}
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              Təsdiqlənmiş Satışlar: <span className="font-mono font-bold text-white">{formatAZN(discrepancy.salesTotal)}</span> · Gündəlik Hesabat Kassa: <span className="font-mono font-bold text-white">{formatAZN(discrepancy.dailyReportTotal)}</span>
            </p>
          </div>
        </div>

        <button
          onClick={() => onNavigate('daily-report')}
          className="text-xs font-semibold underline hover:no-underline text-red-400 shrink-0 self-end sm:self-center"
        >
          Hesabata bax
        </button>
      </div>

      {/* 4 Main KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Today's Sales */}
        <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-md relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
              Bu Günün Satışı
            </span>
            <div className="w-8 h-8 rounded-lg bg-red-950 text-red-400 flex items-center justify-center border border-red-900/60">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-white font-mono tracking-tight">
              {formatAZN(todayRevenue)}
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              Bugün: <span className="font-bold text-red-400">{todaySales.length} satış</span>
            </p>
          </div>
        </div>

        {/* Month Sales */}
        <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-md relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
              Bu Ayın Satışı
            </span>
            <div className="w-8 h-8 rounded-lg bg-zinc-800 text-zinc-300 flex items-center justify-center">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-white font-mono tracking-tight">
              {formatAZN(monthRevenue)}
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              Ümumi satış: <span className="font-bold text-zinc-200">{formatAZN(totalRevenue)}</span>
            </p>
          </div>
        </div>

        {/* Net Profit */}
        <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-md relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
              Xalis Mənfəət
            </span>
            <div className="w-8 h-8 rounded-lg bg-red-950 text-red-400 flex items-center justify-center border border-red-900/60">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className={`text-2xl font-black font-mono tracking-tight ${
              profitData.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'
            }`}>
              {formatAZN(profitData.netProfit)}
            </div>
            <p className="text-[11px] text-zinc-400 mt-1 truncate">
              Mal alışı: {formatAZN(totalGoodsPurchases)} · Xərc: {formatAZN(totalExpenses)}
            </p>
          </div>
        </div>

        {/* Debt Overview */}
        <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-md relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
              Qalıq Borc
            </span>
            <div className="w-8 h-8 rounded-lg bg-red-950 text-red-400 flex items-center justify-center border border-red-900/60">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-red-500 font-mono tracking-tight">
              {formatAZN(debtOverview.totalRemainingDebt)}
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              Borclu sayı: <span className="font-bold text-red-400">{debtOverview.unpaidDebtorsCount} nəfər</span>
            </p>
          </div>
        </div>
      </div>

      {/* Charts Section: 2 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Payment Breakdown Donut / Stats */}
        <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-md space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-white">
                Ödəniş Növü Üzrə Bölgü
              </h3>
              <p className="text-xs text-zinc-400">Nağd, Kart və POS terminal satışları</p>
            </div>
            <span className="text-xs font-bold text-zinc-200 font-mono">
              {formatAZN(totalPaid)}
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-6 pt-2">
            {/* Circular SVG visualization */}
            <div className="relative w-36 h-36 shrink-0 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="transparent"
                  stroke="#27272a"
                  strokeWidth="12"
                />
                {totalPaid > 0 && (
                  <>
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      fill="transparent"
                      stroke="#10b981"
                      strokeWidth="12"
                      strokeDasharray={`${(cashPct * 251.2) / 100} 251.2`}
                      strokeDashoffset="0"
                      className="transition-all duration-500"
                    />
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      fill="transparent"
                      stroke="#3b82f6"
                      strokeWidth="12"
                      strokeDasharray={`${(cardPct * 251.2) / 100} 251.2`}
                      strokeDashoffset={`-${(cashPct * 251.2) / 100}`}
                      className="transition-all duration-500"
                    />
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      fill="transparent"
                      stroke="#ef4444"
                      strokeWidth="12"
                      strokeDasharray={`${(posPct * 251.2) / 100} 251.2`}
                      strokeDashoffset={`-${((cashPct + cardPct) * 251.2) / 100}`}
                      className="transition-all duration-500"
                    />
                  </>
                )}
              </svg>
              <div className="absolute text-center">
                <span className="text-[10px] text-zinc-400 font-medium">Cəm</span>
                <div className="text-xs font-bold text-white font-mono">
                  {formatAZN(totalPaid)}
                </div>
              </div>
            </div>

            {/* Legend & Breakdown bars */}
            <div className="flex-1 w-full space-y-3">
              <div>
                <div className="flex justify-between text-xs mb-1 font-medium">
                  <span className="flex items-center gap-1.5 text-emerald-400">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                    Nağd ({cashPct}%)
                  </span>
                  <span className="font-mono font-bold text-white">{formatAZN(paymentBreakdown.cash)}</span>
                </div>
                <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
                  <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${cashPct}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1 font-medium">
                  <span className="flex items-center gap-1.5 text-blue-400">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
                    Bank Kartı ({cardPct}%)
                  </span>
                  <span className="font-mono font-bold text-white">{formatAZN(paymentBreakdown.card)}</span>
                </div>
                <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
                  <div className="bg-blue-500 h-full rounded-full" style={{ width: `${cardPct}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1 font-medium">
                  <span className="flex items-center gap-1.5 text-red-400">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-600 inline-block" />
                    POS Terminal ({posPct}%)
                  </span>
                  <span className="font-mono font-bold text-white">{formatAZN(paymentBreakdown.pos)}</span>
                </div>
                <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
                  <div className="bg-red-600 h-full rounded-full" style={{ width: `${posPct}%` }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Top Product Sales (Bar Chart) */}
        <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-md space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-white">
                Məhsul Satış Statistikası
              </h3>
              <p className="text-xs text-zinc-400">Hansı məhsuldan neçə ədəd satılıb</p>
            </div>
            {/* Period Segmented Control */}
            <div className="flex items-center p-1 bg-zinc-950 border border-zinc-800 rounded-xl">
              <button
                type="button"
                onClick={() => setProductPeriod('today')}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                  productPeriod === 'today'
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Bu gün
              </button>
              <button
                type="button"
                onClick={() => setProductPeriod('month')}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                  productPeriod === 'month'
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Bu ay
              </button>
            </div>
          </div>

          {productSaleStats.length === 0 ? (
            <div className="py-12 text-center text-xs text-zinc-500">
              Bu dövr üçün hələ satış qeydə alınmayıb. Satış səhifəsindən yeni satış daxil edin.
            </div>
          ) : (
            <div className="space-y-3 pt-2">
              {productSaleStats.slice(0, 5).map(item => {
                const maxQuantity = productSaleStats[0]?.quantity || 1;
                const widthPercent = Math.min(100, Math.round((item.quantity / maxQuantity) * 100));
                return (
                  <div key={item.productId} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-zinc-200 truncate max-w-[200px]">
                        {item.productName}
                      </span>
                      <span className="text-zinc-400 font-mono">
                        <strong className="text-red-400">{item.quantity} ədəd</strong> ({formatAZN(item.revenue)})
                      </span>
                    </div>
                    <div className="w-full bg-zinc-800 h-2.5 rounded-full overflow-hidden">
                      <div
                        className="bg-red-600 h-full rounded-full transition-all duration-500"
                        style={{ width: `${widthPercent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 7-Day Trend Chart & Inventory Stock Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 7 Day Trend */}
        <div className="lg:col-span-2 p-5 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-md space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-white">
                Son 7 Günlük Satış Trendi
              </h3>
              <p className="text-xs text-zinc-400">Günlər üzrə təsdiqlənmiş dövriyyə (AZN)</p>
            </div>
          </div>

          <div className="h-44 flex items-end justify-between gap-2 pt-6 pb-2 px-2 border-b border-zinc-800">
            {last7Days.map(d => {
              const heightPercent = d.amount > 0 ? Math.max(12, Math.round((d.amount / maxDayAmount) * 100)) : 6;
              const isToday = d.dateStr === todayISO;
              return (
                <div key={d.dateStr} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group">
                  <div className="text-[10px] font-mono text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                    {d.amount.toFixed(1)} ₼
                  </div>
                  <div
                    className={`w-full max-w-[36px] rounded-t-lg transition-all duration-300 ${
                      isToday
                        ? 'bg-red-600 hover:bg-red-500 shadow-md shadow-red-600/30'
                        : 'bg-zinc-800 hover:bg-zinc-700'
                    }`}
                    style={{ height: `${heightPercent}%` }}
                    title={`${d.label}: ${d.amount.toFixed(2)} AZN`}
                  />
                  <span className={`text-[11px] font-mono ${isToday ? 'font-bold text-red-400' : 'text-zinc-500'}`}>
                    {d.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Depo: Active Stock Summary */}
        <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-md flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">
                Aktiv Depo Qalığı
              </h3>
              <button
                onClick={() => onNavigate('products')}
                className="text-xs font-semibold text-red-400 hover:underline"
              >
                Hamısına bax
              </button>
            </div>
            <p className="text-xs text-zinc-400">Məhsul üzrə aktiv say (gələn − satılan)</p>

            <div className="divide-y divide-zinc-800 mt-3 max-h-48 overflow-y-auto pr-1">
              {products.slice(0, 5).map(p => {
                const stock = allStocks[p.id];
                return (
                  <div key={p.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-semibold text-zinc-200 truncate max-w-[150px]">
                        {p.name}
                      </p>
                      <p className="text-[10px] text-zinc-500">
                        Gəlib: {stock?.totalPurchased + stock?.initialStock} · Satılıb: {stock?.totalSold}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className={`font-mono font-bold px-2 py-0.5 rounded-lg ${
                        stock?.isLowStock
                          ? 'bg-red-950 text-red-400 border border-red-800'
                          : 'bg-zinc-800 text-zinc-200'
                      }`}>
                        {stock?.activeStock} ədəd
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <button
            onClick={() => onNavigate('purchases')}
            className="w-full py-2.5 px-3 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold text-xs rounded-xl transition-colors text-center border border-zinc-700"
          >
            + Mal Qəbulu Daxil Et
          </button>
        </div>
      </div>

      {/* Recent Sales List */}
      <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-md space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-white">
              Son Satışlar
            </h3>
            <p className="text-xs text-zinc-400">Ən son icra edilən və ya təsdiqlənən əməliyyatlar</p>
          </div>
          <button
            onClick={() => onNavigate('pos')}
            className="text-xs font-semibold text-red-400 hover:underline"
          >
            Kassa cədvəlinə keç
          </button>
        </div>

        {sales.length === 0 ? (
          <div className="py-8 text-center text-xs text-zinc-500">
            Hələlik heç bir satış qeydə alınmayıb. Satışlar daxil edildikcə burada görünəcək.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-950 text-zinc-400 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-2.5 px-3">Tarix & Saat</th>
                  <th className="py-2.5 px-3">Məhsullar</th>
                  <th className="py-2.5 px-3">Ödəniş</th>
                  <th className="py-2.5 px-3 text-right">Məbləğ</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {sales.slice(0, 5).map(s => (
                  <tr key={s.id} className="hover:bg-zinc-800/40">
                    <td className="py-2.5 px-3 font-mono text-zinc-400 whitespace-nowrap">
                      {formatDateAZ(s.date)} {s.time}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-zinc-200 max-w-xs truncate">
                      {s.items.map(i => `${i.productName} (${i.quantity} əd.)`).join(', ')}
                    </td>
                    <td className="py-2.5 px-3 uppercase text-[10px] font-bold">
                      <span className={`px-2 py-0.5 rounded-full ${
                        s.paymentType === 'naqd'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-900'
                          : s.paymentType === 'kart'
                          ? 'bg-blue-950 text-blue-300 border border-blue-900'
                          : s.paymentType === 'pos'
                          ? 'bg-red-950 text-red-300 border border-red-900'
                          : 'bg-red-900 text-white font-bold'
                      }`}>
                        {s.paymentType === 'borc' ? `Borc (${s.debtorName || 'Adsız'})` : s.paymentType}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-white whitespace-nowrap">
                      {formatAZN(s.totalAmount)}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        s.isConfirmed
                          ? 'bg-emerald-950 text-emerald-300'
                          : 'bg-amber-950 text-amber-300'
                      }`}>
                        {s.isConfirmed ? 'Təsdiqlənib' : 'Gözləmədə'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
