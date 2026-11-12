-- =================================================================
-- MİQRASİYA: Dinamik Brendinq (branding), Məsul x Ödəniş Bölgüsü
-- və Borc Ödənişləri (debt_payments) + RPC Tranzaksiyaları
-- Tarix: 2026-11-12
-- =================================================================

-- -----------------------------------------------------------------
-- 1. SUPABASE STORAGE: 'branding' public bucket + RLS
-- -----------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'branding',
  'branding',
  true,
  2097152, -- Maksimum 2MB
  ARRAY['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
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

-- -----------------------------------------------------------------
-- 2. PUBLIC.APP_SETTINGS: Key-Value Strukturu (köhnə məlumatları qoruyaraq)
-- -----------------------------------------------------------------
DO $$
DECLARE
  has_key_col BOOLEAN;
  has_id_col BOOLEAN;
  v_bar_name TEXT;
  v_logo_url TEXT;
  v_min_stock INTEGER;
  v_auto_confirm BOOLEAN;
  v_push BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'app_settings' AND column_name = 'key'
  ) INTO has_key_col;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'app_settings' AND column_name = 'id'
  ) INTO has_id_col;

  IF has_id_col AND NOT has_key_col THEN
    -- Köhnə tək-sətirli app_settings cədvəlindən məlumatları oxu
    SELECT bar_name, logo_url, min_stock_threshold, auto_confirm_sales, enable_push_notifications
    INTO v_bar_name, v_logo_url, v_min_stock, v_auto_confirm, v_push
    FROM public.app_settings
    WHERE id = 'global'
    LIMIT 1;

    ALTER TABLE public.app_settings RENAME TO app_settings_legacy;

    CREATE TABLE public.app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
    );

    INSERT INTO public.app_settings (key, value) VALUES
      ('app_name', COALESCE(v_bar_name, 'Zal Barı')),
      ('logo_url', COALESCE(v_logo_url, '')),
      ('primary_color', '#dc2626'),
      ('logo_size', 'md'),
      ('min_stock_threshold', COALESCE(v_min_stock::text, '5')),
      ('auto_confirm_sales', COALESCE(v_auto_confirm::text, 'true')),
      ('enable_push_notifications', COALESCE(v_push::text, 'true'))
    ON CONFLICT (key) DO NOTHING;
  ELSIF NOT has_key_col THEN
    CREATE TABLE IF NOT EXISTS public.app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
    );
  END IF;
END $$;

INSERT INTO public.app_settings (key, value) VALUES
  ('app_name', 'Zal Barı'),
  ('logo_url', ''),
  ('primary_color', '#dc2626'),
  ('logo_size', 'md'),
  ('min_stock_threshold', '5'),
  ('auto_confirm_sales', 'true'),
  ('enable_push_notifications', 'true')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public Read App Settings" ON public.app_settings;
CREATE POLICY "Public Read App Settings" ON public.app_settings
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin Modify App Settings" ON public.app_settings;
CREATE POLICY "Admin Modify App Settings" ON public.app_settings
  FOR ALL USING (true);

-- -----------------------------------------------------------------
-- 3. DEBTS STATUS GENİŞLƏNDİRİLMƏSİ ('borcdadir', 'qismen', 'odanilib')
-- -----------------------------------------------------------------
ALTER TABLE public.debts DROP CONSTRAINT IF EXISTS debts_status_check;
ALTER TABLE public.debts
  ADD CONSTRAINT debts_status_check CHECK (status IN ('borcdadir', 'qismen', 'odanilib'));

-- Mövcud borclarda qismən ödənilmiş statusları avtomatik yenilə
UPDATE public.debts
SET status = CASE
  WHEN remaining_amount <= 0.009 THEN 'odanilib'
  WHEN paid_amount > 0 THEN 'qismen'
  ELSE 'borcdadir'
END;

-- -----------------------------------------------------------------
-- 4. DEBT_PAYMENTS CƏDVƏLİ VƏ KÖHNƏ JSONB MƏLUMATLARININ KÖÇÜRÜLMƏSİ
-- -----------------------------------------------------------------
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

CREATE INDEX IF NOT EXISTS idx_debt_payments_debt_id ON public.debt_payments(debt_id);
CREATE INDEX IF NOT EXISTS idx_debt_payments_paid_at ON public.debt_payments(paid_at);
CREATE INDEX IF NOT EXISTS idx_debt_payments_received_by ON public.debt_payments(received_by);
CREATE INDEX IF NOT EXISTS idx_sales_date_created_by ON public.sales(date, created_by);

-- Köhnə debts.payments JSONB massivindəki ödənişləri idempotent şəkildə köçür
INSERT INTO public.debt_payments (id, debt_id, amount, payment_method, received_by, paid_at, note, created_at)
SELECT
  COALESCE(p->>'id', 'pay-' || d.id || '-' || idx),
  d.id,
  GREATEST(0.01, COALESCE((p->>'amount')::numeric, 0)),
  CASE
    WHEN lower(COALESCE(p->>'paymentMethod', p->>'payment_method', 'naqd')) IN ('naqd', 'kart', 'pos', 'kocurme')
      THEN lower(COALESCE(p->>'paymentMethod', p->>'payment_method', 'naqd'))
    ELSE 'naqd'
  END,
  COALESCE(NULLIF(p->>'receivedBy', ''), NULLIF(p->>'received_by', ''), 'admin'),
  COALESCE(NULLIF(p->>'paidAt', ''), NULLIF(p->>'date', ''), d.date),
  p->>'note',
  COALESCE((p->>'createdAt')::timestamptz, d.updated_at, now())
FROM public.debts d,
LATERAL jsonb_array_elements(COALESCE(d.payments, '[]'::jsonb)) WITH ORDINALITY AS arr(p, idx)
WHERE COALESCE((p->>'amount')::numeric, 0) > 0
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.debt_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anon Select DebtPayments" ON public.debt_payments;
CREATE POLICY "Anon Select DebtPayments" ON public.debt_payments
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anon Modify DebtPayments" ON public.debt_payments;
CREATE POLICY "Anon Modify DebtPayments" ON public.debt_payments
  FOR ALL USING (true);

-- Realtime aktivləşdirilməsi
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.app_settings, public.debt_payments;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
  END;
END $$;

-- -----------------------------------------------------------------
-- 5. ATOMİK RPC FUNKSİYALARI: BORC ÖDƏNİŞİ QƏBULU VƏ SİLİNMƏSİ
-- -----------------------------------------------------------------
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

  -- Qalıqla cüzi yuvarlaqlaşma fərqini düzəlt
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

-- -----------------------------------------------------------------
-- 6. MƏSUL x ÖDƏNİŞ NÖVÜ GÜNLÜK HESABAT RPC-Sİ (İkiqat sayma olmadan)
-- -----------------------------------------------------------------
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
