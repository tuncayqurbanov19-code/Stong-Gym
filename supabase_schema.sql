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
    subtotal_amount NUMERIC(10, 2),
    discount_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
    total_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
    payment_type TEXT NOT NULL CHECK (payment_type IN ('naqd', 'kart', 'pos', 'borc', 'balans')),
    debtor_name TEXT,
    debtor_phone TEXT,
    original_date TEXT,
    date_changed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
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
    debtor_phone TEXT,
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
    paid_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
    remaining_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
    date TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('borcdadir', 'qismen', 'odanilib')),
    sale_id TEXT,
    notes TEXT,
    payments JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 5b. Borc Ödənişləri (Debt Payments) Cədvəli
CREATE TABLE IF NOT EXISTS public.debt_payments (
    id TEXT PRIMARY KEY,
    debt_id TEXT NOT NULL REFERENCES public.debts(id) ON DELETE CASCADE,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
    payment_method TEXT NOT NULL DEFAULT 'naqd' CHECK (payment_method IN ('naqd', 'kart', 'pos', 'kocurme')),
    received_by TEXT NOT NULL DEFAULT 'admin',
    paid_at TEXT NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 6. Müştəri Depozit Balansları (Customer Accounts) Cədvəli
CREATE TABLE IF NOT EXISTS public.customer_accounts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    balance NUMERIC(10, 2) NOT NULL DEFAULT 0,
    total_deposited NUMERIC(10, 2) NOT NULL DEFAULT 0,
    total_spent NUMERIC(10, 2) NOT NULL DEFAULT 0,
    total_withdrawn NUMERIC(10, 2) NOT NULL DEFAULT 0,
    opened_date TEXT,
    notes TEXT,
    transactions JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_by TEXT
);

