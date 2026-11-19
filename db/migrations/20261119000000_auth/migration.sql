BEGIN;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "stead_users" (
    "user_id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "password_hash" VARCHAR(180) NOT NULL,
    "totp_secret" BYTEA,
    "last_totp_step" INTEGER,

    CONSTRAINT "stead_users_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "stead_login_challenges" (
    "token_digest" BYTEA NOT NULL,
    "user_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "pending_secret" BYTEA,

    CONSTRAINT "stead_login_challenges_pkey" PRIMARY KEY ("token_digest")
);

-- CreateTable
CREATE TABLE "stead_sessions" (
    "token_digest" BYTEA NOT NULL,
    "user_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "stead_sessions_pkey" PRIMARY KEY ("token_digest")
);

-- CreateTable
CREATE TABLE "stead_auth_limits" (
    "phase" VARCHAR(8) NOT NULL,
    "subject_digest" BYTEA NOT NULL,
    "attempts" SMALLINT NOT NULL,
    "window_until" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "stead_auth_limits_pkey" PRIMARY KEY ("phase","subject_digest")
);

-- CreateIndex
CREATE UNIQUE INDEX "stead_users_email_key" ON "stead_users"("email");

-- CreateIndex
CREATE INDEX "stead_login_challenges_user_id_idx" ON "stead_login_challenges"("user_id");

-- CreateIndex
CREATE INDEX "stead_sessions_user_id_idx" ON "stead_sessions"("user_id");

-- AddForeignKey
ALTER TABLE "stead_login_challenges" ADD CONSTRAINT "stead_login_challenges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "stead_users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stead_sessions" ADD CONSTRAINT "stead_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "stead_users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
