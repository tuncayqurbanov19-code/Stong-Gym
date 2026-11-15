-- =========================================================================
-- STRONGBAR — Satış, Qarışıq/Qismən Ödəniş, Ləğv Tarixçəsi, Borc və Balans İnteqrasiyası
-- Tarix: 2026-11-16
-- Qeyd: Mövcud datanı silmir (tam geriyə uyğun idempotent əlavə miqrasiya).
-- =========================================================================

-- 1. Satışlar (public.sales) — qarışıq/qismən ödəniş bölgüsü və ləğv/redaktə tarixçəsi sütunları
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_payment_type_check;
ALTER TABLE public.sales
  ADD CONSTRAINT sales_payment_type_check
  CHECK (payment_type IN ('naqd', 'kart', 'pos', 'borc', 'balans', 'qarisik'));

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS payment_split JSONB,
  ADD COLUMN IF NOT EXISTS is_cancelled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by TEXT,
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT,
  ADD COLUMN IF NOT EXISTS edit_history JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_sales_date_cancelled ON public.sales (date, is_cancelled);

-- 2. Borclar (public.debts) & Borc Ödənişləri (public.debt_payments) — ilkin satış ödənişi və ləğv statusu
ALTER TABLE public.debts
  ADD COLUMN IF NOT EXISTS is_cancelled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by TEXT;

ALTER TABLE public.debt_payments
  ADD COLUMN IF NOT EXISTS is_upfront BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_debts_cancelled_status ON public.debts (is_cancelled, status);
CREATE INDEX IF NOT EXISTS idx_debt_payments_upfront_date ON public.debt_payments (is_upfront, paid_at);

-- 3. Köhnə Depo hərəkət qeydlərinin mənbə etiketini yeni standartla sinxronlaşdır (mövcud dataya zərər vermədən)
UPDATE public.depo_movements
SET source_label = 'Müştəri balansından məhsul çıxarışı'
WHERE movement_type = 'balance_product_out'
  AND source_label = 'Müştəri balansından çıxarış';

-- 4. Müştəri balansından məhsul çıxarışı RPC-si (Müştəri balansından məhsul çıxarışı + Ləğv olunmuş satış stoku nəzərə alınır)
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
  WHERE COALESCE(s.is_cancelled, false) = false
    AND (s.is_confirmed = true OR s.payment_type = 'borc' OR COALESCE((s.payment_split->>'borc')::numeric, 0) > 0)
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
  v_sale_items := jsonb_build_array(jsonb_build_object(
    'productId', v_prod.id, 'productName', v_prod.name, 'quantity', p_quantity, 'unitPrice', v_unit_price, 'totalPrice', v_total_amount
  ));

  INSERT INTO public.sales (
    id, date, time, items, subtotal_amount, discount_amount, total_amount,
    payment_type, debtor_name, original_date, is_confirmed, confirmed_at, confirmed_by,
    is_cancelled, edit_history, created_at, created_by
  ) VALUES (
    v_sale_id, v_date, v_time, v_sale_items, v_total_amount, 0, v_total_amount,
    'balans', v_cust.name, v_date, true, v_now, v_actor,
    false, jsonb_build_array(jsonb_build_object('timestamp', v_now, 'editedBy', v_actor, 'action', 'created', 'details', 'Müştəri balansından məhsul çıxarışı')),
    v_now, v_actor
  );

  v_tx_obj := jsonb_build_object(
    'id', v_tx_id, 'customerId', v_cust.id, 'customerName', v_cust.name, 'type', 'product_out',
    'amount', v_total_amount, 'balanceBefore', v_cust.balance, 'balanceAfter', v_bal_after,
    'paymentMethod', 'balans', 'productId', v_prod.id, 'productName', v_prod.name, 'quantity', p_quantity, 'unitPrice', v_unit_price,
    'saleId', v_sale_id, 'date', v_date, 'time', v_time,
    'note', COALESCE(NULLIF(TRIM(p_note), ''), 'Müştəri balansından məhsul çıxarışı: ' || v_prod.name || ' × ' || p_quantity),
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
    v_unit_price, v_total_amount, v_cust.name, v_sale_id, v_date, v_time, 'Müştəri balansından məhsul çıxarışı',
    v_cust.name || ' · Müştəri balansından məhsul çıxarışı', v_actor, NULLIF(TRIM(p_idempotency_key), ''), v_now
  );

  RETURN jsonb_build_object(
    'status', 'completed', 'sale_id', v_sale_id, 'tx_id', v_tx_id, 'depo_movement_id', v_dm_id,
    'customer_id', v_cust.id, 'balance_after', v_bal_after, 'stock_after', v_active_stock - p_quantity
  );
END;
$$;

-- 5. Depo manual düzəlişi RPC — ləğv olunmuş satışları stokdan çıxmasın
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
  WHERE COALESCE(s.is_cancelled, false) = false
    AND (s.is_confirmed = true OR s.payment_type = 'borc' OR COALESCE((s.payment_split->>'borc')::numeric, 0) > 0)
    AND elem->>'productId' = v_prod.id;

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

