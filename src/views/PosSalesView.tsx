import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  Camera,
  Search,
  CreditCard,
  Banknote,
  Smartphone,
  BookOpen,
  CheckCircle,
  Calendar,
  Check,
  User,
  Phone,
  Download,
  Wallet,
  Coins,
  X,
  Clock,
  Tag,
  Edit3,
  AlertTriangle,
  ScanBarcode,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { PaymentType, Product, Sale } from '../types';
import {
  formatAZN,
  formatDateAZ,
  getTodayISODate,
  getCurrentTimeHHMM,
  getCurrentMonthKey,
  getMonthLabelAZ,
} from '../utils/dateUtils';
import { calculateProductStock } from '../utils/stockCalculations';
import { calculateFinancialMetricsForRange, checkCustomerDebt } from '../utils/financialCalculations';
import {
  findProductByBarcode,
  hasLongerBarcodePrefix,
  isRapidScanSequence,
  normalizeBarcode,
} from '../utils/barcodeUtils';
import { playAlertSound, unlockAudioContext } from '../utils/notificationUtils';
import { BarcodeScannerModal } from '../components/BarcodeScannerModal';
import { DebtWarningModal } from '../components/DebtWarningModal';
import { exportSalesToCSV } from '../utils/exportUtils';

interface CartItem {
  product: Product;
  quantity: number;
}

