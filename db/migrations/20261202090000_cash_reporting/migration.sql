ALTER TABLE public.stead_users ADD COLUMN exclude_cash BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stead_auth_app') THEN
    GRANT UPDATE (exclude_cash) ON public.stead_users TO stead_auth_app;
  END IF;
END $$;
