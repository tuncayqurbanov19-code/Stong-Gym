import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  User,
  Product,
  PurchaseIntake,
  Sale,
  DebtRecord,
  CustomerAccount,
  CustomerTransaction,
  DepoMovement,
  DailyReport,
  Expense,
  AppSettings,
  AuditLog,
  DebtPayment,
  DebtPaymentMethod,
  SaleItem,
} from '../types';
import { getTodayISODate, getCurrentTimeHHMM } from '../utils/dateUtils';
import { calculateProductStock } from '../utils/stockCalculations';
import {
  requestNotificationPermission,
  sendLowStockNotification,
  playAlertSound,
} from '../utils/notificationUtils';
import { saveToIndexedDB, loadFromIndexedDB } from '../utils/dbStorage';
import {
  getSupabaseClient,
  isSupabaseConfigured,
  mapDBToProduct,
  mapProductToDB,
  mapDBToSale,
  mapSaleToDB,
  mapSaleToLegacyDB,
  mapDBToPurchase,
  mapPurchaseToDB,
  mapDBToDebt,
  mapDebtToDB,
  mapDebtToLegacyDB,
  mapDBToDebtPayment,
  mapDebtPaymentToDB,
  mapDBToDailyReport,
  mapDailyReportToDB,
  mapDBToExpense,
  mapExpenseToDB,
  mapDBToUser,
  mapUserToDB,
  mapDBToAuditLog,
  mapAuditLogToDB,
  mapDBToCustomerAccount,
  mapCustomerAccountToDB,
  mapCustomerAccountToLegacyDB,
  mapDBToCustomerBalanceTx,
  mapCustomerBalanceTxToDB,
  mapDBToDepoMovement,
  mapDepoMovementToDB,
  applyAppSettingsRows,
  serializeSettingsToKV,
} from '../lib/supabase';
import { updateBrowserBranding } from '../utils/logoUtils';
import {
  INITIAL_SETTINGS,
  INITIAL_USERS,
  INITIAL_PRODUCTS,
  INITIAL_SALES,
  INITIAL_DEBTS,
  INITIAL_DAILY_REPORTS,
  INITIAL_CUSTOMERS,
} from '../data/initialSystemData';

const INITIAL_PURCHASES: PurchaseIntake[] = [];
const INITIAL_EXPENSES: Expense[] = [];

const INITIAL_AUDIT_LOGS: AuditLog[] = [
  {
    id: 'log-1',
    timestamp: new Date().toISOString(),
    userId: 'u-admin',
    username: 'admin',
    action: 'Baza Hazırlandı',
    details: 'Zal Barı idarəetmə bazası 11.11.2026 nüsxəsi ilə işə salındı.',
  },
];

