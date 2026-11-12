import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  User,
  Product,
  PurchaseIntake,
  Sale,
  DebtRecord,
  CustomerAccount,
  CustomerTransaction,
  DailyReport,
  Expense,
  AppSettings,
  AuditLog,
  DebtPayment,
  DebtPaymentMethod,
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
  mapDBToPurchase,
  mapPurchaseToDB,
  mapDBToDebt,
  mapDebtToDB,
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
  sales: Sale[];
  addSale: (saleData: {
    items: { productId: string; quantity: number }[];
    paymentType: Sale['paymentType'];
    debtorName?: string;
    customDate?: string;
    customTime?: string;
  }) => { success: boolean; saleId?: string; error?: string };
  confirmSale: (saleId: string) => void;
  confirmDaySales: (date: string) => void;
  deleteSale: (saleId: string) => void;
  debts: DebtRecord[];
  addDebt: (debt: Omit<DebtRecord, 'id' | 'createdAt' | 'updatedAt' | 'payments' | 'remainingAmount' | 'status'>) => void;
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
  chargeCustomerBalance: (
    customerName: string,
    amount: number,
    note?: string,
    saleId?: string
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
      ]);

      if (prodsRes.data && prodsRes.data.length > 0) setProducts(prodsRes.data.map(mapDBToProduct));
      if (usersRes.data && usersRes.data.length > 0) setUsers(usersRes.data.map(mapDBToUser));
      if (salesRes.data) setSales(salesRes.data.map(mapDBToSale));
      if (purchasesRes.data) setPurchases(purchasesRes.data.map(mapDBToPurchase));

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
        setCustomerAccounts(customersRes.data.map(mapDBToCustomerAccount));
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
        await supabase.from('customer_accounts').upsert(customerAccounts.map(mapCustomerAccountToDB));
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
    setProducts(prev => prev.map(p => (p.id === id ? { ...p, ...updates } : p)));
    addAuditLog('Məhsul redaktə edildi', `Məhsul ID: ${id} yeniləndi.`);

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

  const syncDailyReportForDate = (
    date: string,
    additionalSale?: Sale,
    overrideDebts?: DebtRecord[],
    overrideSales?: Sale[]
  ) => {
    const activeDebts = overrideDebts || debts;
    const baseSales = overrideSales || sales;
    const allDebtPaymentsForDay = activeDebts.flatMap(d =>
      (d.payments || []).filter(p => (p.paidAt || p.date || '').split('T')[0] === date)
    );

    setDailyReports(prev => {
      const existing = prev.find(r => r.date === date);
      const combinedSales = additionalSale
        ? [additionalSale, ...baseSales.filter(s => s.id !== additionalSale.id)]
        : baseSales;
      const allSalesForDay = combinedSales.filter(
        s => s.date === date && s.isConfirmed && s.paymentType !== 'borc' && s.paymentType !== 'balans'
      );

      let cash = allSalesForDay.filter(s => s.paymentType === 'naqd').reduce((sum, s) => sum + s.totalAmount, 0);
      let card = allSalesForDay.filter(s => s.paymentType === 'kart').reduce((sum, s) => sum + s.totalAmount, 0);
      let pos = allSalesForDay.filter(s => s.paymentType === 'pos').reduce((sum, s) => sum + s.totalAmount, 0);

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
        if (!existing.isManuallyAdjusted) {
          return prev.map(r =>
            r.date === date
              ? {
                  ...r,
                  cashAmount: cash,
                  cardAmount: card,
                  posAmount: pos,
                  totalAmount: total,
                  difference: 0,
                  updatedAt: new Date().toISOString(),
                  updatedBy: currentUser?.username || 'sistem',
                }
              : r
          );
        } else {
          const diff = Math.round((existing.totalAmount - total) * 100) / 100;
          return prev.map(r =>
            r.date === date ? { ...r, difference: diff, updatedAt: new Date().toISOString() } : r
          );
        }
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
          updatedAt: new Date().toISOString(),
        };
        return [newReport, ...prev];
      }
    });
  };

  const depositToCustomer = (
    customerName: string,
    amount: number,
    paymentType: 'naqd' | 'kart' | 'pos' = 'naqd',
    note?: string
  ) => {
    const cleanName = customerName.trim();
    if (!cleanName || amount <= 0) return;

    const tx: CustomerTransaction = {
      id: `ctx-${Date.now()}`,
      type: 'deposit',
      amount,
      date: getTodayISODate(),
      time: getCurrentTimeHHMM(),
      note: note || `Balans artırılması (${paymentType.toUpperCase()})`,
      createdBy: currentUser?.username || 'admin',
    };

    setCustomerAccounts(prev => {
      const existing = prev.find(c => c.name.toLowerCase() === cleanName.toLowerCase());
      let updated: CustomerAccount[];
      if (existing) {
        const newAcc: CustomerAccount = {
          ...existing,
          balance: Math.round((existing.balance + amount) * 100) / 100,
          totalDeposited: Math.round((existing.totalDeposited + amount) * 100) / 100,
          updatedAt: new Date().toISOString(),
          transactions: [tx, ...(existing.transactions || [])],
        };
        updated = prev.map(c => (c.id === existing.id ? newAcc : c));
        const supabase = getSupabaseClient();
        if (supabase) {
          safeDbExec(supabase.from('customer_accounts').upsert(mapCustomerAccountToDB(newAcc)));
        }
      } else {
        const newAcc: CustomerAccount = {
          id: `cust-${Date.now()}`,
          name: cleanName,
          balance: amount,
          totalDeposited: amount,
          totalSpent: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          transactions: [tx],
        };
        updated = [...prev, newAcc];
        const supabase = getSupabaseClient();
        if (supabase) {
          safeDbExec(supabase.from('customer_accounts').insert(mapCustomerAccountToDB(newAcc)));
        }
      }
      return updated;
    });

    playAlertSound('success');
    addAuditLog('Müştəri Balansı Artırıldı', `${cleanName}: +${amount.toFixed(2)} AZN (${paymentType.toUpperCase()})`);
  };

  const chargeCustomerBalance = (
    customerName: string,
    amount: number,
    note?: string,
    saleId?: string
  ): boolean => {
    const cleanName = customerName.trim();
    const existing = customerAccounts.find(c => c.name.toLowerCase() === cleanName.toLowerCase());
    if (!existing) {
      return false;
    }

    const tx: CustomerTransaction = {
      id: `ctx-${Date.now()}`,
      type: 'charge',
      amount,
      date: getTodayISODate(),
      time: getCurrentTimeHHMM(),
      note: note || 'Bar alış-verişi (Balansdan çıxılma)',
      saleId,
      createdBy: currentUser?.username || 'isci',
    };

    const newBalance = Math.round((existing.balance - amount) * 100) / 100;
    const newAcc: CustomerAccount = {
      ...existing,
      balance: newBalance,
      totalSpent: Math.round((existing.totalSpent + amount) * 100) / 100,
      updatedAt: new Date().toISOString(),
      transactions: [tx, ...(existing.transactions || [])],
    };

    setCustomerAccounts(prev => prev.map(c => (c.id === existing.id ? newAcc : c)));

    const supabase = getSupabaseClient();
    if (supabase) {
      safeDbExec(supabase.from('customer_accounts').update(mapCustomerAccountToDB(newAcc)).eq('id', existing.id));
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
    customDate?: string;
    customTime?: string;
  }): { success: boolean; saleId?: string; error?: string } => {
    if (!saleData.items || saleData.items.length === 0) {
      return { success: false, error: 'Səbət boşdur!' };
    }

    const resolvedItems: Sale['items'] = [];
    let totalAmount = 0;

    for (const it of saleData.items) {
      const prod = products.find(p => p.id === it.productId);
      if (!prod) continue;
      const unitPrice = prod.salePrice;
      const itemTotal = unitPrice * it.quantity;
      totalAmount += itemTotal;
      resolvedItems.push({
        productId: prod.id,
        productName: prod.name,
        quantity: it.quantity,
        unitPrice,
        totalPrice: itemTotal,
      });
    }

    if (resolvedItems.length === 0) {
      return { success: false, error: 'Məhsul tapılmadı!' };
    }

    const saleId = `sale-${Date.now()}`;

    // If payment type is 'balans', check customer account and deduce funds
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
      chargeCustomerBalance(custName, totalAmount, `Satış #${saleId}`, saleId);
    }

    const isConfirmed = settings.autoConfirmSales;
    const date = saleData.customDate || getTodayISODate();
    const time = saleData.customTime || getCurrentTimeHHMM();

    const newSale: Sale = {
      id: saleId,
      date,
      time,
      items: resolvedItems,
      totalAmount,
      paymentType: saleData.paymentType,
      debtorName:
        saleData.paymentType === 'borc'
          ? (saleData.debtorName || 'Adsız borclu')
          : saleData.paymentType === 'balans'
          ? (saleData.debtorName || 'Müştəri')
          : undefined,
      isConfirmed,
      confirmedAt: isConfirmed ? new Date().toISOString() : undefined,
      confirmedBy: isConfirmed ? (currentUser?.username || 'sistem') : undefined,
      createdAt: new Date().toISOString(),
      createdBy: currentUser?.username || 'isci',
    };

    const updatedSales = [newSale, ...sales];
    setSales(updatedSales);

    // If payment type is BORC, automatically create a DebtRecord
    let createdDebt: DebtRecord | null = null;
    if (saleData.paymentType === 'borc' && saleData.debtorName) {
      createdDebt = {
        id: `debt-${Date.now()}`,
        debtorName: saleData.debtorName.trim(),
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
        payments: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setDebts(prev => [createdDebt!, ...prev]);
    }

    // Sync daily report (Nağd, Kart, POS are recorded; Borc and Balans are excluded from today's physical drawer)
    if (isConfirmed && saleData.paymentType !== 'borc' && saleData.paymentType !== 'balans') {
      syncDailyReportForDate(date, newSale, undefined, updatedSales);
    }

    // CHECK STOCK & TRIGGER BROWSER PUSH NOTIFICATION IF STOCK <= THRESHOLD!
    if (isConfirmed && settings.enablePushNotifications) {
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
      `Məbləğ: ${totalAmount.toFixed(2)} AZN, Ödəniş: ${saleData.paymentType.toUpperCase()}`
    );

    // Sync to Supabase in background
    const supabase = getSupabaseClient();
    if (supabase) {
      safeDbExec(supabase.from('sales').insert(mapSaleToDB(newSale)));
      if (createdDebt) {
        safeDbExec(supabase.from('debts').insert(mapDebtToDB(createdDebt)));
      }
    }

    return { success: true, saleId };
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
    syncDailyReportForDate(updatedSale.date, updatedSale, undefined, nextSales);

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
    syncDailyReportForDate(date, undefined, undefined, nextSales);
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
      syncDailyReportForDate(targetSale.date, undefined, nextDebts, nextSales);
    }
    addAuditLog('Satış Silindi', `Satış ID: ${saleId} silindi.`);

    if (supabase) {
      safeDbExec(supabase.from('sales').delete().eq('id', saleId));
    }
  };

  const addDebt = (newDebt: Omit<DebtRecord, 'id' | 'createdAt' | 'updatedAt' | 'payments' | 'remainingAmount' | 'status'>) => {
    const debt: DebtRecord = {
      ...newDebt,
      id: `debt-${Date.now()}`,
      paidAmount: 0,
      remainingAmount: newDebt.totalAmount,
      status: 'borcdadir',
      payments: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setDebts(prev => [debt, ...prev]);
    addAuditLog('Borc Qeydi Əlavə Edildi', `${debt.debtorName}: ${debt.totalAmount} AZN.`);

    const supabase = getSupabaseClient();
    if (supabase) {
      safeDbExec(supabase.from('debts').insert(mapDebtToDB(debt)));
    }
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
        sales,
        addSale,
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
