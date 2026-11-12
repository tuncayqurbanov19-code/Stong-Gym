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
  BookOpen,
  Wallet,
  ArrowDownLeft,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatAZN, formatDateAZ, getTodayISODate, getCurrentMonthKey } from '../utils/dateUtils';
import { calculateFinancialMetricsForRange } from '../utils/financialCalculations';
import { exportDailyReportsToCSV } from '../utils/exportUtils';
import { StaffPaymentBreakdown } from '../components/StaffPaymentBreakdown';

export const DailyReportView: React.FC = () => {
  const {
    dailyReports,
    sales,
    debts,
    purchases,
    expenses,
    saveDailyReport,
    currentUser,
    settings,
  } = useApp();
  const isAdmin = currentUser?.role === 'admin';

  const todayISO = getTodayISODate();
  const [selectedDate, setSelectedDate] = useState(todayISO);
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthKey());

  // Current day inputs
  const [cashInput, setCashInput] = useState('');
  const [cardInput, setCardInput] = useState('');
  const [posInput, setPosInput] = useState('');
  const [reportNotes, setReportNotes] = useState('');
  const [isSavedSuccess, setIsSavedSuccess] = useState(false);

  // Unified authoritative metrics for selectedDate
  const dayMetrics = useMemo(
    () =>
      calculateFinancialMetricsForRange({
        sales,
        debts,
        purchases,
        expenses,
        startDate: selectedDate,
        endDate: selectedDate,
      }),
    [sales, debts, purchases, expenses, selectedDate]
  );

  // Calculate expected inflows for selectedDate (Sales + Debt Collections, without double counting)
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

  // Load or calculate values for selectedDate
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

  // Month Aggregations (Only for Admin)
  const monthReports = dailyReports.filter(r => r.date.startsWith(selectedMonth));
  const monthCash = monthReports.reduce((sum, r) => sum + r.cashAmount, 0);
  const monthCard = monthReports.reduce((sum, r) => sum + r.cardAmount, 0);
  const monthPos = monthReports.reduce((sum, r) => sum + r.posAmount, 0);
  const monthTotal = monthCash + monthCard + monthPos;

  return (
    <div className="space-y-6 pb-12 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-zinc-200 dark:border-zinc-800">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-white tracking-tight flex items-center gap-2">
            <span>Gündəlik Kassa Hesabatı</span>
            <span className="text-xs bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 font-bold px-2 py-0.5 rounded-full border border-red-200 dark:border-red-800">
              Hesabat
            </span>
          </h2>
          <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
            Ümumi satış, nağd/kart, borcla satış və faktiki kassaya daxil olan pulun dəqiq ayrılması
          </p>
        </div>

        {isAdmin && (
          <button
            onClick={() => exportDailyReportsToCSV(dailyReports)}
            className="px-3 py-1.5 text-xs font-semibold bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Hesabatları Export Et</span>
          </button>
        )}
      </div>

      {/* Separated Daily Summary Strip: Sales vs Credit vs Actual Cash Drawer */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            {formatDateAZ(selectedDate)} — Satış, Borc və Faktiki Kassa Ayırımı
          </h3>
          <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
            Borcla satış kassaya əlavə edilmir; yalnız faktiki ödənilən pullar kassanı artırır
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-7 gap-3">
          {/* 1. Ümumi Satış Məbləği */}
          <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Ümumi Satış
              </span>
              <TrendingUp className="w-3.5 h-3.5 text-zinc-400" />
            </div>
            <div className="text-lg font-black font-mono text-zinc-900 dark:text-white mt-1.5">
              {formatAZN(dayMetrics.grossSalesTotal)}
            </div>
            <div className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">
              {dayMetrics.salesCount} satış (Nisyə daxil)
            </div>
          </div>

          {/* 2. Nağd Satış Məbləği */}
          <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                Nağd Satış
              </span>
              <Banknote className="w-3.5 h-3.5 text-emerald-500" />
            </div>
            <div className="text-lg font-black font-mono text-emerald-700 dark:text-emerald-400 mt-1.5">
              {formatAZN(dayMetrics.cashSales)}
            </div>
            <div className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">
              {dayMetrics.debtCollectedCash > 0
                ? `+${formatAZN(dayMetrics.debtCollectedCash)} borcdan`
                : 'Birbaşa nağd satış'}
            </div>
          </div>

          {/* 3. Kartla Satış Məbləği */}
          <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                Kartla Satış
              </span>
              <CreditCard className="w-3.5 h-3.5 text-blue-500" />
            </div>
            <div className="text-lg font-black font-mono text-blue-700 dark:text-blue-400 mt-1.5">
              {formatAZN(dayMetrics.cardSales)}
            </div>
            <div className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">
              POS: <span className="font-mono font-semibold">{formatAZN(dayMetrics.posSales)}</span>
            </div>
          </div>

          {/* 4. Borcla Satış Məbləği */}
          <div className="p-4 rounded-2xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 shadow-sm">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400">
                Borcla Satış
              </span>
              <BookOpen className="w-3.5 h-3.5 text-rose-500" />
            </div>
            <div className="text-lg font-black font-mono text-rose-700 dark:text-rose-400 mt-1.5">
              {formatAZN(dayMetrics.creditSales)}
            </div>
            <div className="text-[10px] text-rose-700/80 dark:text-rose-300/80 mt-0.5 font-semibold">
              Kassaya əlavə olunmur
            </div>
          </div>

          {/* 5. Geri Alınan Borc */}
          <div className="p-4 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 shadow-sm">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                Geri Alınan Borc
              </span>
              <ArrowDownLeft className="w-3.5 h-3.5 text-amber-500" />
            </div>
            <div className="text-lg font-black font-mono text-amber-700 dark:text-amber-400 mt-1.5">
              {formatAZN(dayMetrics.debtCollectedTotal)}
            </div>
            <div className="text-[10px] text-amber-700/80 dark:text-amber-300/80 mt-0.5">
              {dayMetrics.debtCollectedCount} ödəniş (Kassaya əlavə)
            </div>
          </div>

          {/* 6. Faktiki Kassaya Daxil Olan Pul */}
          <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 shadow-sm">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                Faktiki Kassaya Girən
              </span>
              <Wallet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="text-lg font-black font-mono text-emerald-800 dark:text-emerald-300 mt-1.5">
              {formatAZN(dayMetrics.actualDrawerInflow)}
            </div>
            <div className="text-[10px] text-emerald-800/80 dark:text-emerald-400/80 mt-0.5 font-mono">
              {dayMetrics.totalCashOutflow > 0
                ? `Xalis: ${formatAZN(dayMetrics.netCashBalance)}`
                : 'Nağd+Kart+POS+Borc ödənişi'}
            </div>
          </div>

          {/* 7. Ödənilməmiş Borcların Ümumi Məbləği */}
          <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm col-span-2 md:col-span-1">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Ümumi Qalıq Borc
              </span>
              <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
            </div>
            <div className="text-lg font-black font-mono text-red-600 dark:text-red-400 mt-1.5">
              {formatAZN(dayMetrics.totalUnpaidDebts)}
            </div>
            <div className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">
              Ödənilməmiş borcların cəmi
            </div>
          </div>
        </div>
      </section>

      {/* Staff × Payment Method Breakdown Section */}
      <StaffPaymentBreakdown defaultDate={selectedDate} />

      {/* Date Selector Banner */}
      <div className="p-4 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Calendar className="w-5 h-5 text-red-500 shrink-0" />
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 block">
              Kassa Təsdiqi Tarixi {isAdmin ? '(Admin istənilən günü seçə bilər)' : '(Bugünkü gün)'}
            </span>
            {isAdmin ? (
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="font-mono text-base font-bold bg-transparent border-b border-zinc-300 dark:border-zinc-700 pb-0.5 text-zinc-900 dark:text-white focus:outline-none focus:border-red-500"
              />
            ) : (
              <span className="font-mono text-base font-bold text-zinc-900 dark:text-white">
                {formatDateAZ(todayISO)} (Bugün)
              </span>
            )}
          </div>
        </div>

        {isSavedSuccess && (
          <div className="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 rounded-xl text-xs font-bold flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" />
            <span>Hesabat uğurla yadda saxlanıldı!</span>
          </div>
        )}
      </div>

      {/* Daily Entry Form */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <form
          onSubmit={handleSave}
          className="lg:col-span-7 bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm dark:shadow-xl p-6 space-y-5"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-zinc-200 dark:border-zinc-800">
            <h3 className="text-base font-bold text-zinc-900 dark:text-white">
              {formatDateAZ(selectedDate)} Tarixli Kassa Cəmləri
            </h3>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              Satış + borc ödənişlərindən hesablanıb
            </span>
          </div>

          <div className="space-y-4">
            {/* Cash */}
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
                className="w-full px-4 py-2.5 text-base font-mono font-bold rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* Card */}
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
                className="w-full px-4 py-2.5 text-base font-mono font-bold rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* POS */}
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
                className="w-full px-4 py-2.5 text-base font-mono font-bold rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            {/* Notes */}
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
                Hesablanan Gün Cəmi
              </span>
              <span className="text-xl font-black font-mono text-zinc-900 dark:text-white">
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

        {/* Verification and Difference Box */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm dark:shadow-xl p-6 space-y-4">
            <h4 className="text-sm font-bold text-zinc-900 dark:text-white">
              Kassa və Satış Uyğunluğu Yoxlanışı
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
                  <strong className="font-mono">
                    {discrepancy > 0
                      ? `+${formatAZN(discrepancy)} artıq`
                      : `${formatAZN(discrepancy)} əskik`}
                  </strong>
                  . Daxil edilən kassa məbləği ilə günün təsdiqli satış + borc ödənişi cəmi arasında fərq var.
                </p>
              )}
            </div>

            <div className="divide-y divide-zinc-200 dark:divide-zinc-800 text-xs">
              <div className="py-2.5 flex justify-between">
                <span className="text-zinc-500 dark:text-zinc-400">Daxil Edilən Kassa Cəmi:</span>
                <span className="font-mono font-bold text-zinc-900 dark:text-white">
                  {formatAZN(currentTotal)}
                </span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-zinc-500 dark:text-zinc-400">Satışdan Gələn (Nağd/Kart/POS):</span>
                <span className="font-mono font-semibold text-zinc-800 dark:text-zinc-200">
                  {formatAZN(dayInflowStats.salesTotal)}
                </span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-zinc-500 dark:text-zinc-400">
                  Borc Ödənişindən Gələn ({dayInflowStats.debtPaymentsCount} əd.):
                </span>
                <span className="font-mono font-semibold text-amber-600 dark:text-amber-400">
                  {formatAZN(dayInflowStats.debtTotal)}
                </span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-zinc-700 dark:text-zinc-300 font-semibold">
                  Gözlənilən Ümumi Daxilolma:
                </span>
                <span className="font-mono font-bold text-zinc-900 dark:text-white">
                  {formatAZN(dayInflowStats.expectedTotal)}
                </span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-zinc-500 dark:text-zinc-400">Fərq Məbləği:</span>
                <span
                  className={`font-mono font-bold ${
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
        <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm dark:shadow-xl p-6 space-y-5">
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

          {/* Month KPI 4-strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block">
                Aylıq Nağd
              </span>
              <span className="text-lg font-black font-mono text-zinc-900 dark:text-white mt-1 block">
                {formatAZN(monthCash)}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 block">
                Aylıq Bank Kartı
              </span>
              <span className="text-lg font-black font-mono text-zinc-900 dark:text-white mt-1 block">
                {formatAZN(monthCard)}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
              <span className="text-[10px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400 block">
                Aylıq POS Terminal
              </span>
              <span className="text-lg font-black font-mono text-zinc-900 dark:text-white mt-1 block">
                {formatAZN(monthPos)}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800">
              <span className="text-[10px] font-bold uppercase tracking-wider text-red-700 dark:text-red-300 block">
                Aylıq Ümumi Kassa
              </span>
              <span className="text-lg font-black font-mono text-red-700 dark:text-white mt-1 block">
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
