WHENEVER SQLERROR EXIT FAILURE ROLLBACK
SET DEFINE OFF

-- Run as a provisioning administrator in the local XEPDB1 PDB.
GRANT SELECT ON stead_auth_owner.stead_users TO stead_auth_app;
GRANT UPDATE (totp_secret, last_totp_step) ON stead_auth_owner.stead_users TO stead_auth_app;
GRANT SELECT, INSERT, DELETE ON stead_auth_owner.stead_login_challenges TO stead_auth_app;
GRANT SELECT, INSERT, DELETE ON stead_auth_owner.stead_sessions TO stead_auth_app;
GRANT SELECT, INSERT, UPDATE ON stead_auth_owner.stead_auth_limits TO stead_auth_app;

CREATE SYNONYM stead_auth_app.stead_users FOR stead_auth_owner.stead_users;
CREATE SYNONYM stead_auth_app.stead_login_challenges FOR stead_auth_owner.stead_login_challenges;
CREATE SYNONYM stead_auth_app.stead_sessions FOR stead_auth_owner.stead_sessions;
CREATE SYNONYM stead_auth_app.stead_auth_limits FOR stead_auth_owner.stead_auth_limits;
