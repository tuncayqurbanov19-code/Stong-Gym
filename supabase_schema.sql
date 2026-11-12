-- =================================================================
-- ZAL BARI & SU APARATI İDARƏETMƏ VƏ POS SİSTEMİ
-- SUPABASE VERİLƏNLƏR BAZASI VƏ REAL-VAXT SİNXRONİZASİYA SKRİPTİ
-- =================================================================
-- Bu skripti Supabase Dashboard-da SQL Editor bölməsində icra edin.
-- Həm kompüterdə, həm də iPhone/Android telefonlarında real-vaxt
-- sinxronizasiyanı, müştəri depozit balanslarını və məlumatların təhlükəsizliyini təmin edir.

-- 1. İstifadəçilər (Users) Cədvəli
CREATE TABLE IF NOT EXISTS public.users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'isci')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. Məhsullar və Su Qalıqları (Products) Cədvəli
CREATE TABLE IF NOT EXISTS public.products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    barcode TEXT UNIQUE NOT NULL,
    sale_price NUMERIC(10, 2) NOT NULL DEFAULT 0,
    buy_price NUMERIC(10, 2) NOT NULL DEFAULT 0,
    category TEXT NOT NULL,
    volume TEXT,
    initial_stock INTEGER NOT NULL DEFAULT 0,
    min_stock_alert INTEGER NOT NULL DEFAULT 5,
    note TEXT,
    image TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. Mal Qəbulu və Su Əlavəetmə (Purchases / Intake) Cədvəli
CREATE TABLE IF NOT EXISTS public.purchases (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    product_id TEXT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    paid_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    created_by TEXT NOT NULL
);

-- 4. Satışlar və Su İstifadəsi (Sales) Cədvəli
CREATE TABLE IF NOT EXISTS public.sales (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
    payment_type TEXT NOT NULL CHECK (payment_type IN ('naqd', 'kart', 'pos', 'borc', 'balans')),
    debtor_name TEXT,
    is_confirmed BOOLEAN NOT NULL DEFAULT true,
    confirmed_at TIMESTAMPTZ,
    confirmed_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    created_by TEXT NOT NULL
);

-- 5. Nisyə / Borclar (Debts) Cədvəli
CREATE TABLE IF NOT EXISTS public.debts (
    id TEXT PRIMARY KEY,
    debtor_name TEXT NOT NULL,
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
    paid_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
    remaining_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
    date TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('borcdadir', 'odanilib')),
    sale_id TEXT,
    notes TEXT,
    payments JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 6. Müştəri Depozit Balansları (Customer Accounts) Cədvəli
CREATE TABLE IF NOT EXISTS public.customer_accounts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    balance NUMERIC(10, 2) NOT NULL DEFAULT 0,
    total_deposited NUMERIC(10, 2) NOT NULL DEFAULT 0,
    total_spent NUMERIC(10, 2) NOT NULL DEFAULT 0,
    notes TEXT,
    transactions JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 7. Gündəlik Kassa Hesabatı (Daily Reports) Cədvəli
CREATE TABLE IF NOT EXISTS public.daily_reports (
    id TEXT PRIMARY KEY,
    date TEXT UNIQUE NOT NULL,
    cash_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
    card_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
    pos_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
    total_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
    is_manually_adjusted BOOLEAN NOT NULL DEFAULT false,
    difference NUMERIC(10, 2) NOT NULL DEFAULT 0,
    notes TEXT,
    updated_by TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 8. Xərclər (Expenses) Cədvəli
CREATE TABLE IF NOT EXISTS public.expenses (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    category TEXT NOT NULL,
    amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    created_by TEXT NOT NULL
);

-- 9. Proqram Parametrləri (App Settings) Cədvəli
CREATE TABLE IF NOT EXISTS public.app_settings (
    id TEXT PRIMARY KEY DEFAULT 'global',
    min_stock_threshold INTEGER NOT NULL DEFAULT 5,
    auto_confirm_sales BOOLEAN NOT NULL DEFAULT true,
    bar_name TEXT NOT NULL DEFAULT 'Zal Barı',
    enable_push_notifications BOOLEAN NOT NULL DEFAULT true
);

-- 10. Əməliyyat Jurnalı (Audit Logs) Cədvəli
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id TEXT PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    user_id TEXT NOT NULL,
    username TEXT NOT NULL,
    action TEXT NOT NULL,
    details TEXT NOT NULL
);

