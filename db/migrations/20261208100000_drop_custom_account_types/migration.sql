-- Custom account types are removed. Every account already carries its built-in base kind in `type`, so accounts
-- keep working unchanged and only the user-chosen label is lost. DESTRUCTIVE: the label table is dropped.
ALTER TABLE "stead_accounts" DROP CONSTRAINT "stead_accounts_user_id_custom_type_id_type_fkey";
ALTER TABLE "stead_accounts" DROP COLUMN "custom_type_id";
DROP TABLE "stead_custom_account_types";
