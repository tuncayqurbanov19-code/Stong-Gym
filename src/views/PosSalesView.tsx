import React, { useState } from 'react';
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
import { checkCustomerDebt } from '../utils/financialCalculations';
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
    sales,
    debts,
    addSale,
    confirmSale,
    confirmDaySales,
    deleteSale,
    currentUser,
    settings,
  } = useApp();

  const isAdmin = currentUser?.role === 'admin';

  // POS State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentType, setPaymentType] = useState<PaymentType>('naqd');
  const [debtorName, setDebtorName] = useState('');
  const [customDate, setCustomDate] = useState(getTodayISODate());
  const [customTime, setCustomTime] = useState(getCurrentTimeHHMM());
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

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
    } else {
      alert(`"${barcode}" barkodlu məhsul tapılmadı!`);
    }
  };

  // Submit Sale
  const handleCompleteSale = () => {
    if (cart.length === 0) return;
    if (paymentType === 'borc' && !debtorName.trim()) {
      alert('Zəhmət olmasa borclunun adını daxil edin!');
      return;
    }

    const res = addSale({
      items: cart.map(i => ({ productId: i.product.id, quantity: i.quantity })),
      paymentType,
      debtorName: paymentType === 'borc' ? debtorName.trim() : undefined,
      customDate,
      customTime,
    });

    if (res.success) {
      clearCart();
    } else {
      alert(res.error || 'Satış tamamlanmadı');
    }
  };

  // Filtered products for POS grid
  const filteredProducts = products.filter(p => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.barcode.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCat = selectedCategory === 'all' || p.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  // Daily Sales Summary calculations
  const daySales = sales.filter(s => s.date === selectedDay);
  const dayConfirmed = daySales.length > 0 && daySales.every(s => s.isConfirmed);
  const dayTotalAmount = daySales.reduce((sum, s) => sum + s.totalAmount, 0);

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-zinc-800">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <span>Kassa & Satış (POS)</span>
            <span className="text-xs bg-red-950 text-red-400 font-bold px-2 py-0.5 rounded-full border border-red-800">
              Terminal
            </span>
          </h2>
          <p className="text-xs sm:text-sm text-zinc-400">
            Sürətli toxunma ilə satış, barkod oxuma və gündəlik cədvəl
          </p>
        </div>

        {/* Sub-nav tabs */}
        <div className="flex items-center p-1 bg-zinc-900 border border-zinc-800 rounded-xl">
          <button
            onClick={() => setActiveSubTab('pos')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
              activeSubTab === 'pos'
                ? 'bg-red-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Satış Terminalı
          </button>
          <button
            onClick={() => setActiveSubTab('daily')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
              activeSubTab === 'daily'
                ? 'bg-red-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Gündəlik Satış Cədvəli
          </button>
          <button
            onClick={() => setActiveSubTab('monthly')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
              activeSubTab === 'monthly'
                ? 'bg-red-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-white'
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
                  className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-zinc-700 bg-zinc-900 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              <button
                type="button"
                onClick={() => setIsScannerOpen(true)}
                className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shrink-0 transition-all shadow-md shadow-red-600/30 active:scale-95"
              >
                <Camera className="w-4 h-4" />
                <span className="hidden sm:inline">Barkod Oxut</span>
              </button>
            </div>

            {/* Category horizontal pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => setSelectedCategory('all')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-xl whitespace-nowrap transition-colors ${
                  selectedCategory === 'all'
                    ? 'bg-red-600 text-white font-bold shadow-sm'
                    : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-white'
                }`}
              >
                Hamısı
              </button>
              {categories.map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-xl whitespace-nowrap transition-colors ${
                    selectedCategory === cat
                      ? 'bg-red-600 text-white font-bold shadow-sm'
                      : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-white'
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
                        ? 'border-red-500 bg-red-950/20 shadow-md shadow-red-950/40 ring-1 ring-red-500'
                        : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700 shadow-sm'
                    }`}
                  >
                    {inCart && (
                      <span className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-red-600 text-white font-black text-xs flex items-center justify-center shadow-lg shadow-red-600/50">
                        {inCart.quantity}
                      </span>
                    )}

                    <div>
                      <div className="flex items-center justify-between text-[10px] text-zinc-400 mb-1">
                        <span className="truncate">{product.category}</span>
                        {product.volume && <span>{product.volume}</span>}
                      </div>

                      <h4 className="text-xs sm:text-sm font-bold text-white line-clamp-2 leading-snug">
                        {product.name}
                      </h4>
                    </div>

                    <div className="mt-3 pt-2 border-t border-zinc-800 flex items-center justify-between">
                      <span className="text-xs sm:text-sm font-mono font-extrabold text-red-400">
                        {formatAZN(product.salePrice)}
                      </span>

                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                        stock.isLowStock
                          ? 'bg-red-950 text-red-400 border border-red-800 font-bold'
                          : 'bg-zinc-800 text-zinc-400'
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
          <div className="lg:col-span-5 xl:col-span-4 bg-zinc-900 rounded-3xl border border-zinc-800 shadow-2xl p-5 space-y-5 sticky top-16">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-red-500" />
                <h3 className="text-base font-bold text-white">
                  Cari Səbət ({cartItemCount})
                </h3>
              </div>
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={clearCart}
                  className="text-xs text-red-400 hover:text-red-300 font-semibold"
                >
                  Təmizlə
                </button>
              )}
            </div>

            {/* Cart Items List */}
            {cart.length === 0 ? (
              <div className="py-12 text-center text-zinc-500 space-y-2">
                <ShoppingCart className="w-8 h-8 mx-auto text-zinc-600" />
                <p className="text-xs">Səbət boşdur. Məhsul seçin və ya barkodu oxudun.</p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1 divide-y divide-zinc-800">
                {cart.map(item => (
                  <div key={item.product.id} className="pt-2 flex items-center justify-between gap-2">
                    <div className="flex-1 truncate">
                      <p className="text-xs font-bold text-white truncate">
                        {item.product.name}
                      </p>
                      <p className="text-[11px] font-mono text-zinc-400">
                        {item.quantity} × {formatAZN(item.product.salePrice)} = <strong className="text-red-400">{formatAZN(item.quantity * item.product.salePrice)}</strong>
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.product.id, -1)}
                        className="w-7 h-7 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 flex items-center justify-center transition-colors"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-6 text-center font-mono font-bold text-xs text-white">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.product.id, 1)}
                        className="w-7 h-7 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 flex items-center justify-center transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeFromCart(item.product.id)}
                        className="w-7 h-7 rounded-lg text-red-400 hover:bg-red-950/40 flex items-center justify-center ml-1 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Total Display */}
            <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                  Yekun Məbləğ
                </span>
                <p className="text-xs text-zinc-500">
                  {settings.autoConfirmSales ? 'Avtomatik təsdiq aktivdir' : 'Gün sonunda təsdiqlənəcək'}
                </p>
              </div>
              <div className="text-2xl font-black font-mono text-white">
                {formatAZN(cartTotal)}
              </div>
            </div>

            {/* Payment Method Selector (Nağd, Kart, POS, Borc) */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
                Ödəniş Növü
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentType('naqd')}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center gap-2 transition-all ${
                    paymentType === 'naqd'
                      ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-950'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  <Banknote className="w-4 h-4 text-emerald-400" />
                  <span>Nağd</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentType('kart')}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center gap-2 transition-all ${
                    paymentType === 'kart'
                      ? 'bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-950'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  <CreditCard className="w-4 h-4 text-blue-400" />
                  <span>Bank Kartı</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentType('pos')}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center gap-2 transition-all ${
                    paymentType === 'pos'
                      ? 'bg-red-600 text-white border-red-500 shadow-md shadow-red-950'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  <Smartphone className="w-4 h-4 text-red-400" />
                  <span>POS Terminal</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentType('borc')}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center gap-2 transition-all ${
                    paymentType === 'borc'
                      ? 'bg-rose-700 text-white border-rose-600 shadow-md shadow-rose-950'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  <BookOpen className="w-4 h-4 text-rose-400" />
                  <span>Nisyə (Borc)</span>
                </button>
              </div>
            </div>

            {/* If BORC, Customer Name Input with real-time existing debt alert */}
            {paymentType === 'borc' && (
              <div className="space-y-2 p-3.5 rounded-2xl bg-red-950/40 border border-red-800 animate-in fade-in">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-red-300 uppercase tracking-wider">
                    Borclunun Adı və Soyadı *
                  </label>
                  <span className="text-[10px] font-bold text-red-400 bg-red-950 px-2 py-0.5 rounded-full border border-red-800">
                    Qırmızı İşarə
                  </span>
                </div>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-red-400" />
                  <input
                    type="text"
                    required
                    value={debtorName}
                    onChange={e => handleDebtorNameChange(e.target.value)}
                    placeholder="məs: Əli Həsənov"
                    className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-red-700 bg-zinc-950 text-white focus:outline-none focus:ring-2 focus:ring-red-500 font-semibold"
                  />
                </div>
              </div>
            )}

            {/* Optional Date and Time override */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-[10px] text-zinc-400 font-medium block">Tarix</span>
                <input
                  type="date"
                  value={customDate}
                  onChange={e => setCustomDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 font-mono text-xs rounded-lg border border-zinc-700 bg-zinc-950 text-white"
                />
              </div>
              <div>
                <span className="text-[10px] text-zinc-400 font-medium block">Saat</span>
                <input
                  type="time"
                  value={customTime}
                  onChange={e => setCustomTime(e.target.value)}
                  className="w-full px-2.5 py-1.5 font-mono text-xs rounded-lg border border-zinc-700 bg-zinc-950 text-white"
                />
              </div>
            </div>

            {/* Confirm Checkout Button */}
            <button
              type="button"
              disabled={cart.length === 0}
              onClick={handleCompleteSale}
              className={`w-full py-3.5 px-4 font-black text-sm rounded-2xl transition-all shadow-md flex items-center justify-center gap-2 active:scale-[0.98] ${
                cart.length === 0
                  ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                  : 'bg-red-600 hover:bg-red-700 text-white shadow-red-600/30'
              }`}
            >
              <Check className="w-5 h-5 stroke-[2.5]" />
              <span>Satışı Tamamla ({formatAZN(cartTotal)})</span>
            </button>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────
          SUB-TAB 2: GÜNDƏLİK SATIŞ CƏDVƏLİ
         ───────────────────────────────────────────────────────── */}
      {activeSubTab === 'daily' && (
        <div className="space-y-6">
          <div className="p-4 bg-zinc-900 rounded-2xl border border-zinc-800 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-red-500" />
              <div>
                <span className="text-xs text-zinc-400 font-medium block">Günü Seçin:</span>
                <input
                  type="date"
                  value={selectedDay}
                  onChange={e => setSelectedDay(e.target.value)}
                  className="font-mono text-sm font-bold bg-transparent border-b border-zinc-700 pb-0.5 text-white focus:outline-none focus:border-red-500"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-right">
                <span className="text-xs text-zinc-400 block">Günlük Cəm Satış</span>
                <span className="text-xl font-black font-mono text-white">
                  {formatAZN(dayTotalAmount)}
                </span>
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
                <div className="px-3 py-1.5 bg-emerald-950 border border-emerald-800 text-emerald-300 rounded-xl text-xs font-bold flex items-center gap-1.5">
                  <CheckCircle className="w-4 h-4" />
                  <span>Gün Təsdiqlənib</span>
                </div>
              )}
            </div>
          </div>

          {/* Product-by-product breakdown for this day */}
          <div className="bg-zinc-900 rounded-2xl border border-zinc-800 shadow-md p-5 space-y-4">
            <h3 className="text-sm font-bold text-white">
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
                    className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1"
                  >
                    <p className="text-xs font-bold text-zinc-200 truncate">
                      {stat.name}
                    </p>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-sm font-mono font-extrabold text-red-400">
                        {stat.quantity} ədəd
                      </span>
                      <span className="text-xs font-mono text-zinc-400">
                        {formatAZN(stat.revenue)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sales List for this Day */}
          <div className="bg-zinc-900 rounded-2xl border border-zinc-800 shadow-md overflow-hidden">
            <div className="p-4 border-b border-zinc-800 flex justify-between items-center">
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                Günün Satış Əməliyyatları ({daySales.length})
              </h4>
              <button
                onClick={() => exportSalesToCSV(daySales)}
                className="text-xs font-semibold text-zinc-400 hover:text-red-400 flex items-center gap-1"
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
                  <thead className="bg-zinc-950 text-zinc-400 font-bold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="py-2.5 px-4">Saat</th>
                      <th className="py-2.5 px-4">Məhsullar</th>
                      <th className="py-2.5 px-4">Ödəniş</th>
                      <th className="py-2.5 px-4 text-right">Məbləğ</th>
                      <th className="py-2.5 px-4 text-center">Status</th>
                      {isAdmin && <th className="py-2.5 px-4 text-center">Əməliyyat</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {daySales.map(s => (
                      <tr key={s.id} className="hover:bg-zinc-800/40">
                        <td className="py-3 px-4 font-mono text-zinc-400">{s.time}</td>
                        <td className="py-3 px-4 font-medium text-zinc-200 max-w-sm">
                          {s.items.map(i => `${i.productName} (${i.quantity} əd.)`).join(', ')}
                        </td>
                        <td className="py-3 px-4 font-bold text-[10px] uppercase">
                          <span className={`px-2 py-0.5 rounded-full ${
                            s.paymentType === 'naqd'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-900'
                              : s.paymentType === 'kart'
                              ? 'bg-blue-950 text-blue-300 border border-blue-900'
                              : s.paymentType === 'pos'
                              ? 'bg-red-950 text-red-300 border border-red-900'
                              : 'bg-rose-950 text-rose-300 border border-rose-900 font-bold'
                          }`}>
                            {s.paymentType === 'borc' ? `Borc: ${s.debtorName}` : s.paymentType}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-white">
                          {formatAZN(s.totalAmount)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {s.isConfirmed ? (
                            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded-full border border-emerald-900">
                              Təsdiqlənib
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => confirmSale(s.id)}
                              className="text-[10px] font-bold text-red-300 bg-red-950 hover:bg-red-900 border border-red-800 px-2.5 py-1 rounded-full transition-colors"
                            >
                              Təsdiq Et
                            </button>
                          )}
                        </td>
                        {isAdmin && (
                          <td className="py-3 px-4 text-center">
                            <button
                              type="button"
                              onClick={() => {
                                if (confirm('Bu satışı silmək istəyirsiniz?')) {
                                  deleteSale(s.id);
                                }
                              }}
                              className="p-1 text-red-400 hover:text-red-300"
                              title="Sil"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
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
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────
          SUB-TAB 3: AYLIQ YIĞIM
         ───────────────────────────────────────────────────────── */}
      {activeSubTab === 'monthly' && (
        <div className="space-y-6">
          <div className="p-4 bg-zinc-900 rounded-2xl border border-zinc-800 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-red-500" />
              <div>
                <span className="text-xs text-zinc-400 font-medium block">Ayı Seçin:</span>
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={e => setSelectedMonth(e.target.value)}
                  className="font-mono text-sm font-bold bg-transparent border-b border-zinc-700 pb-0.5 text-white focus:outline-none focus:border-red-500"
                />
              </div>
            </div>

            <div className="text-right">
              <span className="text-xs text-zinc-400 block">{getMonthLabelAZ(selectedMonth)} Ümumi Dövriyyəsi</span>
              <span className="text-2xl font-black font-mono text-red-400">
                {formatAZN(monthTotalAmount)}
              </span>
            </div>
          </div>

          <div className="bg-zinc-900 rounded-2xl border border-zinc-800 shadow-md p-5 space-y-4">
            <h3 className="text-sm font-bold text-white">
              Ay Üzrə Məhsul Yığımı (Say və AZN)
            </h3>

            {Object.keys(monthlyProductStats).length === 0 ? (
              <div className="py-12 text-center text-xs text-zinc-500">
                Seçilmiş ay üçün satış qeydə alınmayıb.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-950 text-zinc-400 font-bold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="py-3 px-4">Məhsul</th>
                      <th className="py-3 px-4 text-center">Satılan Say</th>
                      <th className="py-3 px-4 text-right">Ümumi Məbləğ</th>
                      <th className="py-3 px-4 text-right">Orta Qiymət</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {Object.entries(monthlyProductStats).map(([pId, stat]) => (
                      <tr key={pId} className="hover:bg-zinc-800/40">
                        <td className="py-3 px-4 font-bold text-zinc-100">
                          {stat.name}
                        </td>
                        <td className="py-3 px-4 text-center font-mono font-bold text-red-400">
                          {stat.quantity} ədəd
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-white">
                          {formatAZN(stat.revenue)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-zinc-400">
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
    </div>
  );
};
