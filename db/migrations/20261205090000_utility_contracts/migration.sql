CREATE TABLE stead_utility_contracts (
  contract_id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES stead_users(user_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  property_id UUID NOT NULL,
  type stead_utility_bill_type NOT NULL,
  provider VARCHAR(80) NOT NULL CHECK (length(btrim(provider)) > 0),
  unit_price DECIMAL(12,6) NOT NULL CHECK (unit_price > 0),
  unit VARCHAR(30) NOT NULL CHECK (length(btrim(unit)) > 0),
  activation_date DATE NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  duration_months INTEGER NOT NULL CHECK (duration_months BETWEEN 1 AND 1200),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT stead_utility_contracts_dates_check CHECK (activation_date >= DATE '2000-01-01' AND activation_date <= period_start AND period_start <= period_end AND period_end <= DATE '2100-12-31'),
  CONSTRAINT stead_utility_contracts_property_fkey FOREIGN KEY (user_id, property_id) REFERENCES stead_properties(user_id, property_id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX stead_utility_contracts_user_id_contract_id_key ON stead_utility_contracts(user_id, contract_id);
CREATE INDEX stead_utility_contracts_user_id_property_id_period_end_idx ON stead_utility_contracts(user_id, property_id, period_end);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stead_auth_app') THEN
    GRANT SELECT, INSERT ON public.stead_utility_contracts TO stead_auth_app;
    GRANT UPDATE (type, provider, unit_price, unit, activation_date, period_start, period_end, duration_months) ON public.stead_utility_contracts TO stead_auth_app;
  END IF;
END $$;
