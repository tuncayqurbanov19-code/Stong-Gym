export type UserRole = 'admin' | 'isci';

export interface User {
  id: string;
  username: string;
  password: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
}

export interface Product {
  id: string;
  name: string;
  image?: string;
  barcode: string;
  salePrice: number;
  buyPrice: number;
  category: string;
  volume?: string;
  initialStock: number;
  minStockAlert: number;
  note?: string;
  createdAt: string;
}

export interface PurchaseIntake {
  id: string;
  date: string; // YYYY-MM-DD
  productId: string;
  productName: string;
  quantity: number;
  paidAmount: number;
  note?: string;
  createdAt: string;
  createdBy: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
  unitPrice: number;
}

export type PaymentType = 'naqd' | 'kart' | 'pos' | 'borc' | 'balans';

export interface SaleItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface Sale {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  items: SaleItem[];
  totalAmount: number;
  paymentType: PaymentType;
  debtorName?: string;
  isConfirmed: boolean;
  confirmedAt?: string;
  confirmedBy?: string;
  createdAt: string;
  createdBy: string;
}

export type DebtPaymentMethod = 'naqd' | 'kart' | 'pos' | 'kocurme';

export interface DebtPayment {
  id: string;
  debtId?: string;
  date: string; // YYYY-MM-DD
  paidAt?: string; // YYYY-MM-DD (alias for DB paid_at)
  amount: number;
  paymentMethod?: DebtPaymentMethod;
  receivedBy?: string;
  note?: string;
  createdAt?: string;
}

export type DebtStatus = 'borcdadir' | 'qismen' | 'odanilib';

export interface DebtRecord {
  id: string;
  debtorName: string;
  items: {
    productName: string;
    quantity: number;
    unitPrice: number;
  }[];
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  date: string; // YYYY-MM-DD
  status: DebtStatus;
  saleId?: string;
  notes?: string;
  payments: DebtPayment[];
  createdAt: string;
  updatedAt: string;
}

export interface CustomerTransaction {
  id: string;
  type: 'deposit' | 'charge'; // deposit = balansa pul qoyuldu (+), charge = balansdan su/məhsul çıxıldı (-)
  amount: number;
  date: string;
  time: string;
  note?: string;
  saleId?: string;
  createdBy?: string;
}

export interface CustomerAccount {
  id: string;
  name: string;
  phone?: string;
  balance: number; // Cari aktiv depozit balansı (müsbət məbləğ)
  totalDeposited: number; // İndiyə qədər ödədiyi ümumi depozit cəmi
  totalSpent: number; // Balansından çıxılan ümumi xərc cəmi
  notes?: string;
  transactions: CustomerTransaction[];
  createdAt: string;
  updatedAt: string;
}

export interface DailyReport {
  id: string;
  date: string; // YYYY-MM-DD
  cashAmount: number;
  cardAmount: number;
  posAmount: number;
  totalAmount: number;
  isManuallyAdjusted: boolean;
  difference: number;
  notes?: string;
  updatedBy: string;
  updatedAt: string;
}

export type ExpenseCategory = 'İcarə' | 'Maaş' | 'Benzin' | 'Kommunal' | 'Digər';

export interface Expense {
  id: string;
  date: string; // YYYY-MM-DD
  category: ExpenseCategory;
  amount: number;
  note?: string;
  createdAt: string;
  createdBy: string;
}

export type LogoSize = 'sm' | 'md' | 'lg';

export interface AppSettings {
  minStockThreshold: number;
  autoConfirmSales: boolean;
  barName: string;
  enablePushNotifications: boolean;
  logoUrl?: string;
  primaryColor: string;
  logoSize: LogoSize;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  userId: string;
  username: string;
  action: string;
  details: string;
}