export const PosSalesView: React.FC<{ onNavigateToDebts?: () => void }> = ({ onNavigateToDebts }) => {
  const {
    products,
    purchases,
    expenses,
    sales,
    debts,
    customerAccounts,
    depositToCustomer,
    addSale,
    updateSaleDate,
    confirmSale,
    confirmDaySales,
    deleteSale,
    currentUser,
    settings,
    showToast,
  } = useApp();

  const isAdmin = currentUser?.role === 'admin';
  const primaryColor = settings.primaryColor || '#dc2626';
  const todayISO = getTodayISODate();

  // POS State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentType, setPaymentType] = useState<PaymentType>('naqd');
  const [debtorName, setDebtorName] = useState('');
  const [debtorPhone, setDebtorPhone] = useState('');
  const [discountInput, setDiscountInput] = useState('');
  const [selectedCustomerAccount, setSelectedCustomerAccount] = useState<string>('Əli');
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [depositName, setDepositName] = useState('');
  const [depositAmount, setDepositAmount] = useState<number>(10);
  const [depositPaymentType, setDepositPaymentType] = useState<'naqd' | 'kart' | 'pos'>('naqd');
  const [depositNote, setDepositNote] = useState('');
  const [customDate, setCustomDate] = useState(todayISO);
  const [customTime, setCustomTime] = useState(getCurrentTimeHHMM());
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [scannerFocusLock, setScannerFocusLock] = useState(false);
  const [lastScanFeedback, setLastScanFeedback] = useState<{
    status: 'success' | 'error';
    message: string;
    barcode: string;
  } | null>(null);
  const scannerInputRef = useRef<HTMLInputElement | null>(null);
  const scannerAutoTimerRef = useRef<number | null>(null);
  const scannerIntervalsRef = useRef<{ lastTime: number; intervals: number[] }>({
    lastTime: 0,
    intervals: [],
  });
  const searchIntervalsRef = useRef<{ lastTime: number; intervals: number[] }>({
    lastTime: 0,
    intervals: [],
  });
  const searchAutoTimerRef = useRef<number | null>(null);
  const lastHandledScanRef = useRef<{ code: string; time: number }>({ code: '', time: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [confirmDeleteSaleId, setConfirmDeleteSaleId] = useState<string | null>(null);
  const [isSubmittingSale, setIsSubmittingSale] = useState(false);

  // Edit Sale Date Modal
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [editDateValue, setEditDateValue] = useState('');
  const [editTimeValue, setEditTimeValue] = useState('');

  // Debt warning modal state
  const [isDebtModalOpen, setIsDebtModalOpen] = useState(false);
  const [debtWarningDetails, setDebtWarningDetails] = useState<{
    name: string;
    amount: number;
  }>({ name: '', amount: 0 });
  const lastWarnedDebtorRef = useRef<string>('');

  // Sub-tabs
  const [activeSubTab, setActiveSubTab] = useState<'pos' | 'daily' | 'monthly'>('pos');
  const [filterStartDate, setFilterStartDate] = useState(todayISO);
  const [filterEndDate, setFilterEndDate] = useState(todayISO);
  const [filterProductId, setFilterProductId] = useState('all');
  const [filterPaymentType, setFilterPaymentType] = useState<'all' | PaymentType>('all');
  const [historySearch, setHistorySearch] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthKey());

  const categories = useMemo(
    () => Array.from(new Set(products.map(p => p.category || 'Ümumi'))),
    [products]
  );

  // Known debtor names & phones for quick autofill
  const knownDebtors = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of debts) {
      const n = d.debtorName.trim();
      if (n && !map.has(n)) {
        map.set(n, d.debtorPhone || '');
      }
    }
    return Array.from(map.entries()).map(([name, phone]) => ({ name, phone }));
  }, [debts]);

  const getAvailableStock = (product: Product): number => {
    return calculateProductStock(product, purchases, sales, settings.minStockThreshold).activeStock;
  };

  // Add product to cart with stock check
  const addToCart = (product: Product) => {
    const available = getAvailableStock(product);
    if (available <= 0) {
      showToast('error', `"${product.name}" anbarda bitib (Stok: ${available}).`);
      return;
    }

    const currentInCart = cart.find(item => item.product.id === product.id)?.quantity || 0;
    if (currentInCart + 1 > available) {
      showToast('error', `"${product.name}" üçün maksimum ${available} ədəd satıla bilər.`);
      return;
    }

    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        return prev.map(item =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const updateQuantity = (productId: string, delta: number) => {
    const prod = products.find(p => p.id === productId);
    const available = prod ? getAvailableStock(prod) : 99999;

    setCart(prev =>
      prev
        .map(item => {
          if (item.product.id === productId) {
            const newQty = item.quantity + delta;
            if (newQty <= 0) return null;
            if (delta > 0 && newQty > available) {
              showToast('error', `"${item.product.name}" anbarında cəmi ${available} ədəd mövcuddur.`);
              return item;
            }
            return { ...item, quantity: newQty };
          }
          return item;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.product.id !== productId));
  };

  const clearCart = () => {
    setCart([]);
    setDebtorName('');
    setDebtorPhone('');
    setDiscountInput('');
    setPaymentType('naqd');
    lastWarnedDebtorRef.current = '';
  };

  // Cart total calculations
  const cartSubtotal = Math.round(
    cart.reduce((sum, item) => sum + item.product.salePrice * item.quantity, 0) * 100
  ) / 100;
  const parsedDiscount = Math.max(0, Math.round((parseFloat(discountInput) || 0) * 100) / 100);
  const cartDiscount = Math.min(cartSubtotal, parsedDiscount);
  const cartFinalTotal = Math.max(0, Math.round((cartSubtotal - cartDiscount) * 100) / 100);
  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  // Check debtor name for existing debt + autofill phone
  const handleDebtorNameChange = (val: string) => {
    setDebtorName(val);
    const matchedKnown = knownDebtors.find(
      k => k.name.toLowerCase() === val.trim().toLowerCase() && k.phone
    );
    if (matchedKnown && !debtorPhone) {
      setDebtorPhone(matchedKnown.phone);
    }

    const trimmed = val.trim();
    if (trimmed.length >= 2) {
      const debtCheck = checkCustomerDebt(trimmed, debts);
      if (debtCheck.hasDebt && lastWarnedDebtorRef.current !== debtCheck.debtorName.toLowerCase()) {
        lastWarnedDebtorRef.current = debtCheck.debtorName.toLowerCase();
        setDebtWarningDetails({
          name: debtCheck.debtorName,
          amount: debtCheck.totalRemainingDebt,
        });
        setIsDebtModalOpen(true);
      }
    }
  };

  // Barcode scanned / submitted handler (shared across camera, scanner input, search box & global HID listener)
  const processScannedBarcode = (rawCode: string, source: 'camera' | 'scanner' | 'search' | 'hid' = 'scanner') => {
    const clean = normalizeBarcode(rawCode);
    if (!clean) return false;

    // Prevent double-triggering on rapid Enter + timer/change in the same 180ms window
    const now = Date.now();
    if (
      source !== 'camera' &&
      lastHandledScanRef.current.code === clean &&
      now - lastHandledScanRef.current.time < 180
    ) {
      return false;
    }
    lastHandledScanRef.current = { code: clean, time: now };

    const found = findProductByBarcode(products, clean);
    if (found) {
      const available = getAvailableStock(found);
      const currentInCart = cart.find(item => item.product.id === found.id)?.quantity || 0;
      addToCart(found);
      if (available <= 0 || currentInCart + 1 > available) {
        try {
          playAlertSound('warning');
        } catch {
          // Ignore audio errors
        }
        setLastScanFeedback({
          status: 'error',
          barcode: found.barcode,
          message: `"${found.name}" — stok kifayət deyil (Qalıq: ${available})`,
        });
        return false;
      }

      try {
        playAlertSound('success');
      } catch {
        // Ignore audio errors
      }
      setLastScanFeedback({
        status: 'success',
        barcode: found.barcode,
        message: `"${found.name}" səbətə əlavə olundu (${formatAZN(found.salePrice)})`,
      });
      showToast('success', `Skaner: "${found.name}" səbətə əlavə olundu.`);
      return true;
    } else {
      try {
        playAlertSound('warning');
      } catch {
        // Ignore audio errors
      }
      setLastScanFeedback({
        status: 'error',
        barcode: rawCode.trim(),
        message: `"${rawCode.trim()}" barkodlu məhsul tapılmadı!`,
      });
      showToast('error', `"${rawCode.trim()}" barkodlu məhsul tapılmadı!`);
      return false;
    }
  };

  const handleBarcodeScanned = (barcode: string) => {
    processScannedBarcode(barcode, 'camera');
  };

  // Dedicated scanner input change handler (auto-detects paste, rapid HID scan without Enter, or unambiguous exact barcode)
  const handleScannerInputChange = (nextVal: string) => {
    setBarcodeInput(nextVal);
    if (scannerAutoTimerRef.current) {
      window.clearTimeout(scannerAutoTimerRef.current);
      scannerAutoTimerRef.current = null;
    }

    const now = Date.now();
    if (nextVal.length <= 1 || now - scannerIntervalsRef.current.lastTime > 250) {
      scannerIntervalsRef.current = { lastTime: now, intervals: [] };
    } else {
      scannerIntervalsRef.current.intervals.push(now - scannerIntervalsRef.current.lastTime);
      scannerIntervalsRef.current.lastTime = now;
    }

    const clean = normalizeBarcode(nextVal);
    if (!clean) return;

    const matched = findProductByBarcode(products, clean);
    const rapid = isRapidScanSequence(scannerIntervalsRef.current.intervals);

    // If matched and either scanned rapidly or no other barcode has this as a prefix, auto-add after a brief settle pause
    if (matched) {
      const hasLonger = hasLongerBarcodePrefix(products, clean, matched.id);
      const delay = rapid ? 90 : hasLonger ? 450 : 180;
      scannerAutoTimerRef.current = window.setTimeout(() => {
        processScannedBarcode(nextVal, 'scanner');
        setBarcodeInput('');
        scannerIntervalsRef.current = { lastTime: 0, intervals: [] };
      }, delay);
    } else if (rapid && clean.length >= 4) {
      // Rapid hardware scan without Enter suffix -> flush after short idle pause to show not-found feedback
      scannerAutoTimerRef.current = window.setTimeout(() => {
        processScannedBarcode(nextVal, 'scanner');
        setBarcodeInput('');
        scannerIntervalsRef.current = { lastTime: 0, intervals: [] };
      }, 220);
    }
  };

  // Keep scanner focus when lock is enabled
  useEffect(() => {
    if (scannerFocusLock && activeSubTab === 'pos' && !isScannerOpen && !isDepositModalOpen && !editingSale && !isDebtModalOpen) {
      scannerInputRef.current?.focus();
    }
  }, [scannerFocusLock, activeSubTab, isScannerOpen, isDepositModalOpen, editingSale, isDebtModalOpen, cart.length]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (scannerAutoTimerRef.current) window.clearTimeout(scannerAutoTimerRef.current);
      if (searchAutoTimerRef.current) window.clearTimeout(searchAutoTimerRef.current);
    };
  }, []);

  // Hardware USB/Bluetooth keyboard-wedge barcode scanner listener anywhere on POS tab
  const scanBufferRef = useRef<{ chars: string; lastTime: number; intervals: number[]; flushTimer: number | null }>({
    chars: '',
    lastTime: 0,
    intervals: [],
    flushTimer: null,
  });
  useEffect(() => {
    if (activeSubTab !== 'pos' || isScannerOpen || isDepositModalOpen || editingSale || isDebtModalOpen) return;

    const flushBuffer = (requireRapid: boolean) => {
      const buf = scanBufferRef.current.chars.trim();
      const rapid = isRapidScanSequence(scanBufferRef.current.intervals);
      scanBufferRef.current.chars = '';
      scanBufferRef.current.intervals = [];
      if (scanBufferRef.current.flushTimer) {
        window.clearTimeout(scanBufferRef.current.flushTimer);
        scanBufferRef.current.flushTimer = null;
      }
      if (buf.length >= 2 && (!requireRapid || (rapid && buf.length >= 4))) {
        processScannedBarcode(buf, 'hid');
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      const now = Date.now();
      const gap = now - scanBufferRef.current.lastTime;
      if (gap > 180) {
        scanBufferRef.current.chars = '';
        scanBufferRef.current.intervals = [];
      } else if (scanBufferRef.current.lastTime > 0 && e.key.length === 1) {
        scanBufferRef.current.intervals.push(gap);
      }
      scanBufferRef.current.lastTime = now;

      if (scanBufferRef.current.flushTimer) {
        window.clearTimeout(scanBufferRef.current.flushTimer);
        scanBufferRef.current.flushTimer = null;
      }

      if (e.key === 'Enter' || e.key === 'Tab') {
        if (scanBufferRef.current.chars.trim().length >= 2) {
          e.preventDefault();
          flushBuffer(false);
        }
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        scanBufferRef.current.chars += e.key;
        // Fallback auto-flush for scanners configured without Enter/Tab suffix
        scanBufferRef.current.flushTimer = window.setTimeout(() => {
          flushBuffer(true);
        }, 180);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (scanBufferRef.current.flushTimer) {
        window.clearTimeout(scanBufferRef.current.flushTimer);
        scanBufferRef.current.flushTimer = null;
      }
    };
  });

  // Submit Sale
  const handleCompleteSale = () => {
    if (cart.length === 0 || isSubmittingSale) return;

    if (paymentType === 'borc' && !debtorName.trim()) {
      showToast('error', 'Zəhmət olmasa borclunun adını və soyadını daxil edin!');
      return;
    }

    if (paymentType === 'balans') {
      const custName = selectedCustomerAccount.trim();
      if (!custName) {
        showToast('error', 'Zəhmət olmasa müştəri hesabını seçin!');
        return;
      }
      const existing = customerAccounts.find(c => c.name.toLowerCase() === custName.toLowerCase());
      if (!existing) {
        showToast('error', `"${custName}" adlı müştəri hesabı tapılmadı!`);
        return;
      }
      if (existing.balance < cartFinalTotal) {
        showToast(
          'error',
          `Balansda kifayət qədər vəsait yoxdur! Cari balans: ${formatAZN(existing.balance)}, Tələb olunan: ${formatAZN(cartFinalTotal)}`
        );
        return;
      }
    }

    setIsSubmittingSale(true);
    try {
      const res = addSale({
        items: cart.map(i => ({ productId: i.product.id, quantity: i.quantity })),
        paymentType,
        debtorName:
          paymentType === 'borc'
            ? debtorName.trim()
            : paymentType === 'balans'
            ? selectedCustomerAccount.trim()
            : undefined,
        debtorPhone: paymentType === 'borc' ? debtorPhone.trim() || undefined : undefined,
        discountAmount: cartDiscount,
        customDate,
        customTime,
      });

      if (res.success) {
        const msg =
          paymentType === 'borc'
            ? `Nisyə satış qeydə alındı: ${debtorName.trim()} (${formatAZN(cartFinalTotal)})`
            : `Satış tamamlandı: ${formatAZN(cartFinalTotal)}`;
        showToast('success', msg);
        clearCart();
        setCustomTime(getCurrentTimeHHMM());
      } else {
        showToast('error', res.error || 'Satış tamamlanmadı');
      }
    } finally {
      setIsSubmittingSale(false);
    }
  };

  const handleQuickDepositSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = depositName.trim();
    if (!name || depositAmount <= 0) {
      showToast('error', 'Ad və düzgün məbləğ daxil edin!');
      return;
    }
    depositToCustomer(name, depositAmount, depositPaymentType, depositNote);
    setSelectedCustomerAccount(name);
    setPaymentType('balans');
    setIsDepositModalOpen(false);
    setDepositName('');
    setDepositNote('');
    showToast('success', `${name} balansına ${formatAZN(depositAmount)} əlavə olundu.`);
  };

  // Filtered products for POS grid
  const filteredProducts = products.filter(p => {
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q || p.name.toLowerCase().includes(q) || p.barcode.toLowerCase().includes(q);
    const matchesCat = selectedCategory === 'all' || p.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  // Live Today financial metrics
  const todayMetrics = useMemo(
    () =>
      calculateFinancialMetricsForRange({
        sales,
        debts,
        purchases,
        expenses,
        startDate: todayISO,
        endDate: todayISO,
      }),
    [sales, debts, purchases, expenses, todayISO]
  );

  // Normalized date range for History/Daily tab
  const effectiveStart = filterStartDate <= filterEndDate ? filterStartDate : filterEndDate;
  const effectiveEnd = filterStartDate <= filterEndDate ? filterEndDate : filterStartDate;
  const isSingleDay = effectiveStart === effectiveEnd;

  // Filtered Sales History
  const filteredHistorySales = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    return sales
      .filter(s => {
        if (effectiveStart && s.date < effectiveStart) return false;
        if (effectiveEnd && s.date > effectiveEnd) return false;
        if (filterPaymentType !== 'all' && s.paymentType !== filterPaymentType) return false;
        if (
          filterProductId !== 'all' &&
          !s.items.some(i => i.productId === filterProductId)
        ) {
          return false;
        }
        if (q) {
          const inItems = s.items.some(i => i.productName.toLowerCase().includes(q));
          const inDebtor = (s.debtorName || '').toLowerCase().includes(q);
          const inPhone = (s.debtorPhone || '').toLowerCase().includes(q);
          const inStaff = (s.createdBy || '').toLowerCase().includes(q);
          if (!inItems && !inDebtor && !inPhone && !inStaff) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const cmpDate = b.date.localeCompare(a.date);
        if (cmpDate !== 0) return cmpDate;
        const cmpTime = (b.time || '').localeCompare(a.time || '');
        if (cmpTime !== 0) return cmpTime;
        return (b.createdAt || '').localeCompare(a.createdAt || '');
      });
  }, [sales, effectiveStart, effectiveEnd, filterPaymentType, filterProductId, historySearch]);

  const filteredMetrics = useMemo(
    () =>
      calculateFinancialMetricsForRange({
        sales: filteredHistorySales,
        debts,
        purchases,
        expenses,
        startDate: effectiveStart || '2000-01-01',
        endDate: effectiveEnd || '2099-12-31',
        includeUnconfirmedSales: true,
      }),
    [filteredHistorySales, debts, purchases, expenses, effectiveStart, effectiveEnd]
  );

  const dayConfirmed =
    isSingleDay &&
    filteredHistorySales.length > 0 &&
    filteredHistorySales.every(s => s.isConfirmed);

  // Filtered product breakdown
  const filteredProductStats = useMemo(() => {
    const stats: Record<string, { name: string; quantity: number; revenue: number }> = {};
    for (const s of filteredHistorySales) {
      for (const item of s.items) {
        if (filterProductId !== 'all' && item.productId !== filterProductId) continue;
        if (!stats[item.productId]) {
          stats[item.productId] = { name: item.productName, quantity: 0, revenue: 0 };
        }
        stats[item.productId].quantity += item.quantity;
        stats[item.productId].revenue += item.totalPrice;
      }
    }
    return Object.values(stats).sort((a, b) => b.revenue - a.revenue);
  }, [filteredHistorySales, filterProductId]);

  // Monthly Sales Summary calculations
  const monthSalesList = sales.filter(s => s.date.startsWith(selectedMonth));
  const monthTotalAmount = monthSalesList.reduce((sum, s) => sum + s.totalAmount, 0);
  const monthlyProductStats: Record<string, { name: string; quantity: number; revenue: number }> = {};
  for (const s of monthSalesList) {
    for (const item of s.items) {
      if (!monthlyProductStats[item.productId]) {
        monthlyProductStats[item.productId] = { name: item.productName, quantity: 0, revenue: 0 };
      }
      monthlyProductStats[item.productId].quantity += item.quantity;
      monthlyProductStats[item.productId].revenue += item.totalPrice;
    }
  }

  const getPaymentBadge = (sale: Sale) => {
    switch (sale.paymentType) {
      case 'naqd':
        return { label: 'Nağd', status: sale.isConfirmed ? 'Ödənildi' : 'Gözləyir', cls: 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-900' };
      case 'kart':
        return { label: 'Bank Kartı', status: sale.isConfirmed ? 'Ödənildi' : 'Gözləyir', cls: 'text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 border-blue-200 dark:border-blue-900' };
      case 'pos':
        return { label: 'POS Terminal', status: sale.isConfirmed ? 'Ödənildi' : 'Gözləyir', cls: 'text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 border-indigo-200 dark:border-indigo-900' };
      case 'balans':
        return { label: 'Depozit Balans', status: 'Balansdan', cls: 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-900' };
      case 'borc': {
        const linked = debts.find(d => d.saleId === sale.id);
        const statusText = linked?.status === 'odanilib' ? 'Ödənilib' : linked?.status === 'qismen' ? 'Qismən ödənilib' : 'Nisyə (Borc)';
        return { label: 'Nisyə', status: statusText, cls: 'text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-900' };
      }
    }
  };

  const applyQuickDateRange = (preset: 'today' | 'week' | 'month' | 'all') => {
    if (preset === 'today') {
      setFilterStartDate(todayISO);
      setFilterEndDate(todayISO);
    } else if (preset === 'week') {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      setFilterStartDate(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      );
      setFilterEndDate(todayISO);
    } else if (preset === 'month') {
      setFilterStartDate(`${getCurrentMonthKey()}-01`);
      setFilterEndDate(todayISO);
    } else {
      setFilterStartDate('2020-01-01');
      setFilterEndDate('2099-12-31');
    }
  };

  const openEditSaleDateModal = (sale: Sale) => {
    setEditingSale(sale);
    setEditDateValue(sale.date);
    setEditTimeValue(sale.time || '12:00');
  };

  const handleSaveSaleDate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSale) return;
    const res = updateSaleDate(editingSale.id, editDateValue, editTimeValue);
    if (res.success) {
      setEditingSale(null);
    } else if (res.error) {
      showToast('error', res.error);
    }
  };

  return (
    <div className="space-y-6 pb-12 max-w-7xl mx-auto">
      {/* Top Header & Sub-Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-zinc-200 dark:border-zinc-800">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-white tracking-tight">
            Kassa & Satış İdarəetməsi
          </h2>
          <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
            Sürətli POS satışı, barkod skan, endirim, nisyə qeydiyyatı və əməliyyat tarixçəsi
          </p>
        </div>

        {/* Sub-nav tabs */}
        <div className="flex items-center p-1 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveSubTab('pos')}
            style={activeSubTab === 'pos' ? { backgroundColor: primaryColor } : undefined}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap shrink-0 ${
              activeSubTab === 'pos'
                ? 'text-white shadow-sm'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            Satış Terminalı
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('daily')}
            style={activeSubTab === 'daily' ? { backgroundColor: primaryColor } : undefined}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap shrink-0 ${
              activeSubTab === 'daily'
                ? 'text-white shadow-sm'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            Satış Tarixçəsi ({sales.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('monthly')}
            style={activeSubTab === 'monthly' ? { backgroundColor: primaryColor } : undefined}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap shrink-0 ${
              activeSubTab === 'monthly'
                ? 'text-white shadow-sm'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            Aylıq Yığım
          </button>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────
          SUB-TAB 1: POS TERMINAL
         ───────────────────────────────────────────────────────── */}
      {activeSubTab === 'pos' && (
        <div className="space-y-4">
          {/* Live Today Cash vs Credit Separation Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            <div className="p-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 block">
                Bugünkü Ümumi Satış
              </span>
              <span className="text-base font-black font-mono tabular-nums text-zinc-900 dark:text-white mt-0.5 block">
                {formatAZN(todayMetrics.grossSalesTotal)}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block">
                Nağd Satış
              </span>
              <span className="text-base font-black font-mono tabular-nums text-emerald-700 dark:text-emerald-400 mt-0.5 block">
                {formatAZN(todayMetrics.cashSales)}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 block">
                Kart / POS Satış
              </span>
              <span className="text-base font-black font-mono tabular-nums text-blue-700 dark:text-blue-400 mt-0.5 block">
                {formatAZN(todayMetrics.cardSales + todayMetrics.posSales)}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-rose-50/60 dark:bg-rose-950/25 border border-rose-200 dark:border-rose-900/60">
              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400 block">
                Nisyə (Kassasız)
              </span>
              <span className="text-base font-black font-mono tabular-nums text-rose-700 dark:text-rose-400 mt-0.5 block">
                {formatAZN(todayMetrics.creditSales)}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-amber-50/60 dark:bg-amber-950/25 border border-amber-200 dark:border-amber-900/60">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 block">
                Borcdan Daxilolan
              </span>
              <span className="text-base font-black font-mono tabular-nums text-amber-700 dark:text-amber-400 mt-0.5 block">
                {formatAZN(todayMetrics.debtCollectedTotal)}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300 block">
                Faktiki Kassaya Girən
              </span>
              <span className="text-base font-black font-mono tabular-nums text-emerald-800 dark:text-emerald-300 mt-0.5 block">
                {formatAZN(todayMetrics.actualDrawerInflow)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Product Selection Grid */}
            <div className="lg:col-span-7 xl:col-span-8 space-y-3">
              {/* Dedicated Hardware & Manual Barcode Scanner Bar */}
              <div className="p-2.5 sm:p-3 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-2">
                <div className="flex flex-col sm:flex-row gap-2">
                  <form
                    onSubmit={e => {
                      e.preventDefault();
                      if (!barcodeInput.trim()) return;
                      if (scannerAutoTimerRef.current) {
                        window.clearTimeout(scannerAutoTimerRef.current);
                        scannerAutoTimerRef.current = null;
                      }
                      processScannedBarcode(barcodeInput, 'scanner');
                      setBarcodeInput('');
                      scannerIntervalsRef.current = { lastTime: 0, intervals: [] };
                    }}
                    className="relative flex-1 flex gap-2"
                  >
                    <div className="relative flex-1">
                      <ScanBarcode className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-red-500" />
                      <input
                        ref={scannerInputRef}
                        type="text"
                        value={barcodeInput}
                        onChange={e => handleScannerInputChange(e.target.value)}
                        onKeyDown={e => {
                          if ((e.key === 'Tab' || e.key === 'Enter') && barcodeInput.trim()) {
                            e.preventDefault();
                            if (scannerAutoTimerRef.current) {
                              window.clearTimeout(scannerAutoTimerRef.current);
                              scannerAutoTimerRef.current = null;
                            }
                            processScannedBarcode(barcodeInput, 'scanner');
                            setBarcodeInput('');
                            scannerIntervalsRef.current = { lastTime: 0, intervals: [] };
                          }
                        }}
                        placeholder="Barkod skan edin və ya daxil edin (avtomatik səbətə düşür)..."
                        aria-label="Barkod skaner girişi"
                        className="w-full pl-10 pr-8 py-2 text-sm font-mono rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                      />
                      {barcodeInput && (
                        <button
                          type="button"
                          onClick={() => setBarcodeInput('')}
                          aria-label="Barkodu təmizlə"
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 dark:hover:text-white"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </form>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setScannerFocusLock(prev => {
                          const next = !prev;
                          if (next) {
                            setTimeout(() => scannerInputRef.current?.focus(), 0);
                          }
                          return next;
                        });
                      }}
                      title="USB/Bluetooth skaner üçün fokusu avtomatik bu xanada saxla"
                      className={`px-3 py-2 text-xs font-bold rounded-xl border transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                        scannerFocusLock
                          ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300'
                          : 'bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                      }`}
                    >
                      <ScanBarcode className="w-3.5 h-3.5" />
                      <span>{scannerFocusLock ? 'Skaner Kilidli' : 'Fokusu Saxla'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        unlockAudioContext();
                        setIsScannerOpen(true);
                      }}
                      style={{ backgroundColor: primaryColor }}
                      className="px-4 py-2 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shrink-0 transition-all hover:opacity-90 active:scale-95 whitespace-nowrap"
                    >
                      <Camera className="w-4 h-4" />
                      <span>Barkod Oxut</span>
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                  <span className="text-zinc-500 dark:text-zinc-400">
                    USB/Bluetooth skaner POS-un istənilən yerində avtomatik işləyir
                  </span>
                  {lastScanFeedback && (
                    <span
                      className={`font-semibold px-2.5 py-0.5 rounded-lg border ${
                        lastScanFeedback.status === 'success'
                          ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                          : 'bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
                      }`}
                    >
                      Son skan ({lastScanFeedback.barcode}): {lastScanFeedback.message}
                    </span>
                  )}
                </div>
              </div>

              {/* Search row */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => {
                      const val = e.target.value;
                      setSearchQuery(val);
                      if (searchAutoTimerRef.current) {
                        window.clearTimeout(searchAutoTimerRef.current);
                        searchAutoTimerRef.current = null;
                      }
                      const now = Date.now();
                      if (val.length <= 1 || now - searchIntervalsRef.current.lastTime > 220) {
                        searchIntervalsRef.current = { lastTime: now, intervals: [] };
                      } else {
                        searchIntervalsRef.current.intervals.push(now - searchIntervalsRef.current.lastTime);
                        searchIntervalsRef.current.lastTime = now;
                      }
                      if (
                        val.trim().length >= 4 &&
                        isRapidScanSequence(searchIntervalsRef.current.intervals)
                      ) {
                        searchAutoTimerRef.current = window.setTimeout(() => {
                          const ok = processScannedBarcode(val, 'search');
                          if (ok) {
                            setSearchQuery('');
                          }
                          searchIntervalsRef.current = { lastTime: 0, intervals: [] };
                        }, 160);
                      }
                    }}
                    onKeyDown={e => {
                      if ((e.key === 'Enter' || e.key === 'Tab') && searchQuery.trim()) {
                        const matched = findProductByBarcode(products, searchQuery);
                        if (matched) {
                          e.preventDefault();
                          if (searchAutoTimerRef.current) {
                            window.clearTimeout(searchAutoTimerRef.current);
                            searchAutoTimerRef.current = null;
                          }
                          processScannedBarcode(searchQuery, 'search');
                          setSearchQuery('');
                        } else if (e.key === 'Enter' && /^[0-9]{4,}$/.test(searchQuery.trim())) {
                          e.preventDefault();
                          processScannedBarcode(searchQuery, 'search');
                        }
                      }
                    }}
                    placeholder="Məhsul adı və ya barkodla axtarın (Enter)..."
                    className="w-full pl-10 pr-8 py-2.5 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
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
              </div>

              {/* Category filter tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                <button
                  type="button"
                  onClick={() => setSelectedCategory('all')}
                  style={selectedCategory === 'all' ? { backgroundColor: primaryColor } : undefined}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-xl whitespace-nowrap shrink-0 transition-colors ${
                    selectedCategory === 'all'
                      ? 'text-white font-bold'
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
                    className={`px-3 py-1.5 text-xs font-semibold rounded-xl whitespace-nowrap shrink-0 transition-colors ${
                      selectedCategory === cat
                        ? 'text-white font-bold'
                        : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 hover:text-zinc-900 dark:hover:text-white'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Products Grid */}
              {filteredProducts.length === 0 ? (
                <div className="py-12 text-center bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 text-zinc-500 text-xs">
                  Axtarışa uyğun məhsul tapılmadı.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 max-h-[640px] overflow-y-auto pr-1">
                  {filteredProducts.map(product => {
                    const stock = calculateProductStock(
                      product,
                      purchases,
                      sales,
                      settings.minStockThreshold
                    );
                    const inCart = cart.find(i => i.product.id === product.id);
                    const isOutOfStock = stock.activeStock <= 0;

                    return (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => addToCart(product)}
                        className={`p-3.5 rounded-xl border text-left flex flex-col justify-between transition-all active:scale-[0.98] relative ${
                          isOutOfStock
                            ? 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/60 opacity-60 cursor-not-allowed'
                            : inCart
                            ? 'border-red-500 bg-red-50/70 dark:bg-red-950/20 ring-1 ring-red-500'
                            : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700'
                        }`}
                      >
                        {inCart && (
                          <span
                            style={{ backgroundColor: primaryColor }}
                            className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full text-white font-black text-xs tabular-nums flex items-center justify-center shadow-md"
                          >
                            {inCart.quantity}
                          </span>
                        )}

                        <div>
                          <div className="flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400 mb-1">
                            <span className="truncate">
                              {product.category}
                              {product.volume ? ` · ${product.volume}` : ''}
                            </span>
                          </div>

                          <h4 className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-white line-clamp-2 leading-snug">
                            {product.name}
                          </h4>
                        </div>

                        <div className="mt-3 pt-2 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-2">
                          <span className="text-xs sm:text-sm font-mono tabular-nums font-extrabold text-red-600 dark:text-red-400">
                            {formatAZN(product.salePrice)}
                          </span>

                          <span
                            className={`text-[11px] font-mono tabular-nums ${
                              isOutOfStock
                                ? 'text-red-600 dark:text-red-400 font-bold'
                                : stock.isLowStock
                                ? 'text-amber-600 dark:text-amber-400 font-bold'
                                : 'text-zinc-500 dark:text-zinc-400'
                            }`}
                          >
                            {isOutOfStock ? 'Bitib (0)' : `Stok: ${stock.activeStock}`}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right Column: Checkout Cart & Payment */}
            <div className="lg:col-span-5 xl:col-span-4 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 space-y-4 sticky top-16">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="w-5 h-5 text-red-500" />
                  <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                    Səbət ({cartItemCount} əd.)
                  </h3>
                </div>
                {cart.length > 0 && (
                  <button
                    type="button"
                    onClick={clearCart}
                    className="text-xs text-red-600 dark:text-red-400 hover:underline font-semibold"
                  >
                    Təmizlə
                  </button>
                )}
              </div>

              {/* Cart Items List */}
              {cart.length === 0 ? (
                <div className="py-10 text-center text-zinc-500 space-y-2">
                  <ShoppingCart className="w-8 h-8 mx-auto text-zinc-400 dark:text-zinc-600" />
                  <p className="text-xs">Səbət boşdur. Məhsul seçin və ya barkod oxudun.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1 divide-y divide-zinc-200 dark:divide-zinc-800">
                  {cart.map(item => (
                    <div key={item.product.id} className="pt-2 flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-zinc-900 dark:text-white truncate">
                          {item.product.name}
                        </p>
                        <p className="text-[11px] font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
                          {item.quantity} × {formatAZN(item.product.salePrice)} ={' '}
                          <strong className="text-zinc-900 dark:text-white">
                            {formatAZN(item.quantity * item.product.salePrice)}
                          </strong>
                        </p>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.product.id, -1)}
                          aria-label="Sayını azalt"
                          className="w-7 h-7 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 flex items-center justify-center transition-colors"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="w-6 text-center font-mono tabular-nums font-bold text-xs text-zinc-900 dark:text-white">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.product.id, 1)}
                          aria-label="Sayını artır"
                          className="w-7 h-7 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 flex items-center justify-center transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeFromCart(item.product.id)}
                          aria-label="Səbətdən sil"
                          className="w-7 h-7 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 flex items-center justify-center ml-0.5 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Discount & Total Display */}
              <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-2.5">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
                    <Tag className="w-3.5 h-3.5" />
                    <span>Endirim (AZN)</span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="0"
                      step="0.10"
                      max={cartSubtotal || undefined}
                      value={discountInput}
                      onChange={e => setDiscountInput(e.target.value)}
                      placeholder="0.00"
                      className="w-24 px-2.5 py-1 text-right font-mono tabular-nums text-xs font-bold rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                  </div>
                </div>

                {cartDiscount > 0 && (
                  <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
                    <span>Ara cəm: {formatAZN(cartSubtotal)}</span>
                    <span className="text-amber-600 dark:text-amber-400 font-bold">
                      Endirim: −{formatAZN(cartDiscount)}
                    </span>
                  </div>
                )}

                <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      Yekun Məbləğ
                    </span>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      {paymentType === 'borc'
                        ? 'Kassaya əlavə olunmur (Nisyə)'
                        : settings.autoConfirmSales
                        ? 'Avtomatik təsdiq aktivdir'
                        : 'Gün sonunda təsdiqlənəcək'}
                    </p>
                  </div>
                  <div className="text-2xl font-black font-mono tabular-nums text-zinc-900 dark:text-white">
                    {formatAZN(cartFinalTotal)}
                  </div>
                </div>
              </div>

              {/* Payment Method Selector */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
                  Ödəniş Növü
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentType('naqd')}
                    className={`py-2 px-2.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap ${
                      paymentType === 'naqd'
                        ? 'bg-emerald-600 text-white border-emerald-500'
                        : 'bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                    }`}
                  >
                    <Banknote className="w-4 h-4 shrink-0" />
                    <span>Nağd</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentType('kart')}
                    className={`py-2 px-2.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap ${
                      paymentType === 'kart'
                        ? 'bg-blue-600 text-white border-blue-500'
                        : 'bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                    }`}
                  >
                    <CreditCard className="w-4 h-4 shrink-0" />
                    <span>Bank Kartı</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentType('pos')}
                    className={`py-2 px-2.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap ${
                      paymentType === 'pos'
                        ? 'bg-red-600 text-white border-red-500'
                        : 'bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                    }`}
                  >
                    <Smartphone className="w-4 h-4 shrink-0" />
                    <span>POS Terminal</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentType('balans')}
                    className={`py-2 px-2.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap ${
                      paymentType === 'balans'
                        ? 'bg-amber-600 text-white border-amber-500'
                        : 'bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                    }`}
                  >
                    <Wallet className="w-4 h-4 shrink-0" />
                    <span>Balans</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentType('borc')}
                    className={`py-2 px-2.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap col-span-2 sm:col-span-2 ${
                      paymentType === 'borc'
                        ? 'bg-rose-700 text-white border-rose-600'
                        : 'bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                    }`}
                  >
                    <BookOpen className="w-4 h-4 shrink-0" />
                    <span>Nisyə (Borc Yaz)</span>
                  </button>
                </div>
              </div>

              {/* BALANS selector */}
              {paymentType === 'balans' && (
                <div className="space-y-3 p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-amber-300 dark:border-amber-800/60">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-amber-700 dark:text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Wallet className="w-3.5 h-3.5" />
                      <span>Müştəri Hesabı</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setDepositName(selectedCustomerAccount || '');
                        setIsDepositModalOpen(true);
                      }}
                      className="text-[11px] font-bold text-amber-700 dark:text-amber-400 hover:underline"
                    >
                      + Balans Artır
                    </button>
                  </div>

                  <select
                    value={selectedCustomerAccount}
                    onChange={e => setSelectedCustomerAccount(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white font-semibold"
                  >
                    <option value="">-- Müştəri Hesabı Seçin --</option>
                    {customerAccounts.map(c => (
                      <option key={c.id} value={c.name}>
                        {c.name} — Balans: {formatAZN(c.balance)}
                      </option>
                    ))}
                  </select>

                  {(() => {
                    const cust = customerAccounts.find(
                      c => c.name.toLowerCase() === selectedCustomerAccount.trim().toLowerCase()
                    );
                    if (!cust) return null;
                    const remainingAfterSale = Math.round((cust.balance - cartFinalTotal) * 100) / 100;
                    const hasEnough = remainingAfterSale >= 0;
                    return (
                      <div className="p-2.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-1 text-xs font-mono tabular-nums">
                        <div className="flex justify-between">
                          <span className="font-sans text-zinc-500">Cari balans:</span>
                          <strong className="text-zinc-900 dark:text-white">{formatAZN(cust.balance)}</strong>
                        </div>
                        <div className="flex justify-between">
                          <span className="font-sans text-zinc-500">Qalacaq balans:</span>
                          <strong className={hasEnough ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
                            {formatAZN(remainingAfterSale)}
                          </strong>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* BORC (Nisyə) Name & Phone Inputs */}
              {paymentType === 'borc' && (
                <div className="space-y-2.5 p-3.5 rounded-xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/80">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-rose-700 dark:text-rose-300 uppercase tracking-wider">
                      Borclu Məlumatları
                    </span>
                    <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                      Stok dərhal çıxılır
                    </span>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                      Adı və Soyadı *
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-rose-500" />
                      <input
                        type="text"
                        list="known-debtors-list"
                        required
                        value={debtorName}
                        onChange={e => handleDebtorNameChange(e.target.value)}
                        placeholder="məs: Əli Həsənov"
                        className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-rose-300 dark:border-rose-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500 font-semibold"
                      />
                      <datalist id="known-debtors-list">
                        {knownDebtors.map(k => (
                          <option key={k.name} value={k.name} />
                        ))}
                      </datalist>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                      Telefon Nömrəsi
                    </label>
                    <div className="relative">
                      <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                      <input
                        type="tel"
                        value={debtorPhone}
                        onChange={e => setDebtorPhone(e.target.value)}
                        placeholder="+994 50 000 00 00"
                        className="w-full pl-9 pr-3 py-2 text-sm font-mono rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Date and Time selector with backdate indicator */}
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-medium block mb-0.5">
                      Satış Tarixi
                    </span>
                    <input
                      type="date"
                      value={customDate}
                      onChange={e => setCustomDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 font-mono tabular-nums text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-medium block mb-0.5">
                      Saat
                    </span>
                    <input
                      type="time"
                      value={customTime}
                      onChange={e => setCustomTime(e.target.value)}
                      className="w-full px-2.5 py-1.5 font-mono tabular-nums text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white"
                    />
                  </div>
                </div>

                {customDate !== todayISO && (
                  <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 text-[11px] text-amber-800 dark:text-amber-300 flex items-center justify-between gap-2">
                    <span>
                      Fərqli tarix seçilib: yalnız <strong>{formatDateAZ(customDate)}</strong> hesabatına yazılacaq.
                    </span>
                    <button
                      type="button"
                      onClick={() => setCustomDate(todayISO)}
                      className="font-bold underline shrink-0"
                    >
                      Bugünə qaytar
                    </button>
                  </div>
                )}
              </div>

              {/* Confirm Checkout Button */}
              <button
                type="button"
                disabled={cart.length === 0 || isSubmittingSale}
                onClick={handleCompleteSale}
                style={cart.length > 0 ? { backgroundColor: primaryColor } : undefined}
                className={`w-full py-3.5 px-4 font-black text-sm rounded-xl transition-all flex items-center justify-center gap-2 active:scale-[0.98] ${
                  cart.length === 0 || isSubmittingSale
                    ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 cursor-not-allowed'
                    : 'text-white hover:opacity-95 shadow-md'
                }`}
              >
                <Check className="w-5 h-5 stroke-[2.5]" />
                <span>
                  {isSubmittingSale ? 'Qeyd olunur...' : `Satışı Tamamla (${formatAZN(cartFinalTotal)})`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────
          SUB-TAB 2: SATIŞ TARİXÇƏSİ & GÜNDƏLİK CƏDVƏL
         ───────────────────────────────────────────────────────── */}
      {activeSubTab === 'daily' && (
        <div className="space-y-5">
          {/* Multi-filter Bar */}
          <div className="p-4 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => applyQuickDateRange('today')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                    effectiveStart === todayISO && effectiveEnd === todayISO
                      ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 border-zinc-900 dark:border-white'
                      : 'bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300'
                  }`}
                >
                  Bu gün
                </button>
                <button
                  type="button"
                  onClick={() => applyQuickDateRange('week')}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold border bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  Son 7 gün
                </button>
                <button
                  type="button"
                  onClick={() => applyQuickDateRange('month')}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold border bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  Bu ay
                </button>
                <button
                  type="button"
                  onClick={() => applyQuickDateRange('all')}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold border bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  Bütün Tarixlər
                </button>
              </div>

              <div className="flex items-center gap-2">
                {isSingleDay && !dayConfirmed && filteredHistorySales.length > 0 && (
                  <button
                    type="button"
                    onClick={() => confirmDaySales(effectiveStart)}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition-colors whitespace-nowrap"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>Günü Təsdiq Et</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => exportSalesToCSV(filteredHistorySales)}
                  className="px-3 py-1.5 text-xs font-semibold bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Excel / CSV</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
              <div>
                <span className="text-[10px] font-bold uppercase text-zinc-500 block mb-1">
                  Başlanğıc Tarix
                </span>
                <input
                  type="date"
                  value={filterStartDate}
                  onChange={e => setFilterStartDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white"
                />
              </div>

              <div>
                <span className="text-[10px] font-bold uppercase text-zinc-500 block mb-1">
                  Son Tarix
                </span>
                <input
                  type="date"
                  value={filterEndDate}
                  onChange={e => setFilterEndDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white"
                />
              </div>

              <div>
                <span className="text-[10px] font-bold uppercase text-zinc-500 block mb-1">
                  Məhsul Üzrə Filtr
                </span>
                <select
                  value={filterProductId}
                  onChange={e => setFilterProductId(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white"
                >
                  <option value="all">Bütün Məhsullar</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <span className="text-[10px] font-bold uppercase text-zinc-500 block mb-1">
                  Ödəniş Növü
                </span>
                <select
                  value={filterPaymentType}
                  onChange={e => setFilterPaymentType(e.target.value as 'all' | PaymentType)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white"
                >
                  <option value="all">Bütün Ödəniş Növləri</option>
                  <option value="naqd">Nağd</option>
                  <option value="kart">Bank Kartı</option>
                  <option value="pos">POS Terminal</option>
                  <option value="borc">Nisyə (Borc)</option>
                  <option value="balans">Müştəri Balansı</option>
                </select>
              </div>

              <div>
                <span className="text-[10px] font-bold uppercase text-zinc-500 block mb-1">
                  Axtarış (Ad / Tel / Məhsul)
                </span>
                <input
                  type="text"
                  value={historySearch}
                  onChange={e => setHistorySearch(e.target.value)}
                  placeholder="Müştəri, telefon, məhsul..."
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white"
                />
              </div>
            </div>
          </div>

          {/* Filtered Separation Summary Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            <div className="p-3.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block">
                Ümumi Satış
              </span>
              <span className="text-base font-black font-mono tabular-nums text-zinc-900 dark:text-white mt-1 block">
                {formatAZN(filteredMetrics.grossSalesTotal)}
              </span>
              <span className="text-[10px] text-zinc-500 tabular-nums">
                {filteredMetrics.salesCount} çek · {filteredMetrics.totalItemsSold} ədəd
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block">
                Nağd Satış
              </span>
              <span className="text-base font-black font-mono tabular-nums text-emerald-700 dark:text-emerald-400 mt-1 block">
                {formatAZN(filteredMetrics.cashSales)}
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 block">
                Kart / POS
              </span>
              <span className="text-base font-black font-mono tabular-nums text-blue-700 dark:text-blue-400 mt-1 block">
                {formatAZN(filteredMetrics.cardSales + filteredMetrics.posSales)}
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-rose-50/60 dark:bg-rose-950/25 border border-rose-200 dark:border-rose-900/60">
              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400 block">
                Nisyə Satış
              </span>
              <span className="text-base font-black font-mono tabular-nums text-rose-700 dark:text-rose-400 mt-1 block">
                {formatAZN(filteredMetrics.creditSales)}
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 block">
                Endirimlər
              </span>
              <span className="text-base font-black font-mono tabular-nums text-amber-700 dark:text-amber-400 mt-1 block">
                {formatAZN(filteredMetrics.totalDiscounts)}
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-amber-50/60 dark:bg-amber-950/25 border border-amber-200 dark:border-amber-900/60">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 block">
                Borcdan Daxilolan
              </span>
              <span className="text-base font-black font-mono tabular-nums text-amber-700 dark:text-amber-400 mt-1 block">
                {formatAZN(filteredMetrics.debtCollectedTotal)}
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300 block">
                Faktiki Kassa
              </span>
              <span className="text-base font-black font-mono tabular-nums text-emerald-800 dark:text-emerald-300 mt-1 block">
                {formatAZN(filteredMetrics.actualDrawerInflow)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Sales Operations Table */}
            <div className="lg:col-span-8 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                  Satış Əməliyyatları ({filteredHistorySales.length})
                </h3>
                <span className="text-xs text-zinc-500 dark:text-zinc-400 font-mono tabular-nums">
                  {formatDateAZ(effectiveStart)}
                  {effectiveStart !== effectiveEnd ? ` – ${formatDateAZ(effectiveEnd)}` : ''}
                </span>
              </div>

              {filteredHistorySales.length === 0 ? (
                <div className="py-12 text-center text-zinc-500 text-xs">
                  Seçilmiş filtrlərə uyğun satış əməliyyatı tapılmadı.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-zinc-50 dark:bg-zinc-950 text-zinc-500 dark:text-zinc-400 font-semibold border-b border-zinc-200 dark:border-zinc-800 uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="py-3 px-4">Tarix / Saat</th>
                        <th className="py-3 px-4">Məhsullar</th>
                        <th className="py-3 px-4">Ödəniş / Status</th>
                        <th className="py-3 px-4 text-right">Məbləğ</th>
                        <th className="py-3 px-4 text-right">Əməliyyat</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                      {filteredHistorySales.map(s => {
                        const badge = getPaymentBadge(s);
                        const entryDateStr = s.createdAt ? s.createdAt.slice(0, 10) : s.date;
                        const wasBackdatedOrEdited =
                          entryDateStr !== s.date || Boolean(s.dateChangedAt);

                        return (
                          <tr
                            key={s.id}
                            className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors"
                          >
                            <td className="py-3 px-4 whitespace-nowrap align-top">
                              <div className="font-mono tabular-nums font-bold text-zinc-900 dark:text-white">
                                {formatDateAZ(s.date)}
                              </div>
                              <div className="text-[11px] font-mono tabular-nums text-zinc-500 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                <span>{s.time}</span>
                                <span>· @{s.createdBy}</span>
                              </div>
                              {wasBackdatedOrEdited && (
                                <div className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5 font-mono tabular-nums">
                                  {s.dateChangedAt && s.originalDate && s.originalDate !== s.date
                                    ? `İlk: ${formatDateAZ(s.originalDate)}`
                                    : `Daxil: ${formatDateAZ(entryDateStr)}`}
                                </div>
                              )}
                            </td>

                            <td className="py-3 px-4 align-top">
                              <div className="space-y-0.5">
                                {s.items.map((i, idx) => (
                                  <div key={idx} className="text-zinc-800 dark:text-zinc-200">
                                    <span className="font-semibold">{i.productName}</span>{' '}
                                    <span className="font-mono tabular-nums text-zinc-500">
                                      ({i.quantity} × {formatAZN(i.unitPrice)})
                                    </span>
                                  </div>
                                ))}
                              </div>
                              {s.debtorName && (
                                <div className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-1 flex flex-wrap items-center gap-2">
                                  <span className="font-semibold text-rose-700 dark:text-rose-400">
                                    Müştəri: {s.debtorName}
                                  </span>
                                  {s.debtorPhone && (
                                    <span className="font-mono tabular-nums text-zinc-500">
                                      {s.debtorPhone}
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>

                            <td className="py-3 px-4 align-top whitespace-nowrap">
                              <span
                                className={`inline-block px-2 py-0.5 text-[10px] font-bold rounded-md border ${badge.cls}`}
                              >
                                {badge.label}
                              </span>
                              <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                                {badge.status}
                              </div>
                            </td>

                            <td className="py-3 px-4 text-right align-top whitespace-nowrap font-mono tabular-nums">
                              <div className="font-black text-zinc-900 dark:text-white text-sm">
                                {formatAZN(s.totalAmount)}
                              </div>
                              {(s.discountAmount || 0) > 0 && (
                                <div className="text-[10px] text-amber-600 dark:text-amber-400">
                                  Endirim: −{formatAZN(s.discountAmount || 0)}
                                </div>
                              )}
                            </td>

                            <td className="py-3 px-4 text-right align-top whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1.5">
                                {!s.isConfirmed && (
                                  <button
                                    type="button"
                                    onClick={() => confirmSale(s.id)}
                                    title="Satışı Təsdiqlə"
                                    className="px-2 py-1 text-[10px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-md"
                                  >
                                    Təsdiqlə
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => openEditSaleDateModal(s)}
                                  title="Tarixi Dəyiş"
                                  className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                {isAdmin && (
                                  confirmDeleteSaleId === s.id ? (
                                    <div className="flex items-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          deleteSale(s.id);
                                          setConfirmDeleteSaleId(null);
                                        }}
                                        className="px-2 py-1 text-[10px] font-bold bg-red-600 text-white rounded-md"
                                      >
                                        Təsdiq
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setConfirmDeleteSaleId(null)}
                                        className="px-2 py-1 text-[10px] font-semibold bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-200 rounded-md"
                                      >
                                        X
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteSaleId(s.id)}
                                      title="Satışı ləğv et (Stok bərpa edilər)"
                                      className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-400 hover:text-red-500 transition-colors"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Product Summary */}
            <div className="lg:col-span-4 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 space-y-4">
              <div className="pb-2 border-b border-zinc-200 dark:border-zinc-800">
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                  Satılan Məhsul Sayı (Dövr Üzrə)
                </h3>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  Məhsullar üzrə kəmiyyət və dövriyyə bölgüsü
                </p>
              </div>

              {filteredProductStats.length === 0 ? (
                <div className="py-8 text-center text-zinc-500 text-xs">
                  Satılan məhsul yoxdur.
                </div>
              ) : (
                <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {filteredProductStats.map((stat, idx) => (
                    <div key={idx} className="py-2.5 flex items-center justify-between text-xs gap-2">
                      <span className="font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                        {stat.name}
                      </span>
                      <div className="flex items-center gap-3 shrink-0 font-mono tabular-nums">
                        <span className="text-zinc-500 dark:text-zinc-400">{stat.quantity} əd.</span>
                        <span className="font-bold text-zinc-900 dark:text-white">
                          {formatAZN(stat.revenue)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────
          SUB-TAB 3: AYLIK YIĞIM
         ───────────────────────────────────────────────────────── */}
      {activeSubTab === 'monthly' && (
        <div className="space-y-6">
          <div className="p-4 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-red-500" />
              <div>
                <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium block">
                  Ayı Seçin:
                </span>
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={e => setSelectedMonth(e.target.value)}
                  className="font-mono text-sm font-bold bg-transparent border-b border-zinc-300 dark:border-zinc-700 pb-0.5 text-zinc-900 dark:text-white focus:outline-none focus:border-red-500"
                />
              </div>
            </div>

            <div className="text-right">
              <span className="text-xs text-zinc-500 dark:text-zinc-400 block">
                {getMonthLabelAZ(selectedMonth)} Ümumi Satış
              </span>
              <span className="text-2xl font-black font-mono tabular-nums text-zinc-900 dark:text-white">
                {formatAZN(monthTotalAmount)}
              </span>
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 space-y-4">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white pb-2 border-b border-zinc-200 dark:border-zinc-800">
              {getMonthLabelAZ(selectedMonth)} Üzrə Satılan Məhsul Statistikası
            </h3>

            {Object.values(monthlyProductStats).length === 0 ? (
              <div className="py-12 text-center text-zinc-500 text-xs">
                Bu ay üzrə satış yoxdur.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {Object.values(monthlyProductStats)
                  .sort((a, b) => b.quantity - a.quantity)
                  .map((stat, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 flex items-center justify-between"
                    >
                      <div>
                        <span className="text-xs font-bold text-zinc-900 dark:text-white block">
                          {stat.name}
                        </span>
                        <span className="text-[11px] font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
                          {stat.quantity} ədəd satılıb
                        </span>
                      </div>
                      <span className="text-sm font-mono tabular-nums font-black text-red-600 dark:text-red-400">
                        {formatAZN(stat.revenue)}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Change Sale Date (Preserving original entry timestamp) */}
      {editingSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-red-500" />
                <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                  Satış Tarixini Dəyişdir
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingSale(null)}
                className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSaleDate} className="p-5 space-y-4">
              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Satış məbləği:</span>
                  <strong className="font-mono tabular-nums text-zinc-900 dark:text-white">
                    {formatAZN(editingSale.totalAmount)} ({editingSale.paymentType.toUpperCase()})
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Hazırkı hesabat tarixi:</span>
                  <strong className="font-mono tabular-nums text-zinc-900 dark:text-white">
                    {formatDateAZ(editingSale.date)} ({editingSale.time})
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Faktiki daxilolma vaxtı:</span>
                  <span className="font-mono tabular-nums text-zinc-600 dark:text-zinc-400">
                    {editingSale.createdAt
                      ? new Date(editingSale.createdAt).toLocaleString('az-AZ')
                      : formatDateAZ(editingSale.date)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                    Yeni Tarix *
                  </label>
                  <input
                    type="date"
                    required
                    value={editDateValue}
                    onChange={e => setEditDateValue(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                    Saat
                  </label>
                  <input
                    type="time"
                    value={editTimeValue}
                    onChange={e => setEditTimeValue(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Yalnız köhnə tarixin ({formatDateAZ(editingSale.date)}) və yeni seçilən tarixin günlük hesabatları yenidən hesablanacaq. Digər günlərə toxunulmur.
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setEditingSale(null)}
                  className="px-4 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400"
                >
                  Ləğv et
                </button>
                <button
                  type="submit"
                  style={{ backgroundColor: primaryColor }}
                  className="px-5 py-2 text-xs font-bold text-white rounded-xl hover:opacity-95"
                >
                  Tarixi Yadda Saxla
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Deposit Modal */}
      {isDepositModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Coins className="w-5 h-5 text-amber-500" />
                <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                  Müştəri Balansını Artır (Depozit)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsDepositModalOpen(false)}
                className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleQuickDepositSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                  Müştəri Adı *
                </label>
                <input
                  type="text"
                  required
                  value={depositName}
                  onChange={e => setDepositName(e.target.value)}
                  placeholder="məs: Əli, Ramin, Tural..."
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                  Qoyulan Məbləğ (AZN) *
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  required
                  value={depositAmount}
                  onChange={e => setDepositAmount(parseFloat(e.target.value) || 0)}
                  className="w-full px-3.5 py-2.5 text-base font-mono tabular-nums font-black rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white"
                />
                <div className="flex gap-1.5 mt-2">
                  {[5, 10, 15, 20, 50].map(val => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setDepositAmount(val)}
                      className={`flex-1 py-1 text-xs font-mono font-bold rounded-lg border transition-all ${
                        depositAmount === val
                          ? 'bg-amber-600 text-white border-amber-500'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700'
                      }`}
                    >
                      {val} ₼
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                  Qəbul Edilən Ödəniş Növü
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['naqd', 'kart', 'pos'] as const).map(pt => (
                    <button
                      key={pt}
                      type="button"
                      onClick={() => setDepositPaymentType(pt)}
                      className={`py-2 text-xs font-bold rounded-xl border transition-all ${
                        depositPaymentType === pt
                          ? 'bg-amber-600 text-white border-amber-500'
                          : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700'
                      }`}
                    >
                      {pt.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                  Qeyd
                </label>
                <input
                  type="text"
                  value={depositNote}
                  onChange={e => setDepositNote(e.target.value)}
                  placeholder="məs: 1 aylıq su depoziti"
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white"
                />
              </div>

              <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsDepositModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                >
                  Ləğv et
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl"
                >
                  Balansı Artır
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Barcode Scanner Modal */}
      <BarcodeScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScan={handleBarcodeScanned}
        title="Satış Üçün Barkod Oxut"
        allowContinuous={true}
      />

      {/* Debt Warning Modal */}
      <DebtWarningModal
        isOpen={isDebtModalOpen}
        onClose={() => setIsDebtModalOpen(false)}
        debtorName={debtWarningDetails.name}
        totalRemainingDebt={debtWarningDetails.amount}
        onProceedAnyway={() => setIsDebtModalOpen(false)}
        onGoToDebtPay={onNavigateToDebts}
      />
    </div>
  );
};
