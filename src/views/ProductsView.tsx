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
  Warehouse,
  LayoutGrid,
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
import { TablePagination } from '../components/TablePagination';
import { exportProductsToCSV, parseProductsCSV } from '../utils/exportUtils';

interface ProductsViewProps {
  initialSection?: 'catalog' | 'depo';
}

const DEPO_PAGE_SIZE = 15;

export const ProductsView: React.FC<ProductsViewProps> = ({ initialSection = 'catalog' }) => {
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
  const primaryColor = settings.primaryColor || '#E32636';

  const [activeSection, setActiveSection] = useState<'catalog' | 'depo'>(initialSection);
  useEffect(() => {
    setActiveSection(initialSection);
  }, [initialSection]);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerTarget, setScannerTarget] = useState<'form' | 'search' | 'adjust'>('search');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [depoStockSearch, setDepoStockSearch] = useState('');
  const [depoStockFilter, setDepoStockFilter] = useState<'all' | 'low'>('all');
  const [depoStockPage, setDepoStockPage] = useState(1);
  const [depoHistoryPage, setDepoHistoryPage] = useState(1);

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

  const depoStockRows = useMemo(() => {
    const q = depoStockSearch.trim().toLowerCase();
    return products
      .map(p => ({
        product: p,
        stock: calculateProductStock(p, purchases, sales, settings.minStockThreshold),
      }))
      .filter(({ product, stock }) => {
        if (depoStockFilter === 'low' && !stock.isLowStock) return false;
        if (q) {
          return (
            product.name.toLowerCase().includes(q) ||
            product.barcode.toLowerCase().includes(q) ||
            (product.category || '').toLowerCase().includes(q)
          );
        }
        return true;
      });
  }, [products, purchases, sales, settings.minStockThreshold, depoStockSearch, depoStockFilter]);

  useEffect(() => {
    setDepoStockPage(1);
  }, [depoStockSearch, depoStockFilter]);

  const depoStockTotalPages = Math.max(1, Math.ceil(depoStockRows.length / DEPO_PAGE_SIZE));
  const safeDepoStockPage = Math.min(depoStockPage, depoStockTotalPages);
  const paginatedDepoStockRows = depoStockRows.slice(
    (safeDepoStockPage - 1) * DEPO_PAGE_SIZE,
    safeDepoStockPage * DEPO_PAGE_SIZE
  );

  const lowStockCount = useMemo(
    () =>
      products.filter(
        p => calculateProductStock(p, purchases, sales, settings.minStockThreshold).isLowStock
      ).length,
    [products, purchases, sales, settings.minStockThreshold]
  );

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

  useEffect(() => {
    setDepoHistoryPage(1);
  }, [depoCategoryFilter, depoHistorySearch, depoHistoryDate]);

  const depoHistoryTotalPages = Math.max(1, Math.ceil(filteredDepoMovements.length / DEPO_PAGE_SIZE));
  const safeDepoHistoryPage = Math.min(depoHistoryPage, depoHistoryTotalPages);
  const paginatedDepoMovements = filteredDepoMovements.slice(
    (safeDepoHistoryPage - 1) * DEPO_PAGE_SIZE,
    safeDepoHistoryPage * DEPO_PAGE_SIZE
  );

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
      setDepoStockSearch(matched.barcode);
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
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[#E5E5E5] dark:border-[#262626]">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-[#171717] dark:text-white tracking-tight flex items-center gap-2.5">
            <span>{activeSection === 'depo' ? 'Depo İdarəetməsi və Hərəkətlər' : 'Məhsul Kataloqu'}</span>
            <span className="text-[11px] bg-[#E32636]/10 text-[#E32636] font-semibold px-2 py-0.5 rounded-[8px] border border-[#E32636]/20 whitespace-nowrap font-mono tabular-nums">
              {products.length} məhsul
            </span>
          </h2>
          <p className="text-xs sm:text-sm text-[#888888] mt-0.5">
            {activeSection === 'depo'
              ? 'Anbar qalığı, kritik stok xəbərdarlığı, barkodla düzəliş və 4 kateqoriyalı hərəkət tarixçəsi'
              : 'Zal barındakı içki və məhsulların qiyməti, barkodu və aktiv qalığı'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center p-1 bg-[#F5F5F5] dark:bg-[#222222] border border-[#E5E5E5] dark:border-[#262626] rounded-[10px]">
            <button
              type="button"
              onClick={() => setActiveSection('catalog')}
              style={activeSection === 'catalog' ? { backgroundColor: primaryColor } : undefined}
              className={`px-3 py-1.5 text-xs font-semibold rounded-[8px] transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                activeSection === 'catalog'
                  ? 'text-white shadow-xs'
                  : 'text-[#888888] hover:text-[#171717] dark:hover:text-white'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Məhsullar</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('depo')}
              style={activeSection === 'depo' ? { backgroundColor: primaryColor } : undefined}
              className={`px-3 py-1.5 text-xs font-semibold rounded-[8px] transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                activeSection === 'depo'
                  ? 'text-white shadow-xs'
                  : 'text-[#888888] hover:text-[#171717] dark:hover:text-white'
              }`}
            >
              <Warehouse className="w-3.5 h-3.5" />
              <span>Depo & Tarixçə</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => exportProductsToCSV(products)}
            className="px-3.5 py-2 text-xs font-semibold bg-white dark:bg-[#222222] border border-[#E5E5E5] dark:border-[#262626] hover:bg-[#F5F5F5] dark:hover:bg-[#2B2B2B] text-[#171717] dark:text-white rounded-[10px] transition-colors flex items-center gap-1.5 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5 text-[#888888]" />
            <span>Excel / CSV</span>
          </button>

          {isAdmin && (
            <label className="px-3.5 py-2 text-xs font-semibold bg-white dark:bg-[#222222] border border-[#E5E5E5] dark:border-[#262626] hover:bg-[#F5F5F5] dark:hover:bg-[#2B2B2B] text-[#171717] dark:text-white rounded-[10px] transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap">
              <Upload className="w-3.5 h-3.5 text-[#888888]" />
              <span>CSV İdxal</span>
              <input type="file" accept=".csv" onChange={handleCSVImport} className="hidden" />
            </label>
          )}

          {isAdmin && (
            <button
              type="button"
              onClick={openCreateModal}
              style={{ backgroundColor: primaryColor }}
              className="px-4 py-2 text-xs font-semibold text-white rounded-[10px] transition-all hover:opacity-90 flex items-center gap-1.5 whitespace-nowrap shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Yeni Məhsul</span>
            </button>
          )}
        </div>
      </div>

      {/* Depo Barkod Skaner Paneli */}
      <div className="p-3.5 sm:p-4 rounded-[14px] bg-white dark:bg-[#171717] border border-[#E5E5E5] dark:border-[#262626] space-y-2.5">
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
            <ScanBarcode className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#E32636]" />
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
              className="w-full pl-10 pr-8 py-2 text-xs sm:text-sm font-mono rounded-[10px] border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-white placeholder:text-[#888888] focus:outline-none focus:ring-2 focus:ring-[#E32636]"
            />
            {depoScanCode && (
              <button
                type="button"
                onClick={() => setDepoScanCode('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#888888] hover:text-[#171717] dark:hover:text-white"
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
            className="px-4 py-2 text-xs font-semibold rounded-[10px] text-white hover:opacity-90 flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Camera className="w-4 h-4" />
            <span>{isAdmin ? 'Barkodla Tap / Düzəlt' : 'Barkod Axtar'}</span>
          </button>
        </div>

        {lastScannedBanner && (
          <div
            className={`p-3 rounded-[10px] border text-xs flex flex-wrap items-center justify-between gap-2 ${
              lastScannedBanner.status === 'found'
                ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/70 text-emerald-800 dark:text-emerald-300'
                : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/70 text-amber-800 dark:text-amber-300'
            }`}
          >
            {lastScannedBanner.status === 'found' && lastScannedBanner.product ? (
              <>
                <div className="flex items-center gap-2 min-w-0">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span className="font-semibold truncate">
                    {lastScannedBanner.product.name} ({lastScannedBanner.code})
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => openQuickAdjustModal(lastScannedBanner.product!)}
                      className="px-2.5 py-1 rounded-[8px] bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[11px] flex items-center gap-1 whitespace-nowrap"
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
                      setDepoStockSearch('');
                    }}
                    className="px-2.5 py-1 rounded-[8px] bg-white dark:bg-[#222222] border border-[#E5E5E5] dark:border-[#2E2E2E] text-[#171717] dark:text-zinc-200 font-semibold text-[11px] whitespace-nowrap"
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
                      className="px-2.5 py-1 rounded-[8px] text-white font-semibold text-[11px] flex items-center gap-1 whitespace-nowrap"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Bu barkodla yeni məhsul yarat</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setLastScannedBanner(null)}
                    className="p-1 text-[#888888] hover:text-[#171717] dark:hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* SECTION: PRODUCT CATALOG */}
      {activeSection === 'catalog' && (
        <>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex gap-2 flex-1">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#888888]" />
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
                  className="w-full pl-10 pr-8 py-2 text-xs sm:text-sm rounded-[10px] border border-[#E5E5E5] dark:border-[#262626] bg-white dark:bg-[#171717] text-[#171717] dark:text-white placeholder:text-[#888888] focus:outline-none focus:ring-2 focus:ring-[#E32636]"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#888888] hover:text-[#171717] dark:hover:text-white"
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
                className="px-3.5 py-2 text-xs font-semibold rounded-[10px] bg-white dark:bg-[#222222] border border-[#E5E5E5] dark:border-[#262626] text-[#171717] dark:text-white hover:bg-[#F5F5F5] dark:hover:bg-[#2B2B2B] flex items-center gap-1.5 whitespace-nowrap shrink-0"
                title="Barkod ilə məhsul axtar"
              >
                <Camera className="w-4 h-4 text-[#E32636]" />
                <span className="hidden sm:inline">Barkod Axtar</span>
              </button>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              <button
                type="button"
                onClick={() => setSelectedCategory('all')}
                style={selectedCategory === 'all' ? { backgroundColor: primaryColor } : undefined}
                className={`px-3 py-1.5 text-xs font-semibold rounded-[10px] whitespace-nowrap transition-colors ${
                  selectedCategory === 'all'
                    ? 'text-white shadow-xs'
                    : 'bg-white dark:bg-[#171717] text-[#888888] border border-[#E5E5E5] dark:border-[#262626] hover:text-[#171717] dark:hover:text-white'
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
                  className={`px-3 py-1.5 text-xs font-semibold rounded-[10px] whitespace-nowrap transition-colors ${
                    selectedCategory === cat
                      ? 'text-white shadow-xs'
                      : 'bg-white dark:bg-[#171717] text-[#888888] border border-[#E5E5E5] dark:border-[#262626] hover:text-[#171717] dark:hover:text-white'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {filteredProducts.length === 0 ? (
            <div className="py-16 text-center bg-white dark:bg-[#171717] rounded-[14px] border border-[#E5E5E5] dark:border-[#262626] space-y-3">
              <Package className="w-10 h-10 text-[#888888] mx-auto" />
              <p className="text-sm font-medium text-[#888888]">
                Axtarışa uyğun məhsul tapılmadı.
              </p>
              {isAdmin && (
                <button
                  type="button"
                  onClick={openCreateModal}
                  style={{ backgroundColor: primaryColor }}
                  className="px-4 py-2 text-xs font-semibold text-white rounded-[10px]"
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
                    className="bg-white dark:bg-[#171717] rounded-[14px] border border-[#E5E5E5] dark:border-[#262626] hover:border-[#D4D4D4] dark:hover:border-[#363636] transition-colors overflow-hidden flex flex-col justify-between"
                  >
                    <div>
                      <div className="relative aspect-[16/10] bg-[#F5F5F5] dark:bg-[#141414] flex items-center justify-center overflow-hidden border-b border-[#E5E5E5] dark:border-[#262626]">
                        {product.image ? (
                          <img
                            src={product.image}
                            alt={product.name}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center text-[#888888]">
                            <Package className="w-8 h-8 text-[#E32636]/75" />
                            <span className="text-[10px] mt-1 font-medium">{product.category}</span>
                          </div>
                        )}

                        {stock.isLowStock && (
                          <div className="absolute top-2.5 right-2.5 bg-[#E32636] text-white text-[10px] font-semibold px-2 py-0.5 rounded-[8px] flex items-center gap-1 shadow-xs font-mono tabular-nums">
                            <AlertTriangle className="w-3 h-3" />
                            <span>Kritik ({stock.activeStock})</span>
                          </div>
                        )}

                        {product.volume && (
                          <div className="absolute bottom-2.5 left-2.5 bg-black/80 text-white text-[10px] font-mono px-2 py-0.5 rounded-[8px]">
                            {product.volume}
                          </div>
                        )}
                      </div>

                      <div className="p-4 space-y-2">
                        <h3 className="text-sm font-semibold text-[#171717] dark:text-white leading-snug">
                          {product.name}
                        </h3>

                        <div className="flex items-center gap-1.5 text-xs text-[#888888] font-mono">
                          <Barcode className="w-3.5 h-3.5 text-[#888888]" />
                          <span>{product.barcode}</span>
                        </div>

                        <div className="pt-2.5 border-t border-[#E5E5E5] dark:border-[#262626] grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-[10px] text-[#888888] block uppercase font-medium">
                              Satış Qiyməti
                            </span>
                            <span className="font-mono tabular-nums font-bold text-[#E32636] text-sm">
                              {formatAZN(product.salePrice)}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] text-[#888888] block uppercase font-medium">
                              Aktiv Qalıq
                            </span>
                            <span
                              className={`font-mono tabular-nums font-bold text-sm ${
                                stock.isLowStock ? 'text-[#E32636]' : 'text-[#171717] dark:text-white'
                              }`}
                            >
                              {stock.activeStock} ədəd
                            </span>
                          </div>
                        </div>

                        {isAdmin && (
                          <div className="text-[11px] text-[#888888] pt-1 flex justify-between font-mono tabular-nums">
                            <span>Alış: {formatAZN(product.buyPrice)}</span>
                            <span>İlkin: {product.initialStock} əd.</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {isAdmin && (
                      <div className="px-3.5 py-2.5 bg-[#FAFAFA] dark:bg-[#141414] border-t border-[#E5E5E5] dark:border-[#262626] flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openEditModal(product)}
                            className="px-2 py-1 text-xs font-medium text-[#171717] dark:text-zinc-300 hover:bg-[#F5F5F5] dark:hover:bg-[#222222] rounded-[8px] flex items-center gap-1 transition-colors"
                          >
                            <Edit2 className="w-3.5 h-3.5 text-[#888888]" />
                            <span>Redaktə</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => openQuickAdjustModal(product)}
                            className="px-2 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 rounded-[8px] flex items-center gap-1 transition-colors"
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
                              className="px-2 py-0.5 text-[11px] font-semibold bg-[#E32636] text-white rounded-[8px]"
                            >
                              Sil
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2 py-0.5 text-[11px] font-medium bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-zinc-300 border border-[#E5E5E5] dark:border-[#2E2E2E] rounded-[8px]"
                            >
                              Ləğv
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(product.id)}
                            className="px-2 py-1 text-xs font-medium text-[#E32636] hover:bg-[#E32636]/10 rounded-[8px] flex items-center gap-1 transition-colors"
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
        </>
      )}

      {/* SECTION: DEPO STOCK TABLE */}
      {activeSection === 'depo' && (
        <section className="bg-white dark:bg-[#171717] rounded-[14px] border border-[#E5E5E5] dark:border-[#262626] overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-[#E5E5E5] dark:border-[#262626] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-[#171717] dark:text-white flex items-center gap-2">
                <Warehouse className="w-4 h-4 text-[#E32636]" />
                <span>Depodakı Məhsul Qalıqları</span>
              </h3>
              <p className="text-xs text-[#888888] mt-0.5">
                Hər məhsul üzrə ilkin say, qəbul, satış və faktiki aktiv depo qalığı
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#888888]" />
                <input
                  type="text"
                  value={depoStockSearch}
                  onChange={e => setDepoStockSearch(e.target.value)}
                  placeholder="Ad və ya barkod..."
                  className="pl-8 pr-3 py-1.5 text-xs rounded-[10px] border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-white placeholder:text-[#888888] focus:outline-none focus:ring-2 focus:ring-[#E32636]"
                />
              </div>
              <button
                type="button"
                onClick={() => setDepoStockFilter('all')}
                style={depoStockFilter === 'all' ? { backgroundColor: primaryColor } : undefined}
                className={`px-3 py-1.5 text-xs font-semibold rounded-[10px] whitespace-nowrap transition-colors ${
                  depoStockFilter === 'all'
                    ? 'text-white shadow-xs'
                    : 'bg-[#F5F5F5] dark:bg-[#222222] text-[#888888] border border-[#E5E5E5] dark:border-[#262626] hover:text-[#171717] dark:hover:text-white'
                }`}
              >
                Hamısı ({products.length})
              </button>
              <button
                type="button"
                onClick={() => setDepoStockFilter('low')}
                style={depoStockFilter === 'low' ? { backgroundColor: primaryColor } : undefined}
                className={`px-3 py-1.5 text-xs font-semibold rounded-[10px] whitespace-nowrap transition-colors ${
                  depoStockFilter === 'low'
                    ? 'text-white shadow-xs'
                    : 'bg-[#F5F5F5] dark:bg-[#222222] text-[#E32636] border border-[#E32636]/25'
                }`}
              >
                Kritik Qalıq ({lowStockCount})
              </button>
            </div>
          </div>

          {depoStockRows.length === 0 ? (
            <div className="py-10 text-center text-xs text-[#888888]">
              Axtarışa uyğun depo qalığı tapılmadı.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs min-w-[740px]">
                  <thead className="bg-[#FAFAFA] dark:bg-[#141414] text-[10px] uppercase tracking-wider text-[#888888] border-b border-[#E5E5E5] dark:border-[#262626] font-semibold">
                    <tr>
                      <th className="py-3 px-4">Məhsul</th>
                      <th className="py-3 px-4">Barkod</th>
                      <th className="py-3 px-4 text-right">Satış Qiyməti</th>
                      <th className="py-3 px-4 text-right">İlkin</th>
                      <th className="py-3 px-4 text-right">Qəbul (+)</th>
                      <th className="py-3 px-4 text-right">Satış (−)</th>
                      <th className="py-3 px-4 text-right">Aktiv Qalıq</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      {isAdmin && <th className="py-3 px-4 text-center">Düzəliş</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E5E5] dark:divide-[#262626]">
                    {paginatedDepoStockRows.map(({ product, stock }) => (
                      <tr key={product.id} className="hover:bg-[#FAFAFA] dark:hover:bg-[#222222]/50 transition-colors">
                        <td className="py-3 px-4 font-semibold text-[#171717] dark:text-white">
                          {product.name}
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-[#888888]">
                          {product.barcode}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-[#171717] dark:text-white">
                          {formatAZN(product.salePrice)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-[#888888]">
                          {product.initialStock}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                          +{stock.totalPurchased}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-[#888888]">
                          −{stock.totalSold}
                        </td>
                        <td
                          className={`py-3 px-4 text-right font-mono tabular-nums font-bold ${
                            stock.isLowStock ? 'text-[#E32636]' : 'text-[#171717] dark:text-white'
                          }`}
                        >
                          {stock.activeStock} əd.
                        </td>
                        <td className="py-3 px-4 text-center">
                          {stock.isLowStock ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[8px] bg-[#E32636]/10 text-[#E32636] border border-[#E32636]/20 text-[10px] font-semibold whitespace-nowrap">
                              Kritik
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[8px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[10px] font-semibold whitespace-nowrap">
                              Normal
                            </span>
                          )}
                        </td>
                        {isAdmin && (
                          <td className="py-3 px-4 text-center">
                            <button
                              type="button"
                              onClick={() => openQuickAdjustModal(product)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[8px] bg-[#F5F5F5] dark:bg-[#222222] border border-[#E5E5E5] dark:border-[#2E2E2E] hover:border-[#E32636]/50 text-[#171717] dark:text-white text-[11px] font-semibold whitespace-nowrap transition-colors"
                            >
                              <SlidersHorizontal className="w-3 h-3 text-[#E32636]" />
                              <span>Düzəlt</span>
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <TablePagination
                totalItems={depoStockRows.length}
                pageSize={DEPO_PAGE_SIZE}
                currentPage={safeDepoStockPage}
                onPageChange={setDepoStockPage}
                primaryColor={primaryColor}
              />
            </>
          )}
        </section>
      )}

      {/* Depo Hərəkət Tarixçəsi (4 Kateqoriya) */}
      <section className="bg-white dark:bg-[#171717] rounded-[14px] border border-[#E5E5E5] dark:border-[#262626] overflow-hidden">
        <div className="p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#E5E5E5] dark:border-[#262626]">
            <div>
              <h3 className="text-base font-bold text-[#171717] dark:text-white flex items-center gap-2">
                <History className="w-4 h-4 text-[#E32636]" />
                <span>Depo Hərəkət Tarixçəsi (4 Kateqoriya)</span>
              </h3>
              <p className="text-xs text-[#888888] mt-0.5">
                Adi satışlar, müştəri balansından çıxarışlar, anbara mal daxilolmaları və əl ilə depo düzəlişləri
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono tabular-nums">
              <span className="px-2.5 py-1 rounded-[8px] bg-[#F5F5F5] dark:bg-[#222222] border border-[#E5E5E5] dark:border-[#262626] text-[#171717] dark:text-zinc-200 font-semibold">
                Adi satış: −{depoLedger.normalSaleOutQty} əd.
              </span>
              <span className="px-2.5 py-1 rounded-[8px] bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border border-cyan-500/20 font-semibold">
                Balansdan: −{depoLedger.balanceProductOutQty} əd.
              </span>
              <span className="px-2.5 py-1 rounded-[8px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 font-semibold">
                Qəbul: +{depoLedger.purchaseInQty} əd.
              </span>
            </div>
          </div>

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
                  className={`px-3 py-1.5 text-xs font-semibold rounded-[10px] transition-all whitespace-nowrap ${
                    depoCategoryFilter === tab.id
                      ? 'text-white shadow-xs'
                      : 'bg-[#F5F5F5] dark:bg-[#222222] text-[#888888] border border-[#E5E5E5] dark:border-[#262626] hover:text-[#171717] dark:hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 sm:w-52">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#888888]" />
                <input
                  type="text"
                  value={depoHistorySearch}
                  onChange={e => setDepoHistorySearch(e.target.value)}
                  placeholder="Məhsul, müştəri, qeyd..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-[10px] border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-white placeholder:text-[#888888] focus:outline-none focus:ring-2 focus:ring-[#E32636]"
                />
              </div>
              <input
                type="date"
                value={depoHistoryDate}
                onChange={e => setDepoHistoryDate(e.target.value)}
                aria-label="Depo tarixçə tarixi"
                className="px-2.5 py-1.5 text-xs font-mono rounded-[10px] border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-white"
              />
              {depoHistoryDate && (
                <button
                  type="button"
                  onClick={() => setDepoHistoryDate('')}
                  className="p-1.5 rounded-[10px] border border-[#E5E5E5] dark:border-[#262626] text-[#888888] hover:text-[#171717] dark:hover:text-white"
                  title="Tarixi təmizlə"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {filteredDepoMovements.length === 0 ? (
          <div className="py-10 text-center text-xs text-[#888888] border-t border-[#E5E5E5] dark:border-[#262626]">
            Seçilmiş filtr üzrə depo hərəkəti tapılmadı.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto border-t border-[#E5E5E5] dark:border-[#262626]">
              <table className="w-full text-left text-xs min-w-[780px]">
                <thead className="bg-[#FAFAFA] dark:bg-[#141414] text-[10px] uppercase tracking-wider text-[#888888] border-b border-[#E5E5E5] dark:border-[#262626] font-semibold">
                  <tr>
                    <th className="py-2.5 px-4">Tarix & Saat</th>
                    <th className="py-2.5 px-4">Kateqoriya / Mənbə</th>
                    <th className="py-2.5 px-4">Məhsul</th>
                    <th className="py-2.5 px-4 text-right">Say Dəyişimi</th>
                    <th className="py-2.5 px-4 text-right">Məbləğ</th>
                    <th className="py-2.5 px-4">Müştəri / Qeyd</th>
                    <th className="py-2.5 px-4">Məsul</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E5E5] dark:divide-[#262626]">
                  {paginatedDepoMovements.map(m => {
                    const isPositive = m.quantityDelta > 0;
                    let badgeCls =
                      'bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-zinc-300 border-[#E5E5E5] dark:border-[#2E2E2E]';
                    if (m.movementType === 'balance_product_out') {
                      badgeCls = 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/20';
                    } else if (m.movementType === 'purchase_in') {
                      badgeCls = 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20';
                    } else if (m.movementType === 'manual_adjustment') {
                      badgeCls = 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20';
                    }

                    return (
                      <tr key={m.id} className="hover:bg-[#FAFAFA] dark:hover:bg-[#222222]/50 transition-colors">
                        <td className="py-2.5 px-4 font-mono tabular-nums text-[11px] text-[#888888] whitespace-nowrap">
                          {formatDateAZ(m.date)} {m.time}
                        </td>
                        <td className="py-2.5 px-4">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-[8px] border text-[10px] font-semibold whitespace-nowrap ${badgeCls}`}
                          >
                            {isPositive ? (
                              <ArrowDownLeft className="w-3 h-3" />
                            ) : (
                              <ArrowUpRight className="w-3 h-3" />
                            )}
                            <span>{m.sourceLabel}</span>
                          </span>
                        </td>
                        <td className="py-2.5 px-4 font-semibold text-[#171717] dark:text-white">
                          {m.productName}
                        </td>
                        <td
                          className={`py-2.5 px-4 text-right font-mono tabular-nums font-bold ${
                            isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-[#E32636]'
                          }`}
                        >
                          {isPositive ? `+${m.quantityDelta}` : m.quantityDelta} əd.
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-[#171717] dark:text-zinc-200">
                          {m.totalAmount !== undefined ? formatAZN(m.totalAmount) : '—'}
                        </td>
                        <td className="py-2.5 px-4 text-[11px] text-[#888888] max-w-[220px] truncate">
                          {m.customerName ? (
                            <strong className="text-[#171717] dark:text-zinc-200 mr-1">
                              {m.customerName}
                            </strong>
                          ) : null}
                          {m.note || '—'}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-[11px] text-[#888888]">
                          @{m.createdBy || 'sistem'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <TablePagination
              totalItems={filteredDepoMovements.length}
              pageSize={DEPO_PAGE_SIZE}
              currentPage={safeDepoHistoryPage}
              onPageChange={setDepoHistoryPage}
              primaryColor={primaryColor}
            />
          </>
        )}
      </section>

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-[#171717] w-full max-w-lg rounded-[14px] shadow-2xl border border-[#E5E5E5] dark:border-[#262626] overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E5E5] dark:border-[#262626]">
              <h3 className="text-base font-bold text-[#171717] dark:text-white">
                {editingProduct ? 'Məhsulu Redaktə Et' : 'Yeni Məhsul Əlavə Et'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-[#888888] hover:text-[#171717] dark:hover:text-white rounded-[8px]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="p-6 overflow-y-auto space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-[#888888] uppercase tracking-wider mb-1.5">
                  Məhsulun Adı *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="məs: 0,5 L Su və ya Protein Şeyk"
                  className="w-full px-3.5 py-2.5 text-sm rounded-[10px] border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#E32636]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#888888] uppercase tracking-wider mb-1.5">
                  Barkod
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={barcode}
                    onChange={e => setBarcode(e.target.value)}
                    placeholder="Barkodu yazın və ya oxudun..."
                    className="flex-1 px-3.5 py-2.5 text-sm font-mono rounded-[10px] border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#E32636]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setScannerTarget('form');
                      setIsScannerOpen(true);
                    }}
                    style={{ backgroundColor: primaryColor }}
                    className="px-3.5 py-2.5 text-white font-semibold text-xs rounded-[10px] flex items-center gap-1.5 shrink-0 transition-opacity hover:opacity-90"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Oxut</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[#888888] uppercase tracking-wider mb-1.5">
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
                    className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums rounded-[10px] border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#E32636]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#888888] uppercase tracking-wider mb-1.5">
                    Alış Qiyməti (AZN)
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    value={buyPrice}
                    onChange={e => setBuyPrice(e.target.value)}
                    placeholder="0.25"
                    className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums rounded-[10px] border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#E32636]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[#888888] uppercase tracking-wider mb-1.5">
                    Kateqoriya
                  </label>
                  <select
                    value={category}
                    onChange={e => setCategory(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm rounded-[10px] border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#E32636]"
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
                  <label className="block text-[11px] font-semibold text-[#888888] uppercase tracking-wider mb-1.5">
                    Həcm / Qramaj
                  </label>
                  <input
                    type="text"
                    value={volume}
                    onChange={e => setVolume(e.target.value)}
                    placeholder="məs: 0.5 L, 60g"
                    className="w-full px-3.5 py-2.5 text-sm rounded-[10px] border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#E32636]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[#888888] uppercase tracking-wider mb-1.5">
                    İlkin Depo Qalığı
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={initialStock}
                    onChange={e => setInitialStock(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums rounded-[10px] border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#E32636]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#888888] uppercase tracking-wider mb-1.5">
                    Minimum Hədd (Xəbərdarlıq)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={minStockAlert}
                    onChange={e => setMinStockAlert(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums rounded-[10px] border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#E32636]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#888888] uppercase tracking-wider mb-1.5">
                  Şəkil (Qalereya və ya Kamera)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="w-full text-xs text-[#888888] file:mr-3 file:py-2 file:px-3 file:rounded-[10px] file:border-0 file:text-xs file:font-semibold file:bg-[#F5F5F5] dark:file:bg-[#222222] file:text-[#171717] dark:file:text-white cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#888888] uppercase tracking-wider mb-1.5">
                  Qeyd
                </label>
                <textarea
                  rows={2}
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="Əlavə qeydlər..."
                  className="w-full px-3.5 py-2.5 text-sm rounded-[10px] border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#E32636]"
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
                  Yadda Saxla
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Depo Stock & Price Adjustment Modal */}
      {quickAdjustProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#171717] w-full max-w-md rounded-[14px] shadow-2xl border border-[#E5E5E5] dark:border-[#262626] overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E5E5] dark:border-[#262626]">
              <div className="min-w-0">
                <h3 className="text-base font-bold text-[#171717] dark:text-white truncate">
                  Depo Qalığını Düzəlt
                </h3>
                <p className="text-xs text-[#888888] truncate">{quickAdjustProduct.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setQuickAdjustProduct(null)}
                className="p-1.5 text-[#888888] hover:text-[#171717] dark:hover:text-white rounded-[8px]"
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
                  <div className="grid grid-cols-3 gap-2 p-3 rounded-[10px] bg-[#FAFAFA] dark:bg-[#222222] border border-[#E5E5E5] dark:border-[#262626] text-center text-xs">
                    <div>
                      <span className="text-[10px] text-[#888888] block">Qəbul (+)</span>
                      <strong className="font-mono tabular-nums text-[#171717] dark:text-white">{s.totalPurchased}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-[#888888] block">Satış (-)</span>
                      <strong className="font-mono tabular-nums text-[#171717] dark:text-white">{s.totalSold}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-[#888888] block">Hazırkı Qalıq</span>
                      <strong className="font-mono tabular-nums text-[#E32636]">{s.activeStock}</strong>
                    </div>
                  </div>
                );
              })()}

              <div>
                <label className="block text-[11px] font-semibold text-[#888888] uppercase tracking-wider mb-1.5">
                  Yeni Faktiki Depo Qalığı (ədəd)
                </label>
                <input
                  type="number"
                  min="0"
                  required
                  value={targetActiveStock}
                  onChange={e => setTargetActiveStock(e.target.value)}
                  className="w-full px-4 py-2.5 text-lg font-mono tabular-nums font-bold rounded-[10px] border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#E32636]"
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
                      className={`px-2.5 py-1 text-xs font-mono font-semibold rounded-[8px] border ${
                        delta > 0
                          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                          : 'bg-[#E32636]/10 border-[#E32636]/20 text-[#E32636]'
                      }`}
                    >
                      {delta > 0 ? `+${delta}` : delta}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#888888] uppercase tracking-wider mb-1.5">
                  Barkod
                </label>
                <input
                  type="text"
                  value={quickBarcode}
                  onChange={e => setQuickBarcode(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm font-mono rounded-[10px] border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[#888888] uppercase tracking-wider mb-1.5">
                    Satış Qiyməti (AZN)
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    value={quickSalePrice}
                    onChange={e => setQuickSalePrice(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm font-mono tabular-nums rounded-[10px] border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#888888] uppercase tracking-wider mb-1.5">
                    Alış Qiyməti (AZN)
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    value={quickBuyPrice}
                    onChange={e => setQuickBuyPrice(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm font-mono tabular-nums rounded-[10px] border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#888888] uppercase tracking-wider mb-1.5">
                  Düzəliş Səbəbi / Qeyd
                </label>
                <input
                  type="text"
                  value={quickAdjustNote}
                  onChange={e => setQuickAdjustNote(e.target.value)}
                  placeholder="məs: Sayım nəticəsi əl ilə düzəliş"
                  className="w-full px-3.5 py-2 text-xs rounded-[10px] border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-white"
                />
              </div>

              <div className="pt-3 border-t border-[#E5E5E5] dark:border-[#262626] flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const p = quickAdjustProduct;
                    setQuickAdjustProduct(null);
                    openEditModal(p);
                  }}
                  className="text-xs font-semibold text-[#888888] hover:text-[#171717] dark:hover:text-white underline"
                >
                  Tam Redaktə
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setQuickAdjustProduct(null)}
                    className="px-4 py-2 text-xs font-semibold text-[#888888] hover:text-[#171717] dark:hover:text-white rounded-[10px]"
                  >
                    Ləğv et
                  </button>
                  <button
                    type="submit"
                    style={{ backgroundColor: primaryColor }}
                    className="px-5 py-2 text-xs font-semibold text-white rounded-[10px] hover:opacity-90"
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
