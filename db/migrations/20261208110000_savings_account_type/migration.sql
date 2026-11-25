-- On its own, outside any explicit transaction: PostgreSQL cannot use a new enum value in the
-- transaction that adds it, so nothing else lives in this migration.
ALTER TYPE "stead_account_type" ADD VALUE 'SAVINGS';
