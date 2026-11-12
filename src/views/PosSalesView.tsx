import React, { useMemo, useState } from 'react';
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
  Download,
  Wallet,
  Coins,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { PaymentType, Product } from '../types';
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
    confirmSale,
    confirmDaySales,
    deleteSale,
    currentUser,
    settings,
    showToast,
  } = useApp();

  const isAdmin = currentUser?.role === 'admin';
  const primaryColor = settings.primaryColor || '#dc2626';

  // POS State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentType, setPaymentType] = useState<PaymentType>('naqd');
  const [debtorName, setDebtorName] = useState('');
  const [selectedCustomerAccount, setSelectedCustomerAccount] = useState<string>('Əli');
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [depositName, setDepositName] = useState('');
  const [depositAmount, setDepositAmount] = useState<number>(10);
  const [depositPaymentType, setDepositPaymentType] = useState<'naqd' | 'kart' | 'pos'>('naqd');
  const [depositNote, setDepositNote] = useState('');
  const [customDate, setCustomDate] = useState(getTodayISODate());
  const [customTime, setCustomTime] = useState(getCurrentTimeHHMM());
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [confirmDeleteSaleId, setConfirmDeleteSaleId] = useState<string | null>(null);

  // Debt warning modal state
  const [isDebtModalOpen, setIsDebtModalOpen] = useState(false);
  const [debtWarningDetails, setDebtWarningDetails] = useState<{
    name: string;
    amount: number;
  }>({ name: '', amount: 0 });

  // Sub-tabs
  const [activeSubTab, setActiveSubTab] = useState<'pos' | 'daily' | 'monthly'>('pos');
  const [selectedDay, setSelectedDay] = useState(getTodayISODate());
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthKey());

  const categories = Array.from(new Set(products.map(p => p.category || 'Ümumi')));

  // Add product to cart
  const addToCart = (product: Product) => {
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
    setCart(prev =>
      prev
        .map(item => {
          if (item.product.id === productId) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
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
    setPaymentType('naqd');
  };

  // Cart total calculations
  const cartTotal = cart.reduce(
    (sum, item) => sum + item.product.salePrice * item.quantity,
    0
  );
  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  // Check debtor name for existing debt
  const handleDebtorNameChange = (val: string) => {
    setDebtorName(val);
    if (val.trim().length >= 2) {
      const debtCheck = checkCustomerDebt(val, debts);
      if (debtCheck.hasDebt) {
        setDebtWarningDetails({
          name: debtCheck.debtorName,
          amount: debtCheck.totalRemainingDebt,
        });
        setIsDebtModalOpen(true);
      }
    }
  };

  // Barcode scanned handler
  const handleBarcodeScanned = (barcode: string) => {
    const found = products.find(p => p.barcode === barcode);
    if (found) {
      addToCart(found);
      showToast('success', `"${found.name}" səbətə əlavə olundu.`);
    } else {
      showToast('error', `"${barcode}" barkodlu məhsul tapılmadı!`);
    }
  };

  // Submit Sale
  const handleCompleteSale = () => {
    if (cart.length === 0) return;

    if (paymentType === 'borc' && !debtorName.trim()) {
      showToast('error', 'Zəhmət olmasa borclunun adını daxil edin!');
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
      if (existing.balance < cartTotal) {
        showToast(
          'error',
          `Balansda kifayət qədər vəsait yoxdur! Cari balans: ${formatAZN(existing.balance)}, Tələb olunan: ${formatAZN(cartTotal)}`
        );
        return;
      }
    }

    const res = addSale({
      items: cart.map(i => ({ productId: i.product.id, quantity: i.quantity })),
      paymentType,
      debtorName:
        paymentType === 'borc'
          ? debtorName.trim()
          : paymentType === 'balans'
          ? selectedCustomerAccount.trim()
          : undefined,
      customDate,
      customTime,
    });

    if (res.success) {
      showToast('success', `Satış tamamlandı: ${formatAZN(cartTotal)}`);
      clearCart();
    } else {
      showToast('error', res.error || 'Satış tamamlanmadı');
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
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.barcode.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCat = selectedCategory === 'all' || p.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  // Live Today & Selected Day separated financial metrics (Sale vs Credit vs Actual Cash)
  const todayISO = getTodayISODate();
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

  const selectedDayMetrics = useMemo(
    () =>
      calculateFinancialMetricsForRange({
        sales,
        debts,
        purchases,
        expenses,
        startDate: selectedDay,
        endDate: selectedDay,
      }),
    [sales, debts, purchases, expenses, selectedDay]
  );

  // Daily Sales Summary calculations
  const daySales = sales.filter(s => s.date === selectedDay);
  const dayConfirmed = daySales.length > 0 && daySales.every(s => s.isConfirmed);

  // Daily product breakdown
  const dailyProductStats: Record<string, { name: string; quantity: number; revenue: number }> = {};
  for (const s of daySales) {
    for (const item of s.items) {
      if (!dailyProductStats[item.productId]) {
        dailyProductStats[item.productId] = { name: item.productName, quantity: 0, revenue: 0 };
      }
      dailyProductStats[item.productId].quantity += item.quantity;
      dailyProductStats[item.productId].revenue += item.totalPrice;
    }
  }

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

  return (
    <div className="space-y-6 pb-12 max-w-7xl mx-auto">
      {/* Top Header & Sub-Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-zinc-200 dark:border-zinc-800">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-white tracking-tight flex items-center gap-2">
            <span>Kassa & Satış (POS)</span>
            <span className="text-xs bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400 font-bold px-2 py-0.5 rounded-full border border-red-200 dark:border-red-800">
              Terminal
            </span>
          </h2>
          <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
            Sürətli toxunma ilə satış, barkod oxuma və gündəlik cədvəl
          </p>
        </div>

        {/* Sub-nav tabs */}
        <div className="flex items-center p-1 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveSubTab('pos')}
            style={activeSubTab === 'pos' ? { backgroundColor: primaryColor } : undefined}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
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
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
              activeSubTab === 'daily'
                ? 'text-white shadow-sm'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            Gündəlik Satış Cədvəli
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('monthly')}
            style={activeSubTab === 'monthly' ? { backgroundColor: primaryColor } : undefined}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
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
            <div className="p-3 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 block">
                Bugünkü Ümumi Satış
              </span>
              <span className="text-base font-black font-mono text-zinc-900 dark:text-white mt-0.5 block">
                {formatAZN(todayMetrics.grossSalesTotal)}
              </span>
            </div>

            <div className="p-3 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block">
                Nağd Satış
              </span>
              <span className="text-base font-black font-mono text-emerald-700 dark:text-emerald-400 mt-0.5 block">
                {formatAZN(todayMetrics.cashSales)}
              </span>
            </div>

            <div className="p-3 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 block">
                Kart / POS Satış
              </span>
              <span className="text-base font-black font-mono text-blue-700 dark:text-blue-400 mt-0.5 block">
                {formatAZN(todayMetrics.cardSales + todayMetrics.posSales)}
              </span>
            </div>

            <div className="p-3 rounded-2xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 shadow-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400 block">
                Borcla Satış (Kassasız)
              </span>
              <span className="text-base font-black font-mono text-rose-700 dark:text-rose-400 mt-0.5 block">
                {formatAZN(todayMetrics.creditSales)}
              </span>
            </div>

            <div className="p-3 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 shadow-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 block">
                Geri Alınan Borc
              </span>
              <span className="text-base font-black font-mono text-amber-700 dark:text-amber-400 mt-0.5 block">
                {formatAZN(todayMetrics.debtCollectedTotal)}
              </span>
            </div>

            <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 shadow-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300 block">
                Faktiki Kassaya Girən
              </span>
              <span className="text-base font-black font-mono text-emerald-800 dark:text-emerald-300 mt-0.5 block">
                {formatAZN(todayMetrics.actualDrawerInflow)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Product Selection Grid */}
          <div className="lg:col-span-7 xl:col-span-8 space-y-4">
            {/* Search and Barcode row */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Məhsul adı və ya barkod axtarın..."
                  className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              <button
                type="button"
                onClick={() => setIsScannerOpen(true)}
                style={{ backgroundColor: primaryColor }}
                className="px-4 py-2.5 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shrink-0 transition-all shadow-md hover:opacity-90 active:scale-95"
              >
                <Camera className="w-4 h-4" />
                <span className="hidden sm:inline">Barkod Oxut</span>
              </button>
            </div>

            {/* Category filter tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
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
                Hamısı
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

            {/* Products Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 max-h-[640px] overflow-y-auto pr-1">
              {filteredProducts.map(product => {
                const stock = calculateProductStock(product, purchases, sales, settings.minStockThreshold);
                const inCart = cart.find(i => i.product.id === product.id);

                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => addToCart(product)}
                    className={`p-3.5 rounded-2xl border text-left flex flex-col justify-between transition-all active:scale-[0.98] relative group ${
                      inCart
                        ? 'border-red-500 bg-red-50/80 dark:bg-red-950/20 shadow-md ring-1 ring-red-500'
                        : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700 shadow-sm'
                    }`}
                  >
                    {inCart && (
                      <span
                        style={{ backgroundColor: primaryColor }}
                        className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full text-white font-black text-xs flex items-center justify-center shadow-lg"
                      >
                        {inCart.quantity}
                      </span>
                    )}

                    <div>
                      <div className="flex items-center justify-between text-[10px] text-zinc-500 dark:text-zinc-400 mb-1">
                        <span className="truncate">{product.category}</span>
                        {product.volume && <span>{product.volume}</span>}
                      </div>

                      <h4 className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-white line-clamp-2 leading-snug">
                        {product.name}
                      </h4>
                    </div>

                    <div className="mt-3 pt-2 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                      <span className="text-xs sm:text-sm font-mono font-extrabold text-red-600 dark:text-red-400">
                        {formatAZN(product.salePrice)}
                      </span>

                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                        stock.isLowStock
                          ? 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800 font-bold'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                      }`}>
                        Qalıq: {stock.activeStock}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Column: Checkout Cart & Payment */}
          <div className="lg:col-span-5 xl:col-span-4 bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-xl p-5 space-y-5 sticky top-16">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-red-500" />
                <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                  Cari Səbət ({cartItemCount})
                </h3>
              </div>
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={clearCart}
                  className="text-xs text-red-600 dark:text-red-400 hover:text-red-500 dark:hover:text-red-300 font-semibold"
                >
                  Təmizlə
                </button>
              )}
            </div>

            {/* Cart Items List */}
            {cart.length === 0 ? (
              <div className="py-12 text-center text-zinc-500 space-y-2">
                <ShoppingCart className="w-8 h-8 mx-auto text-zinc-400 dark:text-zinc-600" />
                <p className="text-xs">Səbət boşdur. Məhsul seçin və ya barkodu oxudun.</p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1 divide-y divide-zinc-200 dark:divide-zinc-800">
                {cart.map(item => (
                  <div key={item.product.id} className="pt-2 flex items-center justify-between gap-2">
                    <div className="flex-1 truncate">
                      <p className="text-xs font-bold text-zinc-900 dark:text-white truncate">
                        {item.product.name}
                      </p>
                      <p className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
                        {item.quantity} × {formatAZN(item.product.salePrice)} = <strong className="text-red-600 dark:text-red-400">{formatAZN(item.quantity * item.product.salePrice)}</strong>
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.product.id, -1)}
                        className="w-7 h-7 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 flex items-center justify-center transition-colors"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-6 text-center font-mono font-bold text-xs text-zinc-900 dark:text-white">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.product.id, 1)}
                        className="w-7 h-7 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 flex items-center justify-center transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeFromCart(item.product.id)}
                        className="w-7 h-7 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 flex items-center justify-center ml-1 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Total Display */}
            <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Yekun Məbləğ
                </span>
                <p className="text-xs text-zinc-500">
                  {settings.autoConfirmSales ? 'Avtomatik təsdiq aktivdir' : 'Gün sonunda təsdiqlənəcək'}
                </p>
              </div>
              <div className="text-2xl font-black font-mono text-zinc-900 dark:text-white">
                {formatAZN(cartTotal)}
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
                  className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center gap-2 transition-all ${
                    paymentType === 'naqd'
                      ? 'bg-emerald-600 text-white border-emerald-500 shadow-md'
                      : 'bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  <Banknote className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
                  <span>Nağd</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentType('kart')}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center gap-2 transition-all ${
                    paymentType === 'kart'
                      ? 'bg-blue-600 text-white border-blue-500 shadow-md'
                      : 'bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  <CreditCard className="w-4 h-4 text-blue-500 dark:text-blue-400" />
                  <span>Bank Kartı</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentType('pos')}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center gap-2 transition-all ${
                    paymentType === 'pos'
                      ? 'bg-red-600 text-white border-red-500 shadow-md'
                      : 'bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  <Smartphone className="w-4 h-4 text-red-500 dark:text-red-400" />
                  <span>POS Terminal</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentType('balans')}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center gap-2 transition-all ${
                    paymentType === 'balans'
                      ? 'bg-amber-600 text-white border-amber-500 shadow-md'
                      : 'bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  <Wallet className="w-4 h-4 text-amber-500 dark:text-amber-400" />
                  <span>Balans (Depozit)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentType('borc')}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center gap-2 transition-all ${
                    paymentType === 'borc'
                      ? 'bg-rose-700 text-white border-rose-600 shadow-md'
                      : 'bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  <BookOpen className="w-4 h-4 text-rose-500 dark:text-rose-400" />
                  <span>Nisyə (Borc)</span>
                </button>
              </div>
            </div>

            {/* If BALANS (Müştəri Depozit Balansı) */}
            {paymentType === 'balans' && (
              <div className="space-y-3 p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-amber-300 dark:border-amber-800/60 animate-in fade-in">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-amber-700 dark:text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Wallet className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
                    <span>Müştəri Hesabı</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setDepositName(selectedCustomerAccount || '');
                      setIsDepositModalOpen(true);
                    }}
                    className="text-[11px] font-bold text-amber-700 dark:text-amber-400 hover:underline flex items-center gap-1"
                  >
                    <span>+ Balans Artır</span>
                  </button>
                </div>

                <select
                  value={selectedCustomerAccount}
                  onChange={e => setSelectedCustomerAccount(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500"
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
                  if (!cust) {
                    return (
                      <p className="text-[11px] text-zinc-500">
                        Siyahıdan müştəri seçin və ya "+ Balans Artır" ilə yeni depozit hesabı açın.
                      </p>
                    );
                  }
                  const remainingAfterSale = Math.round((cust.balance - cartTotal) * 100) / 100;
                  const hasEnough = remainingAfterSale >= 0;

                  return (
                    <div className="p-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-1.5 text-xs">
                      <div className="flex justify-between items-center text-zinc-700 dark:text-zinc-300">
                        <span>Cari Depozit Balansı:</span>
                        <strong className="font-mono text-zinc-900 dark:text-white text-sm">{formatAZN(cust.balance)}</strong>
                      </div>
                      <div className="flex justify-between items-center text-zinc-500 dark:text-zinc-400 text-[11px]">
                        <span>Çıxılacaq Məbləğ:</span>
                        <span className="font-mono text-amber-600 dark:text-amber-400 font-bold">− {formatAZN(cartTotal)}</span>
                      </div>
                      <div className="pt-1.5 border-t border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
                        <span className="font-bold text-zinc-800 dark:text-zinc-200">Qalacaq Balans:</span>
                        <span
                          className={`font-mono font-black ${
                            hasEnough ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-500'
                          }`}
                        >
                          {formatAZN(remainingAfterSale)}
                        </span>
                      </div>
                      {!hasEnough && (
                        <p className="text-[11px] text-red-600 dark:text-red-400 font-bold pt-1">
                          Xəbərdarlıq: Balansda vəsait çatışmır! Əvvəlcə balans artırın.
                        </p>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* If BORC, Customer Name Input with real-time existing debt alert */}
            {paymentType === 'borc' && (
              <div className="space-y-2 p-3.5 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 animate-in fade-in">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-red-700 dark:text-red-300 uppercase tracking-wider">
                    Borclunun Adı və Soyadı *
                  </label>
                  <span className="text-[10px] font-bold text-red-700 dark:text-red-400 bg-white dark:bg-red-950 px-2 py-0.5 rounded-full border border-red-200 dark:border-red-800">
                    Qırmızı İşarə
                  </span>
                </div>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-red-500 dark:text-red-400" />
                  <input
                    type="text"
                    required
                    value={debtorName}
                    onChange={e => handleDebtorNameChange(e.target.value)}
                    placeholder="məs: Əli Həsənov"
                    className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-red-300 dark:border-red-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500 font-semibold"
                  />
                </div>
              </div>
            )}

            {/* Optional Date and Time override */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-medium block">Tarix</span>
                <input
                  type="date"
                  value={customDate}
                  onChange={e => setCustomDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 font-mono text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white"
                />
              </div>
              <div>
                <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-medium block">Saat</span>
                <input
                  type="time"
                  value={customTime}
                  onChange={e => setCustomTime(e.target.value)}
                  className="w-full px-2.5 py-1.5 font-mono text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white"
                />
              </div>
            </div>

            {/* Confirm Checkout Button */}
            <button
              type="button"
              disabled={cart.length === 0}
              onClick={handleCompleteSale}
              style={cart.length > 0 ? { backgroundColor: primaryColor } : undefined}
              className={`w-full py-3.5 px-4 font-black text-sm rounded-2xl transition-all shadow-md flex items-center justify-center gap-2 active:scale-[0.98] ${
                cart.length === 0
                  ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 cursor-not-allowed'
                  : 'text-white hover:opacity-95'
              }`}
            >
              <Check className="w-5 h-5 stroke-[2.5]" />
              <span>Satışı Tamamla ({formatAZN(cartTotal)})</span>
            </button>
          </div>
        </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────
          SUB-TAB 2: GÜNDƏLİK SATIŞ CƏDVƏLİ
         ───────────────────────────────────────────────────────── */}
      {activeSubTab === 'daily' && (
        <div className="space-y-6">
          <div className="p-4 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-red-500" />
              <div>
                <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium block">Günü Seçin:</span>
                <input
                  type="date"
                  value={selectedDay}
                  onChange={e => setSelectedDay(e.target.value)}
                  className="font-mono text-sm font-bold bg-transparent border-b border-zinc-300 dark:border-zinc-700 pb-0.5 text-zinc-900 dark:text-white focus:outline-none focus:border-red-500"
                />
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="text-right">
                <span className="text-xs text-zinc-500 dark:text-zinc-400 block">
                  Ümumi Satış / Faktiki Kassa
                </span>
                <div className="flex items-baseline justify-end gap-2">
                  <span className="text-xl font-black font-mono text-zinc-900 dark:text-white">
                    {formatAZN(selectedDayMetrics.grossSalesTotal)}
                  </span>
                  <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    (Kassa: {formatAZN(selectedDayMetrics.actualDrawerInflow)})
                  </span>
                </div>
                {selectedDayMetrics.debtCollectedTotal > 0 && (
                  <span className="text-[11px] font-mono text-amber-600 dark:text-amber-400 block font-semibold">
                    Geri alınan borc: +{formatAZN(selectedDayMetrics.debtCollectedTotal)}
                  </span>
                )}
              </div>

              {!dayConfirmed && daySales.length > 0 && (
                <button
                  type="button"
                  onClick={() => confirmDaySales(selectedDay)}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm flex items-center gap-1.5 transition-colors"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>Günü Təsdiq Et</span>
                </button>
              )}

              {dayConfirmed && daySales.length > 0 && (
                <div className="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 rounded-xl text-xs font-bold flex items-center gap-1.5">
                  <CheckCircle className="w-4 h-4" />
                  <span>Gün Təsdiqlənib</span>
                </div>
              )}
            </div>
          </div>

          {/* 6-Metric Separation Breakdown for Selected Day */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="p-3.5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 block">
                Ümumi Satış
              </span>
              <span className="text-base font-black font-mono text-zinc-900 dark:text-white mt-1 block">
                {formatAZN(selectedDayMetrics.grossSalesTotal)}
              </span>
            </div>
            <div className="p-3.5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block">
                Nağd Satış
              </span>
              <span className="text-base font-black font-mono text-emerald-700 dark:text-emerald-400 mt-1 block">
                {formatAZN(selectedDayMetrics.cashSales)}
              </span>
            </div>
            <div className="p-3.5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 block">
                Kart / POS Satış
              </span>
              <span className="text-base font-black font-mono text-blue-700 dark:text-blue-400 mt-1 block">
                {formatAZN(selectedDayMetrics.cardSales + selectedDayMetrics.posSales)}
              </span>
            </div>
            <div className="p-3.5 rounded-2xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 shadow-sm">
              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400 block">
                Borcla Satış
              </span>
              <span className="text-base font-black font-mono text-rose-700 dark:text-rose-400 mt-1 block">
                {formatAZN(selectedDayMetrics.creditSales)}
              </span>
            </div>
            <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 shadow-sm">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300 block">
                Faktiki Kassaya Girən
              </span>
              <span className="text-base font-black font-mono text-emerald-800 dark:text-emerald-300 mt-1 block">
                {formatAZN(selectedDayMetrics.actualDrawerInflow)}
              </span>
            </div>
            <div className="p-3.5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm">
              <span className="text-[10px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400 block">
                Ödənilməmiş Borclar
              </span>
              <span className="text-base font-black font-mono text-red-600 dark:text-red-400 mt-1 block">
                {formatAZN(selectedDayMetrics.totalUnpaidDebts)}
              </span>
            </div>
          </div>

          {/* Product-by-product breakdown for this day */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-5 space-y-4">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
              Bu Gün Hansı Məhsuldan Neçə Ədəd Satılıb?
            </h3>

            {Object.keys(dailyProductStats).length === 0 ? (
              <div className="py-8 text-center text-xs text-zinc-500">
                Seçilmiş tarixdə satış qeydə alınmayıb.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {Object.entries(dailyProductStats).map(([pId, stat]) => (
                  <div
                    key={pId}
                    className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-1"
                  >
                    <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200 truncate">
                      {stat.name}
                    </p>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-sm font-mono font-extrabold text-red-600 dark:text-red-400">
                        {stat.quantity} ədəd
                      </span>
                      <span className="text-xs font-mono text-zinc-500 dark:text-zinc-400">
                        {formatAZN(stat.revenue)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sales List for this Day */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Günün Satış Əməliyyatları ({daySales.length})
              </h4>
              <button
                type="button"
                onClick={() => exportSalesToCSV(daySales)}
                className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 flex items-center gap-1"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Günü Export Et</span>
              </button>
            </div>

            {daySales.length === 0 ? (
              <div className="py-12 text-center text-xs text-zinc-500">
                Seçilmiş tarixdə satış yoxdur.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-50 dark:bg-zinc-950 text-zinc-500 dark:text-zinc-400 font-bold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="py-2.5 px-4">Saat</th>
                      <th className="py-2.5 px-4">Məhsullar</th>
                      <th className="py-2.5 px-4">Məsul</th>
                      <th className="py-2.5 px-4">Ödəniş</th>
                      <th className="py-2.5 px-4 text-right">Məbləğ</th>
                      <th className="py-2.5 px-4 text-center">Status</th>
                      {isAdmin && <th className="py-2.5 px-4 text-center">Əməliyyat</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {daySales.map(s => (
                      <tr key={s.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                        <td className="py-3 px-4 font-mono text-zinc-500 dark:text-zinc-400">{s.time}</td>
                        <td className="py-3 px-4 font-medium text-zinc-800 dark:text-zinc-200 max-w-sm">
                          {s.items.map(i => `${i.productName} (${i.quantity} əd.)`).join(', ')}
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                          @{s.createdBy || 'admin'}
                        </td>
                        <td className="py-3 px-4 font-bold text-[10px] uppercase">
                          <span className={`px-2 py-0.5 rounded-full ${
                            s.paymentType === 'naqd'
                              ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900'
                              : s.paymentType === 'kart'
                              ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900'
                              : s.paymentType === 'pos'
                              ? 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900'
                              : 'bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900 font-bold'
                          }`}>
                            {s.paymentType === 'borc' ? `Borc: ${s.debtorName}` : s.paymentType}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-zinc-900 dark:text-white">
                          {formatAZN(s.totalAmount)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {s.isConfirmed ? (
                            <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-900">
                              Təsdiqlənib
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => confirmSale(s.id)}
                              className="text-[10px] font-bold text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950 hover:bg-red-100 dark:hover:bg-red-900 border border-red-200 dark:border-red-800 px-2.5 py-1 rounded-full transition-colors"
                            >
                              Təsdiq Et
                            </button>
                          )}
                        </td>
                        {isAdmin && (
                          <td className="py-3 px-4 text-center">
                            {confirmDeleteSaleId === s.id ? (
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    deleteSale(s.id);
                                    setConfirmDeleteSaleId(null);
                                    showToast('success', 'Satış qeydi silindi.');
                                  }}
                                  className="px-2 py-0.5 text-[10px] font-bold bg-red-600 text-white rounded-md"
                                >
                                  Sil
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteSaleId(null)}
                                  className="px-1.5 py-0.5 text-[10px] font-semibold bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-md"
                                >
                                  Yox
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteSaleId(s.id)}
                                className="p-1 text-red-600 dark:text-red-400 hover:text-red-500"
                                title="Sil"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
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
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────
          SUB-TAB 3: AYLIQ YIĞIM
         ───────────────────────────────────────────────────────── */}
      {activeSubTab === 'monthly' && (
        <div className="space-y-6">
          <div className="p-4 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-red-500" />
              <div>
                <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium block">Ayı Seçin:</span>
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={e => setSelectedMonth(e.target.value)}
                  className="font-mono text-sm font-bold bg-transparent border-b border-zinc-300 dark:border-zinc-700 pb-0.5 text-zinc-900 dark:text-white focus:outline-none focus:border-red-500"
                />
              </div>
            </div>

            <div className="text-right">
              <span className="text-xs text-zinc-500 dark:text-zinc-400 block">{getMonthLabelAZ(selectedMonth)} Ümumi Dövriyyəsi</span>
              <span className="text-2xl font-black font-mono text-red-600 dark:text-red-400">
                {formatAZN(monthTotalAmount)}
              </span>
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-5 space-y-4">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
              Ay Üzrə Məhsul Yığımı (Say və AZN)
            </h3>

            {Object.keys(monthlyProductStats).length === 0 ? (
              <div className="py-12 text-center text-xs text-zinc-500">
                Seçilmiş ay üçün satış qeydə alınmayıb.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-50 dark:bg-zinc-950 text-zinc-500 dark:text-zinc-400 font-bold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="py-3 px-4">Məhsul</th>
                      <th className="py-3 px-4 text-center">Satılan Say</th>
                      <th className="py-3 px-4 text-right">Ümumi Məbləğ</th>
                      <th className="py-3 px-4 text-right">Orta Qiymət</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {Object.entries(monthlyProductStats).map(([pId, stat]) => (
                      <tr key={pId} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                        <td className="py-3 px-4 font-bold text-zinc-900 dark:text-zinc-100">
                          {stat.name}
                        </td>
                        <td className="py-3 px-4 text-center font-mono font-bold text-red-600 dark:text-red-400">
                          {stat.quantity} ədəd
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-zinc-900 dark:text-white">
                          {formatAZN(stat.revenue)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-zinc-500 dark:text-zinc-400">
                          {formatAZN(stat.quantity ? stat.revenue / stat.quantity : 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Barcode Scanner Modal */}
      <BarcodeScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScan={handleBarcodeScanned}
        title="Məhsulu Səbətə Əlavə Et"
      />

      {/* Customer Existing Debt Warning Modal */}
      <DebtWarningModal
        isOpen={isDebtModalOpen}
        debtorName={debtWarningDetails.name}
        totalRemainingDebt={debtWarningDetails.amount}
        onClose={() => setIsDebtModalOpen(false)}
        onProceedAnyway={() => setIsDebtModalOpen(false)}
        onGoToDebtPay={() => {
          setIsDebtModalOpen(false);
          if (onNavigateToDebts) onNavigateToDebts();
        }}
      />

      {/* Quick Deposit Top-up Modal */}
      {isDepositModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-md p-5 sm:p-6 space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-600 text-white flex items-center justify-center">
                  <Coins className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-zinc-900 dark:text-white">Müştəri Balansını Artır</h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Depozit daxil etmə (məs: Əli 10 AZN verir)</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDepositModalOpen(false)}
                className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500 dark:text-zinc-400 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleQuickDepositSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-zinc-700 dark:text-zinc-300 font-bold mb-1">Müştərinin Adı *</label>
                <input
                  type="text"
                  required
                  value={depositName}
                  onChange={e => setDepositName(e.target.value)}
                  placeholder="məs: Əli"
                  className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-zinc-700 dark:text-zinc-300 font-bold mb-1">Depozit Məbləği (AZN) *</label>
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  required
                  value={depositAmount}
                  onChange={e => setDepositAmount(Number(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white font-mono font-bold text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                {/* Quick amount shortcuts */}
                <div className="flex gap-2 mt-2">
                  {[5, 10, 20, 50].map(amt => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setDepositAmount(amt)}
                      className={`flex-1 py-1 rounded-lg border text-[11px] font-bold ${
                        depositAmount === amt
                          ? 'bg-amber-600 text-white border-amber-500'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                      }`}
                    >
                      {amt} AZN
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-zinc-700 dark:text-zinc-300 font-bold mb-1">Ödəniş Metodu</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['naqd', 'kart', 'pos'] as const).map(pt => (
                    <button
                      key={pt}
                      type="button"
                      onClick={() => setDepositPaymentType(pt)}
                      className={`py-1.5 rounded-lg border text-[11px] font-bold uppercase transition-all ${
                        depositPaymentType === pt
                          ? 'bg-amber-600 text-white border-amber-500 shadow-sm'
                          : 'bg-zinc-50 dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                      }`}
                    >
                      {pt}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-zinc-700 dark:text-zinc-300 font-bold mb-1">Qeyd (İstəyə bağlı)</label>
                <input
                  type="text"
                  value={depositNote}
                  onChange={e => setDepositNote(e.target.value)}
                  placeholder="məs: Su üçün qabaqcadan depozit"
                  className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsDepositModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 font-bold transition-colors"
                >
                  Ləğv et
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold transition-all shadow-md"
                >
                  Balansı Artır ({formatAZN(depositAmount)})
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
