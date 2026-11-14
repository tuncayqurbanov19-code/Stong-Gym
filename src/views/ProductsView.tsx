import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus,
  Search,
  Camera,
  Edit2,
  Trash2,
  Download,
  Upload,
  AlertTriangle,
  Barcode,
  Package,
  X,
  ScanBarcode,
  CheckCircle2,
  SlidersHorizontal,
  History,
  ArrowDownLeft,
  ArrowUpRight,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { DepoMovementType, Product } from '../types';
import { formatAZN, formatDateAZ } from '../utils/dateUtils';
import { buildDepoMovementsLedger, calculateProductStock } from '../utils/stockCalculations';
import {
  findProductByBarcode,
  hasLongerBarcodePrefix,
  isRapidScanSequence,
  normalizeBarcode,
} from '../utils/barcodeUtils';
import { playAlertSound, unlockAudioContext } from '../utils/notificationUtils';
import { BarcodeScannerModal } from '../components/BarcodeScannerModal';
import { exportProductsToCSV, parseProductsCSV } from '../utils/exportUtils';

export const ProductsView: React.FC = () => {
  const {
    products,
    addProduct,
    updateProduct,
    deleteProduct,
    purchases,
    sales,
    depoMovements,
    recordManualDepoAdjustment,
    settings,
    currentUser,
    showToast,
  } = useApp();

  const isAdmin = currentUser?.role === 'admin';
  const primaryColor = settings.primaryColor || '#dc2626';

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerTarget, setScannerTarget] = useState<'form' | 'search' | 'adjust'>('search');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Depo Barcode Scanner & Quick Stock Adjust State
  const [depoScanCode, setDepoScanCode] = useState('');
  const [lastScannedBanner, setLastScannedBanner] = useState<{
    status: 'found' | 'not_found';
    code: string;
    product?: Product;
  } | null>(null);
  const [quickAdjustProduct, setQuickAdjustProduct] = useState<Product | null>(null);
  const [targetActiveStock, setTargetActiveStock] = useState<string>('0');
  const [quickBarcode, setQuickBarcode] = useState('');
  const [quickSalePrice, setQuickSalePrice] = useState('');
  const [quickBuyPrice, setQuickBuyPrice] = useState('');
  const [quickAdjustNote, setQuickAdjustNote] = useState('');

  // Depo Movement History Filter State (4 Categories)
  const [depoCategoryFilter, setDepoCategoryFilter] = useState<'all' | DepoMovementType>('all');
  const [depoHistorySearch, setDepoHistorySearch] = useState('');
  const [depoHistoryDate, setDepoHistoryDate] = useState('');

  const depoTimerRef = useRef<number | null>(null);
  const depoIntervalsRef = useRef<{ lastTime: number; intervals: number[] }>({
    lastTime: 0,
    intervals: [],
  });
  const lastHandledDepoScanRef = useRef<{ code: string; time: number }>({ code: '', time: 0 });
  const hidBufferRef = useRef<{ chars: string; lastTime: number; intervals: number[]; timer: number | null }>({
    chars: '',
    lastTime: 0,
    intervals: [],
    timer: null,
  });

  // Form State
  const [name, setName] = useState('');
  const [barcode, setBarcode] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [category, setCategory] = useState('Su');
  const [volume, setVolume] = useState('');
  const [initialStock, setInitialStock] = useState('50');
  const [minStockAlert, setMinStockAlert] = useState('5');
  const [note, setNote] = useState('');
  const [image, setImage] = useState('');

  // Extract unique categories
  const categories = Array.from(new Set(products.map(p => p.category || 'Ümumi')));

  // Filter products
  const filteredProducts = products.filter(p => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.barcode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.category && p.category.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCat = selectedCategory === 'all' || p.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  const openCreateModal = () => {
    setEditingProduct(null);
    setName('');
    setBarcode('');
    setSalePrice('');
    setBuyPrice('');
    setCategory('Su');
    setVolume('');
    setInitialStock('50');
    setMinStockAlert(String(settings.minStockThreshold || 5));
    setNote('');
    setImage('');
    setIsModalOpen(true);
  };

  const openEditModal = (p: Product) => {
    setEditingProduct(p);
    setName(p.name);
    setBarcode(p.barcode);
    setSalePrice(String(p.salePrice));
    setBuyPrice(String(p.buyPrice));
    setCategory(p.category);
    setVolume(p.volume || '');
    setInitialStock(String(p.initialStock));
    setMinStockAlert(String(p.minStockAlert));
    setNote(p.note || '');
    setImage(p.image || '');
    setIsModalOpen(true);
  };

  const openQuickAdjustModal = (p: Product) => {
    const stock = calculateProductStock(p, purchases, sales, settings.minStockThreshold);
    setQuickAdjustProduct(p);
    setTargetActiveStock(String(stock.activeStock));
    setQuickBarcode(p.barcode);
    setQuickSalePrice(String(p.salePrice));
    setQuickBuyPrice(String(p.buyPrice));
    setQuickAdjustNote('');
  };

  const handleSaveQuickAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickAdjustProduct) return;

    const parsedTarget = Math.max(0, parseInt(targetActiveStock, 10) || 0);
    const sPrice = parseFloat(quickSalePrice);
    const bPrice = parseFloat(quickBuyPrice);

    const res = await recordManualDepoAdjustment({
      productId: quickAdjustProduct.id,
      targetActiveStock: parsedTarget,
      barcode: quickBarcode.trim() || quickAdjustProduct.barcode,
      salePrice: Number.isFinite(sPrice) && sPrice >= 0 ? sPrice : quickAdjustProduct.salePrice,
      buyPrice: Number.isFinite(bPrice) && bPrice >= 0 ? bPrice : quickAdjustProduct.buyPrice,
      note: quickAdjustNote.trim() || undefined,
    });

    if (!res.success) {
      showToast('error', res.error || 'Depo qalığı yenilənmədi.');
      return;
    }

    playAlertSound('success');
    showToast(
      'success',
      `"${quickAdjustProduct.name}" depo sayı ${parsedTarget} ədəd olaraq yeniləndi.`
    );
    setQuickAdjustProduct(null);
  };

  // Unified 4-Category Depo Movement Ledger
  const depoLedger = useMemo(
    () =>
      buildDepoMovementsLedger({
        purchases,
        sales,
        manualAdjustments: depoMovements,
      }),
    [purchases, sales, depoMovements]
  );

  const filteredDepoMovements = useMemo(() => {
    const q = depoHistorySearch.trim().toLowerCase();
    return depoLedger.movements.filter(m => {
      if (depoCategoryFilter !== 'all' && m.movementType !== depoCategoryFilter) return false;
      if (depoHistoryDate && m.date !== depoHistoryDate) return false;
      if (q) {
        const matchProd = m.productName.toLowerCase().includes(q);
        const matchCust = (m.customerName || '').toLowerCase().includes(q);
        const matchNote = (m.note || '').toLowerCase().includes(q);
        const matchLabel = (m.sourceLabel || '').toLowerCase().includes(q);
        if (!matchProd && !matchCust && !matchNote && !matchLabel) return false;
      }
      return true;
    });
  }, [depoLedger, depoCategoryFilter, depoHistorySearch, depoHistoryDate]);

  const handleDepoBarcodeScan = (rawCode: string, autoOpenAdjust = true) => {
    const clean = normalizeBarcode(rawCode);
    if (!clean) return;

    const now = Date.now();
    if (
      lastHandledDepoScanRef.current.code === clean &&
      now - lastHandledDepoScanRef.current.time < 180
    ) {
      return;
    }
    lastHandledDepoScanRef.current = { code: clean, time: now };

    const matched = findProductByBarcode(products, clean);
    if (matched) {
      playAlertSound('success');
      setSelectedCategory('all');
      setSearchQuery(matched.barcode);
      setLastScannedBanner({ status: 'found', code: matched.barcode, product: matched });
      const stock = calculateProductStock(matched, purchases, sales, settings.minStockThreshold);
      showToast('success', `Tapıldı: "${matched.name}" (Qalıq: ${stock.activeStock} ədəd)`);
      if (isAdmin && autoOpenAdjust) {
        openQuickAdjustModal(matched);
      }
    } else {
      playAlertSound('warning');
      setLastScannedBanner({ status: 'not_found', code: rawCode.trim() });
      showToast('error', `"${rawCode.trim()}" barkodlu məhsul depoda tapılmadı!`);
    }
  };

  const handleDepoInputChange = (val: string) => {
    setDepoScanCode(val);
    if (depoTimerRef.current) {
      window.clearTimeout(depoTimerRef.current);
      depoTimerRef.current = null;
    }

    const now = Date.now();
    if (val.length <= 1 || now - depoIntervalsRef.current.lastTime > 250) {
      depoIntervalsRef.current = { lastTime: now, intervals: [] };
    } else {
      depoIntervalsRef.current.intervals.push(now - depoIntervalsRef.current.lastTime);
      depoIntervalsRef.current.lastTime = now;
    }

    const clean = normalizeBarcode(val);
    if (!clean) return;

    const matched = findProductByBarcode(products, clean);
    const rapid = isRapidScanSequence(depoIntervalsRef.current.intervals);

    if (matched) {
      const hasLonger = hasLongerBarcodePrefix(products, clean, matched.id);
      const delay = rapid ? 90 : hasLonger ? 450 : 200;
      depoTimerRef.current = window.setTimeout(() => {
        handleDepoBarcodeScan(val, true);
        setDepoScanCode('');
        depoIntervalsRef.current = { lastTime: 0, intervals: [] };
      }, delay);
    } else if (rapid && clean.length >= 4) {
      depoTimerRef.current = window.setTimeout(() => {
        handleDepoBarcodeScan(val, true);
        setDepoScanCode('');
        depoIntervalsRef.current = { lastTime: 0, intervals: [] };
      }, 220);
    }
  };

  // Global USB/Bluetooth HID scanner listener while viewing Depo (when no modal is open)
  useEffect(() => {
    if (isScannerOpen || isModalOpen || Boolean(quickAdjustProduct)) return;

    const flushHid = (requireRapid: boolean) => {
      const buf = hidBufferRef.current.chars.trim();
      const rapid = isRapidScanSequence(hidBufferRef.current.intervals);
      hidBufferRef.current.chars = '';
      hidBufferRef.current.intervals = [];
      if (hidBufferRef.current.timer) {
        window.clearTimeout(hidBufferRef.current.timer);
        hidBufferRef.current.timer = null;
      }
      if (buf.length >= 2 && (!requireRapid || (rapid && buf.length >= 4))) {
        handleDepoBarcodeScan(buf, true);
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      const now = Date.now();
      const gap = now - hidBufferRef.current.lastTime;
      if (gap > 180) {
        hidBufferRef.current.chars = '';
        hidBufferRef.current.intervals = [];
      } else if (hidBufferRef.current.lastTime > 0 && e.key.length === 1) {
        hidBufferRef.current.intervals.push(gap);
      }
      hidBufferRef.current.lastTime = now;

      if (hidBufferRef.current.timer) {
        window.clearTimeout(hidBufferRef.current.timer);
        hidBufferRef.current.timer = null;
      }

      if (e.key === 'Enter' || e.key === 'Tab') {
        if (hidBufferRef.current.chars.trim().length >= 2) {
          e.preventDefault();
          flushHid(false);
        }
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        hidBufferRef.current.chars += e.key;
        hidBufferRef.current.timer = window.setTimeout(() => flushHid(true), 180);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      if (hidBufferRef.current.timer) {
        window.clearTimeout(hidBufferRef.current.timer);
        hidBufferRef.current.timer = null;
      }
    };
  });

  useEffect(() => {
    return () => {
      if (depoTimerRef.current) window.clearTimeout(depoTimerRef.current);
    };
  }, []);

  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const sPrice = parseFloat(salePrice) || 0;
    const bPrice = parseFloat(buyPrice) || 0;
    const iStock = parseInt(initialStock, 10) || 0;
    const mStock = parseInt(minStockAlert, 10) || settings.minStockThreshold || 5;

    if (editingProduct) {
      updateProduct(editingProduct.id, {
        name: name.trim(),
        barcode: barcode.trim(),
        salePrice: sPrice,
        buyPrice: bPrice,
        category,
        volume: volume.trim(),
        initialStock: iStock,
        minStockAlert: mStock,
        note: note.trim(),
        image: image || undefined,
      });
      showToast('success', `"${name.trim()}" yeniləndi.`);
    } else {
      addProduct({
        name: name.trim(),
        barcode: barcode.trim() || `476${Math.floor(10000 + Math.random() * 90000)}`,
        salePrice: sPrice,
        buyPrice: bPrice,
        category,
        volume: volume.trim(),
        initialStock: iStock,
        minStockAlert: mStock,
        note: note.trim(),
        image: image || undefined,
      });
      showToast('success', `"${name.trim()}" əlavə edildi.`);
    }

    setIsModalOpen(false);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCSVImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = event => {
        const text = event.target?.result as string;
        if (text) {
          const parsed = parseProductsCSV(text);
          let count = 0;
          parsed.forEach(p => {
            if (p.name) {
              addProduct({
                name: p.name,
                barcode: p.barcode || `476${Math.floor(10000 + Math.random() * 90000)}`,
                salePrice: p.salePrice || 1.0,
                buyPrice: p.buyPrice || 0.5,
                category: p.category || 'Ümumi',
                volume: p.volume || '',
                initialStock: p.initialStock || 50,
                minStockAlert: p.minStockAlert || 5,
                note: p.note || '',
              });
              count += 1;
            }
          });
          showToast('success', `${count} məhsul CSV-dən əlavə edildi.`);
        }
      };
      reader.readAsText(file);
    }
  };

  return (
    <div className="space-y-6 pb-12 max-w-7xl mx-auto">
      {/* Header and Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-zinc-200 dark:border-zinc-800">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-white tracking-tight flex items-center gap-2">
            <span>Məhsullar və Depo Qalığı</span>
            <span className="text-xs bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400 font-bold px-2 py-0.5 rounded-full border border-red-200 dark:border-red-800">
              {products.length} məhsul
            </span>
          </h2>
          <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
            Zal barındakı içki və məhsulların qiyməti, barkodu və aktiv sayı
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => exportProductsToCSV(products)}
            className="px-3 py-1.5 text-xs font-semibold bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Excel / CSV</span>
          </button>

          {isAdmin && (
            <label className="px-3 py-1.5 text-xs font-semibold bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm">
              <Upload className="w-3.5 h-3.5" />
              <span>CSV İdxal</span>
              <input type="file" accept=".csv" onChange={handleCSVImport} className="hidden" />
            </label>
          )}

          {isAdmin && (
            <button
              type="button"
              onClick={openCreateModal}
              style={{ backgroundColor: primaryColor }}
              className="px-4 py-1.5 text-xs font-bold text-white rounded-xl transition-all shadow-md hover:opacity-90 flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Yeni Məhsul</span>
            </button>
          )}
        </div>
      </div>

      {/* Depo Barkod Skaner Paneli (Axtarış + Tez Qalıq Düzəlişi) */}
      <div className="p-3 sm:p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-2.5">
        <div className="flex flex-col sm:flex-row gap-2">
          <form
            onSubmit={e => {
              e.preventDefault();
              unlockAudioContext();
              if (!depoScanCode.trim()) return;
              if (depoTimerRef.current) {
                window.clearTimeout(depoTimerRef.current);
                depoTimerRef.current = null;
              }
              handleDepoBarcodeScan(depoScanCode, true);
              setDepoScanCode('');
              depoIntervalsRef.current = { lastTime: 0, intervals: [] };
            }}
            className="relative flex-1"
          >
            <ScanBarcode className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-red-500" />
            <input
              type="text"
              value={depoScanCode}
              onChange={e => handleDepoInputChange(e.target.value)}
              onKeyDown={e => {
                if ((e.key === 'Enter' || e.key === 'Tab') && depoScanCode.trim()) {
                  e.preventDefault();
                  unlockAudioContext();
                  if (depoTimerRef.current) {
                    window.clearTimeout(depoTimerRef.current);
                    depoTimerRef.current = null;
                  }
                  handleDepoBarcodeScan(depoScanCode, true);
                  setDepoScanCode('');
                  depoIntervalsRef.current = { lastTime: 0, intervals: [] };
                }
              }}
              placeholder="Depoda barkod skan edin — axtarın və ya qalığı düzəldin..."
              aria-label="Depo barkod skaneri"
              className="w-full pl-10 pr-8 py-2 text-xs sm:text-sm font-mono rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            {depoScanCode && (
              <button
                type="button"
                onClick={() => setDepoScanCode('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </form>

          <button
            type="button"
            onClick={() => {
              unlockAudioContext();
              setScannerTarget(isAdmin ? 'adjust' : 'search');
              setIsScannerOpen(true);
            }}
            style={{ backgroundColor: primaryColor }}
            className="px-4 py-2 text-xs font-bold rounded-xl text-white hover:opacity-90 flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Camera className="w-4 h-4" />
            <span>{isAdmin ? 'Barkodla Tap / Düzəlt' : 'Barkod Axtar'}</span>
          </button>
        </div>

        {lastScannedBanner && (
          <div
            className={`p-2.5 rounded-xl border text-xs flex flex-wrap items-center justify-between gap-2 ${
              lastScannedBanner.status === 'found'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300'
            }`}
          >
            {lastScannedBanner.status === 'found' && lastScannedBanner.product ? (
              <>
                <div className="flex items-center gap-2 min-w-0">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span className="font-bold truncate">
                    {lastScannedBanner.product.name} ({lastScannedBanner.code})
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => openQuickAdjustModal(lastScannedBanner.product!)}
                      className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] flex items-center gap-1"
                    >
                      <SlidersHorizontal className="w-3 h-3" />
                      <span>Qalığı Düzəlt</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setLastScannedBanner(null);
                      setSearchQuery('');
                    }}
                    className="px-2 py-1 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 font-semibold text-[11px]"
                  >
                    Hamısını göstər
                  </button>
                </div>
              </>
            ) : (
              <>
                <span>
                  <strong>{lastScannedBanner.code}</strong> barkodu depoda tapılmadı.
                </span>
                <div className="flex items-center gap-2">
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        const codeToUse = lastScannedBanner.code;
                        openCreateModal();
                        setBarcode(codeToUse);
                        setLastScannedBanner(null);
                      }}
                      style={{ backgroundColor: primaryColor }}
                      className="px-2.5 py-1 rounded-lg text-white font-bold text-[11px] flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Bu barkodla yeni məhsul yarat</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setLastScannedBanner(null)}
                    className="p-1 text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex gap-2 flex-1">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && searchQuery.trim()) {
                  const matched = findProductByBarcode(products, searchQuery);
                  if (matched) {
                    e.preventDefault();
                    playAlertSound('success');
                    setLastScannedBanner({ status: 'found', code: matched.barcode, product: matched });
                  }
                }
              }}
              placeholder="Məhsul adı və ya barkod ilə axtar..."
              className="w-full pl-10 pr-8 py-2 text-xs sm:text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              unlockAudioContext();
              setScannerTarget('search');
              setIsScannerOpen(true);
            }}
            className="px-3 py-2 text-xs font-bold rounded-xl bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-1.5 whitespace-nowrap shrink-0"
            title="Barkod ilə məhsul axtar"
          >
            <Camera className="w-4 h-4 text-red-500" />
            <span className="hidden sm:inline">Barkod Axtar</span>
          </button>
        </div>

        {/* Category Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            style={selectedCategory === 'all' ? { backgroundColor: primaryColor } : undefined}
            className={`px-3 py-1.5 text-xs font-semibold rounded-xl whitespace-nowrap transition-colors ${
              selectedCategory === 'all'
                ? 'text-white font-bold shadow-sm'
                : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            Hamısı ({products.length})
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              style={selectedCategory === cat ? { backgroundColor: primaryColor } : undefined}
              className={`px-3 py-1.5 text-xs font-semibold rounded-xl whitespace-nowrap transition-colors ${
                selectedCategory === cat
                  ? 'text-white font-bold shadow-sm'
                  : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 hover:text-zinc-900 dark:hover:text-white'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Product Cards Grid */}
      {filteredProducts.length === 0 ? (
        <div className="py-16 text-center bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-3">
          <Package className="w-10 h-10 text-zinc-400 dark:text-zinc-600 mx-auto" />
          <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">
            Axtarışa uyğun məhsul tapılmadı.
          </p>
          {isAdmin && (
            <button
              type="button"
              onClick={openCreateModal}
              style={{ backgroundColor: primaryColor }}
              className="px-4 py-2 text-xs font-bold text-white rounded-xl shadow-md"
            >
              Yeni Məhsul Əlavə Et
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredProducts.map(product => {
            const stock = calculateProductStock(product, purchases, sales, settings.minStockThreshold);
            return (
              <div
                key={product.id}
                className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm hover:border-zinc-300 dark:hover:border-zinc-700 transition-all overflow-hidden flex flex-col justify-between"
              >
                <div>
                  <div className="relative aspect-[16/10] bg-zinc-100 dark:bg-zinc-950 flex items-center justify-center overflow-hidden border-b border-zinc-200 dark:border-zinc-800">
                    {product.image ? (
                      <img
                        src={product.image}
                        alt={product.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-zinc-500">
                        <Package className="w-8 h-8 text-red-500/80" />
                        <span className="text-[10px] mt-1 font-medium">{product.category}</span>
                      </div>
                    )}

                    {stock.isLowStock && (
                      <div className="absolute top-2 right-2 bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-md">
                        <AlertTriangle className="w-3 h-3" />
                        <span>Kritik ({stock.activeStock})</span>
                      </div>
                    )}

                    {product.volume && (
                      <div className="absolute bottom-2 left-2 bg-black/80 backdrop-blur-xs text-white text-[10px] font-mono px-2 py-0.5 rounded-md">
                        {product.volume}
                      </div>
                    )}
                  </div>

                  {/* Body Content */}
                  <div className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-1">
                      <h3 className="text-sm font-bold text-zinc-900 dark:text-white leading-snug">
                        {product.name}
                      </h3>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 font-mono">
                      <Barcode className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" />
                      <span>{product.barcode}</span>
                    </div>

                    {/* Stock & Prices */}
                    <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-[10px] text-zinc-500 block uppercase">Satış Qiyməti</span>
                        <span className="font-mono font-bold text-red-600 dark:text-red-400 text-sm">
                          {formatAZN(product.salePrice)}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-zinc-500 block uppercase">Aktiv Qalıq</span>
                        <span className={`font-mono font-bold text-sm ${
                          stock.isLowStock ? 'text-red-600 dark:text-red-500 font-extrabold' : 'text-zinc-900 dark:text-white'
                        }`}>
                          {stock.activeStock} ədəd
                        </span>
                      </div>
                    </div>

                    {isAdmin && (
                      <div className="text-[11px] text-zinc-500 pt-1 flex justify-between">
                        <span>Alış: {formatAZN(product.buyPrice)}</span>
                        <span>İlkin: {product.initialStock} əd.</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Footer Actions */}
                {isAdmin && (
                  <div className="p-3 bg-zinc-50 dark:bg-zinc-950/80 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openEditModal(product)}
                        className="px-2 py-1 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white flex items-center gap-1 transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />
                        <span>Redaktə</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => openQuickAdjustModal(product)}
                        className="px-2 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline flex items-center gap-1 transition-colors"
                      >
                        <SlidersHorizontal className="w-3.5 h-3.5" />
                        <span>Qalıq</span>
                      </button>
                    </div>
                    {confirmDeleteId === product.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            deleteProduct(product.id);
                            setConfirmDeleteId(null);
                            showToast('success', `"${product.name}" silindi.`);
                          }}
                          className="px-2 py-0.5 text-[11px] font-bold bg-red-600 text-white rounded-md"
                        >
                          Sil
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2 py-0.5 text-[11px] font-semibold bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-md"
                        >
                          Ləğv et
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(product.id)}
                        className="px-2.5 py-1 text-xs font-semibold text-red-600 dark:text-red-400 hover:text-red-500 dark:hover:text-red-300 flex items-center gap-1 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Sil</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Depo Hərəkət Tarixçəsi (4 Kateqoriya: Adi satış, Balans çıxarışı, Mal qəbulu, Əl ilə düzəliş) */}
      <section className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-200 dark:border-zinc-800">
          <div>
            <h3 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <History className="w-4 h-4 text-red-500" />
              <span>Depo Hərəkət Tarixçəsi (4 Kateqoriya)</span>
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Adi satışlar, müştəri balansından çıxarışlar, anbara mal daxilolmaları və əl ilə depo düzəlişləri
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono tabular-nums">
            <span className="px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-bold">
              Adi satış: −{depoLedger.normalSaleOutQty} əd.
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-cyan-50 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800 font-bold">
              Balansdan: −{depoLedger.balanceProductOutQty} əd.
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-bold">
              Qəbul: +{depoLedger.purchaseInQty} əd.
            </span>
          </div>
        </div>

        {/* Category Filter Tabs & Search */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'all', label: `Hamısı (${depoLedger.movements.length})` },
                { id: 'normal_sale_out', label: `Adi satışdan çıxanlar (${depoLedger.counts.normal_sale_out})` },
                { id: 'balance_product_out', label: `Balansdan çıxanlar (${depoLedger.counts.balance_product_out})` },
                { id: 'purchase_in', label: `Anbara daxil olanlar (${depoLedger.counts.purchase_in})` },
                { id: 'manual_adjustment', label: `Əl ilə düzəlişlər (${depoLedger.counts.manual_adjustment})` },
              ] as const
            ).map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setDepoCategoryFilter(tab.id)}
                style={depoCategoryFilter === tab.id ? { backgroundColor: primaryColor } : undefined}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all whitespace-nowrap ${
                  depoCategoryFilter === tab.id
                    ? 'text-white shadow-xs'
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 sm:w-52">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                value={depoHistorySearch}
                onChange={e => setDepoHistorySearch(e.target.value)}
                placeholder="Məhsul, müştəri, qeyd..."
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white"
              />
            </div>
            <input
              type="date"
              value={depoHistoryDate}
              onChange={e => setDepoHistoryDate(e.target.value)}
              aria-label="Depo tarixçə tarixi"
              className="px-2.5 py-1.5 text-xs font-mono rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white"
            />
            {depoHistoryDate && (
              <button
                type="button"
                onClick={() => setDepoHistoryDate('')}
                className="p-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                title="Tarixi təmizlə"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Movements Table */}
        {filteredDepoMovements.length === 0 ? (
          <div className="py-10 text-center text-xs text-zinc-500">
            Seçilmiş filtr üzrə depo hərəkəti tapılmadı.
          </div>
        ) : (
          <div className="overflow-x-auto border border-zinc-200 dark:border-zinc-800 rounded-2xl">
            <table className="w-full text-left text-xs min-w-[780px]">
              <thead className="bg-zinc-50 dark:bg-zinc-950 text-[10px] uppercase tracking-wider text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                <tr>
                  <th className="py-2.5 px-3.5">Tarix & Saat</th>
                  <th className="py-2.5 px-3.5">Kateqoriya / Mənbə</th>
                  <th className="py-2.5 px-3.5">Məhsul</th>
                  <th className="py-2.5 px-3.5 text-right">Say Dəyişimi</th>
                  <th className="py-2.5 px-3.5 text-right">Məbləğ</th>
                  <th className="py-2.5 px-3.5">Müştəri / Qeyd</th>
                  <th className="py-2.5 px-3.5">Məsul</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {filteredDepoMovements.slice(0, 100).map(m => {
                  const isPositive = m.quantityDelta > 0;
                  let badgeCls = 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700';
                  if (m.movementType === 'balance_product_out') {
                    badgeCls = 'bg-cyan-50 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800';
                  } else if (m.movementType === 'purchase_in') {
                    badgeCls = 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800';
                  } else if (m.movementType === 'manual_adjustment') {
                    badgeCls = 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800';
                  }

                  return (
                    <tr key={m.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-950/60">
                      <td className="py-2.5 px-3.5 font-mono tabular-nums text-[11px] text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                        {formatDateAZ(m.date)} {m.time}
                      </td>
                      <td className="py-2.5 px-3.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold whitespace-nowrap ${badgeCls}`}>
                          {isPositive ? (
                            <ArrowDownLeft className="w-3 h-3" />
                          ) : (
                            <ArrowUpRight className="w-3 h-3" />
                          )}
                          <span>{m.sourceLabel}</span>
                        </span>
                      </td>
                      <td className="py-2.5 px-3.5 font-semibold text-zinc-900 dark:text-white">
                        {m.productName}
                      </td>
                      <td className={`py-2.5 px-3.5 text-right font-mono tabular-nums font-bold ${isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                        {isPositive ? `+${m.quantityDelta}` : m.quantityDelta} əd.
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-mono tabular-nums text-zinc-700 dark:text-zinc-300">
                        {m.totalAmount !== undefined ? formatAZN(m.totalAmount) : '—'}
                      </td>
                      <td className="py-2.5 px-3.5 text-[11px] text-zinc-600 dark:text-zinc-400 max-w-[220px] truncate">
                        {m.customerName ? (
                          <strong className="text-zinc-900 dark:text-zinc-200 mr-1">{m.customerName}</strong>
                        ) : null}
                        {m.note || '—'}
                      </td>
                      <td className="py-2.5 px-3.5 font-mono text-[11px] text-zinc-500">
                        @{m.createdBy || 'sistem'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-lg rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
              <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                {editingProduct ? 'Məhsulu Redaktə Et' : 'Yeni Məhsul Əlavə Et'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="p-6 overflow-y-auto space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                  Məhsulun Adı *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="məs: 0,5 L Su və ya Protein Şeyk"
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                  Barkod
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={barcode}
                    onChange={e => setBarcode(e.target.value)}
                    placeholder="Barkodu yazın və ya oxudun..."
                    className="flex-1 px-3.5 py-2 text-sm font-mono rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setScannerTarget('form');
                      setIsScannerOpen(true);
                    }}
                    style={{ backgroundColor: primaryColor }}
                    className="px-3.5 py-2 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shrink-0 transition-colors"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Oxut</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                    Satış Qiyməti (AZN) *
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    required
                    value={salePrice}
                    onChange={e => setSalePrice(e.target.value)}
                    placeholder="0.50"
                    className="w-full px-3.5 py-2 text-sm font-mono rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                    Alış Qiyməti (AZN)
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    value={buyPrice}
                    onChange={e => setBuyPrice(e.target.value)}
                    placeholder="0.25"
                    className="w-full px-3.5 py-2 text-sm font-mono rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                    Kateqoriya
                  </label>
                  <select
                    value={category}
                    onChange={e => setCategory(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                  >
                    <option value="Su">Su</option>
                    <option value="Protein">Protein</option>
                    <option value="Enerji və BCAA">Enerji və BCAA</option>
                    <option value="Qəlyanaltı">Qəlyanaltı</option>
                    <option value="Əlavələr">Əlavələr</option>
                    <option value="Digər">Digər</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                    Həcm / Qramaj
                  </label>
                  <input
                    type="text"
                    value={volume}
                    onChange={e => setVolume(e.target.value)}
                    placeholder="məs: 0.5 L, 60g"
                    className="w-full px-3.5 py-2 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                    İlkin Depo Qalığı
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={initialStock}
                    onChange={e => setInitialStock(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm font-mono rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                    Minimum Hədd (Xəbərdarlıq)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={minStockAlert}
                    onChange={e => setMinStockAlert(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm font-mono rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                  Şəkil (Qalereya və ya Kamera)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="w-full text-xs text-zinc-500 dark:text-zinc-400 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-zinc-100 dark:file:bg-zinc-800 file:text-zinc-800 dark:file:text-zinc-200 hover:file:bg-zinc-200 dark:hover:file:bg-zinc-700 cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                  Qeyd
                </label>
                <textarea
                  rows={2}
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="Əlavə qeydlər..."
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
                  Yadda Saxla
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Depo Stock & Price Adjustment Modal (on Barcode Scan or "Qalıq" click) */}
      {quickAdjustProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
              <div className="min-w-0">
                <h3 className="text-base font-bold text-zinc-900 dark:text-white truncate">
                  Depo Qalığını Düzəlt
                </h3>
                <p className="text-xs text-zinc-500 truncate">{quickAdjustProduct.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setQuickAdjustProduct(null)}
                className="p-1.5 text-zinc-400 hover:text-zinc-900 dark:hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveQuickAdjust} className="p-6 space-y-4">
              {(() => {
                const s = calculateProductStock(
                  quickAdjustProduct,
                  purchases,
                  sales,
                  settings.minStockThreshold
                );
                return (
                  <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-center text-xs">
                    <div>
                      <span className="text-[10px] text-zinc-500 block">Qəbul (+)</span>
                      <strong className="font-mono text-zinc-900 dark:text-white">{s.totalPurchased}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-zinc-500 block">Satış (-)</span>
                      <strong className="font-mono text-zinc-900 dark:text-white">{s.totalSold}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-zinc-500 block">Hazırkı Qalıq</span>
                      <strong className="font-mono text-red-600 dark:text-red-400">{s.activeStock}</strong>
                    </div>
                  </div>
                );
              })()}

              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1.5">
                  Yeni Faktiki Depo Qalığı (ədəd)
                </label>
                <input
                  type="number"
                  min="0"
                  required
                  value={targetActiveStock}
                  onChange={e => setTargetActiveStock(e.target.value)}
                  className="w-full px-4 py-2.5 text-lg font-mono font-black rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {[-5, -1, 1, 5, 10, 20].map(delta => (
                    <button
                      key={delta}
                      type="button"
                      onClick={() => {
                        const cur = parseInt(targetActiveStock, 10) || 0;
                        setTargetActiveStock(String(Math.max(0, cur + delta)));
                      }}
                      className={`px-2.5 py-1 text-xs font-mono font-bold rounded-lg border ${
                        delta > 0
                          ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                          : 'bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
                      }`}
                    >
                      {delta > 0 ? `+${delta}` : delta}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                  Barkod
                </label>
                <input
                  type="text"
                  value={quickBarcode}
                  onChange={e => setQuickBarcode(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm font-mono rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                    Satış Qiyməti (AZN)
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    value={quickSalePrice}
                    onChange={e => setQuickSalePrice(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm font-mono rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                    Alış Qiyməti (AZN)
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    value={quickBuyPrice}
                    onChange={e => setQuickBuyPrice(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm font-mono rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                  Düzəliş Səbəbi / Qeyd
                </label>
                <input
                  type="text"
                  value={quickAdjustNote}
                  onChange={e => setQuickAdjustNote(e.target.value)}
                  placeholder="məs: Sayım nəticəsi əl ilə düzəliş"
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white"
                />
              </div>

              <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const p = quickAdjustProduct;
                    setQuickAdjustProduct(null);
                    openEditModal(p);
                  }}
                  className="text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-white underline"
                >
                  Tam Redaktə
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setQuickAdjustProduct(null)}
                    className="px-4 py-2 text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-white rounded-xl"
                  >
                    Ləğv et
                  </button>
                  <button
                    type="submit"
                    style={{ backgroundColor: primaryColor }}
                    className="px-5 py-2 text-xs font-bold text-white rounded-xl shadow-md hover:opacity-90"
                  >
                    Qalığı Yadda Saxla
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Barcode Scanner Modal */}
      <BarcodeScannerModal
        isOpen={isScannerOpen}
        onClose={() => {
          setIsScannerOpen(false);
          setScannerTarget('search');
        }}
        onScan={code => {
          if (scannerTarget === 'form') {
            playAlertSound('beep');
            setBarcode(code);
          } else if (scannerTarget === 'adjust') {
            handleDepoBarcodeScan(code, true);
          } else {
            handleDepoBarcodeScan(code, false);
          }
          setScannerTarget('search');
        }}
        title={
          scannerTarget === 'adjust'
            ? 'Depo Qalığını Tap və Düzəlt'
            : scannerTarget === 'search'
            ? 'Barkod ilə Məhsul Tap'
            : 'Məhsul Barkodunu Oxut'
        }
      />
    </div>
  );
};
