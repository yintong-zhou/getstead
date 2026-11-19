BEGIN;

GRANT USAGE ON SCHEMA public TO stead_auth_app;
GRANT SELECT ON public.stead_users TO stead_auth_app;
GRANT UPDATE (totp_secret, last_totp_step) ON public.stead_users TO stead_auth_app;
GRANT SELECT, INSERT, DELETE ON public.stead_login_challenges, public.stead_sessions TO stead_auth_app;
GRANT SELECT, INSERT, UPDATE ON public.stead_auth_limits TO stead_auth_app;

COMMIT;
