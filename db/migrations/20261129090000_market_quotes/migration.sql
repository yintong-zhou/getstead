ALTER TABLE public.stead_instruments
  ADD COLUMN market_symbol TEXT,
  ADD COLUMN market_name TEXT,
  ADD COLUMN market_currency TEXT,
  ADD CONSTRAINT stead_instruments_market_link_check CHECK (
    num_nonnulls(market_symbol, market_name, market_currency) IN (0, 3)
  );

CREATE TABLE public.stead_market_price_quotes (
  user_id UUID NOT NULL,
  instrument_id UUID NOT NULL,
  as_of DATE NOT NULL,
  unit_price DECIMAL(18, 8) NOT NULL CHECK (unit_price > 0 AND unit_price <> 'NaN'::numeric),
  currency TEXT NOT NULL,
  fx_rate DECIMAL(28, 12),
  fx_as_of DATE,
  CONSTRAINT stead_market_price_quotes_pkey PRIMARY KEY (user_id, instrument_id, as_of),
  CONSTRAINT stead_market_price_quotes_user_id_instrument_id_fkey FOREIGN KEY (user_id, instrument_id)
    REFERENCES public.stead_instruments (user_id, instrument_id) ON DELETE CASCADE ON UPDATE CASCADE,
  CHECK (as_of BETWEEN DATE '2000-01-01' AND DATE '2100-12-31'),
  CHECK (
    (currency = 'EUR' AND fx_rate IS NULL AND fx_as_of IS NULL) OR
    (currency <> 'EUR' AND fx_rate IS NOT NULL AND fx_rate > 0 AND fx_rate <> 'NaN'::numeric
      AND fx_as_of IS NOT NULL AND fx_as_of <= as_of)
  )
);

CREATE TABLE public.stead_market_cache (
  cache_key TEXT PRIMARY KEY,
  attempted_at TIMESTAMPTZ(3) NOT NULL,
  payload JSONB
);

CREATE TABLE public.stead_market_requests (
  id UUID PRIMARY KEY,
  attempted_at TIMESTAMPTZ(3) NOT NULL,
  throttled BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX stead_market_requests_attempted_at_idx ON public.stead_market_requests (attempted_at);
