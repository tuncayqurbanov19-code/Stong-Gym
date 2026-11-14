import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  User,
  Product,
  PurchaseIntake,
  Sale,
  DebtRecord,
  CustomerAccount,
  DailyReport,
  Expense,
  AppSettings,
  AuditLog,
} from '../types';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

// Retrieve config from env variables or user-configured localStorage
export function getSupabaseConfig(): SupabaseConfig {
  const envUrl = (import.meta.env.VITE_SUPABASE_URL as string) || '';
  const envKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || '';

  const localUrl = typeof window !== 'undefined' ? localStorage.getItem('zalbar_supabase_url') || '' : '';
  const localKey = typeof window !== 'undefined' ? localStorage.getItem('zalbar_supabase_anon_key') || '' : '';

  return {
    url: localUrl.trim() || envUrl.trim(),
    anonKey: localKey.trim() || envKey.trim(),
  };
}

export function saveSupabaseConfig(url: string, anonKey: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('zalbar_supabase_url', url.trim());
    localStorage.setItem('zalbar_supabase_anon_key', anonKey.trim());
    // Reset client cache so it recreates with new credentials
    cachedClient = null;
  }
}

export function clearSupabaseConfig(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('zalbar_supabase_url');
    localStorage.removeItem('zalbar_supabase_anon_key');
    cachedClient = null;
  }
}

let cachedClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (cachedClient) return cachedClient;

  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey || url === 'MY_SUPABASE_URL' || anonKey === 'MY_SUPABASE_ANON_KEY') {
    return null;
  }

  try {
    cachedClient = createClient(url, anonKey, {
      auth: {
        persistSession: false,
      },
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    });
    return cachedClient;
  } catch (err) {
    console.error('Failed to initialize Supabase client:', err);
    return null;
  }
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseClient() !== null;
}

// Test connection by fetching a count or pinging a table
export async function testSupabaseConnection(
  testUrl?: string,
  testKey?: string
): Promise<{ success: boolean; message: string }> {
  try {
    const url = testUrl || getSupabaseConfig().url;
    const key = testKey || getSupabaseConfig().anonKey;

    if (!url || !key) {
      return { success: false, message: 'URL və ya Anon Key daxil edilməyib.' };
    }

    const testClient = createClient(url, key);
    // Attempt a light query
    const { error } = await testClient.from('products').select('id').limit(1);

    if (error) {
      // Check if table missing (need schema) vs credentials invalid
      if (error.code === '42P01' || error.message.includes('relation') || error.message.includes('not found')) {
        return {
          success: true,
          message: 'Supabase-ə qoşuldu! Qeyd: Cədvəllər hələ yaradılmayıb. Zəhmət olmasa "supabase_schema.sql" skriptini icra edin.',
        };
      }
      return { success: false, message: `Xəta: ${error.message} (${error.code || ''})` };
    }

    return { success: true, message: 'Supabase verilənlər bazasına uğurla qoşuldu! Real-vaxt sinxronizasiya aktivdir.' };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return { success: false, message: `Bağlantı xətası: ${errMsg}` };
  }
}

// Database Row Types & Mapping functions
export function mapProductToDB(p: Product) {
  return {
    id: p.id,
    name: p.name,
    barcode: p.barcode,
    sale_price: p.salePrice,
    buy_price: p.buyPrice,
    category: p.category,
    volume: p.volume || null,
    initial_stock: p.initialStock,
    min_stock_alert: p.minStockAlert,
    note: p.note || null,
    image: p.image || null,
    created_at: p.createdAt,
  };
}

export function mapDBToProduct(row: any): Product {
  return {
    id: row.id,
    name: row.name,
    barcode: row.barcode,
    salePrice: Number(row.sale_price) || 0,
    buyPrice: Number(row.buy_price) || 0,
    category: row.category,
    volume: row.volume || undefined,
    initialStock: Number(row.initial_stock) || 0,
    minStockAlert: Number(row.min_stock_alert) || 0,
    note: row.note || undefined,
    image: row.image || undefined,
    createdAt: row.created_at,
  };
}

export function mapSaleToDB(s: Sale) {
  return {
    id: s.id,
    date: s.date,
    time: s.time,
    items: s.items,
    subtotal_amount: s.subtotalAmount ?? s.totalAmount + (s.discountAmount || 0),
    discount_amount: s.discountAmount || 0,
    total_amount: s.totalAmount,
    payment_type: s.paymentType,
    debtor_name: s.debtorName || null,
    debtor_phone: s.debtorPhone || null,
    original_date: s.originalDate || s.date,
    date_changed_at: s.dateChangedAt || null,
    updated_at: s.updatedAt || null,
    is_confirmed: s.isConfirmed,
    confirmed_at: s.confirmedAt || null,
    confirmed_by: s.confirmedBy || null,
    created_at: s.createdAt,
    created_by: s.createdBy,
  };
}

