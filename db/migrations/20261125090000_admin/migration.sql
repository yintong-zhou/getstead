BEGIN;

-- M5 admin: roles, account status and the error/security event log.
CREATE TYPE "stead_user_role" AS ENUM ('USER', 'ADMIN');
CREATE TYPE "stead_event_kind" AS ENUM ('ERROR', 'SECURITY');

ALTER TABLE "stead_users"
  ADD COLUMN "role" "stead_user_role" NOT NULL DEFAULT 'USER',
  ADD COLUMN "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "last_login_at" TIMESTAMPTZ(3),
  ADD COLUMN "disabled_at" TIMESTAMPTZ(3),
  ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "stead_event_logs" (
    "event_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" "stead_event_kind" NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "route" VARCHAR(200),
    "method" VARCHAR(8),
    "user_id" UUID,
    "actor_id" UUID,

    CONSTRAINT "stead_event_logs_pkey" PRIMARY KEY ("event_id")
);

CREATE INDEX "stead_event_logs_created_at_idx" ON "stead_event_logs"("created_at");
CREATE INDEX "stead_event_logs_kind_created_at_idx" ON "stead_event_logs"("kind", "created_at");

ALTER TABLE "stead_event_logs" ADD CONSTRAINT "stead_event_logs_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "stead_users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stead_event_logs" ADD CONSTRAINT "stead_event_logs_actor_id_fkey"
  FOREIGN KEY ("actor_id") REFERENCES "stead_users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
