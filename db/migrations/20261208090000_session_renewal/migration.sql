-- Sliding sessions: expires_at moves forward while the session is used, created_at caps its total life.
-- Existing rows get now() as creation time, so they gain at most one full absolute lifetime.
ALTER TABLE stead_sessions ADD COLUMN created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now();
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stead_auth_app') THEN
    GRANT UPDATE (expires_at) ON public.stead_sessions TO stead_auth_app;
  END IF;
END $$;