-- 6b. Müştəri Balans Əməliyyatları Jurnalı (Customer Balance Transactions)
CREATE TABLE IF NOT EXISTS public.customer_balance_transactions (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES public.customer_accounts(id) ON DELETE CASCADE,
    customer_name TEXT NOT NULL,
    tx_type TEXT NOT NULL CHECK (tx_type IN ('open', 'deposit', 'withdraw', 'product_out', 'charge', 'adjustment')),
    amount NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
    balance_before NUMERIC(10, 2) NOT NULL DEFAULT 0,
    balance_after NUMERIC(10, 2) NOT NULL DEFAULT 0,
    payment_method TEXT CHECK (payment_method IN ('naqd', 'kart', 'pos', 'kocurme', 'balans')),
    product_id TEXT REFERENCES public.products(id) ON DELETE SET NULL,
    product_name TEXT,
    quantity INTEGER,
    unit_price NUMERIC(10, 2),
    sale_id TEXT,
    tx_date TEXT NOT NULL,
    tx_time TEXT NOT NULL DEFAULT '00:00',
    note TEXT,
    created_by TEXT NOT NULL DEFAULT 'admin',
    idempotency_key TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 6c. Depo Hərəkət Jurnalı (Depo Movements)
CREATE TABLE IF NOT EXISTS public.depo_movements (
    id TEXT PRIMARY KEY,
    movement_type TEXT NOT NULL CHECK (movement_type IN ('normal_sale_out', 'balance_product_out', 'purchase_in', 'manual_adjustment')),
    product_id TEXT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    product_name TEXT NOT NULL,
    quantity_delta INTEGER NOT NULL,
    stock_before INTEGER,
    stock_after INTEGER,
    unit_price NUMERIC(10, 2),
    total_amount NUMERIC(10, 2),
    customer_name TEXT,
    reference_id TEXT,
    movement_date TEXT NOT NULL,
    movement_time TEXT NOT NULL DEFAULT '00:00',
    source_label TEXT,
    note TEXT,
    created_by TEXT NOT NULL DEFAULT 'admin',
    idempotency_key TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
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

-- 9. Proqram Parametrləri (App Settings) Key-Value Cədvəli
CREATE TABLE IF NOT EXISTS public.app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- =================================================================
-- SUPABASE STORAGE: 'branding' BUCKET VƏ İCAZƏLƏR
-- =================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'branding',
    'branding',
    true,
    2097152,
    ARRAY['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = 2097152,
    allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];

DROP POLICY IF EXISTS "Public Read Branding" ON storage.objects;
CREATE POLICY "Public Read Branding" ON storage.objects
    FOR SELECT USING (bucket_id = 'branding');

DROP POLICY IF EXISTS "Admin Insert Branding" ON storage.objects;
CREATE POLICY "Admin Insert Branding" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'branding');

DROP POLICY IF EXISTS "Admin Update Branding" ON storage.objects;
CREATE POLICY "Admin Update Branding" ON storage.objects
    FOR UPDATE USING (bucket_id = 'branding');

DROP POLICY IF EXISTS "Admin Delete Branding" ON storage.objects;
CREATE POLICY "Admin Delete Branding" ON storage.objects
    FOR DELETE USING (bucket_id = 'branding');


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
      public.debt_payments,
      public.customer_accounts,
      public.customer_balance_transactions,
      public.depo_movements,
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
ALTER TABLE public.debt_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_balance_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.depo_movements ENABLE ROW LEVEL SECURITY;
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

DROP POLICY IF EXISTS "Anon Select DebtPayments" ON public.debt_payments;
CREATE POLICY "Anon Select DebtPayments" ON public.debt_payments FOR SELECT USING (true);
DROP POLICY IF EXISTS "Anon Modify DebtPayments" ON public.debt_payments;
CREATE POLICY "Anon Modify DebtPayments" ON public.debt_payments FOR ALL USING (true);

DROP POLICY IF EXISTS "Anon Select CustomerAccounts" ON public.customer_accounts;
CREATE POLICY "Anon Select CustomerAccounts" ON public.customer_accounts FOR SELECT USING (true);
DROP POLICY IF EXISTS "Anon Modify CustomerAccounts" ON public.customer_accounts;
CREATE POLICY "Anon Modify CustomerAccounts" ON public.customer_accounts FOR ALL USING (true);

DROP POLICY IF EXISTS "Anon Select CustomerBalanceTx" ON public.customer_balance_transactions;
CREATE POLICY "Anon Select CustomerBalanceTx" ON public.customer_balance_transactions FOR SELECT USING (true);
DROP POLICY IF EXISTS "Anon Modify CustomerBalanceTx" ON public.customer_balance_transactions;
CREATE POLICY "Anon Modify CustomerBalanceTx" ON public.customer_balance_transactions FOR ALL USING (true);

DROP POLICY IF EXISTS "Anon Select DepoMovements" ON public.depo_movements;
CREATE POLICY "Anon Select DepoMovements" ON public.depo_movements FOR SELECT USING (true);
DROP POLICY IF EXISTS "Anon Modify DepoMovements" ON public.depo_movements;
CREATE POLICY "Anon Modify DepoMovements" ON public.depo_movements FOR ALL USING (true);

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

-- Default Parametrlər (Key-Value)
INSERT INTO public.app_settings (key, value)
VALUES
  ('app_name', 'Zal Barı'),
  ('logo_url', ''),
  ('primary_color', '#dc2626'),
  ('logo_size', 'md'),
  ('min_stock_threshold', '5'),
  ('auto_confirm_sales', 'true'),
  ('enable_push_notifications', 'true')
ON CONFLICT (key) DO NOTHING;

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

-- İndekslər
CREATE INDEX IF NOT EXISTS idx_products_barcode ON public.products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_barcode_lower ON public.products(lower(trim(barcode)));
CREATE INDEX IF NOT EXISTS idx_debt_payments_debt_id ON public.debt_payments(debt_id);
CREATE INDEX IF NOT EXISTS idx_debt_payments_paid_at ON public.debt_payments(paid_at);
CREATE INDEX IF NOT EXISTS idx_debt_payments_received_by ON public.debt_payments(received_by);
CREATE INDEX IF NOT EXISTS idx_sales_date_created_by ON public.sales(date, created_by);
CREATE INDEX IF NOT EXISTS idx_sales_date ON public.sales(date);
CREATE INDEX IF NOT EXISTS idx_debts_status_remaining ON public.debts(status, remaining_amount);
CREATE INDEX IF NOT EXISTS idx_cbt_customer_id ON public.customer_balance_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_cbt_tx_date ON public.customer_balance_transactions(tx_date);
CREATE INDEX IF NOT EXISTS idx_cbt_tx_type ON public.customer_balance_transactions(tx_type);
CREATE INDEX IF NOT EXISTS idx_depo_movements_product_id ON public.depo_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_depo_movements_type ON public.depo_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_depo_movements_date ON public.depo_movements(movement_date);

-- =================================================================
-- ATOMİK RPC FUNKSİYALARI
-- =================================================================
CREATE OR REPLACE FUNCTION public.upsert_app_setting(
  p_key TEXT,
  p_value TEXT,
  p_actor_username TEXT DEFAULT 'admin'
)
RETURNS TABLE (key TEXT, value TEXT, updated_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_admin BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE lower(u.username) = lower(COALESCE(p_actor_username, ''))
      AND u.role = 'admin'
      AND u.is_active = true
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'İcazə yoxdur: Yalnız Admin dizayn və sistem parametrlərini dəyişə bilər.';
  END IF;

  INSERT INTO public.app_settings (key, value, updated_at)
  VALUES (p_key, COALESCE(p_value, ''), timezone('utc'::text, now()))
  ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value,
      updated_at = timezone('utc'::text, now());

  RETURN QUERY
  SELECT s.key, s.value, s.updated_at FROM public.app_settings s WHERE s.key = p_key;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_debt_payment(
  p_debt_id TEXT,
  p_amount NUMERIC,
  p_payment_method TEXT DEFAULT 'naqd',
  p_received_by TEXT DEFAULT 'admin',
  p_paid_at TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_payment_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_debt public.debts%ROWTYPE;
  v_clean_amount NUMERIC(10, 2);
  v_method TEXT;
  v_paid_at TEXT;
  v_payment_id TEXT;
  v_new_paid NUMERIC(10, 2);
  v_new_remaining NUMERIC(10, 2);
  v_new_status TEXT;
  v_payments_json JSONB;
BEGIN
  SELECT * INTO v_debt FROM public.debts WHERE id = p_debt_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Borc qeydi tapılmadı: %', p_debt_id;
  END IF;

  v_clean_amount := ROUND(COALESCE(p_amount, 0)::numeric, 2);
  IF v_clean_amount <= 0 THEN
    RAISE EXCEPTION 'Ödəniş məbləği 0-dan böyük olmalıdır.';
  END IF;

  IF v_clean_amount > (v_debt.remaining_amount + 0.01) THEN
    RAISE EXCEPTION 'Ödəniş məbləği (%) qalıq borcdan (%) böyük ola bilməz.', v_clean_amount, v_debt.remaining_amount;
  END IF;

  IF v_clean_amount > v_debt.remaining_amount THEN
    v_clean_amount := v_debt.remaining_amount;
  END IF;

  v_method := lower(COALESCE(p_payment_method, 'naqd'));
  IF v_method NOT IN ('naqd', 'kart', 'pos', 'kocurme') THEN
    RAISE EXCEPTION 'Etibarsız ödəniş növü: %', v_method;
  END IF;

  v_paid_at := COALESCE(NULLIF(TRIM(p_paid_at), ''), to_char(timezone('Asia/Baku', now()), 'YYYY-MM-DD'));
  v_payment_id := COALESCE(NULLIF(TRIM(p_payment_id), ''), 'pay-' || (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint::text);

  INSERT INTO public.debt_payments (id, debt_id, amount, payment_method, received_by, paid_at, note)
  VALUES (v_payment_id, p_debt_id, v_clean_amount, v_method, COALESCE(NULLIF(TRIM(p_received_by), ''), 'admin'), v_paid_at, NULLIF(TRIM(p_note), ''));

  SELECT COALESCE(SUM(amount), 0) INTO v_new_paid FROM public.debt_payments WHERE debt_id = p_debt_id;
  v_new_paid := LEAST(v_debt.total_amount, ROUND(v_new_paid, 2));
  v_new_remaining := GREATEST(0, ROUND(v_debt.total_amount - v_new_paid, 2));
  v_new_status := CASE
    WHEN v_new_remaining <= 0.009 THEN 'odanilib'
    WHEN v_new_paid > 0 THEN 'qismen'
    ELSE 'borcdadir'
  END;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', dp.id,
        'debtId', dp.debt_id,
        'date', dp.paid_at,
        'paidAt', dp.paid_at,
        'amount', dp.amount,
        'paymentMethod', dp.payment_method,
        'receivedBy', dp.received_by,
        'note', dp.note,
        'createdAt', dp.created_at
      )
      ORDER BY dp.created_at DESC
    ),
    '[]'::jsonb
  ) INTO v_payments_json
  FROM public.debt_payments dp
  WHERE dp.debt_id = p_debt_id;

  UPDATE public.debts
  SET
    paid_amount = v_new_paid,
    remaining_amount = CASE WHEN v_new_status = 'odanilib' THEN 0 ELSE v_new_remaining END,
    status = v_new_status,
    payments = v_payments_json,
    updated_at = timezone('utc'::text, now())
  WHERE id = p_debt_id;

  RETURN jsonb_build_object(
    'payment_id', v_payment_id,
    'debt_id', p_debt_id,
    'paid_amount', v_new_paid,
    'remaining_amount', CASE WHEN v_new_status = 'odanilib' THEN 0 ELSE v_new_remaining END,
    'status', v_new_status
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_debt_payment(
  p_payment_id TEXT,
  p_actor_username TEXT DEFAULT 'admin'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_debt_id TEXT;
  v_debt public.debts%ROWTYPE;
  v_new_paid NUMERIC(10, 2);
  v_new_remaining NUMERIC(10, 2);
  v_new_status TEXT;
  v_payments_json JSONB;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE lower(u.username) = lower(COALESCE(p_actor_username, ''))
      AND u.role = 'admin'
      AND u.is_active = true
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'İcazə yoxdur: Yalnız Admin borc ödənişini silə bilər.';
  END IF;

  SELECT debt_id INTO v_debt_id FROM public.debt_payments WHERE id = p_payment_id;
  IF v_debt_id IS NULL THEN
    RAISE EXCEPTION 'Borc ödənişi tapılmadı: %', p_payment_id;
  END IF;

  SELECT * INTO v_debt FROM public.debts WHERE id = v_debt_id FOR UPDATE;
  DELETE FROM public.debt_payments WHERE id = p_payment_id;

  SELECT COALESCE(SUM(amount), 0) INTO v_new_paid FROM public.debt_payments WHERE debt_id = v_debt_id;
  v_new_paid := LEAST(v_debt.total_amount, ROUND(v_new_paid, 2));
  v_new_remaining := GREATEST(0, ROUND(v_debt.total_amount - v_new_paid, 2));
  v_new_status := CASE
    WHEN v_new_remaining <= 0.009 THEN 'odanilib'
    WHEN v_new_paid > 0 THEN 'qismen'
    ELSE 'borcdadir'
  END;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', dp.id,
        'debtId', dp.debt_id,
        'date', dp.paid_at,
        'paidAt', dp.paid_at,
        'amount', dp.amount,
        'paymentMethod', dp.payment_method,
        'receivedBy', dp.received_by,
        'note', dp.note,
        'createdAt', dp.created_at
      )
      ORDER BY dp.created_at DESC
    ),
    '[]'::jsonb
  ) INTO v_payments_json
  FROM public.debt_payments dp
  WHERE dp.debt_id = v_debt_id;

  UPDATE public.debts
  SET
    paid_amount = v_new_paid,
    remaining_amount = CASE WHEN v_new_status = 'odanilib' THEN 0 ELSE v_new_remaining END,
    status = v_new_status,
    payments = v_payments_json,
    updated_at = timezone('utc'::text, now())
  WHERE id = v_debt_id;

  RETURN jsonb_build_object(
    'deleted_payment_id', p_payment_id,
    'debt_id', v_debt_id,
    'paid_amount', v_new_paid,
    'remaining_amount', CASE WHEN v_new_status = 'odanilib' THEN 0 ELSE v_new_remaining END,
    'status', v_new_status
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_daily_sales_breakdown(
  p_start_date TEXT,
  p_end_date TEXT,
  p_staff TEXT DEFAULT NULL
)
RETURNS TABLE (
  staff_username TEXT,
  staff_name TEXT,
  cash_amount NUMERIC,
  card_amount NUMERIC,
  pos_amount NUMERIC,
  balance_amount NUMERIC,
  credit_amount NUMERIC,
  sales_count BIGINT,
  debt_payments_count BIGINT,
  sales_inflow NUMERIC,
  debt_inflow NUMERIC,
  total_inflow NUMERIC,
  avg_check NUMERIC
)
LANGUAGE sql
STABLE
AS $$
  WITH staff_sales AS (
    SELECT
      s.created_by AS staff_username,
      COUNT(*) AS sales_count,
      SUM(CASE WHEN s.payment_type = 'naqd' THEN s.total_amount ELSE 0 END) AS cash_sales,
      SUM(CASE WHEN s.payment_type = 'kart' THEN s.total_amount ELSE 0 END) AS card_sales,
      SUM(CASE WHEN s.payment_type = 'pos' THEN s.total_amount ELSE 0 END) AS pos_sales,
      SUM(CASE WHEN s.payment_type = 'balans' THEN s.total_amount ELSE 0 END) AS balance_sales,
      SUM(CASE WHEN s.payment_type = 'borc' THEN s.total_amount ELSE 0 END) AS credit_sales,
      SUM(CASE WHEN s.payment_type IN ('naqd', 'kart', 'pos') THEN s.total_amount ELSE 0 END) AS sales_inflow,
      SUM(s.total_amount) AS gross_sales_amount
    FROM public.sales s
    WHERE s.is_confirmed = true
      AND s.date >= p_start_date
      AND s.date <= p_end_date
      AND (p_staff IS NULL OR lower(s.created_by) = lower(p_staff))
    GROUP BY s.created_by
  ),
  staff_debt_payments AS (
    SELECT
      dp.received_by AS staff_username,
      COUNT(*) AS debt_payments_count,
      SUM(CASE WHEN dp.payment_method = 'naqd' THEN dp.amount ELSE 0 END) AS debt_cash,
      SUM(CASE WHEN dp.payment_method = 'kart' THEN dp.amount ELSE 0 END) AS debt_card,
      SUM(CASE WHEN dp.payment_method IN ('pos', 'kocurme') THEN dp.amount ELSE 0 END) AS debt_pos,
      SUM(dp.amount) AS debt_inflow
    FROM public.debt_payments dp
    WHERE dp.paid_at >= p_start_date
      AND dp.paid_at <= p_end_date
      AND (p_staff IS NULL OR lower(dp.received_by) = lower(p_staff))
    GROUP BY dp.received_by
  ),
  all_staff AS (
    SELECT staff_username FROM staff_sales
    UNION
    SELECT staff_username FROM staff_debt_payments
  )
  SELECT
    a.staff_username,
    COALESCE(u.name, a.staff_username) AS staff_name,
    COALESCE(ss.cash_sales, 0) + COALESCE(sd.debt_cash, 0) AS cash_amount,
    COALESCE(ss.card_sales, 0) + COALESCE(sd.debt_card, 0) AS card_amount,
    COALESCE(ss.pos_sales, 0) + COALESCE(sd.debt_pos, 0) AS pos_amount,
    COALESCE(ss.balance_sales, 0) AS balance_amount,
    COALESCE(ss.credit_sales, 0) AS credit_amount,
    COALESCE(ss.sales_count, 0) AS sales_count,
    COALESCE(sd.debt_payments_count, 0) AS debt_payments_count,
    COALESCE(ss.sales_inflow, 0) AS sales_inflow,
    COALESCE(sd.debt_inflow, 0) AS debt_inflow,
    COALESCE(ss.sales_inflow, 0) + COALESCE(sd.debt_inflow, 0) AS total_inflow,
    CASE
      WHEN COALESCE(ss.sales_count, 0) > 0
        THEN ROUND(COALESCE(ss.gross_sales_amount, 0) / ss.sales_count, 2)
      ELSE 0
    END AS avg_check
  FROM all_staff a
  LEFT JOIN public.users u ON lower(u.username) = lower(a.staff_username)
  LEFT JOIN staff_sales ss ON lower(ss.staff_username) = lower(a.staff_username)
  LEFT JOIN staff_debt_payments sd ON lower(sd.staff_username) = lower(a.staff_username)
  ORDER BY total_inflow DESC, staff_name ASC;
$$;

DROP FUNCTION IF EXISTS public.get_financial_summary(TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.get_financial_summary(
  p_start_date TEXT,
  p_end_date TEXT
)
RETURNS TABLE (
  gross_sales_total NUMERIC,
  normal_sales_total NUMERIC,
  sales_count BIGINT,
  total_items_sold BIGINT,
  total_discounts NUMERIC,
  cash_sales NUMERIC,
  card_sales NUMERIC,
  pos_sales NUMERIC,
  balance_sales NUMERIC,
  credit_sales NUMERIC,
  sales_real_inflow NUMERIC,
  debt_collected_total NUMERIC,
  debt_collected_cash NUMERIC,
  debt_collected_card NUMERIC,
  debt_collected_pos NUMERIC,
  debt_collected_count BIGINT,
  balance_deposits_total NUMERIC,
  balance_cash_withdrawals NUMERIC,
  balance_cash_withdrawals_cash NUMERIC,
  balance_cash_withdrawals_card NUMERIC,
  balance_cash_withdrawals_pos NUMERIC,
  actual_drawer_inflow NUMERIC,
  purchases_outflow NUMERIC,
  expenses_outflow NUMERIC,
  total_cash_outflow NUMERIC,
  net_cash_balance NUMERIC,
  total_unpaid_debts NUMERIC
)
LANGUAGE sql
STABLE
AS $$
  WITH filtered_sales AS (
    SELECT *
    FROM public.sales s
    WHERE (s.is_confirmed = true OR s.payment_type = 'borc')
      AND s.date >= p_start_date
      AND s.date <= p_end_date
  ),
  s_agg AS (
    SELECT
      COALESCE(SUM(total_amount), 0) AS gross_sales_total,
      COALESCE(SUM(CASE WHEN payment_type <> 'balans' THEN total_amount ELSE 0 END), 0) AS normal_sales_total,
      COUNT(*) AS sales_count,
      COALESCE(SUM(COALESCE(discount_amount, 0)), 0) AS total_discounts,
      COALESCE(SUM(CASE WHEN payment_type = 'naqd' THEN total_amount ELSE 0 END), 0) AS cash_sales,
      COALESCE(SUM(CASE WHEN payment_type = 'kart' THEN total_amount ELSE 0 END), 0) AS card_sales,
      COALESCE(SUM(CASE WHEN payment_type = 'pos' THEN total_amount ELSE 0 END), 0) AS pos_sales,
      COALESCE(SUM(CASE WHEN payment_type = 'balans' THEN total_amount ELSE 0 END), 0) AS balance_sales,
      COALESCE(SUM(CASE WHEN payment_type = 'borc' THEN total_amount ELSE 0 END), 0) AS credit_sales,
      COALESCE(SUM(CASE WHEN payment_type IN ('naqd', 'kart', 'pos') THEN total_amount ELSE 0 END), 0) AS sales_real_inflow
    FROM filtered_sales
  ),
  items_agg AS (
    SELECT
      COALESCE(SUM(COALESCE((elem->>'quantity')::bigint, 0)), 0) AS total_items_sold
    FROM filtered_sales fs
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(fs.items, '[]'::jsonb)) AS elem
  ),
  dp_agg AS (
    SELECT
      COALESCE(SUM(amount), 0) AS debt_collected_total,
      COALESCE(SUM(CASE WHEN payment_method = 'naqd' THEN amount ELSE 0 END), 0) AS debt_collected_cash,
      COALESCE(SUM(CASE WHEN payment_method = 'kart' THEN amount ELSE 0 END), 0) AS debt_collected_card,
      COALESCE(SUM(CASE WHEN payment_method IN ('pos', 'kocurme') THEN amount ELSE 0 END), 0) AS debt_collected_pos,
      COUNT(*) AS debt_collected_count
    FROM public.debt_payments
    WHERE paid_at >= p_start_date
      AND paid_at <= p_end_date
  ),
  bal_agg AS (
    SELECT
      COALESCE(SUM(CASE WHEN tx_type IN ('open', 'deposit') THEN amount ELSE 0 END), 0) AS balance_deposits_total,
      COALESCE(SUM(CASE WHEN tx_type = 'withdraw' THEN amount ELSE 0 END), 0) AS balance_cash_withdrawals,
      COALESCE(SUM(CASE WHEN tx_type = 'withdraw' AND COALESCE(payment_method, 'naqd') = 'naqd' THEN amount ELSE 0 END), 0) AS balance_cash_withdrawals_cash,
      COALESCE(SUM(CASE WHEN tx_type = 'withdraw' AND payment_method = 'kart' THEN amount ELSE 0 END), 0) AS balance_cash_withdrawals_card,
      COALESCE(SUM(CASE WHEN tx_type = 'withdraw' AND payment_method IN ('pos', 'kocurme') THEN amount ELSE 0 END), 0) AS balance_cash_withdrawals_pos
    FROM public.customer_balance_transactions
    WHERE tx_date >= p_start_date
      AND tx_date <= p_end_date
  ),
  pur_agg AS (
    SELECT COALESCE(SUM(paid_amount), 0) AS purchases_outflow
    FROM public.purchases
    WHERE date >= p_start_date AND date <= p_end_date
  ),
  exp_agg AS (
    SELECT COALESCE(SUM(amount), 0) AS expenses_outflow
    FROM public.expenses
    WHERE date >= p_start_date AND date <= p_end_date
  ),
  unpaid_agg AS (
    SELECT COALESCE(SUM(remaining_amount), 0) AS total_unpaid_debts
    FROM public.debts
    WHERE status IN ('borcdadir', 'qismen')
      AND remaining_amount > 0
  )
  SELECT
    s.gross_sales_total,
    s.normal_sales_total,
    s.sales_count,
    ia.total_items_sold,
    s.total_discounts,
    s.cash_sales,
    s.card_sales,
    s.pos_sales,
    s.balance_sales,
    s.credit_sales,
    s.sales_real_inflow,
    dp.debt_collected_total,
    dp.debt_collected_cash,
    dp.debt_collected_card,
    dp.debt_collected_pos,
    dp.debt_collected_count,
    b.balance_deposits_total,
    b.balance_cash_withdrawals,
    b.balance_cash_withdrawals_cash,
    b.balance_cash_withdrawals_card,
    b.balance_cash_withdrawals_pos,
    (s.sales_real_inflow + dp.debt_collected_total) AS actual_drawer_inflow,
    pur.purchases_outflow,
    exp.expenses_outflow,
    (pur.purchases_outflow + exp.expenses_outflow + b.balance_cash_withdrawals) AS total_cash_outflow,
    ((s.sales_real_inflow + dp.debt_collected_total) - (pur.purchases_outflow + exp.expenses_outflow + b.balance_cash_withdrawals)) AS net_cash_balance,
    u.total_unpaid_debts
  FROM s_agg s, items_agg ia, dp_agg dp, bal_agg b, pur_agg pur, exp_agg exp, unpaid_agg u;
$$;

-- Balans və Depo Atomik RPC-ləri:
-- Əlavə olaraq supabase/migrations/20261115_balance_sales_depo_integration.sql skripti də icra edilməlidir.
CREATE OR REPLACE FUNCTION public.open_or_deposit_customer_balance(
  p_customer_id TEXT DEFAULT NULL,
  p_customer_name TEXT DEFAULT '',
  p_phone TEXT DEFAULT NULL,
  p_amount NUMERIC DEFAULT 0,
  p_payment_method TEXT DEFAULT 'naqd',
  p_date TEXT DEFAULT NULL,
  p_time TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_actor_username TEXT DEFAULT 'admin',
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean_name TEXT;
  v_clean_amount NUMERIC(10, 2);
  v_method TEXT;
  v_date TEXT;
  v_time TEXT;
  v_actor TEXT;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
  v_cust public.customer_accounts%ROWTYPE;
  v_tx_id TEXT;
  v_tx_type TEXT;
  v_bal_before NUMERIC(10, 2);
  v_bal_after NUMERIC(10, 2);
  v_tx_obj JSONB;
  v_existing_tx public.customer_balance_transactions%ROWTYPE;
BEGIN
  IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) <> '' THEN
    SELECT * INTO v_existing_tx FROM public.customer_balance_transactions WHERE idempotency_key = TRIM(p_idempotency_key) LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('status', 'duplicate', 'tx_id', v_existing_tx.id, 'customer_id', v_existing_tx.customer_id);
    END IF;
  END IF;

  v_clean_name := TRIM(COALESCE(p_customer_name, ''));
  v_clean_amount := ROUND(COALESCE(p_amount, 0)::numeric, 2);
  v_method := lower(COALESCE(NULLIF(TRIM(p_payment_method), ''), 'naqd'));
  IF v_method NOT IN ('naqd', 'kart', 'pos', 'kocurme') THEN v_method := 'naqd'; END IF;
  v_date := COALESCE(NULLIF(TRIM(p_date), ''), to_char(timezone('Asia/Baku', now()), 'YYYY-MM-DD'));
  v_time := COALESCE(NULLIF(TRIM(p_time), ''), to_char(timezone('Asia/Baku', now()), 'HH24:MI'));
  v_actor := COALESCE(NULLIF(TRIM(p_actor_username), ''), 'admin');

  IF p_customer_id IS NOT NULL AND TRIM(p_customer_id) <> '' THEN
    SELECT * INTO v_cust FROM public.customer_accounts WHERE id = TRIM(p_customer_id) FOR UPDATE;
  END IF;
  IF NOT FOUND AND v_clean_name <> '' THEN
    SELECT * INTO v_cust FROM public.customer_accounts WHERE lower(TRIM(name)) = lower(v_clean_name) LIMIT 1 FOR UPDATE;
  END IF;

  IF FOUND THEN
    IF v_clean_amount <= 0 THEN RAISE EXCEPTION 'Məbləğ 0-dan böyük olmalıdır.'; END IF;
    v_tx_type := 'deposit';
    v_bal_before := v_cust.balance;
    v_bal_after := ROUND(v_cust.balance + v_clean_amount, 2);
    v_tx_id := 'ctx-' || (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint::text;
    v_tx_obj := jsonb_build_object(
      'id', v_tx_id, 'customerId', v_cust.id, 'customerName', v_cust.name, 'type', v_tx_type,
      'amount', v_clean_amount, 'balanceBefore', v_bal_before, 'balanceAfter', v_bal_after,
      'paymentMethod', v_method, 'date', v_date, 'time', v_time,
      'note', COALESCE(NULLIF(TRIM(p_note), ''), 'Balans artırıldı (' || upper(v_method) || ')'),
      'createdBy', v_actor, 'createdAt', v_now
    );
    UPDATE public.customer_accounts
    SET balance = v_bal_after, total_deposited = ROUND(total_deposited + v_clean_amount, 2),
        phone = COALESCE(NULLIF(TRIM(p_phone), ''), phone),
        transactions = jsonb_build_array(v_tx_obj) || COALESCE(transactions, '[]'::jsonb),
        updated_at = v_now, updated_by = v_actor
    WHERE id = v_cust.id;
    INSERT INTO public.customer_balance_transactions (
      id, customer_id, customer_name, tx_type, amount, balance_before, balance_after,
      payment_method, tx_date, tx_time, note, created_by, idempotency_key, created_at
    ) VALUES (
      v_tx_id, v_cust.id, v_cust.name, v_tx_type, v_clean_amount, v_bal_before, v_bal_after,
      v_method, v_date, v_time, v_tx_obj->>'note', v_actor, NULLIF(TRIM(p_idempotency_key), ''), v_now
    );
    RETURN jsonb_build_object('status', 'deposited', 'customer_id', v_cust.id, 'tx_id', v_tx_id, 'balance', v_bal_after);
  ELSE
    IF v_clean_name = '' THEN RAISE EXCEPTION 'Müştəri adı mütləqdir.'; END IF;
    IF v_clean_amount < 0 THEN RAISE EXCEPTION 'İlkin balans mənfi ola bilməz.'; END IF;
    v_cust.id := COALESCE(NULLIF(TRIM(p_customer_id), ''), 'cust-' || (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint::text);
    v_tx_type := 'open';
    v_bal_after := v_clean_amount;
    v_tx_id := 'ctx-' || ((EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint + 1)::text;
    v_tx_obj := jsonb_build_object(
      'id', v_tx_id, 'customerId', v_cust.id, 'customerName', v_clean_name, 'type', v_tx_type,
      'amount', v_clean_amount, 'balanceBefore', 0, 'balanceAfter', v_bal_after,
      'paymentMethod', v_method, 'date', v_date, 'time', v_time,
      'note', COALESCE(NULLIF(TRIM(p_note), ''), 'Balans açıldı (' || upper(v_method) || ')'),
      'createdBy', v_actor, 'createdAt', v_now
    );
    INSERT INTO public.customer_accounts (
      id, name, phone, balance, total_deposited, total_spent, total_withdrawn, opened_date, notes, transactions, created_at, updated_at, updated_by
    ) VALUES (
      v_cust.id, v_clean_name, NULLIF(TRIM(p_phone), ''), v_bal_after, v_clean_amount, 0, 0, v_date, NULLIF(TRIM(p_note), ''), jsonb_build_array(v_tx_obj), v_now, v_now, v_actor
    );
    INSERT INTO public.customer_balance_transactions (
      id, customer_id, customer_name, tx_type, amount, balance_before, balance_after,
      payment_method, tx_date, tx_time, note, created_by, idempotency_key, created_at
    ) VALUES (
      v_tx_id, v_cust.id, v_clean_name, v_tx_type, v_clean_amount, 0, v_bal_after,
      v_method, v_date, v_time, v_tx_obj->>'note', v_actor, NULLIF(TRIM(p_idempotency_key), ''), v_now
    );
    RETURN jsonb_build_object('status', 'opened', 'customer_id', v_cust.id, 'tx_id', v_tx_id, 'balance', v_bal_after);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.withdraw_customer_cash(
  p_customer_id TEXT,
  p_amount NUMERIC,
  p_payment_method TEXT DEFAULT 'naqd',
  p_date TEXT DEFAULT NULL,
  p_time TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_actor_username TEXT DEFAULT 'admin',
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cust public.customer_accounts%ROWTYPE;
  v_clean_amount NUMERIC(10, 2);
  v_method TEXT;
  v_date TEXT;
  v_time TEXT;
  v_actor TEXT;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
  v_tx_id TEXT;
  v_bal_after NUMERIC(10, 2);
  v_tx_obj JSONB;
  v_existing_tx public.customer_balance_transactions%ROWTYPE;
BEGIN
  IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) <> '' THEN
    SELECT * INTO v_existing_tx FROM public.customer_balance_transactions WHERE idempotency_key = TRIM(p_idempotency_key) LIMIT 1;
    IF FOUND THEN RETURN jsonb_build_object('status', 'duplicate', 'tx_id', v_existing_tx.id); END IF;
  END IF;

  SELECT * INTO v_cust FROM public.customer_accounts WHERE id = p_customer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Müştəri hesabı tapılmadı: %', p_customer_id; END IF;
  v_clean_amount := ROUND(COALESCE(p_amount, 0)::numeric, 2);
  IF v_clean_amount <= 0 THEN RAISE EXCEPTION 'Məbləğ 0-dan böyük olmalıdır.'; END IF;
  IF v_cust.balance < v_clean_amount THEN
    RAISE EXCEPTION 'Balansda kifayət qədər vəsait yoxdur! Cari balans: % AZN, Tələb: % AZN', v_cust.balance, v_clean_amount;
  END IF;

  v_method := lower(COALESCE(NULLIF(TRIM(p_payment_method), ''), 'naqd'));
  IF v_method NOT IN ('naqd', 'kart', 'pos', 'kocurme') THEN v_method := 'naqd'; END IF;
  v_date := COALESCE(NULLIF(TRIM(p_date), ''), to_char(timezone('Asia/Baku', now()), 'YYYY-MM-DD'));
  v_time := COALESCE(NULLIF(TRIM(p_time), ''), to_char(timezone('Asia/Baku', now()), 'HH24:MI'));
  v_actor := COALESCE(NULLIF(TRIM(p_actor_username), ''), 'admin');
  v_bal_after := ROUND(v_cust.balance - v_clean_amount, 2);
  v_tx_id := 'ctx-' || (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint::text;
  v_tx_obj := jsonb_build_object(
    'id', v_tx_id, 'customerId', v_cust.id, 'customerName', v_cust.name, 'type', 'withdraw',
    'amount', v_clean_amount, 'balanceBefore', v_cust.balance, 'balanceAfter', v_bal_after,
    'paymentMethod', v_method, 'date', v_date, 'time', v_time,
    'note', COALESCE(NULLIF(TRIM(p_note), ''), 'Balansdan sərbəst pul çıxarışı (' || upper(v_method) || ')'),
    'createdBy', v_actor, 'createdAt', v_now
  );

  UPDATE public.customer_accounts
  SET balance = v_bal_after, total_withdrawn = ROUND(COALESCE(total_withdrawn, 0) + v_clean_amount, 2),
      transactions = jsonb_build_array(v_tx_obj) || COALESCE(transactions, '[]'::jsonb),
      updated_at = v_now, updated_by = v_actor
  WHERE id = v_cust.id;

  INSERT INTO public.customer_balance_transactions (
    id, customer_id, customer_name, tx_type, amount, balance_before, balance_after,
    payment_method, tx_date, tx_time, note, created_by, idempotency_key, created_at
  ) VALUES (
    v_tx_id, v_cust.id, v_cust.name, 'withdraw', v_clean_amount, v_cust.balance, v_bal_after,
    v_method, v_date, v_time, v_tx_obj->>'note', v_actor, NULLIF(TRIM(p_idempotency_key), ''), v_now
  );

  RETURN jsonb_build_object('status', 'withdrawn', 'customer_id', v_cust.id, 'tx_id', v_tx_id, 'balance_after', v_bal_after);
END;
$$;

CREATE OR REPLACE FUNCTION public.withdraw_product_from_balance(
  p_customer_id TEXT,
  p_product_id TEXT,
  p_quantity INTEGER,
  p_date TEXT DEFAULT NULL,
  p_time TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_actor_username TEXT DEFAULT 'isci',
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cust public.customer_accounts%ROWTYPE;
  v_prod public.products%ROWTYPE;
  v_purchased INTEGER := 0;
  v_sold INTEGER := 0;
  v_active_stock INTEGER := 0;
  v_unit_price NUMERIC(10, 2);
  v_total_amount NUMERIC(10, 2);
  v_bal_after NUMERIC(10, 2);
  v_date TEXT;
  v_time TEXT;
  v_actor TEXT;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
  v_ts BIGINT := (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint;
  v_sale_id TEXT := 'sale-' || v_ts::text;
  v_tx_id TEXT := 'ctx-' || (v_ts + 1)::text;
  v_dm_id TEXT := 'dm-' || (v_ts + 2)::text;
  v_tx_obj JSONB;
  v_sale_items JSONB;
  v_existing_tx public.customer_balance_transactions%ROWTYPE;
BEGIN
  IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) <> '' THEN
    SELECT * INTO v_existing_tx FROM public.customer_balance_transactions WHERE idempotency_key = TRIM(p_idempotency_key) LIMIT 1;
    IF FOUND THEN RETURN jsonb_build_object('status', 'duplicate', 'tx_id', v_existing_tx.id, 'sale_id', v_existing_tx.sale_id); END IF;
  END IF;

  IF COALESCE(p_quantity, 0) <= 0 THEN RAISE EXCEPTION 'Məhsul miqdarı ən azı 1 ədəd olmalıdır.'; END IF;
  SELECT * INTO v_cust FROM public.customer_accounts WHERE id = p_customer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Müştəri hesabı tapılmadı: %', p_customer_id; END IF;
  SELECT * INTO v_prod FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Məhsul depoda tapılmadı: %', p_product_id; END IF;

  SELECT COALESCE(SUM(quantity), 0)::integer INTO v_purchased FROM public.purchases WHERE product_id = v_prod.id;
  SELECT COALESCE(SUM(COALESCE((elem->>'quantity')::integer, 0)), 0)::integer INTO v_sold
  FROM public.sales s CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.items, '[]'::jsonb)) AS elem
  WHERE (s.is_confirmed = true OR s.payment_type = 'borc') AND elem->>'productId' = v_prod.id;

  v_active_stock := v_prod.initial_stock + v_purchased - v_sold;
  IF v_active_stock < p_quantity THEN
    RAISE EXCEPTION '"%" üçün depoda kifayət qədər stok yoxdur! Mövcud: %, Tələb: %', v_prod.name, v_active_stock, p_quantity;
  END IF;

  v_unit_price := ROUND(COALESCE(v_prod.sale_price, 0)::numeric, 2);
  v_total_amount := ROUND(v_unit_price * p_quantity, 2);
  IF v_cust.balance < v_total_amount THEN
    RAISE EXCEPTION 'Müştərinin balansında kifayət qədər vəsait yoxdur! Balans: % AZN, Tələb: % AZN', v_cust.balance, v_total_amount;
  END IF;

  v_date := COALESCE(NULLIF(TRIM(p_date), ''), to_char(timezone('Asia/Baku', now()), 'YYYY-MM-DD'));
  v_time := COALESCE(NULLIF(TRIM(p_time), ''), to_char(timezone('Asia/Baku', now()), 'HH24:MI'));
  v_actor := COALESCE(NULLIF(TRIM(p_actor_username), ''), 'isci');
  v_bal_after := ROUND(v_cust.balance - v_total_amount, 2);
  v_sale_items := jsonb_build_array(jsonb_build_object(
    'productId', v_prod.id, 'productName', v_prod.name, 'quantity', p_quantity, 'unitPrice', v_unit_price, 'totalPrice', v_total_amount
  ));

  INSERT INTO public.sales (
    id, date, time, items, subtotal_amount, discount_amount, total_amount,
    payment_type, debtor_name, original_date, is_confirmed, confirmed_at, confirmed_by, created_at, created_by
  ) VALUES (
    v_sale_id, v_date, v_time, v_sale_items, v_total_amount, 0, v_total_amount,
    'balans', v_cust.name, v_date, true, v_now, v_actor, v_now, v_actor
  );

  v_tx_obj := jsonb_build_object(
    'id', v_tx_id, 'customerId', v_cust.id, 'customerName', v_cust.name, 'type', 'product_out',
    'amount', v_total_amount, 'balanceBefore', v_cust.balance, 'balanceAfter', v_bal_after,
    'paymentMethod', 'balans', 'productId', v_prod.id, 'productName', v_prod.name, 'quantity', p_quantity, 'unitPrice', v_unit_price,
    'saleId', v_sale_id, 'date', v_date, 'time', v_time,
    'note', COALESCE(NULLIF(TRIM(p_note), ''), 'Balansdan məhsul çıxarışı: ' || v_prod.name || ' × ' || p_quantity),
    'createdBy', v_actor, 'createdAt', v_now
  );

  UPDATE public.customer_accounts
  SET balance = v_bal_after, total_spent = ROUND(total_spent + v_total_amount, 2),
      transactions = jsonb_build_array(v_tx_obj) || COALESCE(transactions, '[]'::jsonb),
      updated_at = v_now, updated_by = v_actor
  WHERE id = v_cust.id;

  INSERT INTO public.customer_balance_transactions (
    id, customer_id, customer_name, tx_type, amount, balance_before, balance_after,
    payment_method, product_id, product_name, quantity, unit_price, sale_id, tx_date, tx_time, note, created_by, idempotency_key, created_at
  ) VALUES (
    v_tx_id, v_cust.id, v_cust.name, 'product_out', v_total_amount, v_cust.balance, v_bal_after,
    'balans', v_prod.id, v_prod.name, p_quantity, v_unit_price, v_sale_id, v_date, v_time, v_tx_obj->>'note', v_actor, NULLIF(TRIM(p_idempotency_key), ''), v_now
  );

  INSERT INTO public.depo_movements (
    id, movement_type, product_id, product_name, quantity_delta, stock_before, stock_after,
    unit_price, total_amount, customer_name, reference_id, movement_date, movement_time, source_label, note, created_by, idempotency_key, created_at
  ) VALUES (
    v_dm_id, 'balance_product_out', v_prod.id, v_prod.name, -p_quantity, v_active_stock, v_active_stock - p_quantity,
    v_unit_price, v_total_amount, v_cust.name, v_sale_id, v_date, v_time, 'Müştəri balansından çıxarış',
    v_cust.name || ' · Müştəri balansından çıxarış', v_actor, NULLIF(TRIM(p_idempotency_key), ''), v_now
  );

  RETURN jsonb_build_object(
    'status', 'completed', 'sale_id', v_sale_id, 'tx_id', v_tx_id, 'depo_movement_id', v_dm_id,
    'customer_id', v_cust.id, 'balance_after', v_bal_after, 'stock_after', v_active_stock - p_quantity
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.adjust_customer_balance(
  p_customer_id TEXT,
  p_name TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_new_balance NUMERIC DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_date TEXT DEFAULT NULL,
  p_time TEXT DEFAULT NULL,
  p_actor_username TEXT DEFAULT 'admin'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cust public.customer_accounts%ROWTYPE;
  v_is_admin BOOLEAN;
  v_actor TEXT := COALESCE(NULLIF(TRIM(p_actor_username), ''), 'admin');
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
  v_date TEXT := COALESCE(NULLIF(TRIM(p_date), ''), to_char(timezone('Asia/Baku', now()), 'YYYY-MM-DD'));
  v_time TEXT := COALESCE(NULLIF(TRIM(p_time), ''), to_char(timezone('Asia/Baku', now()), 'HH24:MI'));
  v_target_bal NUMERIC(10, 2);
  v_delta NUMERIC(10, 2);
  v_tx_id TEXT;
  v_tx_obj JSONB;
  v_next_tx JSONB;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE lower(u.username) = lower(v_actor) AND u.role = 'admin' AND u.is_active = true
  ) INTO v_is_admin;
  IF NOT v_is_admin THEN RAISE EXCEPTION 'İcazə yoxdur: Yalnız Admin balans düzəlişi edə bilər.'; END IF;

  SELECT * INTO v_cust FROM public.customer_accounts WHERE id = p_customer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Müştəri hesabı tapılmadı: %', p_customer_id; END IF;

  v_next_tx := COALESCE(v_cust.transactions, '[]'::jsonb);
  v_target_bal := v_cust.balance;

  IF p_new_balance IS NOT NULL THEN
    v_target_bal := GREATEST(0, ROUND(p_new_balance::numeric, 2));
    v_delta := ROUND(v_target_bal - v_cust.balance, 2);
    IF ABS(v_delta) >= 0.01 THEN
      v_tx_id := 'ctx-' || (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint::text;
      v_tx_obj := jsonb_build_object(
        'id', v_tx_id, 'customerId', v_cust.id, 'customerName', COALESCE(NULLIF(TRIM(p_name), ''), v_cust.name),
        'type', 'adjustment', 'amount', ABS(v_delta), 'balanceBefore', v_cust.balance, 'balanceAfter', v_target_bal,
        'adjustmentDirection', CASE WHEN v_delta > 0 THEN 'increase' ELSE 'decrease' END,
        'date', v_date, 'time', v_time, 'note', COALESCE(NULLIF(TRIM(p_reason), ''), 'Admin balans düzəlişi'),
        'createdBy', v_actor, 'createdAt', v_now
      );
      v_next_tx := jsonb_build_array(v_tx_obj) || v_next_tx;
      INSERT INTO public.customer_balance_transactions (
        id, customer_id, customer_name, tx_type, amount, balance_before, balance_after, tx_date, tx_time, note, created_by, created_at
      ) VALUES (
        v_tx_id, v_cust.id, COALESCE(NULLIF(TRIM(p_name), ''), v_cust.name),
        'adjustment', ABS(v_delta), v_cust.balance, v_target_bal, v_date, v_time, v_tx_obj->>'note', v_actor, v_now
      );
    END IF;
  END IF;

  UPDATE public.customer_accounts
  SET name = COALESCE(NULLIF(TRIM(p_name), ''), name),
      phone = CASE WHEN p_phone IS NOT NULL THEN NULLIF(TRIM(p_phone), '') ELSE phone END,
      notes = CASE WHEN p_notes IS NOT NULL THEN NULLIF(TRIM(p_notes), '') ELSE notes END,
      balance = v_target_bal, transactions = v_next_tx, updated_at = v_now, updated_by = v_actor
  WHERE id = v_cust.id;

  RETURN jsonb_build_object('status', 'adjusted', 'customer_id', v_cust.id, 'balance', v_target_bal);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_manual_depo_adjustment(
  p_product_id TEXT,
  p_target_active_stock INTEGER,
  p_date TEXT DEFAULT NULL,
  p_time TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_actor_username TEXT DEFAULT 'admin'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prod public.products%ROWTYPE;
  v_purchased INTEGER := 0;
  v_sold INTEGER := 0;
  v_old_active INTEGER := 0;
  v_new_active INTEGER := GREATEST(0, COALESCE(p_target_active_stock, 0));
  v_new_initial INTEGER := 0;
  v_delta INTEGER := 0;
  v_date TEXT := COALESCE(NULLIF(TRIM(p_date), ''), to_char(timezone('Asia/Baku', now()), 'YYYY-MM-DD'));
  v_time TEXT := COALESCE(NULLIF(TRIM(p_time), ''), to_char(timezone('Asia/Baku', now()), 'HH24:MI'));
  v_actor TEXT := COALESCE(NULLIF(TRIM(p_actor_username), ''), 'admin');
  v_dm_id TEXT := 'dm-adj-' || (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint::text;
BEGIN
  SELECT * INTO v_prod FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Məhsul tapılmadı: %', p_product_id; END IF;

  SELECT COALESCE(SUM(quantity), 0)::integer INTO v_purchased FROM public.purchases WHERE product_id = v_prod.id;
  SELECT COALESCE(SUM(COALESCE((elem->>'quantity')::integer, 0)), 0)::integer INTO v_sold
  FROM public.sales s CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.items, '[]'::jsonb)) AS elem
  WHERE (s.is_confirmed = true OR s.payment_type = 'borc') AND elem->>'productId' = v_prod.id;

  v_old_active := v_prod.initial_stock + v_purchased - v_sold;
  v_new_initial := GREATEST(0, v_new_active - v_purchased + v_sold);
  v_delta := v_new_active - v_old_active;

  UPDATE public.products SET initial_stock = v_new_initial WHERE id = v_prod.id;

  IF v_delta <> 0 THEN
    INSERT INTO public.depo_movements (
      id, movement_type, product_id, product_name, quantity_delta, stock_before, stock_after,
      movement_date, movement_time, source_label, note, created_by
    ) VALUES (
      v_dm_id, 'manual_adjustment', v_prod.id, v_prod.name, v_delta, v_old_active, v_new_active,
      v_date, v_time, 'Əl ilə edilən depo düzəlişi',
      COALESCE(NULLIF(TRIM(p_note), ''), 'Əl ilə qalıq düzəlişi (' || v_old_active || ' -> ' || v_new_active || ')'), v_actor
    );
  END IF;

  RETURN jsonb_build_object('product_id', v_prod.id, 'stock_before', v_old_active, 'stock_after', v_new_active, 'delta', v_delta, 'movement_id', v_dm_id);
END;
$$;


