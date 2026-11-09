-- =================================================================
-- ZAL BARI & SU APARATI İDARƏETMƏ VƏ POS SİSTEMİ
-- SUPABASE VERİLƏNLƏR BAZASI VƏ REAL-VAXT SİNXRONİZASİYA SKRİPTİ
-- =================================================================
-- Bu skripti Supabase Dashboard-da SQL Editor bölməsində icra edin.
-- Həm kompüterdə, həm də iPhone/Android telefonlarında real-vaxt
-- sinxronizasiyanı və məlumatların təhlükəsiz saxlanmasını təmin edir.

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
    payment_type TEXT NOT NULL CHECK (payment_type IN ('naqd', 'kart', 'pos', 'borc')),
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

-- 6. Gündəlik Kassa Hesabatı (Daily Reports) Cədvəli
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

-- 7. Xərclər (Expenses) Cədvəli (Yalnız Admin)
CREATE TABLE IF NOT EXISTS public.expenses (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    category TEXT NOT NULL,
    amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    created_by TEXT NOT NULL
);

-- 8. Proqram Parametrləri (App Settings) Cədvəli
CREATE TABLE IF NOT EXISTS public.app_settings (
    id TEXT PRIMARY KEY DEFAULT 'global',
    min_stock_threshold INTEGER NOT NULL DEFAULT 5,
    auto_confirm_sales BOOLEAN NOT NULL DEFAULT true,
    bar_name TEXT NOT NULL DEFAULT 'Zal Barı',
    enable_push_notifications BOOLEAN NOT NULL DEFAULT true
);

-- 9. Əməliyyat Jurnalı (Audit Logs) Cədvəli
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
-- Hər iki telefonda (admin və işçi) satış, su qəbulu və qalıqların
-- dərhal canlı görünməsi üçün cədvəllər realtime publikasiyasına əlavə edilir:

DO $$
BEGIN
  -- Mövcud publikasiyaya cədvəlləri əlavə et
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE 
      public.users,
      public.products,
      public.purchases,
      public.sales,
      public.debts,
      public.daily_reports,
      public.expenses,
      public.app_settings,
      public.audit_logs;
  EXCEPTION
    WHEN duplicate_object THEN
      NULL; -- Artıq əlavə olunubsa səhv vermə
    WHEN undefined_object THEN
      CREATE PUBLICATION supabase_realtime FOR ALL TABLES;
  END;
END $$;

-- =================================================================
-- ROW LEVEL SECURITY (RLS) VƏ İCAZƏLƏR
-- =================================================================
-- Web və Mobil tətbiqdən anon key ilə qoşulma və əməliyyat icazələri

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Bütün istifadəçilər (admin və işçi) məlumatları oxuya bilər
CREATE POLICY "Anon Select Users" ON public.users FOR SELECT USING (true);
CREATE POLICY "Anon Modify Users" ON public.users FOR ALL USING (true);

CREATE POLICY "Anon Select Products" ON public.products FOR SELECT USING (true);
CREATE POLICY "Anon Modify Products" ON public.products FOR ALL USING (true);

CREATE POLICY "Anon Select Purchases" ON public.purchases FOR SELECT USING (true);
CREATE POLICY "Anon Modify Purchases" ON public.purchases FOR ALL USING (true);

CREATE POLICY "Anon Select Sales" ON public.sales FOR SELECT USING (true);
CREATE POLICY "Anon Modify Sales" ON public.sales FOR ALL USING (true);

CREATE POLICY "Anon Select Debts" ON public.debts FOR SELECT USING (true);
CREATE POLICY "Anon Modify Debts" ON public.debts FOR ALL USING (true);

CREATE POLICY "Anon Select DailyReports" ON public.daily_reports FOR SELECT USING (true);
CREATE POLICY "Anon Modify DailyReports" ON public.daily_reports FOR ALL USING (true);

CREATE POLICY "Anon Select Expenses" ON public.expenses FOR SELECT USING (true);
CREATE POLICY "Anon Modify Expenses" ON public.expenses FOR ALL USING (true);

CREATE POLICY "Anon Select Settings" ON public.app_settings FOR SELECT USING (true);
CREATE POLICY "Anon Modify Settings" ON public.app_settings FOR ALL USING (true);

CREATE POLICY "Anon Select AuditLogs" ON public.audit_logs FOR SELECT USING (true);
CREATE POLICY "Anon Modify AuditLogs" ON public.audit_logs FOR ALL USING (true);

-- =================================================================
-- İLKİN MƏLUMATLARIN ƏLAVƏ EDİLMƏSİ (SEED DATA)
-- =================================================================

-- Default Hesablar: admin / admin123 və isci / isci123
INSERT INTO public.users (id, username, password, name, role, is_active)
VALUES 
  ('u-admin', 'admin', 'admin123', 'Müdir (Admin)', 'admin', true),
  ('u-isci1', 'isci', 'isci123', 'Rəşad Əliyev (Barman)', 'isci', true)
ON CONFLICT (username) DO NOTHING;

-- Default Parametrlər
INSERT INTO public.app_settings (id, min_stock_threshold, auto_confirm_sales, bar_name, enable_push_notifications)
VALUES ('global', 5, true, 'Zal Barı', true)
ON CONFLICT (id) DO NOTHING;

-- Su və İdman Əlavələri
INSERT INTO public.products (id, name, barcode, sale_price, buy_price, category, volume, initial_stock, min_stock_alert, note)
VALUES 
  ('prod-1', '0,5 L Su', '47600101', 0.50, 0.25, 'Su', '0.5 L', 100, 10, 'Qazsız təbii bulaq suyu'),
  ('prod-2', '1 L Su', '47600102', 1.00, 0.50, 'Su', '1 L', 80, 8, 'Qazsız təbii su'),
  ('prod-3', '1,5 L Su', '47600103', 1.20, 0.60, 'Su', '1.5 L', 60, 6, 'Qazsız böyük qablaşdırma'),
  ('prod-4', 'Protein Şeyk (Banan/Vanil)', '47600104', 3.50, 1.80, 'Protein', '400 ml', 45, 5, '25g zərdab zülalı ilə hazır içki'),
  ('prod-5', 'BCAA Soyuq İçki', '47600105', 2.50, 1.30, 'Enerji və BCAA', '330 ml', 30, 5, 'Limon və Giləmeyvə tamlı'),
  ('prod-6', 'Red Bull Enerji İçkisi', '47600106', 3.00, 1.70, 'Enerji və BCAA', '250 ml', 50, 5, 'Klassik enerji içkisi'),
  ('prod-7', 'Protein Bar (Şokoladlı)', '47600107', 2.00, 1.00, 'Qəlyanaltı', '60 g', 40, 5, '20g protein, az şəkərli baton'),
  ('prod-8', 'L-Carnitine Shot 3000', '47600108', 2.80, 1.40, 'Əlavələr', '60 ml', 25, 5, 'Məşqdən əvvəl yağ yandırmağa köməkçi')
ON CONFLICT (id) DO NOTHING;
