import React, { useMemo, useState } from 'react';
import {
  Users,
  Calendar,
  Download,
  Printer,
  Filter,
  X,
  ArrowUpRight,
  Banknote,
  CreditCard,
  Smartphone,
  Wallet,
  BookOpen,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts';
import { useApp } from '../context/AppContext';
import {
  calculateDailyStaffBreakdown,
  StaffPaymentRow,
} from '../utils/financialCalculations';
import {
  formatAZN,
  formatDateAZ,
  getTodayISODate,
  getYesterdayISODate,
} from '../utils/dateUtils';
import {
  exportStaffBreakdownToCSV,
  exportStaffBreakdownToPDF,
} from '../utils/exportUtils';

interface StaffPaymentBreakdownProps {
  defaultDate?: string;
}

type DatePreset = 'today' | 'yesterday' | 'custom';

export const StaffPaymentBreakdown: React.FC<StaffPaymentBreakdownProps> = ({
  defaultDate,
}) => {
  const { sales, debts, users, currentUser, settings, theme } = useApp();
  const isAdmin = currentUser?.role === 'admin';
  const todayISO = getTodayISODate();
  const yesterdayISO = getYesterdayISODate();

  const [datePreset, setDatePreset] = useState<DatePreset>(
    defaultDate && defaultDate !== todayISO ? 'custom' : 'today'
  );
  const [customStart, setCustomStart] = useState<string>(defaultDate || todayISO);
  const [customEnd, setCustomEnd] = useState<string>(defaultDate || todayISO);
  const [staffFilter, setStaffFilter] = useState<string>(
    isAdmin ? 'all' : currentUser?.username || 'all'
  );
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [selectedStaffRow, setSelectedStaffRow] = useState<StaffPaymentRow | null>(null);

  const effectiveStart =
    datePreset === 'today'
      ? todayISO
      : datePreset === 'yesterday'
      ? yesterdayISO
      : customStart <= customEnd
      ? customStart
      : customEnd;

  const effectiveEnd =
    datePreset === 'today'
      ? todayISO
      : datePreset === 'yesterday'
      ? yesterdayISO
      : customStart <= customEnd
      ? customEnd
      : customStart;

  const activeStaffFilter = isAdmin ? staffFilter : currentUser?.username || 'all';

  const staffDisplayMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const u of users) {
      map[u.username.toLowerCase()] = u.name;
    }
    return map;
  }, [users]);

  const breakdown = useMemo(
    () =>
      calculateDailyStaffBreakdown({
        sales,
        debts,
        staffDisplayMap,
        startDate: effectiveStart,
        endDate: effectiveEnd,
        staffFilter: activeStaffFilter,
        paymentFilter,
      }),
    [sales, debts, staffDisplayMap, effectiveStart, effectiveEnd, activeStaffFilter, paymentFilter]
  );

  // Collect all unique staff usernames present in sales, debt payments, or users list
  const staffOptions = useMemo(() => {
    const set = new Set<string>();
    users.forEach(u => set.add(u.username));
    sales.forEach(s => s.createdBy && set.add(s.createdBy));
    debts.forEach(d =>
      (d.payments || []).forEach(p => p.receivedBy && set.add(p.receivedBy))
    );
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [users, sales, debts]);

  const chartData = useMemo(
    () => [
      { name: 'Nağd', value: breakdown.totals.naqd, color: '#10b981' },
      { name: 'Kart', value: breakdown.totals.kart, color: '#3b82f6' },
      { name: 'POS / Köç.', value: breakdown.totals.pos, color: settings.primaryColor || '#dc2626' },
      { name: 'Balans', value: breakdown.totals.balans, color: '#f59e0b' },
      { name: 'Nisyə', value: breakdown.totals.nisye, color: '#ef4444' },
    ],
    [breakdown.totals, settings.primaryColor]
  );

  const paymentLabel = (m: string) => {
    switch (m) {
      case 'naqd':
        return 'Nağd';
      case 'kart':
        return 'Kart';
      case 'pos':
        return 'POS / Köçürmə';
      case 'balans':
        return 'Balans';
      case 'borc':
        return 'Nisyə';
      default:
        return m.toUpperCase();
    }
  };

  return (
    <section className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm dark:shadow-xl p-5 sm:p-6 space-y-5 transition-colors">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-extrabold text-zinc-900 dark:text-white tracking-tight">
              Məsul Şəxs və Ödəniş Növü Üzrə Satış Bölgüsü
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              {isAdmin
                ? 'Hər məsulun satışları və yerindəcə qəbul etdiyi borc ödənişləri (ikiqat hesablamasız).'
                : 'Yalnız özünüzün apardığınız satışlar və qəbul etdiyiniz borc ödənişləri göstərilir.'}
            </p>
          </div>
        </div>

        {/* Export Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => exportStaffBreakdownToCSV(breakdown, effectiveStart, effectiveEnd)}
            className="px-3 py-1.5 text-xs font-semibold bg-zinc-100 dark:bg-zinc-950 hover:bg-zinc-200 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-200 rounded-xl transition-colors flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Excel / CSV</span>
          </button>
          <button
            type="button"
            onClick={() =>
              exportStaffBreakdownToPDF(
                breakdown,
                settings.barName,
                effectiveStart,
                effectiveEnd
              )
            }
            className="px-3 py-1.5 text-xs font-semibold bg-zinc-100 dark:bg-zinc-950 hover:bg-zinc-200 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-200 rounded-xl transition-colors flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Çap / PDF</span>
          </button>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl">
          {(
            [
              { id: 'today', label: 'Bu gün' },
              { id: 'yesterday', label: 'Dünən' },
              { id: 'custom', label: 'Xüsusi aralıq' },
            ] as { id: DatePreset; label: string }[]
          ).map(btn => (
            <button
              key={btn.id}
              type="button"
              onClick={() => setDatePreset(btn.id)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                datePreset === btn.id
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
              }`}
              style={
                datePreset === btn.id
                  ? { backgroundColor: settings.primaryColor || '#dc2626' }
                  : undefined
              }
            >
              {btn.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {datePreset === 'custom' && (
            <div className="flex items-center gap-1.5 text-xs">
              <Calendar className="w-3.5 h-3.5 text-zinc-400" />
              <input
                type="date"
                value={customStart}
                onChange={e => setCustomStart(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white font-mono text-xs"
              />
              <span className="text-zinc-400">—</span>
              <input
                type="date"
                value={customEnd}
                onChange={e => setCustomEnd(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white font-mono text-xs"
              />
            </div>
          )}

          {isAdmin && (
            <div className="flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-zinc-400" />
              <select
                value={staffFilter}
                onChange={e => setStaffFilter(e.target.value)}
                aria-label="Məsul şəxs filtri"
                className="px-2.5 py-1.5 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white"
              >
                <option value="all">Bütün Məsullar</option>
                {staffOptions.map(u => (
                  <option key={u} value={u}>
                    {staffDisplayMap[u.toLowerCase()] || u} (@{u})
                  </option>
                ))}
              </select>
            </div>
          )}

          <select
            value={paymentFilter}
            onChange={e => setPaymentFilter(e.target.value)}
            aria-label="Ödəniş növü filtri"
            className="px-2.5 py-1.5 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white"
          >
            <option value="all">Bütün Ödəniş Növləri</option>
            <option value="naqd">Nağd</option>
            <option value="kart">Kart</option>
            <option value="pos">POS / Köçürmə</option>
            <option value="balans">Balans</option>
            <option value="borc">Nisyə</option>
          </select>
        </div>
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
          <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 block">
            Satışdan Daxilolma
          </span>
          <span className="text-lg font-extrabold font-mono text-zinc-900 dark:text-white mt-1 block">
            {formatAZN(breakdown.totals.salesInflow)}
          </span>
          <span className="text-[11px] text-zinc-500 mt-0.5 block">
            {breakdown.totals.salesCount} satış əməliyyatı
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 block">
            Borc Ödənişindən Gələn
          </span>
          <span className="text-lg font-extrabold font-mono text-amber-600 dark:text-amber-400 mt-1 block">
            {formatAZN(breakdown.totals.debtInflow)}
          </span>
          <span className="text-[11px] text-zinc-500 mt-0.5 block">
            {breakdown.totals.debtPaymentsCount} borc ödənişi qəbulu
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60">
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 block">
            Ümumi Kassa Daxilolması
          </span>
          <span className="text-lg font-extrabold font-mono text-emerald-700 dark:text-emerald-300 mt-1 block">
            {formatAZN(breakdown.totals.totalInflow)}
          </span>
          <span className="text-[11px] text-emerald-700/70 dark:text-emerald-400/70 mt-0.5 block">
            Satış + Borc Ödənişi (Nağd/Kart/POS)
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
          <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 block">
            Nisyə / Balans
          </span>
          <div className="mt-1 space-y-0.5 font-mono text-xs font-bold">
            <div className="flex justify-between">
              <span className="text-zinc-500">Nisyə:</span>
              <span className="text-red-600 dark:text-red-400">{formatAZN(breakdown.totals.nisye)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Balans:</span>
              <span className="text-amber-600 dark:text-amber-400">{formatAZN(breakdown.totals.balans)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Pivot Table: Məsul × Ödəniş növü */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[820px]">
            <thead className="bg-zinc-100 dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-3 px-4">Məsul Şəxs</th>
                <th className="py-3 px-3 text-right">Nağd</th>
                <th className="py-3 px-3 text-right">Kart</th>
                <th className="py-3 px-3 text-right">POS/Köç.</th>
                <th className="py-3 px-3 text-right">Balans</th>
                <th className="py-3 px-3 text-right">Nisyə</th>
                <th className="py-3 px-3 text-center">Satış Sayı</th>
                <th className="py-3 px-3 text-right">Orta Çek</th>
                <th className="py-3 px-3 text-right">Satışdan</th>
                <th className="py-3 px-3 text-right">Borcdan</th>
                <th className="py-3 px-4 text-right">Ümumi Daxilolma</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {breakdown.rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={11}
                    className="py-10 text-center text-zinc-500 dark:text-zinc-400"
                  >
                    Seçilmiş tarix və filtrlər üzrə əməliyyat tapılmadı.
                  </td>
                </tr>
              ) : (
                breakdown.rows.map(row => (
                  <tr
                    key={row.staffUsername}
                    className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors"
                  >
                    <td className="py-3 px-4 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setSelectedStaffRow(row)}
                        className="text-left group inline-flex items-center gap-1.5 font-bold text-zinc-900 dark:text-white hover:text-red-600 dark:hover:text-red-400"
                        title="Bu məsulun ətraflı əməliyyat siyahısını aç"
                      >
                        <span>{row.staffName}</span>
                        <ArrowUpRight className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100" />
                      </button>
                      <div className="text-[10px] font-mono text-zinc-500">
                        @{row.staffUsername}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-emerald-700 dark:text-emerald-400 font-semibold">
                      {formatAZN(row.naqd)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-blue-700 dark:text-blue-400 font-semibold">
                      {formatAZN(row.kart)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-zinc-800 dark:text-zinc-200 font-semibold">
                      {formatAZN(row.pos)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-amber-700 dark:text-amber-400">
                      {formatAZN(row.balans)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-red-600 dark:text-red-400">
                      {formatAZN(row.nisye)}
                    </td>
                    <td className="py-3 px-3 text-center font-mono font-bold text-zinc-900 dark:text-white">
                      {row.salesCount}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-zinc-600 dark:text-zinc-300">
                      {formatAZN(row.avgCheck)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-zinc-800 dark:text-zinc-200">
                      {formatAZN(row.salesInflow)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-amber-700 dark:text-amber-400">
                      {formatAZN(row.debtInflow)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-extrabold text-zinc-900 dark:text-white">
                      {formatAZN(row.totalInflow)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {breakdown.rows.length > 0 && (
              <tfoot className="bg-zinc-100 dark:bg-zinc-950 font-bold border-t border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white">
                <tr>
                  <td className="py-3 px-4 uppercase text-[11px] tracking-wider">CƏMİ</td>
                  <td className="py-3 px-3 text-right font-mono text-emerald-700 dark:text-emerald-400">
                    {formatAZN(breakdown.totals.naqd)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-blue-700 dark:text-blue-400">
                    {formatAZN(breakdown.totals.kart)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono">
                    {formatAZN(breakdown.totals.pos)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-amber-700 dark:text-amber-400">
                    {formatAZN(breakdown.totals.balans)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-red-600 dark:text-red-400">
                    {formatAZN(breakdown.totals.nisye)}
                  </td>
                  <td className="py-3 px-3 text-center font-mono">
                    {breakdown.totals.salesCount}
                  </td>
                  <td className="py-3 px-3 text-right font-mono">
                    {formatAZN(breakdown.totals.avgCheck)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono">
                    {formatAZN(breakdown.totals.salesInflow)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-amber-700 dark:text-amber-400">
                    {formatAZN(breakdown.totals.debtInflow)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-sm">
                    {formatAZN(breakdown.totals.totalInflow)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Recharts Payment Distribution Chart */}
      <div className="pt-2">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Ödəniş Növləri Üzrə Pay Bölgüsü
          </h4>
          <span className="text-[11px] text-zinc-500 font-mono">
            {effectiveStart === effectiveEnd
              ? formatDateAZ(effectiveStart)
              : `${formatDateAZ(effectiveStart)} — ${formatDateAZ(effectiveEnd)}`}
          </span>
        </div>
        <div className="h-52 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={theme === 'dark' ? '#27272a' : '#e4e4e7'}
                vertical={false}
              />
              <XAxis
                dataKey="name"
                tick={{ fill: theme === 'dark' ? '#a1a1aa' : '#52525b', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: theme === 'dark' ? '#a1a1aa' : '#52525b', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={v => `${v} ₼`}
              />
              <Tooltip
                formatter={(value: unknown) => [formatAZN(Number(value) || 0), 'Məbləğ']}
                contentStyle={{
                  backgroundColor: theme === 'dark' ? '#09090b' : '#ffffff',
                  borderColor: theme === 'dark' ? '#27272a' : '#e4e4e7',
                  borderRadius: '12px',
                  fontSize: '12px',
                  color: theme === 'dark' ? '#f4f4f5' : '#18181b',
                }}
              />
              <Bar dataKey="value" radius={[8, 8, 0, 0]} maxBarSize={56}>
                {chartData.map(entry => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Modal: Staff Detailed Operations List */}
      {selectedStaffRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-2xl rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-5 sm:p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <div>
                <h4 className="text-base font-extrabold text-zinc-900 dark:text-white">
                  {selectedStaffRow.staffName} (@{selectedStaffRow.staffUsername})
                </h4>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Ümumi daxilolma: <strong className="font-mono">{formatAZN(selectedStaffRow.totalInflow)}</strong> ·{' '}
                  {selectedStaffRow.operations.length} əməliyyat
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedStaffRow(null)}
                aria-label="Bağla"
                className="p-1.5 text-zinc-500 hover:text-zinc-900 dark:hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 sm:p-6 overflow-y-auto space-y-2.5 flex-1">
              {selectedStaffRow.operations.length === 0 ? (
                <div className="py-10 text-center text-xs text-zinc-500">
                  Əməliyyat tapılmadı.
                </div>
              ) : (
                selectedStaffRow.operations.map(op => (
                  <div
                    key={`${op.kind}-${op.id}`}
                    className="p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider ${
                            op.kind === 'debt_payment'
                              ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                              : op.paymentMethod === 'borc'
                              ? 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
                              : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                          }`}
                        >
                          {op.badgeText || (op.kind === 'debt_payment' ? 'Borc ödənişi (ödənildi)' : 'Satış')}
                        </span>

                        <span className="text-[11px] font-mono text-zinc-500">
                          {formatDateAZ(op.date)} {op.time}
                        </span>

                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">
                          {op.paymentMethod === 'naqd' && <Banknote className="w-3 h-3 text-emerald-500" />}
                          {op.paymentMethod === 'kart' && <CreditCard className="w-3 h-3 text-blue-500" />}
                          {op.paymentMethod === 'pos' && <Smartphone className="w-3 h-3 text-red-500" />}
                          {op.paymentMethod === 'balans' && <Wallet className="w-3 h-3 text-amber-500" />}
                          {op.paymentMethod === 'borc' && <BookOpen className="w-3 h-3 text-red-500" />}
                          <span>{paymentLabel(op.paymentMethod)}</span>
                        </span>
                      </div>

                      <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                        {op.description}
                      </div>
                      {op.customerOrNote && (
                        <div className="text-[11px] text-zinc-500">
                          {op.customerOrNote}
                        </div>
                      )}
                    </div>

                    <div className="text-right font-mono font-extrabold text-sm text-zinc-900 dark:text-white shrink-0">
                      {formatAZN(op.amount)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