-- =================================================================
-- REALTIME SİNXRONİZASİYA (Supabase Realtime Aktivləşdirilməsi)
-- =================================================================
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE 
      public.users,
      public.products,
      public.purchases,
      public.sales,
      public.debts,
      public.customer_accounts,
      public.daily_reports,
      public.expenses,
      public.app_settings,
      public.audit_logs;
  EXCEPTION
    WHEN duplicate_object THEN
      NULL;
    WHEN undefined_object THEN
      CREATE PUBLICATION supabase_realtime FOR ALL TABLES;
  END;
END $$;

-- =================================================================
-- ROW LEVEL SECURITY (RLS) VƏ İCAZƏLƏR
-- =================================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- DROP POLICY IF EXISTS xətanın qarşısını alır (42710 xətası vermir)
DROP POLICY IF EXISTS "Anon Select Users" ON public.users;
CREATE POLICY "Anon Select Users" ON public.users FOR SELECT USING (true);
DROP POLICY IF EXISTS "Anon Modify Users" ON public.users;
CREATE POLICY "Anon Modify Users" ON public.users FOR ALL USING (true);

DROP POLICY IF EXISTS "Anon Select Products" ON public.products;
CREATE POLICY "Anon Select Products" ON public.products FOR SELECT USING (true);
DROP POLICY IF EXISTS "Anon Modify Products" ON public.products;
CREATE POLICY "Anon Modify Products" ON public.products FOR ALL USING (true);

DROP POLICY IF EXISTS "Anon Select Purchases" ON public.purchases;
CREATE POLICY "Anon Select Purchases" ON public.purchases FOR SELECT USING (true);
DROP POLICY IF EXISTS "Anon Modify Purchases" ON public.purchases;
CREATE POLICY "Anon Modify Purchases" ON public.purchases FOR ALL USING (true);

DROP POLICY IF EXISTS "Anon Select Sales" ON public.sales;
CREATE POLICY "Anon Select Sales" ON public.sales FOR SELECT USING (true);
DROP POLICY IF EXISTS "Anon Modify Sales" ON public.sales;
CREATE POLICY "Anon Modify Sales" ON public.sales FOR ALL USING (true);

DROP POLICY IF EXISTS "Anon Select Debts" ON public.debts;
CREATE POLICY "Anon Select Debts" ON public.debts FOR SELECT USING (true);
DROP POLICY IF EXISTS "Anon Modify Debts" ON public.debts;
CREATE POLICY "Anon Modify Debts" ON public.debts FOR ALL USING (true);

DROP POLICY IF EXISTS "Anon Select CustomerAccounts" ON public.customer_accounts;
CREATE POLICY "Anon Select CustomerAccounts" ON public.customer_accounts FOR SELECT USING (true);
DROP POLICY IF EXISTS "Anon Modify CustomerAccounts" ON public.customer_accounts;
CREATE POLICY "Anon Modify CustomerAccounts" ON public.customer_accounts FOR ALL USING (true);

DROP POLICY IF EXISTS "Anon Select DailyReports" ON public.daily_reports;
CREATE POLICY "Anon Select DailyReports" ON public.daily_reports FOR SELECT USING (true);
DROP POLICY IF EXISTS "Anon Modify DailyReports" ON public.daily_reports;
CREATE POLICY "Anon Modify DailyReports" ON public.daily_reports FOR ALL USING (true);

DROP POLICY IF EXISTS "Anon Select Expenses" ON public.expenses;
CREATE POLICY "Anon Select Expenses" ON public.expenses FOR SELECT USING (true);
DROP POLICY IF EXISTS "Anon Modify Expenses" ON public.expenses;
CREATE POLICY "Anon Modify Expenses" ON public.expenses FOR ALL USING (true);

