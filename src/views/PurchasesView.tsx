import React, { useState } from 'react';
import {
  ArrowDownLeft,
  Plus,
  Calendar,
  DollarSign,
  Package,
  Download,
  Trash2,
  CheckCircle,
  Search,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatAZN, formatDateAZ, getTodayISODate } from '../utils/dateUtils';
import { exportPurchasesToCSV } from '../utils/exportUtils';

export const PurchasesView: React.FC = () => {
  const { products, purchases, addPurchase, deletePurchase, currentUser } = useApp();
  const isAdmin = currentUser?.role === 'admin';

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState(products[0]?.id || '');
  const [quantity, setQuantity] = useState('20');
  const [paidAmount, setPaidAmount] = useState('');
  const [date, setDate] = useState(getTodayISODate());
  const [note, setNote] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Summary by product
  const productSummary: Record<string, { quantity: number; amount: number; name: string }> = {};
  for (const pur of purchases) {
    if (!productSummary[pur.productId]) {
      productSummary[pur.productId] = {
        quantity: 0,
        amount: 0,
        name: pur.productName,
      };
    }
    productSummary[pur.productId].quantity += pur.quantity;
    productSummary[pur.productId].amount += pur.paidAmount;
  }

  const totalPurchasedCount = purchases.reduce((sum, p) => sum + p.quantity, 0);
  const totalPaidSum = purchases.reduce((sum, p) => sum + p.paidAmount, 0);

  // Auto-fill paid amount when product or quantity changes based on product's buyPrice
  const handleProductSelect = (pId: string) => {
    setSelectedProductId(pId);
    const prod = products.find(p => p.id === pId);
    if (prod && prod.buyPrice) {
      const q = parseFloat(quantity) || 0;
      setPaidAmount((q * prod.buyPrice).toFixed(2));
    }
  };

  const handleQuantityChange = (qVal: string) => {
    setQuantity(qVal);
    const prod = products.find(p => p.id === selectedProductId);
    if (prod && prod.buyPrice) {
      const q = parseFloat(qVal) || 0;
      setPaidAmount((q * prod.buyPrice).toFixed(2));
    }
  };

  const handleSavePurchase = (e: React.FormEvent) => {
    e.preventDefault();
    const prod = products.find(p => p.id === selectedProductId);
    if (!prod) return;

    const qty = parseInt(quantity, 10) || 0;
    const paid = parseFloat(paidAmount) || 0;
    if (qty <= 0) return;

    addPurchase({
      date,
      productId: prod.id,
      productName: prod.name,
      quantity: qty,
      paidAmount: paid,
      note: note.trim() || undefined,
    });

    setIsModalOpen(false);
    setNote('');
  };

  const filteredPurchases = purchases.filter(p => {
    return (
      p.productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.note && p.note.toLowerCase().includes(searchQuery.toLowerCase())) ||
      p.date.includes(searchQuery)
    );
  });

  return (
    <div className="space-y-6 pb-12 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-zinc-800">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <span>Mal Qəbulu (Depo Girişi)</span>
            <span className="text-xs bg-red-950 text-red-400 font-bold px-2 py-0.5 rounded-full border border-red-800">
              Depo Artımı
            </span>
          </h2>
          <p className="text-xs sm:text-sm text-zinc-400">
            Topdan alınan malların qeydiyyatı (depo qalığını avtomatik artırır)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => exportPurchasesToCSV(purchases)}
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
                setQuantity('20');
                setPaidAmount((20 * (first.buyPrice || 0)).toFixed(2));
              }
              setDate(getTodayISODate());
              setIsModalOpen(true);
            }}
            className="px-4 py-1.5 text-xs font-bold bg-red-600 hover:bg-red-700 text-white rounded-xl transition-all shadow-md shadow-red-600/30 flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Yeni Mal Qəbulu</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-md flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
              Ümumi Qəbul Edilən Mal Sayı
            </span>
            <div className="text-2xl font-black text-white font-mono mt-1">
              {totalPurchasedCount} ədəd
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">{purchases.length} dəfə qəbul əməliyyatı</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-red-950 text-red-400 flex items-center justify-center border border-red-900/60">
            <Package className="w-6 h-6" />
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-md flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
              Mal Alışına Verilən Cəmi Pul
            </span>
            <div className="text-2xl font-black text-red-400 font-mono mt-1">
              {formatAZN(totalPaidSum)}
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">Xalis mənfəət hesablanmasında xərc kimi çıxılır</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-zinc-800 text-zinc-300 flex items-center justify-center">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Product-level Totals Strip */}
      <div className="p-4 bg-zinc-900 rounded-2xl border border-zinc-800 shadow-md space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
          Məhsul Üzrə Ümumi Gələn Say və Verilən Pul
        </h3>
        <div className="flex flex-wrap gap-2 pt-1">
          {Object.entries(productSummary).map(([pId, info]) => (
            <div
              key={pId}
              className="px-3 py-1.5 bg-zinc-950 rounded-xl text-xs flex items-center gap-2 border border-zinc-800"
            >
              <span className="font-semibold text-zinc-200">{info.name}:</span>
              <span className="font-mono font-bold text-red-400">{info.quantity} ədəd</span>
              <span className="text-zinc-500 font-mono">({formatAZN(info.amount)})</span>
            </div>
          ))}
          {Object.keys(productSummary).length === 0 && (
            <span className="text-xs text-zinc-500">Hələlik qəbul qeydi yoxdur.</span>
          )}
        </div>
      </div>

      {/* Table of Purchases */}
      <div className="bg-zinc-900 rounded-2xl border border-zinc-800 shadow-md overflow-hidden space-y-3">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Qəbul qeydlərində axtar..."
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-zinc-700 bg-zinc-950 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
          <span className="text-xs text-zinc-500 font-medium">Cəmi: {filteredPurchases.length} qeyd</span>
        </div>

        {filteredPurchases.length === 0 ? (
          <div className="py-12 text-center text-xs text-zinc-500">
            Hələlik heç bir mal qəbulu qeydə alınmayıb.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-950 text-zinc-400 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Tarix</th>
                  <th className="py-3 px-4">Məhsul</th>
                  <th className="py-3 px-4 text-center">Gələn Say</th>
                  <th className="py-3 px-4 text-right">Ödənilən Pul</th>
                  <th className="py-3 px-4">Qeyd</th>
                  <th className="py-3 px-4">Qeydiyyatçı</th>
                  {isAdmin && <th className="py-3 px-4 text-center">Əməliyyat</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {filteredPurchases.map(p => (
                  <tr key={p.id} className="hover:bg-zinc-800/40">
                    <td className="py-3 px-4 font-mono text-zinc-400 whitespace-nowrap">
                      {formatDateAZ(p.date)}
                    </td>
                    <td className="py-3 px-4 font-bold text-white">
                      {p.productName}
                    </td>
                    <td className="py-3 px-4 text-center font-mono font-bold text-red-400">
                      +{p.quantity} ədəd
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-white">
                      {formatAZN(p.paidAmount)}
                    </td>
                    <td className="py-3 px-4 text-zinc-400 max-w-xs truncate">
                      {p.note || '—'}
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-zinc-400">
                      @{p.createdBy}
                    </td>
                    {isAdmin && (
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => {
                            if (confirm('Bu mal qəbulu qeydini silmək istəyirsiniz?')) {
                              deletePurchase(p.id);
                            }
                          }}
                          className="p-1 text-red-400 hover:text-red-300 transition-colors"
                          title="Sil"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: New Purchase Intake */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in">
          <div className="bg-zinc-900 w-full max-w-md rounded-3xl shadow-2xl border border-zinc-800 overflow-hidden flex flex-col">
            <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
              <h3 className="text-base font-bold text-white">
                Yeni Mal Qəbulu Daxil Et
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-zinc-400 hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePurchase} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-1">
                  Tarix *
                </label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm font-mono rounded-xl border border-zinc-700 bg-zinc-800 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-1">
                  Məhsul *
                </label>
                <select
                  value={selectedProductId}
                  onChange={e => handleProductSelect(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-zinc-700 bg-zinc-800 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  {products.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} (Alış: {formatAZN(p.buyPrice)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-1">
                    Gələn Say (ədəd) *
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
                    Verilən Pul (AZN) *
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    required
                    value={paidAmount}
                    onChange={e => setPaidAmount(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm font-mono rounded-xl border border-zinc-700 bg-zinc-800 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-1">
                  Qeyd (Təchizatçı, faktura № və s.)
                </label>
                <input
                  type="text"
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="məs: Bulaq Suları MMC, topdan gətirilmə"
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-zinc-700 bg-zinc-800 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div className="pt-3 border-t border-zinc-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-white rounded-xl"
                >
                  Ləğv et
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold bg-red-600 hover:bg-red-700 text-white rounded-xl shadow-md shadow-red-600/30"
                >
                  Depoya Qəbul Et
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
