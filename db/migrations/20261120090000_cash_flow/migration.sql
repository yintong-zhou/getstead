BEGIN;

-- CreateEnum
CREATE TYPE "stead_account_type" AS ENUM ('CHECKING', 'CARD', 'BROKERAGE', 'CRYPTO', 'CASH', 'DEBT');

-- CreateEnum
CREATE TYPE "stead_category_kind" AS ENUM ('EXPENSE', 'INCOME');

-- CreateEnum
CREATE TYPE "stead_transfer_leg" AS ENUM ('OUT', 'IN');

-- CreateEnum
CREATE TYPE "stead_budget_limit_kind" AS ENUM ('BASE', 'OVERRIDE');

-- CreateEnum
CREATE TYPE "stead_recurrence_frequency" AS ENUM ('WEEKLY', 'MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "stead_occurrence_status" AS ENUM ('CONFIRMED', 'MATCHED', 'SKIPPED');

-- CreateTable
CREATE TABLE "stead_accounts" (
    "account_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "type" "stead_account_type" NOT NULL,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stead_accounts_pkey" PRIMARY KEY ("account_id")
);

-- CreateTable
CREATE TABLE "stead_categories" (
    "category_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "kind" "stead_category_kind" NOT NULL,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stead_categories_pkey" PRIMARY KEY ("category_id")
);

-- CreateTable
CREATE TABLE "stead_transfers" (
    "transfer_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stead_transfers_pkey" PRIMARY KEY ("transfer_id")
);

-- CreateTable
CREATE TABLE "stead_movements" (
    "movement_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "category_id" UUID,
    "booking_date" DATE NOT NULL,
    "description_enc" BYTEA NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "voided_at" TIMESTAMPTZ(3),
    "transfer_id" UUID,
    "transfer_leg" "stead_transfer_leg",
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stead_movements_pkey" PRIMARY KEY ("movement_id")
);

-- CreateTable
CREATE TABLE "stead_category_rules" (
    "rule_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "phrase" VARCHAR(60) NOT NULL,
    "category_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stead_category_rules_pkey" PRIMARY KEY ("rule_id")
);

-- CreateTable
CREATE TABLE "stead_budget_limits" (
    "limit_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "kind" "stead_budget_limit_kind" NOT NULL,
    "limit_cents" INTEGER,

    CONSTRAINT "stead_budget_limits_pkey" PRIMARY KEY ("limit_id")
);

-- CreateTable
CREATE TABLE "stead_recurring_templates" (
    "template_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "category_id" UUID,
    "description_enc" BYTEA NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "frequency" "stead_recurrence_frequency" NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stead_recurring_templates_pkey" PRIMARY KEY ("template_id")
);

-- CreateTable
CREATE TABLE "stead_recurring_occurrences" (
    "occurrence_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "due_date" DATE NOT NULL,
    "status" "stead_occurrence_status" NOT NULL,
    "movement_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stead_recurring_occurrences_pkey" PRIMARY KEY ("occurrence_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stead_accounts_user_id_account_id_key" ON "stead_accounts"("user_id", "account_id");

-- CreateIndex
CREATE UNIQUE INDEX "stead_accounts_user_id_name_key" ON "stead_accounts"("user_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "stead_categories_user_id_category_id_key" ON "stead_categories"("user_id", "category_id");

-- CreateIndex
CREATE UNIQUE INDEX "stead_categories_user_id_name_key" ON "stead_categories"("user_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "stead_transfers_user_id_transfer_id_key" ON "stead_transfers"("user_id", "transfer_id");

-- CreateIndex
CREATE INDEX "stead_movements_user_id_booking_date_idx" ON "stead_movements"("user_id", "booking_date");

-- CreateIndex
CREATE INDEX "stead_movements_user_id_account_id_booking_date_idx" ON "stead_movements"("user_id", "account_id", "booking_date");

-- CreateIndex
CREATE INDEX "stead_movements_user_id_category_id_booking_date_idx" ON "stead_movements"("user_id", "category_id", "booking_date");

-- CreateIndex
CREATE UNIQUE INDEX "stead_movements_user_id_movement_id_key" ON "stead_movements"("user_id", "movement_id");

-- CreateIndex
CREATE UNIQUE INDEX "stead_movements_transfer_id_transfer_leg_key" ON "stead_movements"("transfer_id", "transfer_leg");

-- CreateIndex
CREATE UNIQUE INDEX "stead_category_rules_user_id_phrase_key" ON "stead_category_rules"("user_id", "phrase");

-- CreateIndex
CREATE UNIQUE INDEX "stead_budget_limits_user_id_category_id_month_kind_key" ON "stead_budget_limits"("user_id", "category_id", "month", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "stead_recurring_templates_user_id_template_id_key" ON "stead_recurring_templates"("user_id", "template_id");

-- CreateIndex
CREATE UNIQUE INDEX "stead_recurring_occurrences_template_id_due_date_key" ON "stead_recurring_occurrences"("template_id", "due_date");

-- CreateIndex
CREATE UNIQUE INDEX "stead_recurring_occurrences_user_id_movement_id_key" ON "stead_recurring_occurrences"("user_id", "movement_id");

-- AddForeignKey
ALTER TABLE "stead_accounts" ADD CONSTRAINT "stead_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "stead_users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stead_categories" ADD CONSTRAINT "stead_categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "stead_users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stead_transfers" ADD CONSTRAINT "stead_transfers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "stead_users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stead_movements" ADD CONSTRAINT "stead_movements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "stead_users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stead_movements" ADD CONSTRAINT "stead_movements_user_id_account_id_fkey" FOREIGN KEY ("user_id", "account_id") REFERENCES "stead_accounts"("user_id", "account_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stead_movements" ADD CONSTRAINT "stead_movements_user_id_category_id_fkey" FOREIGN KEY ("user_id", "category_id") REFERENCES "stead_categories"("user_id", "category_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stead_movements" ADD CONSTRAINT "stead_movements_user_id_transfer_id_fkey" FOREIGN KEY ("user_id", "transfer_id") REFERENCES "stead_transfers"("user_id", "transfer_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stead_category_rules" ADD CONSTRAINT "stead_category_rules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "stead_users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stead_category_rules" ADD CONSTRAINT "stead_category_rules_user_id_category_id_fkey" FOREIGN KEY ("user_id", "category_id") REFERENCES "stead_categories"("user_id", "category_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stead_budget_limits" ADD CONSTRAINT "stead_budget_limits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "stead_users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stead_budget_limits" ADD CONSTRAINT "stead_budget_limits_user_id_category_id_fkey" FOREIGN KEY ("user_id", "category_id") REFERENCES "stead_categories"("user_id", "category_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stead_recurring_templates" ADD CONSTRAINT "stead_recurring_templates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "stead_users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stead_recurring_templates" ADD CONSTRAINT "stead_recurring_templates_user_id_account_id_fkey" FOREIGN KEY ("user_id", "account_id") REFERENCES "stead_accounts"("user_id", "account_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stead_recurring_templates" ADD CONSTRAINT "stead_recurring_templates_user_id_category_id_fkey" FOREIGN KEY ("user_id", "category_id") REFERENCES "stead_categories"("user_id", "category_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stead_recurring_occurrences" ADD CONSTRAINT "stead_recurring_occurrences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "stead_users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stead_recurring_occurrences" ADD CONSTRAINT "stead_recurring_occurrences_user_id_template_id_fkey" FOREIGN KEY ("user_id", "template_id") REFERENCES "stead_recurring_templates"("user_id", "template_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stead_recurring_occurrences" ADD CONSTRAINT "stead_recurring_occurrences_user_id_movement_id_fkey" FOREIGN KEY ("user_id", "movement_id") REFERENCES "stead_movements"("user_id", "movement_id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- Row-level invariants Prisma cannot express. Cross-row rules (equal and opposite transfer legs,
-- different accounts) are enforced in server/cash-flow/movements.ts under row locks.

ALTER TABLE "stead_accounts" ADD CONSTRAINT "stead_accounts_name_check"
    CHECK (name = btrim(name) AND char_length(name) BETWEEN 1 AND 80);

ALTER TABLE "stead_categories" ADD CONSTRAINT "stead_categories_name_check"
    CHECK (name = btrim(name) AND char_length(name) BETWEEN 1 AND 80);

ALTER TABLE "stead_movements" ADD CONSTRAINT "stead_movements_amount_check"
    CHECK (amount_cents <> 0 AND amount_cents BETWEEN -1000000000 AND 1000000000);

ALTER TABLE "stead_movements" ADD CONSTRAINT "stead_movements_date_check"
    CHECK (booking_date BETWEEN DATE '2000-01-01' AND DATE '2100-12-31');

-- version byte + 12-byte IV + 16-byte tag at least
ALTER TABLE "stead_movements" ADD CONSTRAINT "stead_movements_description_check"
    CHECK (octet_length(description_enc) >= 29);

ALTER TABLE "stead_movements" ADD CONSTRAINT "stead_movements_transfer_check"
    CHECK (
        (transfer_id IS NULL AND transfer_leg IS NULL)
        OR (transfer_id IS NOT NULL AND (
            (transfer_leg = 'OUT' AND amount_cents < 0) OR (transfer_leg = 'IN' AND amount_cents > 0)
        ))
    );

ALTER TABLE "stead_category_rules" ADD CONSTRAINT "stead_category_rules_phrase_check"
    CHECK (phrase = btrim(phrase) AND char_length(phrase) BETWEEN 1 AND 60);

ALTER TABLE "stead_budget_limits" ADD CONSTRAINT "stead_budget_limits_check"
    CHECK (
        EXTRACT(DAY FROM month) = 1
        AND (limit_cents IS NULL OR limit_cents BETWEEN 0 AND 1000000000)
        AND (kind = 'BASE' OR limit_cents IS NOT NULL)
    );

ALTER TABLE "stead_recurring_templates" ADD CONSTRAINT "stead_recurring_templates_check"
    CHECK (
        amount_cents BETWEEN 1 AND 1000000000
        AND octet_length(description_enc) >= 29
        AND start_date BETWEEN DATE '2000-01-01' AND DATE '2100-12-31'
        AND (end_date IS NULL OR end_date >= start_date)
    );

ALTER TABLE "stead_recurring_occurrences" ADD CONSTRAINT "stead_recurring_occurrences_check"
    CHECK ((status = 'SKIPPED') = (movement_id IS NULL));

COMMIT;
