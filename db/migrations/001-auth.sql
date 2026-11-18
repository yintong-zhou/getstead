WHENEVER SQLERROR EXIT FAILURE ROLLBACK
SET DEFINE OFF

CREATE TABLE stead_users (
  user_id VARCHAR2(36 CHAR) CONSTRAINT stead_users_pk PRIMARY KEY,
  email VARCHAR2(254 CHAR) CONSTRAINT stead_users_email_uq UNIQUE NOT NULL,
  password_hash VARCHAR2(180 CHAR) NOT NULL,
  totp_secret RAW(256),
  last_totp_step NUMBER(12, 0)
);

CREATE TABLE stead_login_challenges (
  token_digest RAW(32) CONSTRAINT stead_challenges_pk PRIMARY KEY,
  user_id VARCHAR2(36 CHAR) NOT NULL REFERENCES stead_users (user_id),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  pending_secret RAW(256)
);

CREATE INDEX stead_challenges_user_ix ON stead_login_challenges (user_id);

CREATE TABLE stead_sessions (
  token_digest RAW(32) CONSTRAINT stead_sessions_pk PRIMARY KEY,
  user_id VARCHAR2(36 CHAR) NOT NULL REFERENCES stead_users (user_id),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX stead_sessions_user_ix ON stead_sessions (user_id);

CREATE TABLE stead_auth_limits (
  phase VARCHAR2(8 CHAR) NOT NULL,
  subject_digest RAW(32) NOT NULL,
  attempts NUMBER(2, 0) NOT NULL,
  window_until TIMESTAMP WITH TIME ZONE NOT NULL,
  CONSTRAINT stead_auth_limits_pk PRIMARY KEY (phase, subject_digest)
);
