import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  User,
  Product,
  PurchaseIntake,
  Sale,
  DebtRecord,
  DailyReport,
  Expense,
  AppSettings,
  AuditLog,
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
  mapDBToDailyReport,
  mapDailyReportToDB,
  mapDBToExpense,
  mapExpenseToDB,
  mapDBToUser,
  mapUserToDB,
  mapDBToAuditLog,
  mapAuditLogToDB,
} from '../lib/supabase';

// Initial Users
const INITIAL_USERS: User[] = [
  {
    id: 'u-admin',
    username: 'admin',
    password: 'admin123',
    name: 'Müdir (Admin)',
    role: 'admin',
    isActive: true,
    createdAt: '2026-11-01T08:00:00Z',
  },
  {
    id: 'u-isci1',
    username: 'isci',
    password: 'isci123',
    name: 'Rəşad Əliyev (Barman)',
    role: 'isci',
    isActive: true,
    createdAt: '2026-11-01T09:00:00Z',
  },
];

const INITIAL_SETTINGS: AppSettings = {
  minStockThreshold: 5,
  autoConfirmSales: true,
  barName: 'Zal Barı',
  enablePushNotifications: true,
};

// Default Products (0.5 L su = 0.5 AZN, 1 L su = 1 AZN, 1.5 L su = 1.2 AZN and fitness supplements)
const INITIAL_PRODUCTS: Product[] = [
  {
    id: 'prod-1',
    name: '0,5 L Su',
    barcode: '47600101',
    salePrice: 0.5,
    buyPrice: 0.25,
    category: 'Su',
    volume: '0.5 L',
    initialStock: 100,
    minStockAlert: 10,
    note: 'Qazsız təbii bulaq suyu',
    createdAt: '2026-11-01T08:00:00Z',
  },
  {
    id: 'prod-2',
    name: '1 L Su',
    barcode: '47600102',
    salePrice: 1.0,
    buyPrice: 0.5,
    category: 'Su',
    volume: '1 L',
    initialStock: 80,
    minStockAlert: 8,
    note: 'Qazsız təbii su',
    createdAt: '2026-11-01T08:00:00Z',
  },
  {
    id: 'prod-3',
    name: '1,5 L Su',
    barcode: '47600103',
    salePrice: 1.2,
    buyPrice: 0.6,
    category: 'Su',
    volume: '1.5 L',
    initialStock: 60,
    minStockAlert: 6,
    note: 'Qazsız böyük qablaşdırma',
    createdAt: '2026-11-01T08:00:00Z',
  },
  {
    id: 'prod-4',
    name: 'Protein Şeyk (Banan/Vanil)',
    barcode: '47600104',
    salePrice: 3.5,
    buyPrice: 1.8,
    category: 'Protein',
    volume: '400 ml',
    initialStock: 45,
    minStockAlert: 5,
    note: '25g zərdab zülalı ilə hazır içki',
    createdAt: '2026-11-01T08:00:00Z',
  },
  {
    id: 'prod-5',
    name: 'BCAA Soyuq İçki',
    barcode: '47600105',
    salePrice: 2.5,
    buyPrice: 1.3,
    category: 'Enerji və BCAA',
    volume: '330 ml',
    initialStock: 30,
    minStockAlert: 5,
    note: 'Limon və Giləmeyvə tamlı',
    createdAt: '2026-11-01T08:00:00Z',
  },
  {
    id: 'prod-6',
    name: 'Red Bull Enerji İçkisi',
    barcode: '47600106',
    salePrice: 3.0,
    buyPrice: 1.7,
    category: 'Enerji və BCAA',
    volume: '250 ml',
    initialStock: 50,
    minStockAlert: 5,
    note: 'Klassik enerji içkisi',
    createdAt: '2026-11-01T08:00:00Z',
  },
  {
    id: 'prod-7',
    name: 'Protein Bar (Şokoladlı)',
    barcode: '47600107',
    salePrice: 2.0,
    buyPrice: 1.0,
    category: 'Qəlyanaltı',
    volume: '60 g',
    initialStock: 40,
    minStockAlert: 5,
    note: '20g protein, az şəkərli baton',
    createdAt: '2026-11-01T08:00:00Z',
  },
  {
    id: 'prod-8',
    name: 'L-Carnitine Shot 3000',
    barcode: '47600108',
    salePrice: 2.8,
    buyPrice: 1.4,
    category: 'Əlavələr',
    volume: '60 ml',
    initialStock: 25,
    minStockAlert: 5,
    note: 'Məşqdən əvvəl yağ yandırmağa köməkçi',
    createdAt: '2026-11-01T08:00:00Z',
  },
];

