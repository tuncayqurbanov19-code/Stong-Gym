import React, { useMemo, useState } from 'react';
import {
  BookOpen,
  Plus,
  Search,
  DollarSign,
  User,
  Phone,
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
  Archive,
  Clock,
  ArrowUpRight,
  Edit2,
  ShoppingBag,
  Minus,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { CustomerAccount, CustomerTransaction, DebtPaymentMethod, DebtRecord } from '../types';
import { formatAZN, formatDateAZ, getCurrentTimeHHMM, getTodayISODate } from '../utils/dateUtils';
import { checkCustomerDebt, calculateDebtOverview } from '../utils/financialCalculations';
import { calculateProductStock } from '../utils/stockCalculations';
import { DebtWarningModal } from '../components/DebtWarningModal';
import { exportDebtsToCSV } from '../utils/exportUtils';

interface DebtorGroup {
  debtorName: string;
  debtorPhone: string;
  totalDebt: number;
  totalPaid: number;
  remainingDebt: number;
  records: DebtRecord[];
  activeRecords: DebtRecord[];
  firstDate: string;
  lastDate: string;
  lastPaymentDate: string | null;
  status: 'borcdadir' | 'qismen' | 'odanilib';
  allPayments: Array<DebtRecord['payments'][number] & { debtId: string }>;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

export const DebtsView: React.FC = () => {
  const {
    debts,
    addDebt,
    acceptDebtPayment,
    deleteDebtPayment,
    products,
    purchases,
    sales,
    customerAccounts,
    openOrDepositCustomerBalance,
    withdrawCustomerCash,
    withdrawProductFromBalance,
    adjustCustomerBalance,
    deleteCustomerAccount,
    currentUser,
    users,
    settings,
    showToast,
  } = useApp();

  const isAdmin = currentUser?.role === 'admin';
  const todayISO = getTodayISODate();
  const primaryColor = settings.primaryColor || '#dc2626';

  const [activeTab, setActiveTab] = useState<'active_debtors' | 'settled_debtors' | 'records' | 'balances'>('active_debtors');
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

  // Modal 1: Open Customer Balance / Deposit Top-up
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [depositCustomerId, setDepositCustomerId] = useState<string>('');
  const [depositName, setDepositName] = useState('');
  const [depositPhone, setDepositPhone] = useState('');
  const [depositAmount, setDepositAmount] = useState<string>('10');
  const [depositPaymentType, setDepositPaymentType] = useState<'naqd' | 'kart' | 'pos'>('naqd');
  const [depositDate, setDepositDate] = useState(todayISO);
  const [depositTime, setDepositTime] = useState(getCurrentTimeHHMM());
  const [depositNote, setDepositNote] = useState('');
  const [depositError, setDepositError] = useState<string | null>(null);
  const [isSubmittingBalanceOp, setIsSubmittingBalanceOp] = useState(false);

  const openBalanceModal = (customer?: CustomerAccount) => {
    setDepositCustomerId(customer?.id || '');
    setDepositName(customer?.name || '');
    setDepositPhone(customer?.phone || '');
    setDepositAmount(customer ? '10' : '50');
    setDepositPaymentType('naqd');
    setDepositDate(todayISO);
    setDepositTime(getCurrentTimeHHMM());
    setDepositNote('');
    setDepositError(null);
    setIsDepositModalOpen(true);
  };

  const handleDepositSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingBalanceOp) return;
    setDepositError(null);

    const amt = round2(parseFloat(depositAmount) || 0);
    const name = depositName.trim();
    if (!depositCustomerId && !name) {
      setDepositError('Müştərinin adını daxil edin.');
      return;
    }
    if (depositCustomerId && amt <= 0) {
      setDepositError('Balans artırmaq üçün müsbət məbləğ daxil edin.');
      return;
    }
    if (!depositCustomerId && amt < 0) {
      setDepositError('İlkin balans mənfi ola bilməz.');
      return;
    }

    setIsSubmittingBalanceOp(true);
    try {
      const res = await openOrDepositCustomerBalance({
        customerId: depositCustomerId || undefined,
        customerName: name,
        phone: depositPhone.trim() || undefined,
        amount: amt,
        paymentMethod: depositPaymentType,
        date: depositDate || todayISO,
        time: depositTime || getCurrentTimeHHMM(),
        note: depositNote.trim() || undefined,
        idempotencyKey: `bal-dep-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      });
      if (!res.success) {
        setDepositError(res.error || 'Balans əməliyyatı icra olunmadı.');
        return;
      }
      showToast(
        'success',
        depositCustomerId
          ? `${name || 'Müştəri'} balansına +${formatAZN(amt)} əlavə edildi.`
          : `${name} üçün ${formatAZN(amt)} ilkin balans açıldı.`
      );
      setIsDepositModalOpen(false);
    } finally {
      setIsSubmittingBalanceOp(false);
    }
  };

  // Modal 2: Product Withdrawal from Balance («Məhsul çıxar»)
  const [isProductOutModalOpen, setIsProductOutModalOpen] = useState(false);
  const [prodOutCustomerId, setProdOutCustomerId] = useState('');
  const [prodOutProductId, setProdOutProductId] = useState('');
  const [prodOutQty, setProdOutQty] = useState('1');
  const [prodOutDate, setProdOutDate] = useState(todayISO);
  const [prodOutTime, setProdOutTime] = useState(getCurrentTimeHHMM());
  const [prodOutNote, setProdOutNote] = useState('');
  const [prodOutError, setProdOutError] = useState<string | null>(null);

  const openProductOutModal = (customer?: CustomerAccount) => {
    const defaultCust = customer || customerAccounts[0];
    setProdOutCustomerId(defaultCust?.id || '');
    const firstInStock =
      products.find(p => calculateProductStock(p, purchases, sales, settings.minStockThreshold).activeStock > 0) ||
      products[0];
    setProdOutProductId(firstInStock?.id || '');
    setProdOutQty('1');
    setProdOutDate(todayISO);
    setProdOutTime(getCurrentTimeHHMM());
    setProdOutNote('');
    setProdOutError(null);
    setIsProductOutModalOpen(true);
  };

  const handleProductOutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingBalanceOp) return;
    setProdOutError(null);

    if (!prodOutCustomerId) {
      setProdOutError('Zəhmət olmasa müştəri seçin.');
      return;
    }
    if (!prodOutProductId) {
      setProdOutError('Zəhmət olmasa depodan məhsul seçin.');
      return;
    }
    const qty = Math.floor(Number(prodOutQty) || 0);
    if (qty <= 0) {
      setProdOutError('Miqdar ən azı 1 ədəd olmalıdır.');
      return;
    }

    setIsSubmittingBalanceOp(true);
    try {
      const res = await withdrawProductFromBalance({
        customerId: prodOutCustomerId,
        productId: prodOutProductId,
        quantity: qty,
        date: prodOutDate || todayISO,
        time: prodOutTime || getCurrentTimeHHMM(),
        note: prodOutNote.trim() || undefined,
        idempotencyKey: `bal-prod-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      });
      if (!res.success) {
        setProdOutError(res.error || 'Məhsul çıxarışı icra olunmadı.');
        return;
      }
      const cust = customerAccounts.find(c => c.id === prodOutCustomerId);
      const prod = products.find(p => p.id === prodOutProductId);
      showToast(
        'success',
        `${cust?.name || 'Müştəri'} balansından ${qty} əd. "${prod?.name || 'Məhsul'}" çıxarıldı.`
      );
      setIsProductOutModalOpen(false);
    } finally {
      setIsSubmittingBalanceOp(false);
    }
  };

  // Modal 3: Free Cash Withdrawal from Balance («Pul çıxar»)
  const [isCashOutModalOpen, setIsCashOutModalOpen] = useState(false);
  const [cashOutCustomerId, setCashOutCustomerId] = useState('');
  const [cashOutAmount, setCashOutAmount] = useState('10');
  const [cashOutMethod, setCashOutMethod] = useState<'naqd' | 'kart' | 'pos'>('naqd');
  const [cashOutDate, setCashOutDate] = useState(todayISO);
  const [cashOutTime, setCashOutTime] = useState(getCurrentTimeHHMM());
  const [cashOutNote, setCashOutNote] = useState('');
  const [cashOutError, setCashOutError] = useState<string | null>(null);

  const openCashOutModal = (customer?: CustomerAccount) => {
    const defaultCust = customer || customerAccounts.find(c => c.balance > 0) || customerAccounts[0];
    setCashOutCustomerId(defaultCust?.id || '');
    setCashOutAmount(defaultCust && defaultCust.balance < 10 ? String(defaultCust.balance || 0) : '10');
    setCashOutMethod('naqd');
    setCashOutDate(todayISO);
    setCashOutTime(getCurrentTimeHHMM());
    setCashOutNote('');
    setCashOutError(null);
    setIsCashOutModalOpen(true);
  };

  const handleCashOutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingBalanceOp) return;
    setCashOutError(null);

    if (!cashOutCustomerId) {
      setCashOutError('Zəhmət olmasa müştəri seçin.');
      return;
    }
    const amt = round2(parseFloat(cashOutAmount) || 0);
    if (amt <= 0) {
      setCashOutError('Çıxarılan pul məbləği 0-dan böyük olmalıdır.');
      return;
    }

    setIsSubmittingBalanceOp(true);
    try {
      const res = await withdrawCustomerCash({
        customerId: cashOutCustomerId,
        amount: amt,
        paymentMethod: cashOutMethod,
        date: cashOutDate || todayISO,
        time: cashOutTime || getCurrentTimeHHMM(),
        note: cashOutNote.trim() || undefined,
        idempotencyKey: `bal-cash-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      });
      if (!res.success) {
        setCashOutError(res.error || 'Pul çıxarışı icra olunmadı.');
        return;
      }
      const cust = customerAccounts.find(c => c.id === cashOutCustomerId);
      showToast('success', `${cust?.name || 'Müştəri'} balansından ${formatAZN(amt)} sərbəst pul çıxarıldı.`);
      setIsCashOutModalOpen(false);
    } finally {
      setIsSubmittingBalanceOp(false);
    }
  };

  // Modal 4: Edit Customer / Admin Balance Adjustment
  const [isEditCustomerModalOpen, setIsEditCustomerModalOpen] = useState(false);
  const [editCustTarget, setEditCustTarget] = useState<CustomerAccount | null>(null);
  const [editCustName, setEditCustName] = useState('');
  const [editCustPhone, setEditCustPhone] = useState('');
  const [editCustNotes, setEditCustNotes] = useState('');
  const [editCustAdjustEnabled, setEditCustAdjustEnabled] = useState(false);
  const [editCustTargetBalance, setEditCustTargetBalance] = useState('0');
  const [editCustReason, setEditCustReason] = useState('');
  const [editCustError, setEditCustError] = useState<string | null>(null);

  const openEditCustomerModal = (customer: CustomerAccount) => {
    setEditCustTarget(customer);
    setEditCustName(customer.name);
    setEditCustPhone(customer.phone || '');
    setEditCustNotes(customer.notes || '');
    setEditCustAdjustEnabled(false);
    setEditCustTargetBalance(String(customer.balance));
    setEditCustReason('');
    setEditCustError(null);
    setIsEditCustomerModalOpen(true);
  };

  const handleEditCustomerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editCustTarget || isSubmittingBalanceOp) return;
    setEditCustError(null);

    if (!editCustName.trim()) {
      setEditCustError('Müştəri adı boş ola bilməz.');
      return;
    }

    const nextBal = editCustAdjustEnabled ? round2(parseFloat(editCustTargetBalance) || 0) : undefined;
    if (editCustAdjustEnabled && (nextBal === undefined || nextBal < 0)) {
      setEditCustError('Balans mənfi ola bilməz.');
      return;
    }
    if (editCustAdjustEnabled && Math.abs((nextBal ?? 0) - editCustTarget.balance) > 0.009 && !editCustReason.trim()) {
      setEditCustError('Balansı dəyişərkən düzəliş səbəbi yazılmalıdır.');
      return;
    }

    setIsSubmittingBalanceOp(true);
    try {
      const res = await adjustCustomerBalance({
        customerId: editCustTarget.id,
        name: editCustName.trim(),
        phone: editCustPhone.trim(),
        notes: editCustNotes.trim(),
        newBalance: editCustAdjustEnabled ? nextBal : undefined,
        reason: editCustReason.trim() || undefined,
      });
      if (!res.success) {
        setEditCustError(res.error || 'Yeniləmə zamanı xəta baş verdi.');
        return;
      }
      showToast('success', `"${editCustName.trim()}" balans məlumatları yeniləndi.`);
      setIsEditCustomerModalOpen(false);
    } finally {
      setIsSubmittingBalanceOp(false);
    }
  };

  // Modal: Add Debt Record
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [debtEntryMode, setDebtEntryMode] = useState<'product' | 'manual'>('product');
  const [debtorName, setDebtorName] = useState('');
  const [debtorPhone, setDebtorPhone] = useState('');
  const [selectedProductId, setSelectedProductId] = useState(products[0]?.id || '');
  const [manualItemName, setManualItemName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [customAmount, setCustomAmount] = useState('');
  const [initialPaid, setInitialPaid] = useState('0');
  const [date, setDate] = useState(todayISO);
  const [notes, setNotes] = useState('');
  const [addDebtError, setAddDebtError] = useState<string | null>(null);

  // Modal: Payment Collection
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [selectedDebt, setSelectedDebt] = useState<DebtRecord | null>(null);
  const [debtorUnpaidOptions, setDebtorUnpaidOptions] = useState<DebtRecord[]>([]);
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

  // Stock map for product debt modal
  const stockById = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of products) {
      map[p.id] = calculateProductStock(p, purchases, sales, settings.minStockThreshold).activeStock;
    }
    return map;
  }, [products, purchases, sales, settings.minStockThreshold]);

  // Calculate Debt Overview + Today Collected Debt Payments
  const overview = useMemo(() => calculateDebtOverview(debts), [debts]);

  const todayCollectedSummary = useMemo(() => {
    const todayPayments = debts
      .flatMap(d => d.payments || [])
      .filter(p => (p.paidAt || p.date || '').split('T')[0] === todayISO);
    const total = todayPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    return {
      total: round2(total),
      count: todayPayments.length,
    };
  }, [debts, todayISO]);

  // Group debts by normalized Debtor Name cleanly
  const allDebtors = useMemo<DebtorGroup[]>(() => {
    const debtorsMap: Record<string, DebtorGroup> = {};

    for (const d of debts) {
      const key = d.debtorName.trim().toLowerCase();
      if (!debtorsMap[key]) {
        debtorsMap[key] = {
          debtorName: d.debtorName.trim(),
          debtorPhone: d.debtorPhone?.trim() || '',
          totalDebt: 0,
          totalPaid: 0,
          remainingDebt: 0,
          records: [],
          activeRecords: [],
          firstDate: d.date,
          lastDate: d.date,
          lastPaymentDate: null,
          status: 'borcdadir',
          allPayments: [],
        };
      }

      const grp = debtorsMap[key];
      if (!grp.debtorPhone && d.debtorPhone?.trim()) {
        grp.debtorPhone = d.debtorPhone.trim();
      }

      grp.totalDebt = round2(grp.totalDebt + (Number(d.totalAmount) || 0));
      grp.totalPaid = round2(grp.totalPaid + (Number(d.paidAmount) || 0));
      grp.remainingDebt = round2(grp.remainingDebt + Math.max(0, Number(d.remainingAmount) || 0));
      grp.records.push(d);

      if ((Number(d.remainingAmount) || 0) > 0.009 && d.status !== 'odanilib') {
        grp.activeRecords.push(d);
      }
      if (d.date < grp.firstDate) grp.firstDate = d.date;
      if (d.date > grp.lastDate) grp.lastDate = d.date;

      for (const p of d.payments || []) {
        grp.allPayments.push({ ...p, debtId: d.id });
        const pDate = (p.paidAt || p.date || '').split('T')[0];
        if (pDate && (!grp.lastPaymentDate || pDate > grp.lastPaymentDate)) {
          grp.lastPaymentDate = pDate;
        }
      }
    }

    return Object.values(debtorsMap)
      .map(grp => {
        grp.records.sort((a, b) => b.date.localeCompare(a.date));
        grp.activeRecords.sort((a, b) => a.date.localeCompare(b.date)); // Oldest unpaid first
        grp.allPayments.sort((a, b) => (b.paidAt || b.date).localeCompare(a.paidAt || a.date));
        grp.status =
          grp.remainingDebt <= 0.009
            ? 'odanilib'
            : grp.totalPaid > 0.009
            ? 'qismen'
            : 'borcdadir';
        return grp;
      })
      .sort((a, b) => b.remainingDebt - a.remainingDebt || b.lastDate.localeCompare(a.lastDate));
  }, [debts]);

  // STRICT SPLIT: Active Debtors vs Settled Archive
  const activeDebtors = useMemo(
    () => allDebtors.filter(d => d.remainingDebt > 0.009),
    [allDebtors]
  );

  const settledDebtors = useMemo(
    () => allDebtors.filter(d => d.remainingDebt <= 0.009),
    [allDebtors]
  );

  const filterDebtorGroups = (list: DebtorGroup[]) => {
    const q = searchQuery.trim().toLowerCase();
    return list.filter(d => {
      const matchesSearch =
        !q ||
        d.debtorName.toLowerCase().includes(q) ||
        (d.debtorPhone && d.debtorPhone.toLowerCase().includes(q));
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'borcdadir' && d.status === 'borcdadir') ||
        (statusFilter === 'qismen' && d.status === 'qismen') ||
        (statusFilter === 'odanilib' && d.status === 'odanilib');
      const matchesDate =
        !dateFilter ||
        d.records.some(
          r =>
            r.date === dateFilter ||
            (r.payments || []).some(p => (p.paidAt || p.date || '').split('T')[0] === dateFilter)
        );
      return matchesSearch && matchesStatus && matchesDate;
    });
  };

  const filteredActiveDebtors = useMemo(
    () => filterDebtorGroups(activeDebtors),
    [activeDebtors, searchQuery, statusFilter, dateFilter]
  );

  const filteredSettledDebtors = useMemo(
    () => filterDebtorGroups(settledDebtors),
    [settledDebtors, searchQuery, statusFilter, dateFilter]
  );

  const filteredRecords = useMemo(
    () => {
      const q = searchQuery.trim().toLowerCase();
      return debts
        .filter(d => {
          const matchesSearch =
            !q ||
            d.debtorName.toLowerCase().includes(q) ||
            (d.debtorPhone && d.debtorPhone.toLowerCase().includes(q)) ||
            (d.notes && d.notes.toLowerCase().includes(q)) ||
            d.items.some(i => i.productName.toLowerCase().includes(q));
          const matchesStatus = statusFilter === 'all' || d.status === statusFilter;
          const matchesDate =
            !dateFilter ||
            d.date === dateFilter ||
            (d.payments || []).some(p => (p.paidAt || p.date || '').split('T')[0] === dateFilter);
          return matchesSearch && matchesStatus && matchesDate;
        })
        .sort((a, b) => b.date.localeCompare(a.date));
    },
    [debts, searchQuery, statusFilter, dateFilter]
  );

  const handleDebtorNameTyping = (nameVal: string) => {
    setDebtorName(nameVal);
    if (nameVal.trim().length >= 2) {
      const check = checkCustomerDebt(nameVal, debts);
      const matched = allDebtors.find(
        d => d.debtorName.toLowerCase() === nameVal.trim().toLowerCase()
      );
      if (matched?.debtorPhone && !debtorPhone.trim()) {
        setDebtorPhone(matched.debtorPhone);
      }
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
    if (debtEntryMode === 'product') {
      const prod = products.find(p => p.id === selectedProductId);
      if (prod) {
        const q = parseInt(qVal, 10) || 1;
        setCustomAmount((prod.salePrice * q).toFixed(2));
      }
    }
  };

  const handleCreateDebt = (e: React.FormEvent) => {
    e.preventDefault();
    setAddDebtError(null);

    if (!debtorName.trim()) {
      setAddDebtError('Borclunun adı və soyadı mütləqdir.');
      return;
    }

    const qty = Math.max(1, parseInt(quantity, 10) || 1);
    const prod = debtEntryMode === 'product' ? products.find(p => p.id === selectedProductId) : undefined;
    const total = round2(parseFloat(customAmount) || (prod ? prod.salePrice * qty : 0));
    const paid = round2(parseFloat(initialPaid) || 0);

    if (total <= 0) {
      setAddDebtError('Məbləğ sıfırdan böyük olmalıdır.');
      return;
    }

    if (paid > total) {
      setAddDebtError('İlkin ödəniş ümumi borcdan çox ola bilməz.');
      return;
    }

    const res = addDebt({
      debtorName: debtorName.trim(),
      debtorPhone: debtorPhone.trim() || undefined,
      productId: prod?.id,
      quantity: prod ? qty : undefined,
      items: prod
        ? [{ productName: prod.name, quantity: qty, unitPrice: prod.salePrice }]
        : [
            {
              productName: manualItemName.trim() || 'Sərbəst nisyə / Xidmət',
              quantity: qty,
              unitPrice: round2(total / qty),
            },
          ],
      totalAmount: total,
      paidAmount: paid,
      date,
      notes: notes.trim() || undefined,
    });

    if (!res.success) {
      setAddDebtError(res.error || 'Borc qeydi əlavə edilmədi.');
      return;
    }

    setIsAddModalOpen(false);
    setDebtorName('');
    setDebtorPhone('');
    setManualItemName('');
    setNotes('');
    setAddDebtError(null);
  };

  const openPayModal = (debt: DebtRecord, options: DebtRecord[] = []) => {
    setSelectedDebt(debt);
    setDebtorUnpaidOptions(options.length > 0 ? options : [debt]);
    setPaymentAmount(debt.remainingAmount.toFixed(2));
    setPaymentMethod('naqd');
    setPaymentReceivedBy(currentUser?.username || 'isci');
    setPaymentDate(todayISO);
    setPaymentNote('Yerindəcə borc ödənişi');
    setPaymentError(null);
    setIsPayModalOpen(true);
  };

  const handleSelectDebtInModal = (debtId: string) => {
    const next = debtorUnpaidOptions.find(d => d.id === debtId);
    if (!next) return;
    setSelectedDebt(next);
    setPaymentAmount(next.remainingAmount.toFixed(2));
    setPaymentError(null);
  };

  const handleExecutePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDebt) return;
    setPaymentError(null);

    const amt = round2(parseFloat(paymentAmount) || 0);
    if (amt <= 0) {
      setPaymentError('Ödəniş məbləği sıfırdan böyük olmalıdır.');
      return;
    }
    if (amt > round2(selectedDebt.remainingAmount) + 0.001) {
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
        label: 'Tam ödənilib',
        cls: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800',
      };
    }
    if (status === 'qismen') {
      return {
        label: 'Qismən ödənilib',
        cls: 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800',
      };
    }
    return {
      label: 'Aktiv',
      cls: 'bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800',
    };
  };

  const getMethodLabel = (method?: string) => {
    const m = (method || 'naqd').toLowerCase();
    if (m === 'kart') return 'Kart';
    if (m === 'pos' || m === 'kocurme') return 'POS / Köçürmə';
    return 'Nağd';
  };

  // Customer Balances metrics
  const totalCustomerBalance = round2(customerAccounts.reduce((sum, c) => sum + c.balance, 0));
  const totalCustomerDeposited = round2(customerAccounts.reduce((sum, c) => sum + c.totalDeposited, 0));
  const totalCustomerSpent = round2(customerAccounts.reduce((sum, c) => sum + c.totalSpent, 0));
  const totalCustomerWithdrawn = round2(
    customerAccounts.reduce((sum, c) => sum + (c.totalWithdrawn || 0), 0)
  );

  const filteredCustomerAccounts = customerAccounts.filter(c => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      (c.phone && c.phone.toLowerCase().includes(q)) ||
      (c.notes && c.notes.toLowerCase().includes(q))
    );
  });

  const getBalanceTxBadge = (tx: CustomerTransaction) => {
    switch (tx.type) {
      case 'open':
        return {
          label: 'Balans açıldı',
          cls: 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800',
          sign: '+',
          amountCls: 'text-emerald-600 dark:text-emerald-400',
        };
      case 'deposit':
        return {
          label: 'Balans artırıldı',
          cls: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800',
          sign: '+',
          amountCls: 'text-emerald-600 dark:text-emerald-400',
        };
      case 'product_out':
      case 'charge':
        return {
          label: 'Məhsul çıxarıldı',
          cls: 'bg-cyan-50 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800',
          sign: '−',
          amountCls: 'text-red-600 dark:text-red-400',
        };
      case 'withdraw':
        return {
          label: 'Sərbəst pul çıxarıldı',
          cls: 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800',
          sign: '−',
          amountCls: 'text-rose-600 dark:text-rose-400',
        };
      case 'adjustment':
        return {
          label: 'Düzəliş',
          cls: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-700',
          sign: tx.adjustmentDirection === 'increase' ? '+' : '−',
          amountCls: tx.adjustmentDirection === 'increase' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400',
        };
    }
  };

  const renderDebtorCard = (debtor: DebtorGroup, isArchiveCard: boolean) => {
    const cardKey = `debtor-${debtor.debtorName.toLowerCase()}`;
    const isExpanded = expandedDebtMap[cardKey] ?? false;
    const statusBadge = getStatusBadge(debtor.status);

    return (
      <div
        key={debtor.debtorName}
        className={`p-5 rounded-2xl bg-white dark:bg-zinc-900 border flex flex-col justify-between space-y-4 transition-colors ${
          isArchiveCard
            ? 'border-zinc-200 dark:border-zinc-800'
            : 'border-red-200/90 dark:border-red-900/60'
        }`}
      >
        <div className="space-y-3">
          {/* Header: Name, Phone, Status */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2.5 min-w-0">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                  isArchiveCard
                    ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                    : 'bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800'
                }`}
              >
                {debtor.debtorName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <h4 className="text-sm font-bold text-zinc-900 dark:text-white truncate">
                  {debtor.debtorName}
                </h4>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                  {debtor.debtorPhone ? (
                    <span className="inline-flex items-center gap-1 font-mono text-zinc-700 dark:text-zinc-300">
                      <Phone className="w-3 h-3" />
                      {debtor.debtorPhone}
                    </span>
                  ) : (
                    <span>Telefon qeyd olunmayıb</span>
                  )}
                  <span>·</span>
                  <span>{debtor.records.length} qeyd</span>
                </div>
              </div>
            </div>

            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md shrink-0 ${statusBadge.cls}`}>
              {statusBadge.label}
            </span>
          </div>

          {/* 3-Column Financial Strip */}
          <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 grid grid-cols-3 gap-2 text-xs">
            <div>
              <span className="text-[10px] text-zinc-500 block uppercase font-semibold">Ümumi Borc</span>
              <span className="font-mono tabular-nums font-bold text-zinc-900 dark:text-zinc-100">
                {formatAZN(debtor.totalDebt)}
              </span>
            </div>
            <div className="text-center">
              <span className="text-[10px] text-zinc-500 block uppercase font-semibold">Ödənilən</span>
              <span className="font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400">
                {formatAZN(debtor.totalPaid)}
              </span>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-zinc-500 block uppercase font-semibold">Qalıq</span>
              <span
                className={`font-mono tabular-nums font-extrabold ${
                  debtor.remainingDebt > 0.009
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {formatAZN(debtor.remainingDebt)}
              </span>
            </div>
          </div>

          {/* Dates Meta */}
          <div className="grid grid-cols-2 gap-2 text-[11px] text-zinc-500 dark:text-zinc-400 px-0.5">
            <div className="flex items-center gap-1">
              <Calendar className="w-3 h-3 shrink-0" />
              <span className="truncate">
                Yaranma: <strong className="font-mono tabular-nums text-zinc-700 dark:text-zinc-300">{formatDateAZ(debtor.firstDate)}</strong>
              </span>
            </div>
            <div className="flex items-center justify-end gap-1">
              <Clock className="w-3 h-3 shrink-0" />
              <span className="truncate">
                Son ödəniş:{' '}
                <strong className="font-mono tabular-nums text-zinc-700 dark:text-zinc-300">
                  {debtor.lastPaymentDate ? formatDateAZ(debtor.lastPaymentDate) : '—'}
                </strong>
              </span>
            </div>
          </div>

          {/* Records preview */}
          <div className="space-y-1 text-xs">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">
              Götürdüyü Məhsullar ({debtor.records.length}):
            </span>
            {debtor.records.slice(0, isExpanded ? debtor.records.length : 2).map(r => (
              <div key={r.id} className="flex items-center justify-between text-[11px] text-zinc-600 dark:text-zinc-400 gap-2 py-0.5">
                <span className="truncate">
                  <span className="font-mono text-zinc-400 mr-1">{formatDateAZ(r.date)}</span>
                  {r.items.map(i => `${i.productName} ×${i.quantity}`).join(', ')}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="font-mono tabular-nums font-semibold text-zinc-900 dark:text-zinc-200">
                    {r.remainingAmount > 0 ? `${formatAZN(r.remainingAmount)} qalıb` : `Ödənildi (${formatAZN(r.totalAmount)})`}
                  </span>
                  {!isArchiveCard && r.remainingAmount > 0.009 && debtor.activeRecords.length > 1 && (
                    <button
                      type="button"
                      onClick={() => openPayModal(r, debtor.activeRecords)}
                      className="px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 font-bold text-[10px] border border-emerald-200 dark:border-emerald-800 whitespace-nowrap"
                    >
                      Ödə
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Expandable Payment History */}
          {isExpanded && (
            <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 flex justify-between">
                <span>Ödəniş Tarixçəsi</span>
                <span>{debtor.allPayments.length} əd.</span>
              </div>
              {debtor.allPayments.length === 0 ? (
                <p className="text-[11px] text-zinc-500">Hələ ödəniş qəbul edilməyib.</p>
              ) : (
                <div className="divide-y divide-zinc-200 dark:divide-zinc-800 max-h-44 overflow-y-auto pr-1">
                  {debtor.allPayments.map(p => (
                    <div key={p.id} className="py-1.5 flex items-center justify-between gap-2 text-[11px]">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono tabular-nums text-zinc-500">
                            {formatDateAZ(p.paidAt || p.date)}
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-bold text-[10px]">
                            {getMethodLabel(p.paymentMethod)}
                          </span>
                          <span className="text-zinc-500 truncate">
                            @{p.receivedBy || 'admin'}
                          </span>
                        </div>
                        {p.note && <div className="text-[10px] text-zinc-500 truncate">{p.note}</div>}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400">
                          {formatAZN(p.amount)}
                        </span>
                        {isAdmin && (
                          confirmDeletePayId === p.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  void deleteDebtPayment(p.debtId, p.id);
                                  setConfirmDeletePayId(null);
                                }}
                                className="px-1.5 py-0.5 text-[10px] font-bold bg-red-600 text-white rounded"
                              >
                                Sil
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeletePayId(null)}
                                className="px-1.5 py-0.5 text-[10px] bg-zinc-200 dark:bg-zinc-700 rounded"
                              >
                                X
                              </button>
                            </div>
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

        {/* Bottom Actions */}
        <div className="flex items-center gap-2 pt-1">
          {!isArchiveCard && debtor.activeRecords[0] ? (
            <button
              type="button"
              onClick={() => openPayModal(debtor.activeRecords[0], debtor.activeRecords)}
              style={{ backgroundColor: primaryColor }}
              className="flex-1 py-2 px-3 hover:opacity-95 text-white font-bold text-xs rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5 whitespace-nowrap"
            >
              <DollarSign className="w-4 h-4" />
              <span>Ödəniş Qəbul Et</span>
            </button>
          ) : (
            <div className="flex-1 py-2 px-3 bg-emerald-50 dark:bg-zinc-950 text-emerald-700 dark:text-emerald-400 font-bold text-xs rounded-xl text-center flex items-center justify-center gap-1 border border-emerald-200 dark:border-zinc-800 whitespace-nowrap">
              <CheckCircle className="w-3.5 h-3.5" />
              <span>Tam Ödənilib (Arxiv)</span>
            </div>
          )}

          <button
            type="button"
            onClick={() => toggleDebtExpanded(cardKey)}
            className="py-2 px-2.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-semibold text-xs rounded-xl flex items-center gap-1 shrink-0"
            title="Tarixçəni aç"
          >
            <History className="w-3.5 h-3.5" />
            <span>{debtor.allPayments.length}</span>
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 pb-12 max-w-7xl mx-auto">
      {/* Header and Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-zinc-200 dark:border-zinc-800">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-white tracking-tight flex flex-wrap items-center gap-2">
            <span>Borc İdarəetməsi və Nisyə</span>
            <span className="text-xs font-mono tabular-nums text-red-600 dark:text-red-400 font-bold px-2 py-0.5 rounded-md bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900/60">
              {activeDebtors.length} aktiv borclu
            </span>
          </h2>
          <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
            Aktiv borclar, qismən/tam ödənişlər, arxiv tarixçəsi və müştəri balans hesabları
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => exportDebtsToCSV(debts)}
            className="px-3 py-1.5 text-xs font-semibold bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Excel / CSV</span>
          </button>

          <button
            type="button"
            onClick={() => openBalanceModal()}
            className="px-3.5 py-1.5 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-xl transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Wallet className="w-4 h-4" />
            <span>+ Balans Aç</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const first = products[0];
              if (first) {
                setSelectedProductId(first.id);
                setQuantity('1');
                setCustomAmount(first.salePrice.toFixed(2));
              }
              setDebtEntryMode(products.length > 0 ? 'product' : 'manual');
              setDebtorName('');
              setDebtorPhone('');
              setManualItemName('');
              setInitialPaid('0');
              setDate(todayISO);
              setNotes('');
              setAddDebtError(null);
              setIsAddModalOpen(true);
            }}
            style={{ backgroundColor: primaryColor }}
            className="px-4 py-1.5 text-xs font-bold hover:opacity-95 text-white rounded-xl transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Yeni Borc Yaz</span>
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      {activeTab === 'balances' ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-amber-200 dark:border-amber-900/60 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                  Ümumi Aktiv Balans
                </span>
                <div className="text-2xl font-black text-amber-600 dark:text-amber-400 font-mono tabular-nums mt-1">
                  {formatAZN(totalCustomerBalance)}
                </div>
                <p className="text-xs text-zinc-500 mt-0.5">Müştərilərin hesabında qalan vəsait</p>
              </div>
              <div className="w-11 h-11 rounded-xl bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-200 dark:border-amber-900/60">
                <Wallet className="w-5 h-5" />
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                  Balans Hesabları
                </span>
                <div className="text-2xl font-black text-zinc-900 dark:text-white font-mono tabular-nums mt-1">
                  {customerAccounts.length} nəfər
                </div>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Qoyulan cəm: <strong className="font-mono">{formatAZN(totalCustomerDeposited)}</strong>
                </p>
              </div>
              <div className="w-11 h-11 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 flex items-center justify-center">
                <User className="w-5 h-5" />
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                  Məhsul & Pul Çıxarışları
                </span>
                <div className="text-2xl font-black text-cyan-600 dark:text-cyan-400 font-mono tabular-nums mt-1">
                  {formatAZN(totalCustomerSpent)}
                </div>
                <p className="text-xs text-zinc-500 mt-0.5 font-mono tabular-nums">
                  Sərbəst pul çıxışı: <strong className="text-rose-600 dark:text-rose-400">{formatAZN(totalCustomerWithdrawn)}</strong>
                </p>
              </div>
              <div className="w-11 h-11 rounded-xl bg-cyan-50 dark:bg-cyan-950/60 text-cyan-600 dark:text-cyan-400 flex items-center justify-center border border-cyan-200 dark:border-cyan-900/60">
                <Coins className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* Dedicated Balance Action Toolbar */}
          <div className="p-3.5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-zinc-600 dark:text-zinc-400">
              <strong className="text-zinc-900 dark:text-white">Balans Əməliyyatları:</strong> Balans aç/artır, depodan məhsul çıxar və ya sərbəst pul çıxarışı icra et.
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => openBalanceModal()}
                className="px-3.5 py-2 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-xl transition-all flex items-center gap-1.5 whitespace-nowrap shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Balans Aç / Artır</span>
              </button>
              <button
                type="button"
                onClick={() => openProductOutModal()}
                disabled={customerAccounts.length === 0 || products.length === 0}
                className="px-3.5 py-2 text-xs font-bold bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white rounded-xl transition-all flex items-center gap-1.5 whitespace-nowrap shadow-xs"
              >
                <ShoppingBag className="w-3.5 h-3.5" />
                <span>Məhsul Çıxar</span>
              </button>
              <button
                type="button"
                onClick={() => openCashOutModal()}
                disabled={customerAccounts.length === 0}
                className="px-3.5 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl transition-all flex items-center gap-1.5 whitespace-nowrap shadow-xs"
              >
                <ArrowUpRight className="w-3.5 h-3.5" />
                <span>Pul Çıxar</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                Aktiv Qalıq Borclar
              </span>
              <div className="text-2xl font-black text-red-600 dark:text-red-500 font-mono tabular-nums mt-1">
                {formatAZN(overview.totalRemainingDebt)}
              </div>
              <p className="text-xs text-zinc-500 mt-0.5">
                {activeDebtors.length} aktiv borclu · {overview.partialCount} qismən
              </p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 flex items-center justify-center border border-red-200 dark:border-red-900/60">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-emerald-200 dark:border-emerald-900/60 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                Bu Gün Qəbul Edilən Ödənişlər
              </span>
              <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono tabular-nums mt-1">
                {formatAZN(todayCollectedSummary.total)}
              </div>
              <p className="text-xs text-zinc-500 mt-0.5">
                {todayCollectedSummary.count} borc ödənişi (kassaya əlavə)
              </p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-200 dark:border-emerald-900/60">
              <CheckCircle className="w-5 h-5" />
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                Ümumi Ödənilmiş Borc
              </span>
              <div className="text-2xl font-black text-zinc-900 dark:text-white font-mono tabular-nums mt-1">
                {formatAZN(overview.totalPaidDebt)}
              </div>
              <p className="text-xs text-zinc-500 mt-0.5">
                {settledDebtors.length} tam bağlanan müştəri
              </p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 flex items-center justify-center">
              <BookOpen className="w-5 h-5" />
            </div>
          </div>
        </div>
      )}

      {/* Tabs & Search Strip */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center p-1 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('active_debtors')}
            style={activeTab === 'active_debtors' ? { backgroundColor: primaryColor } : undefined}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${
              activeTab === 'active_debtors'
                ? 'text-white shadow-sm'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            Aktiv Borclular ({activeDebtors.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('settled_debtors')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'settled_debtors'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            <Archive className="w-3.5 h-3.5" />
            <span>Tam Ödənilib · Arxiv ({settledDebtors.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('records')}
            style={activeTab === 'records' ? { backgroundColor: primaryColor } : undefined}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${
              activeTab === 'records'
                ? 'text-white shadow-sm'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            Bütün Qeydlər ({debts.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('balances')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'balances'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            <Wallet className="w-3.5 h-3.5" />
            <span>Balanslar ({customerAccounts.length})</span>
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
              placeholder="Ad və ya telefonla axtar..."
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>

          {activeTab === 'records' && (
            <select
              value={statusFilter}
              onChange={e =>
                setStatusFilter(e.target.value as 'all' | 'borcdadir' | 'qismen' | 'odanilib')
              }
              aria-label="Status filtri"
              className="px-2.5 py-1.5 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              <option value="all">Bütün Statuslar</option>
              <option value="borcdadir">Aktiv</option>
              <option value="qismen">Qismən Ödənilib</option>
              <option value="odanilib">Tam Ödənilib</option>
            </select>
          )}

          {activeTab !== 'balances' && (
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
          )}
        </div>
      </div>

      {/* TAB: AKTİV BORCLULAR */}
      {activeTab === 'active_debtors' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredActiveDebtors.length === 0 ? (
            <div className="col-span-full py-16 text-center bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 text-zinc-500 text-xs space-y-2">
              <CheckCircle className="w-10 h-10 mx-auto text-emerald-500/70" />
              <p className="font-semibold text-zinc-700 dark:text-zinc-300">
                Aktiv ödənilməmiş borcu olan müştəri yoxdur.
              </p>
              <p>Bağlanmış borclara baxmaq üçün “Tam Ödənilib · Arxiv” bölməsini aça bilərsiniz.</p>
            </div>
          ) : (
            filteredActiveDebtors.map(debtor => renderDebtorCard(debtor, false))
          )}
        </div>
      )}

      {/* TAB: TAM ÖDƏNİLİB / ARXİV */}
      {activeTab === 'settled_debtors' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSettledDebtors.length === 0 ? (
            <div className="col-span-full py-16 text-center bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 text-zinc-500 text-xs space-y-2">
              <Archive className="w-10 h-10 mx-auto text-zinc-400" />
              <p>Tam ödənilmiş borc arxivi hələ boşdur.</p>
            </div>
          ) : (
            filteredSettledDebtors.map(debtor => renderDebtorCard(debtor, true))
          )}
        </div>
      )}

      {/* TAB: BÜTÜN BORC QEYDLƏRİ */}
      {activeTab === 'records' && (
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[860px]">
              <thead className="bg-zinc-50 dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 font-bold uppercase tracking-wider text-[10px] border-b border-zinc-200 dark:border-zinc-800">
                <tr>
                  <th className="py-3 px-4">Yaranma Tarixi</th>
                  <th className="py-3 px-4">Borclu & Telefon</th>
                  <th className="py-3 px-4">Məhsullar</th>
                  <th className="py-3 px-4 text-right">Cəmi</th>
                  <th className="py-3 px-4 text-right">Ödənilən</th>
                  <th className="py-3 px-4 text-right">Qalıq</th>
                  <th className="py-3 px-4">Son Ödəniş</th>
                  <th className="py-3 px-4 text-center">Vəziyyət</th>
                  <th className="py-3 px-4 text-center">Əməliyyat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-zinc-500">
                      Seçilmiş filtr üzrə borc qeydi tapılmadı.
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map(d => {
                    const badge = getStatusBadge(d.status);
                    const isExpanded = expandedDebtMap[d.id] ?? false;
                    const paymentsCount = (d.payments || []).length;
                    const latestPayment = (d.payments || [])
                      .map(p => (p.paidAt || p.date || '').split('T')[0])
                      .sort()
                      .pop();

                    return (
                      <React.Fragment key={d.id}>
                        <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                          <td className="py-3 px-4 font-mono tabular-nums text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                            {formatDateAZ(d.date)}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <div className="font-bold text-zinc-900 dark:text-white">{d.debtorName}</div>
                            {d.debtorPhone && (
                              <div className="text-[11px] font-mono text-zinc-500">{d.debtorPhone}</div>
                            )}
                          </td>
                          <td className="py-3 px-4 font-medium text-zinc-700 dark:text-zinc-300 max-w-xs">
                            {d.items.map(i => `${i.productName} ×${i.quantity}`).join(', ')}
                            {d.notes && <div className="text-[10px] text-zinc-500 italic">{d.notes}</div>}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-zinc-900 dark:text-white">
                            {formatAZN(d.totalAmount)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">
                            {formatAZN(d.paidAmount)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums font-extrabold text-red-600 dark:text-red-400">
                            {formatAZN(d.remainingAmount)}
                          </td>
                          <td className="py-3 px-4 font-mono tabular-nums text-zinc-500 whitespace-nowrap">
                            {latestPayment ? formatDateAZ(latestPayment) : '—'}
                          </td>
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${badge.cls}`}>
                              {badge.label}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              {d.remainingAmount > 0.009 && d.status !== 'odanilib' && (
                                <button
                                  type="button"
                                  onClick={() => openPayModal(d)}
                                  style={{ backgroundColor: primaryColor }}
                                  className="px-2.5 py-1 hover:opacity-95 text-white font-bold text-[11px] rounded-lg transition-colors whitespace-nowrap"
                                >
                                  Ödəniş al
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
                            <td colSpan={9} className="px-6 py-3">
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
                                            <span className="font-mono tabular-nums text-[11px] text-zinc-500">
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
                                          <span className="font-mono tabular-nums font-extrabold text-emerald-600 dark:text-emerald-400">
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

      {/* TAB: MÜŞTƏRİ BALANSLARI */}
      {activeTab === 'balances' && (
        <div className="space-y-4">
          {filteredCustomerAccounts.length === 0 ? (
            <div className="py-16 text-center bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 text-zinc-500 text-xs space-y-3">
              <Wallet className="w-10 h-10 mx-auto text-zinc-400 dark:text-zinc-600" />
              <p>Müştəri balansı tapılmadı.</p>
              <button
                type="button"
                onClick={() => openBalanceModal()}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs"
              >
                + İlk Müştəri Balansını Aç
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredCustomerAccounts.map(customer => {
                const isExpanded = expandedCustomerMap[customer.id] ?? false;
                const transactions = [...(customer.transactions || [])].sort((a, b) => {
                  const dCmp = (b.date || '').localeCompare(a.date || '');
                  if (dCmp !== 0) return dCmp;
                  const tCmp = (b.time || '').localeCompare(a.time || '');
                  if (tCmp !== 0) return tCmp;
                  return (b.createdAt || '').localeCompare(a.createdAt || '');
                });
                const hasTransactions = transactions.length > 0;
                const openedDate =
                  customer.openedDate ||
                  transactions[transactions.length - 1]?.date ||
                  customer.createdAt.slice(0, 10);

                return (
                  <div
                    key={customer.id}
                    className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex flex-col justify-between space-y-4"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/80 flex items-center justify-center font-bold text-sm shrink-0">
                            {customer.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-sm font-bold text-zinc-900 dark:text-white truncate">
                              {customer.name}
                            </h4>
                            <div className="text-[11px] text-zinc-500 dark:text-zinc-400 flex flex-wrap items-center gap-1.5">
                              {customer.phone && <span>{customer.phone} ·</span>}
                              <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                                <Calendar className="w-3 h-3" /> Açılma: {formatDateAZ(openedDate)}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                              customer.balance > 0
                                ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700'
                            }`}
                          >
                            {customer.balance > 0 ? 'Aktiv' : '0 AZN'}
                          </span>
                          {isAdmin && (
                            <>
                              <button
                                type="button"
                                onClick={() => openEditCustomerModal(customer)}
                                className="p-1 text-zinc-400 hover:text-zinc-900 dark:hover:text-white rounded-lg transition-colors"
                                title="Balansı Redaktə Et"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              {confirmDeleteCustId === customer.id ? (
                                <div className="flex items-center gap-1 ml-0.5">
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
                                  className="p-1 text-zinc-400 hover:text-red-500 rounded-lg transition-colors"
                                  title="Hesabı Sil"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>

                      <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 flex items-center justify-between gap-2">
                        <div>
                          <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-bold uppercase tracking-wider block">
                            Cari Aktiv Balans
                          </span>
                          <span className="text-2xl font-black font-mono tabular-nums text-amber-600 dark:text-amber-400">
                            {formatAZN(customer.balance)}
                          </span>
                        </div>
                        <div className="text-right text-[11px] text-zinc-500 dark:text-zinc-400 space-y-0.5 font-mono tabular-nums">
                          <p>
                            Qoyulan: <strong className="text-emerald-600 dark:text-emerald-400">{formatAZN(customer.totalDeposited)}</strong>
                          </p>
                          <p>
                            Məhsul: <strong className="text-cyan-600 dark:text-cyan-400">{formatAZN(customer.totalSpent)}</strong>
                          </p>
                          <p>
                            Pul çıxışı: <strong className="text-rose-600 dark:text-rose-400">{formatAZN(customer.totalWithdrawn || 0)}</strong>
                          </p>
                        </div>
                      </div>

                      {customer.notes && (
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 italic truncate">
                          Qeyd: {customer.notes}
                        </p>
                      )}

                      {isExpanded && hasTransactions && (
                        <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800 text-xs space-y-2">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 flex justify-between">
                            <span>Əməliyyat Tarixçəsi</span>
                            <span>{transactions.length} qeyd</span>
                          </div>
                          <div className="divide-y divide-zinc-200 dark:divide-zinc-800/60 max-h-60 overflow-y-auto pr-1">
                            {transactions.map(tx => {
                              const badge = getBalanceTxBadge(tx);
                              return (
                                <div key={tx.id} className="py-2 flex items-start justify-between gap-2 text-[11px]">
                                  <div className="min-w-0 space-y-0.5">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${badge.cls}`}>
                                        {badge.label}
                                      </span>
                                      {tx.paymentMethod && tx.paymentMethod !== 'balans' && (
                                        <span className="px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-bold text-[10px] uppercase">
                                          {tx.paymentMethod}
                                        </span>
                                      )}
                                    </div>
                                    {(tx.productName || (tx.items && tx.items.length > 0)) && (
                                      <div className="font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                                        {tx.productName
                                          ? `${tx.productName} × ${tx.quantity || 1} əd. (${formatAZN(tx.unitPrice || 0)})`
                                          : tx.items?.map(i => `${i.productName} (${i.quantity}x)`).join(', ')}
                                      </div>
                                    )}
                                    {tx.note && (
                                      <div className="text-[10px] text-zinc-600 dark:text-zinc-400 truncate">
                                        {tx.note}
                                      </div>
                                    )}
                                    <div className="text-[10px] text-zinc-500 font-mono tabular-nums flex flex-wrap items-center gap-1.5">
                                      <span>{formatDateAZ(tx.date)} {tx.time}</span>
                                      {tx.balanceAfter !== undefined && (
                                        <span>· Qalıq: {formatAZN(tx.balanceAfter)}</span>
                                      )}
                                      {tx.createdBy && <span>· @{tx.createdBy}</span>}
                                    </div>
                                  </div>
                                  <span className={`font-mono tabular-nums font-bold shrink-0 ${badge.amountCls}`}>
                                    {badge.sign} {formatAZN(tx.amount)}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 space-y-2">
                      <div className="grid grid-cols-3 gap-1.5">
                        <button
                          type="button"
                          onClick={() => openBalanceModal(customer)}
                          className="py-2 px-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] rounded-xl transition-all flex items-center justify-center gap-1 whitespace-nowrap"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Artır</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openProductOutModal(customer)}
                          disabled={products.length === 0 || customer.balance <= 0}
                          className="py-2 px-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-45 text-white font-bold text-[11px] rounded-xl transition-all flex items-center justify-center gap-1 whitespace-nowrap"
                          title="Balansdan məhsul çıxar"
                        >
                          <ShoppingBag className="w-3.5 h-3.5" />
                          <span>Məhsul</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openCashOutModal(customer)}
                          disabled={customer.balance <= 0}
                          className="py-2 px-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-45 text-white font-bold text-[11px] rounded-xl transition-all flex items-center justify-center gap-1 whitespace-nowrap"
                          title="Balansdan sərbəst pul çıxar"
                        >
                          <ArrowUpRight className="w-3.5 h-3.5" />
                          <span>Pul Çıxar</span>
                        </button>
                      </div>

                      {hasTransactions && (
                        <button
                          type="button"
                          onClick={() => toggleCustomerExpanded(customer.id)}
                          className="w-full py-1.5 px-3 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-semibold text-xs rounded-xl transition-colors flex items-center justify-center gap-1.5"
                        >
                          <History className="w-3.5 h-3.5" />
                          <span>{isExpanded ? 'Tarixçəni Bağla' : `Tarixçəni Gör (${transactions.length})`}</span>
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

      {/* Modal: New Debt */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                  Yeni Nisyə (Borc) Qeydiyyatı
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Məhsul satışı seçildikdə anbar qalığı dərhal azalır
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="p-1.5 text-zinc-400 hover:text-zinc-900 dark:hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateDebt} className="p-5 space-y-4 overflow-y-auto">
              {/* Entry Mode Switch */}
              <div className="grid grid-cols-2 p-1 rounded-xl bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 gap-1">
                <button
                  type="button"
                  onClick={() => setDebtEntryMode('product')}
                  className={`py-1.5 text-xs font-bold rounded-lg transition-colors ${
                    debtEntryMode === 'product'
                      ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs'
                      : 'text-zinc-500'
                  }`}
                >
                  Məhsul satışı (Stokdan çıx)
                </button>
                <button
                  type="button"
                  onClick={() => setDebtEntryMode('manual')}
                  className={`py-1.5 text-xs font-bold rounded-lg transition-colors ${
                    debtEntryMode === 'manual'
                      ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs'
                      : 'text-zinc-500'
                  }`}
                >
                  Sərbəst / Əl ilə borc
                </button>
              </div>

              {addDebtError && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{addDebtError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-red-600 dark:text-red-400 uppercase tracking-wider mb-1">
                    Ad və Soyad *
                  </label>
                  <input
                    type="text"
                    required
                    value={debtorName}
                    onChange={e => handleDebtorNameTyping(e.target.value)}
                    placeholder="məs: Əli Həsənov"
                    className="w-full px-3 py-2 text-sm font-semibold rounded-xl border border-red-300 dark:border-red-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1">
                    Telefon nömrəsi
                  </label>
                  <input
                    type="tel"
                    value={debtorPhone}
                    onChange={e => setDebtorPhone(e.target.value)}
                    placeholder="050 000 00 00"
                    className="w-full px-3 py-2 text-sm font-mono rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
              </div>

              {debtEntryMode === 'product' ? (
                <div>
                  <label className="block text-[11px] font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                    Götürdüyü Məhsul *
                  </label>
                  <select
                    value={selectedProductId}
                    onChange={e => handleProductChange(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                  >
                    {products.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({formatAZN(p.salePrice)} · Stok: {stockById[p.id] ?? 0} əd.)
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-[11px] font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                    Məhsul / Təsvir *
                  </label>
                  <input
                    type="text"
                    required
                    value={manualItemName}
                    onChange={e => setManualItemName(e.target.value)}
                    placeholder="məs: Köhnə borc qalığı və ya xidmət"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                    Say (ədəd) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={quantity}
                    onChange={e => handleQuantityChange(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                    Cəmi Məbləğ (AZN) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={customAmount}
                    onChange={e => setCustomAmount(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                    İlkin Ödənilən (AZN)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={initialPaid}
                    onChange={e => setInitialPaid(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                    Tarix
                  </label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                  Qeyd
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="məs: Sabah məşqə gələndə ödəyəcək"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
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
          <div className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                  Borc Ödənişinin Qəbulu
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Müştəri: <strong className="text-zinc-900 dark:text-white">{selectedDebt.debtorName}</strong>
                  {selectedDebt.debtorPhone ? ` · ${selectedDebt.debtorPhone}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsPayModalOpen(false)}
                className="p-1.5 text-zinc-400 hover:text-zinc-900 dark:hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleExecutePayment} className="p-5 space-y-4 overflow-y-auto">
              {/* Selector when debtor has multiple open debts */}
              {debtorUnpaidOptions.length > 1 && (
                <div>
                  <label className="block text-[11px] font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1">
                    Hansı borc qeydi ödənilsin?
                  </label>
                  <select
                    value={selectedDebt.id}
                    onChange={e => handleSelectDebtInModal(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white"
                  >
                    {debtorUnpaidOptions.map(opt => (
                      <option key={opt.id} value={opt.id}>
                        {formatDateAZ(opt.date)} · {opt.items.map(i => i.productName).join(', ')} (Qalıq: {formatAZN(opt.remainingAmount)})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-zinc-500">
                    Cari Qalıq Borc
                  </span>
                  <div className="text-xl font-black font-mono tabular-nums text-red-600 dark:text-red-500">
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
                <label className="block text-[11px] font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
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
                  className="w-full px-3.5 py-2 text-base font-mono tabular-nums font-bold rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1.5">
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
                  <label className="block text-[11px] font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
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
                  <label className="block text-[11px] font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                    Ödəniş Tarixi
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
                <label className="block text-[11px] font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
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

      {/* Modal: Open Balance / Deposit Top-up */}
      {isDepositModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-600 text-white flex items-center justify-center">
                  <Coins className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                    {depositCustomerId ? 'Balansı Artır' : 'Yeni Müştəri Balansı Aç'}
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Faktiki tarix və saat üzrə balans əməliyyatı
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

            <form onSubmit={handleDepositSubmit} className="p-5 space-y-4 text-xs overflow-y-auto">
              {depositError && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 font-semibold">
                  {depositError}
                </div>
              )}

              {customerAccounts.length > 0 && (
                <div>
                  <label className="block text-zinc-700 dark:text-zinc-300 font-bold mb-1">
                    Mövcud Müştəri Seç (və ya yeni ad yaz)
                  </label>
                  <select
                    value={depositCustomerId}
                    onChange={e => {
                      const id = e.target.value;
                      setDepositCustomerId(id);
                      const found = customerAccounts.find(c => c.id === id);
                      if (found) {
                        setDepositName(found.name);
                        setDepositPhone(found.phone || '');
                      } else {
                        setDepositName('');
                        setDepositPhone('');
                      }
                    }}
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white"
                  >
                    <option value="">+ Yeni müştəri hesabı aç</option>
                    {customerAccounts.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} (Cari: {formatAZN(c.balance)})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-700 dark:text-zinc-300 font-bold mb-1">
                    Müştərinin Adı *
                  </label>
                  <input
                    type="text"
                    required
                    disabled={Boolean(depositCustomerId)}
                    value={depositName}
                    onChange={e => setDepositName(e.target.value)}
                    placeholder="məs: Əli"
                    className="w-full px-3.5 py-2 text-sm font-semibold rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white disabled:opacity-70 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-zinc-700 dark:text-zinc-300 font-bold mb-1">
                    Telefon (İstəyə görə)
                  </label>
                  <input
                    type="text"
                    value={depositPhone}
                    onChange={e => setDepositPhone(e.target.value)}
                    placeholder="050..."
                    className="w-full px-3.5 py-2 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-zinc-700 dark:text-zinc-300 font-bold mb-1">
                  {depositCustomerId ? 'Əlavə Edilən Məbləğ (AZN) *' : 'İlkin Balans Məbləği (AZN)'}
                </label>
                <input
                  type="number"
                  min={depositCustomerId ? '0.01' : '0'}
                  step="0.01"
                  required
                  value={depositAmount}
                  onChange={e => setDepositAmount(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-base font-mono font-bold rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <div className="flex gap-2 mt-2">
                  {[5, 10, 20, 50].map(amt => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setDepositAmount(String(amt))}
                      className={`flex-1 py-1 rounded-lg border text-[11px] font-bold transition-colors ${
                        Number(depositAmount) === amt
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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-700 dark:text-zinc-300 font-bold mb-1">Tarix</label>
                  <input
                    type="date"
                    value={depositDate}
                    onChange={e => setDepositDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-zinc-700 dark:text-zinc-300 font-bold mb-1">Saat</label>
                  <input
                    type="time"
                    value={depositTime}
                    onChange={e => setDepositTime(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white"
                  />
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
                  placeholder="məs: 5 noyabr ilkin depozit"
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
                  disabled={isSubmittingBalanceOp}
                  className="px-5 py-2 text-xs font-bold bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-xl shadow-sm"
                >
                  {isSubmittingBalanceOp
                    ? 'Yadda saxlanır...'
                    : depositCustomerId
                    ? `Balansa Əlavə Et (${formatAZN(parseFloat(depositAmount) || 0)})`
                    : `Balans Aç (${formatAZN(parseFloat(depositAmount) || 0)})`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Withdraw Product from Balance («Məhsul Çıxar») */}
      {isProductOutModalOpen && (() => {
        const selectedCust = customerAccounts.find(c => c.id === prodOutCustomerId);
        const selectedProd = products.find(p => p.id === prodOutProductId);
        const availableStock = selectedProd ? (stockById[selectedProd.id] ?? 0) : 0;
        const qtyNum = Math.max(0, Math.floor(Number(prodOutQty) || 0));
        const unitPrice = selectedProd ? round2(Number(selectedProd.salePrice) || 0) : 0;
        const totalCost = round2(unitPrice * qtyNum);
        const currentBal = selectedCust ? round2(selectedCust.balance) : 0;
        const newBal = round2(currentBal - totalCost);
        const newStock = availableStock - qtyNum;
        const hasInsufficientBal = Boolean(selectedCust && totalCost > currentBal + 0.001);
        const hasInsufficientStock = Boolean(selectedProd && qtyNum > availableStock);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
            <div className="bg-white dark:bg-zinc-900 w-full max-w-lg rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col max-h-[90vh]">
              <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-cyan-600 text-white flex items-center justify-center">
                    <ShoppingBag className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                      Balansdan Məhsul Çıxar
                    </h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                      Məbləğ müştəri balansından, say isə depodan avtomatik çıxılır
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsProductOutModalOpen(false)}
                  className="p-1.5 text-zinc-400 hover:text-zinc-900 dark:hover:text-white rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleProductOutSubmit} className="p-5 space-y-4 text-xs overflow-y-auto">
                {prodOutError && (
                  <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 font-semibold">
                    {prodOutError}
                  </div>
                )}

                <div>
                  <label className="block text-zinc-700 dark:text-zinc-300 font-bold mb-1">
                    Müştəri Seçin *
                  </label>
                  <select
                    required
                    value={prodOutCustomerId}
                    onChange={e => setProdOutCustomerId(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm font-semibold rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white"
                  >
                    {customerAccounts.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} — Balans: {formatAZN(c.balance)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-zinc-700 dark:text-zinc-300 font-bold mb-1">
                    Depodakı Məhsul *
                  </label>
                  <select
                    required
                    value={prodOutProductId}
                    onChange={e => setProdOutProductId(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm font-semibold rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white"
                  >
                    {products.map(p => {
                      const st = stockById[p.id] ?? 0;
                      return (
                        <option key={p.id} value={p.id}>
                          {p.name} — {formatAZN(p.salePrice)} · Depo: {st} ədəd
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-zinc-700 dark:text-zinc-300 font-bold mb-1">
                      Miqdar (ədəd) *
                    </label>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setProdOutQty(String(Math.max(1, qtyNum - 1)))}
                        className="p-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        required
                        value={prodOutQty}
                        onChange={e => setProdOutQty(e.target.value)}
                        className="w-full px-3 py-2 text-center text-base font-mono font-bold rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={() => setProdOutQty(String(qtyNum + 1))}
                        className="p-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-zinc-700 dark:text-zinc-300 font-bold mb-1">
                      Vahid Qiyməti & Ümumi Məbləğ
                    </label>
                    <div className="px-3.5 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 font-mono tabular-nums">
                      <div className="text-[11px] text-zinc-500">Vahid: {formatAZN(unitPrice)}</div>
                      <div className="text-base font-black text-cyan-600 dark:text-cyan-400">
                        Cəmi: {formatAZN(totalCost)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Live Impact Summary */}
                <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 grid grid-cols-2 gap-3 font-mono tabular-nums">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-zinc-500 block">Müştəri Balansı</span>
                    <span className={`font-bold text-xs ${hasInsufficientBal ? 'text-red-600 dark:text-red-400' : 'text-zinc-900 dark:text-white'}`}>
                      {formatAZN(currentBal)} → {formatAZN(Math.max(0, newBal))}
                    </span>
                    {hasInsufficientBal && (
                      <span className="block text-[10px] font-sans font-bold text-red-600 dark:text-red-400 mt-0.5">
                        Balans kifayət etmir!
                      </span>
                    )}
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-zinc-500 block">Depo Qalığı</span>
                    <span className={`font-bold text-xs ${hasInsufficientStock ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      {availableStock} əd. → {Math.max(0, newStock)} əd.
                    </span>
                    {hasInsufficientStock && (
                      <span className="block text-[10px] font-sans font-bold text-red-600 dark:text-red-400 mt-0.5">
                        Depoda stok çatmır!
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-zinc-700 dark:text-zinc-300 font-bold mb-1">Tarix</label>
                    <input
                      type="date"
                      value={prodOutDate}
                      onChange={e => setProdOutDate(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-zinc-700 dark:text-zinc-300 font-bold mb-1">Saat</label>
                    <input
                      type="time"
                      value={prodOutTime}
                      onChange={e => setProdOutTime(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-zinc-700 dark:text-zinc-300 font-bold mb-1">Qeyd (İstəyə görə)</label>
                  <input
                    type="text"
                    value={prodOutNote}
                    onChange={e => setProdOutNote(e.target.value)}
                    placeholder="məs: Məşq sonrası 2 ədəd su"
                    className="w-full px-3.5 py-2 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white"
                  />
                </div>

                <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsProductOutModalOpen(false)}
                    className="px-4 py-2 text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-white rounded-xl"
                  >
                    Ləğv et
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingBalanceOp || hasInsufficientBal || hasInsufficientStock || qtyNum <= 0}
                    className="px-5 py-2 text-xs font-bold bg-cyan-600 hover:bg-cyan-700 disabled:opacity-45 text-white rounded-xl shadow-sm"
                  >
                    {isSubmittingBalanceOp ? 'İcra edilir...' : `Məhsulu Çıxar (${formatAZN(totalCost)})`}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* Modal: Free Cash Withdrawal from Balance («Pul Çıxar») */}
      {isCashOutModalOpen && (() => {
        const selectedCust = customerAccounts.find(c => c.id === cashOutCustomerId);
        const currentBal = selectedCust ? round2(selectedCust.balance) : 0;
        const amtNum = round2(parseFloat(cashOutAmount) || 0);
        const hasInsufficient = Boolean(selectedCust && amtNum > currentBal + 0.001);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
            <div className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col max-h-[90vh]">
              <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-rose-600 text-white flex items-center justify-center">
                    <ArrowUpRight className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                      Balansdan Sərbəst Pul Çıxarışı
                    </h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                      Satış gəliri deyil · Kassadan pul çıxışı kimi qeyd olunur
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCashOutModalOpen(false)}
                  className="p-1.5 text-zinc-400 hover:text-zinc-900 dark:hover:text-white rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCashOutSubmit} className="p-5 space-y-4 text-xs overflow-y-auto">
                {cashOutError && (
                  <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 font-semibold">
                    {cashOutError}
                  </div>
                )}

                <div>
                  <label className="block text-zinc-700 dark:text-zinc-300 font-bold mb-1">
                    Müştəri Seçin *
                  </label>
                  <select
                    required
                    value={cashOutCustomerId}
                    onChange={e => setCashOutCustomerId(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm font-semibold rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white"
                  >
                    {customerAccounts.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} — Cari Balans: {formatAZN(c.balance)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-zinc-700 dark:text-zinc-300 font-bold">
                      Çıxarılacaq Məbləğ (AZN) *
                    </label>
                    {selectedCust && (
                      <button
                        type="button"
                        onClick={() => setCashOutAmount(String(selectedCust.balance))}
                        className="text-[11px] font-bold text-rose-600 dark:text-rose-400 hover:underline"
                      >
                        Tamını çıxar ({formatAZN(selectedCust.balance)})
                      </button>
                    )}
                  </div>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    value={cashOutAmount}
                    onChange={e => setCashOutAmount(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-base font-mono font-bold rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white"
                  />
                  {selectedCust && (
                    <div className={`mt-1.5 text-[11px] font-mono ${hasInsufficient ? 'text-red-600 dark:text-red-400 font-bold' : 'text-zinc-500'}`}>
                      Qalıq balans: {formatAZN(currentBal)} → {formatAZN(Math.max(0, round2(currentBal - amtNum)))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-zinc-700 dark:text-zinc-300 font-bold mb-1">Geri Ödəniş Üsulu</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['naqd', 'kart', 'pos'] as const).map(pt => (
                      <button
                        key={pt}
                        type="button"
                        onClick={() => setCashOutMethod(pt)}
                        className={`py-2 rounded-xl border text-[11px] font-bold uppercase transition-all ${
                          cashOutMethod === pt
                            ? 'bg-rose-600 text-white border-rose-500 shadow-sm'
                            : 'bg-zinc-50 dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800'
                        }`}
                      >
                        {pt}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-zinc-700 dark:text-zinc-300 font-bold mb-1">Tarix</label>
                    <input
                      type="date"
                      value={cashOutDate}
                      onChange={e => setCashOutDate(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-zinc-700 dark:text-zinc-300 font-bold mb-1">Saat</label>
                    <input
                      type="time"
                      value={cashOutTime}
                      onChange={e => setCashOutTime(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-zinc-700 dark:text-zinc-300 font-bold mb-1">Qeyd (İstəyə görə)</label>
                  <input
                    type="text"
                    value={cashOutNote}
                    onChange={e => setCashOutNote(e.target.value)}
                    placeholder="məs: Müştərinin tələbi ilə geri ödəniş"
                    className="w-full px-3.5 py-2 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white"
                  />
                </div>

                <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsCashOutModalOpen(false)}
                    className="px-4 py-2 text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-white rounded-xl"
                  >
                    Ləğv et
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingBalanceOp || hasInsufficient || amtNum <= 0}
                    className="px-5 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 disabled:opacity-45 text-white rounded-xl shadow-sm"
                  >
                    {isSubmittingBalanceOp ? 'İcra edilir...' : `Pul Çıxar (${formatAZN(amtNum)})`}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* Modal: Edit Customer Metadata & Admin Balance Adjustment */}
      {isEditCustomerModalOpen && editCustTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                  Müştəri Balansını Redaktə Et
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Tarixçə qorunur · Bütün düzəlişlər auditə yazılır
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsEditCustomerModalOpen(false)}
                className="p-1.5 text-zinc-400 hover:text-zinc-900 dark:hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditCustomerSubmit} className="p-5 space-y-4 text-xs overflow-y-auto">
              {editCustError && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 font-semibold">
                  {editCustError}
                </div>
              )}

              <div>
                <label className="block text-zinc-700 dark:text-zinc-300 font-bold mb-1">Müştərinin Adı *</label>
                <input
                  type="text"
                  required
                  value={editCustName}
                  onChange={e => setEditCustName(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm font-semibold rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-zinc-700 dark:text-zinc-300 font-bold mb-1">Telefon</label>
                <input
                  type="text"
                  value={editCustPhone}
                  onChange={e => setEditCustPhone(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-zinc-700 dark:text-zinc-300 font-bold mb-1">Hesab Qeydi</label>
                <input
                  type="text"
                  value={editCustNotes}
                  onChange={e => setEditCustNotes(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white"
                />
              </div>

              <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-3">
                <label className="flex items-center gap-2 font-bold text-zinc-800 dark:text-zinc-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editCustAdjustEnabled}
                    onChange={e => setEditCustAdjustEnabled(e.target.checked)}
                    className="rounded border-zinc-400"
                  />
                  <span>Cari balansı düzəliş et (Hazırda: {formatAZN(editCustTarget.balance)})</span>
                </label>

                {editCustAdjustEnabled && (
                  <div className="space-y-2.5">
                    <div>
                      <label className="block text-zinc-700 dark:text-zinc-300 font-bold mb-1">
                        Yeni Balans Məbləği (AZN)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={editCustTargetBalance}
                        onChange={e => setEditCustTargetBalance(e.target.value)}
                        className="w-full px-3 py-2 text-sm font-mono font-bold rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-zinc-700 dark:text-zinc-300 font-bold mb-1">
                        Düzəliş Səbəbi *
                      </label>
                      <input
                        type="text"
                        required={editCustAdjustEnabled}
                        value={editCustReason}
                        onChange={e => setEditCustReason(e.target.value)}
                        placeholder="məs: Səhv yazılmış əməliyyatın düzəldilməsi"
                        className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditCustomerModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-white rounded-xl"
                >
                  Ləğv et
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingBalanceOp}
                  style={{ backgroundColor: primaryColor }}
                  className="px-5 py-2 text-xs font-bold text-white rounded-xl shadow-sm hover:opacity-90 disabled:opacity-50"
                >
                  {isSubmittingBalanceOp ? 'Saxlanılır...' : 'Dəyişiklikləri Saxla'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
