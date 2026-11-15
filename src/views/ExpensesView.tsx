import React, { useEffect, useState } from 'react';
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
import { TablePagination } from '../components/TablePagination';

const EXPENSE_CATEGORIES: ExpenseCategory[] = ['İcarə', 'Maaş', 'Benzin', 'Kommunal', 'Digər'];
const PAGE_SIZE = 15;

export const ExpensesView: React.FC = () => {
  const { expenses, addExpense, deleteExpense, currentUser, settings, showToast } = useApp();
  const isAdmin = currentUser?.role === 'admin';
  const primaryColor = settings.primaryColor || '#E32636';

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [category, setCategory] = useState<ExpenseCategory>('Kommunal');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(getTodayISODate());
  const [note, setNote] = useState('');
  const [selectedCatFilter, setSelectedCatFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

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

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedCatFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredExpenses.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedExpenses = filteredExpenses.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="space-y-6 pb-12 max-w-7xl mx-auto">
      {/* Header and Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E5E5E5] dark:border-[#262626]">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-[#171717] dark:text-white tracking-tight flex items-center gap-2.5">
            <span>Xərclər İdarəetməsi</span>
            <span className="text-[11px] bg-[#E32636]/10 text-[#E32636] font-semibold px-2 py-0.5 rounded-[8px] border border-[#E32636]/20 whitespace-nowrap">
              Xərc Jurnalı
            </span>
          </h2>
          <p className="text-xs sm:text-sm text-[#888888] mt-0.5">
            İcarə, maaş, kommunal və digər əməliyyat xərclərinin qeydiyyatı
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => exportExpensesToCSV(expenses)}
            className="px-3.5 py-2 text-xs font-semibold bg-white dark:bg-[#222222] border border-[#E5E5E5] dark:border-[#262626] hover:bg-[#F5F5F5] dark:hover:bg-[#2B2B2B] text-[#171717] dark:text-white rounded-[10px] transition-colors flex items-center gap-1.5 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5 text-[#888888]" />
            <span>Excel / CSV</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setDate(getTodayISODate());
              setIsModalOpen(true);
            }}
            style={{ backgroundColor: primaryColor }}
            className="px-4 py-2 text-xs font-semibold text-white rounded-[10px] transition-all hover:opacity-90 flex items-center gap-1.5 whitespace-nowrap shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Yeni Xərc Əlavə Et</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="col-span-2 sm:col-span-1 p-4 rounded-[14px] bg-white dark:bg-[#171717] border border-[#E32636]/30 flex flex-col justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#888888]">
            Ümumi Xərc
          </span>
          <div className="text-xl font-bold font-mono tabular-nums text-[#E32636] mt-2">
            {formatAZN(totalExpenses)}
          </div>
          <p className="text-[11px] text-[#888888] mt-1 font-mono tabular-nums">
            {expenses.length} qeydiyyat
          </p>
        </div>

        {EXPENSE_CATEGORIES.map(cat => (
          <div
            key={cat}
            className="p-4 rounded-[14px] bg-white dark:bg-[#171717] border border-[#E5E5E5] dark:border-[#262626] flex flex-col justify-between"
          >
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#888888] truncate">
              {cat}
            </span>
            <div className="text-lg font-bold font-mono tabular-nums text-[#171717] dark:text-white mt-2">
              {formatAZN(categoryTotals[cat])}
            </div>
            <div className="w-full bg-[#F5F5F5] dark:bg-[#222222] h-1.5 rounded-[4px] mt-2.5 overflow-hidden">
              <div
                className="h-full rounded-[4px] transition-all duration-200"
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
      <div className="bg-white dark:bg-[#171717] rounded-[14px] border border-[#E5E5E5] dark:border-[#262626] overflow-hidden">
        <div className="p-4 border-b border-[#E5E5E5] dark:border-[#262626] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#888888]" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Xərc qeydlərində axtar..."
              className="w-full pl-9 pr-8 py-2 text-xs rounded-[10px] border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-white placeholder:text-[#888888] focus:outline-none focus:ring-2 focus:ring-[#E32636]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#888888] hover:text-[#171717] dark:hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <button
              type="button"
              onClick={() => setSelectedCatFilter('all')}
              style={selectedCatFilter === 'all' ? { backgroundColor: primaryColor } : undefined}
              className={`px-3 py-1.5 text-xs font-semibold rounded-[10px] transition-colors whitespace-nowrap ${
                selectedCatFilter === 'all'
                  ? 'text-white shadow-xs'
                  : 'bg-[#F5F5F5] dark:bg-[#222222] text-[#888888] border border-[#E5E5E5] dark:border-[#262626] hover:text-[#171717] dark:hover:text-white'
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
                className={`px-3 py-1.5 text-xs font-semibold rounded-[10px] transition-colors whitespace-nowrap ${
                  selectedCatFilter === cat
                    ? 'text-white shadow-xs'
                    : 'bg-[#F5F5F5] dark:bg-[#222222] text-[#888888] border border-[#E5E5E5] dark:border-[#262626] hover:text-[#171717] dark:hover:text-white'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {filteredExpenses.length === 0 ? (
          <div className="py-12 text-center text-xs text-[#888888]">
            Hələlik heç bir xərc qeydə alınmayıb.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[620px]">
                <thead className="bg-[#FAFAFA] dark:bg-[#141414] text-[#888888] font-semibold uppercase tracking-wider text-[10px] border-b border-[#E5E5E5] dark:border-[#262626]">
                  <tr>
                    <th className="py-3 px-4">Tarix</th>
                    <th className="py-3 px-4">Kateqoriya</th>
                    <th className="py-3 px-4">Qeyd və Təyinat</th>
                    <th className="py-3 px-4 text-right">Məbləğ</th>
                    <th className="py-3 px-4">Qeydiyyatçı</th>
                    {isAdmin && <th className="py-3 px-4 text-center">Əməliyyat</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E5E5] dark:divide-[#262626]">
                  {paginatedExpenses.map(e => (
                    <tr key={e.id} className="hover:bg-[#FAFAFA] dark:hover:bg-[#222222]/50 transition-colors">
                      <td className="py-3 px-4 font-mono tabular-nums text-[#888888] whitespace-nowrap">
                        {formatDateAZ(e.date)}
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-semibold text-[11px] px-2.5 py-0.5 rounded-[8px] bg-[#F5F5F5] dark:bg-[#222222] border border-[#E5E5E5] dark:border-[#2E2E2E] text-[#171717] dark:text-white whitespace-nowrap">
                          {e.category}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-medium text-[#171717] dark:text-zinc-200 max-w-sm truncate">
                        {e.note || '—'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-[#E32636] whitespace-nowrap">
                        {formatAZN(e.amount)}
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-[#888888]">
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
                                className="px-2 py-0.5 text-[10px] font-semibold bg-[#E32636] text-white rounded-[8px]"
                              >
                                Sil
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-2 py-0.5 text-[10px] font-semibold bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-zinc-300 border border-[#E5E5E5] dark:border-[#2E2E2E] rounded-[8px]"
                              >
                                Yox
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(e.id)}
                              className="p-1.5 text-[#E32636] hover:bg-[#E32636]/10 rounded-[8px] transition-colors"
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
            <TablePagination
              totalItems={filteredExpenses.length}
              pageSize={PAGE_SIZE}
              currentPage={safePage}
              onPageChange={setCurrentPage}
              primaryColor={primaryColor}
            />
          </>
        )}
      </div>

      {/* Modal: New Expense */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-[#171717] w-full max-w-md rounded-[14px] shadow-2xl border border-[#E5E5E5] dark:border-[#262626] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-[#E5E5E5] dark:border-[#262626] flex items-center justify-between">
              <h3 className="text-base font-bold text-[#171717] dark:text-white">
                Yeni Xərc Əlavə Et
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-[#888888] hover:text-[#171717] dark:hover:text-white rounded-[8px]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveExpense} className="p-6 space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-[#888888] uppercase tracking-wider mb-1.5">
                  Tarix *
                </label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums rounded-[10px] border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#E32636]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#888888] uppercase tracking-wider mb-1.5">
                  Xərc Növü *
                </label>
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value as ExpenseCategory)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-[10px] border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#E32636]"
                >
                  {EXPENSE_CATEGORIES.map(c => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#888888] uppercase tracking-wider mb-1.5">
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
                  className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums font-bold rounded-[10px] border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-white placeholder:text-[#888888] focus:outline-none focus:ring-2 focus:ring-[#E32636]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#888888] uppercase tracking-wider mb-1.5">
                  Qeyd və Təyinat
                </label>
                <input
                  type="text"
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="məs: Bar soyuducusunun təmiri"
                  className="w-full px-3.5 py-2.5 text-sm rounded-[10px] border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-white placeholder:text-[#888888] focus:outline-none focus:ring-2 focus:ring-[#E32636]"
                />
              </div>

              <div className="pt-3 border-t border-[#E5E5E5] dark:border-[#262626] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-[#888888] hover:text-[#171717] dark:hover:text-white rounded-[10px]"
                >
                  Ləğv et
                </button>
                <button
                  type="submit"
                  style={{ backgroundColor: primaryColor }}
                  className="px-5 py-2 text-xs font-semibold text-white rounded-[10px] hover:opacity-90"
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
