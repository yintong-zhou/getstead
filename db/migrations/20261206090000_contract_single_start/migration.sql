-- Preserve the old activation date while allowing corrections to the visible period start.
ALTER TABLE stead_utility_contracts DROP CONSTRAINT stead_utility_contracts_dates_check;
ALTER TABLE stead_utility_contracts ADD CONSTRAINT stead_utility_contracts_dates_check CHECK (
  activation_date BETWEEN DATE '2000-01-01' AND DATE '2100-12-31'
  AND period_start >= DATE '2000-01-01' AND period_start <= period_end
  AND period_end <= DATE '2100-12-31'
);
