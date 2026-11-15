import React, { useEffect, useState } from 'react';
import {
  Plus,
  DollarSign,
  Package,
  Download,
  Trash2,
  Search,
  X,
  Camera,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatAZN, formatDateAZ, getTodayISODate } from '../utils/dateUtils';
import { exportPurchasesToCSV } from '../utils/exportUtils';
import { findProductByBarcode } from '../utils/barcodeUtils';
import { playAlertSound, unlockAudioContext } from '../utils/notificationUtils';
import { BarcodeScannerModal } from '../components/BarcodeScannerModal';
import { TablePagination } from '../components/TablePagination';

const PAGE_SIZE = 15;

export const PurchasesView: React.FC = () => {
  const { products, purchases, addPurchase, deletePurchase, currentUser, settings, showToast } = useApp();
  const isAdmin = currentUser?.role === 'admin';
  const primaryColor = settings.primaryColor || '#E32636';

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState(products[0]?.id || '');
  const [quantity, setQuantity] = useState('20');
  const [paidAmount, setPaidAmount] = useState('');
  const [date, setDate] = useState(getTodayISODate());
  const [note, setNote] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

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

    showToast('success', `"${prod.name}" (+${qty} ədəd) depoya qəbul edildi.`);
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

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredPurchases.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedPurchases = filteredPurchases.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const handleBarcodeForPurchase = (code: string) => {
    const matched = findProductByBarcode(products, code);
    if (matched) {
      playAlertSound('success');
      setSelectedProductId(matched.id);
      const q = parseFloat(quantity) || 20;
      setQuantity(String(q));
      if (matched.buyPrice) {
        setPaidAmount((q * matched.buyPrice).toFixed(2));
      } else {
        setPaidAmount('0');
      }
      setDate(getTodayISODate());
      setIsModalOpen(true);
      showToast('success', `"${matched.name}" mal qəbulu üçün seçildi.`);
    } else {
      playAlertSound('warning');
      showToast('error', `"${code}" barkodlu məhsul tapılmadı.`);
    }
  };

  return (
    <div className="space-y-6 pb-12 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E5E5E5] dark:border-[#262626]">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-[#171717] dark:text-white tracking-tight flex items-center gap-2.5">
            <span>Mal Qəbulu (Depo Girişi)</span>
            <span className="text-[11px] bg-[#E32636]/10 text-[#E32636] font-semibold px-2 py-0.5 rounded-[8px] border border-[#E32636]/20 whitespace-nowrap">
              Depo Artımı
            </span>
          </h2>
          <p className="text-xs sm:text-sm text-[#888888] mt-0.5">
            Topdan alınan malların qeydiyyatı — depo qalığını avtomatik artırır
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => exportPurchasesToCSV(purchases)}
            className="px-3.5 py-2 text-xs font-semibold bg-white dark:bg-[#222222] border border-[#E5E5E5] dark:border-[#262626] hover:bg-[#F5F5F5] dark:hover:bg-[#2B2B2B] text-[#171717] dark:text-white rounded-[10px] transition-colors flex items-center gap-1.5 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5 text-[#888888]" />
            <span>Excel / CSV</span>
          </button>

          <button
            type="button"
            onClick={() => {
              unlockAudioContext();
              setIsScannerOpen(true);
            }}
            className="px-3.5 py-2 text-xs font-semibold bg-white dark:bg-[#222222] border border-[#E5E5E5] dark:border-[#262626] hover:bg-[#F5F5F5] dark:hover:bg-[#2B2B2B] text-[#171717] dark:text-white rounded-[10px] transition-colors flex items-center gap-1.5 whitespace-nowrap"
          >
            <Camera className="w-3.5 h-3.5 text-[#E32636]" />
            <span>Barkodla Qəbul</span>
          </button>

          <button
            type="button"
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
            style={{ backgroundColor: primaryColor }}
            className="px-4 py-2 text-xs font-semibold text-white rounded-[10px] transition-all hover:opacity-90 flex items-center gap-1.5 whitespace-nowrap shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Yeni Mal Qəbulu</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-5 rounded-[14px] bg-white dark:bg-[#171717] border border-[#E5E5E5] dark:border-[#262626] flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-[#888888] uppercase tracking-wider">
              Ümumi Qəbul Edilən Mal Sayı
            </span>
            <div className="text-2xl font-bold text-[#171717] dark:text-white font-mono tabular-nums mt-1">
              {totalPurchasedCount} ədəd
            </div>
            <p className="text-xs text-[#888888] mt-1 font-mono tabular-nums">
              {purchases.length} dəfə qəbul əməliyyatı
            </p>
          </div>
          <div className="w-11 h-11 rounded-[12px] bg-[#E32636]/10 text-[#E32636] flex items-center justify-center border border-[#E32636]/20">
            <Package className="w-5 h-5" />
          </div>
        </div>

        <div className="p-5 rounded-[14px] bg-white dark:bg-[#171717] border border-[#E5E5E5] dark:border-[#262626] flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-[#888888] uppercase tracking-wider">
              Mal Alışına Verilən Cəmi Pul
            </span>
            <div className="text-2xl font-bold text-[#E32636] font-mono tabular-nums mt-1">
              {formatAZN(totalPaidSum)}
            </div>
            <p className="text-xs text-[#888888] mt-1">
              Xalis mənfəət hesablanmasında xərc kimi çıxılır
            </p>
          </div>
          <div className="w-11 h-11 rounded-[12px] bg-[#F5F5F5] dark:bg-[#222222] text-[#888888] flex items-center justify-center border border-[#E5E5E5] dark:border-[#262626]">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Product-level Totals Strip */}
      <div className="p-4 sm:p-5 bg-white dark:bg-[#171717] rounded-[14px] border border-[#E5E5E5] dark:border-[#262626] space-y-2.5">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#888888]">
          Məhsul Üzrə Ümumi Gələn Say və Verilən Pul
        </h3>
        <div className="flex flex-wrap gap-2 pt-0.5">
          {Object.entries(productSummary).map(([pId, info]) => (
            <div
              key={pId}
              className="px-3 py-1.5 bg-[#FAFAFA] dark:bg-[#222222] rounded-[10px] text-xs flex items-center gap-2 border border-[#E5E5E5] dark:border-[#262626]"
            >
              <span className="font-semibold text-[#171717] dark:text-white">{info.name}:</span>
              <span className="font-mono tabular-nums font-bold text-[#E32636]">{info.quantity} ədəd</span>
              <span className="text-[#888888] font-mono tabular-nums">({formatAZN(info.amount)})</span>
            </div>
          ))}
          {Object.keys(productSummary).length === 0 && (
            <span className="text-xs text-[#888888]">Hələlik qəbul qeydi yoxdur.</span>
          )}
        </div>
      </div>

      {/* Table of Purchases */}
      <div className="bg-white dark:bg-[#171717] rounded-[14px] border border-[#E5E5E5] dark:border-[#262626] overflow-hidden">
        <div className="p-4 border-b border-[#E5E5E5] dark:border-[#262626] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#888888]" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Qəbul qeydlərində axtar..."
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
          <span className="text-xs text-[#888888] font-mono tabular-nums">
            Cəmi: {filteredPurchases.length} qeyd
          </span>
        </div>

        {filteredPurchases.length === 0 ? (
          <div className="py-12 text-center text-xs text-[#888888]">
            Hələlik heç bir mal qəbulu qeydə alınmayıb.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[680px]">
                <thead className="bg-[#FAFAFA] dark:bg-[#141414] text-[#888888] font-semibold uppercase tracking-wider text-[10px] border-b border-[#E5E5E5] dark:border-[#262626]">
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
                <tbody className="divide-y divide-[#E5E5E5] dark:divide-[#262626]">
                  {paginatedPurchases.map(p => (
                    <tr key={p.id} className="hover:bg-[#FAFAFA] dark:hover:bg-[#222222]/50 transition-colors">
                      <td className="py-3 px-4 font-mono tabular-nums text-[#888888] whitespace-nowrap">
                        {formatDateAZ(p.date)}
                      </td>
                      <td className="py-3 px-4 font-semibold text-[#171717] dark:text-white">
                        {p.productName}
                      </td>
                      <td className="py-3 px-4 text-center font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400">
                        +{p.quantity} ədəd
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-[#171717] dark:text-white">
                        {formatAZN(p.paidAmount)}
                      </td>
                      <td className="py-3 px-4 text-[#888888] max-w-xs truncate">
                        {p.note || '—'}
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-[#888888]">
                        @{p.createdBy}
                      </td>
                      {isAdmin && (
                        <td className="py-3 px-4 text-center">
                          {confirmDeleteId === p.id ? (
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  deletePurchase(p.id);
                                  setConfirmDeleteId(null);
                                  showToast('success', 'Mal qəbulu qeydi silindi.');
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
                              onClick={() => setConfirmDeleteId(p.id)}
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
              totalItems={filteredPurchases.length}
              pageSize={PAGE_SIZE}
              currentPage={safePage}
              onPageChange={setCurrentPage}
              primaryColor={primaryColor}
            />
          </>
        )}
      </div>

      {/* Modal: New Purchase Intake */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-[#171717] w-full max-w-md rounded-[14px] shadow-2xl border border-[#E5E5E5] dark:border-[#262626] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-[#E5E5E5] dark:border-[#262626] flex items-center justify-between">
              <h3 className="text-base font-bold text-[#171717] dark:text-white">
                Yeni Mal Qəbulu Daxil Et
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-[#888888] hover:text-[#171717] dark:hover:text-white rounded-[8px]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePurchase} className="p-6 space-y-4">
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
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[11px] font-semibold text-[#888888] uppercase tracking-wider">
                    Məhsul *
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      unlockAudioContext();
                      setIsScannerOpen(true);
                    }}
                    className="text-[11px] font-semibold text-[#E32636] hover:underline flex items-center gap-1"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>Barkod Oxut</span>
                  </button>
                </div>
                <select
                  value={selectedProductId}
                  onChange={e => handleProductSelect(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-[10px] border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#E32636]"
                >
                  {products.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} · [{p.barcode}] (Alış: {formatAZN(p.buyPrice)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[#888888] uppercase tracking-wider mb-1.5">
                    Gələn Say (ədəd) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={quantity}
                    onChange={e => handleQuantityChange(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums rounded-[10px] border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#E32636]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[#888888] uppercase tracking-wider mb-1.5">
                    Verilən Pul (AZN) *
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    required
                    value={paidAmount}
                    onChange={e => setPaidAmount(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums rounded-[10px] border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#E32636]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#888888] uppercase tracking-wider mb-1.5">
                  Qeyd (Təchizatçı, faktura № və s.)
                </label>
                <input
                  type="text"
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="məs: Bulaq Suları MMC, topdan gətirilmə"
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
                  Depoya Qəbul Et
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Barcode Scanner Modal for Purchase Intake */}
      <BarcodeScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScan={handleBarcodeForPurchase}
        title="Mal Qəbulu Üçün Barkod Oxut"
      />
    </div>
  );
};
