import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  Calendar,
  Save,
  CheckCircle2,
  AlertTriangle,
  Download,
  Banknote,
  CreditCard,
  Smartphone,
  Info,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatAZN, formatDateAZ, getTodayISODate, getCurrentMonthKey } from '../utils/dateUtils';
import { exportDailyReportsToCSV } from '../utils/exportUtils';

export const DailyReportView: React.FC = () => {
  const { dailyReports, sales, saveDailyReport, currentUser } = useApp();
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

  // Load or calculate values for selectedDate
  useEffect(() => {
    const existing = dailyReports.find(r => r.date === selectedDate);
    const daySales = sales.filter(s => s.date === selectedDate && s.isConfirmed && s.paymentType !== 'borc');

    const salesCash = daySales.filter(s => s.paymentType === 'naqd').reduce((sum, s) => sum + s.totalAmount, 0);
    const salesCard = daySales.filter(s => s.paymentType === 'kart').reduce((sum, s) => sum + s.totalAmount, 0);
    const salesPos = daySales.filter(s => s.paymentType === 'pos').reduce((sum, s) => sum + s.totalAmount, 0);

    if (existing) {
      setCashInput(String(existing.cashAmount));
      setCardInput(String(existing.cardAmount));
      setPosInput(String(existing.posAmount));
      setReportNotes(existing.notes || '');
    } else {
      setCashInput(String(salesCash));
      setCardInput(String(salesCard));
      setPosInput(String(salesPos));
      setReportNotes('Kassa qeydiyyatı');
    }
    setIsSavedSuccess(false);
  }, [selectedDate, dailyReports, sales]);

  const cashVal = parseFloat(cashInput) || 0;
  const cardVal = parseFloat(cardInput) || 0;
  const posVal = parseFloat(posInput) || 0;
  const currentTotal = cashVal + cardVal + posVal;

  // Comparison with confirmed sales
  const confirmedDaySales = sales.filter(s => s.date === selectedDate && s.isConfirmed && s.paymentType !== 'borc');
  const confirmedSalesSum = confirmedDaySales.reduce((sum, s) => sum + s.totalAmount, 0);
  const discrepancy = Math.round((currentTotal - confirmedSalesSum) * 100) / 100;
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-zinc-800">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <span>Gündəlik Kassa Hesabatı</span>
            <span className="text-xs bg-red-950 text-red-400 font-bold px-2 py-0.5 rounded-full border border-red-800">
              Hesabat
            </span>
          </h2>
          <p className="text-xs sm:text-sm text-zinc-400">
            Hər gün üzrə Nağd, Kart və POS terminal gəlirlərinin təsdiqi
          </p>
        </div>

        {isAdmin && (
          <button
            onClick={() => exportDailyReportsToCSV(dailyReports)}
            className="px-3 py-1.5 text-xs font-semibold bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 rounded-xl transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Hesabatları Export Et</span>
          </button>
        )}
      </div>

      {/* Date Selector Banner */}
      <div className="p-4 bg-zinc-900 rounded-2xl border border-zinc-800 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Calendar className="w-5 h-5 text-red-500 shrink-0" />
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 block">
              Hesabat Tarixi {isAdmin ? '(Admin istənilən günü seçə bilər)' : '(Bugünkü gün)'}
            </span>
            {isAdmin ? (
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="font-mono text-base font-bold bg-transparent border-b border-zinc-700 pb-0.5 text-white focus:outline-none focus:border-red-500"
              />
            ) : (
              <span className="font-mono text-base font-bold text-white">
                {formatDateAZ(todayISO)} (Bugün)
              </span>
            )}
          </div>
        </div>

        {isSavedSuccess && (
          <div className="px-3 py-1.5 bg-emerald-950 border border-emerald-800 text-emerald-300 rounded-xl text-xs font-bold flex items-center gap-1.5 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4" />
            <span>Hesabat uğurla yadda saxlanıldı!</span>
          </div>
        )}
      </div>

      {/* Daily Entry Form */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <form
          onSubmit={handleSave}
          className="lg:col-span-7 bg-zinc-900 rounded-3xl border border-zinc-800 shadow-xl p-6 space-y-5"
        >
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
            <h3 className="text-base font-bold text-white">
              {formatDateAZ(selectedDate)} Tarixli Kassa Cəmləri
            </h3>
            <span className="text-xs text-zinc-400">
              Satışlardan avtomatik hesablanıb, düzəliş edilə bilər
            </span>
          </div>

          <div className="space-y-4">
            {/* Cash */}
            <div>
              <label className="block text-xs font-bold text-emerald-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Banknote className="w-4 h-4" />
                <span>Nağd Kassa (AZN)</span>
              </label>
              <input
                type="number"
                step="0.05"
                min="0"
                required
                value={cashInput}
                onChange={e => setCashInput(e.target.value)}
                className="w-full px-4 py-2.5 text-base font-mono font-bold rounded-xl border border-zinc-700 bg-zinc-950 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* Card */}
            <div>
              <label className="block text-xs font-bold text-blue-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <CreditCard className="w-4 h-4" />
                <span>Bank Kartı (AZN)</span>
              </label>
              <input
                type="number"
                step="0.05"
                min="0"
                required
                value={cardInput}
                onChange={e => setCardInput(e.target.value)}
                className="w-full px-4 py-2.5 text-base font-mono font-bold rounded-xl border border-zinc-700 bg-zinc-950 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* POS */}
            <div>
              <label className="block text-xs font-bold text-red-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Smartphone className="w-4 h-4" />
                <span>POS Terminal (AZN)</span>
              </label>
              <input
                type="number"
                step="0.05"
                min="0"
                required
                value={posInput}
                onChange={e => setPosInput(e.target.value)}
                className="w-full px-4 py-2.5 text-base font-mono font-bold rounded-xl border border-zinc-700 bg-zinc-950 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-1.5">
                Qeyd və Şərhlər
              </label>
              <input
                type="text"
                value={reportNotes}
                onChange={e => setReportNotes(e.target.value)}
                placeholder="məs: Kassa tam uyğundur, növbə təhvil verildi"
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-zinc-700 bg-zinc-950 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-zinc-800 flex items-center justify-between">
            <div>
              <span className="text-[10px] text-zinc-400 uppercase font-bold block">
                Hesablanan Gün Cəmi
              </span>
              <span className="text-xl font-black font-mono text-white">
                {formatAZN(currentTotal)}
              </span>
            </div>

            <button
              type="submit"
              className="py-3 px-6 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-red-600/30 flex items-center gap-2 active:scale-95"
            >
              <Save className="w-4 h-4" />
              <span>Gündəlik Hesabatı Təsdiqlə və Saxla</span>
            </button>
          </div>
        </form>

        {/* Verification and Difference Box */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-zinc-900 rounded-3xl border border-zinc-800 shadow-xl p-6 space-y-4">
            <h4 className="text-sm font-bold text-white">
              Kassa və Satış Uyğunluğu Yoxlanışı
            </h4>

            <div className={`p-4 rounded-2xl border ${
              isMatch
                ? 'bg-zinc-950 border-emerald-900 text-emerald-300'
                : 'bg-zinc-950 border-red-900 text-red-300'
            }`}>
              <div className="flex items-center gap-2 font-bold text-sm">
                {isMatch ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                )}
                <span>{isMatch ? 'Uyğundur: Kassa və Satış Fərqi 0-dır' : 'Fərq var – yoxlayın!'}</span>
              </div>
              {!isMatch && (
                <p className="text-xs mt-1.5">
                  Fərq: <strong className="font-mono text-white">{discrepancy > 0 ? `+${discrepancy.toFixed(2)} AZN artıq` : `${discrepancy.toFixed(2)} AZN əskik`}</strong>. Daxil edilən kassa məbləği ilə sistemdə qeyd edilən təsdiqli satışlar arasında uyğunsuzluq var.
                </p>
              )}
            </div>

            <div className="divide-y divide-zinc-800 text-xs">
              <div className="py-2.5 flex justify-between">
                <span className="text-zinc-400">Daxil Edilən Cəm:</span>
                <span className="font-mono font-bold text-white">
                  {formatAZN(currentTotal)}
                </span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-zinc-400">Sistemdə Təsdiqli Satışlar:</span>
                <span className="font-mono font-bold text-white">
                  {formatAZN(confirmedSalesSum)}
                </span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-zinc-400">Fərq Məbləği:</span>
                <span className={`font-mono font-bold ${isMatch ? 'text-emerald-400' : 'text-red-400'}`}>
                  {formatAZN(discrepancy)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* MONTHLY REPORT ACCUMULATION (ADMIN ONLY) */}
      {isAdmin ? (
        <div className="bg-zinc-900 rounded-3xl border border-zinc-800 shadow-xl p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-zinc-800">
            <div>
              <h3 className="text-base font-bold text-white">
                Aylıq Kassa Yığımı (Nağd / Kart / POS)
              </h3>
              <p className="text-xs text-zinc-400">
                Seçilmiş ay üzrə bütün təsdiqlənmiş gündəlik hesabatların cəmi
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="month"
                value={selectedMonth}
                onChange={e => setSelectedMonth(e.target.value)}
                className="font-mono text-xs font-bold px-3 py-1.5 rounded-xl border border-zinc-700 bg-zinc-950 text-white"
              />
            </div>
          </div>

          {/* Month KPI 4-strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 block">
                Aylıq Nağd
              </span>
              <span className="text-lg font-black font-mono text-white mt-1 block">
                {formatAZN(monthCash)}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400 block">
                Aylıq Bank Kartı
              </span>
              <span className="text-lg font-black font-mono text-white mt-1 block">
                {formatAZN(monthCard)}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800">
              <span className="text-[10px] font-bold uppercase tracking-wider text-red-400 block">
                Aylıq POS Terminal
              </span>
              <span className="text-lg font-black font-mono text-white mt-1 block">
                {formatAZN(monthPos)}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-red-950/60 border border-red-800 text-white">
              <span className="text-[10px] font-bold uppercase tracking-wider text-red-300 block">
                Aylıq Ümumi Kassa
              </span>
              <span className="text-lg font-black font-mono text-white mt-1 block">
                {formatAZN(monthTotal)}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 text-center text-xs text-zinc-400 flex items-center justify-center gap-2">
          <Info className="w-4 h-4 text-zinc-500" />
          <span>İşçi rolunda yalnız günün kassa hesabatını daxil etmək mümkündür. Aylıq və ümumi hesabatlar yalnız adminə görünür.</span>
        </div>
      )}
    </div>
  );
};
