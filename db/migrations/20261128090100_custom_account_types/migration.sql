-- Per-user custom account types: a name on top of a fixed built-in base kind.
CREATE TABLE "stead_custom_account_types" (
    "type_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "base_type" "stead_account_type" NOT NULL,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stead_custom_account_types_pkey" PRIMARY KEY ("type_id"),
    CONSTRAINT "stead_custom_account_types_name_check" CHECK (name = btrim(name) AND char_length(name) BETWEEN 1 AND 80)
);

CREATE UNIQUE INDEX "stead_custom_account_types_user_id_type_id_key" ON "stead_custom_account_types"("user_id", "type_id");
CREATE UNIQUE INDEX "stead_custom_account_types_user_id_name_key" ON "stead_custom_account_types"("user_id", "name");
CREATE UNIQUE INDEX "stead_custom_account_types_user_id_type_id_base_type_key" ON "stead_custom_account_types"("user_id", "type_id", "base_type");

ALTER TABLE "stead_custom_account_types" ADD CONSTRAINT "stead_custom_account_types_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "stead_users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Existing accounts keep a null custom type, so every current row stays valid as it is.
ALTER TABLE "stead_accounts" ADD COLUMN "custom_type_id" UUID;

-- One key enforces both rules: the type belongs to the account's user, and the account's base kind
-- (`type`) equals the type's base. MATCH SIMPLE skips the check while custom_type_id is null.
-- ON UPDATE RESTRICT: a base change must never silently retype accounts past the service guards.
ALTER TABLE "stead_accounts" ADD CONSTRAINT "stead_accounts_user_id_custom_type_id_type_fkey" FOREIGN KEY ("user_id", "custom_type_id", "type") REFERENCES "stead_custom_account_types"("user_id", "type_id", "base_type") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Runtime grants (mirrored in db/grant-runtime.sql). base_type is left out of UPDATE: it is immutable.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stead_auth_app') THEN
        GRANT SELECT, INSERT, UPDATE (name, archived_at), DELETE ON public.stead_custom_account_types TO stead_auth_app;
        GRANT UPDATE (custom_type_id) ON public.stead_accounts TO stead_auth_app;
    END IF;
END $$;
