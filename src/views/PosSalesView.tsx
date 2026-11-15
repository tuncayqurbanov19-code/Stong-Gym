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
  CameraOff,
  Lock,
  Unlock,
  Layers,
  Ban,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { PaymentType, Product, Sale, SalePaymentSplit } from '../types';
import {
  formatAZN,
  formatDateAZ,
  getTodayISODate,
  getCurrentTimeHHMM,
  getCurrentMonthKey,
  getMonthLabelAZ,
} from '../utils/dateUtils';
import { calculateAllProductStocks } from '../utils/stockCalculations';
import {
  calculateFinancialMetricsForRange,
  checkCustomerDebt,
  formatSalePaymentLabel,
  resolveSalePaymentSplit,
} from '../utils/financialCalculations';
import {
  buildBarcodeIndex,
  hasLongerBarcodePrefixInIndex,
  isRapidScanSequence,
  lookupBarcodeInIndex,
  normalizeBarcode,
} from '../utils/barcodeUtils';
import { playAlertSound, unlockAudioContext } from '../utils/notificationUtils';
import { InlineBarcodeCamera } from '../components/InlineBarcodeCamera';
import { DebtWarningModal } from '../components/DebtWarningModal';
import { TablePagination } from '../components/TablePagination';
import { exportSalesToCSV } from '../utils/exportUtils';

