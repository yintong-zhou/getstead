CREATE TABLE "stead_account_logos" (
    "user_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "image_enc" BYTEA NOT NULL,
    CONSTRAINT "stead_account_logos_pkey" PRIMARY KEY ("user_id", "account_id"),
    CONSTRAINT "stead_account_logos_user_id_account_id_fkey"
      FOREIGN KEY ("user_id", "account_id") REFERENCES "stead_accounts" ("user_id", "account_id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stead_auth_app') THEN
        GRANT SELECT, INSERT, UPDATE (image_enc), DELETE ON public.stead_account_logos TO stead_auth_app;
    END IF;
END $$;
