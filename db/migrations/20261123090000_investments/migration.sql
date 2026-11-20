CREATE TYPE public.stead_instrument_kind AS ENUM ('STOCK', 'ETF', 'FUND', 'IT_GOV_BOND', 'BOND', 'CRYPTO', 'OTHER');
CREATE TYPE public.stead_investment_transaction_type AS ENUM ('BUY', 'SELL', 'DIVIDEND', 'COUPON');

CREATE TABLE public.stead_instruments (
  instrument_id UUID NOT NULL,
  user_id UUID NOT NULL,
  name VARCHAR(120) NOT NULL,
  symbol VARCHAR(24),
  isin VARCHAR(12),
  kind public.stead_instrument_kind NOT NULL,
  archived_at TIMESTAMPTZ(3),
  CONSTRAINT stead_instruments_pkey PRIMARY KEY (instrument_id),
  CONSTRAINT stead_instruments_name_check CHECK (length(btrim(name)) > 0),
  CONSTRAINT stead_instruments_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES public.stead_users (user_id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX stead_instruments_user_id_instrument_id_key ON public.stead_instruments(user_id, instrument_id);
CREATE UNIQUE INDEX stead_instruments_user_id_name_key ON public.stead_instruments(user_id, name);

CREATE TABLE public.stead_investment_transactions (
  transaction_id UUID NOT NULL,
  user_id UUID NOT NULL,
  account_id UUID NOT NULL,
  instrument_id UUID NOT NULL,
  type public.stead_investment_transaction_type NOT NULL,
  trade_date DATE NOT NULL,
  ordinal INTEGER NOT NULL,
  quantity DECIMAL(28,10),
  amount_cents BIGINT NOT NULL,
  fees_cents BIGINT NOT NULL,
  tax_withheld_cents BIGINT NOT NULL,
  voided_at TIMESTAMPTZ(3),
  CONSTRAINT stead_investment_transactions_pkey PRIMARY KEY (transaction_id),
  CONSTRAINT stead_investment_transactions_date_check CHECK (trade_date BETWEEN DATE '2000-01-01' AND DATE '2100-12-31'),
  CONSTRAINT stead_investment_transactions_ordinal_check CHECK (ordinal BETWEEN 1 AND 2147483647),
  CONSTRAINT stead_investment_transactions_amount_check CHECK (amount_cents BETWEEN 1 AND 100000000000),
  CONSTRAINT stead_investment_transactions_fees_check CHECK (fees_cents BETWEEN 0 AND 100000000000),
  CONSTRAINT stead_investment_transactions_tax_check CHECK (tax_withheld_cents BETWEEN 0 AND 100000000000),
  CONSTRAINT stead_investment_transactions_shape_check CHECK (
    (type IN ('BUY', 'SELL') AND quantity IS NOT NULL AND quantity > 0 AND quantity <> 'NaN'::numeric)
    OR (type IN ('DIVIDEND', 'COUPON') AND quantity IS NULL AND fees_cents = 0)
  ),
  CONSTRAINT stead_investment_transactions_buy_tax_check CHECK (type <> 'BUY' OR tax_withheld_cents = 0),
  CONSTRAINT stead_investment_transactions_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES public.stead_users(user_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT stead_investment_transactions_user_id_account_id_fkey FOREIGN KEY (user_id, account_id)
    REFERENCES public.stead_accounts(user_id, account_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT stead_investment_transactions_user_id_instrument_id_fkey FOREIGN KEY (user_id, instrument_id)
    REFERENCES public.stead_instruments(user_id, instrument_id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX stead_investment_transactions_user_id_transaction_id_key ON public.stead_investment_transactions(user_id, transaction_id);
CREATE INDEX stead_investment_transactions_user_id_instrument_id_trade_d_idx
  ON public.stead_investment_transactions(user_id, instrument_id, trade_date, ordinal);
CREATE INDEX stead_investment_transactions_user_id_account_id_trade_date_idx
  ON public.stead_investment_transactions(user_id, account_id, trade_date);

CREATE TABLE public.stead_price_quotes (
  quote_id UUID NOT NULL,
  user_id UUID NOT NULL,
  instrument_id UUID NOT NULL,
  as_of DATE NOT NULL,
  unit_price DECIMAL(18,8) NOT NULL,
  CONSTRAINT stead_price_quotes_pkey PRIMARY KEY (quote_id),
  CONSTRAINT stead_price_quotes_date_check CHECK (as_of BETWEEN DATE '2000-01-01' AND DATE '2100-12-31'),
  CONSTRAINT stead_price_quotes_price_check CHECK (unit_price > 0 AND unit_price <> 'NaN'::numeric),
  CONSTRAINT stead_price_quotes_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES public.stead_users(user_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT stead_price_quotes_user_id_instrument_id_fkey FOREIGN KEY (user_id, instrument_id)
    REFERENCES public.stead_instruments(user_id, instrument_id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX stead_price_quotes_user_id_quote_id_key ON public.stead_price_quotes(user_id, quote_id);
CREATE UNIQUE INDEX stead_price_quotes_user_id_instrument_id_as_of_key ON public.stead_price_quotes(user_id, instrument_id, as_of);
