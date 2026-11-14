-- =================================================================
-- MİQRASİYA: Satış endirimləri, borclu telefonu, tarix dəyişmə auditi
-- və gündəlik hesabat metrikalarının (endirim, satılan ədəd) genişləndirilməsi
-- Qeyd: Bütün dəyişikliklər additive (IF NOT EXISTS) qaydadadır, mövcud məlumatlar qorunur.
-- =================================================================

-- 1. public.sales cədvəlinə yeni sütunların təhlükəsiz əlavə edilməsi
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS subtotal_amount NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS debtor_phone TEXT,
  ADD COLUMN IF NOT EXISTS original_date TEXT,
  ADD COLUMN IF NOT EXISTS date_changed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- Köhnə satış sətirləri üçün subtotal_amount dəyərinin doldurulması
UPDATE public.sales
SET subtotal_amount = COALESCE(subtotal_amount, total_amount + COALESCE(discount_amount, 0)),
    original_date = COALESCE(original_date, date)
WHERE subtotal_amount IS NULL OR original_date IS NULL;

-- 2. public.debts cədvəlinə borclu telefon nömrəsi sütununun əlavə edilməsi
ALTER TABLE public.debts
  ADD COLUMN IF NOT EXISTS debtor_phone TEXT;

-- Performans indeksləri
CREATE INDEX IF NOT EXISTS idx_products_barcode ON public.products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_barcode_lower ON public.products(lower(trim(barcode)));
CREATE INDEX IF NOT EXISTS idx_sales_date ON public.sales(date);
CREATE INDEX IF NOT EXISTS idx_sales_payment_type ON public.sales(payment_type);
CREATE INDEX IF NOT EXISTS idx_debts_status_remaining ON public.debts(status, remaining_amount);

-- 3. Gündəlik/Dövri maliyyə xülasəsi RPC-sinin yenilənməsi
--    (endirimlər və satılan ümumi məhsul ədədi əlavə olunur)
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
