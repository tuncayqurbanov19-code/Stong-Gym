import React, { useState } from 'react';
import {
  Plus,
  Trash2,
  Download,
  Search,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ExpenseCategory } from '../types';
import { formatAZN, formatDateAZ, getTodayISODate } from '../utils/dateUtils';
import { exportExpensesToCSV } from '../utils/exportUtils';

const EXPENSE_CATEGORIES: ExpenseCategory[] = ['İcarə', 'Maaş', 'Benzin', 'Kommunal', 'Digər'];

export const ExpensesView: React.FC = () => {
  const { expenses, addExpense, deleteExpense, currentUser, settings, showToast } = useApp();
  const isAdmin = currentUser?.role === 'admin';
  const primaryColor = settings.primaryColor || '#dc2626';

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [category, setCategory] = useState<ExpenseCategory>('Kommunal');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(getTodayISODate());
  const [note, setNote] = useState('');
  const [selectedCatFilter, setSelectedCatFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Category totals
  const categoryTotals: Record<ExpenseCategory, number> = {
    'İcarə': 0,
    'Maaş': 0,
    'Benzin': 0,
    'Kommunal': 0,
    'Digər': 0,
  };

  let totalExpenses = 0;
  for (const exp of expenses) {
    if (categoryTotals[exp.category] !== undefined) {
      categoryTotals[exp.category] += exp.amount;
    }
    totalExpenses += exp.amount;
  }

  const handleSaveExpense = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanAmount = parseFloat(amount) || 0;
    if (cleanAmount <= 0) return;

    addExpense({
      date,
      category,
      amount: cleanAmount,
      note: note.trim() || undefined,
    });

    showToast('success', `${category} üzrə ${formatAZN(cleanAmount)} xərc əlavə olundu.`);
    setIsModalOpen(false);
    setAmount('');
    setNote('');
  };

  const filteredExpenses = expenses.filter(e => {
    const matchesCat = selectedCatFilter === 'all' || e.category === selectedCatFilter;
    const matchesSearch =
      (e.note && e.note.toLowerCase().includes(searchQuery.toLowerCase())) ||
      e.category.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  return (
    <div className="space-y-6 pb-12 max-w-7xl mx-auto">
      {/* Header and Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-zinc-200 dark:border-zinc-800">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-white tracking-tight flex items-center gap-2">
            <span>Xərclər İdarəetməsi</span>
            <span className="text-xs bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400 font-bold px-2 py-0.5 rounded-full border border-red-200 dark:border-red-800">
              Xərc Jurnalı
            </span>
          </h2>
          <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
            İcarə, maaş, kommunal və digər əməliyyat xərclərinin qeydiyyatı
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => exportExpensesToCSV(expenses)}
            className="px-3 py-1.5 text-xs font-semibold bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Excel / CSV</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setDate(getTodayISODate());
              setIsModalOpen(true);
            }}
            style={{ backgroundColor: primaryColor }}
            className="px-4 py-1.5 text-xs font-bold text-white rounded-xl transition-all shadow-md hover:opacity-90 flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Yeni Xərc Əlavə Et</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="col-span-2 sm:col-span-1 p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-red-200 dark:border-red-900/60 shadow-sm flex flex-col justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Ümumi Xərc
          </span>
          <div className="text-xl font-black font-mono text-red-600 dark:text-red-400 mt-2">
            {formatAZN(totalExpenses)}
          </div>
          <p className="text-[10px] text-zinc-500 mt-1">{expenses.length} qeydiyyat</p>
        </div>

        {EXPENSE_CATEGORIES.map(cat => (
          <div
            key={cat}
            className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col justify-between"
          >
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 truncate">
              {cat}
            </span>
            <div className="text-lg font-black font-mono text-zinc-900 dark:text-white mt-2">
              {formatAZN(categoryTotals[cat])}
            </div>
            <div className="w-full bg-zinc-200 dark:bg-zinc-800 h-1.5 rounded-full mt-2 overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  backgroundColor: primaryColor,
                  width: `${totalExpenses > 0 ? (categoryTotals[cat] / totalExpenses) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Filter and Table Card */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden space-y-3">
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Xərc qeydlərində axtar..."
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto">
            <button
              type="button"
              onClick={() => setSelectedCatFilter('all')}
              style={selectedCatFilter === 'all' ? { backgroundColor: primaryColor } : undefined}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                selectedCatFilter === 'all'
                  ? 'text-white font-bold shadow-sm'
                  : 'bg-zinc-100 dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 hover:text-zinc-900 dark:hover:text-white'
              }`}
            >
              Hamısı
            </button>
            {EXPENSE_CATEGORIES.map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCatFilter(cat)}
                style={selectedCatFilter === cat ? { backgroundColor: primaryColor } : undefined}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                  selectedCatFilter === cat
                    ? 'text-white font-bold shadow-sm'
                    : 'bg-zinc-100 dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 hover:text-zinc-900 dark:hover:text-white'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {filteredExpenses.length === 0 ? (
          <div className="py-12 text-center text-xs text-zinc-500">
            Hələlik heç bir xərc qeydə alınmayıb.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 dark:bg-zinc-950 text-zinc-500 dark:text-zinc-400 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Tarix</th>
                  <th className="py-3 px-4">Kateqoriya</th>
                  <th className="py-3 px-4">Qeyd və Təyinat</th>
                  <th className="py-3 px-4 text-right">Məbləğ</th>
                  <th className="py-3 px-4">Qeydiyyatçı</th>
                  {isAdmin && <th className="py-3 px-4 text-center">Əməliyyat</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {filteredExpenses.map(e => (
                  <tr key={e.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                    <td className="py-3 px-4 font-mono text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                      {formatDateAZ(e.date)}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-bold text-[11px] px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200">
                        {e.category}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-medium text-zinc-800 dark:text-zinc-200 max-w-sm truncate">
                      {e.note || '—'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-red-600 dark:text-red-400 whitespace-nowrap">
                      {formatAZN(e.amount)}
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-zinc-500">
                      @{e.createdBy}
                    </td>
                    {isAdmin && (
                      <td className="py-3 px-4 text-center">
                        {confirmDeleteId === e.id ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                deleteExpense(e.id);
                                setConfirmDeleteId(null);
                                showToast('success', 'Xərc qeydi silindi.');
                              }}
                              className="px-2 py-0.5 text-[10px] font-bold bg-red-600 text-white rounded-md"
                            >
                              Sil
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-1.5 py-0.5 text-[10px] font-semibold bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-md"
                            >
                              Yox
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(e.id)}
                            className="p-1 text-red-600 dark:text-red-400 hover:text-red-500"
                            title="Sil"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: New Expense */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col">
            <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                Yeni Xərc Əlavə Et
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveExpense} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                  Tarix *
                </label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm font-mono rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                  Xərc Növü *
                </label>
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value as ExpenseCategory)}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  {EXPENSE_CATEGORIES.map(c => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                  Məbləğ (AZN) *
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  required
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="məs: 25.00"
                  className="w-full px-3.5 py-2 text-sm font-mono font-bold rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                  Qeyd və Təyinat
                </label>
                <input
                  type="text"
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="məs: Bar soyuducusunun təmiri"
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white rounded-xl"
                >
                  Ləğv et
                </button>
                <button
                  type="submit"
                  style={{ backgroundColor: primaryColor }}
                  className="px-5 py-2 text-xs font-bold text-white rounded-xl shadow-md hover:opacity-90"
                >
                  Xərci Saxla
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