export function mapSaleToLegacyDB(s: Sale) {
  return {
    id: s.id,
    date: s.date,
    time: s.time,
    items: s.items,
    total_amount: s.totalAmount,
    payment_type: s.paymentType,
    debtor_name: s.debtorName || null,
    is_confirmed: s.isConfirmed,
    confirmed_at: s.confirmedAt || null,
    confirmed_by: s.confirmedBy || null,
    created_at: s.createdAt,
    created_by: s.createdBy,
  };
}

export function mapDBToSale(row: any): Sale {
  const totalAmount = Number(row.total_amount) || 0;
  const discountAmount = Number(row.discount_amount) || 0;
  return {
    id: row.id,
    date: row.date,
    time: row.time,
    items: row.items || [],
    subtotalAmount:
      row.subtotal_amount !== null && row.subtotal_amount !== undefined
        ? Number(row.subtotal_amount)
        : Math.round((totalAmount + discountAmount) * 100) / 100,
    discountAmount,
    totalAmount,
    paymentType: row.payment_type,
    debtorName: row.debtor_name || undefined,
    debtorPhone: row.debtor_phone || undefined,
    originalDate: row.original_date || undefined,
    dateChangedAt: row.date_changed_at || undefined,
    updatedAt: row.updated_at || undefined,
    isConfirmed: Boolean(row.is_confirmed),
    confirmedAt: row.confirmed_at || undefined,
    confirmedBy: row.confirmed_by || undefined,
    createdAt: row.created_at,
    createdBy: row.created_by,
  };
}

export function mapPurchaseToDB(p: PurchaseIntake) {
  return {
    id: p.id,
    date: p.date,
    product_id: p.productId,
    product_name: p.productName,
    quantity: p.quantity,
    paid_amount: p.paidAmount,
    note: p.note || null,
    created_at: p.createdAt,
    created_by: p.createdBy,
  };
}

export function mapDBToPurchase(row: any): PurchaseIntake {
  return {
    id: row.id,
    date: row.date,
    productId: row.product_id,
    productName: row.product_name,
    quantity: Number(row.quantity) || 0,
    paidAmount: Number(row.paid_amount) || 0,
    note: row.note || undefined,
    createdAt: row.created_at,
    createdBy: row.created_by,
  };
}

export function mapDebtToDB(d: DebtRecord) {
  return {
    id: d.id,
    debtor_name: d.debtorName,
    debtor_phone: d.debtorPhone || null,
    items: d.items,
    total_amount: d.totalAmount,
    paid_amount: d.paidAmount,
    remaining_amount: d.remainingAmount,
    date: d.date,
    status: d.status,
    sale_id: d.saleId || null,
    notes: d.notes || null,
    payments: d.payments || [],
    created_at: d.createdAt,
    updated_at: d.updatedAt,
  };
}

export function mapDebtToLegacyDB(d: DebtRecord) {
  return {
    id: d.id,
    debtor_name: d.debtorName,
    items: d.items,
    total_amount: d.totalAmount,
    paid_amount: d.paidAmount,
    remaining_amount: d.remainingAmount,
    date: d.date,
    status: d.status,
    sale_id: d.saleId || null,
    notes: d.notes || null,
    payments: d.payments || [],
    created_at: d.createdAt,
    updated_at: d.updatedAt,
  };
}

