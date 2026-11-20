-- Deductions never exceed the gross amount: income stays non-negative and a sale never debits cash.
ALTER TABLE public.stead_investment_transactions
  ADD CONSTRAINT stead_investment_transactions_income_tax_check
    CHECK (type NOT IN ('DIVIDEND', 'COUPON') OR tax_withheld_cents <= amount_cents),
  ADD CONSTRAINT stead_investment_transactions_sell_deductions_check
    CHECK (type <> 'SELL' OR fees_cents + tax_withheld_cents <= amount_cents);
