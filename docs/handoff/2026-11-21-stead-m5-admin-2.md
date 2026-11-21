---
type: handoff
date: 2026-11-21
status: M5 admin committed on feat/m5-admin and pushed (b092660 + this handoff); migration applied to Neon neondb; not merged, not deployed, no independent review
seq: 10
prev: docs/handoff/2026-11-21-stead-m5-admin.md
tags: [stead, m5, admin, auth, logs, neon, claude]
---

# Handoff: M5 admin area, released to Neon

## Goal
An admin area for the owner. It shows how many accounts exist and are in use, gives an overview of users (metadata only, never financial data), and lets the admin create accounts, reset passwords and disable or re-enable accounts. It also offers a filterable, paginated log of server errors and security events. Support stays by email: no ticketing. The owner added this as milestone M5 on top of v1 scope (recorded in AGENTS.md and PROJECT.md).

## Where we are
- **Done, verified and committed** on branch `feat/m5-admin` (`b092660`), pushed together with this handoff. `main` is untouched. The full detail (design, proof, known limits) is in the previous handoff, `docs/handoff/2026-11-21-stead-m5-admin.md`. Its "State" section starts with lines from before the commit.
- **Verification on the final tree:**
  - `lint`, `typecheck` and `build` pass; `test` passes 97/97.
  - Integration on the local container: admin suite 7/7; cash-flow, investments and property suites pass.
  - Two negative controls fail as expected.
  - Orca browser pass at 1280 and 390 px, with no console errors.
- **Neon (`neondb`):** migration `20261125090000_admin` applied with the owner's OK, `db/grant-runtime.sql` re-run, read-only check OK. The migration's checksum is recorded for the CRLF form of the file, on Neon and locally.
- **Not done:**
  - merge to `main` and deploy on Vercel;
  - independent security review;
  - first admin in production, blocked because `neondb` has 0 users.

## What we tried that did NOT work
- **`prisma migrate deploy` with the stock config.** `prisma.config.ts` loads `credentials/stead-postgres.env`, whose `DATABASE_ADMIN_URL` points to `/test_neondb`. That database no longer exists (P1003). The live database is `neondb`. Fix used: export `DATABASE_ADMIN_URL` with the path set to `/neondb` in the shell only, and check that Prisma's "Datasource" line says `neondb` before deploying.
- **Removing the `migrate diff` drift on `role`.** I tried four spellings of `dbgenerated` (`'USER'::stead_user_role`, quoted type, `public.` prefix, `'USER'`). None works: Prisma always reports a no-op `SET DEFAULT`. Left as is, with a comment in the schema.
- **`@default(USER)` on `role`.** Prisma then sends `role` on every INSERT, and the column-level grant (no INSERT on `role`) refuses the insert with 42501. Prisma also sends `created_at`, which therefore got its own INSERT grant.
- **`node --env-file` for `next dev`.** It fails with "--env-file= is not allowed in NODE_OPTIONS". Use `set -a; . ./.tmp/stead-m1-test.env; set +a` before `node node_modules/next/dist/bin/next dev`.
- **A first click on "Create" in the browser did nothing.** It happened during a Fast Refresh rebuild. A second click worked: not a bug.

## Problems we hit and how we fixed them
- **Admin tabs invisible on desktop.** The shared `.section-nav` is mobile-only (`globals.css` hides it at ≥ the desktop breakpoint). Fix: `.section-nav.admin-nav { display: flex }` in `components/admin/admin.css`.
- **Migration line endings.** The file was written LF and applied on Neon with the LF checksum, but the repo's working copies are CRLF (`core.autocrlf=true`, every other migration is CRLF). Fix: convert the file to CRLF and update `_prisma_migrations.checksum` on Neon and locally, only where the stored value matched the LF checksum (`.tmp/fix-checksum.mjs`).
- **`server/auth/postgres.integration.ts` "profile TOTP enrollment…" fails with the runtime role.** `resetOwner` deletes from `stead_auth_limits`, and the runtime role has no DELETE there. It fails the same way on the base commit. Run that suite with the owner URL as `DATABASE_URL` (`.tmp/stead-m5-auth-owner.env`).
- **Multi-line edits on CRLF files.** The working copies are CRLF, so exact-match edits fail. `.tmp/rep.mjs` normalises EOL before replacing.