// ZERO INITIAL TRANSACTIONS as requested by user ("əlavə olaraq sıfırla, hazırda olan satış və s. olmasın, mən əlavə edcəm")
const INITIAL_PURCHASES: PurchaseIntake[] = [];
const INITIAL_SALES: Sale[] = [];
const INITIAL_DEBTS: DebtRecord[] = [];
const INITIAL_EXPENSES: Expense[] = [];
const INITIAL_DAILY_REPORTS: DailyReport[] = [];

const INITIAL_AUDIT_LOGS: AuditLog[] = [
  {
    id: 'log-1',
    timestamp: new Date().toISOString(),
    userId: 'u-admin',
    username: 'admin',
    action: 'Baza Hazırlandı',
    details: 'Zal Barı idarəetmə bazası təmiz satış rejimində işə salındı.',
  },
];

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
  updateSettings: (newSettings: Partial<AppSettings>) => void;
  auditLogs: AuditLog[];
  resetToSampleData: () => void;
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
  // Check migration flag to ensure existing browser localStorage sales are zeroed out as requested
  const isZeroedV2 = localStorage.getItem('zalbar_zeroed_v2') === 'true';

  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    return loadFromStorage<User | null>('currentUser', INITIAL_USERS[0]);
  });

  const [users, setUsers] = useState<User[]>(() => loadFromStorage('users', INITIAL_USERS));
  const [products, setProducts] = useState<Product[]>(() => loadFromStorage('products', INITIAL_PRODUCTS));
  const [purchases, setPurchases] = useState<PurchaseIntake[]>(() =>
    isZeroedV2 ? loadFromStorage('purchases', INITIAL_PURCHASES) : INITIAL_PURCHASES
  );
  const [sales, setSales] = useState<Sale[]>(() =>
    isZeroedV2 ? loadFromStorage('sales', INITIAL_SALES) : INITIAL_SALES
  );
  const [debts, setDebts] = useState<DebtRecord[]>(() =>
    isZeroedV2 ? loadFromStorage('debts', INITIAL_DEBTS) : INITIAL_DEBTS
  );
  const [dailyReports, setDailyReports] = useState<DailyReport[]>(() =>
    isZeroedV2 ? loadFromStorage('dailyReports', INITIAL_DAILY_REPORTS) : INITIAL_DAILY_REPORTS
  );
  const [expenses, setExpenses] = useState<Expense[]>(() =>
    isZeroedV2 ? loadFromStorage('expenses', INITIAL_EXPENSES) : INITIAL_EXPENSES
  );
  const [settings, setSettings] = useState<AppSettings>(() =>
    loadFromStorage('settings', INITIAL_SETTINGS)
  );
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
    if (!supabase) return;

    try {
      setSupabaseStatus('Supabase-dən məlumatlar yüklənir...');
      const [
        prodsRes,
        usersRes,
        salesRes,
        purchasesRes,
        debtsRes,
        reportsRes,
        expensesRes,
        settingsRes,
        logsRes,
      ] = await Promise.all([
        supabase.from('products').select('*'),
        supabase.from('users').select('*'),
        supabase.from('sales').select('*').order('created_at', { ascending: false }),
        supabase.from('purchases').select('*').order('created_at', { ascending: false }),
        supabase.from('debts').select('*').order('created_at', { ascending: false }),
        supabase.from('daily_reports').select('*').order('date', { ascending: false }),
        supabase.from('expenses').select('*').order('created_at', { ascending: false }),
        supabase.from('app_settings').select('*').eq('id', 'global').maybeSingle(),
        supabase.from('audit_logs').select('*').order('timestamp', { ascending: false }).limit(100),
      ]);

      if (prodsRes.data && prodsRes.data.length > 0) setProducts(prodsRes.data.map(mapDBToProduct));
      if (usersRes.data && usersRes.data.length > 0) setUsers(usersRes.data.map(mapDBToUser));
      if (salesRes.data) setSales(salesRes.data.map(mapDBToSale));
      if (purchasesRes.data) setPurchases(purchasesRes.data.map(mapDBToPurchase));
      if (debtsRes.data) setDebts(debtsRes.data.map(mapDBToDebt));
      if (reportsRes.data) setDailyReports(reportsRes.data.map(mapDBToDailyReport));
      if (expensesRes.data) setExpenses(expensesRes.data.map(mapDBToExpense));
      if (settingsRes.data) {
        setSettings({
          minStockThreshold: Number(settingsRes.data.min_stock_threshold) || 5,
          autoConfirmSales: Boolean(settingsRes.data.auto_confirm_sales),
          barName: settingsRes.data.bar_name || 'Zal Barı',
          enablePushNotifications: Boolean(settingsRes.data.enable_push_notifications),
        });
      }
      if (logsRes.data && logsRes.data.length > 0) setAuditLogs(logsRes.data.map(mapDBToAuditLog));

      setIsSupabaseConnected(true);
      setSupabaseStatus('Canlı Sinxronizasiya Aktivdir');
    } catch (e) {
      console.warn('reloadFromSupabase error:', e);
      setSupabaseStatus('Lokal rejim (Supabase cavab vermir)');
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
          setDebts((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
        } else if (payload.eventType === 'DELETE') {
          setDebts((prev) => prev.filter((d) => d.id !== payload.old.id));
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
          setSettings({
            minStockThreshold: Number(payload.new.min_stock_threshold) || 5,
            autoConfirmSales: Boolean(payload.new.auto_confirm_sales),
            barName: payload.new.bar_name || 'Zal Barı',
            enablePushNotifications: Boolean(payload.new.enable_push_notifications),
          });
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
      await supabase.from('app_settings').upsert({
        id: 'global',
        min_stock_threshold: settings.minStockThreshold,
        auto_confirm_sales: settings.autoConfirmSales,
        bar_name: settings.barName,
        enable_push_notifications: settings.enablePushNotifications,
      });

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

  // Set the zeroed flag on first mount
  useEffect(() => {
    if (!isZeroedV2) {
      localStorage.setItem('zalbar_zeroed_v2', 'true');
      saveToDualStorage('sales', []);
      saveToDualStorage('purchases', []);
      saveToDualStorage('debts', []);
      saveToDualStorage('expenses', []);
      saveToDualStorage('dailyReports', []);
    }
  }, [isZeroedV2]);

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
    saveToDualStorage('dailyReports', dailyReports);
  }, [dailyReports]);

  useEffect(() => {
    saveToDualStorage('expenses', expenses);
  }, [expenses]);

  useEffect(() => {
    saveToDualStorage('settings', settings);
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
      alert('İcazə yoxdur: Yalnız Admin istifadəçi əlavə edə bilər!');
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
      alert('İcazə yoxdur: Yalnız Admin istifadəçi məlumatlarını dəyişə bilər!');
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
      alert('İcazə yoxdur: Yalnız Admin istifadəçi silə bilər!');
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
      alert('İcazə yoxdur: Yalnız Admin məhsul əlavə edə bilər!');
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
      alert('İcazə yoxdur: Yalnız Admin məhsul məlumatlarını redaktə edə bilər!');
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
      alert('İcazə yoxdur: Yalnız Admin məhsul silə bilər!');
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
      alert('İcazə yoxdur: Yalnız Admin mal qəbulunu silə bilər!');
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

  const syncDailyReportForDate = (date: string, additionalSale?: Sale) => {
    setDailyReports(prev => {
      const existing = prev.find(r => r.date === date);
      const allSalesForDay = [...sales, ...(additionalSale ? [additionalSale] : [])].filter(
        s => s.date === date && s.isConfirmed && s.paymentType !== 'borc'
      );

      const cash = allSalesForDay.filter(s => s.paymentType === 'naqd').reduce((sum, s) => sum + s.totalAmount, 0);
      const card = allSalesForDay.filter(s => s.paymentType === 'kart').reduce((sum, s) => sum + s.totalAmount, 0);
      const pos = allSalesForDay.filter(s => s.paymentType === 'pos').reduce((sum, s) => sum + s.totalAmount, 0);
      const total = cash + card + pos;

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

    const isConfirmed = settings.autoConfirmSales;
    const date = saleData.customDate || getTodayISODate();
    const time = saleData.customTime || getCurrentTimeHHMM();
    const saleId = `sale-${Date.now()}`;

    const newSale: Sale = {
      id: saleId,
      date,
      time,
      items: resolvedItems,
      totalAmount,
      paymentType: saleData.paymentType,
      debtorName: saleData.paymentType === 'borc' ? (saleData.debtorName || 'Adsız borclu') : undefined,
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

    // Sync daily report
    if (isConfirmed && saleData.paymentType !== 'borc') {
      syncDailyReportForDate(date, newSale);
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
    setSales(prev =>
      prev.map(s => {
        if (s.id === saleId) {
          const updated = {
            ...s,
            isConfirmed: true,
            confirmedAt: new Date().toISOString(),
            confirmedBy: currentUser?.username || 'admin',
          };
          syncDailyReportForDate(updated.date, updated);

          const supabase = getSupabaseClient();
          if (supabase) {
            safeDbExec(supabase.from('sales').update({
              is_confirmed: true,
              confirmed_at: updated.confirmedAt,
              confirmed_by: updated.confirmedBy,
            }).eq('id', saleId));
          }

          return updated;
        }
        return s;
      })
    );
    addAuditLog('Satış Təsdiqləndi', `Satış ID: ${saleId} təsdiqləndi.`);
  };

  const confirmDaySales = (date: string) => {
    setSales(prev =>
      prev.map(s => {
        if (s.date === date && !s.isConfirmed) {
          const updated = {
            ...s,
            isConfirmed: true,
            confirmedAt: new Date().toISOString(),
            confirmedBy: currentUser?.username || 'admin',
          };
          const supabase = getSupabaseClient();
          if (supabase) {
            safeDbExec(supabase.from('sales').update({
              is_confirmed: true,
              confirmed_at: updated.confirmedAt,
              confirmed_by: updated.confirmedBy,
            }).eq('id', s.id));
          }
          return updated;
        }
        return s;
      })
    );
    syncDailyReportForDate(date);
    addAuditLog('Günlük Satışlar Təsdiqləndi', `${date} tarixinə aid satışlar təsdiqləndi.`);
  };

  // Yalnız Admin satışları silə bilər (İşçi Admin məlumatlarını silə bilməz)
  const deleteSale = (saleId: string) => {
    if (currentUser?.role !== 'admin') {
      alert('İcazə yoxdur: Yalnız Admin satışları silə bilər!');
      return;
    }
    const s = sales.find(x => x.id === saleId);
    setSales(prev => prev.filter(x => x.id !== saleId));
    if (s) {
      syncDailyReportForDate(s.date);
    }
    addAuditLog('Satış Silindi', `Satış ID: ${saleId} silindi.`);

    const supabase = getSupabaseClient();
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

  const payDebt = (debtId: string, amount: number, note?: string) => {
    const cleanAmount = Number(amount) || 0;
    if (cleanAmount <= 0) return;

    setDebts(prev =>
      prev.map(d => {
        if (d.id === debtId) {
          const newPaid = Math.min(d.totalAmount, d.paidAmount + cleanAmount);
          const newRemaining = Math.max(0, d.totalAmount - newPaid);
          const status = newRemaining === 0 ? 'odanilib' : 'borcdadir';
          const newPayment = {
            id: `pay-${Date.now()}`,
            date: getTodayISODate(),
            amount: cleanAmount,
            note: note || 'Ödəniş',
          };
          const updated: DebtRecord = {
            ...d,
            paidAmount: newPaid,
            remainingAmount: newRemaining,
            status,
            payments: [newPayment, ...d.payments],
            updatedAt: new Date().toISOString(),
          };

          const supabase = getSupabaseClient();
          if (supabase) {
            safeDbExec(supabase.from('debts').update(mapDebtToDB(updated)).eq('id', debtId));
          }

          return updated;
        }
        return d;
      })
    );
    playAlertSound('success');
    addAuditLog('Borc Ödənildi', `Borc ID: ${debtId}, Ödənilən: ${cleanAmount} AZN.`);
  };

  const saveDailyReport = (report: {
    date: string;
    cashAmount: number;
    cardAmount: number;
    posAmount: number;
    notes?: string;
  }) => {
    const total = Number(report.cashAmount) + Number(report.cardAmount) + Number(report.posAmount);
    const daySales = sales.filter(s => s.date === report.date && s.isConfirmed && s.paymentType !== 'borc');
    const salesTotal = daySales.reduce((sum, s) => sum + s.totalAmount, 0);
    const difference = Math.round((total - salesTotal) * 100) / 100;

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

    addAuditLog('Gündəlik Hesabat Saxlanıldı', `${report.date}: Cəm ${total} AZN.`);

    const supabase = getSupabaseClient();
    if (supabase) {
      safeDbExec(supabase.from('daily_reports').upsert(mapDailyReportToDB(fullReport)));
    }
  };

  const addExpense = (newExp: Omit<Expense, 'id' | 'createdAt' | 'createdBy'>) => {
    if (currentUser?.role !== 'admin') {
      alert('İcazə yoxdur: Yalnız Admin xərc daxil edə bilər!');
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
      alert('İcazə yoxdur: Yalnız Admin xərcləri silə bilər!');
      return;
    }
    setExpenses(prev => prev.filter(e => e.id !== id));
    addAuditLog('Xərc Silindi', `Xərc ID: ${id}`);

    const supabase = getSupabaseClient();
    if (supabase) {
      safeDbExec(supabase.from('expenses').delete().eq('id', id));
    }
  };

  const updateSettings = (newSettings: Partial<AppSettings>) => {
    if (currentUser?.role !== 'admin') {
      alert('İcazə yoxdur: Yalnız Admin parametrləri yeniləyə bilər!');
      return;
    }
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    addAuditLog('Ayarlar Yeniləndi', 'Sistem parametrləri yeniləndi.');

    const supabase = getSupabaseClient();
    if (supabase) {
      safeDbExec(supabase.from('app_settings').upsert({
        id: 'global',
        min_stock_threshold: updated.minStockThreshold,
        auto_confirm_sales: updated.autoConfirmSales,
        bar_name: updated.barName,
        enable_push_notifications: updated.enablePushNotifications,
      }));
    }
  };

  // Zero-out all transaction data while keeping products, users, and settings intact
  const clearAllTransactions = async () => {
    if (currentUser?.role !== 'admin') {
      alert('İcazə yoxdur: Yalnız Admin əməliyyatları sıfırlaya bilər!');
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
    setDailyReports([]);
    setExpenses([]);
    setSettings(INITIAL_SETTINGS);
    addAuditLog('Baza Sıfırlandı', 'Məlumatlar sıfırlandı.');
  };

  const restoreFromBackup = (jsonData: string): boolean => {
    try {
      const data = JSON.parse(jsonData);
      if (data.products && Array.isArray(data.products)) setProducts(data.products);
      if (data.purchases && Array.isArray(data.purchases)) setPurchases(data.purchases);
      if (data.sales && Array.isArray(data.sales)) setSales(data.sales);
      if (data.debts && Array.isArray(data.debts)) setDebts(data.debts);
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
        dailyReports,
        saveDailyReport,
        expenses,
        addExpense,
        deleteExpense,
        settings,
        updateSettings,
        auditLogs,
        resetToSampleData,
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