interface CartItem {
  product: Product;
  quantity: number;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

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
    cancelSale,
    currentUser,
    settings,
    showToast,
  } = useApp();

  const isAdmin = currentUser?.role === 'admin';
  const primaryColor = settings.primaryColor || '#E32636';
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
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [scannerFocusLock, setScannerFocusLock] = useState(true);
  const [scannerFocused, setScannerFocused] = useState(false);
  const [lastAddedProductId, setLastAddedProductId] = useState<string | null>(null);
  const [lastScanFeedback, setLastScanFeedback] = useState<{
    status: 'success' | 'error';
    message: string;
    barcode: string;
  } | null>(null);
  const scannerInputRef = useRef<HTMLInputElement | null>(null);
  const cartRef = useRef<CartItem[]>(cart);
  cartRef.current = cart;
  const scannerFocusLockRef = useRef<boolean>(scannerFocusLock);
  scannerFocusLockRef.current = scannerFocusLock;
  const scannerAutoTimerRef = useRef<number | null>(null);
  const blurRefocusTimerRef = useRef<number | null>(null);
  const lastAddedTimerRef = useRef<number | null>(null);
  const scannerIntervalsRef = useRef<{ lastTime: number; intervals: number[] }>({
    lastTime: 0,
    intervals: [],
  });
  const searchIntervalsRef = useRef<{ lastTime: number; intervals: number[] }>({
    lastTime: 0,
    intervals: [],
  });
  const searchAutoTimerRef = useRef<number | null>(null);
  const lastHandledScanRef = useRef<{ code: string; time: number; source: string }>({
    code: '',
    time: 0,
    source: '',
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [cancellingSale, setCancellingSale] = useState<Sale | null>(null);
  const [cancelReasonInput, setCancelReasonInput] = useState('');
  const [isSubmittingSale, setIsSubmittingSale] = useState(false);

  // Partial upfront payment for Borc mode
  const [borcUpfrontPaid, setBorcUpfrontPaid] = useState('');
  const [borcUpfrontMethod, setBorcUpfrontMethod] = useState<'naqd' | 'kart' | 'pos'>('naqd');

  // Mixed payment (Qarışıq) channel amounts
  const [mixNaqd, setMixNaqd] = useState('');
  const [mixKart, setMixKart] = useState('');
  const [mixPos, setMixPos] = useState('');
  const [mixBalans, setMixBalans] = useState('');
  const [mixBorc, setMixBorc] = useState('');

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
  const [showCancelledSales, setShowCancelledSales] = useState(true);
  const [historySearch, setHistorySearch] = useState('');
  const [salesHistoryPage, setSalesHistoryPage] = useState(1);
  const SALES_PAGE_SIZE = 15;
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthKey());

  useEffect(() => {
    setSalesHistoryPage(1);
  }, [filterStartDate, filterEndDate, filterProductId, filterPaymentType, showCancelledSales, historySearch]);

  const categories = useMemo(
    () => Array.from(new Set(products.map(p => p.category || 'Ümumi'))),
    [products]
  );

  // O(1) Barkod indeksi və Stok xəritəsi (ardıcıl skan zamanı gecikmə və donmanı sıfırlayır)
  const barcodeIndex = useMemo(() => buildBarcodeIndex(products), [products]);
  const stockMap = useMemo(
    () => calculateAllProductStocks(products, purchases, sales, settings.minStockThreshold),
    [products, purchases, sales, settings.minStockThreshold]
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
    return stockMap[product.id]?.activeStock ?? Number(product.initialStock) ?? 0;
  };

  const restoreScannerFocus = (force = false) => {
    if (typeof window === 'undefined') return;
    if (!force && !scannerFocusLockRef.current) return;
    if (activeSubTab !== 'pos' || isDepositModalOpen || editingSale || isDebtModalOpen) return;

    window.requestAnimationFrame(() => {
      const el = scannerInputRef.current;
      if (!el) return;
      const active = document.activeElement as HTMLElement | null;
      const activeTag = active?.tagName?.toLowerCase();
      // Başqa giriş xanasında (endirim, axtarış, borclu adı və s.) yazı yazılırsa fokus oğurlanmasın
      if (!force && active && active !== el && (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select')) {
        return;
      }
      el.focus({ preventScroll: true });
    });
  };

  const markProductHighlighted = (productId: string) => {
    setLastAddedProductId(productId);
    if (lastAddedTimerRef.current) {
      window.clearTimeout(lastAddedTimerRef.current);
    }
    lastAddedTimerRef.current = window.setTimeout(() => {
      setLastAddedProductId(prev => (prev === productId ? null : prev));
    }, 1200);
  };

  // Add product to cart with synchronous cartRef update to prevent race conditions during rapid consecutive scans
  const addToCart = (product: Product, shouldRefocusScanner = true): boolean => {
    const available = getAvailableStock(product);
    if (available <= 0) {
      showToast('error', `"${product.name}" anbarda bitib (Stok: ${available}).`);
      return false;
    }

    const currentCart = cartRef.current;
    const currentInCart = currentCart.find(item => item.product.id === product.id)?.quantity || 0;
    if (currentInCart + 1 > available) {
      showToast('error', `"${product.name}" üçün maksimum ${available} ədəd satıla bilər.`);
      return false;
    }

    const existing = currentCart.find(item => item.product.id === product.id);
    const nextCart = existing
      ? currentCart.map(item =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        )
      : [...currentCart, { product, quantity: 1 }];

    cartRef.current = nextCart;
    setCart(nextCart);
    markProductHighlighted(product.id);
    if (shouldRefocusScanner) {
      restoreScannerFocus();
    }
    return true;
  };

  const updateQuantity = (productId: string, delta: number) => {
    const prod = products.find(p => p.id === productId);
    const available = prod ? getAvailableStock(prod) : 99999;

    setCart(prev => {
      const next = prev
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
        .filter(Boolean) as CartItem[];
      cartRef.current = next;
      return next;
    });
    restoreScannerFocus();
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => {
      const next = prev.filter(item => item.product.id !== productId);
      cartRef.current = next;
      return next;
    });
    restoreScannerFocus();
  };

  const clearCart = () => {
    cartRef.current = [];
    setCart([]);
    setDebtorName('');
    setDebtorPhone('');
    setDiscountInput('');
    setBorcUpfrontPaid('');
    setBorcUpfrontMethod('naqd');
    setMixNaqd('');
    setMixKart('');
    setMixPos('');
    setMixBalans('');
    setMixBorc('');
    setPaymentType('naqd');
    setBarcodeInput('');
    setLastAddedProductId(null);
    lastWarnedDebtorRef.current = '';
    restoreScannerFocus();
  };

  // Cart total calculations
  const cartSubtotal = Math.round(
    cart.reduce((sum, item) => sum + item.product.salePrice * item.quantity, 0) * 100
  ) / 100;
  const parsedDiscount = Math.max(0, Math.round((parseFloat(discountInput) || 0) * 100) / 100);
  const cartDiscount = Math.min(cartSubtotal, parsedDiscount);
  const cartFinalTotal = Math.max(0, Math.round((cartSubtotal - cartDiscount) * 100) / 100);
  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  // Live mixed & partial credit calculations
  const mixSplitValues = {
    naqd: Math.max(0, round2(parseFloat(mixNaqd) || 0)),
    kart: Math.max(0, round2(parseFloat(mixKart) || 0)),
    pos: Math.max(0, round2(parseFloat(mixPos) || 0)),
    balans: Math.max(0, round2(parseFloat(mixBalans) || 0)),
    borc: Math.max(0, round2(parseFloat(mixBorc) || 0)),
  };
  const mixSumTotal = round2(
    mixSplitValues.naqd +
      mixSplitValues.kart +
      mixSplitValues.pos +
      mixSplitValues.balans +
      mixSplitValues.borc
  );
  const mixRemainingDelta = round2(cartFinalTotal - mixSumTotal);

  const upfrontPaidNum = Math.max(0, round2(parseFloat(borcUpfrontPaid) || 0));
  const borcRemainingNum = Math.max(0, round2(cartFinalTotal - upfrontPaidNum));

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

    // Transport qatında (auto-timer + Enter və ya HID + input) < 80ms təkrar atəşin qarşısını al;
    // lakin eyni məhsulu ardıcıl ikinci dəfə skan edəndə (>= 80ms) dərhal miqdarı artırır.
    const now = Date.now();
    if (
      source !== 'camera' &&
      lastHandledScanRef.current.code === clean &&
      now - lastHandledScanRef.current.time < 80
    ) {
      return false;
    }
    lastHandledScanRef.current = { code: clean, time: now, source };

    const found = lookupBarcodeInIndex(barcodeIndex, clean);
    if (found) {
      const available = getAvailableStock(found);
      const added = addToCart(found, source !== 'search');
      if (!added) {
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

      const updatedQty = cartRef.current.find(i => i.product.id === found.id)?.quantity || 1;
      try {
        playAlertSound('success');
      } catch {
        // Ignore audio errors
      }
      setLastScanFeedback({
        status: 'success',
        barcode: found.barcode,
        message: `${found.name} × ${updatedQty} (${formatAZN(found.salePrice * updatedQty)})`,
      });
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

  const processScannedBarcodeRef = useRef(processScannedBarcode);
  processScannedBarcodeRef.current = processScannedBarcode;

  const handleBarcodeScanned = (barcode: string) => {
    processScannedBarcodeRef.current(barcode, 'camera');
  };

  const submitScannerInputImmediate = (rawVal: string) => {
    if (scannerAutoTimerRef.current) {
      window.clearTimeout(scannerAutoTimerRef.current);
      scannerAutoTimerRef.current = null;
    }
    setBarcodeInput('');
    scannerIntervalsRef.current = { lastTime: 0, intervals: [] };
    if (normalizeBarcode(rawVal)) {
      processScannedBarcode(rawVal, 'scanner');
    }
    restoreScannerFocus(true);
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

    const matched = lookupBarcodeInIndex(barcodeIndex, clean);
    const rapid = isRapidScanSequence(scannerIntervalsRef.current.intervals);

    if (matched) {
      const hasLonger = hasLongerBarcodePrefixInIndex(barcodeIndex, clean, matched.id);
      const delay = rapid ? 60 : hasLonger ? 380 : 120;
      scannerAutoTimerRef.current = window.setTimeout(() => {
        setBarcodeInput('');
        scannerIntervalsRef.current = { lastTime: 0, intervals: [] };
        processScannedBarcodeRef.current(nextVal, 'scanner');
        restoreScannerFocus(true);
      }, delay);
    } else if (rapid && clean.length >= 4) {
      // Rapid hardware scan without Enter suffix -> flush quickly
      scannerAutoTimerRef.current = window.setTimeout(() => {
        setBarcodeInput('');
        scannerIntervalsRef.current = { lastTime: 0, intervals: [] };
        processScannedBarcodeRef.current(nextVal, 'scanner');
        restoreScannerFocus(true);
      }, 170);
    }
  };

  // Keep scanner permanently ready when on POS tab and focus lock is ON
  useEffect(() => {
    if (scannerFocusLock && activeSubTab === 'pos' && !isDepositModalOpen && !editingSale && !cancellingSale && !isDebtModalOpen) {
      restoreScannerFocus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scannerFocusLock, activeSubTab, isDepositModalOpen, editingSale, cancellingSale, isDebtModalOpen]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (scannerAutoTimerRef.current) window.clearTimeout(scannerAutoTimerRef.current);
      if (searchAutoTimerRef.current) window.clearTimeout(searchAutoTimerRef.current);
      if (blurRefocusTimerRef.current) window.clearTimeout(blurRefocusTimerRef.current);
      if (lastAddedTimerRef.current) window.clearTimeout(lastAddedTimerRef.current);
    };
  }, []);

  // Hardware USB/Bluetooth keyboard-wedge barcode scanner listener anywhere on POS tab (even while inline camera is open)
  const scanBufferRef = useRef<{ chars: string; lastTime: number; intervals: number[]; flushTimer: number | null }>({
    chars: '',
    lastTime: 0,
    intervals: [],
    flushTimer: null,
  });
  useEffect(() => {
    if (activeSubTab !== 'pos' || isDepositModalOpen || editingSale || cancellingSale || isDebtModalOpen) return;

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
        processScannedBarcodeRef.current(buf, 'hid');
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      const now = Date.now();
      const gap = now - scanBufferRef.current.lastTime;
      if (gap > 160) {
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
        }, 150);
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
  }, [activeSubTab, isDepositModalOpen, editingSale, cancellingSale, isDebtModalOpen]);

  // Submit Sale
  const handleCompleteSale = () => {
    if (cart.length === 0 || isSubmittingSale) return;

    let finalPaymentType: PaymentType = paymentType;
    let finalSplit: SalePaymentSplit | undefined;
    let finalDebtorName: string | undefined;
    let finalDebtorPhone: string | undefined;

    if (paymentType === 'borc') {
      if (!debtorName.trim()) {
        showToast('error', 'Zəhmət olmasa borclunun adını və soyadını daxil edin!');
        return;
      }
      if (upfrontPaidNum > cartFinalTotal + 0.001) {
        showToast('error', `Öndən ödənilən məbləğ yekun məbləğdən (${formatAZN(cartFinalTotal)}) çox ola bilməz!`);
        return;
      }
      finalDebtorName = debtorName.trim();
      finalDebtorPhone = debtorPhone.trim() || undefined;
      if (upfrontPaidNum > 0.009 && borcRemainingNum > 0.009) {
        finalPaymentType = 'qarisik';
        finalSplit = {
          [borcUpfrontMethod]: upfrontPaidNum,
          borc: borcRemainingNum,
        };
      } else if (upfrontPaidNum >= cartFinalTotal - 0.009 && cartFinalTotal > 0) {
        finalPaymentType = borcUpfrontMethod;
        finalSplit = { [borcUpfrontMethod]: cartFinalTotal };
      } else {
        finalPaymentType = 'borc';
        finalSplit = { borc: cartFinalTotal };
      }
    } else if (paymentType === 'balans') {
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
      if (existing.balance < cartFinalTotal - 0.009) {
        showToast(
          'error',
          `Balansda kifayət qədər vəsait yoxdur! Cari balans: ${formatAZN(existing.balance)}, Tələb olunan: ${formatAZN(cartFinalTotal)}`
        );
        return;
      }
      finalDebtorName = custName;
    } else if (paymentType === 'qarisik') {
      if (Math.abs(mixSumTotal - cartFinalTotal) > 0.01) {
        showToast(
          'error',
          `Qarışıq ödəniş kanallarının cəmi (${formatAZN(mixSumTotal)}) yekun məbləğə (${formatAZN(cartFinalTotal)}) bərabər olmalıdır!`
        );
        return;
      }
      if (mixSplitValues.borc > 0.009 && !debtorName.trim()) {
        showToast('error', 'Qarışıq ödənişdə borc hissəsi olduğu üçün borclunun adını daxil edin!');
        return;
      }
      if (mixSplitValues.balans > 0.009) {
        const custName = selectedCustomerAccount.trim();
        if (!custName) {
          showToast('error', 'Balans hissəsi üçün müştəri hesabını seçin!');
          return;
        }
        const existing = customerAccounts.find(c => c.name.toLowerCase() === custName.toLowerCase());
        if (!existing) {
          showToast('error', `"${custName}" adlı müştəri hesabı tapılmadı!`);
          return;
        }
        if (existing.balance < mixSplitValues.balans - 0.009) {
          showToast(
            'error',
            `${custName} balansında kifayət qədər vəsait yoxdur (${formatAZN(existing.balance)}).`
          );
          return;
        }
        finalDebtorName = debtorName.trim() || custName;
      } else if (mixSplitValues.borc > 0.009) {
        finalDebtorName = debtorName.trim();
      }
      if (mixSplitValues.borc > 0.009) {
        finalDebtorPhone = debtorPhone.trim() || undefined;
      }
      finalSplit = mixSplitValues;
    }

    setIsSubmittingSale(true);
    try {
      const res = addSale({
        items: cart.map(i => ({ productId: i.product.id, quantity: i.quantity })),
        paymentType: finalPaymentType,
        paymentSplit: finalSplit,
        debtorName: finalDebtorName,
        debtorPhone: finalDebtorPhone,
        discountAmount: cartDiscount,
        customDate,
        customTime,
      });

      if (res.success) {
        const msg =
          finalPaymentType === 'borc'
            ? `Nisyə satış qeydə alındı: ${finalDebtorName} (${formatAZN(cartFinalTotal)})`
            : finalPaymentType === 'qarisik' && (finalSplit?.borc || 0) > 0
            ? `Qarışıq satış (${formatAZN(cartFinalTotal - (finalSplit?.borc || 0))} ödənildi + ${formatAZN(finalSplit?.borc || 0)} borc) qeydə alındı`
            : `Satış tamamlandı: ${formatAZN(cartFinalTotal)}`;
        showToast('success', msg);
        clearCart();
        setCustomTime(getCurrentTimeHHMM());
        setLastScanFeedback(null);
        scannerIntervalsRef.current = { lastTime: 0, intervals: [] };
        scanBufferRef.current.chars = '';
        scanBufferRef.current.intervals = [];
        // Satış bitən kimi dərhal yeni müştəri üçün barkod skanerinə fokus qaytar
        window.setTimeout(() => {
          restoreScannerFocus(true);
        }, 0);
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
        customerAccounts,
        startDate: todayISO,
        endDate: todayISO,
      }),
    [sales, debts, purchases, expenses, customerAccounts, todayISO]
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
        if (!showCancelledSales && s.isCancelled) return false;
        if (effectiveStart && s.date < effectiveStart) return false;
        if (effectiveEnd && s.date > effectiveEnd) return false;
        if (filterPaymentType !== 'all') {
          if (filterPaymentType === 'qarisik') {
            if (s.paymentType !== 'qarisik') return false;
          } else {
            const split = resolveSalePaymentSplit(s);
            if ((split[filterPaymentType] || 0) <= 0.009) return false;
          }
        }
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
  }, [sales, showCancelledSales, effectiveStart, effectiveEnd, filterPaymentType, filterProductId, historySearch]);

  const filteredMetrics = useMemo(
    () =>
      calculateFinancialMetricsForRange({
        sales: filteredHistorySales,
        debts,
        purchases,
        expenses,
        customerAccounts,
        startDate: effectiveStart || '2000-01-01',
        endDate: effectiveEnd || '2099-12-31',
        includeUnconfirmedSales: true,
      }),
    [filteredHistorySales, debts, purchases, expenses, customerAccounts, effectiveStart, effectiveEnd]
  );

  const activeFilteredSales = useMemo(
    () => filteredHistorySales.filter(s => !s.isCancelled),
    [filteredHistorySales]
  );

  const dayConfirmed =
    isSingleDay &&
    activeFilteredSales.length > 0 &&
    activeFilteredSales.every(s => s.isConfirmed);

  // Filtered product breakdown (excludes cancelled sales)
  const filteredProductStats = useMemo(() => {
    const stats: Record<string, { name: string; quantity: number; revenue: number }> = {};
    for (const s of activeFilteredSales) {
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
  }, [activeFilteredSales, filterProductId]);

  // Monthly Sales Summary calculations (excludes cancelled sales)
  const monthSalesList = sales.filter(s => !s.isCancelled && s.date.startsWith(selectedMonth));
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
    if (sale.isCancelled) {
      return {
        label: 'Ləğv edilib',
        status: sale.cancelReason || 'Dövriyyədən çıxarılıb',
        cls: 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/60 border-red-300 dark:border-red-800',
      };
    }
    switch (sale.paymentType) {
      case 'naqd':
        return { label: 'Nağd', status: sale.isConfirmed ? 'Ödənildi' : 'Gözləyir', cls: 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-900' };
      case 'kart':
        return { label: 'Bank Kartı', status: sale.isConfirmed ? 'Ödənildi' : 'Gözləyir', cls: 'text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 border-blue-200 dark:border-blue-900' };
      case 'pos':
        return { label: 'POS Terminal', status: sale.isConfirmed ? 'Ödənildi' : 'Gözləyir', cls: 'text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 border-indigo-200 dark:border-indigo-900' };
      case 'balans':
        return { label: 'Müştəri Balansı', status: 'Balansdan', cls: 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-900' };
      case 'borc': {
        const linked = debts.find(d => !d.isCancelled && d.saleId === sale.id);
        const statusText = linked?.status === 'odanilib' ? 'Ödənilib' : linked?.status === 'qismen' ? 'Qismən ödənilib' : 'Nisyə (Borc)';
        return { label: 'Nisyə', status: statusText, cls: 'text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-900' };
      }
      case 'qarisik': {
        const splitLabel = formatSalePaymentLabel(sale);
        const linked = debts.find(d => !d.isCancelled && d.saleId === sale.id);
        const statusText = linked
          ? linked.status === 'odanilib'
            ? 'Borc bağlanıb'
            : `Qalıq borc: ${formatAZN(linked.remainingAmount)}`
          : 'Qarışıq ödəniş';
        return {
          label: splitLabel,
          status: statusText,
          cls: 'text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 border-purple-200 dark:border-purple-900',
        };
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

  const handleConfirmCancelSale = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellingSale) return;
    const res = cancelSale(cancellingSale.id, cancelReasonInput.trim() || undefined);
    if (res.success) {
      setCancellingSale(null);
      setCancelReasonInput('');
    } else if (res.error) {
      showToast('error', res.error);
    }
  };

  return (
    <div className="space-y-6 pb-12 max-w-7xl mx-auto">
      {/* Top Header & Sub-Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-[#E5E5E5] dark:border-[#262626]">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-[#171717] dark:text-white tracking-tight">
            Kassa & Satış İdarəetməsi
          </h2>
          <p className="text-xs sm:text-sm text-[#888888] mt-0.5">
            Sürətli POS satışı, barkod skan, endirim, nisyə qeydiyyatı və əməliyyat tarixçəsi
          </p>
        </div>

        {/* Sub-nav tabs */}
        <div className="flex items-center p-1 bg-white dark:bg-[#171717] border border-[#E5E5E5] dark:border-[#262626] rounded-[12px] overflow-x-auto gap-1">
          <button
            type="button"
            onClick={() => setActiveSubTab('pos')}
            style={activeSubTab === 'pos' ? { backgroundColor: primaryColor } : undefined}
            className={`px-3 py-1.5 text-xs font-semibold rounded-[8px] transition-colors duration-150 whitespace-nowrap shrink-0 ${
              activeSubTab === 'pos'
                ? 'text-white'
                : 'text-[#888888] hover:text-[#171717] dark:hover:text-white'
            }`}
          >
            Satış Terminalı
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('daily')}
            style={activeSubTab === 'daily' ? { backgroundColor: primaryColor } : undefined}
            className={`px-3 py-1.5 text-xs font-semibold rounded-[8px] transition-colors duration-150 whitespace-nowrap shrink-0 ${
              activeSubTab === 'daily'
                ? 'text-white'
                : 'text-[#888888] hover:text-[#171717] dark:hover:text-white'
            }`}
          >
            Satış Tarixçəsi ({sales.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('monthly')}
            style={activeSubTab === 'monthly' ? { backgroundColor: primaryColor } : undefined}
            className={`px-3 py-1.5 text-xs font-semibold rounded-[8px] transition-colors duration-150 whitespace-nowrap shrink-0 ${
              activeSubTab === 'monthly'
                ? 'text-white'
                : 'text-[#888888] hover:text-[#171717] dark:hover:text-white'
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
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="p-3.5 rounded-[14px] bg-white dark:bg-[#171717] border border-[#E5E5E5] dark:border-[#262626]">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#888888] block">
                Bugünkü Ümumi Satış
              </span>
              <span className="text-base font-bold font-mono tabular-nums text-[#171717] dark:text-white mt-1 block">
                {formatAZN(todayMetrics.grossSalesTotal)}
              </span>
            </div>

            <div className="p-3.5 rounded-[14px] bg-white dark:bg-[#171717] border border-[#E5E5E5] dark:border-[#262626]">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block">
                Nağd Satış
              </span>
              <span className="text-base font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400 mt-1 block">
                {formatAZN(todayMetrics.cashSales)}
              </span>
            </div>

            <div className="p-3.5 rounded-[14px] bg-white dark:bg-[#171717] border border-[#E5E5E5] dark:border-[#262626]">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400 block">
                Kart / POS Satış
              </span>
              <span className="text-base font-bold font-mono tabular-nums text-blue-600 dark:text-blue-400 mt-1 block">
                {formatAZN(todayMetrics.cardSales + todayMetrics.posSales)}
              </span>
            </div>

            <div className="p-3.5 rounded-[14px] bg-white dark:bg-[#171717] border border-[#E32636]/30">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#E32636] block">
                Nisyə (Kassasız)
              </span>
              <span className="text-base font-bold font-mono tabular-nums text-[#E32636] mt-1 block">
                {formatAZN(todayMetrics.creditSales)}
              </span>
            </div>

            <div className="p-3.5 rounded-[14px] bg-white dark:bg-[#171717] border border-[#E5E5E5] dark:border-[#262626]">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 block">
                Borcdan Daxilolan
              </span>
              <span className="text-base font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400 mt-1 block">
                {formatAZN(todayMetrics.debtCollectedTotal)}
              </span>
            </div>

            <div className="p-3.5 rounded-[14px] bg-white dark:bg-[#171717] border border-emerald-500/35">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 block">
                Faktiki Kassaya Girən
              </span>
              <span className="text-base font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400 mt-1 block">
                {formatAZN(todayMetrics.actualDrawerInflow)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Product Selection Grid */}
            <div className="lg:col-span-7 xl:col-span-8 space-y-3">
              {/* Dedicated Hardware & Manual Barcode Scanner Bar + Optional Camera Toggle Icon */}
              <div className="p-3 rounded-[14px] bg-white dark:bg-[#171717] border border-[#E5E5E5] dark:border-[#262626] space-y-2.5">
                <div className="flex items-center gap-2">
                  <form
                    onSubmit={e => {
                      e.preventDefault();
                      if (!barcodeInput.trim()) return;
                      submitScannerInputImmediate(barcodeInput);
                    }}
                    className="relative flex-1"
                  >
                    <ScanBarcode
                      className={`w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors ${
                        scannerFocused ? 'text-emerald-500' : 'text-[#E32636]'
                      }`}
                    />
                    <input
                      ref={scannerInputRef}
                      type="text"
                      value={barcodeInput}
                      onFocus={() => {
                        setScannerFocused(true);
                        if (blurRefocusTimerRef.current) {
                          window.clearTimeout(blurRefocusTimerRef.current);
                          blurRefocusTimerRef.current = null;
                        }
                      }}
                      onBlur={() => {
                        setScannerFocused(false);
                        if (!scannerFocusLockRef.current) return;
                        if (blurRefocusTimerRef.current) {
                          window.clearTimeout(blurRefocusTimerRef.current);
                        }
                        blurRefocusTimerRef.current = window.setTimeout(() => {
                          restoreScannerFocus(false);
                        }, 70);
                      }}
                      onChange={e => handleScannerInputChange(e.target.value)}
                      onKeyDown={e => {
                        if ((e.key === 'Tab' || e.key === 'Enter') && barcodeInput.trim()) {
                          e.preventDefault();
                          submitScannerInputImmediate(barcodeInput);
                        }
                      }}
                      placeholder="Barkod skan edin — ardıcıl oxuyur, düyməyə ehtiyac yoxdur..."
                      aria-label="Barkod skaner girişi"
                      className={`w-full pl-10 pr-24 py-2 text-sm font-mono rounded-[10px] border bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-white focus:outline-none focus:ring-2 transition-colors duration-150 ${
                        scannerFocused
                          ? 'border-emerald-500/80 focus:ring-emerald-500'
                          : 'border-[#E5E5E5] dark:border-[#2E2E2E] focus:ring-[#E32636]'
                      }`}
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                      {barcodeInput ? (
                        <button
                          type="button"
                          onClick={() => {
                            setBarcodeInput('');
                            restoreScannerFocus(true);
                          }}
                          aria-label="Barkodu təmizlə"
                          className="p-0.5 text-[#888888] hover:text-[#171717] dark:hover:text-white"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      ) : (
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-[6px] border ${
                            scannerFocused
                              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/70'
                              : 'bg-white dark:bg-[#171717] text-[#888888] border-[#E5E5E5] dark:border-[#2E2E2E]'
                          }`}
                        >
                          {scannerFocused ? 'Hazır' : 'Skaner'}
                        </span>
                      )}
                    </div>
                  </form>

                  {/* Auto-focus lock button */}
                  <button
                    type="button"
                    onClick={() => {
                      setScannerFocusLock(prev => {
                        const next = !prev;
                        scannerFocusLockRef.current = next;
                        if (next) {
                          window.setTimeout(() => restoreScannerFocus(true), 0);
                        }
                        return next;
                      });
                    }}
                    title={
                      scannerFocusLock
                        ? 'Skaner daim hazır vəziyyətdədir (kilidi açmaq üçün klikləyin)'
                        : 'Skaner fokus kilidini aktivləşdir'
                    }
                    aria-label="Skaner fokus kilidi"
                    aria-pressed={scannerFocusLock}
                    className={`p-2.5 sm:px-3 sm:py-2 text-xs font-semibold rounded-[10px] border transition-colors whitespace-nowrap flex items-center gap-1.5 shrink-0 ${
                      scannerFocusLock
                        ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300'
                        : 'bg-[#F5F5F5] dark:bg-[#222222] border-[#E5E5E5] dark:border-[#2E2E2E] text-[#888888] hover:text-[#171717] dark:hover:text-white'
                    }`}
                  >
                    {scannerFocusLock ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                    <span className="hidden sm:inline">{scannerFocusLock ? 'Daim Hazır' : 'Fokus Sərbəst'}</span>
                  </button>

                  {/* Small optional Camera Toggle Icon (OFF by default) */}
                  <button
                    type="button"
                    onClick={() => {
                      unlockAudioContext();
                      setIsCameraActive(prev => !prev);
                      restoreScannerFocus();
                    }}
                    aria-label={isCameraActive ? 'Kameranı bağla' : 'Kamera ilə barkod oxut'}
                    aria-pressed={isCameraActive}
                    title={isCameraActive ? 'Kameranı bağla' : 'Kamera ilə barkod oxut'}
                    style={isCameraActive ? { backgroundColor: primaryColor } : undefined}
                    className={`p-2.5 rounded-[10px] border flex items-center justify-center shrink-0 transition-colors active:scale-95 ${
                      isCameraActive
                        ? 'text-white border-transparent'
                        : 'bg-[#F5F5F5] dark:bg-[#222222] border-[#E5E5E5] dark:border-[#2E2E2E] text-[#171717] dark:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-[#2a2a2a]'
                    }`}
                  >
                    {isCameraActive ? <CameraOff className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
                  </button>
                </div>

                {/* Inline Camera Panel (only mounted/requested when user clicks camera icon) */}
                {isCameraActive && (
                  <InlineBarcodeCamera
                    isActive={isCameraActive}
                    onClose={() => {
                      setIsCameraActive(false);
                      restoreScannerFocus(true);
                    }}
                    onScan={handleBarcodeScanned}
                    barcodeIndex={barcodeIndex}
                    lastScanFeedback={lastScanFeedback}
                  />
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                  <span className="text-[#888888]">
                    USB/Bluetooth skaner daim aktivdir · eyni məhsul yenidən skan edildikdə sayı artır
                  </span>
                  {lastScanFeedback && (
                    <span
                      className={`font-semibold px-2.5 py-0.5 rounded-[8px] border ${
                        lastScanFeedback.status === 'success'
                          ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800/70 text-emerald-700 dark:text-emerald-300'
                          : 'bg-[#E32636]/10 border-[#E32636]/25 text-[#E32636]'
                      }`}
                    >
                      {lastScanFeedback.barcode}: {lastScanFeedback.message}
                    </span>
                  )}
                </div>
              </div>

              {/* Search row */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#888888]" />
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
                          const ok = processScannedBarcodeRef.current(val, 'search');
                          if (ok) {
                            setSearchQuery('');
                          }
                          searchIntervalsRef.current = { lastTime: 0, intervals: [] };
                        }, 130);
                      }
                    }}
                    onKeyDown={e => {
                      if ((e.key === 'Enter' || e.key === 'Tab') && searchQuery.trim()) {
                        const matched = lookupBarcodeInIndex(barcodeIndex, searchQuery);
                        if (matched) {
                          e.preventDefault();
                          if (searchAutoTimerRef.current) {
                            window.clearTimeout(searchAutoTimerRef.current);
                            searchAutoTimerRef.current = null;
                          }
                          processScannedBarcodeRef.current(searchQuery, 'search');
                          setSearchQuery('');
                        } else if (e.key === 'Enter' && /^[0-9]{4,}$/.test(searchQuery.trim())) {
                          e.preventDefault();
                          processScannedBarcodeRef.current(searchQuery, 'search');
                        }
                      }
                    }}
                    placeholder="Məhsul adı və ya barkodla axtarın (Enter)..."
                    className="w-full pl-10 pr-8 py-2.5 text-sm rounded-[10px] border border-[#E5E5E5] dark:border-[#262626] bg-white dark:bg-[#171717] text-[#171717] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#E32636]"
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
              </div>

              {/* Category filter tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                <button
                  type="button"
                  onClick={() => setSelectedCategory('all')}
                  style={selectedCategory === 'all' ? { backgroundColor: primaryColor } : undefined}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-[8px] whitespace-nowrap shrink-0 transition-colors ${
                    selectedCategory === 'all'
                      ? 'text-white'
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
                    className={`px-3 py-1.5 text-xs font-semibold rounded-[8px] whitespace-nowrap shrink-0 transition-colors ${
                      selectedCategory === cat
                        ? 'text-white'
                        : 'bg-white dark:bg-[#171717] text-[#888888] border border-[#E5E5E5] dark:border-[#262626] hover:text-[#171717] dark:hover:text-white'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Products Grid */}
              {filteredProducts.length === 0 ? (
                <div className="py-12 text-center bg-white dark:bg-[#171717] rounded-[14px] border border-[#E5E5E5] dark:border-[#262626] text-[#888888] text-xs">
                  Axtarışa uyğun məhsul tapılmadı.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 max-h-[640px] overflow-y-auto pr-1">
                  {filteredProducts.map(product => {
                    const stock = stockMap[product.id] ?? {
                      activeStock: Number(product.initialStock) || 0,
                      isLowStock: false,
                    };
                    const inCart = cart.find(i => i.product.id === product.id);
                    const isOutOfStock = stock.activeStock <= 0;

                    return (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => addToCart(product)}
                        className={`p-3.5 rounded-[12px] border text-left flex flex-col justify-between transition-colors duration-150 active:scale-[0.98] relative ${
                          isOutOfStock
                            ? 'border-[#E5E5E5] dark:border-[#262626] bg-[#F5F5F5] dark:bg-[#171717]/60 opacity-55 cursor-not-allowed'
                            : inCart
                            ? 'border-[#E32636] bg-[#E32636]/5 dark:bg-[#E32636]/10 ring-1 ring-[#E32636]'
                            : 'border-[#E5E5E5] dark:border-[#262626] bg-white dark:bg-[#171717] hover:border-neutral-400 dark:hover:border-[#3a3a3a]'
                        }`}
                      >
                        {inCart && (
                          <span
                            style={{ backgroundColor: primaryColor }}
                            className="absolute top-2 right-2 min-w-5 h-5 px-1.5 rounded-[6px] text-white font-bold text-[11px] font-mono tabular-nums flex items-center justify-center"
                          >
                            {inCart.quantity}
                          </span>
                        )}

                        <div className={inCart ? 'pr-7' : undefined}>
                          <div className="flex items-center justify-between text-[11px] text-[#888888] mb-1">
                            <span className="truncate">
                              {product.category}
                              {product.volume ? ` · ${product.volume}` : ''}
                            </span>
                          </div>

                          <h4 className="text-xs sm:text-sm font-semibold text-[#171717] dark:text-white line-clamp-2 leading-snug">
                            {product.name}
                          </h4>
                        </div>

                        <div className="mt-3 pt-2 border-t border-[#E5E5E5] dark:border-[#262626] flex items-center justify-between gap-2">
                          <span className="text-xs sm:text-sm font-mono tabular-nums font-bold text-[#E32636]">
                            {formatAZN(product.salePrice)}
                          </span>

                          <span
                            className={`text-[11px] font-mono tabular-nums ${
                              isOutOfStock
                                ? 'text-[#E32636] font-semibold'
                                : stock.isLowStock
                                ? 'text-amber-600 dark:text-amber-400 font-semibold'
                                : 'text-[#888888]'
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
            <div className="lg:col-span-5 xl:col-span-4 bg-white dark:bg-[#171717] rounded-[14px] border border-[#E5E5E5] dark:border-[#262626] p-5 space-y-4 sticky top-16">
              <div className="flex items-center justify-between pb-3 border-b border-[#E5E5E5] dark:border-[#262626]">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="w-5 h-5 text-[#E32636]" />
                  <h3 className="text-base font-bold text-[#171717] dark:text-white">
                    Səbət ({cartItemCount} əd.)
                  </h3>
                </div>
                {cart.length > 0 && (
                  <button
                    type="button"
                    onClick={clearCart}
                    className="text-xs text-[#E32636] hover:underline font-semibold"
                  >
                    Təmizlə
                  </button>
                )}
              </div>

              {/* Cart Items List */}
              {cart.length === 0 ? (
                <div className="py-10 text-center text-[#888888] space-y-2">
                  <ShoppingCart className="w-8 h-8 mx-auto text-[#888888]/60" />
                  <p className="text-xs">Səbət boşdur. Məhsul seçin və ya barkod oxudun.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1 divide-y divide-[#E5E5E5] dark:divide-[#262626]">
                  {cart.map(item => {
                    const isJustScanned = lastAddedProductId === item.product.id;
                    return (
                    <div
                      key={item.product.id}
                      className={`pt-2 px-1.5 pb-1 rounded-[8px] flex items-center justify-between gap-2 transition-colors ${
                        isJustScanned ? 'bg-emerald-50/90 dark:bg-emerald-950/35' : ''
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-[#171717] dark:text-white truncate">
                          {item.product.name}
                        </p>
                        <p className="text-[11px] font-mono tabular-nums text-[#888888]">
                          {item.quantity} × {formatAZN(item.product.salePrice)} ={' '}
                          <strong className="text-[#171717] dark:text-white">
                            {formatAZN(item.quantity * item.product.salePrice)}
                          </strong>
                        </p>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.product.id, -1)}
                          aria-label="Sayını azalt"
                          className="w-7 h-7 rounded-[8px] bg-[#F5F5F5] dark:bg-[#222222] hover:bg-neutral-200 dark:hover:bg-[#2a2a2a] text-[#171717] dark:text-neutral-200 border border-[#E5E5E5] dark:border-[#2E2E2E] flex items-center justify-center transition-colors"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="w-6 text-center font-mono tabular-nums font-bold text-xs text-[#171717] dark:text-white">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.product.id, 1)}
                          aria-label="Sayını artır"
                          className="w-7 h-7 rounded-[8px] bg-[#F5F5F5] dark:bg-[#222222] hover:bg-neutral-200 dark:hover:bg-[#2a2a2a] text-[#171717] dark:text-neutral-200 border border-[#E5E5E5] dark:border-[#2E2E2E] flex items-center justify-center transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeFromCart(item.product.id)}
                          aria-label="Səbətdən sil"
                          className="w-7 h-7 rounded-[8px] text-[#E32636] hover:bg-[#E32636]/10 flex items-center justify-center ml-0.5 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}

              {/* Discount & Total Display */}
              <div className="p-3.5 rounded-[12px] bg-[#F5F5F5] dark:bg-[#222222] border border-[#E5E5E5] dark:border-[#2E2E2E] space-y-2.5">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-[#888888] flex items-center gap-1">
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
                      className="w-24 px-2.5 py-1 text-right font-mono tabular-nums text-xs font-bold rounded-[8px] border border-[#E5E5E5] dark:border-[#2E2E2E] bg-white dark:bg-[#171717] text-[#171717] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#E32636]"
                    />
                  </div>
                </div>

                {cartDiscount > 0 && (
                  <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-[#888888]">
                    <span>Ara cəm: {formatAZN(cartSubtotal)}</span>
                    <span className="text-amber-600 dark:text-amber-400 font-bold">
                      Endirim: −{formatAZN(cartDiscount)}
                    </span>
                  </div>
                )}

                <div className="pt-2 border-t border-[#E5E5E5] dark:border-[#2E2E2E] flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-[#888888]">
                      Yekun Məbləğ
                    </span>
                    <p className="text-[11px] text-[#888888]">
                      {paymentType === 'borc'
                        ? upfrontPaidNum > 0
                          ? `${formatAZN(upfrontPaidNum)} indi · ${formatAZN(borcRemainingNum)} borc`
                          : 'Kassaya əlavə olunmur (Tam Nisyə)'
                        : paymentType === 'qarisik'
                        ? Math.abs(mixRemainingDelta) <= 0.01
                          ? 'Bölgü tamamlandı'
                          : `Qalıq bölgü: ${formatAZN(mixRemainingDelta)}`
                        : paymentType === 'balans'
                        ? 'Balansdan çıxılır · Kassa dəyişmir'
                        : settings.autoConfirmSales
                        ? 'Avtomatik təsdiq aktivdir'
                        : 'Gün sonunda təsdiqlənəcək'}
                    </p>
                  </div>
                  <div className="text-2xl font-bold font-mono tabular-nums text-[#171717] dark:text-white">
                    {formatAZN(cartFinalTotal)}
                  </div>
                </div>
              </div>

              {/* Payment Method Selector (6 modes) */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-[#888888] uppercase tracking-wider">
                  Ödəniş Növü
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentType('naqd')}
                    className={`py-2 px-2.5 rounded-[10px] border text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                      paymentType === 'naqd'
                        ? 'bg-emerald-600 text-white border-emerald-500'
                        : 'bg-[#F5F5F5] dark:bg-[#222222] border-[#E5E5E5] dark:border-[#2E2E2E] text-[#171717] dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-[#2a2a2a]'
                    }`}
                  >
                    <Banknote className="w-4 h-4 shrink-0" />
                    <span>Nağd</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentType('kart')}
                    className={`py-2 px-2.5 rounded-[10px] border text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                      paymentType === 'kart'
                        ? 'bg-blue-600 text-white border-blue-500'
                        : 'bg-[#F5F5F5] dark:bg-[#222222] border-[#E5E5E5] dark:border-[#2E2E2E] text-[#171717] dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-[#2a2a2a]'
                    }`}
                  >
                    <CreditCard className="w-4 h-4 shrink-0" />
                    <span>Kart</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentType('pos')}
                    className={`py-2 px-2.5 rounded-[10px] border text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                      paymentType === 'pos'
                        ? 'bg-[#E32636] text-white border-[#E32636]'
                        : 'bg-[#F5F5F5] dark:bg-[#222222] border-[#E5E5E5] dark:border-[#2E2E2E] text-[#171717] dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-[#2a2a2a]'
                    }`}
                  >
                    <Smartphone className="w-4 h-4 shrink-0" />
                    <span>POS</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentType('balans')}
                    className={`py-2 px-2.5 rounded-[10px] border text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                      paymentType === 'balans'
                        ? 'bg-amber-600 text-white border-amber-500'
                        : 'bg-[#F5F5F5] dark:bg-[#222222] border-[#E5E5E5] dark:border-[#2E2E2E] text-[#171717] dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-[#2a2a2a]'
                    }`}
                  >
                    <Wallet className="w-4 h-4 shrink-0" />
                    <span>Balans</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentType('borc')}
                    className={`py-2 px-2.5 rounded-[10px] border text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                      paymentType === 'borc'
                        ? 'bg-rose-700 text-white border-rose-600'
                        : 'bg-[#F5F5F5] dark:bg-[#222222] border-[#E5E5E5] dark:border-[#2E2E2E] text-[#171717] dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-[#2a2a2a]'
                    }`}
                  >
                    <BookOpen className="w-4 h-4 shrink-0" />
                    <span>Nisyə (Borc)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentType('qarisik')}
                    className={`py-2 px-2.5 rounded-[10px] border text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                      paymentType === 'qarisik'
                        ? 'bg-purple-700 text-white border-purple-600'
                        : 'bg-[#F5F5F5] dark:bg-[#222222] border-[#E5E5E5] dark:border-[#2E2E2E] text-[#171717] dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-[#2a2a2a]'
                    }`}
                  >
                    <Layers className="w-4 h-4 shrink-0" />
                    <span>Qarışıq</span>
                  </button>
                </div>
              </div>

              {/* BALANS selector */}
              {paymentType === 'balans' && (
                <div className="space-y-3 p-3.5 rounded-[12px] bg-[#F5F5F5] dark:bg-[#222222] border border-amber-300 dark:border-amber-800/60">
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
                    className="w-full px-3 py-2 text-xs rounded-[10px] border border-[#E5E5E5] dark:border-[#2E2E2E] bg-white dark:bg-[#171717] text-[#171717] dark:text-white font-semibold"
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
                      <div className="p-2.5 rounded-[10px] bg-white dark:bg-[#171717] border border-[#E5E5E5] dark:border-[#262626] space-y-1 text-xs font-mono tabular-nums">
                        <div className="flex justify-between">
                          <span className="font-sans text-[#888888]">Cari balans:</span>
                          <strong className="text-[#171717] dark:text-white">{formatAZN(cust.balance)}</strong>
                        </div>
                        <div className="flex justify-between">
                          <span className="font-sans text-[#888888]">Qalacaq balans:</span>
                          <strong className={hasEnough ? 'text-emerald-600 dark:text-emerald-400' : 'text-[#E32636] dark:text-red-400'}>
                            {formatAZN(remainingAfterSale)}
                          </strong>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* BORC (Nisyə) Name, Phone & Partial Upfront Payment */}
              {paymentType === 'borc' && (
                <div className="space-y-2.5 p-3.5 rounded-[12px] bg-[#F5F5F5] dark:bg-[#222222] border border-red-300 dark:border-red-900/60">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#E32636] dark:text-red-400 uppercase tracking-wider">
                      Borclu Məlumatları
                    </span>
                    <span className="text-[11px] font-semibold text-[#E32636] dark:text-red-400">
                      Stok dərhal çıxılır
                    </span>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-[#888888] mb-1">
                      Adı və Soyadı *
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#E32636]" />
                      <input
                        type="text"
                        list="known-debtors-list"
                        required
                        value={debtorName}
                        onChange={e => handleDebtorNameChange(e.target.value)}
                        placeholder="məs: Əli Həsənov"
                        className="w-full pl-9 pr-3 py-2 text-sm rounded-[10px] border border-red-300 dark:border-red-900/70 bg-white dark:bg-[#171717] text-[#171717] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#E32636] font-semibold"
                      />
                      <datalist id="known-debtors-list">
                        {knownDebtors.map(k => (
                          <option key={k.name} value={k.name} />
                        ))}
                      </datalist>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-[#888888] mb-1">
                      Telefon Nömrəsi
                    </label>
                    <div className="relative">
                      <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#888888]" />
                      <input
                        type="tel"
                        value={debtorPhone}
                        onChange={e => setDebtorPhone(e.target.value)}
                        placeholder="+994 50 000 00 00"
                        className="w-full pl-9 pr-3 py-2 text-sm font-mono rounded-[10px] border border-[#E5E5E5] dark:border-[#2E2E2E] bg-white dark:bg-[#171717] text-[#171717] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#E32636]"
                      />
                    </div>
                  </div>

                  {/* Partial upfront payment (e.g., 10 AZN sale -> 4 AZN upfront -> 6 AZN debt) */}
                  <div className="pt-2 border-t border-[#E5E5E5] dark:border-[#2E2E2E] space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-[11px] font-semibold text-[#888888]">
                        Öndən ödənilən məbləğ (AZN)
                      </label>
                      <select
                        value={borcUpfrontMethod}
                        onChange={e => setBorcUpfrontMethod(e.target.value as 'naqd' | 'kart' | 'pos')}
                        aria-label="İlkin ödəniş üsulu"
                        className="px-2 py-1 text-[11px] font-semibold rounded-[8px] border border-[#E5E5E5] dark:border-[#2E2E2E] bg-white dark:bg-[#171717] text-[#171717] dark:text-white"
                      >
                        <option value="naqd">Nağd</option>
                        <option value="kart">Kart</option>
                        <option value="pos">POS</option>
                      </select>
                    </div>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      max={cartFinalTotal || undefined}
                      value={borcUpfrontPaid}
                      onChange={e => setBorcUpfrontPaid(e.target.value)}
                      placeholder="0.00 (tam nisyə üçün boş saxlayın)"
                      className="w-full px-3 py-1.5 text-sm font-mono tabular-nums rounded-[10px] border border-[#E5E5E5] dark:border-[#2E2E2E] bg-white dark:bg-[#171717] text-[#171717] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#E32636]"
                    />
                    <div className="flex items-center justify-between text-[11px] font-mono tabular-nums">
                      <span className="text-[#888888] font-sans">Kassaya daxil olan:</span>
                      <strong className="text-emerald-600 dark:text-emerald-400">{formatAZN(upfrontPaidNum)}</strong>
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-mono tabular-nums">
                      <span className="text-[#888888] font-sans">Yaranacaq qalıq borc:</span>
                      <strong className="text-[#E32636] dark:text-red-400">{formatAZN(borcRemainingNum)}</strong>
                    </div>
                  </div>
                </div>
              )}

              {/* QARISIQQ (Mixed Payment Split) */}
              {paymentType === 'qarisik' && (
                <div className="space-y-2.5 p-3.5 rounded-[12px] bg-[#F5F5F5] dark:bg-[#222222] border border-purple-300 dark:border-purple-800/60">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-purple-800 dark:text-purple-300 uppercase tracking-wider">
                      Qarışıq Ödəniş Bölgüsü
                    </span>
                    <span
                      className={`text-[11px] font-mono tabular-nums font-bold ${
                        Math.abs(mixRemainingDelta) <= 0.01
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      {Math.abs(mixRemainingDelta) <= 0.01
                        ? 'Tam uyğundur'
                        : `Qalıq: ${formatAZN(mixRemainingDelta)}`}
                    </span>
                  </div>

                  {(
                    [
                      { key: 'naqd', label: 'Nağd', val: mixNaqd, setter: setMixNaqd },
                      { key: 'kart', label: 'Kart', val: mixKart, setter: setMixKart },
                      { key: 'pos', label: 'POS', val: mixPos, setter: setMixPos },
                      { key: 'balans', label: 'Balans', val: mixBalans, setter: setMixBalans },
                      { key: 'borc', label: 'Borc', val: mixBorc, setter: setMixBorc },
                    ] as const
                  ).map(ch => (
                    <div key={ch.key} className="flex items-center gap-2">
                      <span className="w-14 text-xs font-semibold text-[#171717] dark:text-neutral-300 shrink-0">
                        {ch.label}
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={ch.val}
                        onChange={e => ch.setter(e.target.value)}
                        placeholder="0.00"
                        aria-label={`Qarışıq ${ch.label}`}
                        className="flex-1 px-2.5 py-1.5 text-xs font-mono tabular-nums rounded-[8px] border border-[#E5E5E5] dark:border-[#2E2E2E] bg-white dark:bg-[#171717] text-[#171717] dark:text-white"
                      />
                      {mixRemainingDelta > 0.009 && (
                        <button
                          type="button"
                          onClick={() => {
                            const currentVal = round2(parseFloat(ch.val) || 0);
                            ch.setter(round2(currentVal + mixRemainingDelta).toFixed(2));
                          }}
                          className="px-2 py-1 text-[10px] font-mono font-bold rounded-[8px] bg-white dark:bg-[#171717] border border-[#E5E5E5] dark:border-[#2E2E2E] hover:bg-neutral-100 dark:hover:bg-[#2a2a2a] text-[#171717] dark:text-neutral-200 whitespace-nowrap"
                          title="Qalan məbləği bu kanala əlavə et"
                        >
                          +{mixRemainingDelta.toFixed(2)}
                        </button>
                      )}
                    </div>
                  ))}

                  {mixSplitValues.balans > 0.009 && (
                    <div className="pt-1.5 border-t border-[#E5E5E5] dark:border-[#2E2E2E]">
                      <label className="block text-[11px] font-semibold text-amber-700 dark:text-amber-300 mb-1">
                        Balansdan çıxılacaq müştəri *
                      </label>
                      <select
                        value={selectedCustomerAccount}
                        onChange={e => setSelectedCustomerAccount(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs rounded-[8px] border border-[#E5E5E5] dark:border-[#2E2E2E] bg-white dark:bg-[#171717] text-[#171717] dark:text-white font-semibold"
                      >
                        <option value="">-- Müştəri Hesabı Seçin --</option>
                        {customerAccounts.map(c => (
                          <option key={c.id} value={c.name}>
                            {c.name} — Balans: {formatAZN(c.balance)}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {mixSplitValues.borc > 0.009 && (
                    <div className="pt-1.5 border-t border-[#E5E5E5] dark:border-[#2E2E2E] space-y-2">
                      <input
                        type="text"
                        list="known-debtors-list"
                        value={debtorName}
                        onChange={e => handleDebtorNameChange(e.target.value)}
                        placeholder="Borclu adı və soyadı *"
                        className="w-full px-3 py-1.5 text-xs rounded-[8px] border border-red-300 dark:border-red-900/70 bg-white dark:bg-[#171717] text-[#171717] dark:text-white font-semibold"
                      />
                      <datalist id="known-debtors-list">
                        {knownDebtors.map(k => (
                          <option key={k.name} value={k.name} />
                        ))}
                      </datalist>
                      <input
                        type="tel"
                        value={debtorPhone}
                        onChange={e => setDebtorPhone(e.target.value)}
                        placeholder="Telefon (+994 50 ...)"
                        className="w-full px-3 py-1.5 text-xs font-mono rounded-[8px] border border-[#E5E5E5] dark:border-[#2E2E2E] bg-white dark:bg-[#171717] text-[#171717] dark:text-white"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Date and Time selector with backdate indicator */}
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-[10px] text-[#888888] font-medium block mb-0.5">
                      Satış Tarixi
                    </span>
                    <input
                      type="date"
                      value={customDate}
                      onChange={e => setCustomDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 font-mono tabular-nums text-xs rounded-[8px] border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-white"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-[#888888] font-medium block mb-0.5">
                      Saat
                    </span>
                    <input
                      type="time"
                      value={customTime}
                      onChange={e => setCustomTime(e.target.value)}
                      className="w-full px-2.5 py-1.5 font-mono tabular-nums text-xs rounded-[8px] border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-white"
                    />
                  </div>
                </div>

                {customDate !== todayISO && (
                  <div className="p-2.5 rounded-[10px] bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/70 text-[11px] text-amber-800 dark:text-amber-300 flex items-center justify-between gap-2">
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
                className={`w-full py-3.5 px-4 font-bold text-sm rounded-[10px] transition-opacity duration-150 flex items-center justify-center gap-2 active:scale-[0.98] ${
                  cart.length === 0 || isSubmittingSale
                    ? 'bg-[#F5F5F5] dark:bg-[#222222] text-[#888888] border border-[#E5E5E5] dark:border-[#2E2E2E] cursor-not-allowed'
                    : 'text-white hover:opacity-95'
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
          <div className="p-4 sm:p-5 bg-white dark:bg-[#171717] rounded-[14px] border border-[#E5E5E5] dark:border-[#262626] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => applyQuickDateRange('today')}
                  className={`px-3 py-1.5 rounded-[8px] text-xs font-semibold border transition-colors whitespace-nowrap ${
                    effectiveStart === todayISO && effectiveEnd === todayISO
                      ? 'bg-[#171717] dark:bg-white text-white dark:text-[#171717] border-[#171717] dark:border-white'
                      : 'bg-[#F5F5F5] dark:bg-[#222222] border-[#E5E5E5] dark:border-[#2E2E2E] text-[#171717] dark:text-neutral-300'
                  }`}
                >
                  Bu gün
                </button>
                <button
                  type="button"
                  onClick={() => applyQuickDateRange('week')}
                  className="px-3 py-1.5 rounded-[8px] text-xs font-semibold border bg-[#F5F5F5] dark:bg-[#222222] border-[#E5E5E5] dark:border-[#2E2E2E] text-[#171717] dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-[#2a2a2a] whitespace-nowrap"
                >
                  Son 7 gün
                </button>
                <button
                  type="button"
                  onClick={() => applyQuickDateRange('month')}
                  className="px-3 py-1.5 rounded-[8px] text-xs font-semibold border bg-[#F5F5F5] dark:bg-[#222222] border-[#E5E5E5] dark:border-[#2E2E2E] text-[#171717] dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-[#2a2a2a] whitespace-nowrap"
                >
                  Bu ay
                </button>
                <button
                  type="button"
                  onClick={() => applyQuickDateRange('all')}
                  className="px-3 py-1.5 rounded-[8px] text-xs font-semibold border bg-[#F5F5F5] dark:bg-[#222222] border-[#E5E5E5] dark:border-[#2E2E2E] text-[#171717] dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-[#2a2a2a] whitespace-nowrap"
                >
                  Bütün Tarixlər
                </button>
                <button
                  type="button"
                  onClick={() => setShowCancelledSales(prev => !prev)}
                  className={`px-3 py-1.5 rounded-[8px] text-xs font-semibold border transition-colors whitespace-nowrap ${
                    showCancelledSales
                      ? 'bg-[#171717] dark:bg-white text-white dark:text-[#171717] border-[#171717] dark:border-white'
                      : 'bg-[#F5F5F5] dark:bg-[#222222] border-[#E5E5E5] dark:border-[#2E2E2E] text-[#888888]'
                  }`}
                >
                  {showCancelledSales ? 'Ləğv edilənlər: Açıq' : 'Ləğv edilənləri göstər'}
                </button>
              </div>

              <div className="flex items-center gap-2">
                {isSingleDay && !dayConfirmed && activeFilteredSales.length > 0 && (
                  <button
                    type="button"
                    onClick={() => confirmDaySales(effectiveStart)}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-[10px] flex items-center gap-1.5 transition-colors whitespace-nowrap"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>Günü Təsdiq Et</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => exportSalesToCSV(filteredHistorySales)}
                  className="px-3 py-1.5 text-xs font-semibold bg-[#F5F5F5] dark:bg-[#222222] border border-[#E5E5E5] dark:border-[#2E2E2E] hover:bg-neutral-200 dark:hover:bg-[#2a2a2a] text-[#171717] dark:text-neutral-200 rounded-[10px] flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Excel / CSV</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
              <div>
                <span className="text-[10px] font-semibold uppercase text-[#888888] block mb-1">
                  Başlanğıc Tarix
                </span>
                <input
                  type="date"
                  value={filterStartDate}
                  onChange={e => setFilterStartDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums rounded-[8px] border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-white"
                />
              </div>

              <div>
                <span className="text-[10px] font-semibold uppercase text-[#888888] block mb-1">
                  Son Tarix
                </span>
                <input
                  type="date"
                  value={filterEndDate}
                  onChange={e => setFilterEndDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums rounded-[8px] border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-white"
                />
              </div>

              <div>
                <span className="text-[10px] font-semibold uppercase text-[#888888] block mb-1">
                  Məhsul Üzrə Filtr
                </span>
                <select
                  value={filterProductId}
                  onChange={e => setFilterProductId(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-[8px] border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-white"
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
                <span className="text-[10px] font-semibold uppercase text-[#888888] block mb-1">
                  Ödəniş Növü
                </span>
                <select
                  value={filterPaymentType}
                  onChange={e => setFilterPaymentType(e.target.value as 'all' | PaymentType)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-[8px] border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-white"
                >
                  <option value="all">Bütün Ödəniş Növləri</option>
                  <option value="naqd">Nağd</option>
                  <option value="kart">Bank Kartı</option>
                  <option value="pos">POS Terminal</option>
                  <option value="borc">Nisyə (Borc)</option>
                  <option value="balans">Müştəri Balansı</option>
                  <option value="qarisik">Qarışıq Ödəniş</option>
                </select>
              </div>

              <div>
                <span className="text-[10px] font-semibold uppercase text-[#888888] block mb-1">
                  Axtarış (Ad / Tel / Məhsul)
                </span>
                <input
                  type="text"
                  value={historySearch}
                  onChange={e => setHistorySearch(e.target.value)}
                  placeholder="Müştəri, telefon, məhsul..."
                  className="w-full px-2.5 py-1.5 text-xs rounded-[8px] border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-white"
                />
              </div>
            </div>
          </div>

          {/* Filtered Separation Summary Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            <div className="p-3.5 rounded-[14px] bg-white dark:bg-[#171717] border border-[#E5E5E5] dark:border-[#262626]">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#888888] block">
                Ümumi Satış
              </span>
              <span className="text-base font-bold font-mono tabular-nums text-[#171717] dark:text-white mt-1 block">
                {formatAZN(filteredMetrics.grossSalesTotal)}
              </span>
              <span className="text-[10px] text-[#888888] font-mono tabular-nums">
                {filteredMetrics.salesCount} çek · {filteredMetrics.totalItemsSold} ədəd
              </span>
            </div>

            <div className="p-3.5 rounded-[14px] bg-white dark:bg-[#171717] border border-[#E5E5E5] dark:border-[#262626]">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block">
                Nağd Satış
              </span>
              <span className="text-base font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400 mt-1 block">
                {formatAZN(filteredMetrics.cashSales)}
              </span>
            </div>

            <div className="p-3.5 rounded-[14px] bg-white dark:bg-[#171717] border border-[#E5E5E5] dark:border-[#262626]">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400 block">
                Kart / POS
              </span>
              <span className="text-base font-bold font-mono tabular-nums text-blue-600 dark:text-blue-400 mt-1 block">
                {formatAZN(filteredMetrics.cardSales + filteredMetrics.posSales)}
              </span>
            </div>

            <div className="p-3.5 rounded-[14px] bg-white dark:bg-[#171717] border border-[#E32636]/30">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#E32636] block">
                Nisyə Satış
              </span>
              <span className="text-base font-bold font-mono tabular-nums text-[#E32636] mt-1 block">
                {formatAZN(filteredMetrics.creditSales)}
              </span>
            </div>

            <div className="p-3.5 rounded-[14px] bg-white dark:bg-[#171717] border border-[#E5E5E5] dark:border-[#262626]">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 block">
                Endirimlər
              </span>
              <span className="text-base font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400 mt-1 block">
                {formatAZN(filteredMetrics.totalDiscounts)}
              </span>
            </div>

            <div className="p-3.5 rounded-[14px] bg-white dark:bg-[#171717] border border-[#E5E5E5] dark:border-[#262626]">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 block">
                Borcdan Daxilolan
              </span>
              <span className="text-base font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400 mt-1 block">
                {formatAZN(filteredMetrics.debtCollectedTotal)}
              </span>
            </div>

            <div className="p-3.5 rounded-[14px] bg-white dark:bg-[#171717] border border-emerald-500/35">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 block">
                Faktiki Kassa
              </span>
              <span className="text-base font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400 mt-1 block">
                {formatAZN(filteredMetrics.actualDrawerInflow)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Sales Operations Table */}
            <div className="lg:col-span-8 bg-white dark:bg-[#171717] rounded-[14px] border border-[#E5E5E5] dark:border-[#262626] overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[#E5E5E5] dark:border-[#262626] flex items-center justify-between">
                <h3 className="text-sm font-bold text-[#171717] dark:text-white">
                  Satış Əməliyyatları ({filteredHistorySales.length})
                </h3>
                <span className="text-xs text-[#888888] font-mono tabular-nums">
                  {formatDateAZ(effectiveStart)}
                  {effectiveStart !== effectiveEnd ? ` – ${formatDateAZ(effectiveEnd)}` : ''}
                </span>
              </div>

              {filteredHistorySales.length === 0 ? (
                <div className="py-12 text-center text-[#888888] text-xs">
                  Seçilmiş filtrlərə uyğun satış əməliyyatı tapılmadı.
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#F5F5F5] dark:bg-[#111111] text-[#888888] font-semibold border-b border-[#E5E5E5] dark:border-[#262626] uppercase tracking-wider text-[10px]">
                        <tr>
                          <th className="py-3 px-4">Tarix / Saat</th>
                          <th className="py-3 px-4">Məhsullar</th>
                          <th className="py-3 px-4">Ödəniş / Status</th>
                          <th className="py-3 px-4 text-right">Məbləğ</th>
                          <th className="py-3 px-4 text-right">Əməliyyat</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E5E5E5] dark:divide-[#262626]">
                        {filteredHistorySales
                          .slice((salesHistoryPage - 1) * SALES_PAGE_SIZE, salesHistoryPage * SALES_PAGE_SIZE)
                          .map(s => {
                            const badge = getPaymentBadge(s);
                            const entryDateStr = s.createdAt ? s.createdAt.slice(0, 10) : s.date;
                            const wasBackdatedOrEdited =
                              entryDateStr !== s.date || Boolean(s.dateChangedAt);

                            return (
                              <tr
                                key={s.id}
                                className={`transition-colors ${
                                  s.isCancelled
                                    ? 'bg-[#E32636]/5 opacity-75'
                                    : 'hover:bg-[#F5F5F5] dark:hover:bg-[#222222]/60'
                                }`}
                              >
                                <td className="py-3 px-4 whitespace-nowrap align-top">
                                  <div className="font-mono tabular-nums font-bold text-[#171717] dark:text-white">
                                    {formatDateAZ(s.date)}
                                  </div>
                                  <div className="text-[11px] font-mono tabular-nums text-[#888888] flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    <span>{s.time}</span>
                                    <span>· @{s.createdBy}</span>
                                  </div>
                                  {wasBackdatedOrEdited && (
                                    <div className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5 font-mono tabular-nums">
                                      {s.dateChangedAt && s.originalDate && s.originalDate !== s.date
                                        ? `İlk: ${formatDateAZ(s.originalDate)}`
                                        : `Daxil: ${formatDateAZ(entryDateStr)}`}
                                      {(s.editHistory?.length || 0) > 0 && ` · ${s.editHistory!.length} redaktə`}
                                    </div>
                                  )}
                                </td>

                                <td className="py-3 px-4 align-top">
                                  <div className="space-y-0.5">
                                    {s.items.map((i, idx) => (
                                      <div
                                        key={idx}
                                        className={`text-[#171717] dark:text-neutral-200 ${s.isCancelled ? 'line-through text-[#888888]' : ''}`}
                                      >
                                        <span className="font-semibold">{i.productName}</span>{' '}
                                        <span className="font-mono tabular-nums text-[#888888]">
                                          ({i.quantity} × {formatAZN(i.unitPrice)})
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                  {s.debtorName && (
                                    <div className="text-[11px] text-[#888888] mt-1 flex flex-wrap items-center gap-2">
                                      <span className="font-semibold text-[#E32636]">
                                        Müştəri: {s.debtorName}
                                      </span>
                                      {s.debtorPhone && (
                                        <span className="font-mono tabular-nums text-[#888888]">
                                          {s.debtorPhone}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                  {s.isCancelled && (
                                    <div className="text-[10px] text-[#E32636] mt-1 font-semibold">
                                      Ləğv edən: @{s.cancelledBy || 'admin'}
                                      {s.cancelReason ? ` — "${s.cancelReason}"` : ''}
                                    </div>
                                  )}
                                </td>

                                <td className="py-3 px-4 align-top whitespace-nowrap">
                                  <span
                                    className={`inline-block px-2 py-0.5 text-[10px] font-semibold rounded-[6px] border ${badge.cls}`}
                                  >
                                    {badge.label}
                                  </span>
                                  <div className="text-[11px] text-[#888888] mt-0.5">
                                    {badge.status}
                                  </div>
                                </td>

                                <td className="py-3 px-4 text-right align-top whitespace-nowrap font-mono tabular-nums">
                                  <div
                                    className={`font-bold text-sm ${
                                      s.isCancelled
                                        ? 'line-through text-[#888888]'
                                        : 'text-[#171717] dark:text-white'
                                    }`}
                                  >
                                    {formatAZN(s.totalAmount)}
                                  </div>
                                  {(s.discountAmount || 0) > 0 && (
                                    <div className="text-[10px] text-amber-600 dark:text-amber-400">
                                      Endirim: −{formatAZN(s.discountAmount || 0)}
                                    </div>
                                  )}
                                </td>

                                <td className="py-3 px-4 text-right align-top whitespace-nowrap">
                                  {!s.isCancelled ? (
                                    <div className="flex items-center justify-end gap-1.5">
                                      {!s.isConfirmed && (
                                        <button
                                          type="button"
                                          onClick={() => confirmSale(s.id)}
                                          title="Satışı Təsdiqlə"
                                          className="px-2 py-1 text-[10px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-[6px]"
                                        >
                                          Təsdiqlə
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => openEditSaleDateModal(s)}
                                        title="Tarixi Dəyiş"
                                        className="p-1.5 rounded-[8px] border border-[#E5E5E5] dark:border-[#2E2E2E] text-[#888888] hover:text-[#171717] dark:hover:text-white hover:bg-[#F5F5F5] dark:hover:bg-[#222222] transition-colors"
                                      >
                                        <Edit3 className="w-3.5 h-3.5" />
                                      </button>
                                      {isAdmin && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setCancellingSale(s);
                                            setCancelReasonInput('');
                                          }}
                                          title="Satışı ləğv et (Tarixçədə saxlanılır, stok və balans bərpa olunur)"
                                          className="px-2 py-1 rounded-[8px] border border-[#E32636]/25 text-[#E32636] hover:bg-[#E32636]/10 text-[10px] font-semibold inline-flex items-center gap-1 transition-colors"
                                        >
                                          <Ban className="w-3 h-3" />
                                          <span>Ləğv Et</span>
                                        </button>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-[10px] font-mono text-[#888888]">
                                      Arxiv · Ləğv
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>

                  <TablePagination
                    totalItems={filteredHistorySales.length}
                    pageSize={SALES_PAGE_SIZE}
                    currentPage={salesHistoryPage}
                    onPageChange={setSalesHistoryPage}
                    primaryColor={primaryColor}
                  />
                </>
              )}
            </div>

            {/* Product Summary */}
            <div className="lg:col-span-4 bg-white dark:bg-[#171717] rounded-[14px] border border-[#E5E5E5] dark:border-[#262626] p-5 space-y-4">
              <div className="pb-2 border-b border-[#E5E5E5] dark:border-[#262626]">
                <h3 className="text-sm font-bold text-[#171717] dark:text-white">
                  Satılan Məhsul Sayı (Dövr Üzrə)
                </h3>
                <p className="text-[11px] text-[#888888]">
                  Məhsullar üzrə kəmiyyət və dövriyyə bölgüsü
                </p>
              </div>

              {filteredProductStats.length === 0 ? (
                <div className="py-8 text-center text-[#888888] text-xs">
                  Satılan məhsul yoxdur.
                </div>
              ) : (
                <div className="divide-y divide-[#E5E5E5] dark:divide-[#262626]">
                  {filteredProductStats.map((stat, idx) => (
                    <div key={idx} className="py-2.5 flex items-center justify-between text-xs gap-2">
                      <span className="font-semibold text-[#171717] dark:text-neutral-200 truncate">
                        {stat.name}
                      </span>
                      <div className="flex items-center gap-3 shrink-0 font-mono tabular-nums">
                        <span className="text-[#888888]">{stat.quantity} əd.</span>
                        <span className="font-bold text-[#171717] dark:text-white">
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
          <div className="p-5 bg-white dark:bg-[#171717] rounded-[14px] border border-[#E5E5E5] dark:border-[#262626] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-[#E32636]" />
              <div>
                <span className="text-xs text-[#888888] font-medium block">
                  Ayı Seçin:
                </span>
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={e => setSelectedMonth(e.target.value)}
                  className="font-mono text-sm font-bold bg-transparent border-b border-[#E5E5E5] dark:border-[#2E2E2E] pb-0.5 text-[#171717] dark:text-white focus:outline-none focus:border-[#E32636]"
                />
              </div>
            </div>

            <div className="text-right">
              <span className="text-xs text-[#888888] block">
                {getMonthLabelAZ(selectedMonth)} Ümumi Satış
              </span>
              <span className="text-2xl font-bold font-mono tabular-nums text-[#171717] dark:text-white">
                {formatAZN(monthTotalAmount)}
              </span>
            </div>
          </div>

          <div className="bg-white dark:bg-[#171717] rounded-[14px] border border-[#E5E5E5] dark:border-[#262626] p-5 space-y-4">
            <h3 className="text-sm font-bold text-[#171717] dark:text-white pb-2 border-b border-[#E5E5E5] dark:border-[#262626]">
              {getMonthLabelAZ(selectedMonth)} Üzrə Satılan Məhsul Statistikası
            </h3>

            {Object.values(monthlyProductStats).length === 0 ? (
              <div className="py-12 text-center text-[#888888] text-xs">
                Bu ay üzrə satış yoxdur.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {Object.values(monthlyProductStats)
                  .sort((a, b) => b.quantity - a.quantity)
                  .map((stat, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-[12px] bg-[#F5F5F5] dark:bg-[#222222] border border-[#E5E5E5] dark:border-[#2E2E2E] flex items-center justify-between"
                    >
                      <div>
                        <span className="text-xs font-bold text-[#171717] dark:text-white block">
                          {stat.name}
                        </span>
                        <span className="text-[11px] font-mono tabular-nums text-[#888888]">
                          {stat.quantity} ədəd satılıb
                        </span>
                      </div>
                      <span className="text-sm font-mono tabular-nums font-bold text-[#E32636]">
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
          <div className="bg-white dark:bg-[#171717] w-full max-w-md rounded-[14px] border border-[#E5E5E5] dark:border-[#262626] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#E5E5E5] dark:border-[#262626] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-[#E32636]" />
                <h3 className="text-base font-bold text-[#171717] dark:text-white">
                  Satış Tarixini Dəyişdir
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingSale(null)}
                className="p-1 text-[#888888] hover:text-[#171717] dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSaleDate} className="p-5 space-y-4">
              <div className="p-3 rounded-[10px] bg-[#F5F5F5] dark:bg-[#222222] border border-[#E5E5E5] dark:border-[#2E2E2E] text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-[#888888]">Satış məbləği:</span>
                  <strong className="font-mono tabular-nums text-[#171717] dark:text-white">
                    {formatAZN(editingSale.totalAmount)} ({editingSale.paymentType.toUpperCase()})
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#888888]">Hazırkı hesabat tarixi:</span>
                  <strong className="font-mono tabular-nums text-[#171717] dark:text-white">
                    {formatDateAZ(editingSale.date)} ({editingSale.time})
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#888888]">Faktiki daxilolma vaxtı:</span>
                  <span className="font-mono tabular-nums text-[#888888]">
                    {editingSale.createdAt
                      ? new Date(editingSale.createdAt).toLocaleString('az-AZ')
                      : formatDateAZ(editingSale.date)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#888888] mb-1">
                    Yeni Tarix *
                  </label>
                  <input
                    type="date"
                    required
                    value={editDateValue}
                    onChange={e => setEditDateValue(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-[10px] border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#888888] mb-1">
                    Saat
                  </label>
                  <input
                    type="time"
                    value={editTimeValue}
                    onChange={e => setEditTimeValue(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-[10px] border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-white"
                  />
                </div>
              </div>

              <div className="p-2.5 rounded-[10px] bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/70 text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Yalnız köhnə tarixin ({formatDateAZ(editingSale.date)}) və yeni seçilən tarixin günlük hesabatları yenidən hesablanacaq. Digər günlərə toxunulmur.
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#E5E5E5] dark:border-[#262626]">
                <button
                  type="button"
                  onClick={() => setEditingSale(null)}
                  className="px-4 py-2 text-xs font-semibold text-[#888888] hover:text-[#171717] dark:hover:text-white"
                >
                  Ləğv et
                </button>
                <button
                  type="submit"
                  style={{ backgroundColor: primaryColor }}
                  className="px-5 py-2 text-xs font-semibold text-white rounded-[10px] hover:opacity-95"
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
          <div className="bg-white dark:bg-[#171717] w-full max-w-md rounded-[14px] border border-[#E5E5E5] dark:border-[#262626] overflow-hidden">
            <div className="px-6 py-4 border-b border-[#E5E5E5] dark:border-[#262626] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Coins className="w-5 h-5 text-amber-500" />
                <h3 className="text-base font-bold text-[#171717] dark:text-white">
                  Müştəri Balansını Artır (Depozit)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsDepositModalOpen(false)}
                className="p-1 text-[#888888] hover:text-[#171717] dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleQuickDepositSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#888888] uppercase tracking-wider mb-1">
                  Müştəri Adı *
                </label>
                <input
                  type="text"
                  required
                  value={depositName}
                  onChange={e => setDepositName(e.target.value)}
                  placeholder="məs: Əli, Ramin, Tural..."
                  className="w-full px-3.5 py-2.5 text-sm rounded-[10px] border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-white font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#888888] uppercase tracking-wider mb-1">
                  Qoyulan Məbləğ (AZN) *
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  required
                  value={depositAmount}
                  onChange={e => setDepositAmount(parseFloat(e.target.value) || 0)}
                  className="w-full px-3.5 py-2.5 text-base font-mono tabular-nums font-bold rounded-[10px] border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-white"
                />
                <div className="flex gap-1.5 mt-2">
                  {[5, 10, 15, 20, 50].map(val => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setDepositAmount(val)}
                      className={`flex-1 py-1 text-xs font-mono font-bold rounded-[8px] border transition-colors ${
                        depositAmount === val
                          ? 'bg-amber-600 text-white border-amber-500'
                          : 'bg-[#F5F5F5] dark:bg-[#222222] text-[#888888] border-[#E5E5E5] dark:border-[#2E2E2E]'
                      }`}
                    >
                      {val} ₼
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#888888] uppercase tracking-wider mb-1">
                  Qəbul Edilən Ödəniş Növü
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['naqd', 'kart', 'pos'] as const).map(pt => (
                    <button
                      key={pt}
                      type="button"
                      onClick={() => setDepositPaymentType(pt)}
                      className={`py-2 text-xs font-semibold rounded-[10px] border transition-colors ${
                        depositPaymentType === pt
                          ? 'bg-amber-600 text-white border-amber-500'
                          : 'bg-[#F5F5F5] dark:bg-[#222222] text-[#888888] border-[#E5E5E5] dark:border-[#2E2E2E]'
                      }`}
                    >
                      {pt.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#888888] uppercase tracking-wider mb-1">
                  Qeyd
                </label>
                <input
                  type="text"
                  value={depositNote}
                  onChange={e => setDepositNote(e.target.value)}
                  placeholder="məs: 1 aylıq su depoziti"
                  className="w-full px-3.5 py-2 text-sm rounded-[10px] border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-white"
                />
              </div>

              <div className="pt-3 border-t border-[#E5E5E5] dark:border-[#262626] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsDepositModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-[#888888] hover:text-[#171717] dark:hover:text-white"
                >
                  Ləğv et
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-[10px]"
                >
                  Balansı Artır
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cancel Sale Confirmation Modal (Non-destructive Audit) */}
      {cancellingSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#171717] w-full max-w-md rounded-[14px] border border-[#E5E5E5] dark:border-[#262626] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#E5E5E5] dark:border-[#262626] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Ban className="w-5 h-5 text-[#E32636]" />
                <h3 className="text-base font-bold text-[#171717] dark:text-white">
                  Satışı Ləğv Et
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setCancellingSale(null)}
                className="p-1 text-[#888888] hover:text-[#171717] dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmCancelSale} className="p-5 space-y-4">
              <div className="p-3 rounded-[10px] bg-[#F5F5F5] dark:bg-[#222222] border border-[#E5E5E5] dark:border-[#2E2E2E] text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-[#888888]">Tarix / Saat:</span>
                  <strong className="font-mono tabular-nums text-[#171717] dark:text-white">
                    {formatDateAZ(cancellingSale.date)} ({cancellingSale.time})
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#888888]">Məbləğ:</span>
                  <strong className="font-mono tabular-nums text-[#171717] dark:text-white">
                    {formatAZN(cancellingSale.totalAmount)} ({formatSalePaymentLabel(cancellingSale)})
                  </strong>
                </div>
                <div className="text-[#888888] pt-1">
                  {cancellingSale.items.map(i => `${i.productName} ×${i.quantity}`).join(', ')}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#888888] mb-1">
                  Ləğv etmə səbəbi
                </label>
                <input
                  type="text"
                  value={cancelReasonInput}
                  onChange={e => setCancelReasonInput(e.target.value)}
                  placeholder="məs: Səhv məhsul vurulub"
                  className="w-full px-3 py-2 text-sm rounded-[10px] border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F5F5F5] dark:bg-[#222222] text-[#171717] dark:text-white"
                />
              </div>

              <div className="p-2.5 rounded-[10px] bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/70 text-[11px] text-amber-800 dark:text-amber-300">
                Satış silinməyəcək — tarixçədə «Ləğv edilib» statusu ilə qalacaq, anbar stoku, müştəri balansı və bağlı borc avtomatik geri qaytarılacaq.
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#E5E5E5] dark:border-[#262626]">
                <button
                  type="button"
                  onClick={() => setCancellingSale(null)}
                  className="px-4 py-2 text-xs font-semibold text-[#888888] hover:text-[#171717] dark:hover:text-white"
                >
                  İmtina
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold bg-[#E32636] hover:bg-[#c81f2e] text-white rounded-[10px]"
                >
                  Satışı Ləğv Et
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
