# Handoff: M5 admin area (2026-11-21)

Plan: `C:\Users\zhouy\.claude\plans\ora-pianifichiamo-un-interfaccia-di-cuddly-rose.md` (approved by the owner).

## State
- Working tree on `main` (base `e681d6e`), all changes uncommitted.
- Migration `db/migrations/20261125090000_admin` and the new "Admin (M5)" block in `db/grant-runtime.sql` were applied **only** to the local container `stead-m1-pg` (with `.tmp/apply-admin-local.mjs`, which refuses any host other than 127.0.0.1:55432).
- **Neon (`neondb`), with the owner's explicit OK on 2026-11-21:** `migrate deploy` applied only `20261125090000_admin`, and `db/grant-runtime.sql` was re-run. Read-only check: `migrate status` is up to date, and the runtime grants match (`role` SELECT only; INSERT on `user_id`, `created_at`, `must_change_password` and the existing columns; UPDATE on `disabled_at`, `last_login_at`, `must_change_password`; `stead_event_logs` SELECT/INSERT/DELETE). `migrate diff` reports only a no-op `SET DEFAULT 'USER'::stead_user_role` on `role`, which already is the column default (a Prisma quirk with `dbgenerated` on enum columns, noted in the schema).
- The live database is now `neondb`: `test_neondb` no longer exists. `credentials/stead-postgres.env` still points to `/test_neondb` and must be updated by the owner. This session overrode it in its own shell only.
- `neondb` has **0 users** right now, so nobody has been promoted. `auth:owner` only accepts a local connection. To promote on Neon, run `UPDATE stead_users SET role = 'ADMIN' WHERE email = '<owner>'` on the admin connection, after the owner account exists.
- Committed on branch `feat/m5-admin`, not pushed. No deploy.

## What changed
- Schema:
  - `User` gains `role` (`USER`/`ADMIN`), `createdAt`, `lastLoginAt`, `disabledAt` and `mustChangePassword`.
  - New `EventLog` (`stead_event_logs`) stores codes, route patterns and user ids only.
  - `role` uses `dbgenerated` on purpose. Otherwise Prisma sends it on every insert, and the column-level INSERT grant (which leaves out `role`) would refuse the insert.
- Auth:
  - `readSession` is the single choke point. It refuses disabled users and returns `admin`, `mustChangePassword` and `hasTotp`.
  - `signIn` returns `disabled` only after a correct password.
  - `verifyMfa` re-checks `disabledAt`.
  - `createSession` stamps `lastLoginAt`.
- `api()` (`server/cash-flow/http.ts`):
  - option `admin` requires the ADMIN role plus TOTP;
  - option `allowPasswordChange` lets the password route through while a temporary password is active; every other route returns 403 `password_change_required`;
  - a 500 writes an ERROR event with the error class or Prisma code, never the message.
- `instrumentation.ts`: `onRequestError` logs page and server-component errors.
- `readPageUser(locale, { allowPasswordChange })`: the locale is now required, so every page had to be updated. A temporary password redirects to `/{locale}/profile`.
- Security events:
  - `login_limited` and `mfa_limited` are logged at most once per user per 15 minutes; `login_disabled` is also logged.
  - `admin_password_reset`, `admin_user_created`, `admin_user_disabled` and `admin_user_enabled` are logged with the acting admin. The last three are an extra the owner can drop.
  - Single wrong passwords are deliberately not logged, which keeps the table bounded.
- Retention: 30 days. Pruning runs on traffic, at most once per hour per process (marked with a `ponytail:` comment; move it to Vercel Cron when cron lands).
- UI:
  - `/[locale]/admin` shows overview tiles, user creation (temporary password shown once) and a user list with search, status filter, pagination, reset, disable and enable.
  - `/[locale]/admin/logs` filters by type, code, user email and UTC date range, with pagination.
  - The entry point is a Profile menu item, visible to admins only.
- CLI: `npm run auth:owner -- promote`.
- Docs: AGENTS.md scope (M5), PROJECT.md, README.md.

## Proof (on the final tree)
- `lint`, `typecheck` and `build` pass; `test` passes 97/97.
- Integration on `stead_auth_test` via `.tmp/stead-m1-test.env`:
  - admin suite 7/7;
  - cash-flow, investments and property suites pass.
- Negative controls:
  - removing the `disabledAt` filter in `readSession` fails the disable test;
  - dropping the TOTP requirement in the admin guard fails the guard test.
- HTTP smoke on `next dev` (port 3100, test DB):
  - an admin gets 200 on both pages;
  - a plain user gets 404, and 403 on `/api/admin/*`;
  - an admin without TOTP sees the notice;
  - an anonymous visitor is sent to login (307);
  - a user on a temporary password is redirected to the profile and gets 403 on other APIs;
  - no errors in the dev log.
- Pre-existing, unrelated failure: `server/auth/postgres.integration.ts` "profile TOTP enrollment…" calls `resetOwner`, which deletes from `stead_auth_limits`. The runtime role has no DELETE on that table, so the test fails under `.tmp/stead-m1-test.env` on the base commit too. It passes 4/4 with the owner URL as `DATABASE_URL` (`.tmp/stead-m5-auth-owner.env`).
- Browser (Orca, synthetic data, admin session cookie):
  - `/en/admin` at 1280 px and `/it/admin/logs` at 390 px, no horizontal scroll, no console errors or hydration warnings;
  - creating a user shows the temporary password once and the new row;
  - disable goes through the confirm dialog and logs the event;
  - the status filter (GET form + `Select` hidden input) and the logs type filter work.
- Found and fixed in the browser pass: the shared `.section-nav` is hidden on desktop, so the Users/Logs tabs were invisible. `.admin-nav` now always shows them.
- `onRequestError` does not log `redirect()` / `notFound()`: after the smoke run, no ERROR rows have a `/[locale]` route.
- `next dev` appended its `nextjs-agent-rules` block to AGENTS.md (generated, not written by hand).
- No independent review yet.

## To ship on Neon (owner's OK first)
Order matters: the migration and grants must land **before** the new code deploys. `readSession` selects the new columns and `createSession` writes `last_login_at`, so new code on the old schema fails every request.

1. Apply `20261125090000_admin`.
2. Re-run `db/grant-runtime.sql`.
3. Run `npm run auth:owner -- promote` for the owner account. The admin area opens only with TOTP enabled.

The "active (30 days)" tile starts at 0, because existing users have no `lastLoginAt` yet. Existing users' `created_at` is the migration time.

## Known limits
- Error log coverage is mainly API 500s. Most pages catch their own failures and show `UnavailableNotice`, so those never reach `onRequestError`.
- A password reset gives the admin the temporary password, so they could sign in as that user. The `admin_password_reset` row is pruned after 30 days like everything else. The owner has to decide whether that is acceptable.
