-- Prisma sends every static @default column on INSERT, so creating a user (admin, owner CLI) also
-- writes exclude_cash. 20261202090000_cash_reporting granted only UPDATE on it.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stead_auth_app') THEN
    GRANT INSERT (exclude_cash) ON public.stead_users TO stead_auth_app;
  END IF;
END $$;