export function mapDBToDebt(row: any): DebtRecord {
  return {
    id: row.id,
    debtorName: row.debtor_name,
    debtorPhone: row.debtor_phone || undefined,
    items: row.items || [],
    totalAmount: Number(row.total_amount) || 0,
    paidAmount: Number(row.paid_amount) || 0,
    remainingAmount: Number(row.remaining_amount) || 0,
    date: row.date,
    status: row.status,
    saleId: row.sale_id || undefined,
    notes: row.notes || undefined,
    payments: row.payments || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapDailyReportToDB(r: DailyReport) {
  return {
    id: r.id,
    date: r.date,
    cash_amount: r.cashAmount,
    card_amount: r.cardAmount,
    pos_amount: r.posAmount,
    total_amount: r.totalAmount,
    is_manually_adjusted: r.isManuallyAdjusted,
    difference: r.difference,
    notes: r.notes || null,
    updated_by: r.updatedBy,
    updated_at: r.updatedAt,
  };
}

export function mapDBToDailyReport(row: any): DailyReport {
  return {
    id: row.id,
    date: row.date,
    cashAmount: Number(row.cash_amount) || 0,
    cardAmount: Number(row.card_amount) || 0,
    posAmount: Number(row.pos_amount) || 0,
    totalAmount: Number(row.total_amount) || 0,
    isManuallyAdjusted: Boolean(row.is_manually_adjusted),
    difference: Number(row.difference) || 0,
    notes: row.notes || undefined,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  };
}

export function mapExpenseToDB(e: Expense) {
  return {
    id: e.id,
    date: e.date,
    category: e.category,
    amount: e.amount,
    note: e.note || null,
    created_at: e.createdAt,
    created_by: e.createdBy,
  };
}

export function mapDBToExpense(row: any): Expense {
  return {
    id: row.id,
    date: row.date,
    category: row.category,
    amount: Number(row.amount) || 0,
    note: row.note || undefined,
    createdAt: row.created_at,
    createdBy: row.created_by,
  };
}

export function mapUserToDB(u: User) {
  return {
    id: u.id,
    username: u.username,
    password: u.password,
    name: u.name,
    role: u.role,
    is_active: u.isActive,
    created_at: u.createdAt,
  };
}

export function mapDBToUser(row: any): User {
  return {
    id: row.id,
    username: row.username,
    password: row.password,
    name: row.name,
    role: row.role,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
  };
}

export function mapAuditLogToDB(l: AuditLog) {
  return {
    id: l.id,
    timestamp: l.timestamp,
    user_id: l.userId,
    username: l.username,
    action: l.action,
    details: l.details,
  };
}

export function mapDBToAuditLog(row: any): AuditLog {
  return {
    id: row.id,
    timestamp: row.timestamp,
    userId: row.user_id,
    username: row.username,
    action: row.action,
    details: row.details,
  };
}

export function mapCustomerAccountToDB(c: CustomerAccount) {
  return {
    id: c.id,
    name: c.name,
    phone: c.phone || null,
    balance: c.balance,
    total_deposited: c.totalDeposited,
    total_spent: c.totalSpent,
    notes: c.notes || null,
    transactions: c.transactions || [],
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  };
}

export function mapDBToCustomerAccount(row: any): CustomerAccount {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone || undefined,
    balance: Number(row.balance) || 0,
    totalDeposited: Number(row.total_deposited) || 0,
    totalSpent: Number(row.total_spent) || 0,
    notes: row.notes || undefined,
    transactions: Array.isArray(row.transactions) ? row.transactions : [],
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString(),
  };
}

export function mapDBToDebtPayment(row: any) {
  return {
    id: row.id,
    debtId: row.debt_id,
    date: row.paid_at,
    paidAt: row.paid_at,
    amount: Number(row.amount) || 0,
    paymentMethod: (row.payment_method || 'naqd') as 'naqd' | 'kart' | 'pos' | 'kocurme',
    receivedBy: row.received_by || 'admin',
    note: row.note || undefined,
    createdAt: row.created_at || new Date().toISOString(),
  };
}

export function mapDebtPaymentToDB(p: {
  id: string;
  debtId: string;
  amount: number;
  paymentMethod?: string;
  receivedBy?: string;
  paidAt?: string;
  date?: string;
  note?: string;
  createdAt?: string;
}) {
  return {
    id: p.id,
    debt_id: p.debtId,
    amount: Number(p.amount) || 0,
    payment_method: (p.paymentMethod || 'naqd').toLowerCase(),
    received_by: p.receivedBy || 'admin',
    paid_at: p.paidAt || p.date || new Date().toISOString().slice(0, 10),
    note: p.note || null,
    created_at: p.createdAt || new Date().toISOString(),
  };
}

export function applyAppSettingsRows(
  rows: { key: string; value: string }[],
  fallback: AppSettings
): AppSettings {
  const map: Record<string, string> = {};
  for (const r of rows) {
    if (r && r.key) map[r.key] = r.value ?? '';
  }

  const sizeRaw = map.logo_size;
  const logoSize: AppSettings['logoSize'] =
    sizeRaw === 'sm' || sizeRaw === 'md' || sizeRaw === 'lg' ? sizeRaw : fallback.logoSize;

  return {
    barName: map.app_name !== undefined && map.app_name !== '' ? map.app_name : fallback.barName,
    logoUrl: map.logo_url !== undefined ? map.logo_url || undefined : fallback.logoUrl,
    primaryColor: map.primary_color || fallback.primaryColor || '#dc2626',
    logoSize,
    minStockThreshold:
      map.min_stock_threshold !== undefined
        ? Number(map.min_stock_threshold) || fallback.minStockThreshold
        : fallback.minStockThreshold,
    autoConfirmSales:
      map.auto_confirm_sales !== undefined
        ? map.auto_confirm_sales === 'true'
        : fallback.autoConfirmSales,
    enablePushNotifications:
      map.enable_push_notifications !== undefined
        ? map.enable_push_notifications === 'true'
        : fallback.enablePushNotifications,
  };
}

export function serializeSettingsToKV(s: AppSettings): { key: string; value: string }[] {
  return [
    { key: 'app_name', value: s.barName || 'Zal Barı' },
    { key: 'logo_url', value: s.logoUrl || '' },
    { key: 'primary_color', value: s.primaryColor || '#dc2626' },
    { key: 'logo_size', value: s.logoSize || 'md' },
    { key: 'min_stock_threshold', value: String(s.minStockThreshold ?? 5) },
    { key: 'auto_confirm_sales', value: String(Boolean(s.autoConfirmSales)) },
    { key: 'enable_push_notifications', value: String(Boolean(s.enablePushNotifications)) },
  ];
}