DROP POLICY IF EXISTS "Anon Select Settings" ON public.app_settings;
CREATE POLICY "Anon Select Settings" ON public.app_settings FOR SELECT USING (true);
DROP POLICY IF EXISTS "Anon Modify Settings" ON public.app_settings;
CREATE POLICY "Anon Modify Settings" ON public.app_settings FOR ALL USING (true);

DROP POLICY IF EXISTS "Anon Select AuditLogs" ON public.audit_logs;
CREATE POLICY "Anon Select AuditLogs" ON public.audit_logs FOR SELECT USING (true);
DROP POLICY IF EXISTS "Anon Modify AuditLogs" ON public.audit_logs;
CREATE POLICY "Anon Modify AuditLogs" ON public.audit_logs FOR ALL USING (true);

-- =================================================================
-- İLKİN MƏLUMATLARIN ƏLAVƏ EDİLMƏSİ (ORİJİNAL BAZA NÜSXƏSİ)
-- =================================================================

-- İstifadəçilər (admin2025 və isci123)
INSERT INTO public.users (id, username, password, name, role, is_active)
VALUES 
  ('u-admin', 'admin', 'admin2025', 'Admin', 'admin', true),
  ('u-isci1', 'isci', 'isci123', 'İşçi', 'isci', true)
ON CONFLICT (username) DO UPDATE SET password = EXCLUDED.password;

-- Default Parametrlər
INSERT INTO public.app_settings (id, min_stock_threshold, auto_confirm_sales, bar_name, enable_push_notifications)
VALUES ('global', 5, true, 'Zal Barı', true)
ON CONFLICT (id) DO NOTHING;

-- 12 Orijinal Məhsul
INSERT INTO public.products (id, name, barcode, sale_price, buy_price, category, volume, initial_stock, min_stock_alert, note)
VALUES 
  ('1773240212046', '0,5su', '05su', 0.60, 0.35, 'Su', '', 50, 5, ''),
  ('1773240232491', '1 L Su', '1su', 1.00, 0.50, 'Su', '', 40, 5, ''),
  ('1773240263684', 'Lifalib', '0101', 2.00, 1.20, 'Digər', '', 30, 5, ''),
  ('1773240366882', 'Protein(turkiyə)', '0102', 3.00, 1.80, 'Protein', '', 25, 5, ''),
  ('1773240409890', 'Amino Hardcore', '0103', 0.50, 0.25, 'Su', '', 60, 5, ''),
  ('1773240439209', 'Real mass', '0104', 4.00, 2.50, 'Su', '', 20, 5, ''),
  ('1773240467571', 'Bcaa', '0105', 3.50, 2.00, 'Su', '', 25, 5, ''),
  ('1773240487372', 'Kreatin', '0106', 3.00, 1.80, 'Su', '', 25, 5, ''),
  ('1773240509650', 'Qeyner', '0107', 4.00, 2.50, 'Su', '', 20, 5, ''),
  ('1773240552723', 'Olimp bcaa', '0108', 3.50, 2.20, 'Su', '', 15, 5, ''),
  ('1773240578556', 'Nitrofull bcaa', '0109', 3.00, 1.90, 'Su', '', 15, 5, ''),
  ('1773240632349', 'Su', '0110', 0.60, 0.35, 'Su', '', 50, 5, '')
ON CONFLICT (id) DO NOTHING;

-- Müştəri Depozit Hesabı (Əli: 10 AZN)
INSERT INTO public.customer_accounts (id, name, balance, total_deposited, total_spent, notes, transactions)
VALUES (
  'cust-ali',
  'Əli',
  10.00,
  10.00,
  0.00,
  'Qabaqcadan depozit ödənişi',
  '[{"id": "ctx-1", "type": "deposit", "amount": 10.00, "date": "2026-11-11", "time": "12:00", "note": "Balans artırılması (NAĞD)"}]'::jsonb
)
ON CONFLICT (id) DO NOTHING;
