-- CreateEnum
CREATE TYPE "stead_property_kind" AS ENUM ('PRIMARY_RESIDENCE', 'SECOND_HOME', 'RENTAL', 'LAND', 'OTHER');

-- CreateEnum
CREATE TYPE "stead_condo_charge_kind" AS ENUM ('BALANCING', 'EXTRAORDINARY');

-- CreateTable
CREATE TABLE "stead_properties" (
    "property_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "kind" "stead_property_kind" NOT NULL,
    "ownership_bps" INTEGER NOT NULL DEFAULT 10000,
    "mortgage_account_id" UUID,
    "sold_on" DATE,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "stead_properties_pkey" PRIMARY KEY ("property_id")
);

-- CreateTable
CREATE TABLE "stead_property_valuations" (
    "valuation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "as_of" DATE NOT NULL,
    "value_cents" BIGINT NOT NULL,

    CONSTRAINT "stead_property_valuations_pkey" PRIMARY KEY ("valuation_id")
);

-- CreateTable
CREATE TABLE "stead_condo_tables" (
    "table_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "label" VARCHAR(60) NOT NULL,
    "unit_millesimi" INTEGER NOT NULL,
    "total_millesimi" INTEGER NOT NULL DEFAULT 1000,

    CONSTRAINT "stead_condo_tables_pkey" PRIMARY KEY ("table_id")
);

-- CreateTable
CREATE TABLE "stead_condo_schedules" (
    "schedule_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,

    CONSTRAINT "stead_condo_schedules_pkey" PRIMARY KEY ("schedule_id")
);

