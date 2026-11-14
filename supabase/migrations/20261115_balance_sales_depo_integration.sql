-- =================================================================
-- MİQRASİYA: Balans Sisteminin Gündəlik Satış və Depo ilə İnteqrasiyası
-- Tarix: 2026-11-15
-- Qeyd: Mövcud məlumatları qoruyur, yeni cədvəllər və atomik RPC-lər əlavə edir.
-- =================================================================

-- -----------------------------------------------------------------
-- 1. CUSTOMER_ACCOUNTS CƏDVƏLİNİN GENİŞLƏNDİRİLMƏSİ
-- -----------------------------------------------------------------
ALTER TABLE public.customer_accounts
  ADD COLUMN IF NOT EXISTS total_withdrawn NUMERIC(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opened_date TEXT,
  ADD COLUMN IF NOT EXISTS updated_by TEXT;

UPDATE public.customer_accounts ca
SET opened_date = COALESCE(
  ca.opened_date,
  (
    SELECT MIN(t->>'date')
    FROM jsonb_array_elements(COALESCE(ca.transactions, '[]'::jsonb)) t
    WHERE NULLIF(t->>'date', '') IS NOT NULL
  ),
  to_char(ca.created_at AT TIME ZONE 'Asia/Baku', 'YYYY-MM-DD')
)
WHERE ca.opened_date IS NULL;

-- -----------------------------------------------------------------
-- 2. NORMALİZƏ EDİLMİŞ MÜŞTƏRİ BALANS JURNALI (CUSTOMER_BALANCE_TRANSACTIONS)
-- -----------------------------------------------------------------
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

CREATE INDEX IF NOT EXISTS idx_cbt_customer_id ON public.customer_balance_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_cbt_tx_date ON public.customer_balance_transactions(tx_date);
CREATE INDEX IF NOT EXISTS idx_cbt_tx_type ON public.customer_balance_transactions(tx_type);
CREATE INDEX IF NOT EXISTS idx_cbt_sale_id ON public.customer_balance_transactions(sale_id);

-- Mövcud customer_accounts.transactions JSONB qeydlərini itkisiz köçür
INSERT INTO public.customer_balance_transactions (
  id, customer_id, customer_name, tx_type, amount, balance_before, balance_after,
  payment_method, product_id, product_name, quantity, unit_price, sale_id,
  tx_date, tx_time, note, created_by, created_at
)
SELECT
  COALESCE(NULLIF(t->>'id', ''), 'ctx-' || ca.id || '-' || idx),
  ca.id,
  ca.name,
  CASE
    WHEN (t->>'type') IN ('open', 'deposit', 'withdraw', 'product_out', 'charge', 'adjustment') THEN (t->>'type')
    ELSE 'deposit'
  END,
  GREATEST(0, COALESCE((t->>'amount')::numeric, 0)),
  COALESCE((t->>'balanceBefore')::numeric, 0),
  COALESCE((t->>'balanceAfter')::numeric, 0),
  CASE
    WHEN lower(COALESCE(t->>'paymentMethod', '')) IN ('naqd', 'kart', 'pos', 'kocurme', 'balans')
      THEN lower(t->>'paymentMethod')
    ELSE NULL
  END,
  NULLIF(t->>'productId', ''),
  NULLIF(t->>'productName', ''),
  NULLIF((t->>'quantity')::integer, 0),
  NULLIF((t->>'unitPrice')::numeric, 0),
  NULLIF(t->>'saleId', ''),
  COALESCE(NULLIF(t->>'date', ''), ca.opened_date, to_char(ca.created_at, 'YYYY-MM-DD')),
  COALESCE(NULLIF(t->>'time', ''), '00:00'),
  t->>'note',
  COALESCE(NULLIF(t->>'createdBy', ''), 'admin'),
  COALESCE((t->>'createdAt')::timestamptz, ca.created_at, now())
FROM public.customer_accounts ca,
LATERAL jsonb_array_elements(COALESCE(ca.transactions, '[]'::jsonb)) WITH ORDINALITY AS arr(t, idx)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------
-- 3. DEPO HƏRƏKƏT JURNALI (DEPO_MOVEMENTS)
-- -----------------------------------------------------------------
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

CREATE INDEX IF NOT EXISTS idx_depo_movements_product_id ON public.depo_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_depo_movements_type ON public.depo_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_depo_movements_date ON public.depo_movements(movement_date);

-- RLS & Realtime
ALTER TABLE public.customer_balance_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.depo_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anon Select CustomerBalanceTx" ON public.customer_balance_transactions;
CREATE POLICY "Anon Select CustomerBalanceTx" ON public.customer_balance_transactions FOR SELECT USING (true);
DROP POLICY IF EXISTS "Anon Modify CustomerBalanceTx" ON public.customer_balance_transactions;
CREATE POLICY "Anon Modify CustomerBalanceTx" ON public.customer_balance_transactions FOR ALL USING (true);

DROP POLICY IF EXISTS "Anon Select DepoMovements" ON public.depo_movements;
CREATE POLICY "Anon Select DepoMovements" ON public.depo_movements FOR SELECT USING (true);
DROP POLICY IF EXISTS "Anon Modify DepoMovements" ON public.depo_movements;
CREATE POLICY "Anon Modify DepoMovements" ON public.depo_movements FOR ALL USING (true);

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.customer_balance_transactions, public.depo_movements;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
  END;
END $$;

-- -----------------------------------------------------------------
-- 4. ATOMİK RPC 1: BALANS AÇMAQ VƏ YA PUL ƏLAVƏ ETMƏK
-- -----------------------------------------------------------------
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
    SELECT * INTO v_existing_tx
    FROM public.customer_balance_transactions
    WHERE idempotency_key = TRIM(p_idempotency_key)
    LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('status', 'duplicate', 'tx_id', v_existing_tx.id, 'customer_id', v_existing_tx.customer_id);
    END IF;
  END IF;

  v_clean_name := TRIM(COALESCE(p_customer_name, ''));
  v_clean_amount := ROUND(COALESCE(p_amount, 0)::numeric, 2);
  v_method := lower(COALESCE(NULLIF(TRIM(p_payment_method), ''), 'naqd'));
  IF v_method NOT IN ('naqd', 'kart', 'pos', 'kocurme') THEN
    v_method := 'naqd';
  END IF;

  v_date := COALESCE(NULLIF(TRIM(p_date), ''), to_char(timezone('Asia/Baku', now()), 'YYYY-MM-DD'));
  v_time := COALESCE(NULLIF(TRIM(p_time), ''), to_char(timezone('Asia/Baku', now()), 'HH24:MI'));
  v_actor := COALESCE(NULLIF(TRIM(p_actor_username), ''), 'admin');

  -- Mövcud müştərini tap və kilidlə
  IF p_customer_id IS NOT NULL AND TRIM(p_customer_id) <> '' THEN
    SELECT * INTO v_cust FROM public.customer_accounts WHERE id = TRIM(p_customer_id) FOR UPDATE;
  END IF;

  IF NOT FOUND AND v_clean_name <> '' THEN
    SELECT * INTO v_cust
    FROM public.customer_accounts
    WHERE lower(TRIM(name)) = lower(v_clean_name)
    LIMIT 1
    FOR UPDATE;
  END IF;

  IF FOUND THEN
    IF v_clean_amount <= 0 THEN
      RAISE EXCEPTION 'Mövcud balansa əlavə edilən məbləğ 0-dan böyük olmalıdır.';
    END IF;
    v_tx_type := 'deposit';
    v_bal_before := v_cust.balance;
    v_bal_after := ROUND(v_cust.balance + v_clean_amount, 2);
    v_tx_id := 'ctx-' || (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint::text;

    v_tx_obj := jsonb_build_object(
      'id', v_tx_id,
      'customerId', v_cust.id,
      'customerName', v_cust.name,
      'type', v_tx_type,
      'amount', v_clean_amount,
      'balanceBefore', v_bal_before,
      'balanceAfter', v_bal_after,
      'paymentMethod', v_method,
      'date', v_date,
      'time', v_time,
      'note', COALESCE(NULLIF(TRIM(p_note), ''), 'Balans artırıldı (' || upper(v_method) || ')'),
      'createdBy', v_actor,
      'createdAt', v_now
    );

    UPDATE public.customer_accounts
    SET
      balance = v_bal_after,
      total_deposited = ROUND(total_deposited + v_clean_amount, 2),
      phone = COALESCE(NULLIF(TRIM(p_phone), ''), phone),
      transactions = jsonb_build_array(v_tx_obj) || COALESCE(transactions, '[]'::jsonb),
      updated_at = v_now,
      updated_by = v_actor
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
    IF v_clean_name = '' THEN
      RAISE EXCEPTION 'Yeni balans açmaq üçün müştəri adı mütləqdir.';
    END IF;
    IF v_clean_amount < 0 THEN
      RAISE EXCEPTION 'İlkin balans mənfi ola bilməz.';
    END IF;

    v_cust.id := COALESCE(NULLIF(TRIM(p_customer_id), ''), 'cust-' || (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint::text);
    v_tx_type := 'open';
    v_bal_before := 0;
    v_bal_after := v_clean_amount;
    v_tx_id := 'ctx-' || ((EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint + 1)::text;

    v_tx_obj := jsonb_build_object(
      'id', v_tx_id,
      'customerId', v_cust.id,
      'customerName', v_clean_name,
      'type', v_tx_type,
      'amount', v_clean_amount,
      'balanceBefore', 0,
      'balanceAfter', v_bal_after,
      'paymentMethod', v_method,
      'date', v_date,
      'time', v_time,
      'note', COALESCE(NULLIF(TRIM(p_note), ''), 'Balans açıldı (' || upper(v_method) || ')'),
      'createdBy', v_actor,
      'createdAt', v_now
    );

    INSERT INTO public.customer_accounts (
      id, name, phone, balance, total_deposited, total_spent, total_withdrawn,
      opened_date, notes, transactions, created_at, updated_at, updated_by
    ) VALUES (
      v_cust.id, v_clean_name, NULLIF(TRIM(p_phone), ''), v_bal_after, v_clean_amount, 0, 0,
      v_date, NULLIF(TRIM(p_note), ''), jsonb_build_array(v_tx_obj), v_now, v_now, v_actor
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

-- -----------------------------------------------------------------
-- 5. ATOMİK RPC 2: BALANSDAN SƏRBƏST PUL ÇIXARIŞI (SATIŞ DEYİL!)
-- -----------------------------------------------------------------
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
    SELECT * INTO v_existing_tx
    FROM public.customer_balance_transactions
    WHERE idempotency_key = TRIM(p_idempotency_key)
    LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('status', 'duplicate', 'tx_id', v_existing_tx.id);
    END IF;
  END IF;

  SELECT * INTO v_cust FROM public.customer_accounts WHERE id = p_customer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Müştəri hesabı tapılmadı: %', p_customer_id;
  END IF;

  v_clean_amount := ROUND(COALESCE(p_amount, 0)::numeric, 2);
  IF v_clean_amount <= 0 THEN
    RAISE EXCEPTION 'Çıxarılan pul məbləği 0-dan böyük olmalıdır.';
  END IF;

  IF v_cust.balance < v_clean_amount THEN
    RAISE EXCEPTION 'Balansda kifayət qədər vəsait yoxdur! Cari balans: % AZN, Tələb: % AZN', v_cust.balance, v_clean_amount;
  END IF;

  v_method := lower(COALESCE(NULLIF(TRIM(p_payment_method), ''), 'naqd'));
  IF v_method NOT IN ('naqd', 'kart', 'pos', 'kocurme') THEN
    v_method := 'naqd';
  END IF;

  v_date := COALESCE(NULLIF(TRIM(p_date), ''), to_char(timezone('Asia/Baku', now()), 'YYYY-MM-DD'));
  v_time := COALESCE(NULLIF(TRIM(p_time), ''), to_char(timezone('Asia/Baku', now()), 'HH24:MI'));
  v_actor := COALESCE(NULLIF(TRIM(p_actor_username), ''), 'admin');
  v_bal_after := ROUND(v_cust.balance - v_clean_amount, 2);
  v_tx_id := 'ctx-' || (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint::text;

  v_tx_obj := jsonb_build_object(
    'id', v_tx_id,
    'customerId', v_cust.id,
    'customerName', v_cust.name,
    'type', 'withdraw',
    'amount', v_clean_amount,
    'balanceBefore', v_cust.balance,
    'balanceAfter', v_bal_after,
    'paymentMethod', v_method,
    'date', v_date,
    'time', v_time,
    'note', COALESCE(NULLIF(TRIM(p_note), ''), 'Balansdan sərbəst pul çıxarışı (' || upper(v_method) || ')'),
    'createdBy', v_actor,
    'createdAt', v_now
  );

  UPDATE public.customer_accounts
  SET
    balance = v_bal_after,
    total_withdrawn = ROUND(COALESCE(total_withdrawn, 0) + v_clean_amount, 2),
    transactions = jsonb_build_array(v_tx_obj) || COALESCE(transactions, '[]'::jsonb),
    updated_at = v_now,
    updated_by = v_actor
  WHERE id = v_cust.id;

  INSERT INTO public.customer_balance_transactions (
    id, customer_id, customer_name, tx_type, amount, balance_before, balance_after,
    payment_method, tx_date, tx_time, note, created_by, idempotency_key, created_at
  ) VALUES (
    v_tx_id, v_cust.id, v_cust.name, 'withdraw', v_clean_amount, v_cust.balance, v_bal_after,
    v_method, v_date, v_time, v_tx_obj->>'note', v_actor, NULLIF(TRIM(p_idempotency_key), ''), v_now
  );

  RETURN jsonb_build_object(
    'status', 'withdrawn',
    'customer_id', v_cust.id,
    'tx_id', v_tx_id,
    'balance_before', v_cust.balance,
    'balance_after', v_bal_after
  );
END;
$$;

-- -----------------------------------------------------------------
-- 6. ATOMİK RPC 3: BALANSDAN MƏHSUL ÇIXARIŞI («MƏHSUL ÇIXAR»)
--    Balans + Depo + Satış + Tarixçə hamısı tək SQL tranzaksiyasında!
-- -----------------------------------------------------------------
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
    SELECT * INTO v_existing_tx
    FROM public.customer_balance_transactions
    WHERE idempotency_key = TRIM(p_idempotency_key)
    LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'status', 'duplicate',
        'tx_id', v_existing_tx.id,
        'sale_id', v_existing_tx.sale_id
      );
    END IF;
  END IF;

  IF COALESCE(p_quantity, 0) <= 0 THEN
    RAISE EXCEPTION 'Məhsul miqdarı ən azı 1 ədəd olmalıdır.';
  END IF;

  SELECT * INTO v_cust FROM public.customer_accounts WHERE id = p_customer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Müştəri hesabı tapılmadı: %', p_customer_id;
  END IF;

  SELECT * INTO v_prod FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Məhsul depoda tapılmadı: %', p_product_id;
  END IF;

  SELECT COALESCE(SUM(quantity), 0)::integer INTO v_purchased
  FROM public.purchases
  WHERE product_id = v_prod.id;

  SELECT COALESCE(SUM(COALESCE((elem->>'quantity')::integer, 0)), 0)::integer INTO v_sold
  FROM public.sales s
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.items, '[]'::jsonb)) AS elem
  WHERE (s.is_confirmed = true OR s.payment_type = 'borc')
    AND elem->>'productId' = v_prod.id;

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

  v_sale_items := jsonb_build_array(
    jsonb_build_object(
      'productId', v_prod.id,
      'productName', v_prod.name,
      'quantity', p_quantity,
      'unitPrice', v_unit_price,
      'totalPrice', v_total_amount
    )
  );

  -- 1. Satış kimi qeydə al (Gündəlik satış dövriyyəsinə düşsün və depo qalığını azaltsın)
  INSERT INTO public.sales (
    id, date, time, items, subtotal_amount, discount_amount, total_amount,
    payment_type, debtor_name, original_date, is_confirmed, confirmed_at, confirmed_by,
    created_at, created_by
  ) VALUES (
    v_sale_id, v_date, v_time, v_sale_items, v_total_amount, 0, v_total_amount,
    'balans', v_cust.name, v_date, true, v_now, v_actor,
    v_now, v_actor
  );

  -- 2. Müştəri balansını yenilə + tarixçə əlavə et
  v_tx_obj := jsonb_build_object(
    'id', v_tx_id,
    'customerId', v_cust.id,
    'customerName', v_cust.name,
    'type', 'product_out',
    'amount', v_total_amount,
    'balanceBefore', v_cust.balance,
    'balanceAfter', v_bal_after,
    'paymentMethod', 'balans',
    'productId', v_prod.id,
    'productName', v_prod.name,
    'quantity', p_quantity,
    'unitPrice', v_unit_price,
    'saleId', v_sale_id,
    'date', v_date,
    'time', v_time,
    'note', COALESCE(NULLIF(TRIM(p_note), ''), 'Balansdan məhsul çıxarışı: ' || v_prod.name || ' × ' || p_quantity),
    'createdBy', v_actor,
    'createdAt', v_now
  );

  UPDATE public.customer_accounts
  SET
    balance = v_bal_after,
    total_spent = ROUND(total_spent + v_total_amount, 2),
    transactions = jsonb_build_array(v_tx_obj) || COALESCE(transactions, '[]'::jsonb),
    updated_at = v_now,
    updated_by = v_actor
  WHERE id = v_cust.id;

  INSERT INTO public.customer_balance_transactions (
    id, customer_id, customer_name, tx_type, amount, balance_before, balance_after,
    payment_method, product_id, product_name, quantity, unit_price, sale_id,
    tx_date, tx_time, note, created_by, idempotency_key, created_at
  ) VALUES (
    v_tx_id, v_cust.id, v_cust.name, 'product_out', v_total_amount, v_cust.balance, v_bal_after,
    'balans', v_prod.id, v_prod.name, p_quantity, v_unit_price, v_sale_id,
    v_date, v_time, v_tx_obj->>'note', v_actor, NULLIF(TRIM(p_idempotency_key), ''), v_now
  );

  -- 3. Depo hərəkəti jurnalına «Müştəri balansından çıxarış» kimi yaz
  INSERT INTO public.depo_movements (
    id, movement_type, product_id, product_name, quantity_delta,
    stock_before, stock_after, unit_price, total_amount, customer_name,
    reference_id, movement_date, movement_time, source_label, note,
    created_by, idempotency_key, created_at
  ) VALUES (
    v_dm_id, 'balance_product_out', v_prod.id, v_prod.name, -p_quantity,
    v_active_stock, v_active_stock - p_quantity, v_unit_price, v_total_amount, v_cust.name,
    v_sale_id, v_date, v_time, 'Müştəri balansından çıxarış',
    v_cust.name || ' · Müştəri balansından çıxarış',
    v_actor, NULLIF(TRIM(p_idempotency_key), ''), v_now
  );

  RETURN jsonb_build_object(
    'status', 'completed',
    'sale_id', v_sale_id,
    'tx_id', v_tx_id,
    'depo_movement_id', v_dm_id,
    'customer_id', v_cust.id,
    'balance_after', v_bal_after,
    'stock_before', v_active_stock,
    'stock_after', v_active_stock - p_quantity
  );
END;
$$;

-- -----------------------------------------------------------------
-- 7. ATOMİK RPC 4: MÜŞTƏRİ BALANSININ REDAKTƏSİ VƏ DÜZƏLİŞİ (TARİXÇƏ SİLİNMİR)
-- -----------------------------------------------------------------
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
    WHERE lower(u.username) = lower(v_actor)
      AND u.role = 'admin'
      AND u.is_active = true
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'İcazə yoxdur: Yalnız Admin balans düzəlişi edə bilər.';
  END IF;

  SELECT * INTO v_cust FROM public.customer_accounts WHERE id = p_customer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Müştəri hesabı tapılmadı: %', p_customer_id;
  END IF;

  v_next_tx := COALESCE(v_cust.transactions, '[]'::jsonb);
  v_target_bal := v_cust.balance;

  IF p_new_balance IS NOT NULL THEN
    v_target_bal := GREATEST(0, ROUND(p_new_balance::numeric, 2));
    v_delta := ROUND(v_target_bal - v_cust.balance, 2);

    IF ABS(v_delta) >= 0.01 THEN
      v_tx_id := 'ctx-' || (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint::text;
      v_tx_obj := jsonb_build_object(
        'id', v_tx_id,
        'customerId', v_cust.id,
        'customerName', COALESCE(NULLIF(TRIM(p_name), ''), v_cust.name),
        'type', 'adjustment',
        'amount', ABS(v_delta),
        'balanceBefore', v_cust.balance,
        'balanceAfter', v_target_bal,
        'adjustmentDirection', CASE WHEN v_delta > 0 THEN 'increase' ELSE 'decrease' END,
        'date', v_date,
        'time', v_time,
        'note', COALESCE(NULLIF(TRIM(p_reason), ''), 'Admin balans düzəlişi'),
        'createdBy', v_actor,
        'createdAt', v_now
      );
      v_next_tx := jsonb_build_array(v_tx_obj) || v_next_tx;

      INSERT INTO public.customer_balance_transactions (
        id, customer_id, customer_name, tx_type, amount, balance_before, balance_after,
        tx_date, tx_time, note, created_by, created_at
      ) VALUES (
        v_tx_id, v_cust.id, COALESCE(NULLIF(TRIM(p_name), ''), v_cust.name),
        'adjustment', ABS(v_delta), v_cust.balance, v_target_bal,
        v_date, v_time, v_tx_obj->>'note', v_actor, v_now
      );
    END IF;
  END IF;

  UPDATE public.customer_accounts
  SET
    name = COALESCE(NULLIF(TRIM(p_name), ''), name),
    phone = CASE WHEN p_phone IS NOT NULL THEN NULLIF(TRIM(p_phone), '') ELSE phone END,
    notes = CASE WHEN p_notes IS NOT NULL THEN NULLIF(TRIM(p_notes), '') ELSE notes END,
    balance = v_target_bal,
    transactions = v_next_tx,
    updated_at = v_now,
    updated_by = v_actor
  WHERE id = v_cust.id;

  RETURN jsonb_build_object('status', 'adjusted', 'customer_id', v_cust.id, 'balance', v_target_bal);
END;
$$;

-- -----------------------------------------------------------------
-- 8. ATOMİK RPC 5: ƏL İLƏ DEPO DÜZƏLİŞİ (DEPO_MOVEMENTS QEYDİ İLƏ)
-- -----------------------------------------------------------------
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
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Məhsul tapılmadı: %', p_product_id;
  END IF;

  SELECT COALESCE(SUM(quantity), 0)::integer INTO v_purchased FROM public.purchases WHERE product_id = v_prod.id;
  SELECT COALESCE(SUM(COALESCE((elem->>'quantity')::integer, 0)), 0)::integer INTO v_sold
  FROM public.sales s
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.items, '[]'::jsonb)) AS elem
  WHERE (s.is_confirmed = true OR s.payment_type = 'borc') AND elem->>'productId' = v_prod.id;

  v_old_active := v_prod.initial_stock + v_purchased - v_sold;
  v_new_initial := GREATEST(0, v_new_active - v_purchased + v_sold);
  v_delta := v_new_active - v_old_active;

  UPDATE public.products SET initial_stock = v_new_initial WHERE id = v_prod.id;

  IF v_delta <> 0 THEN
    INSERT INTO public.depo_movements (
      id, movement_type, product_id, product_name, quantity_delta,
      stock_before, stock_after, movement_date, movement_time,
      source_label, note, created_by
    ) VALUES (
      v_dm_id, 'manual_adjustment', v_prod.id, v_prod.name, v_delta,
      v_old_active, v_new_active, v_date, v_time,
      'Əl ilə edilən depo düzəlişi',
      COALESCE(NULLIF(TRIM(p_note), ''), 'Əl ilə qalıq düzəlişi (' || v_old_active || ' -> ' || v_new_active || ')'),
      v_actor
    );
  END IF;

  RETURN jsonb_build_object(
    'product_id', v_prod.id,
    'stock_before', v_old_active,
    'stock_after', v_new_active,
    'delta', v_delta,
    'movement_id', v_dm_id
  );
END;
$$;

-- -----------------------------------------------------------------
-- 9. MALİYYƏ HESABATI RPC-SİNİN YENİLƏNMƏSİ
-- -----------------------------------------------------------------
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
