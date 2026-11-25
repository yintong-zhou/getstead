-- Optional bank or broker of an account, so accounts of one institution can be grouped.
ALTER TABLE stead_accounts ADD COLUMN institution VARCHAR(80);
ALTER TABLE stead_accounts ADD CONSTRAINT stead_accounts_institution_check CHECK (institution IS NULL OR length(btrim(institution)) > 0);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stead_auth_app') THEN
    GRANT UPDATE (name, type, custom_type_id, institution, archived_at) ON public.stead_accounts TO stead_auth_app;
  END IF;
END $$;