-- 6. Satışı tarixçəni silmədən ləğv etmə RPC-si
CREATE OR REPLACE FUNCTION public.cancel_sale_atomic(
  p_sale_id TEXT,
  p_reason TEXT DEFAULT 'Satış ləğv edildi',
  p_actor_username TEXT DEFAULT 'admin'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale public.sales%ROWTYPE;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
  v_actor TEXT := COALESCE(NULLIF(TRIM(p_actor_username), ''), 'admin');
  v_reason TEXT := COALESCE(NULLIF(TRIM(p_reason), ''), 'Satış ləğv edildi');
  v_entry JSONB;
BEGIN
  SELECT * INTO v_sale FROM public.sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Satış qeydi tapılmadı: %', p_sale_id; END IF;
  IF COALESCE(v_sale.is_cancelled, false) THEN
    RETURN jsonb_build_object('status', 'already_cancelled', 'sale_id', p_sale_id);
  END IF;

  v_entry := jsonb_build_object(
    'timestamp', v_now,
    'editedBy', v_actor,
    'action', 'cancelled',
    'details', v_reason
  );

  UPDATE public.sales
  SET is_cancelled = true,
      cancelled_at = v_now,
      cancelled_by = v_actor,
      cancel_reason = v_reason,
      updated_at = v_now,
      edit_history = COALESCE(edit_history, '[]'::jsonb) || jsonb_build_array(v_entry)
  WHERE id = p_sale_id;

  UPDATE public.debts
  SET is_cancelled = true,
      cancelled_at = v_now,
      cancelled_by = v_actor,
      updated_at = v_now,
      notes = CASE WHEN notes IS NULL OR notes = '' THEN 'Ləğv edilib: ' || v_reason ELSE notes || ' · Ləğv edilib: ' || v_reason END
  WHERE sale_id = p_sale_id AND COALESCE(is_cancelled, false) = false;

  RETURN jsonb_build_object('status', 'cancelled', 'sale_id', p_sale_id);
END;
$$;

-- 7. Vahid Maliyyə İcmalı Funksiyası — qarışıq/qismən ödənişlər, ləğv istisnası & is_upfront ikiqat sayılma qoruması
CREATE OR REPLACE FUNCTION public.get_financial_summary(p_start_date TEXT, p_end_date TEXT)
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
    WHERE COALESCE(s.is_cancelled, false) = false
      AND (s.is_confirmed = true OR s.payment_type = 'borc' OR COALESCE((s.payment_split->>'borc')::numeric, 0) > 0)
      AND s.date >= p_start_date
      AND s.date <= p_end_date
  ),
  s_agg AS (
    SELECT
      COALESCE(SUM(total_amount), 0) AS gross_sales_total,
      COALESCE(SUM(
        CASE
          WHEN payment_split IS NOT NULL THEN
            COALESCE((payment_split->>'naqd')::numeric, 0)
            + COALESCE((payment_split->>'kart')::numeric, 0)
            + COALESCE((payment_split->>'pos')::numeric, 0)
            + COALESCE((payment_split->>'borc')::numeric, 0)
          WHEN payment_type <> 'balans' THEN total_amount
          ELSE 0
        END
      ), 0) AS normal_sales_total,
      COUNT(*) AS sales_count,
      COALESCE(SUM(COALESCE(discount_amount, 0)), 0) AS total_discounts,
      COALESCE(SUM(
        CASE WHEN payment_split IS NOT NULL THEN COALESCE((payment_split->>'naqd')::numeric, 0)
             WHEN payment_type = 'naqd' THEN total_amount ELSE 0 END
      ), 0) AS cash_sales,
      COALESCE(SUM(
        CASE WHEN payment_split IS NOT NULL THEN COALESCE((payment_split->>'kart')::numeric, 0)
             WHEN payment_type = 'kart' THEN total_amount ELSE 0 END
      ), 0) AS card_sales,
      COALESCE(SUM(
        CASE WHEN payment_split IS NOT NULL THEN COALESCE((payment_split->>'pos')::numeric, 0)
             WHEN payment_type = 'pos' THEN total_amount ELSE 0 END
      ), 0) AS pos_sales,
      COALESCE(SUM(
        CASE WHEN payment_split IS NOT NULL THEN COALESCE((payment_split->>'balans')::numeric, 0)
             WHEN payment_type = 'balans' THEN total_amount ELSE 0 END
      ), 0) AS balance_sales,
      COALESCE(SUM(
        CASE WHEN payment_split IS NOT NULL THEN COALESCE((payment_split->>'borc')::numeric, 0)
             WHEN payment_type = 'borc' THEN total_amount ELSE 0 END
      ), 0) AS credit_sales
    FROM filtered_sales
  ),
  s_totals AS (
    SELECT
      *,
      (cash_sales + card_sales + pos_sales) AS sales_real_inflow
    FROM s_agg
  ),
  items_agg AS (
    SELECT
      COALESCE(SUM(COALESCE((elem->>'quantity')::bigint, 0)), 0) AS total_items_sold
    FROM filtered_sales fs
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(fs.items, '[]'::jsonb)) AS elem
  ),
  dp_agg AS (
    SELECT
      COALESCE(SUM(dp.amount), 0) AS debt_collected_total,
      COALESCE(SUM(CASE WHEN dp.payment_method = 'naqd' THEN dp.amount ELSE 0 END), 0) AS debt_collected_cash,
      COALESCE(SUM(CASE WHEN dp.payment_method = 'kart' THEN dp.amount ELSE 0 END), 0) AS debt_collected_card,
      COALESCE(SUM(CASE WHEN dp.payment_method IN ('pos', 'kocurme') THEN dp.amount ELSE 0 END), 0) AS debt_collected_pos,
      COUNT(*) AS debt_collected_count
    FROM public.debt_payments dp
    JOIN public.debts d ON d.id = dp.debt_id
    WHERE COALESCE(d.is_cancelled, false) = false
      AND COALESCE(dp.is_upfront, false) = false
      AND dp.paid_at >= p_start_date
      AND dp.paid_at <= p_end_date
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
    WHERE COALESCE(is_cancelled, false) = false
      AND status IN ('borcdadir', 'qismen')
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
  FROM s_totals s, items_agg ia, dp_agg dp, bal_agg b, pur_agg pur, exp_agg exp, unpaid_agg u;
$$;
