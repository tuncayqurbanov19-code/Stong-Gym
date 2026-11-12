import React, { useMemo, useState } from 'react';
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
  Wallet,
  Coins,
  ChevronDown,
  ChevronUp,
  Trash2,
  Banknote,
  CreditCard,
  Smartphone,
  History,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { DebtPaymentMethod, DebtRecord } from '../types';
import { formatAZN, formatDateAZ, getTodayISODate } from '../utils/dateUtils';
import { checkCustomerDebt, calculateDebtOverview } from '../utils/financialCalculations';
import { DebtWarningModal } from '../components/DebtWarningModal';
import { exportDebtsToCSV } from '../utils/exportUtils';

export const DebtsView: React.FC = () => {
  const {
    debts,
    addDebt,
    acceptDebtPayment,
    deleteDebtPayment,
    products,
    customerAccounts,
    depositToCustomer,
    deleteCustomerAccount,
    currentUser,
    users,
    settings,
    showToast,
  } = useApp();

  const isAdmin = currentUser?.role === 'admin';
  const todayISO = getTodayISODate();
  const primaryColor = settings.primaryColor || '#dc2626';

  const [activeTab, setActiveTab] = useState<'balances' | 'debtors' | 'records'>('debtors');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'borcdadir' | 'qismen' | 'odanilib'>('all');
  const [dateFilter, setDateFilter] = useState('');
  const [expandedCustomerMap, setExpandedCustomerMap] = useState<Record<string, boolean>>({});
  const [expandedDebtMap, setExpandedDebtMap] = useState<Record<string, boolean>>({});
  const [confirmDeletePayId, setConfirmDeletePayId] = useState<string | null>(null);
  const [confirmDeleteCustId, setConfirmDeleteCustId] = useState<string | null>(null);

  const toggleCustomerExpanded = (id: string) => {
    setExpandedCustomerMap(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleDebtExpanded = (id: string) => {
    setExpandedDebtMap(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Modal: Customer Deposit / Account Creation
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [depositName, setDepositName] = useState('');
  const [depositAmount, setDepositAmount] = useState<number>(10);
  const [depositPaymentType, setDepositPaymentType] = useState<'naqd' | 'kart' | 'pos'>('naqd');
  const [depositNote, setDepositNote] = useState('');

  const handleDepositSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = depositName.trim();
    if (!name || depositAmount <= 0) {
      showToast('error', 'Müştəri adı və müsbət məbləğ daxil edin!');
      return;
    }
    depositToCustomer(name, depositAmount, depositPaymentType, depositNote);
    setIsDepositModalOpen(false);
    setDepositName('');
    setDepositNote('');
  };

  // Modal: Add Debt Record
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [debtorName, setDebtorName] = useState('');
  const [selectedProductId, setSelectedProductId] = useState(products[0]?.id || '');
  const [quantity, setQuantity] = useState('1');
  const [customAmount, setCustomAmount] = useState('');
  const [initialPaid, setInitialPaid] = useState('0');
  const [date, setDate] = useState(todayISO);
  const [notes, setNotes] = useState('');

  // Modal: Payment Collection
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [selectedDebt, setSelectedDebt] = useState<DebtRecord | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<DebtPaymentMethod>('naqd');
  const [paymentReceivedBy, setPaymentReceivedBy] = useState(currentUser?.username || 'isci');
  const [paymentDate, setPaymentDate] = useState(todayISO);
  const [paymentNote, setPaymentNote] = useState('');
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

  // Warning Modal
  const [isWarningOpen, setIsWarningOpen] = useState(false);
  const [warningData, setWarningData] = useState<{ name: string; amount: number }>({
    name: '',
    amount: 0,
  });

  // Calculate Debt Overview + Today Collected Debt Payments
  const overview = useMemo(() => calculateDebtOverview(debts), [debts]);

  const todayCollectedSummary = useMemo(() => {
    const todayPayments = debts
      .flatMap(d => d.payments || [])
      .filter(p => (p.paidAt || p.date || '').split('T')[0] === todayISO);
    const total = todayPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    return {
      total: Math.round(total * 100) / 100,
      count: todayPayments.length,
    };
  }, [debts, todayISO]);

  // Group debts by Debtor Name
  const debtorsList = useMemo(() => {
    const debtorsMap: Record<
      string,
      {
        debtorName: string;
        totalDebt: number;
        totalPaid: number;
        remainingDebt: number;
        records: DebtRecord[];
        hasUnpaid: boolean;
        hasPartial: boolean;
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
          hasPartial: false,
          lastDate: d.date,
        };
      }
      debtorsMap[key].totalDebt += d.totalAmount;
      debtorsMap[key].totalPaid += d.paidAmount;
      debtorsMap[key].remainingDebt += d.remainingAmount;
      debtorsMap[key].records.push(d);
      if (d.date > debtorsMap[key].lastDate) {
        debtorsMap[key].lastDate = d.date;
      }
      if ((d.status === 'borcdadir' || d.status === 'qismen') && d.remainingAmount > 0) {
        debtorsMap[key].hasUnpaid = true;
      }
      if (d.status === 'qismen') {
        debtorsMap[key].hasPartial = true;
      }
    }

    return Object.values(debtorsMap).sort((a, b) => b.remainingDebt - a.remainingDebt);
  }, [debts]);

  const filteredDebtors = useMemo(
    () =>
      debtorsList.filter(d => {
        const matchesSearch = d.debtorName.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStatus =
          statusFilter === 'all' ||
          (statusFilter === 'borcdadir' && d.hasUnpaid && !d.hasPartial) ||
          (statusFilter === 'qismen' && d.records.some(r => r.status === 'qismen')) ||
          (statusFilter === 'odanilib' && !d.hasUnpaid);
        const matchesDate =
          !dateFilter ||
          d.records.some(
            r =>
              r.date === dateFilter ||
              (r.payments || []).some(p => (p.paidAt || p.date || '').split('T')[0] === dateFilter)
          );
        return matchesSearch && matchesStatus && matchesDate;
      }),
    [debtorsList, searchQuery, statusFilter, dateFilter]
  );

  const filteredRecords = useMemo(
    () =>
      debts.filter(d => {
        const matchesSearch =
          d.debtorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (d.notes && d.notes.toLowerCase().includes(searchQuery.toLowerCase()));
        const matchesStatus = statusFilter === 'all' || d.status === statusFilter;
        const matchesDate =
          !dateFilter ||
          d.date === dateFilter ||
          (d.payments || []).some(p => (p.paidAt || p.date || '').split('T')[0] === dateFilter);
        return matchesSearch && matchesStatus && matchesDate;
      }),
    [debts, searchQuery, statusFilter, dateFilter]
  );

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
    setPaymentMethod('naqd');
    setPaymentReceivedBy(currentUser?.username || 'isci');
    setPaymentDate(todayISO);
    setPaymentNote('Yerindəcə borc ödənişi');
    setPaymentError(null);
    setIsPayModalOpen(true);
  };

  const handleExecutePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDebt) return;
    setPaymentError(null);

    const amt = Math.round((parseFloat(paymentAmount) || 0) * 100) / 100;
    if (amt <= 0) {
      setPaymentError('Ödəniş məbləği sıfırdan böyük olmalıdır.');
      return;
    }
    if (amt > Math.round(selectedDebt.remainingAmount * 100) / 100 + 0.001) {
      setPaymentError(
        `Ödəniş məbləği qalıq borcdan (${formatAZN(selectedDebt.remainingAmount)}) çox ola bilməz.`
      );
      return;
    }

    setIsSubmittingPayment(true);
    try {
      const res = await acceptDebtPayment({
        debtId: selectedDebt.id,
        amount: amt,
        paymentMethod,
        receivedBy: paymentReceivedBy,
        date: paymentDate,
        note: paymentNote,
      });

      if (!res.success) {
        setPaymentError(res.error || 'Ödəniş qeydə alınmadı.');
        return;
      }

      setIsPayModalOpen(false);
      setSelectedDebt(null);
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  const getStatusBadge = (status: DebtRecord['status']) => {
    if (status === 'odanilib') {
      return {
        label: 'Ödənilib',
        cls: 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800',
      };
    }
    if (status === 'qismen') {
      return {
        label: 'Qismən ödənilib',
        cls: 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800',
      };
    }
    return {
      label: 'Borcdadır',
      cls: 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800',
    };
  };

  const getMethodLabel = (method?: string) => {
    const m = (method || 'naqd').toLowerCase();
    if (m === 'kart') return 'Kart';
    if (m === 'pos' || m === 'kocurme') return 'POS / Köçürmə';
    return 'Nağd';
  };

  // Customer Balances metrics
  const totalCustomerBalance = customerAccounts.reduce((sum, c) => sum + c.balance, 0);
  const totalCustomerDeposited = customerAccounts.reduce((sum, c) => sum + c.totalDeposited, 0);
  const totalCustomerSpent = customerAccounts.reduce((sum, c) => sum + c.totalSpent, 0);

  const filteredCustomerAccounts = customerAccounts.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 pb-12 max-w-7xl mx-auto">
      {/* Header and Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-zinc-200 dark:border-zinc-800">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-white tracking-tight flex flex-wrap items-center gap-2">
            <span>Müştəri Hesabları (Balans və Borclar)</span>
            <span className="text-xs bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-400 font-bold px-2.5 py-0.5 rounded-full border border-amber-200 dark:border-amber-800">
              {customerAccounts.length} Balans Hesabı
            </span>
            {overview.unpaidDebtorsCount > 0 && (
              <span className="text-xs bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400 font-bold px-2.5 py-0.5 rounded-full border border-red-200 dark:border-red-800">
                {overview.unpaidDebtorsCount} Borclu
              </span>
            )}
          </h2>
          <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
            Öncədən ödənilən müştəri depozitləri və nisyə (borc) ödənişlərinin yerindəcə qəbulu
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => exportDebtsToCSV(debts)}
            className="px-3 py-1.5 text-xs font-semibold bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Excel / CSV</span>
          </button>

          <button
            onClick={() => {
              setDepositName('');
              setDepositAmount(10);
              setIsDepositModalOpen(true);
            }}
            className="px-3.5 py-1.5 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-xl transition-all shadow-sm flex items-center gap-1.5"
          >
            <Wallet className="w-4 h-4" />
            <span>+ Balans / Depozit Aç</span>
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
              setDate(todayISO);
              setIsAddModalOpen(true);
            }}
            style={{ backgroundColor: primaryColor }}
            className="px-4 py-1.5 text-xs font-bold hover:opacity-95 text-white rounded-xl transition-all shadow-sm flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Yeni Borc Yaz</span>
          </button>
        </div>
      </div>

      {/* KPI Cards: Dynamic depending on activeTab */}
      {activeTab === 'balances' ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-amber-200 dark:border-amber-900/60 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                Ümumi Aktiv Depozit Balansı
              </span>
              <div className="text-2xl font-black text-amber-600 dark:text-amber-400 font-mono mt-1">
                {formatAZN(totalCustomerBalance)}
              </div>
              <p className="text-xs text-zinc-500 mt-0.5">Müştərilərin hesabında qalan vəsait</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-200 dark:border-amber-900/60">
              <Wallet className="w-6 h-6" />
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                Depozitli Müştəri Sayı
              </span>
              <div className="text-2xl font-black text-zinc-900 dark:text-white font-mono mt-1">
                {customerAccounts.length} nəfər
              </div>
              <p className="text-xs text-zinc-500 mt-0.5">Balans hesabı açılan müştərilər</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 flex items-center justify-center">
              <User className="w-6 h-6" />
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                Balansdan İstifadə (Çıxılan)
              </span>
              <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono mt-1">
                {formatAZN(totalCustomerSpent)}
              </div>
              <p className="text-xs text-zinc-500 mt-0.5">Qəbul edilmiş depozit: {formatAZN(totalCustomerDeposited)}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 flex items-center justify-center">
              <Coins className="w-6 h-6" />
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                Ümumi Qalıq Borc
              </span>
              <div className="text-2xl font-black text-red-600 dark:text-red-500 font-mono mt-1">
                {formatAZN(overview.totalRemainingDebt)}
              </div>
              <p className="text-xs text-zinc-500 mt-0.5">
                {overview.unpaidDebtorsCount} borclu · {overview.partialCount} qismən ödənilib
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 flex items-center justify-center border border-red-200 dark:border-red-900/60">
              <AlertTriangle className="w-6 h-6" />
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-emerald-200 dark:border-emerald-900/60 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                Bu Gün Qəbul Edilən Ödənişlər
              </span>
              <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono mt-1">
                {formatAZN(todayCollectedSummary.total)}
              </div>
              <p className="text-xs text-zinc-500 mt-0.5">
                {todayCollectedSummary.count} borc ödənişi qəbul edilib
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-200 dark:border-emerald-900/60">
              <CheckCircle className="w-6 h-6" />
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                Ümumi Ödənilmiş Borc
              </span>
              <div className="text-2xl font-black text-zinc-900 dark:text-white font-mono mt-1">
                {formatAZN(overview.totalPaidDebt)}
              </div>
              <p className="text-xs text-zinc-500 mt-0.5">Cəmi {debts.length} borc qeydi</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 flex items-center justify-center">
              <BookOpen className="w-6 h-6" />
            </div>
          </div>
        </div>
      )}

      {/* Tabs & Search Strip */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center p-1 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl gap-1">
          <button
            onClick={() => setActiveTab('debtors')}
            style={activeTab === 'debtors' ? { backgroundColor: primaryColor } : undefined}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'debtors'
                ? 'text-white shadow-sm'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            Borclular Paneli ({debtorsList.length})
          </button>
          <button
            onClick={() => setActiveTab('records')}
            style={activeTab === 'records' ? { backgroundColor: primaryColor } : undefined}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'records'
                ? 'text-white shadow-sm'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            Bütün Borc Qeydləri ({debts.length})
          </button>
          <button
            onClick={() => setActiveTab('balances')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === 'balances'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            <Wallet className="w-3.5 h-3.5" />
            <span>Müştəri Balansları ({customerAccounts.length})</span>
          </button>
        </div>

        {/* Search, Status & Date Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 sm:w-56">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Müştəri adı ilə axtar..."
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>

          <select
            value={statusFilter}
            onChange={e =>
              setStatusFilter(e.target.value as 'all' | 'borcdadir' | 'qismen' | 'odanilib')
            }
            aria-label="Status filtri"
            className="px-2.5 py-1.5 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            <option value="all">Bütün Statuslar</option>
            <option value="borcdadir">Borcdadır</option>
            <option value="qismen">Qismən Ödənilib</option>
            <option value="odanilib">Ödənilib</option>
          </select>

          <div className="flex items-center gap-1">
            <input
              type="date"
              value={dateFilter}
              onChange={e => setDateFilter(e.target.value)}
              aria-label="Tarix filtri"
              className="px-2.5 py-1.5 text-xs font-mono rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white"
            />
            {dateFilter && (
              <button
                type="button"
                onClick={() => setDateFilter('')}
                title="Tarix filtrini təmizlə"
                className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* TAB 0: MÜŞTƏRİ BALANSLARI */}
      {activeTab === 'balances' && (
        <div className="space-y-4">
          {filteredCustomerAccounts.length === 0 ? (
            <div className="py-16 text-center bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 text-zinc-500 text-xs space-y-3">
              <Wallet className="w-10 h-10 mx-auto text-zinc-400 dark:text-zinc-600" />
              <p>Müştəri balansı tapılmadı.</p>
              <button
                type="button"
                onClick={() => {
                  setDepositName('');
                  setDepositAmount(10);
                  setIsDepositModalOpen(true);
                }}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs"
              >
                + İlk Müştəri Balansını Aç
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredCustomerAccounts.map(customer => {
                const isExpanded = expandedCustomerMap[customer.id] ?? false;
                const hasTransactions = customer.transactions && customer.transactions.length > 0;

                return (
                  <div
                    key={customer.id}
                    className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col justify-between space-y-4"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/80 flex items-center justify-center font-bold text-sm">
                            {customer.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-zinc-900 dark:text-white">
                              {customer.name}
                            </h4>
                            <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                              {customer.phone || 'Depozit Hesabı'}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                              customer.balance > 0
                                ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700'
                            }`}
                          >
                            {customer.balance > 0 ? 'Müsbət Balans' : 'Balans 0 ₼'}
                          </span>
                          {isAdmin && (
                            confirmDeleteCustId === customer.id ? (
                              <div className="flex items-center gap-1 ml-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    deleteCustomerAccount(customer.id);
                                    setConfirmDeleteCustId(null);
                                  }}
                                  className="px-1.5 py-0.5 text-[10px] font-bold bg-red-600 text-white rounded"
                                >
                                  Sil
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteCustId(null)}
                                  className="px-1.5 py-0.5 text-[10px] bg-zinc-200 dark:bg-zinc-700 rounded"
                                >
                                  X
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteCustId(customer.id)}
                                className="p-1 text-zinc-400 hover:text-red-500 rounded-lg transition-colors ml-1"
                                title="Hesabı Sil"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )
                          )}
                        </div>
                      </div>

                      <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 flex items-center justify-between">
                        <div>
                          <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-bold uppercase tracking-wider block">
                            Cari Aktiv Balans
                          </span>
                          <span className="text-2xl font-black font-mono text-amber-600 dark:text-amber-400">
                            {formatAZN(customer.balance)}
                          </span>
                        </div>
                        <div className="text-right text-[11px] text-zinc-500 dark:text-zinc-400 space-y-0.5">
                          <p>
                            Qoyulan: <strong className="text-zinc-900 dark:text-zinc-200">{formatAZN(customer.totalDeposited)}</strong>
                          </p>
                          <p>
                            Çıxılan: <strong className="text-zinc-600 dark:text-zinc-400">{formatAZN(customer.totalSpent)}</strong>
                          </p>
                        </div>
                      </div>

                      {isExpanded && hasTransactions && (
                        <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800 text-xs space-y-2">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 flex justify-between">
                            <span>Son Hərəkətlər</span>
                            <span>{customer.transactions.length} qeyd</span>
                          </div>
                          <div className="divide-y divide-zinc-200 dark:divide-zinc-800/60 max-h-48 overflow-y-auto pr-1">
                            {customer.transactions.map(tx => (
                              <div key={tx.id} className="py-1.5 flex items-center justify-between text-[11px]">
                                <div>
                                  <span className="font-semibold text-zinc-800 dark:text-zinc-200 block">
                                    {tx.type === 'deposit' ? 'Balans Artımı' : 'Satış / Su'}
                                  </span>
                                  <span className="text-[10px] text-zinc-500">
                                    {formatDateAZ(tx.date)} {tx.time} · {tx.note || ''}
                                  </span>
                                </div>
                                <span
                                  className={`font-mono font-bold ${
                                    tx.type === 'deposit'
                                      ? 'text-emerald-600 dark:text-emerald-400'
                                      : 'text-red-600 dark:text-red-400'
                                  }`}
                                >
                                  {tx.type === 'deposit' ? '+' : '−'} {formatAZN(tx.amount)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setDepositName(customer.name);
                          setDepositAmount(10);
                          setIsDepositModalOpen(true);
                        }}
                        className="flex-1 py-2 px-3 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>+ Balans Artır</span>
                      </button>

                      {hasTransactions && (
                        <button
                          type="button"
                          onClick={() => toggleCustomerExpanded(customer.id)}
                          className="py-2 px-3 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-semibold text-xs rounded-xl transition-colors flex items-center gap-1"
                        >
                          <span>{isExpanded ? 'Bağla' : `Tarixçə (${customer.transactions.length})`}</span>
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 1: BORCLULAR PANELİ */}
      {activeTab === 'debtors' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDebtors.length === 0 ? (
            <div className="col-span-full py-16 text-center bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 text-zinc-500 text-xs">
              Axtarışa uyğun borclu tapılmadı.
            </div>
          ) : (
            filteredDebtors.map(debtor => {
              const activeUnpaid = debtor.records.filter(
                r => (r.status === 'borcdadir' || r.status === 'qismen') && r.remainingAmount > 0
              );
              const allPayments = debtor.records
                .flatMap(r =>
                  (r.payments || []).map(p => ({ ...p, debtId: r.id }))
                )
                .sort((a, b) => (b.paidAt || b.date).localeCompare(a.paidAt || a.date));
              const cardKey = `debtor-${debtor.debtorName.toLowerCase()}`;
              const isExpanded = expandedDebtMap[cardKey] ?? false;

              return (
                <div
                  key={debtor.debtorName}
                  className={`p-5 rounded-2xl bg-white dark:bg-zinc-900 border shadow-sm flex flex-col justify-between space-y-4 ${
                    debtor.hasUnpaid
                      ? 'border-red-300 dark:border-red-900/80'
                      : 'border-zinc-200 dark:border-zinc-800'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs ${
                            debtor.hasUnpaid
                              ? 'bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800'
                              : 'bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                          }`}
                        >
                          {debtor.debtorName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-zinc-900 dark:text-white">
                            {debtor.debtorName}
                          </h4>
                          <span className="text-[10px] text-zinc-500">
                            {debtor.records.length} borc qeydi · {allPayments.length} ödəniş
                          </span>
                        </div>
                      </div>

                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                          !debtor.hasUnpaid
                            ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                            : debtor.totalPaid > 0
                            ? 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                            : 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800'
                        }`}
                      >
                        {!debtor.hasUnpaid
                          ? 'Ödənilib'
                          : debtor.totalPaid > 0
                          ? 'Qismən'
                          : 'Borcdadır'}
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-[10px] text-zinc-500 block uppercase">Qalıq Borc</span>
                        <span className="font-mono font-extrabold text-base text-red-600 dark:text-red-500">
                          {formatAZN(debtor.remainingDebt)}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-zinc-500 block uppercase">Ödədiyi</span>
                        <span className="font-mono font-bold text-xs text-emerald-600 dark:text-emerald-400">
                          {formatAZN(debtor.totalPaid)}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1 text-xs">
                      <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">
                        Son Qeydlər:
                      </span>
                      {debtor.records.slice(0, 2).map(r => (
                        <div key={r.id} className="flex justify-between text-[11px] text-zinc-600 dark:text-zinc-400 gap-2">
                          <span className="truncate">
                            {formatDateAZ(r.date)} ({r.items.map(i => i.productName).join(', ')})
                          </span>
                          <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-200 shrink-0">
                            {formatAZN(r.remainingAmount)} qalıb
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Expandable Payment History inside Debtor Card */}
                    {isExpanded && (
                      <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-2">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 flex justify-between">
                          <span>Ödəniş Tarixçəsi</span>
                          <span>{allPayments.length} əd.</span>
                        </div>
                        {allPayments.length === 0 ? (
                          <p className="text-[11px] text-zinc-500">Hələ ödəniş qəbul edilməyib.</p>
                        ) : (
                          <div className="divide-y divide-zinc-200 dark:divide-zinc-800 max-h-44 overflow-y-auto pr-1">
                            {allPayments.map(p => (
                              <div key={p.id} className="py-1.5 flex items-center justify-between gap-2 text-[11px]">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-mono text-zinc-500">
                                      {formatDateAZ(p.paidAt || p.date)}
                                    </span>
                                    <span className="px-1.5 py-0.2 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-bold text-[10px]">
                                      {getMethodLabel(p.paymentMethod)}
                                    </span>
                                    <span className="text-zinc-500 truncate">
                                      @{p.receivedBy || 'admin'}
                                    </span>
                                  </div>
                                  {p.note && <div className="text-[10px] text-zinc-500 truncate">{p.note}</div>}
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                    {formatAZN(p.amount)}
                                  </span>
                                  {isAdmin && (
                                    confirmDeletePayId === p.id ? (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          void deleteDebtPayment(p.debtId, p.id);
                                          setConfirmDeletePayId(null);
                                        }}
                                        className="px-1.5 py-0.5 text-[10px] font-bold bg-red-600 text-white rounded"
                                      >
                                        Təsdiq
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => setConfirmDeletePayId(p.id)}
                                        title="Ödənişi sil (Admin)"
                                        className="p-1 text-zinc-400 hover:text-red-500"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    )
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    {debtor.hasUnpaid && activeUnpaid[0] ? (
                      <button
                        type="button"
                        onClick={() => openPayModal(activeUnpaid[0])}
                        style={{ backgroundColor: primaryColor }}
                        className="flex-1 py-2 px-3 hover:opacity-95 text-white font-bold text-xs rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5"
                      >
                        <DollarSign className="w-4 h-4" />
                        <span>Ödəniş Qəbul Et</span>
                      </button>
                    ) : (
                      <div className="flex-1 py-2 px-3 bg-emerald-50 dark:bg-zinc-950 text-emerald-700 dark:text-emerald-400 font-bold text-xs rounded-xl text-center flex items-center justify-center gap-1 border border-emerald-200 dark:border-zinc-800">
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>Borcu Yoxdur</span>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => toggleDebtExpanded(cardKey)}
                      className="py-2 px-2.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-semibold text-xs rounded-xl flex items-center gap-1"
                      title="Ödəniş tarixçəsi"
                    >
                      <History className="w-3.5 h-3.5" />
                      <span>{allPayments.length}</span>
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TAB 2: BÜTÜN BORC QEYDLƏRİ (Detailed Table with Expandable Payment History) */}
      {activeTab === 'records' && (
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[780px]">
              <thead className="bg-zinc-100 dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 font-bold uppercase tracking-wider text-[10px]">
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
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-zinc-500">
                      Seçilmiş filtr üzrə borc qeydi tapılmadı.
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map(d => {
                    const badge = getStatusBadge(d.status);
                    const isExpanded = expandedDebtMap[d.id] ?? false;
                    const paymentsCount = (d.payments || []).length;

                    return (
                      <React.Fragment key={d.id}>
                        <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                          <td className="py-3 px-4 font-mono text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                            {formatDateAZ(d.date)}
                          </td>
                          <td className="py-3 px-4 font-bold text-zinc-900 dark:text-white whitespace-nowrap">
                            {d.debtorName}
                          </td>
                          <td className="py-3 px-4 font-medium text-zinc-700 dark:text-zinc-300 max-w-xs">
                            {d.items.map(i => `${i.productName} (${i.quantity} əd.)`).join(', ')}
                            {d.notes && <div className="text-[10px] text-zinc-500 italic">{d.notes}</div>}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-zinc-900 dark:text-white">
                            {formatAZN(d.totalAmount)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                            {formatAZN(d.paidAmount)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-extrabold text-red-600 dark:text-red-500">
                            {formatAZN(d.remainingAmount)}
                          </td>
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badge.cls}`}>
                              {badge.label}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              {d.remainingAmount > 0 && d.status !== 'odanilib' && (
                                <button
                                  type="button"
                                  onClick={() => openPayModal(d)}
                                  style={{ backgroundColor: primaryColor }}
                                  className="px-3 py-1 hover:opacity-95 text-white font-bold text-[11px] rounded-lg transition-colors shadow-sm"
                                >
                                  Ödəniş qəbul et
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => toggleDebtExpanded(d.id)}
                                className="px-2 py-1 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 text-[11px] font-semibold rounded-lg inline-flex items-center gap-1"
                              >
                                <History className="w-3 h-3" />
                                <span>{paymentsCount}</span>
                              </button>
                            </div>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr className="bg-zinc-50/80 dark:bg-zinc-950/70">
                            <td colSpan={8} className="px-6 py-3">
                              <div className="space-y-2">
                                <div className="text-[11px] font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">
                                  Ödəniş Tarixçəsi ({paymentsCount})
                                </div>
                                {paymentsCount === 0 ? (
                                  <p className="text-xs text-zinc-500">Bu borc üzrə hələ ödəniş qeyd edilməyib.</p>
                                ) : (
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    {(d.payments || []).map(p => (
                                      <div
                                        key={p.id}
                                        className="p-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3"
                                      >
                                        <div className="space-y-0.5 min-w-0">
                                          <div className="flex flex-wrap items-center gap-1.5">
                                            <span className="px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-[10px] font-bold">
                                              Borc ödənişi (ödənildi)
                                            </span>
                                            <span className="font-mono text-[11px] text-zinc-500">
                                              {formatDateAZ(p.paidAt || p.date)}
                                            </span>
                                            <span className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-[10px] font-bold">
                                              {getMethodLabel(p.paymentMethod)}
                                            </span>
                                            <span className="text-[11px] text-zinc-500 font-mono">
                                              @{p.receivedBy || 'admin'}
                                            </span>
                                          </div>
                                          {p.note && (
                                            <div className="text-[11px] text-zinc-500 truncate">{p.note}</div>
                                          )}
                                        </div>

                                        <div className="flex items-center gap-2 shrink-0">
                                          <span className="font-mono font-extrabold text-emerald-600 dark:text-emerald-400">
                                            {formatAZN(p.amount)}
                                          </span>
                                          {isAdmin && (
                                            confirmDeletePayId === p.id ? (
                                              <div className="flex items-center gap-1">
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    void deleteDebtPayment(d.id, p.id);
                                                    setConfirmDeletePayId(null);
                                                  }}
                                                  className="px-2 py-0.5 text-[10px] font-bold bg-red-600 text-white rounded"
                                                >
                                                  Sil
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() => setConfirmDeletePayId(null)}
                                                  className="px-1.5 py-0.5 text-[10px] bg-zinc-200 dark:bg-zinc-700 rounded"
                                                >
                                                  Ləğv
                                                </button>
                                              </div>
                                            ) : (
                                              <button
                                                type="button"
                                                onClick={() => setConfirmDeletePayId(p.id)}
                                                className="p-1 text-zinc-400 hover:text-red-500 rounded"
                                                title="Ödənişi Sil (Yalnız Admin)"
                                              >
                                                <Trash2 className="w-3.5 h-3.5" />
                                              </button>
                                            )
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: New Debt */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col">
            <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                  Yeni Nisyə (Borc) Qeydiyyatı
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Məhsul götürən şəxsin adına borc yazılması
                </p>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1.5 text-zinc-400 hover:text-zinc-900 dark:hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateDebt} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-red-600 dark:text-red-400 uppercase tracking-wider mb-1">
                  Borclunun Adı və Soyadı *
                </label>
                <input
                  type="text"
                  required
                  value={debtorName}
                  onChange={e => handleDebtorNameTyping(e.target.value)}
                  placeholder="məs: Əli Həsənov"
                  className="w-full px-3.5 py-2 text-sm font-semibold rounded-xl border border-red-300 dark:border-red-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                  Götürdüyü Məhsul *
                </label>
                <select
                  value={selectedProductId}
                  onChange={e => handleProductChange(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
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
                  <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                    Say (ədəd) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={quantity}
                    onChange={e => handleQuantityChange(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm font-mono rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                    Cəmi Məbləğ (AZN) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={customAmount}
                    onChange={e => setCustomAmount(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm font-mono rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                    İlkin Ödənilən (AZN)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={initialPaid}
                    onChange={e => setInitialPaid(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm font-mono rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                    Tarix
                  </label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm font-mono rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                  Qeyd
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="məs: Sabah məşqə gələndə ödəyəcək"
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-white rounded-xl"
                >
                  Ləğv et
                </button>
                <button
                  type="submit"
                  style={{ backgroundColor: primaryColor }}
                  className="px-5 py-2 text-xs font-bold text-white rounded-xl shadow-sm"
                >
                  Borc Yaz
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Accept Debt Payment On-Site */}
      {isPayModalOpen && selectedDebt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col">
            <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                  Borc Ödənişinin Qəbulu
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Müştəri: <strong className="text-zinc-900 dark:text-white">{selectedDebt.debtorName}</strong>
                </p>
              </div>
              <button
                onClick={() => setIsPayModalOpen(false)}
                className="p-1.5 text-zinc-400 hover:text-zinc-900 dark:hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleExecutePayment} className="p-6 space-y-4">
              <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-zinc-500">
                    Cari Qalıq Borc
                  </span>
                  <div className="text-xl font-black font-mono text-red-600 dark:text-red-500">
                    {formatAZN(selectedDebt.remainingAmount)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPaymentAmount(selectedDebt.remainingAmount.toFixed(2))}
                  style={{ backgroundColor: primaryColor }}
                  className="px-3 py-1.5 text-xs font-bold text-white rounded-lg shadow-sm"
                >
                  Tam Ödə
                </button>
              </div>

              {paymentError && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{paymentError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                  Ödənilən Məbləğ (AZN) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={selectedDebt.remainingAmount}
                  required
                  value={paymentAmount}
                  onChange={e => {
                    setPaymentAmount(e.target.value);
                    setPaymentError(null);
                  }}
                  className="w-full px-3.5 py-2 text-base font-mono font-bold rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1.5">
                  Ödəniş Növü *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: 'naqd', label: 'Nağd', icon: <Banknote className="w-3.5 h-3.5" /> },
                      { id: 'kart', label: 'Kart', icon: <CreditCard className="w-3.5 h-3.5" /> },
                      { id: 'pos', label: 'POS / Köç.', icon: <Smartphone className="w-3.5 h-3.5" /> },
                    ] as { id: DebtPaymentMethod; label: string; icon: React.ReactNode }[]
                  ).map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setPaymentMethod(opt.id)}
                      className={`py-2 px-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                        paymentMethod === opt.id
                          ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                          : 'bg-zinc-50 dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800'
                      }`}
                    >
                      {opt.icon}
                      <span>{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                    Qəbul Edən Məsul
                  </label>
                  {isAdmin ? (
                    <select
                      value={paymentReceivedBy}
                      onChange={e => setPaymentReceivedBy(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white"
                    >
                      {users
                        .filter(u => u.isActive)
                        .map(u => (
                          <option key={u.id} value={u.username}>
                            {u.name} (@{u.username})
                          </option>
                        ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      readOnly
                      value={currentUser?.name || currentUser?.username || 'isci'}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400"
                    />
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                    Tarix
                  </label>
                  <div className="relative">
                    <Calendar className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                    <input
                      type="date"
                      required
                      value={paymentDate}
                      onChange={e => setPaymentDate(e.target.value)}
                      className="w-full pl-8 pr-2.5 py-2 text-xs font-mono rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                  Qeyd (İstəyə görə)
                </label>
                <input
                  type="text"
                  value={paymentNote}
                  onChange={e => setPaymentNote(e.target.value)}
                  placeholder="məs: Yerindəcə nağd ödədi"
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsPayModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-white rounded-xl"
                >
                  Ləğv et
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPayment}
                  className="px-5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl shadow-sm"
                >
                  {isSubmittingPayment ? 'Qeyd edilir...' : 'Ödənişi Təsdiqlə'}
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

      {/* Customer Deposit / Top-up Modal */}
      {isDepositModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col">
            <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-600 text-white flex items-center justify-center">
                  <Coins className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                    Müştəri Depozit Balansı
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Öncədən ödəniş balansı daxil etmə (məs: Əli 10 AZN)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDepositModalOpen(false)}
                className="p-1.5 text-zinc-400 hover:text-zinc-900 dark:hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleDepositSubmit} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block text-zinc-700 dark:text-zinc-300 font-bold mb-1">
                  Müştərinin Adı *
                </label>
                <input
                  type="text"
                  required
                  value={depositName}
                  onChange={e => setDepositName(e.target.value)}
                  placeholder="məs: Əli"
                  className="w-full px-3.5 py-2.5 text-sm font-semibold rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-zinc-700 dark:text-zinc-300 font-bold mb-1">
                  Depozit Məbləği (AZN) *
                </label>
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  required
                  value={depositAmount}
                  onChange={e => setDepositAmount(Number(e.target.value) || 0)}
                  className="w-full px-3.5 py-2.5 text-base font-mono font-bold rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <div className="flex gap-2 mt-2">
                  {[5, 10, 20, 50].map(amt => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setDepositAmount(amt)}
                      className={`flex-1 py-1 rounded-lg border text-[11px] font-bold transition-colors ${
                        depositAmount === amt
                          ? 'bg-amber-600 text-white border-amber-500'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700'
                      }`}
                    >
                      {amt} AZN
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-zinc-700 dark:text-zinc-300 font-bold mb-1">Ödəniş Üsulu</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['naqd', 'kart', 'pos'] as const).map(pt => (
                    <button
                      key={pt}
                      type="button"
                      onClick={() => setDepositPaymentType(pt)}
                      className={`py-2 rounded-xl border text-[11px] font-bold uppercase transition-all ${
                        depositPaymentType === pt
                          ? 'bg-amber-600 text-white border-amber-500 shadow-sm'
                          : 'bg-zinc-50 dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800'
                      }`}
                    >
                      {pt}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-zinc-700 dark:text-zinc-300 font-bold mb-1">
                  Qeyd (İstəyə görə)
                </label>
                <input
                  type="text"
                  value={depositNote}
                  onChange={e => setDepositNote(e.target.value)}
                  placeholder="məs: 10 günlük su haqqı"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white"
                />
              </div>

              <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsDepositModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-white rounded-xl"
                >
                  Ləğv et
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-xl shadow-sm"
                >
                  Balansı Daxil Et ({depositAmount} AZN)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
