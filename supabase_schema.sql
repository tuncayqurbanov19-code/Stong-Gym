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
CREATE INDEX IF NOT EXISTS idx_debt_payments_debt_id ON public.debt_payments(debt_id);
CREATE INDEX IF NOT EXISTS idx_debt_payments_paid_at ON public.debt_payments(paid_at);
CREATE INDEX IF NOT EXISTS idx_debt_payments_received_by ON public.debt_payments(received_by);
CREATE INDEX IF NOT EXISTS idx_sales_date_created_by ON public.sales(date, created_by);
CREATE INDEX IF NOT EXISTS idx_sales_date ON public.sales(date);
CREATE INDEX IF NOT EXISTS idx_debts_status_remaining ON public.debts(status, remaining_amount);

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
    (s.sales_real_inflow + dp.debt_collected_total) AS actual_drawer_inflow,
    pur.purchases_outflow,
    exp.expenses_outflow,
    (pur.purchases_outflow + exp.expenses_outflow) AS total_cash_outflow,
    ((s.sales_real_inflow + dp.debt_collected_total) - (pur.purchases_outflow + exp.expenses_outflow)) AS net_cash_balance,
    u.total_unpaid_debts
  FROM s_agg s, items_agg ia, dp_agg dp, pur_agg pur, exp_agg exp, unpaid_agg u;
$$;


