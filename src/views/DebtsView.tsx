import React, { useState } from 'react';
import {
  BookOpen,
  Plus,
  Search,
  DollarSign,
  User,
  AlertTriangle,
  CheckCircle,
  Download,
  Calendar,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { DebtRecord } from '../types';
import { formatAZN, formatDateAZ, getTodayISODate } from '../utils/dateUtils';
import { checkCustomerDebt, calculateDebtOverview } from '../utils/financialCalculations';
import { DebtWarningModal } from '../components/DebtWarningModal';
import { exportDebtsToCSV } from '../utils/exportUtils';

export const DebtsView: React.FC = () => {
  const { debts, addDebt, payDebt, products } = useApp();

  const [activeTab, setActiveTab] = useState<'debtors' | 'records'>('debtors');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'borcdadir' | 'odanilib'>('all');

  // Modal: Add Debt Record
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [debtorName, setDebtorName] = useState('');
  const [selectedProductId, setSelectedProductId] = useState(products[0]?.id || '');
  const [quantity, setQuantity] = useState('1');
  const [customAmount, setCustomAmount] = useState('');
  const [initialPaid, setInitialPaid] = useState('0');
  const [date, setDate] = useState(getTodayISODate());
  const [notes, setNotes] = useState('');

  // Modal: Payment Collection
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [selectedDebt, setSelectedDebt] = useState<DebtRecord | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNote, setPaymentNote] = useState('');

  // Warning Modal
  const [isWarningOpen, setIsWarningOpen] = useState(false);
  const [warningData, setWarningData] = useState<{ name: string; amount: number }>({
    name: '',
    amount: 0,
  });

  // Calculate Debt Overview
  const overview = calculateDebtOverview(debts);

  // Group debts by Debtor Name
  const debtorsMap: Record<
    string,
    {
      debtorName: string;
      totalDebt: number;
      totalPaid: number;
      remainingDebt: number;
      records: DebtRecord[];
      hasUnpaid: boolean;
      lastDate: string;
    }
  > = {};

  for (const d of debts) {
    const key = d.debtorName.trim().toLowerCase();
    if (!debtorsMap[key]) {
      debtorsMap[key] = {
        debtorName: d.debtorName,
        totalDebt: 0,
        totalPaid: 0,
        remainingDebt: 0,
        records: [],
        hasUnpaid: false,
        lastDate: d.date,
      };
    }
    debtorsMap[key].totalDebt += d.totalAmount;
    debtorsMap[key].totalPaid += d.paidAmount;
    debtorsMap[key].remainingDebt += d.remainingAmount;
    debtorsMap[key].records.push(d);
    if (d.status === 'borcdadir' && d.remainingAmount > 0) {
      debtorsMap[key].hasUnpaid = true;
    }
  }

  const debtorsList = Object.values(debtorsMap).sort((a, b) => b.remainingDebt - a.remainingDebt);

  const filteredDebtors = debtorsList.filter(d => {
    const matchesSearch = d.debtorName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'borcdadir' && d.hasUnpaid) ||
      (statusFilter === 'odanilib' && !d.hasUnpaid);
    return matchesSearch && matchesStatus;
  });

  const filteredRecords = debts.filter(d => {
    const matchesSearch =
      d.debtorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (d.notes && d.notes.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesStatus = statusFilter === 'all' || d.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleDebtorNameTyping = (nameVal: string) => {
    setDebtorName(nameVal);
    if (nameVal.trim().length >= 2) {
      const check = checkCustomerDebt(nameVal, debts);
      if (check.hasDebt) {
        setWarningData({
          name: check.debtorName,
          amount: check.totalRemainingDebt,
        });
        setIsWarningOpen(true);
      }
    }
  };

  const handleProductChange = (pId: string) => {
    setSelectedProductId(pId);
    const prod = products.find(p => p.id === pId);
    if (prod) {
      const q = parseInt(quantity, 10) || 1;
      setCustomAmount((prod.salePrice * q).toFixed(2));
    }
  };

  const handleQuantityChange = (qVal: string) => {
    setQuantity(qVal);
    const prod = products.find(p => p.id === selectedProductId);
    if (prod) {
      const q = parseInt(qVal, 10) || 1;
      setCustomAmount((prod.salePrice * q).toFixed(2));
    }
  };

  const handleCreateDebt = (e: React.FormEvent) => {
    e.preventDefault();
    if (!debtorName.trim()) return;

    const prod = products.find(p => p.id === selectedProductId);
    const qty = parseInt(quantity, 10) || 1;
    const total = parseFloat(customAmount) || (prod ? prod.salePrice * qty : 0);
    const paid = parseFloat(initialPaid) || 0;

    addDebt({
      debtorName: debtorName.trim(),
      items: prod
        ? [{ productName: prod.name, quantity: qty, unitPrice: prod.salePrice }]
        : [{ productName: 'Bar Məhsulları', quantity: qty, unitPrice: total }],
      totalAmount: total,
      paidAmount: paid,
      date,
      notes: notes.trim() || undefined,
    });

    setIsAddModalOpen(false);
    setDebtorName('');
    setNotes('');
  };

  const openPayModal = (debt: DebtRecord) => {
    setSelectedDebt(debt);
    setPaymentAmount(debt.remainingAmount.toFixed(2));
    setPaymentNote('Qalıq borcun ödənişi');
    setIsPayModalOpen(true);
  };

  const handleExecutePayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDebt) return;
    const amt = parseFloat(paymentAmount) || 0;
    if (amt <= 0) return;

    payDebt(selectedDebt.id, amt, paymentNote);
    setIsPayModalOpen(false);
    setSelectedDebt(null);
  };

  return (
    <div className="space-y-6 pb-12 max-w-7xl mx-auto">
      {/* Header and Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-zinc-800">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <span>Borclar və Nisyə Paneli</span>
            {overview.unpaidDebtorsCount > 0 && (
              <span className="text-xs bg-red-950 text-red-400 font-bold px-2.5 py-0.5 rounded-full border border-red-800">
                {overview.unpaidDebtorsCount} Borclu Var
              </span>
            )}
          </h2>
          <p className="text-xs sm:text-sm text-zinc-400">
            Borcluların siyahısı, qalıq məbləğlər və ödənişlərin qəbulu
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => exportDebtsToCSV(debts)}
            className="px-3 py-1.5 text-xs font-semibold bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 rounded-xl transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Excel / CSV</span>
          </button>

          <button
            onClick={() => {
              const first = products[0];
              if (first) {
                setSelectedProductId(first.id);
                setQuantity('1');
                setCustomAmount(first.salePrice.toFixed(2));
              }
              setInitialPaid('0');
              setDate(getTodayISODate());
              setIsAddModalOpen(true);
            }}
            className="px-4 py-1.5 text-xs font-bold bg-red-600 hover:bg-red-700 text-white rounded-xl transition-all shadow-md shadow-red-600/30 flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Yeni Borc Yaz</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-md flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
              Ümumi Qalıq Borc Məbləği
            </span>
            <div className="text-2xl font-black text-red-500 font-mono mt-1">
              {formatAZN(overview.totalRemainingDebt)}
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">Ödənilməsi gözlənilən məbləğ</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-red-950 text-red-400 flex items-center justify-center border border-red-900/60">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-md flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
              Aktiv Borclu Sayı
            </span>
            <div className="text-2xl font-black text-white font-mono mt-1">
              {overview.unpaidDebtorsCount} nəfər
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">Ümumi müştəri: {overview.totalDebtorsCount} nəfər</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-zinc-800 text-zinc-300 flex items-center justify-center">
            <User className="w-6 h-6" />
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-md flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
              Ümumi Qeyd Edilən Nisyə
            </span>
            <div className="text-2xl font-black text-white font-mono mt-1">
              {debts.length} qeydiyyat
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">Bütün borc tarixçəsi</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-zinc-800 text-zinc-300 flex items-center justify-center">
            <BookOpen className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Tabs & Search Strip */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Sub-tabs */}
        <div className="flex items-center p-1 bg-zinc-900 border border-zinc-800 rounded-xl">
          <button
            onClick={() => setActiveTab('debtors')}
            className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'debtors'
                ? 'bg-red-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Borclular Paneli ({debtorsList.length})
          </button>
          <button
            onClick={() => setActiveTab('records')}
            className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'records'
                ? 'bg-red-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Bütün Borc Əməliyyatları ({debts.length})
          </button>
        </div>

        {/* Search & Status Filters */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Borclu adı ilə axtar..."
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-zinc-700 bg-zinc-900 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as 'all' | 'borcdadir' | 'odanilib')}
            className="px-2.5 py-1.5 text-xs rounded-xl border border-zinc-700 bg-zinc-900 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            <option value="all">Bütün Statuslar</option>
            <option value="borcdadir">Borcdadır</option>
            <option value="odanilib">Ödənilib</option>
          </select>
        </div>
      </div>

      {/* TAB 1: BORCLULAR PANELİ (Aggregated by Person) */}
      {activeTab === 'debtors' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDebtors.length === 0 ? (
            <div className="col-span-full py-16 text-center bg-zinc-900 rounded-2xl border border-zinc-800 text-zinc-500 text-xs">
              Axtarışa uyğun borclu tapılmadı.
            </div>
          ) : (
            filteredDebtors.map(debtor => {
              const activeUnpaid = debtor.records.filter(r => r.status === 'borcdadir' && r.remainingAmount > 0);
              return (
                <div
                  key={debtor.debtorName}
                  className={`p-5 rounded-2xl bg-zinc-900 border shadow-md flex flex-col justify-between space-y-4 ${
                    debtor.hasUnpaid
                      ? 'border-red-900/80 ring-1 ring-red-500/30'
                      : 'border-zinc-800'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs ${
                          debtor.hasUnpaid
                            ? 'bg-red-950 text-red-400 border border-red-800'
                            : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                        }`}>
                          {debtor.debtorName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                            <span>{debtor.debtorName}</span>
                            {debtor.hasUnpaid && (
                              <span className="w-2 h-2 rounded-full bg-red-600 inline-block shadow-sm shadow-red-600" title="Borcu var" />
                            )}
                          </h4>
                          <span className="text-[10px] text-zinc-500">
                            {debtor.records.length} əməliyyat
                          </span>
                        </div>
                      </div>

                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                        debtor.hasUnpaid
                          ? 'bg-red-950 text-red-400 border border-red-800'
                          : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                      }`}>
                        {debtor.hasUnpaid ? 'Borcdadır' : 'Ödənilib'}
                      </span>
                    </div>

                    {/* Financial stats for this person */}
                    <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-[10px] text-zinc-500 block uppercase">Qalıq Borc</span>
                        <span className="font-mono font-extrabold text-base text-red-500">
                          {formatAZN(debtor.remainingDebt)}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-zinc-500 block uppercase">Ödədiyi</span>
                        <span className="font-mono font-bold text-xs text-emerald-400">
                          {formatAZN(debtor.totalPaid)}
                        </span>
                      </div>
                    </div>

                    {/* Mini History list */}
                    <div className="space-y-1 text-xs">
                      <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">
                        Son Əməliyyatlar:
                      </span>
                      {debtor.records.slice(0, 2).map(r => (
                        <div key={r.id} className="flex justify-between text-[11px] text-zinc-400">
                          <span>{formatDateAZ(r.date)} ({r.items.map(i => i.productName).join(', ')})</span>
                          <span className="font-mono font-semibold text-zinc-200">{formatAZN(r.remainingAmount)} qalıb</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Action: Pay Debt button if unpaid exists */}
                  {debtor.hasUnpaid && activeUnpaid[0] ? (
                    <button
                      type="button"
                      onClick={() => openPayModal(activeUnpaid[0])}
                      className="w-full py-2 px-3 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-red-600/30 flex items-center justify-center gap-1.5"
                    >
                      <DollarSign className="w-4 h-4" />
                      <span>Ödəniş Qəbul Et</span>
                    </button>
                  ) : (
                    <div className="w-full py-2 px-3 bg-zinc-950 text-emerald-400 font-bold text-xs rounded-xl text-center flex items-center justify-center gap-1 border border-zinc-800">
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>Borcu Yoxdur</span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TAB 2: BÜTÜN BORC ƏMƏLİYYATLARI (Detailed Table) */}
      {activeTab === 'records' && (
        <div className="bg-zinc-900 rounded-2xl border border-zinc-800 shadow-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-950 text-zinc-400 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Tarix</th>
                  <th className="py-3 px-4">Borclu</th>
                  <th className="py-3 px-4">Götürdüyü Məhsul & Say</th>
                  <th className="py-3 px-4 text-right">Cəmi Məbləğ</th>
                  <th className="py-3 px-4 text-right">Ödənilən</th>
                  <th className="py-3 px-4 text-right">Qalıq Borc</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-center">Əməliyyat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {filteredRecords.map(d => (
                  <tr key={d.id} className="hover:bg-zinc-800/40">
                    <td className="py-3 px-4 font-mono text-zinc-400 whitespace-nowrap">
                      {formatDateAZ(d.date)}
                    </td>
                    <td className="py-3 px-4 font-bold text-white whitespace-nowrap">
                      <span className="flex items-center gap-1.5">
                        {d.status === 'borcdadir' && (
                          <span className="w-2 h-2 rounded-full bg-red-600 shrink-0 shadow-sm shadow-red-600" />
                        )}
                        <span>{d.debtorName}</span>
                      </span>
                    </td>
                    <td className="py-3 px-4 font-medium text-zinc-300 max-w-xs">
                      {d.items.map(i => `${i.productName} (${i.quantity} əd.)`).join(', ')}
                      {d.notes && <div className="text-[10px] text-zinc-500 italic">{d.notes}</div>}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-white">
                      {formatAZN(d.totalAmount)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-emerald-400">
                      {formatAZN(d.paidAmount)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-extrabold text-red-500">
                      {formatAZN(d.remainingAmount)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        d.status === 'borcdadir'
                          ? 'bg-red-950 text-red-400 border border-red-800'
                          : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                      }`}>
                        {d.status === 'borcdadir' ? 'Borcdadır' : 'Ödənilib'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      {d.status === 'borcdadir' && d.remainingAmount > 0 && (
                        <button
                          type="button"
                          onClick={() => openPayModal(d)}
                          className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white font-bold text-[11px] rounded-lg transition-colors shadow-sm"
                        >
                          Ödəniş Al
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: New Debt */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in">
          <div className="bg-zinc-900 w-full max-w-md rounded-3xl shadow-2xl border border-zinc-800 overflow-hidden flex flex-col">
            <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">
                  Yeni Nisyə (Borc) Qeydiyyatı
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Məhsul götürən şəxsin adına borc yazılması
                </p>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1.5 text-zinc-400 hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateDebt} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-red-400 uppercase tracking-wider mb-1">
                  Borclunun Adı və Soyadı *
                </label>
                <input
                  type="text"
                  required
                  value={debtorName}
                  onChange={e => handleDebtorNameTyping(e.target.value)}
                  placeholder="məs: Əli Həsənov"
                  className="w-full px-3.5 py-2 text-sm font-semibold rounded-xl border border-red-700 bg-zinc-950 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-1">
                  Götürdüyü Məhsul *
                </label>
                <select
                  value={selectedProductId}
                  onChange={e => handleProductChange(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-zinc-700 bg-zinc-800 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  {products.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({formatAZN(p.salePrice)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-1">
                    Say (ədəd) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={quantity}
                    onChange={e => handleQuantityChange(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm font-mono rounded-xl border border-zinc-700 bg-zinc-800 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-1">
                    Cəmi Məbləğ (AZN) *
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    min="0.05"
                    required
                    value={customAmount}
                    onChange={e => setCustomAmount(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm font-mono rounded-xl border border-zinc-700 bg-zinc-800 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-1">
                    İlkin Ödənilən (AZN)
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    value={initialPaid}
                    onChange={e => setInitialPaid(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm font-mono rounded-xl border border-zinc-700 bg-zinc-800 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-1">
                    Tarix
                  </label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm font-mono rounded-xl border border-zinc-700 bg-zinc-800 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-1">
                  Qeyd
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="məs: Sabah məşqə gələndə ödəyəcək"
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-zinc-700 bg-zinc-800 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div className="pt-3 border-t border-zinc-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-white rounded-xl"
                >
                  Ləğv et
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold bg-red-600 hover:bg-red-700 text-white rounded-xl shadow-md shadow-red-600/30"
                >
                  Borc Yaz
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Pay Debt */}
      {isPayModalOpen && selectedDebt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in">
          <div className="bg-zinc-900 w-full max-w-md rounded-3xl shadow-2xl border border-zinc-800 overflow-hidden flex flex-col">
            <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">
                  Borc Ödənişinin Qəbulu
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Müştəri: <strong className="text-white">{selectedDebt.debtorName}</strong>
                </p>
              </div>
              <button
                onClick={() => setIsPayModalOpen(false)}
                className="p-1.5 text-zinc-400 hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleExecutePayment} className="p-6 space-y-4">
              <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-zinc-500">
                    Cari Qalıq Borc
                  </span>
                  <div className="text-xl font-black font-mono text-red-500">
                    {formatAZN(selectedDebt.remainingAmount)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPaymentAmount(selectedDebt.remainingAmount.toFixed(2))}
                  className="px-3 py-1 text-xs font-bold bg-red-600 hover:bg-red-700 text-white rounded-lg shadow-sm"
                >
                  Tam Ödə
                </button>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-1">
                  Ödənilən Məbləğ (AZN) *
                </label>
                <input
                  type="number"
                  step="0.05"
                  min="0.05"
                  max={selectedDebt.remainingAmount}
                  required
                  value={paymentAmount}
                  onChange={e => setPaymentAmount(e.target.value)}
                  className="w-full px-3.5 py-2 text-base font-mono font-bold rounded-xl border border-zinc-700 bg-zinc-800 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-1">
                  Qeyd (İstəyə görə)
                </label>
                <input
                  type="text"
                  value={paymentNote}
                  onChange={e => setPaymentNote(e.target.value)}
                  placeholder="məs: Nağd ödədi"
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-zinc-700 bg-zinc-800 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div className="pt-3 border-t border-zinc-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsPayModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-white rounded-xl"
                >
                  Ləğv et
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-sm"
                >
                  Ödənişi Təsdiqlə
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Warning Modal */}
      <DebtWarningModal
        isOpen={isWarningOpen}
        debtorName={warningData.name}
        totalRemainingDebt={warningData.amount}
        onClose={() => setIsWarningOpen(false)}
        onProceedAnyway={() => setIsWarningOpen(false)}
      />
    </div>
  );
};