export interface ToastNotice {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

export interface AcceptDebtPaymentParams {
  debtId: string;
  amount: number;
  paymentMethod: DebtPaymentMethod;
  receivedBy?: string;
  date?: string;
  note?: string;
}

export interface OpenOrDepositBalanceParams {
  customerId?: string;
  customerName: string;
  phone?: string;
  amount: number;
  paymentMethod?: 'naqd' | 'kart' | 'pos';
  date?: string;
  time?: string;
  note?: string;
  idempotencyKey?: string;
}

export interface WithdrawCustomerCashParams {
  customerId: string;
  amount: number;
  paymentMethod?: 'naqd' | 'kart' | 'pos';
  date?: string;
  time?: string;
  note?: string;
  idempotencyKey?: string;
}

export interface WithdrawProductFromBalanceParams {
  customerId: string;
  productId: string;
  quantity: number;
  date?: string;
  time?: string;
  note?: string;
  idempotencyKey?: string;
}

export interface AdjustCustomerBalanceParams {
  customerId: string;
  name?: string;
  phone?: string;
  notes?: string;
  newBalance?: number;
  reason?: string;
  date?: string;
  time?: string;
}

export interface RecordDepoAdjustmentParams {
  productId: string;
  targetActiveStock: number;
  barcode?: string;
  salePrice?: number;
  buyPrice?: number;
  note?: string;
  date?: string;
  time?: string;
}

interface AppContextType {
  currentUser: User | null;
  login: (username: string, password: string) => { success: boolean; error?: string };
  logout: () => void;
  users: User[];
  addUser: (user: Omit<User, 'id' | 'createdAt'>) => void;
  updateUser: (id: string, updates: Partial<User>) => void;
  deleteUser: (id: string) => void;
  products: Product[];
  addProduct: (product: Omit<Product, 'id' | 'createdAt'>) => void;
  updateProduct: (id: string, updates: Partial<Product>) => void;
  deleteProduct: (id: string) => void;
  purchases: PurchaseIntake[];
  addPurchase: (purchase: Omit<PurchaseIntake, 'id' | 'createdAt' | 'createdBy'>) => void;
  deletePurchase: (id: string) => void;
  depoMovements: DepoMovement[];
  recordManualDepoAdjustment: (params: RecordDepoAdjustmentParams) => Promise<{ success: boolean; error?: string }>;
  sales: Sale[];
  addSale: (saleData: {
    items: { productId: string; quantity: number }[];
    paymentType: Sale['paymentType'];
    debtorName?: string;
    debtorPhone?: string;
    discountAmount?: number;
    customDate?: string;
    customTime?: string;
  }) => { success: boolean; saleId?: string; error?: string };
  updateSaleDate: (saleId: string, newDate: string, newTime?: string) => { success: boolean; error?: string };
  confirmSale: (saleId: string) => void;
  confirmDaySales: (date: string) => void;
  deleteSale: (saleId: string) => void;
  debts: DebtRecord[];
  addDebt: (
    debt: Omit<DebtRecord, 'id' | 'createdAt' | 'updatedAt' | 'payments' | 'remainingAmount' | 'status'> & {
      productId?: string;
      quantity?: number;
    }
  ) => { success: boolean; error?: string };
  payDebt: (debtId: string, amount: number, note?: string) => void;
  acceptDebtPayment: (params: AcceptDebtPaymentParams) => Promise<{ success: boolean; error?: string }>;
  deleteDebtPayment: (debtId: string, paymentId: string) => Promise<{ success: boolean; error?: string }>;
  customerAccounts: CustomerAccount[];
  depositToCustomer: (
    customerName: string,
    amount: number,
    paymentType?: 'naqd' | 'kart' | 'pos',
    note?: string
  ) => void;
  openOrDepositCustomerBalance: (
    params: OpenOrDepositBalanceParams
  ) => Promise<{ success: boolean; error?: string; customerId?: string }>;
  withdrawCustomerCash: (
    params: WithdrawCustomerCashParams
  ) => Promise<{ success: boolean; error?: string }>;
  withdrawProductFromBalance: (
    params: WithdrawProductFromBalanceParams
  ) => Promise<{ success: boolean; error?: string; saleId?: string }>;
  adjustCustomerBalance: (
    params: AdjustCustomerBalanceParams
  ) => Promise<{ success: boolean; error?: string }>;
  chargeCustomerBalance: (
    customerName: string,
    amount: number,
    note?: string,
    saleId?: string,
    date?: string,
    time?: string,
    items?: SaleItem[]
  ) => boolean;
  deleteCustomerAccount: (customerId: string) => void;
  dailyReports: DailyReport[];
  saveDailyReport: (report: {
    date: string;
    cashAmount: number;
    cardAmount: number;
    posAmount: number;
    notes?: string;
  }) => void;
  expenses: Expense[];
  addExpense: (expense: Omit<Expense, 'id' | 'createdAt' | 'createdBy'>) => void;
  deleteExpense: (id: string) => void;
  settings: AppSettings;
  settingsLoading: boolean;
  updateSettings: (newSettings: Partial<AppSettings>) => Promise<{ success: boolean; error?: string }>;
  auditLogs: AuditLog[];
  resetToSampleData: () => void;
  resetToOriginalBackup: () => void;
  clearAllTransactions: () => void;
  restoreFromBackup: (jsonData: string) => boolean;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  getProductStock: (productId: string) => number;
  notificationPermission: NotificationPermission;
  requestPushPermission: () => Promise<NotificationPermission>;
  triggerTestNotification: () => void;
  isSupabaseConnected: boolean;
  supabaseStatus: string;
  syncAllLocalDataToSupabase: () => Promise<{ success: boolean; error?: string }>;
  reloadFromSupabase: () => Promise<void>;
  toast: ToastNotice | null;
  showToast: (type: ToastNotice['type'], message: string) => void;
  dismissToast: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// Storage helper with zero-out migration flag support
function loadFromStorage<T>(key: string, defaultValue: T): T {
  try {
    const item = localStorage.getItem(`zalbar_${key}`);
    return item ? JSON.parse(item) : defaultValue;
  } catch (err) {
    console.error(`Error loading ${key} from localStorage:`, err);
    return defaultValue;
  }
}

function saveToDualStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(`zalbar_${key}`, JSON.stringify(value));
  } catch (err) {
    console.error(`Error saving ${key} to localStorage:`, err);
  }
  // Mirror to permanent IndexedDB database
  saveToIndexedDB(key, value);
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Check migration flag to initialize user's real business database from 11.11.2026
  if (typeof window !== 'undefined' && localStorage.getItem('zalbar_backup_11_11_v3') !== 'true') {
    try {
      localStorage.setItem('zalbar_users', JSON.stringify(INITIAL_USERS));
      localStorage.setItem('zalbar_products', JSON.stringify(INITIAL_PRODUCTS));
      localStorage.setItem('zalbar_sales', JSON.stringify(INITIAL_SALES));
      localStorage.setItem('zalbar_debts', JSON.stringify(INITIAL_DEBTS));
      localStorage.setItem('zalbar_dailyReports', JSON.stringify(INITIAL_DAILY_REPORTS));
      localStorage.setItem('zalbar_customerAccounts', JSON.stringify(INITIAL_CUSTOMERS));
      localStorage.setItem('zalbar_currentUser', JSON.stringify(INITIAL_USERS[1])); // admin with admin2025
      localStorage.setItem('zalbar_backup_11_11_v3', 'true');
    } catch (e) {
      console.warn('Initial backup seed error:', e);
    }
  }

  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    return loadFromStorage<User | null>('currentUser', INITIAL_USERS[1]);
  });

  const [users, setUsers] = useState<User[]>(() => loadFromStorage('users', INITIAL_USERS));
  const [products, setProducts] = useState<Product[]>(() => loadFromStorage('products', INITIAL_PRODUCTS));
  const [purchases, setPurchases] = useState<PurchaseIntake[]>(() => loadFromStorage('purchases', INITIAL_PURCHASES));
  const [depoMovements, setDepoMovements] = useState<DepoMovement[]>(() => loadFromStorage('depoMovements', []));
  const [sales, setSales] = useState<Sale[]>(() => loadFromStorage('sales', INITIAL_SALES));
  const [debts, setDebts] = useState<DebtRecord[]>(() => loadFromStorage('debts', INITIAL_DEBTS));
  const [customerAccounts, setCustomerAccounts] = useState<CustomerAccount[]>(() =>
    loadFromStorage('customerAccounts', INITIAL_CUSTOMERS)
  );
  const [dailyReports, setDailyReports] = useState<DailyReport[]>(() =>
    loadFromStorage('dailyReports', INITIAL_DAILY_REPORTS)
  );
  const [expenses, setExpenses] = useState<Expense[]>(() => loadFromStorage('expenses', INITIAL_EXPENSES));
  const [settings, setSettings] = useState<AppSettings>(() => ({
    ...INITIAL_SETTINGS,
    ...loadFromStorage('settings', INITIAL_SETTINGS),
  }));
  const [settingsLoading, setSettingsLoading] = useState<boolean>(() => isSupabaseConfigured());
  const [toast, setToast] = useState<ToastNotice | null>(null);

  const showToast = useCallback((type: ToastNotice['type'], message: string) => {
    const id = `toast-${Date.now()}`;
    setToast({ id, type, message });
    setTimeout(() => {
      setToast(prev => (prev?.id === id ? null : prev));
    }, 4500);
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(() =>
    loadFromStorage('auditLogs', INITIAL_AUDIT_LOGS)
  );

  // Set dark theme as default for the modern black & red sports style
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return loadFromStorage<'light' | 'dark'>('theme', 'dark');
  });

  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission;
    }
    return 'default';
  });

  const [isSupabaseConnected, setIsSupabaseConnected] = useState(false);
  const [supabaseStatus, setSupabaseStatus] = useState<string>(() => {
    return isSupabaseConfigured() ? 'Qoşulur...' : 'Lokal rejim (Supabase quraşdırılmayıb)';
  });

  // Reload all records from Supabase
  const reloadFromSupabase = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setSettingsLoading(false);
      return;
    }

    try {
      setSettingsLoading(true);
      setSupabaseStatus('Supabase-dən məlumatlar yüklənir...');
      const [
        prodsRes,
        usersRes,
        salesRes,
        purchasesRes,
        debtsRes,
        debtPaymentsRes,
        reportsRes,
        expensesRes,
        settingsRes,
        logsRes,
        customersRes,
        balanceTxRes,
        depoMovementsRes,
      ] = await Promise.all([
        supabase.from('products').select('*'),
        supabase.from('users').select('*'),
        supabase.from('sales').select('*').order('created_at', { ascending: false }),
        supabase.from('purchases').select('*').order('created_at', { ascending: false }),
        supabase.from('debts').select('*').order('created_at', { ascending: false }),
        supabase.from('debt_payments').select('*').order('created_at', { ascending: false }),
        supabase.from('daily_reports').select('*').order('date', { ascending: false }),
        supabase.from('expenses').select('*').order('created_at', { ascending: false }),
        supabase.from('app_settings').select('*'),
        supabase.from('audit_logs').select('*').order('timestamp', { ascending: false }).limit(100),
        supabase.from('customer_accounts').select('*').order('name'),
        supabase.from('customer_balance_transactions').select('*').order('created_at', { ascending: false }),
        supabase.from('depo_movements').select('*').order('created_at', { ascending: false }),
      ]);

      if (prodsRes.data && prodsRes.data.length > 0) setProducts(prodsRes.data.map(mapDBToProduct));
      if (usersRes.data && usersRes.data.length > 0) setUsers(usersRes.data.map(mapDBToUser));
      if (salesRes.data) setSales(salesRes.data.map(mapDBToSale));
      if (purchasesRes.data) setPurchases(purchasesRes.data.map(mapDBToPurchase));
      if (!depoMovementsRes.error && depoMovementsRes.data) {
        setDepoMovements(depoMovementsRes.data.map(mapDBToDepoMovement));
      }

      if (debtsRes.data) {
        const mappedDebts = debtsRes.data.map(mapDBToDebt);
        if (!debtPaymentsRes.error && debtPaymentsRes.data) {
          const paymentsByDebt: Record<string, DebtPayment[]> = {};
          for (const row of debtPaymentsRes.data) {
            const p = mapDBToDebtPayment(row);
            if (!paymentsByDebt[p.debtId]) paymentsByDebt[p.debtId] = [];
            paymentsByDebt[p.debtId].push(p);
          }
          setDebts(
            mappedDebts.map(d => {
              const normalizedPayments = paymentsByDebt[d.id];
              if (normalizedPayments && normalizedPayments.length > 0) {
                return { ...d, payments: normalizedPayments };
              }
              return d;
            })
          );
        } else {
          setDebts(mappedDebts);
        }
      }

      if (customersRes.data && customersRes.data.length > 0) {
        const mappedCustomers = customersRes.data.map(mapDBToCustomerAccount);
        if (!balanceTxRes.error && balanceTxRes.data && balanceTxRes.data.length > 0) {
          const txByCust: Record<string, CustomerTransaction[]> = {};
          for (const row of balanceTxRes.data) {
            const tx = mapDBToCustomerBalanceTx(row);
            const cid = tx.customerId || '';
            if (!cid) continue;
            if (!txByCust[cid]) txByCust[cid] = [];
            txByCust[cid].push(tx);
          }
          setCustomerAccounts(
            mappedCustomers.map(c => {
              const normalizedTx = txByCust[c.id];
              if (normalizedTx && normalizedTx.length > 0) {
                return { ...c, transactions: normalizedTx };
              }
              return c;
            })
          );
        } else {
          setCustomerAccounts(mappedCustomers);
        }
      }
      if (reportsRes.data) setDailyReports(reportsRes.data.map(mapDBToDailyReport));
      if (expensesRes.data) setExpenses(expensesRes.data.map(mapDBToExpense));

      if (!settingsRes.error && settingsRes.data && settingsRes.data.length > 0) {
        const firstRow = settingsRes.data[0] as any;
        if ('key' in firstRow && 'value' in firstRow) {
          setSettings(prev => applyAppSettingsRows(settingsRes.data as { key: string; value: string }[], prev));
        } else {
          const globalRow =
            settingsRes.data.find((r: any) => r.id === 'global') || firstRow;
          setSettings(prev => ({
            ...prev,
            minStockThreshold: Number(globalRow.min_stock_threshold) || prev.minStockThreshold,
            autoConfirmSales:
              globalRow.auto_confirm_sales !== undefined
                ? Boolean(globalRow.auto_confirm_sales)
                : prev.autoConfirmSales,
            barName: globalRow.bar_name || prev.barName,
            enablePushNotifications:
              globalRow.enable_push_notifications !== undefined
                ? Boolean(globalRow.enable_push_notifications)
                : prev.enablePushNotifications,
            logoUrl: globalRow.logo_url || undefined,
          }));
        }
      }
      if (logsRes.data && logsRes.data.length > 0) setAuditLogs(logsRes.data.map(mapDBToAuditLog));

      setIsSupabaseConnected(true);
      setSupabaseStatus('Canlı Sinxronizasiya Aktivdir');
    } catch (e) {
      console.warn('reloadFromSupabase error:', e);
      setSupabaseStatus('Lokal rejim (Supabase cavab vermir)');
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  // Supabase Initial Fetch and Realtime Subscription
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setIsSupabaseConnected(false);
      setSupabaseStatus('Lokal rejim (Supabase quraşdırılmayıb)');
      return;
    }

    let isMounted = true;
    reloadFromSupabase();

    // Set up Realtime listener on all relevant tables
    const channel = supabase
      .channel('zalbar_realtime_sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, (payload) => {
        if (!isMounted) return;
        if (payload.eventType === 'INSERT') {
          const newSale = mapDBToSale(payload.new);
          setSales((prev) => {
            if (prev.some((s) => s.id === newSale.id)) return prev;
            return [newSale, ...prev];
          });
        } else if (payload.eventType === 'UPDATE') {
          const updated = mapDBToSale(payload.new);
          setSales((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
        } else if (payload.eventType === 'DELETE') {
          setSales((prev) => prev.filter((s) => s.id !== payload.old.id));
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'purchases' }, (payload) => {
        if (!isMounted) return;
        if (payload.eventType === 'INSERT') {
          const newP = mapDBToPurchase(payload.new);
          setPurchases((prev) => {
            if (prev.some((p) => p.id === newP.id)) return prev;
            return [newP, ...prev];
          });
        } else if (payload.eventType === 'UPDATE') {
          const updated = mapDBToPurchase(payload.new);
          setPurchases((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
        } else if (payload.eventType === 'DELETE') {
          setPurchases((prev) => prev.filter((p) => p.id !== payload.old.id));
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, (payload) => {
        if (!isMounted) return;
        if (payload.eventType === 'INSERT') {
          const newProd = mapDBToProduct(payload.new);
          setProducts((prev) => {
            if (prev.some((p) => p.id === newProd.id)) return prev;
            return [...prev, newProd];
          });
        } else if (payload.eventType === 'UPDATE') {
          const updated = mapDBToProduct(payload.new);
          setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
        } else if (payload.eventType === 'DELETE') {
          setProducts((prev) => prev.filter((p) => p.id !== payload.old.id));
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'debts' }, (payload) => {
        if (!isMounted) return;
        if (payload.eventType === 'INSERT') {
          const newDebt = mapDBToDebt(payload.new);
          setDebts((prev) => {
            if (prev.some((d) => d.id === newDebt.id)) return prev;
            return [newDebt, ...prev];
          });
        } else if (payload.eventType === 'UPDATE') {
          const updated = mapDBToDebt(payload.new);
          setDebts((prev) =>
            prev.map((d) => {
              if (d.id !== updated.id) return d;
              const mergedPayments =
                updated.payments && updated.payments.length > 0 ? updated.payments : d.payments;
              return { ...updated, payments: mergedPayments };
            })
          );
        } else if (payload.eventType === 'DELETE') {
          setDebts((prev) => prev.filter((d) => d.id !== payload.old.id));
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'debt_payments' }, (payload) => {
        if (!isMounted) return;
        if (payload.eventType === 'INSERT') {
          const newPay = mapDBToDebtPayment(payload.new);
          setDebts((prev) =>
            prev.map((d) => {
              if (d.id !== newPay.debtId) return d;
              if (d.payments.some((p) => p.id === newPay.id)) return d;
              return { ...d, payments: [newPay, ...d.payments] };
            })
          );
        } else if (payload.eventType === 'DELETE') {
          const oldId = payload.old?.id;
          if (oldId) {
            setDebts((prev) =>
              prev.map((d) => ({
                ...d,
                payments: d.payments.filter((p) => p.id !== oldId),
              }))
            );
          }
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_reports' }, (payload) => {
        if (!isMounted) return;
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const report = mapDBToDailyReport(payload.new);
          setDailyReports((prev) => {
            const idx = prev.findIndex((r) => r.date === report.date);
            if (idx >= 0) {
              const copy = [...prev];
              copy[idx] = report;
              return copy;
            }
            return [report, ...prev];
          });
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, (payload) => {
        if (!isMounted) return;
        if (payload.eventType === 'INSERT') {
          const newExp = mapDBToExpense(payload.new);
          setExpenses((prev) => {
            if (prev.some((e) => e.id === newExp.id)) return prev;
            return [newExp, ...prev];
          });
        } else if (payload.eventType === 'DELETE') {
          setExpenses((prev) => prev.filter((e) => e.id !== payload.old.id));
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, (payload) => {
        if (!isMounted) return;
        if (payload.eventType === 'INSERT') {
          const newUser = mapDBToUser(payload.new);
          setUsers((prev) => {
            if (prev.some((u) => u.id === newUser.id)) return prev;
            return [...prev, newUser];
          });
        } else if (payload.eventType === 'UPDATE') {
          const updated = mapDBToUser(payload.new);
          setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
        } else if (payload.eventType === 'DELETE') {
          setUsers((prev) => prev.filter((u) => u.id !== payload.old.id));
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, (payload) => {
        if (!isMounted) return;
        if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
          const row = payload.new as any;
          if ('key' in row && 'value' in row) {
            setSettings((prev) => applyAppSettingsRows([{ key: row.key, value: row.value }], prev));
          } else {
            setSettings((prev) => ({
              ...prev,
              minStockThreshold: Number(row.min_stock_threshold) || prev.minStockThreshold,
              autoConfirmSales:
                row.auto_confirm_sales !== undefined ? Boolean(row.auto_confirm_sales) : prev.autoConfirmSales,
              barName: row.bar_name || prev.barName,
              enablePushNotifications:
                row.enable_push_notifications !== undefined
                  ? Boolean(row.enable_push_notifications)
                  : prev.enablePushNotifications,
              logoUrl: row.logo_url || undefined,
            }));
          }
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_accounts' }, (payload) => {
        if (!isMounted) return;
        if (payload.eventType === 'INSERT') {
          const newCust = mapDBToCustomerAccount(payload.new);
          setCustomerAccounts((prev) => {
            if (prev.some((c) => c.id === newCust.id)) return prev;
            return [...prev, newCust];
          });
        } else if (payload.eventType === 'UPDATE') {
          const updated = mapDBToCustomerAccount(payload.new);
          setCustomerAccounts((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
        } else if (payload.eventType === 'DELETE') {
          setCustomerAccounts((prev) => prev.filter((c) => c.id !== payload.old.id));
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'depo_movements' }, (payload) => {
        if (!isMounted) return;
        if (payload.eventType === 'INSERT') {
          const newDm = mapDBToDepoMovement(payload.new);
          setDepoMovements((prev) => {
            if (prev.some((m) => m.id === newDm.id)) return prev;
            return [newDm, ...prev];
          });
        } else if (payload.eventType === 'DELETE') {
          setDepoMovements((prev) => prev.filter((m) => m.id !== payload.old.id));
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setIsSupabaseConnected(true);
          setSupabaseStatus('Canlı Sinxronizasiya Aktivdir');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setIsSupabaseConnected(false);
          setSupabaseStatus('Real-vaxt bağlantısı kəsildi');
        }
      });

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [reloadFromSupabase]);

  // Bulk push local data to Supabase
  const syncAllLocalDataToSupabase = async (): Promise<{ success: boolean; error?: string }> => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return { success: false, error: 'Supabase qoşulmayıb! URL və Anon Key daxil edin.' };
    }

    try {
      const kvRows = serializeSettingsToKV(settings).map(r => ({
        ...r,
        updated_at: new Date().toISOString(),
      }));
      const kvRes = await supabase.from('app_settings').upsert(kvRows, { onConflict: 'key' });
      if (kvRes.error) {
        // Fallback to legacy schema if migration hasn't run yet
        await supabase.from('app_settings').upsert({
          id: 'global',
          min_stock_threshold: settings.minStockThreshold,
          auto_confirm_sales: settings.autoConfirmSales,
          bar_name: settings.barName,
          enable_push_notifications: settings.enablePushNotifications,
          logo_url: settings.logoUrl || null,
        });
      }

      if (users.length > 0) {
        await supabase.from('users').upsert(users.map(mapUserToDB));
      }
      if (products.length > 0) {
        await supabase.from('products').upsert(products.map(mapProductToDB));
      }
      if (purchases.length > 0) {
        await supabase.from('purchases').upsert(purchases.map(mapPurchaseToDB));
      }
      if (sales.length > 0) {
        await supabase.from('sales').upsert(sales.map(mapSaleToDB));
      }
      if (debts.length > 0) {
        await supabase.from('debts').upsert(debts.map(mapDebtToDB));
        const allPayments = debts.flatMap(d =>
          (d.payments || []).map(p => mapDebtPaymentToDB({ ...p, debtId: d.id }))
        );
        if (allPayments.length > 0) {
          await supabase.from('debt_payments').upsert(allPayments);
        }
      }
      if (customerAccounts.length > 0) {
        const custRes = await supabase.from('customer_accounts').upsert(customerAccounts.map(mapCustomerAccountToDB));
        if (custRes.error && /column/i.test(custRes.error.message || '')) {
          await supabase.from('customer_accounts').upsert(customerAccounts.map(mapCustomerAccountToLegacyDB));
        }
        const allBalanceTxs = customerAccounts.flatMap(c =>
          (c.transactions || []).map(tx => mapCustomerBalanceTxToDB(tx, c.id, c.name))
        );
        if (allBalanceTxs.length > 0) {
          await supabase.from('customer_balance_transactions').upsert(allBalanceTxs);
        }
      }
      if (depoMovements.length > 0) {
        await supabase.from('depo_movements').upsert(depoMovements.map(mapDepoMovementToDB));
      }
      if (dailyReports.length > 0) {
        await supabase.from('daily_reports').upsert(dailyReports.map(mapDailyReportToDB));
      }
      if (expenses.length > 0) {
        await supabase.from('expenses').upsert(expenses.map(mapExpenseToDB));
      }

      setIsSupabaseConnected(true);
      setSupabaseStatus('Canlı Sinxronizasiya Aktivdir');
      return { success: true };
    } catch (err: any) {
      console.error('syncAllLocalDataToSupabase error:', err);
      return { success: false, error: err?.message || 'Sinxronizasiya xətası baş verdi' };
    }
  };

  // Load from IndexedDB on startup if localStorage was cleared
  useEffect(() => {
    async function restoreFromIndexedDBIfEmpty() {
      try {
        const storedProducts = await loadFromIndexedDB<Product[]>('products');
        if (storedProducts && storedProducts.length > 0 && products.length === 0) {
          setProducts(storedProducts);
        }
        const storedUsers = await loadFromIndexedDB<User[]>('users');
        if (storedUsers && storedUsers.length > 0 && users.length === 0) {
          setUsers(storedUsers);
        }
        const storedSettings = await loadFromIndexedDB<AppSettings>('settings');
        if (storedSettings) {
          setSettings(storedSettings);
        }
      } catch (e) {
        console.warn('IndexedDB initial load error:', e);
      }
    }
    restoreFromIndexedDBIfEmpty();
  }, []);

  // Sync state changes to dual persistence (localStorage + IndexedDB)
  useEffect(() => {
    saveToDualStorage('currentUser', currentUser);
  }, [currentUser]);

  useEffect(() => {
    saveToDualStorage('users', users);
  }, [users]);

  useEffect(() => {
    saveToDualStorage('products', products);
  }, [products]);

  useEffect(() => {
    saveToDualStorage('purchases', purchases);
  }, [purchases]);

  useEffect(() => {
    saveToDualStorage('depoMovements', depoMovements);
  }, [depoMovements]);

  useEffect(() => {
    saveToDualStorage('sales', sales);
  }, [sales]);

  useEffect(() => {
    saveToDualStorage('debts', debts);
  }, [debts]);

  useEffect(() => {
    saveToDualStorage('customerAccounts', customerAccounts);
  }, [customerAccounts]);

  useEffect(() => {
    saveToDualStorage('dailyReports', dailyReports);
  }, [dailyReports]);

  useEffect(() => {
    saveToDualStorage('expenses', expenses);
  }, [expenses]);

  useEffect(() => {
    saveToDualStorage('settings', settings);
    const primary = settings.primaryColor || '#dc2626';
    if (typeof document !== 'undefined') {
      document.documentElement.style.setProperty('--app-primary', primary);
      document.documentElement.style.setProperty('--app-primary-soft', `${primary}22`);
    }
    updateBrowserBranding(settings.logoUrl, settings.barName, primary);
  }, [settings]);

  useEffect(() => {
    saveToDualStorage('auditLogs', auditLogs);
  }, [auditLogs]);

  useEffect(() => {
    saveToDualStorage('theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  const requestPushPermission = async (): Promise<NotificationPermission> => {
    const perm = await requestNotificationPermission();
    setNotificationPermission(perm);
    return perm;
  };

  const triggerTestNotification = () => {
    playAlertSound('warning');
    if ('Notification' in window && Notification.permission === 'granted') {
      sendLowStockNotification('0,5 L Su (Sınaq)', 3, settings.minStockThreshold);
    } else {
      requestPushPermission().then(perm => {
        if (perm === 'granted') {
          sendLowStockNotification('0,5 L Su (Sınaq)', 3, settings.minStockThreshold);
        }
      });
    }
  };

  const addAuditLog = (action: string, details: string) => {
    const newLog: AuditLog = {
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: currentUser?.id || 'system',
      username: currentUser?.username || 'Sistem',
      action,
      details,
    };
    setAuditLogs(prev => [newLog, ...prev.slice(0, 99)]);
  };

  const login = (username: string, password: string): { success: boolean; error?: string } => {
    const trimmedUser = username.trim().toLowerCase();
    const user = users.find(u => u.username.toLowerCase() === trimmedUser && u.isActive);
    if (!user) {
      return { success: false, error: 'İstifadəçi adı tapılmadı və ya hesab deaktivdir.' };
    }
    if (user.password !== password) {
      return { success: false, error: 'Şifrə yanlışdır.' };
    }
    setCurrentUser(user);
    addAuditLog('Giriş edildi', `${user.name} (${user.role}) sistemə daxil oldu.`);
    return { success: true };
  };

  const logout = () => {
    if (currentUser) {
      addAuditLog('Çıxış edildi', `${currentUser.name} sistemdən çıxdı.`);
    }
    setCurrentUser(null);
  };

  const safeDbExec = (query: any) => {
    Promise.resolve(query).catch(err => {
      console.warn('Supabase sinxronizasiya bildirişi:', err);
    });
  };

  const addUser = (newUser: Omit<User, 'id' | 'createdAt'>) => {
    if (currentUser?.role !== 'admin') {
      showToast('error', 'İcazə yoxdur: Yalnız Admin istifadəçi əlavə edə bilər!');
      return;
    }
    const user: User = {
      ...newUser,
      id: `u-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    setUsers(prev => [...prev, user]);
    addAuditLog('İstifadəçi əlavə edildi', `Yeni istifadəçi: ${user.username} (${user.role})`);

    const supabase = getSupabaseClient();
    if (supabase) {
      safeDbExec(supabase.from('users').insert(mapUserToDB(user)));
    }
  };

  const updateUser = (id: string, updates: Partial<User>) => {
    if (currentUser?.role !== 'admin') {
      showToast('error', 'İcazə yoxdur: Yalnız Admin istifadəçi məlumatlarını dəyişə bilər!');
      return;
    }
    setUsers(prev => prev.map(u => (u.id === id ? { ...u, ...updates } : u)));
    if (currentUser && currentUser.id === id) {
      setCurrentUser(prev => (prev ? { ...prev, ...updates } : null));
    }
    addAuditLog('İstifadəçi yeniləndi', `İstifadəçi ID: ${id} məlumatları dəyişdirildi.`);

    const supabase = getSupabaseClient();
    if (supabase) {
      safeDbExec(supabase.from('users').update({
        ...(updates.name && { name: updates.name }),
        ...(updates.username && { username: updates.username }),
        ...(updates.password && { password: updates.password }),
        ...(updates.role && { role: updates.role }),
        ...(updates.isActive !== undefined && { is_active: updates.isActive }),
      }).eq('id', id));
    }
  };

  const deleteUser = (id: string) => {
    if (currentUser?.role !== 'admin') {
      showToast('error', 'İcazə yoxdur: Yalnız Admin istifadəçi silə bilər!');
      return;
    }
    const target = users.find(u => u.id === id);
    setUsers(prev => prev.filter(u => u.id !== id));
    addAuditLog('İstifadəçi silindi', `Silinən istifadəçi: ${target?.username}`);

    const supabase = getSupabaseClient();
    if (supabase) {
      safeDbExec(supabase.from('users').delete().eq('id', id));
    }
  };

  const addProduct = (newProd: Omit<Product, 'id' | 'createdAt'>) => {
    if (currentUser?.role !== 'admin') {
      showToast('error', 'İcazə yoxdur: Yalnız Admin məhsul əlavə edə bilər!');
      return;
    }
    const product: Product = {
      ...newProd,
      id: `prod-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    setProducts(prev => [...prev, product]);
    addAuditLog('Məhsul əlavə edildi', `${product.name} (${product.salePrice} AZN)`);

    const supabase = getSupabaseClient();
    if (supabase) {
      safeDbExec(supabase.from('products').insert(mapProductToDB(product)));
    }
  };

  const updateProduct = (id: string, updates: Partial<Product>) => {
    if (currentUser?.role !== 'admin') {
      showToast('error', 'İcazə yoxdur: Yalnız Admin məhsul məlumatlarını redaktə edə bilər!');
      return;
    }
    const prevProduct = products.find(p => p.id === id);
    setProducts(prev => prev.map(p => (p.id === id ? { ...p, ...updates } : p)));
    addAuditLog('Məhsul redaktə edildi', `Məhsul ID: ${id} yeniləndi.`);

    // If initialStock changed via full edit modal, record a transparent manual_adjustment movement
    if (
      prevProduct &&
      updates.initialStock !== undefined &&
      Number(updates.initialStock) !== Number(prevProduct.initialStock)
    ) {
      const oldStock = calculateProductStock(prevProduct, purchases, sales, settings.minStockThreshold).activeStock;
      const newStock = calculateProductStock(
        { ...prevProduct, ...updates },
        purchases,
        sales,
        settings.minStockThreshold
      ).activeStock;
      const delta = newStock - oldStock;
      if (delta !== 0) {
        const adjMovement: DepoMovement = {
          id: `dm-adj-${Date.now()}`,
          movementType: 'manual_adjustment',
          productId: prevProduct.id,
          productName: updates.name ?? prevProduct.name,
          quantityDelta: delta,
          stockBefore: oldStock,
          stockAfter: newStock,
          date: getTodayISODate(),
          time: getCurrentTimeHHMM(),
          sourceLabel: 'Əl ilə edilən depo düzəlişi',
          note: `Məhsul redaktəsindən qalıq düzəlişi (${oldStock} -> ${newStock})`,
          createdBy: currentUser?.username || 'admin',
          createdAt: new Date().toISOString(),
        };
        setDepoMovements(prev => [adjMovement, ...prev]);
        const supabase = getSupabaseClient();
        if (supabase) {
          safeDbExec(supabase.from('depo_movements').insert(mapDepoMovementToDB(adjMovement)));
        }
      }
    }

    const supabase = getSupabaseClient();
    if (supabase) {
      const dbUpdates: any = {};
      if (updates.name !== undefined) dbUpdates.name = updates.name;
      if (updates.barcode !== undefined) dbUpdates.barcode = updates.barcode;
      if (updates.salePrice !== undefined) dbUpdates.sale_price = updates.salePrice;
      if (updates.buyPrice !== undefined) dbUpdates.buy_price = updates.buyPrice;
      if (updates.category !== undefined) dbUpdates.category = updates.category;
      if (updates.volume !== undefined) dbUpdates.volume = updates.volume;
      if (updates.initialStock !== undefined) dbUpdates.initial_stock = updates.initialStock;
      if (updates.minStockAlert !== undefined) dbUpdates.min_stock_alert = updates.minStockAlert;
      if (updates.note !== undefined) dbUpdates.note = updates.note;
      if (updates.image !== undefined) dbUpdates.image = updates.image;

      safeDbExec(supabase.from('products').update(dbUpdates).eq('id', id));
    }
  };

  const recordManualDepoAdjustment = async (
    params: RecordDepoAdjustmentParams
  ): Promise<{ success: boolean; error?: string }> => {
    if (currentUser?.role !== 'admin') {
      return { success: false, error: 'İcazə yoxdur: Yalnız Admin depo qalığını düzəldə bilər!' };
    }
    const targetProd = products.find(p => p.id === params.productId);
    if (!targetProd) {
      return { success: false, error: 'Məhsul tapılmadı!' };
    }

    const stock = calculateProductStock(targetProd, purchases, sales, settings.minStockThreshold);
    const parsedTarget = Math.max(0, Math.trunc(Number(params.targetActiveStock) || 0));
    const newInitialStock = Math.max(0, parsedTarget - stock.totalPurchased + stock.totalSold);
    const delta = parsedTarget - stock.activeStock;
    const date = (params.date || getTodayISODate()).split('T')[0];
    const time = params.time || getCurrentTimeHHMM();
    const actor = currentUser?.username || 'admin';
    const nowIso = new Date().toISOString();

    const updatedProd: Product = {
      ...targetProd,
      initialStock: newInitialStock,
      barcode: params.barcode?.trim() || targetProd.barcode,
      salePrice:
        params.salePrice !== undefined && Number.isFinite(params.salePrice) && params.salePrice >= 0
          ? params.salePrice
          : targetProd.salePrice,
      buyPrice:
        params.buyPrice !== undefined && Number.isFinite(params.buyPrice) && params.buyPrice >= 0
          ? params.buyPrice
          : targetProd.buyPrice,
    };

    setProducts(prev => prev.map(p => (p.id === targetProd.id ? updatedProd : p)));

    let adjMovement: DepoMovement | null = null;
    if (delta !== 0) {
      adjMovement = {
        id: `dm-adj-${Date.now()}`,
        movementType: 'manual_adjustment',
        productId: targetProd.id,
        productName: updatedProd.name,
        quantityDelta: delta,
        stockBefore: stock.activeStock,
        stockAfter: parsedTarget,
        date,
        time,
        sourceLabel: 'Əl ilə edilən depo düzəlişi',
        note:
          params.note?.trim() ||
          `Əl ilə qalıq düzəlişi (${stock.activeStock} -> ${parsedTarget})`,
        createdBy: actor,
        createdAt: nowIso,
      };
      setDepoMovements(prev => [adjMovement!, ...prev]);
    }

    addAuditLog(
      'Depo Qalığı Düzəldildi',
      `${updatedProd.name}: ${stock.activeStock} -> ${parsedTarget} ədəd (${delta >= 0 ? `+${delta}` : delta})`
    );

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const rpcRes = await supabase.rpc('record_manual_depo_adjustment', {
          p_product_id: targetProd.id,
          p_target_active_stock: parsedTarget,
          p_date: date,
          p_time: time,
          p_note: adjMovement?.note || null,
          p_actor_username: actor,
        });
        if (rpcRes.error) {
          await supabase
            .from('products')
            .update({
              initial_stock: newInitialStock,
              barcode: updatedProd.barcode,
              sale_price: updatedProd.salePrice,
              buy_price: updatedProd.buyPrice,
            })
            .eq('id', targetProd.id);
          if (adjMovement) {
            await supabase.from('depo_movements').insert(mapDepoMovementToDB(adjMovement));
          }
        } else if (
          updatedProd.barcode !== targetProd.barcode ||
          updatedProd.salePrice !== targetProd.salePrice ||
          updatedProd.buyPrice !== targetProd.buyPrice
        ) {
          await supabase
            .from('products')
            .update({
              barcode: updatedProd.barcode,
              sale_price: updatedProd.salePrice,
              buy_price: updatedProd.buyPrice,
            })
            .eq('id', targetProd.id);
        }
      } catch (err) {
        console.warn('recordManualDepoAdjustment supabase sync warning:', err);
      }
    }

    return { success: true };
  };

  const deleteProduct = (id: string) => {
    if (currentUser?.role !== 'admin') {
      showToast('error', 'İcazə yoxdur: Yalnız Admin məhsul silə bilər!');
      return;
    }
    const target = products.find(p => p.id === id);
    setProducts(prev => prev.filter(p => p.id !== id));
    addAuditLog('Məhsul silindi', `Silinən məhsul: ${target?.name}`);

    const supabase = getSupabaseClient();
    if (supabase) {
      safeDbExec(supabase.from('products').delete().eq('id', id));
    }
  };

  // Mal qəbulu və su əlavəetmə (Həm Admin, həm də İşçi su əlavə edə bilər)
  const addPurchase = (newPur: Omit<PurchaseIntake, 'id' | 'createdAt' | 'createdBy'>) => {
    const purchase: PurchaseIntake = {
      ...newPur,
      id: `pur-${Date.now()}`,
      createdAt: new Date().toISOString(),
      createdBy: currentUser?.username || 'admin',
    };
    setPurchases(prev => [purchase, ...prev]);
    addAuditLog('Mal qəbulu daxil edildi', `${purchase.productName}: ${purchase.quantity} ədəd, ${purchase.paidAmount} AZN`);

    const supabase = getSupabaseClient();
    if (supabase) {
      safeDbExec(supabase.from('purchases').insert(mapPurchaseToDB(purchase)));
    }
  };

  const deletePurchase = (id: string) => {
    if (currentUser?.role !== 'admin') {
      showToast('error', 'İcazə yoxdur: Yalnız Admin mal qəbulunu silə bilər!');
      return;
    }
    setPurchases(prev => prev.filter(p => p.id !== id));
    addAuditLog('Mal qəbulu silindi', `Qəbul qeydi silindi ID: ${id}`);

    const supabase = getSupabaseClient();
    if (supabase) {
      safeDbExec(supabase.from('purchases').delete().eq('id', id));
    }
  };

  const getProductStock = useCallback(
    (productId: string): number => {
      const prod = products.find(p => p.id === productId);
      if (!prod) return 0;
      const stockInfo = calculateProductStock(prod, purchases, sales, settings.minStockThreshold);
      return stockInfo.activeStock;
    },
    [products, purchases, sales, settings.minStockThreshold]
  );

  const lastSaleGuardRef = React.useRef<{ sig: string; ts: number }>({ sig: '', ts: 0 });

  const upsertSaleSafe = (sale: Sale, isUpdate = false) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const run = async () => {
      const payload = mapSaleToDB(sale);
      const res = isUpdate
        ? await supabase.from('sales').update(payload).eq('id', sale.id)
        : await supabase.from('sales').insert(payload);
      if (res.error && /column/i.test(res.error.message || '')) {
        const legacy = mapSaleToLegacyDB(sale);
        if (isUpdate) {
          await supabase.from('sales').update(legacy).eq('id', sale.id);
        } else {
          await supabase.from('sales').insert(legacy);
        }
      }
    };
    safeDbExec(run());
  };

  const upsertDebtSafe = (debt: DebtRecord, isUpdate = false) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const run = async () => {
      const payload = mapDebtToDB(debt);
      const res = isUpdate
        ? await supabase.from('debts').update(payload).eq('id', debt.id)
        : await supabase.from('debts').insert(payload);
      if (res.error && /column/i.test(res.error.message || '')) {
        const legacy = mapDebtToLegacyDB(debt);
        if (isUpdate) {
          await supabase.from('debts').update(legacy).eq('id', debt.id);
        } else {
          await supabase.from('debts').insert(legacy);
        }
      }
    };
    safeDbExec(run());
  };

  const syncDailyReportsForDates = (
    targetDates: string[],
    overrideSales?: Sale[],
    overrideDebts?: DebtRecord[]
  ) => {
    const uniqueDates = Array.from(new Set(targetDates.filter(Boolean)));
    if (uniqueDates.length === 0) return;

    const activeDebts = overrideDebts || debts;
    const baseSales = overrideSales || sales;
    const reportsToPush: DailyReport[] = [];
    const nowIso = new Date().toISOString();

    setDailyReports(prev => {
      let next = [...prev];

      for (const date of uniqueDates) {
        const existing = next.find(r => r.date === date);
        const allSalesForDay = baseSales.filter(
          s => s.date === date && s.isConfirmed && s.paymentType !== 'borc' && s.paymentType !== 'balans'
        );
        const allDebtPaymentsForDay = activeDebts.flatMap(d =>
          (d.payments || []).filter(p => (p.paidAt || p.date || '').split('T')[0] === date)
        );

        let cash = allSalesForDay.filter(s => s.paymentType === 'naqd').reduce((sum, s) => sum + (Number(s.totalAmount) || 0), 0);
        let card = allSalesForDay.filter(s => s.paymentType === 'kart').reduce((sum, s) => sum + (Number(s.totalAmount) || 0), 0);
        let pos = allSalesForDay.filter(s => s.paymentType === 'pos').reduce((sum, s) => sum + (Number(s.totalAmount) || 0), 0);

        for (const p of allDebtPaymentsForDay) {
          const amt = Number(p.amount) || 0;
          const m = (p.paymentMethod || 'naqd').toLowerCase();
          if (m === 'kart') card += amt;
          else if (m === 'pos' || m === 'kocurme') pos += amt;
          else cash += amt;
        }

        cash = Math.round(cash * 100) / 100;
        card = Math.round(card * 100) / 100;
        pos = Math.round(pos * 100) / 100;
        const total = Math.round((cash + card + pos) * 100) / 100;

        if (existing) {
          const updatedReport: DailyReport = !existing.isManuallyAdjusted
            ? {
                ...existing,
                cashAmount: cash,
                cardAmount: card,
                posAmount: pos,
                totalAmount: total,
                difference: 0,
                updatedAt: nowIso,
                updatedBy: currentUser?.username || 'sistem',
              }
            : {
                ...existing,
                difference: Math.round((existing.totalAmount - total) * 100) / 100,
                updatedAt: nowIso,
              };
          next = next.map(r => (r.date === date ? updatedReport : r));
          reportsToPush.push(updatedReport);
        } else {
          const newReport: DailyReport = {
            id: `rep-${date}`,
            date,
            cashAmount: cash,
            cardAmount: card,
            posAmount: pos,
            totalAmount: total,
            isManuallyAdjusted: false,
            difference: 0,
            updatedBy: currentUser?.username || 'sistem',
            updatedAt: nowIso,
          };
          next = [newReport, ...next];
          reportsToPush.push(newReport);
        }
      }

      return next;
    });

    const supabase = getSupabaseClient();
    if (supabase && reportsToPush.length > 0) {
      safeDbExec(supabase.from('daily_reports').upsert(reportsToPush.map(mapDailyReportToDB)));
    }
  };

  const syncDailyReportForDate = (
    date: string,
    additionalSale?: Sale,
    overrideDebts?: DebtRecord[],
    overrideSales?: Sale[]
  ) => {
    const baseSales = overrideSales || sales;
    const combinedSales = additionalSale
      ? [additionalSale, ...baseSales.filter(s => s.id !== additionalSale.id)]
      : baseSales;
    syncDailyReportsForDates([date], combinedSales, overrideDebts);
  };

  const lastBalanceOpGuardRef = React.useRef<{ sig: string; ts: number }>({ sig: '', ts: 0 });
  const usedIdempotencyKeysRef = React.useRef<Set<string>>(new Set());

  const upsertCustomerAccountSafe = (acc: CustomerAccount, isUpdate = false) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const run = async () => {
      const payload = mapCustomerAccountToDB(acc);
      const res = isUpdate
        ? await supabase.from('customer_accounts').upsert(payload)
        : await supabase.from('customer_accounts').insert(payload);
      if (res.error && /column/i.test(res.error.message || '')) {
        const legacy = mapCustomerAccountToLegacyDB(acc);
        if (isUpdate) {
          await supabase.from('customer_accounts').upsert(legacy);
        } else {
          await supabase.from('customer_accounts').insert(legacy);
        }
      }
    };
    safeDbExec(run());
  };

  const openOrDepositCustomerBalance = async (
    params: OpenOrDepositBalanceParams
  ): Promise<{ success: boolean; error?: string; customerId?: string }> => {
    const cleanName = (params.customerName || '').trim();
    const round2 = (v: number) => Math.round(v * 100) / 100;
    const cleanAmount = round2(Number(params.amount) || 0);
    const method = params.paymentMethod || 'naqd';
    const date = (params.date || getTodayISODate()).split('T')[0];
    const time = params.time || getCurrentTimeHHMM();
    const actor = currentUser?.username || 'admin';
    const nowIso = new Date().toISOString();
    const idemKey = params.idempotencyKey?.trim();

    if (idemKey && usedIdempotencyKeysRef.current.has(idemKey)) {
      return { success: false, error: 'Bu əməliyyat artıq icra olunub.' };
    }

    const existing = params.customerId
      ? customerAccounts.find(c => c.id === params.customerId)
      : customerAccounts.find(c => c.name.trim().toLowerCase() === cleanName.toLowerCase());

    if (!existing && !cleanName) {
      return { success: false, error: 'Yeni balans açmaq üçün müştəri adı daxil edin!' };
    }
    if (existing && cleanAmount <= 0) {
      return { success: false, error: 'Əlavə edilən məbləğ 0-dan böyük olmalıdır!' };
    }
    if (!existing && cleanAmount < 0) {
      return { success: false, error: 'İlkin balans mənfi ola bilməz!' };
    }

    const opSig = `deposit:${existing?.id || cleanName.toLowerCase()}:${cleanAmount}:${date}:${time}`;
    const nowTs = Date.now();
    if (lastBalanceOpGuardRef.current.sig === opSig && nowTs - lastBalanceOpGuardRef.current.ts < 800) {
      return { success: false, error: 'Əməliyyat artıq icra olunur.' };
    }
    lastBalanceOpGuardRef.current = { sig: opSig, ts: nowTs };
    if (idemKey) usedIdempotencyKeysRef.current.add(idemKey);

    const txId = `ctx-${nowTs}`;
    const targetCustomerId = existing?.id || `cust-${nowTs}`;

    let updatedAcc: CustomerAccount;
    let tx: CustomerTransaction;

    if (existing) {
      const balBefore = round2(existing.balance);
      const balAfter = round2(balBefore + cleanAmount);
      tx = {
        id: txId,
        customerId: existing.id,
        customerName: existing.name,
        type: 'deposit',
        amount: cleanAmount,
        balanceBefore: balBefore,
        balanceAfter: balAfter,
        paymentMethod: method,
        date,
        time,
        note: params.note?.trim() || `Balans artırıldı (${method.toUpperCase()})`,
        createdBy: actor,
        idempotencyKey: idemKey,
        createdAt: nowIso,
      };
      updatedAcc = {
        ...existing,
        phone: params.phone?.trim() || existing.phone,
        balance: balAfter,
        totalDeposited: round2(existing.totalDeposited + cleanAmount),
        openedDate: existing.openedDate || existing.transactions?.[existing.transactions.length - 1]?.date || existing.createdAt.slice(0, 10),
        updatedAt: nowIso,
        updatedBy: actor,
        transactions: [tx, ...(existing.transactions || [])],
      };
      setCustomerAccounts(prev => prev.map(c => (c.id === existing.id ? updatedAcc : c)));
      addAuditLog('Müştəri Balansı Artırıldı', `${existing.name}: +${cleanAmount.toFixed(2)} AZN (${method.toUpperCase()}) · Tarix: ${date} ${time}`);
    } else {
      tx = {
        id: txId,
        customerId: targetCustomerId,
        customerName: cleanName,
        type: 'open',
        amount: cleanAmount,
        balanceBefore: 0,
        balanceAfter: cleanAmount,
        paymentMethod: method,
        date,
        time,
        note: params.note?.trim() || `Balans açıldı (${method.toUpperCase()})`,
        createdBy: actor,
        idempotencyKey: idemKey,
        createdAt: nowIso,
      };
      updatedAcc = {
        id: targetCustomerId,
        name: cleanName,
        phone: params.phone?.trim() || undefined,
        balance: cleanAmount,
        totalDeposited: cleanAmount,
        totalSpent: 0,
        totalWithdrawn: 0,
        openedDate: date,
        notes: params.note?.trim() || undefined,
        transactions: [tx],
        createdAt: nowIso,
        updatedAt: nowIso,
        updatedBy: actor,
      };
      setCustomerAccounts(prev => [...prev, updatedAcc]);
      addAuditLog('Yeni Müştəri Balansı Açıldı', `${cleanName}: ${cleanAmount.toFixed(2)} AZN (${method.toUpperCase()}) · Tarix: ${date} ${time}`);
    }

    playAlertSound('success');

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const rpcRes = await supabase.rpc('open_or_deposit_customer_balance', {
          p_customer_id: targetCustomerId,
          p_customer_name: updatedAcc.name,
          p_phone: updatedAcc.phone || null,
          p_amount: cleanAmount,
          p_payment_method: method,
          p_date: date,
          p_time: time,
          p_note: tx.note || null,
          p_actor_username: actor,
          p_idempotency_key: idemKey || null,
        });
        if (rpcRes.error) {
          upsertCustomerAccountSafe(updatedAcc, Boolean(existing));
          safeDbExec(supabase.from('customer_balance_transactions').insert(mapCustomerBalanceTxToDB(tx, updatedAcc.id, updatedAcc.name)));
        }
      } catch (err) {
        console.warn('openOrDepositCustomerBalance supabase warning:', err);
        upsertCustomerAccountSafe(updatedAcc, Boolean(existing));
      }
    }

    return { success: true, customerId: updatedAcc.id };
  };

  const depositToCustomer = (
    customerName: string,
    amount: number,
    paymentType: 'naqd' | 'kart' | 'pos' = 'naqd',
    note?: string
  ) => {
    void openOrDepositCustomerBalance({
      customerName,
      amount,
      paymentMethod: paymentType,
      note,
    });
  };

  const withdrawCustomerCash = async (
    params: WithdrawCustomerCashParams
  ): Promise<{ success: boolean; error?: string }> => {
    const round2 = (v: number) => Math.round(v * 100) / 100;
    const cleanAmount = round2(Number(params.amount) || 0);
    const method = params.paymentMethod || 'naqd';
    const date = (params.date || getTodayISODate()).split('T')[0];
    const time = params.time || getCurrentTimeHHMM();
    const actor = currentUser?.username || 'admin';
    const nowIso = new Date().toISOString();
    const idemKey = params.idempotencyKey?.trim();

    if (idemKey && usedIdempotencyKeysRef.current.has(idemKey)) {
      return { success: false, error: 'Bu əməliyyat artıq icra olunub.' };
    }

    const existing = customerAccounts.find(c => c.id === params.customerId);
    if (!existing) {
      return { success: false, error: 'Müştəri hesabı tapılmadı!' };
    }
    if (cleanAmount <= 0) {
      return { success: false, error: 'Çıxarılan pul məbləği 0-dan böyük olmalıdır!' };
    }
    if (existing.balance + 0.001 < cleanAmount) {
      return {
        success: false,
        error: `Balansda kifayət qədər vəsait yoxdur! Cari balans: ${existing.balance.toFixed(2)} AZN, Tələb: ${cleanAmount.toFixed(2)} AZN`,
      };
    }

    const opSig = `withdraw:${existing.id}:${cleanAmount}:${date}:${time}`;
    const nowTs = Date.now();
    if (lastBalanceOpGuardRef.current.sig === opSig && nowTs - lastBalanceOpGuardRef.current.ts < 800) {
      return { success: false, error: 'Əməliyyat artıq icra olunur.' };
    }
    lastBalanceOpGuardRef.current = { sig: opSig, ts: nowTs };
    if (idemKey) usedIdempotencyKeysRef.current.add(idemKey);

    const balBefore = round2(existing.balance);
    const balAfter = Math.max(0, round2(balBefore - cleanAmount));
    const tx: CustomerTransaction = {
      id: `ctx-${nowTs}`,
      customerId: existing.id,
      customerName: existing.name,
      type: 'withdraw',
      amount: cleanAmount,
      balanceBefore: balBefore,
      balanceAfter: balAfter,
      paymentMethod: method,
      date,
      time,
      note: params.note?.trim() || `Balansdan sərbəst pul çıxarışı (${method.toUpperCase()})`,
      createdBy: actor,
      idempotencyKey: idemKey,
      createdAt: nowIso,
    };

    const updatedAcc: CustomerAccount = {
      ...existing,
      balance: balAfter,
      totalWithdrawn: round2((existing.totalWithdrawn || 0) + cleanAmount),
      updatedAt: nowIso,
      updatedBy: actor,
      transactions: [tx, ...(existing.transactions || [])],
    };

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const rpcRes = await supabase.rpc('withdraw_customer_cash', {
          p_customer_id: existing.id,
          p_amount: cleanAmount,
          p_payment_method: method,
          p_date: date,
          p_time: time,
          p_note: tx.note || null,
          p_actor_username: actor,
          p_idempotency_key: idemKey || null,
        });
        if (rpcRes.error && !/function|does not exist|schema cache/i.test(rpcRes.error.message || '')) {
          return { success: false, error: rpcRes.error.message };
        }
        if (rpcRes.error) {
          upsertCustomerAccountSafe(updatedAcc, true);
          safeDbExec(supabase.from('customer_balance_transactions').insert(mapCustomerBalanceTxToDB(tx, existing.id, existing.name)));
        }
      } catch (err: any) {
        return { success: false, error: err?.message || 'Pul çıxarışı zamanı xəta baş verdi.' };
      }
    }

    setCustomerAccounts(prev => prev.map(c => (c.id === existing.id ? updatedAcc : c)));
    playAlertSound('success');
    addAuditLog(
      'Balansdan Sərbəst Pul Çıxarıldı',
      `${existing.name}: -${cleanAmount.toFixed(2)} AZN (${method.toUpperCase()}) · Tarix: ${date} ${time} · Qalıq: ${balAfter.toFixed(2)} AZN`
    );

    return { success: true };
  };

  const withdrawProductFromBalance = async (
    params: WithdrawProductFromBalanceParams
  ): Promise<{ success: boolean; error?: string; saleId?: string }> => {
    const round2 = (v: number) => Math.round(v * 100) / 100;
    const qty = Math.floor(Number(params.quantity) || 0);
    const date = (params.date || getTodayISODate()).split('T')[0];
    const time = params.time || getCurrentTimeHHMM();
    const actor = currentUser?.username || 'isci';
    const nowIso = new Date().toISOString();
    const idemKey = params.idempotencyKey?.trim();

    if (idemKey && usedIdempotencyKeysRef.current.has(idemKey)) {
      return { success: false, error: 'Bu əməliyyat artıq icra olunub.' };
    }
    if (qty <= 0) {
      return { success: false, error: 'Məhsul miqdarı ən azı 1 ədəd olmalıdır!' };
    }

    const existing = customerAccounts.find(c => c.id === params.customerId);
    if (!existing) {
      return { success: false, error: 'Müştəri hesabı tapılmadı!' };
    }

    const prod = products.find(p => p.id === params.productId);
    if (!prod) {
      return { success: false, error: 'Seçilən məhsul depoda tapılmadı!' };
    }

    const stockInfo = calculateProductStock(prod, purchases, sales, settings.minStockThreshold);
    if (stockInfo.activeStock < qty) {
      return {
        success: false,
        error: `"${prod.name}" üçün depoda kifayət qədər stok yoxdur! Mövcud: ${stockInfo.activeStock} əd., Tələb: ${qty} əd.`,
      };
    }

    const unitPrice = round2(Number(prod.salePrice) || 0);
    const totalAmount = round2(unitPrice * qty);
    if (existing.balance + 0.001 < totalAmount) {
      return {
        success: false,
        error: `Müştərinin balansında kifayət qədər vəsait yoxdur! Balans: ${existing.balance.toFixed(2)} AZN, Tələb: ${totalAmount.toFixed(2)} AZN`,
      };
    }

    const opSig = `product_out:${existing.id}:${prod.id}:${qty}:${date}:${time}`;
    const nowTs = Date.now();
    if (lastBalanceOpGuardRef.current.sig === opSig && nowTs - lastBalanceOpGuardRef.current.ts < 800) {
      return { success: false, error: 'Əməliyyat artıq icra olunur.' };
    }
    lastBalanceOpGuardRef.current = { sig: opSig, ts: nowTs };
    if (idemKey) usedIdempotencyKeysRef.current.add(idemKey);

    let saleId = `sale-${nowTs}`;
    let txId = `ctx-${nowTs + 1}`;
    let dmId = `dm-${nowTs + 2}`;

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const rpcRes = await supabase.rpc('withdraw_product_from_balance', {
          p_customer_id: existing.id,
          p_product_id: prod.id,
          p_quantity: qty,
          p_date: date,
          p_time: time,
          p_note: params.note?.trim() || null,
          p_actor_username: actor,
          p_idempotency_key: idemKey || null,
        });
        if (rpcRes.error && !/function|does not exist|schema cache/i.test(rpcRes.error.message || '')) {
          return { success: false, error: rpcRes.error.message };
        }
        if (!rpcRes.error && rpcRes.data && typeof rpcRes.data === 'object') {
          const dataObj = rpcRes.data as Record<string, any>;
          if (dataObj.status === 'duplicate') {
            return { success: false, error: 'Bu əməliyyat artıq icra olunub.' };
          }
          if (dataObj.sale_id) saleId = String(dataObj.sale_id);
          if (dataObj.tx_id) txId = String(dataObj.tx_id);
          if (dataObj.depo_movement_id) dmId = String(dataObj.depo_movement_id);
        }
      } catch (err: any) {
        return { success: false, error: err?.message || 'Balansdan məhsul çıxarışı icra olunmadı.' };
      }
    }

    const balBefore = round2(existing.balance);
    const balAfter = Math.max(0, round2(balBefore - totalAmount));

    const saleItem: SaleItem = {
      productId: prod.id,
      productName: prod.name,
      quantity: qty,
      unitPrice,
      totalPrice: totalAmount,
    };

    const newSale: Sale = {
      id: saleId,
      date,
      time,
      items: [saleItem],
      subtotalAmount: totalAmount,
      discountAmount: 0,
      totalAmount,
      paymentType: 'balans',
      debtorName: existing.name,
      originalDate: date,
      isConfirmed: true,
      confirmedAt: nowIso,
      confirmedBy: actor,
      createdAt: nowIso,
      createdBy: actor,
    };

    const tx: CustomerTransaction = {
      id: txId,
      customerId: existing.id,
      customerName: existing.name,
      type: 'product_out',
      amount: totalAmount,
      balanceBefore: balBefore,
      balanceAfter: balAfter,
      paymentMethod: 'balans',
      productId: prod.id,
      productName: prod.name,
      quantity: qty,
      unitPrice,
      items: [saleItem],
      saleId,
      date,
      time,
      note: params.note?.trim() || `${prod.name} × ${qty} əd. (${unitPrice.toFixed(2)} AZN)`,
      createdBy: actor,
      idempotencyKey: idemKey,
      createdAt: nowIso,
    };

    const updatedAcc: CustomerAccount = {
      ...existing,
      balance: balAfter,
      totalSpent: round2(existing.totalSpent + totalAmount),
      updatedAt: nowIso,
      updatedBy: actor,
      transactions: [tx, ...(existing.transactions || [])],
    };

    const dm: DepoMovement = {
      id: dmId,
      movementType: 'balance_product_out',
      productId: prod.id,
      productName: prod.name,
      quantityDelta: -qty,
      stockBefore: stockInfo.activeStock,
      stockAfter: stockInfo.activeStock - qty,
      unitPrice,
      totalAmount,
      customerName: existing.name,
      referenceId: saleId,
      date,
      time,
      sourceLabel: 'Müştəri balansından çıxarış',
      note: `${existing.name} · Müştəri balansından çıxarış`,
      createdBy: actor,
      idempotencyKey: idemKey,
      createdAt: nowIso,
    };

    const updatedSales = [newSale, ...sales];
    setSales(updatedSales);
    setCustomerAccounts(prev => prev.map(c => (c.id === existing.id ? updatedAcc : c)));
    setDepoMovements(prev => [dm, ...prev]);

    // Fallback direct writes if RPC wasn't present
    if (supabase) {
      upsertSaleSafe(newSale, false);
      upsertCustomerAccountSafe(updatedAcc, true);
      safeDbExec(supabase.from('customer_balance_transactions').insert(mapCustomerBalanceTxToDB(tx, existing.id, existing.name)));
      safeDbExec(supabase.from('depo_movements').insert(mapDepoMovementToDB(dm)));
    }

    if (settings.enablePushNotifications) {
      const nextStock = stockInfo.activeStock - qty;
      if (nextStock <= (prod.minStockAlert ?? settings.minStockThreshold)) {
        sendLowStockNotification(prod.name, nextStock, settings.minStockThreshold);
      }
    }

    playAlertSound('success');
    addAuditLog(
      'Balansdan Məhsul Çıxarıldı',
      `${existing.name}: ${prod.name} × ${qty} (${totalAmount.toFixed(2)} AZN) · Depo: ${stockInfo.activeStock} -> ${stockInfo.activeStock - qty} · Balans qalığı: ${balAfter.toFixed(2)} AZN`
    );

    return { success: true, saleId };
  };

  const adjustCustomerBalance = async (
    params: AdjustCustomerBalanceParams
  ): Promise<{ success: boolean; error?: string }> => {
    if (currentUser?.role !== 'admin') {
      return { success: false, error: 'İcazə yoxdur: Yalnız Admin müştəri balansını redaktə edə bilər!' };
    }
    const existing = customerAccounts.find(c => c.id === params.customerId);
    if (!existing) {
      return { success: false, error: 'Müştəri hesabı tapılmadı!' };
    }

    const round2 = (v: number) => Math.round(v * 100) / 100;
    const actor = currentUser?.username || 'admin';
    const nowIso = new Date().toISOString();
    const date = (params.date || getTodayISODate()).split('T')[0];
    const time = params.time || getCurrentTimeHHMM();
    const cleanName = params.name?.trim() || existing.name;

    let nextBalance = existing.balance;
    let nextTransactions = existing.transactions || [];
    let adjustmentTx: CustomerTransaction | null = null;

    if (params.newBalance !== undefined && Number.isFinite(params.newBalance)) {
      const targetBal = Math.max(0, round2(params.newBalance));
      const delta = round2(targetBal - existing.balance);
      if (Math.abs(delta) >= 0.01) {
        if (!params.reason || !params.reason.trim()) {
          return { success: false, error: 'Balans dəyişikliyi üçün səbəb/qeyd daxil edin!' };
        }
        nextBalance = targetBal;
        adjustmentTx = {
          id: `ctx-${Date.now()}`,
          customerId: existing.id,
          customerName: cleanName,
          type: 'adjustment',
          amount: Math.abs(delta),
          balanceBefore: existing.balance,
          balanceAfter: targetBal,
          adjustmentDirection: delta > 0 ? 'increase' : 'decrease',
          date,
          time,
          note: params.reason.trim(),
          createdBy: actor,
          createdAt: nowIso,
        };
        nextTransactions = [adjustmentTx, ...nextTransactions];
      }
    }

    const updatedAcc: CustomerAccount = {
      ...existing,
      name: cleanName,
      phone: params.phone !== undefined ? params.phone.trim() || undefined : existing.phone,
      notes: params.notes !== undefined ? params.notes.trim() || undefined : existing.notes,
      balance: nextBalance,
      transactions: nextTransactions,
      updatedAt: nowIso,
      updatedBy: actor,
    };

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const rpcRes = await supabase.rpc('adjust_customer_balance', {
          p_customer_id: existing.id,
          p_name: cleanName,
          p_phone: updatedAcc.phone ?? '',
          p_notes: updatedAcc.notes ?? '',
          p_new_balance: params.newBalance !== undefined ? nextBalance : null,
          p_reason: params.reason?.trim() || null,
          p_date: date,
          p_time: time,
          p_actor_username: actor,
        });
        if (rpcRes.error && !/function|does not exist|schema cache/i.test(rpcRes.error.message || '')) {
          return { success: false, error: rpcRes.error.message };
        }
        if (rpcRes.error) {
          upsertCustomerAccountSafe(updatedAcc, true);
          if (adjustmentTx) {
            safeDbExec(supabase.from('customer_balance_transactions').insert(mapCustomerBalanceTxToDB(adjustmentTx, existing.id, cleanName)));
          }
        }
      } catch (err: any) {
        return { success: false, error: err?.message || 'Redaktə zamanı xəta baş verdi.' };
      }
    }

    setCustomerAccounts(prev => prev.map(c => (c.id === existing.id ? updatedAcc : c)));
    addAuditLog(
      'Müştəri Balansı Redaktə Edildi',
      `${cleanName}: Balans ${existing.balance.toFixed(2)} -> ${nextBalance.toFixed(2)} AZN${adjustmentTx ? ` (${adjustmentTx.note})` : ''}`
    );

    return { success: true };
  };

  const chargeCustomerBalance = (
    customerName: string,
    amount: number,
    note?: string,
    saleId?: string,
    customDate?: string,
    customTime?: string,
    items?: SaleItem[]
  ): boolean => {
    const cleanName = customerName.trim();
    const existing = customerAccounts.find(c => c.name.toLowerCase() === cleanName.toLowerCase());
    if (!existing) {
      return false;
    }

    const round2 = (v: number) => Math.round(v * 100) / 100;
    const date = (customDate || getTodayISODate()).split('T')[0];
    const time = customTime || getCurrentTimeHHMM();
    const actor = currentUser?.username || 'isci';
    const nowIso = new Date().toISOString();
    const balBefore = round2(existing.balance);
    const newBalance = Math.max(0, round2(balBefore - amount));
    const singleItem = items && items.length === 1 ? items[0] : undefined;

    const tx: CustomerTransaction = {
      id: `ctx-${Date.now()}`,
      customerId: existing.id,
      customerName: existing.name,
      type: items && items.length > 0 ? 'product_out' : 'charge',
      amount: round2(amount),
      balanceBefore: balBefore,
      balanceAfter: newBalance,
      paymentMethod: 'balans',
      productId: singleItem?.productId,
      productName: singleItem?.productName || (items && items.length > 1 ? items.map(i => `${i.productName} ×${i.quantity}`).join(', ') : undefined),
      quantity: singleItem?.quantity,
      unitPrice: singleItem?.unitPrice,
      items,
      date,
      time,
      note:
        note ||
        (items && items.length > 0
          ? items.map(i => `${i.productName} × ${i.quantity}`).join(', ')
          : 'Bar alış-verişi (Balansdan çıxılma)'),
      saleId,
      createdBy: actor,
      createdAt: nowIso,
    };

    const newAcc: CustomerAccount = {
      ...existing,
      balance: newBalance,
      totalSpent: round2(existing.totalSpent + amount),
      updatedAt: nowIso,
      updatedBy: actor,
      transactions: [tx, ...(existing.transactions || [])],
    };

    setCustomerAccounts(prev => prev.map(c => (c.id === existing.id ? newAcc : c)));

    const supabase = getSupabaseClient();
    if (supabase) {
      upsertCustomerAccountSafe(newAcc, true);
      safeDbExec(supabase.from('customer_balance_transactions').insert(mapCustomerBalanceTxToDB(tx, existing.id, existing.name)));
    }

    addAuditLog('Balansdan Çıxıldı', `${cleanName}: -${amount.toFixed(2)} AZN (Qalıq balans: ${newBalance.toFixed(2)} AZN)`);
    return true;
  };

  const deleteCustomerAccount = (customerId: string) => {
    if (currentUser?.role !== 'admin') {
      showToast('error', 'İcazə yoxdur: Yalnız Admin müştəri hesabını silə bilər!');
      return;
    }
    const target = customerAccounts.find(c => c.id === customerId);
    setCustomerAccounts(prev => prev.filter(c => c.id !== customerId));
    addAuditLog('Müştəri Hesabı Silindi', `Silinən: ${target?.name}`);

    const supabase = getSupabaseClient();
    if (supabase) {
      safeDbExec(supabase.from('customer_accounts').delete().eq('id', customerId));
    }
  };

  const addSale = (saleData: {
    items: { productId: string; quantity: number }[];
    paymentType: Sale['paymentType'];
    debtorName?: string;
    debtorPhone?: string;
    discountAmount?: number;
    customDate?: string;
    customTime?: string;
  }): { success: boolean; saleId?: string; error?: string } => {
    if (!saleData.items || saleData.items.length === 0) {
      return { success: false, error: 'Səbət boşdur!' };
    }

    // Consolidate duplicate product lines to prevent double counting / validation gaps
    const consolidatedQty: Record<string, number> = {};
    for (const it of saleData.items) {
      const q = Math.floor(Number(it.quantity) || 0);
      if (q > 0 && it.productId) {
        consolidatedQty[it.productId] = (consolidatedQty[it.productId] || 0) + q;
      }
    }

    const entries = Object.entries(consolidatedQty);
    if (entries.length === 0) {
      return { success: false, error: 'Etibarlı məhsul və ya say daxil edilməyib!' };
    }

    // Guard against rapid accidental double click (identical payload within 700ms)
    const saleSig = JSON.stringify({ entries, pt: saleData.paymentType, dn: saleData.debtorName, d: saleData.customDate });
    const nowTs = Date.now();
    if (lastSaleGuardRef.current.sig === saleSig && nowTs - lastSaleGuardRef.current.ts < 700) {
      return { success: false, error: 'Əməliyyat artıq icra olunur.' };
    }

    const resolvedItems: Sale['items'] = [];
    let subtotalAmount = 0;

    for (const [productId, quantity] of entries) {
      const prod = products.find(p => p.id === productId);
      if (!prod) continue;

      const stockInfo = calculateProductStock(prod, purchases, sales, settings.minStockThreshold);
      if (stockInfo.activeStock < quantity) {
        return {
          success: false,
          error: `"${prod.name}" üçün anbar qalığı kifayət deyil! Mövcud stok: ${stockInfo.activeStock}, Tələb: ${quantity}`,
        };
      }

      const unitPrice = prod.salePrice;
      const itemTotal = Math.round(unitPrice * quantity * 100) / 100;
      subtotalAmount += itemTotal;
      resolvedItems.push({
        productId: prod.id,
        productName: prod.name,
        quantity,
        unitPrice,
        totalPrice: itemTotal,
      });
    }

    subtotalAmount = Math.round(subtotalAmount * 100) / 100;

    if (resolvedItems.length === 0) {
      return { success: false, error: 'Məhsul tapılmadı!' };
    }

    const rawDiscount = Math.max(0, Number(saleData.discountAmount) || 0);
    const discountAmount = Math.min(subtotalAmount, Math.round(rawDiscount * 100) / 100);
    const totalAmount = Math.max(0, Math.round((subtotalAmount - discountAmount) * 100) / 100);

    if (saleData.paymentType === 'borc' && !(saleData.debtorName || '').trim()) {
      return { success: false, error: 'Nisyə satış üçün borclunun ad və soyadı mütləqdir!' };
    }

    const date = (saleData.customDate || getTodayISODate()).split('T')[0];
    const time = saleData.customTime || getCurrentTimeHHMM();
    const nowIso = new Date().toISOString();
    const saleId = `sale-${nowTs}`;

    // If payment type is 'balans', check customer account and deduct funds
    if (saleData.paymentType === 'balans') {
      const custName = (saleData.debtorName || '').trim();
      if (!custName) {
        return { success: false, error: 'Müştəri hesabı seçilməyib!' };
      }
      const existing = customerAccounts.find(c => c.name.toLowerCase() === custName.toLowerCase());
      if (!existing) {
        return { success: false, error: `"${custName}" adlı müştəri hesabı tapılmadı!` };
      }
      if (existing.balance < totalAmount) {
        return {
          success: false,
          error: `Balansda kifayət qədər vəsait yoxdur! Cari balans: ${existing.balance.toFixed(2)} AZN, Tələb olunan: ${totalAmount.toFixed(2)} AZN`,
        };
      }
      chargeCustomerBalance(
        custName,
        totalAmount,
        resolvedItems.map(i => `${i.productName} × ${i.quantity}`).join(', '),
        saleId,
        date,
        time,
        resolvedItems
      );
    }

    lastSaleGuardRef.current = { sig: saleSig, ts: nowTs };

    // Credit sales & Balance product withdrawals are immediately confirmed so stock & reports reflect right away
    const isConfirmed =
      saleData.paymentType === 'borc' || saleData.paymentType === 'balans'
        ? true
        : settings.autoConfirmSales;
    const cleanDebtorName = saleData.debtorName?.trim() || undefined;
    const cleanDebtorPhone = saleData.debtorPhone?.trim() || undefined;

    const newSale: Sale = {
      id: saleId,
      date,
      time,
      items: resolvedItems,
      subtotalAmount,
      discountAmount,
      totalAmount,
      paymentType: saleData.paymentType,
      debtorName:
        saleData.paymentType === 'borc'
          ? (cleanDebtorName || 'Adsız borclu')
          : saleData.paymentType === 'balans'
          ? (cleanDebtorName || 'Müştəri')
          : undefined,
      debtorPhone: saleData.paymentType === 'borc' ? cleanDebtorPhone : undefined,
      originalDate: date,
      isConfirmed,
      confirmedAt: isConfirmed ? nowIso : undefined,
      confirmedBy: isConfirmed ? (currentUser?.username || 'sistem') : undefined,
      createdAt: nowIso,
      createdBy: currentUser?.username || 'isci',
    };

    const updatedSales = [newSale, ...sales];
    setSales(updatedSales);

    // If payment type is BORC, automatically create a DebtRecord linked to this Sale
    let createdDebt: DebtRecord | null = null;
    if (saleData.paymentType === 'borc' && cleanDebtorName) {
      createdDebt = {
        id: `debt-${nowTs}`,
        debtorName: cleanDebtorName,
        debtorPhone: cleanDebtorPhone,
        items: resolvedItems.map(i => ({
          productName: i.productName,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
        })),
        totalAmount,
        paidAmount: 0,
        remainingAmount: totalAmount,
        date,
        status: 'borcdadir',
        saleId,
        notes: discountAmount > 0 ? `Endirim tətbiq edilib: ${discountAmount.toFixed(2)} AZN` : undefined,
        payments: [],
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      const nextDebts = [createdDebt, ...debts];
      setDebts(nextDebts);
      syncDailyReportsForDates([date], updatedSales, nextDebts);
    } else if (isConfirmed && saleData.paymentType !== 'balans') {
      syncDailyReportsForDates([date], updatedSales, debts);
    }

    // CHECK STOCK & TRIGGER BROWSER PUSH NOTIFICATION IF STOCK <= THRESHOLD!
    if (settings.enablePushNotifications) {
      for (const item of resolvedItems) {
        const prod = products.find(p => p.id === item.productId);
        if (prod) {
          const stockInfo = calculateProductStock(prod, purchases, updatedSales, settings.minStockThreshold);
          if (stockInfo.isLowStock) {
            sendLowStockNotification(prod.name, stockInfo.activeStock, settings.minStockThreshold);
          }
        }
      }
    }

    playAlertSound('success');

    addAuditLog(
      'Yeni Satış',
      `Tarix: ${date} | Məbləğ: ${totalAmount.toFixed(2)} AZN${discountAmount > 0 ? ` (Endirim: ${discountAmount.toFixed(2)} AZN)` : ''}, Ödəniş: ${saleData.paymentType.toUpperCase()}${cleanDebtorName ? `, Müştəri: ${cleanDebtorName}` : ''}`
    );

    upsertSaleSafe(newSale, false);
    if (createdDebt) {
      upsertDebtSafe(createdDebt, false);
    }

    return { success: true, saleId };
  };

  const updateSaleDate = (
    saleId: string,
    newDate: string,
    newTime?: string
  ): { success: boolean; error?: string } => {
    const cleanNewDate = (newDate || '').trim().split('T')[0];
    if (!cleanNewDate || !/^\d{4}-\d{2}-\d{2}$/.test(cleanNewDate)) {
      return { success: false, error: 'Düzgün tarix formatı seçin (YYYY-MM-DD).' };
    }

    const target = sales.find(s => s.id === saleId);
    if (!target) {
      return { success: false, error: 'Satış qeydi tapılmadı.' };
    }

    const oldDate = target.date;
    const targetTime = (newTime || target.time || getCurrentTimeHHMM()).trim();
    if (oldDate === cleanNewDate && targetTime === target.time) {
      return { success: true };
    }

    const nowIso = new Date().toISOString();
    const updatedSale: Sale = {
      ...target,
      date: cleanNewDate,
      time: targetTime,
      originalDate: target.originalDate || oldDate,
      dateChangedAt: oldDate !== cleanNewDate ? nowIso : target.dateChangedAt,
      updatedAt: nowIso,
    };

    const nextSales = sales.map(s => (s.id === saleId ? updatedSale : s));
    setSales(nextSales);

    // If credit sale has linked DebtRecord, move its creation/report date cleanly without modifying payments
    let nextDebts = debts;
    const linkedDebt = debts.find(d => d.saleId === saleId);
    if (linkedDebt && oldDate !== cleanNewDate) {
      const updatedDebt: DebtRecord = {
        ...linkedDebt,
        date: cleanNewDate,
        updatedAt: nowIso,
      };
      nextDebts = debts.map(d => (d.id === linkedDebt.id ? updatedDebt : d));
      setDebts(nextDebts);
      upsertDebtSafe(updatedDebt, true);
    }

    syncDailyReportsForDates([oldDate, cleanNewDate], nextSales, nextDebts);
    upsertSaleSafe(updatedSale, true);

    addAuditLog(
      'Satış Tarixi Dəyişdirildi',
      `Satış #${saleId}: ${oldDate} (${target.time}) → ${cleanNewDate} (${targetTime}). Faktiki daxilolma: ${new Date(target.createdAt).toLocaleString('az-AZ')}`
    );

    showToast('success', `Satış tarixi yeniləndi: ${oldDate} → ${cleanNewDate}`);
    return { success: true };
  };

  const confirmSale = (saleId: string) => {
    const target = sales.find(s => s.id === saleId);
    if (!target) return;

    const updatedSale: Sale = {
      ...target,
      isConfirmed: true,
      confirmedAt: new Date().toISOString(),
      confirmedBy: currentUser?.username || 'admin',
    };
    const nextSales = sales.map(s => (s.id === saleId ? updatedSale : s));
    setSales(nextSales);
    syncDailyReportsForDates([updatedSale.date], nextSales, debts);

    const supabase = getSupabaseClient();
    if (supabase) {
      safeDbExec(
        supabase
          .from('sales')
          .update({
            is_confirmed: true,
            confirmed_at: updatedSale.confirmedAt,
            confirmed_by: updatedSale.confirmedBy,
          })
          .eq('id', saleId)
      );
    }

    addAuditLog('Satış Təsdiqləndi', `Satış ID: ${saleId} təsdiqləndi.`);
  };

  const confirmDaySales = (date: string) => {
    const supabase = getSupabaseClient();
    const nextSales = sales.map(s => {
      if (s.date === date && !s.isConfirmed) {
        const updated: Sale = {
          ...s,
          isConfirmed: true,
          confirmedAt: new Date().toISOString(),
          confirmedBy: currentUser?.username || 'admin',
        };
        if (supabase) {
          safeDbExec(
            supabase
              .from('sales')
              .update({
                is_confirmed: true,
                confirmed_at: updated.confirmedAt,
                confirmed_by: updated.confirmedBy,
              })
              .eq('id', s.id)
          );
        }
        return updated;
      }
      return s;
    });
    setSales(nextSales);
    syncDailyReportsForDates([date], nextSales, debts);
    addAuditLog('Günlük Satışlar Təsdiqləndi', `${date} tarixinə aid satışlar təsdiqləndi.`);
  };

  // Yalnız Admin satışları silə bilər (İşçi Admin məlumatlarını silə bilməz)
  const deleteSale = (saleId: string) => {
    if (currentUser?.role !== 'admin') {
      showToast('error', 'İcazə yoxdur: Yalnız Admin satışları silə bilər!');
      return;
    }
    const targetSale = sales.find(x => x.id === saleId);
    const nextSales = sales.filter(x => x.id !== saleId);
    setSales(nextSales);

    // If an unpaid credit sale is deleted, also remove its linked unpaid debt record to stay consistent
    let nextDebts = debts;
    const linkedUnpaidDebt = debts.find(
      d => d.saleId === saleId && (Number(d.paidAmount) || 0) === 0
    );
    const supabase = getSupabaseClient();
    if (linkedUnpaidDebt) {
      nextDebts = debts.filter(d => d.id !== linkedUnpaidDebt.id);
      setDebts(nextDebts);
      if (supabase) {
        safeDbExec(supabase.from('debts').delete().eq('id', linkedUnpaidDebt.id));
      }
    }

    if (targetSale) {
      syncDailyReportsForDates([targetSale.date], nextSales, nextDebts);
    }
    addAuditLog('Satış Silindi', `Satış ID: ${saleId} silindi və anbar qalığı bərpa edildi.`);

    if (supabase) {
      safeDbExec(supabase.from('sales').delete().eq('id', saleId));
    }
    showToast('info', 'Satış ləğv edildi və məhsul stoku bərpa olundu.');
  };

  const addDebt = (
    newDebt: Omit<DebtRecord, 'id' | 'createdAt' | 'updatedAt' | 'payments' | 'remainingAmount' | 'status'> & {
      productId?: string;
      quantity?: number;
    }
  ): { success: boolean; error?: string } => {
    const cleanName = (newDebt.debtorName || '').trim();
    if (!cleanName) {
      return { success: false, error: 'Borclunun adı və soyadı daxil edilməlidir.' };
    }

    const total = Math.max(0, Math.round((Number(newDebt.totalAmount) || 0) * 100) / 100);
    if (total <= 0) {
      return { success: false, error: 'Borc məbləği 0-dan böyük olmalıdır.' };
    }

    const nowTs = Date.now();
    const nowIso = new Date().toISOString();
    const cleanDate = (newDebt.date || getTodayISODate()).split('T')[0];
    const cleanPhone = newDebt.debtorPhone?.trim() || undefined;
    const paid = Math.min(total, Math.max(0, Math.round((Number(newDebt.paidAmount) || 0) * 100) / 100));
    const remaining = Math.max(0, Math.round((total - paid) * 100) / 100);
    const status: DebtRecord['status'] = remaining <= 0 ? 'odanilib' : paid > 0 ? 'qismen' : 'borcdadir';

    let linkedSale: Sale | null = null;
    if (newDebt.productId) {
      const prod = products.find(p => p.id === newDebt.productId);
      const qty = Math.max(1, Math.floor(Number(newDebt.quantity) || 1));
      if (prod) {
        const stockInfo = calculateProductStock(prod, purchases, sales, settings.minStockThreshold);
        if (stockInfo.activeStock < qty) {
          return {
            success: false,
            error: `"${prod.name}" üçün stok kifayət deyil (Qalıq: ${stockInfo.activeStock}, Tələb: ${qty}).`,
          };
        }
        const saleId = `sale-${nowTs}`;
        linkedSale = {
          id: saleId,
          date: cleanDate,
          time: getCurrentTimeHHMM(),
          items: [
            {
              productId: prod.id,
              productName: prod.name,
              quantity: qty,
              unitPrice: prod.salePrice,
              totalPrice: total,
            },
          ],
          subtotalAmount: Math.round(prod.salePrice * qty * 100) / 100,
          discountAmount: Math.max(0, Math.round((prod.salePrice * qty - total) * 100) / 100),
          totalAmount: total,
          paymentType: 'borc',
          debtorName: cleanName,
          debtorPhone: cleanPhone,
          originalDate: cleanDate,
          isConfirmed: true,
          confirmedAt: nowIso,
          confirmedBy: currentUser?.username || 'admin',
          createdAt: nowIso,
          createdBy: currentUser?.username || 'admin',
        };
      }
    }

    const debtId = `debt-${nowTs}`;
    const initialPayments: DebtPayment[] =
      paid > 0
        ? [
            {
              id: `pay-${nowTs}`,
              debtId,
              date: cleanDate,
              paidAt: cleanDate,
              amount: paid,
              paymentMethod: 'naqd',
              receivedBy: currentUser?.username || 'admin',
              note: 'İlkin ödəniş',
              createdAt: nowIso,
            },
          ]
        : [];

    const debt: DebtRecord = {
      id: debtId,
      debtorName: cleanName,
      debtorPhone: cleanPhone,
      items: newDebt.items,
      totalAmount: total,
      paidAmount: paid,
      remainingAmount: remaining,
      date: cleanDate,
      status,
      saleId: linkedSale?.id,
      notes: newDebt.notes,
      payments: initialPayments,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const nextSales = linkedSale ? [linkedSale, ...sales] : sales;
    const nextDebts = [debt, ...debts];
    if (linkedSale) {
      setSales(nextSales);
      upsertSaleSafe(linkedSale, false);
    }
    setDebts(nextDebts);
    upsertDebtSafe(debt, false);

    if (initialPayments.length > 0) {
      const supabase = getSupabaseClient();
      if (supabase) {
        safeDbExec(supabase.from('debt_payments').insert(mapDebtPaymentToDB({ ...initialPayments[0], debtId })));
      }
      syncDailyReportsForDates([cleanDate], nextSales, nextDebts);
    }

    addAuditLog(
      'Borc Qeydi Əlavə Edildi',
      `${debt.debtorName}${cleanPhone ? ` (${cleanPhone})` : ''}: ${debt.totalAmount.toFixed(2)} AZN${linkedSale ? ' (Stokdan çıxıldı)' : ''}`
    );
    showToast('success', `${cleanName} üçün borc qeydi əlavə edildi.`);
    return { success: true };
  };

  const acceptDebtPayment = async (
    params: AcceptDebtPaymentParams
  ): Promise<{ success: boolean; error?: string }> => {
    const cleanAmount = Math.round((Number(params.amount) || 0) * 100) / 100;
    const targetDebt = debts.find(d => d.id === params.debtId);

    if (!targetDebt) {
      return { success: false, error: 'Borc qeydi tapılmadı.' };
    }
    if (cleanAmount <= 0) {
      return { success: false, error: 'Ödəniş məbləği sıfırdan böyük olmalıdır.' };
    }
    if (cleanAmount > Math.round(targetDebt.remainingAmount * 100) / 100 + 0.001) {
      return {
        success: false,
        error: `Ödəniş qalıq borcdan (${targetDebt.remainingAmount.toFixed(2)} ₼) çox ola bilməz.`,
      };
    }

    const paidDate = (params.date || getTodayISODate()).split('T')[0];
    const receiver = (params.receivedBy || currentUser?.username || 'isci').trim();
    const method: DebtPaymentMethod = params.paymentMethod || 'naqd';
    const paymentId = `pay-${Date.now()}`;
    const nowIso = new Date().toISOString();

    const newPayment: DebtPayment = {
      id: paymentId,
      debtId: targetDebt.id,
      date: paidDate,
      paidAt: paidDate,
      amount: cleanAmount,
      paymentMethod: method,
      receivedBy: receiver,
      note: params.note?.trim() || 'Yerindəcə borc ödənişi',
      createdAt: nowIso,
    };

    const newPaid = Math.min(
      targetDebt.totalAmount,
      Math.round((targetDebt.paidAmount + cleanAmount) * 100) / 100
    );
    const newRemaining = Math.max(0, Math.round((targetDebt.totalAmount - newPaid) * 100) / 100);
    const newStatus: DebtRecord['status'] =
      newRemaining <= 0 ? 'odanilib' : newPaid > 0 ? 'qismen' : 'borcdadir';

    const updatedDebt: DebtRecord = {
      ...targetDebt,
      paidAmount: newPaid,
      remainingAmount: newRemaining,
      status: newStatus,
      payments: [newPayment, ...(targetDebt.payments || [])],
      updatedAt: nowIso,
    };

    const nextDebts = debts.map(d => (d.id === targetDebt.id ? updatedDebt : d));
    setDebts(nextDebts);
    syncDailyReportForDate(paidDate, undefined, nextDebts);

    playAlertSound('success');
    addAuditLog(
      'Borc Ödənişi Qəbul Edildi',
      `${targetDebt.debtorName}: +${cleanAmount.toFixed(2)} AZN (${method.toUpperCase()}) · Məsul: ${receiver}`
    );

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const rpcRes = await supabase.rpc('accept_debt_payment', {
          p_debt_id: targetDebt.id,
          p_amount: cleanAmount,
          p_payment_method: method,
          p_received_by: receiver,
          p_paid_at: paidDate,
          p_note: newPayment.note || null,
          p_payment_id: paymentId,
        });
        if (rpcRes.error) {
          // Fallback to direct table updates if RPC is not yet deployed
          await Promise.all([
            supabase.from('debt_payments').insert(mapDebtPaymentToDB({ ...newPayment, debtId: targetDebt.id })),
            supabase.from('debts').update(mapDebtToDB(updatedDebt)).eq('id', targetDebt.id),
          ]);
        }
      } catch (err) {
        console.warn('acceptDebtPayment supabase sync warning:', err);
      }
    }

    showToast(
      'success',
      `${targetDebt.debtorName} üçün ${cleanAmount.toFixed(2)} ₼ borc ödənişi qəbul edildi.`
    );
    return { success: true };
  };

  const payDebt = (debtId: string, amount: number, note?: string) => {
    void acceptDebtPayment({
      debtId,
      amount,
      paymentMethod: 'naqd',
      receivedBy: currentUser?.username || 'admin',
      date: getTodayISODate(),
      note,
    });
  };

  const deleteDebtPayment = async (
    debtId: string,
    paymentId: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (currentUser?.role !== 'admin') {
      return { success: false, error: 'Yalnız Admin borc ödənişini silə bilər.' };
    }

    const targetDebt = debts.find(d => d.id === debtId);
    if (!targetDebt) {
      return { success: false, error: 'Borc qeydi tapılmadı.' };
    }

    const targetPayment = targetDebt.payments.find(p => p.id === paymentId);
    if (!targetPayment) {
      return { success: false, error: 'Ödəniş qeydi tapılmadı.' };
    }

    const remainingPayments = targetDebt.payments.filter(p => p.id !== paymentId);
    const recalculatedPaid = Math.min(
      targetDebt.totalAmount,
      Math.round(remainingPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0) * 100) / 100
    );
    const recalculatedRemaining = Math.max(
      0,
      Math.round((targetDebt.totalAmount - recalculatedPaid) * 100) / 100
    );
    const recalculatedStatus: DebtRecord['status'] =
      recalculatedRemaining <= 0 ? 'odanilib' : recalculatedPaid > 0 ? 'qismen' : 'borcdadir';

    const updatedDebt: DebtRecord = {
      ...targetDebt,
      paidAmount: recalculatedPaid,
      remainingAmount: recalculatedRemaining,
      status: recalculatedStatus,
      payments: remainingPayments,
      updatedAt: new Date().toISOString(),
    };

    const nextDebts = debts.map(d => (d.id === debtId ? updatedDebt : d));
    setDebts(nextDebts);
    const paidDate = (targetPayment.paidAt || targetPayment.date || getTodayISODate()).split('T')[0];
    syncDailyReportForDate(paidDate, undefined, nextDebts);

    addAuditLog(
      'Borc Ödənişi Silindi',
      `${targetDebt.debtorName}: -${Number(targetPayment.amount).toFixed(2)} AZN ödəniş ləğv edildi.`
    );

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const rpcRes = await supabase.rpc('delete_debt_payment', {
          p_payment_id: paymentId,
          p_actor_username: currentUser.username,
        });
        if (rpcRes.error) {
          await Promise.all([
            supabase.from('debt_payments').delete().eq('id', paymentId),
            supabase.from('debts').update(mapDebtToDB(updatedDebt)).eq('id', debtId),
          ]);
        }
      } catch (err) {
        console.warn('deleteDebtPayment supabase sync warning:', err);
      }
    }

    showToast('info', 'Borc ödənişi qeydi silindi.');
    return { success: true };
  };

  const saveDailyReport = (report: {
    date: string;
    cashAmount: number;
    cardAmount: number;
    posAmount: number;
    notes?: string;
  }) => {
    const total = Math.round((Number(report.cashAmount) + Number(report.cardAmount) + Number(report.posAmount)) * 100) / 100;
    const daySales = sales.filter(
      s => s.date === report.date && s.isConfirmed && s.paymentType !== 'borc' && s.paymentType !== 'balans'
    );
    const salesTotal = daySales.reduce((sum, s) => sum + s.totalAmount, 0);
    const debtCollectedTotal = debts
      .flatMap(d => d.payments || [])
      .filter(p => (p.paidAt || p.date || '').split('T')[0] === report.date)
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    const expectedTotal = salesTotal + debtCollectedTotal;
    const difference = Math.round((total - expectedTotal) * 100) / 100;

    const fullReport: DailyReport = {
      ...report,
      id: `rep-${report.date}`,
      totalAmount: total,
      difference,
      isManuallyAdjusted: true,
      updatedBy: currentUser?.username || 'istifadəçi',
      updatedAt: new Date().toISOString(),
    };

    setDailyReports(prev => {
      const index = prev.findIndex(r => r.date === report.date);
      if (index >= 0) {
        const copy = [...prev];
        copy[index] = fullReport;
        return copy;
      }
      return [fullReport, ...prev];
    });

    addAuditLog('Gündəlik Hesabat Saxlanıldı', `${report.date}: Cəm ${total.toFixed(2)} AZN.`);

    const supabase = getSupabaseClient();
    if (supabase) {
      safeDbExec(supabase.from('daily_reports').upsert(mapDailyReportToDB(fullReport)));
    }
    showToast('success', `${report.date} tarixli günlük kassa hesabatı saxlanıldı.`);
  };

  const addExpense = (newExp: Omit<Expense, 'id' | 'createdAt' | 'createdBy'>) => {
    if (currentUser?.role !== 'admin') {
      showToast('error', 'İcazə yoxdur: Yalnız Admin xərc daxil edə bilər!');
      return;
    }
    const expense: Expense = {
      ...newExp,
      id: `exp-${Date.now()}`,
      createdAt: new Date().toISOString(),
      createdBy: currentUser?.username || 'admin',
    };
    setExpenses(prev => [expense, ...prev]);
    addAuditLog('Xərc Əlavə Edildi', `${expense.category}: ${expense.amount} AZN (${expense.note || ''})`);

    const supabase = getSupabaseClient();
    if (supabase) {
      safeDbExec(supabase.from('expenses').insert(mapExpenseToDB(expense)));
    }
  };

  const deleteExpense = (id: string) => {
    if (currentUser?.role !== 'admin') {
      showToast('error', 'İcazə yoxdur: Yalnız Admin xərcləri silə bilər!');
      return;
    }
    setExpenses(prev => prev.filter(e => e.id !== id));
    addAuditLog('Xərc Silindi', `Xərc ID: ${id}`);

    const supabase = getSupabaseClient();
    if (supabase) {
      safeDbExec(supabase.from('expenses').delete().eq('id', id));
    }
  };

  const updateSettings = async (
    newSettings: Partial<AppSettings>
  ): Promise<{ success: boolean; error?: string }> => {
    if (currentUser?.role !== 'admin') {
      const msg = 'İcazə yoxdur: Yalnız Admin parametrləri yeniləyə bilər!';
      showToast('error', msg);
      return { success: false, error: msg };
    }
    const updated: AppSettings = { ...settings, ...newSettings };
    setSettings(updated);
    addAuditLog('Ayarlar Yeniləndi', 'Sistem və dizayn parametrləri yeniləndi.');

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const kvEntries = serializeSettingsToKV(updated);
        // Persist via security-definer RPC first, fallback to direct KV upsert or legacy single-row
        const rpcResults = await Promise.all(
          kvEntries.map(entry =>
            supabase.rpc('upsert_app_setting', {
              p_key: entry.key,
              p_value: entry.value,
              p_actor_username: currentUser.username,
            })
          )
        );

        const hasRpcError = rpcResults.some(r => r.error);
        if (hasRpcError) {
          const kvUpsert = await supabase
            .from('app_settings')
            .upsert(
              kvEntries.map(e => ({ ...e, updated_at: new Date().toISOString() })),
              { onConflict: 'key' }
            );
          if (kvUpsert.error) {
            await supabase.from('app_settings').upsert({
              id: 'global',
              min_stock_threshold: updated.minStockThreshold,
              auto_confirm_sales: updated.autoConfirmSales,
              bar_name: updated.barName,
              enable_push_notifications: updated.enablePushNotifications,
              logo_url: updated.logoUrl || null,
            });
          }
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : 'Parametrlər buluda yazılarkən xəta baş verdi.';
        console.warn('updateSettings supabase warning:', err);
        return { success: false, error: errMsg };
      }
    }

    return { success: true };
  };

  // Zero-out all transaction data while keeping products, users, and settings intact
  const clearAllTransactions = async () => {
    if (currentUser?.role !== 'admin') {
      showToast('error', 'İcazə yoxdur: Yalnız Admin əməliyyatları sıfırlaya bilər!');
      return;
    }
    setSales([]);
    setPurchases([]);
    setDebts([]);
    setExpenses([]);
    setDailyReports([]);
    saveToDualStorage('sales', []);
    saveToDualStorage('purchases', []);
    saveToDualStorage('debts', []);
    saveToDualStorage('expenses', []);
    saveToDualStorage('dailyReports', []);
    addAuditLog('Əməliyyatlar Sıfırlandı', 'Bütün satış, borc, mal qəbulu və xərclər sıfırlandı.');

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        await Promise.all([
          supabase.from('sales').delete().neq('id', 'keep_all_guard_never_match'),
          supabase.from('purchases').delete().neq('id', 'keep_all_guard_never_match'),
          supabase.from('debts').delete().neq('id', 'keep_all_guard_never_match'),
          supabase.from('expenses').delete().neq('id', 'keep_all_guard_never_match'),
          supabase.from('daily_reports').delete().neq('id', 'keep_all_guard_never_match'),
        ]);
      } catch (e) {
        console.warn('Supabase clear transactions error:', e);
      }
    }
  };

  const resetToSampleData = () => {
    setUsers(INITIAL_USERS);
    setProducts(INITIAL_PRODUCTS);
    setPurchases([]);
    setSales([]);
    setDebts([]);
    setCustomerAccounts([]);
    setDailyReports([]);
    setExpenses([]);
    setSettings(INITIAL_SETTINGS);
    addAuditLog('Baza Sıfırlandı', 'Məlumatlar sıfırlandı.');
  };

  const resetToOriginalBackup = () => {
    setUsers(INITIAL_USERS);
    setProducts(INITIAL_PRODUCTS);
    setPurchases(INITIAL_PURCHASES);
    setSales(INITIAL_SALES);
    setDebts(INITIAL_DEBTS);
    setCustomerAccounts(INITIAL_CUSTOMERS);
    setDailyReports(INITIAL_DAILY_REPORTS);
    setExpenses(INITIAL_EXPENSES);
    setSettings(INITIAL_SETTINGS);
    saveToDualStorage('users', INITIAL_USERS);
    saveToDualStorage('products', INITIAL_PRODUCTS);
    saveToDualStorage('purchases', INITIAL_PURCHASES);
    saveToDualStorage('sales', INITIAL_SALES);
    saveToDualStorage('debts', INITIAL_DEBTS);
    saveToDualStorage('customerAccounts', INITIAL_CUSTOMERS);
    saveToDualStorage('dailyReports', INITIAL_DAILY_REPORTS);
    saveToDualStorage('expenses', INITIAL_EXPENSES);
    saveToDualStorage('settings', INITIAL_SETTINGS);
    addAuditLog('Orijinal Baza Bərpa Edildi', '11.11.2026 tarixli orijinal sistem məlumatları tam bərpa olundu.');
  };

  const restoreFromBackup = (jsonData: string): boolean => {
    try {
      const data = JSON.parse(jsonData);
      if (data.products && Array.isArray(data.products)) setProducts(data.products);
      if (data.purchases && Array.isArray(data.purchases)) setPurchases(data.purchases);
      if (data.sales && Array.isArray(data.sales)) setSales(data.sales);
      if (data.debts && Array.isArray(data.debts)) setDebts(data.debts);
      if (data.customerAccounts && Array.isArray(data.customerAccounts)) setCustomerAccounts(data.customerAccounts);
      if (data.dailyReports && Array.isArray(data.dailyReports)) setDailyReports(data.dailyReports);
      if (data.expenses && Array.isArray(data.expenses)) setExpenses(data.expenses);
      if (data.users && Array.isArray(data.users)) setUsers(data.users);
      if (data.settings) setSettings(data.settings);
      addAuditLog('Ehtiyat Nüsxə Bərpa Edildi', 'JSON faylından məlumatlar uğurla yükləndi.');
      return true;
    } catch (e) {
      console.error('Backup restore failed:', e);
      return false;
    }
  };

  return (
    <AppContext.Provider
      value={{
        currentUser,
        login,
        logout,
        users,
        addUser,
        updateUser,
        deleteUser,
        products,
        addProduct,
        updateProduct,
        deleteProduct,
        purchases,
        addPurchase,
        deletePurchase,
        depoMovements,
        recordManualDepoAdjustment,
        sales,
        addSale,
        updateSaleDate,
        confirmSale,
        confirmDaySales,
        deleteSale,
        debts,
        addDebt,
        payDebt,
        acceptDebtPayment,
        deleteDebtPayment,
        customerAccounts,
        depositToCustomer,
        openOrDepositCustomerBalance,
        withdrawCustomerCash,
        withdrawProductFromBalance,
        adjustCustomerBalance,
        chargeCustomerBalance,
        deleteCustomerAccount,
        dailyReports,
        saveDailyReport,
        expenses,
        addExpense,
        deleteExpense,
        settings,
        settingsLoading,
        updateSettings,
        auditLogs,
        resetToSampleData,
        resetToOriginalBackup,
        clearAllTransactions,
        restoreFromBackup,
        theme,
        toggleTheme,
        getProductStock,
        notificationPermission,
        requestPushPermission,
        triggerTestNotification,
        isSupabaseConnected,
        supabaseStatus,
        syncAllLocalDataToSupabase,
        reloadFromSupabase,
        toast,
        showToast,
        dismissToast,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