-- CreateTable
CREATE TABLE "stead_condo_charges" (
    "charge_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "kind" "stead_condo_charge_kind" NOT NULL,
    "title_enc" BYTEA NOT NULL,
    "due_date" DATE NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "approved_on" DATE,
    "table_id" UUID,
    "building_total_cents" BIGINT,
    "voided_at" TIMESTAMPTZ(3),
    "movement_id" UUID,

    CONSTRAINT "stead_condo_charges_pkey" PRIMARY KEY ("charge_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stead_properties_user_id_property_id_key" ON "stead_properties"("user_id", "property_id");

-- CreateIndex
CREATE UNIQUE INDEX "stead_properties_user_id_name_key" ON "stead_properties"("user_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "stead_properties_user_id_mortgage_account_id_key" ON "stead_properties"("user_id", "mortgage_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "stead_property_valuations_user_id_valuation_id_key" ON "stead_property_valuations"("user_id", "valuation_id");

-- CreateIndex
CREATE UNIQUE INDEX "stead_property_valuations_user_id_property_id_as_of_key" ON "stead_property_valuations"("user_id", "property_id", "as_of");

-- CreateIndex
CREATE UNIQUE INDEX "stead_condo_tables_user_id_table_id_key" ON "stead_condo_tables"("user_id", "table_id");

-- CreateIndex
CREATE UNIQUE INDEX "stead_condo_tables_user_id_property_id_table_id_key" ON "stead_condo_tables"("user_id", "property_id", "table_id");

-- CreateIndex
CREATE UNIQUE INDEX "stead_condo_tables_user_id_property_id_label_key" ON "stead_condo_tables"("user_id", "property_id", "label");

-- CreateIndex
CREATE UNIQUE INDEX "stead_condo_schedules_user_id_schedule_id_key" ON "stead_condo_schedules"("user_id", "schedule_id");

-- CreateIndex
CREATE UNIQUE INDEX "stead_condo_schedules_user_id_template_id_key" ON "stead_condo_schedules"("user_id", "template_id");

-- CreateIndex
CREATE INDEX "stead_condo_charges_user_id_property_id_due_date_idx" ON "stead_condo_charges"("user_id", "property_id", "due_date");

-- CreateIndex
CREATE UNIQUE INDEX "stead_condo_charges_user_id_charge_id_key" ON "stead_condo_charges"("user_id", "charge_id");

-- CreateIndex
CREATE UNIQUE INDEX "stead_condo_charges_user_id_movement_id_key" ON "stead_condo_charges"("user_id", "movement_id");

-- AddForeignKey
ALTER TABLE "stead_properties" ADD CONSTRAINT "stead_properties_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "stead_users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stead_properties" ADD CONSTRAINT "stead_properties_user_id_mortgage_account_id_fkey" FOREIGN KEY ("user_id", "mortgage_account_id") REFERENCES "stead_accounts"("user_id", "account_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stead_property_valuations" ADD CONSTRAINT "stead_property_valuations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "stead_users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stead_property_valuations" ADD CONSTRAINT "stead_property_valuations_user_id_property_id_fkey" FOREIGN KEY ("user_id", "property_id") REFERENCES "stead_properties"("user_id", "property_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stead_condo_tables" ADD CONSTRAINT "stead_condo_tables_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "stead_users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stead_condo_tables" ADD CONSTRAINT "stead_condo_tables_user_id_property_id_fkey" FOREIGN KEY ("user_id", "property_id") REFERENCES "stead_properties"("user_id", "property_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stead_condo_schedules" ADD CONSTRAINT "stead_condo_schedules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "stead_users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stead_condo_schedules" ADD CONSTRAINT "stead_condo_schedules_user_id_property_id_fkey" FOREIGN KEY ("user_id", "property_id") REFERENCES "stead_properties"("user_id", "property_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stead_condo_schedules" ADD CONSTRAINT "stead_condo_schedules_user_id_template_id_fkey" FOREIGN KEY ("user_id", "template_id") REFERENCES "stead_recurring_templates"("user_id", "template_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stead_condo_charges" ADD CONSTRAINT "stead_condo_charges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "stead_users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stead_condo_charges" ADD CONSTRAINT "stead_condo_charges_user_id_property_id_fkey" FOREIGN KEY ("user_id", "property_id") REFERENCES "stead_properties"("user_id", "property_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stead_condo_charges" ADD CONSTRAINT "stead_condo_charges_user_id_property_id_table_id_fkey" FOREIGN KEY ("user_id", "property_id", "table_id") REFERENCES "stead_condo_tables"("user_id", "property_id", "table_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stead_condo_charges" ADD CONSTRAINT "stead_condo_charges_user_id_movement_id_fkey" FOREIGN KEY ("user_id", "movement_id") REFERENCES "stead_movements"("user_id", "movement_id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Range and shape constraints (M4a). Dates stay inside the application's calendar window;
-- amounts match the service caps so the database rejects what the service would.
ALTER TABLE "stead_properties" ADD CONSTRAINT "stead_properties_name_check" CHECK (length(btrim(name)) > 0);
ALTER TABLE "stead_properties" ADD CONSTRAINT "stead_properties_ownership_check" CHECK (ownership_bps BETWEEN 1 AND 10000);
ALTER TABLE "stead_properties" ADD CONSTRAINT "stead_properties_sold_check" CHECK (sold_on IS NULL OR sold_on BETWEEN DATE '2000-01-01' AND DATE '2100-12-31');

ALTER TABLE "stead_property_valuations" ADD CONSTRAINT "stead_property_valuations_date_check" CHECK (as_of BETWEEN DATE '2000-01-01' AND DATE '2100-12-31');
ALTER TABLE "stead_property_valuations" ADD CONSTRAINT "stead_property_valuations_value_check" CHECK (value_cents BETWEEN 1 AND 1000000000000);

ALTER TABLE "stead_condo_tables" ADD CONSTRAINT "stead_condo_tables_label_check" CHECK (length(btrim(label)) > 0);
ALTER TABLE "stead_condo_tables" ADD CONSTRAINT "stead_condo_tables_millesimi_check" CHECK (unit_millesimi >= 1 AND unit_millesimi <= total_millesimi AND total_millesimi <= 100000);

-- Payable amounts are one movement each, so they stop at the movement limit (1,000,000,000 cents).
-- The title envelope is version byte + 12-byte IV + 16-byte tag at least, like movement descriptions.
ALTER TABLE "stead_condo_charges" ADD CONSTRAINT "stead_condo_charges_title_check" CHECK (octet_length(title_enc) >= 29);
ALTER TABLE "stead_condo_charges" ADD CONSTRAINT "stead_condo_charges_amount_check" CHECK (amount_cents BETWEEN 1 AND 1000000000);
ALTER TABLE "stead_condo_charges" ADD CONSTRAINT "stead_condo_charges_dates_check" CHECK (
  due_date BETWEEN DATE '2000-01-01' AND DATE '2100-12-31'
  AND (approved_on IS NULL OR approved_on BETWEEN DATE '2000-01-01' AND DATE '2100-12-31'));
ALTER TABLE "stead_condo_charges" ADD CONSTRAINT "stead_condo_charges_building_check" CHECK (
  (table_id IS NULL AND building_total_cents IS NULL)
  OR (table_id IS NOT NULL AND building_total_cents IS NOT NULL AND building_total_cents BETWEEN 1 AND 100000000000 AND building_total_cents >= amount_cents));
