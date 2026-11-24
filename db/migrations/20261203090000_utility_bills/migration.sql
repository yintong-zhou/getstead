-- Utility bills per property, and an encrypted street address on properties.

-- CreateEnum
CREATE TYPE "stead_utility_bill_type" AS ENUM ('ELECTRICITY', 'GAS', 'INTERNET');

-- AlterTable
ALTER TABLE "stead_properties" ADD COLUMN "address_enc" BYTEA;

-- CreateTable
CREATE TABLE "stead_utility_bills" (
    "bill_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "type" "stead_utility_bill_type" NOT NULL,
    "provider" VARCHAR(80) NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "due_date" DATE NOT NULL,
    "total_cents" INTEGER NOT NULL,
    "raw_material_cents" INTEGER,
    "movement_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stead_utility_bills_pkey" PRIMARY KEY ("bill_id")
);

-- CreateIndex
CREATE INDEX "stead_utility_bills_user_id_property_id_due_date_idx" ON "stead_utility_bills"("user_id", "property_id", "due_date");

-- CreateIndex
CREATE INDEX "stead_utility_bills_user_id_due_date_idx" ON "stead_utility_bills"("user_id", "due_date");

-- CreateIndex
CREATE UNIQUE INDEX "stead_utility_bills_user_id_bill_id_key" ON "stead_utility_bills"("user_id", "bill_id");

-- CreateIndex
CREATE UNIQUE INDEX "stead_utility_bills_user_id_movement_id_key" ON "stead_utility_bills"("user_id", "movement_id");

-- AddForeignKey
ALTER TABLE "stead_utility_bills" ADD CONSTRAINT "stead_utility_bills_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "stead_users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stead_utility_bills" ADD CONSTRAINT "stead_utility_bills_user_id_property_id_fkey" FOREIGN KEY ("user_id", "property_id") REFERENCES "stead_properties"("user_id", "property_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stead_utility_bills" ADD CONSTRAINT "stead_utility_bills_user_id_movement_id_fkey" FOREIGN KEY ("user_id", "movement_id") REFERENCES "stead_movements"("user_id", "movement_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Shape constraints: the database rejects what the service would. The address envelope is version
-- byte + 12-byte IV + 16-byte tag at least; amounts stop at the movement limit (1,000,000,000 cents),
-- because one movement settles a bill. The raw-material part exists for electricity and gas only.
ALTER TABLE "stead_properties" ADD CONSTRAINT "stead_properties_address_check" CHECK (address_enc IS NULL OR octet_length(address_enc) >= 29);
ALTER TABLE "stead_utility_bills" ADD CONSTRAINT "stead_utility_bills_provider_check" CHECK (length(btrim(provider)) > 0);
ALTER TABLE "stead_utility_bills" ADD CONSTRAINT "stead_utility_bills_dates_check" CHECK (
  period_start BETWEEN DATE '2000-01-01' AND DATE '2100-12-31'
  AND period_end BETWEEN DATE '2000-01-01' AND DATE '2100-12-31'
  AND due_date BETWEEN DATE '2000-01-01' AND DATE '2100-12-31'
  AND period_start <= period_end);
ALTER TABLE "stead_utility_bills" ADD CONSTRAINT "stead_utility_bills_total_check" CHECK (total_cents BETWEEN 1 AND 1000000000);
ALTER TABLE "stead_utility_bills" ADD CONSTRAINT "stead_utility_bills_raw_material_check" CHECK (
  raw_material_cents IS NULL OR (type <> 'INTERNET' AND raw_material_cents BETWEEN 1 AND total_cents));

-- Runtime role (see db/grant-runtime.sql): bills are plain editable records; owner and property never move.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stead_auth_app') THEN
    GRANT SELECT, INSERT, DELETE ON public.stead_utility_bills TO stead_auth_app;
    GRANT UPDATE (type, provider, period_start, period_end, due_date, total_cents, raw_material_cents, movement_id)
      ON public.stead_utility_bills TO stead_auth_app;
    GRANT UPDATE (address_enc) ON public.stead_properties TO stead_auth_app;
  END IF;
END $$;
