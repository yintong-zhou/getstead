CREATE TABLE public.stead_balance_checks (
  check_id UUID NOT NULL,
  user_id UUID NOT NULL,
  account_id UUID NOT NULL,
  as_of DATE NOT NULL,
  balance_cents INTEGER NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT stead_balance_checks_pkey PRIMARY KEY (check_id),
  CONSTRAINT stead_balance_checks_amount_check CHECK (balance_cents BETWEEN -1000000000 AND 1000000000),
  CONSTRAINT stead_balance_checks_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES public.stead_users (user_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT stead_balance_checks_user_id_account_id_fkey FOREIGN KEY (user_id, account_id)
    REFERENCES public.stead_accounts (user_id, account_id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX stead_balance_checks_user_id_account_id_as_of_key
  ON public.stead_balance_checks (user_id, account_id, as_of);
CREATE UNIQUE INDEX stead_balance_checks_user_id_check_id_key
  ON public.stead_balance_checks (user_id, check_id);
