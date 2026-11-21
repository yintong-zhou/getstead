BEGIN;

GRANT USAGE ON SCHEMA public TO stead_auth_app;

-- Authentication (M0)
GRANT SELECT ON public.stead_users TO stead_auth_app;
GRANT UPDATE (totp_secret, last_totp_step) ON public.stead_users TO stead_auth_app;
GRANT SELECT, INSERT, DELETE ON public.stead_login_challenges, public.stead_sessions TO stead_auth_app;
GRANT SELECT, INSERT, UPDATE ON public.stead_auth_limits TO stead_auth_app;

-- Profile (M0 follow-up)
GRANT UPDATE (email, password_hash, display_name) ON public.stead_users TO stead_auth_app;

-- Cash flow and budget (M1). Least privilege: no table is TRUNCATE-able, rows that carry history
-- are never DELETEd (accounts, categories, movements, templates are archived or voided instead),
-- and UPDATE is limited to the columns the services actually change.
GRANT SELECT, INSERT ON public.stead_accounts, public.stead_categories, public.stead_movements,
  public.stead_recurring_templates TO stead_auth_app;
GRANT UPDATE (name, type, archived_at) ON public.stead_accounts TO stead_auth_app;
GRANT UPDATE (name, archived_at) ON public.stead_categories TO stead_auth_app;
GRANT UPDATE (account_id, category_id, booking_date, description_enc, amount_cents, voided_at, transfer_id, transfer_leg)
  ON public.stead_movements TO stead_auth_app;
GRANT UPDATE (account_id, category_id, description_enc, amount_cents, end_date, archived_at)
  ON public.stead_recurring_templates TO stead_auth_app;

GRANT SELECT, INSERT, DELETE ON public.stead_transfers, public.stead_recurring_occurrences TO stead_auth_app;
GRANT SELECT, INSERT, UPDATE (category_id), DELETE ON public.stead_category_rules TO stead_auth_app;
GRANT SELECT, INSERT, UPDATE (limit_cents), DELETE ON public.stead_budget_limits TO stead_auth_app;

-- Net worth (M2)
GRANT SELECT, INSERT, UPDATE (balance_cents), DELETE ON public.stead_balance_checks TO stead_auth_app;

-- Investments (M3): identity and ownership columns cannot be changed; history is voided.
GRANT SELECT, INSERT ON public.stead_instruments, public.stead_investment_transactions, public.stead_price_quotes TO stead_auth_app;
GRANT UPDATE (name, symbol, isin, kind, archived_at) ON public.stead_instruments TO stead_auth_app;
GRANT UPDATE (account_id, instrument_id, type, trade_date, ordinal, quantity, amount_cents, fees_cents, tax_withheld_cents, voided_at)
  ON public.stead_investment_transactions TO stead_auth_app;
GRANT UPDATE (unit_price), DELETE ON public.stead_price_quotes TO stead_auth_app;

-- Property and condominium (M4a): properties and charges are archived or voided, never deleted.
-- Valuations, millesimal tables and schedule links are plain editable records.
GRANT SELECT, INSERT ON public.stead_properties, public.stead_property_valuations, public.stead_condo_tables,
  public.stead_condo_schedules, public.stead_condo_charges TO stead_auth_app;
GRANT UPDATE (name, kind, ownership_bps, mortgage_account_id, sold_on, archived_at) ON public.stead_properties TO stead_auth_app;
GRANT UPDATE (value_cents), DELETE ON public.stead_property_valuations TO stead_auth_app;
GRANT UPDATE (label, unit_millesimi, total_millesimi), DELETE ON public.stead_condo_tables TO stead_auth_app;
GRANT DELETE ON public.stead_condo_schedules TO stead_auth_app;
GRANT UPDATE (kind, title_enc, due_date, amount_cents, approved_on, table_id, building_total_cents, voided_at, movement_id)
  ON public.stead_condo_charges TO stead_auth_app;


-- Admin (M5). Users are created with a column list that leaves out `role` (Prisma sends `user_id`
-- and `created_at` itself), and `role` is never
-- updatable: promotion to admin only happens through the owner CLI on the admin connection.
GRANT INSERT (user_id, email, display_name, password_hash, must_change_password, created_at) ON public.stead_users TO stead_auth_app;
GRANT UPDATE (disabled_at, must_change_password, last_login_at) ON public.stead_users TO stead_auth_app;
GRANT SELECT, INSERT, DELETE ON public.stead_event_logs TO stead_auth_app;

-- Public waitlist: the app can only add an entry. It cannot read the list back.
GRANT INSERT ON public.stead_waitlist TO stead_auth_app;

COMMIT;
