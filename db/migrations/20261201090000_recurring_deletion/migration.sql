ALTER TABLE "stead_recurring_templates"
  ADD COLUMN "deleted_at" TIMESTAMPTZ(3),
  ADD CONSTRAINT "stead_recurring_templates_deleted_requires_archive"
    CHECK ("deleted_at" IS NULL OR "archived_at" IS NOT NULL);