## Decisions taken
- `ADMIN` role on the normal login with mandatory TOTP. Rejected: a separate admin account and table.
- Admins see metadata only. Rejected: viewing financial data, and impersonation.
- Reset uses a temporary password shown once, with a forced change. Rejected: an email reset link, which would need a new dependency.
- Disable and enable only. Rejected: deleting accounts.
- The log holds API 500s plus security events, kept 30 days. Only limiter trips are logged (at most one per user per 15 minutes), not every wrong password, so an attacker can't fill the table.
- The admin entry is in the Profile menu, not the sidebar, so it also works on mobile without changing the 4 bottom tabs.
- `readSession` is the single choke point for disabled users. `readPageUser(locale)` takes the locale as a required parameter, so TypeScript forced every page to be updated.
- Not decided yet (owner's call):
  - keep `admin_password_reset` events beyond 30 days?
  - keep the extra events `admin_user_created`, `admin_user_disabled` and `admin_user_enabled`?
  - rotate `AUTH_ENCRYPTION_KEY` from `.tmp/stead-auth-test.env`, which was printed unredacted in a session log?

## Files touched
- `db/schema.prisma`, `db/migrations/20261125090000_admin/migration.sql`, `db/grant-runtime.sql`: role, status columns, `stead_event_logs`, column-level grants.
- `server/admin/logs.ts`, `server/admin/users.ts`, `server/admin/postgres.integration.ts`: the event log, user management and their tests.
- `server/auth/service.ts`, `page-access.ts`, `owner.ts`, `owner-cli.ts`: the disabled-user choke point, `lastLoginAt`, the temporary-password redirect, and the `promote` command.
- `server/cash-flow/http.ts`: `api()` options `admin` and `allowPasswordChange`, and 500 logging. `server/cash-flow/movements.ts`: `integerParam` exported. `server/profile/service.ts`: `Profile.admin` and `mustChangePassword`.
- `instrumentation.ts`: `onRequestError` logs page errors.
- `app/[locale]/admin/**`, `app/api/admin/**`: the admin pages and API.
- `app/api/auth/{login,mfa}`: security events. Every `app/[locale]/*/page.tsx`: `readPageUser(locale)`.
- `components/admin/**`: views, URL state with its test, and copy. `components/profile/*`: the admin menu item and the temporary-password notice. `components/app-shell.tsx`: the `admin` section.
- `AGENTS.md`, `PROJECT.md`, `README.md`, `package.json` (`test:postgres` includes the admin suite).

## Where we want to go
1. Have the owner create their account on `neondb` (it has 0 users), then promote it on the admin connection: `UPDATE stead_users SET role = 'ADMIN' WHERE email = '<owner>';`. The admin area opens only once TOTP is enabled.
2. Run an independent security review of `feat/m5-admin`: auth, grants, the admin guard, the log contents.
3. With the owner's OK, merge `feat/m5-admin` into `main` and deploy to Vercel. Neon already has the migration, and the old code is compatible with the new schema.
4. In production: create a test user, sign in with the temporary password, change it, disable the account, and check both logs.
5. Record the owner's answers to the three open decisions.

## Know before you touch anything
- `credentials/stead-postgres.env` still points to `/test_neondb`. **Any `prisma` command without an override fails, or would target the wrong database.** Ask the owner to update it to `/neondb`. Until then, export `DATABASE_ADMIN_URL` with `/neondb` and check Prisma's "Datasource" line.
- `npm run auth:owner` (create, reset, promote) refuses non-local hosts by design.
- `prisma migrate diff` against `neondb` exits 2, with only the no-op `SET DEFAULT` on `role`. That is expected.
- `.tmp/apply-admin-local.mjs` applies migrations and grants only to `127.0.0.1:55432`.
- Integration tests: `node --env-file=.tmp/stead-m1-test.env --test --test-concurrency=1 <suites>`, with Docker container `stead-m1-pg` running. Run the auth suite with `.tmp/stead-m5-auth-owner.env`.
- `next dev` re-adds a `nextjs-agent-rules` block to AGENTS.md. It is generated and already committed.
- No merge to `main`, deploy, or further Neon write without the owner's explicit OK.
