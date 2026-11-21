BEGIN;

-- Public waitlist: one row per email, with the language of the page and the time of consent.
CREATE TABLE "stead_waitlist" (
    "entry_id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "locale" VARCHAR(2) NOT NULL,
    "consent_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stead_waitlist_pkey" PRIMARY KEY ("entry_id"),
    CONSTRAINT "stead_waitlist_locale_check" CHECK ("locale" IN ('en', 'it'))
);

CREATE UNIQUE INDEX "stead_waitlist_email_key" ON "stead_waitlist"("email");

COMMIT;
