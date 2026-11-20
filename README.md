<p align="center"><img src="public/brand/getstead-mark.png" width="96" alt="getstead mark: a glass drop with two eyes"></p>

# getstead

getstead is a personal finance workspace. It has a private sign-in with two-step verification and, from milestone M1, manual cash flow and budget: accounts, categories, movements, transfers, category rules, monthly budgets and recurring expenses. The overview shows the signed-in user's own month. English is the default language, with Italian available from the header. CSV and Excel import is not part of M1.

## Run locally

Use Node.js 22.18 or later on the 22.x line, or Node.js 24 or later, and a local PostgreSQL server.

As a local PostgreSQL administrator, create two login roles with different passwords and a database owned by the migration role.

```sql
CREATE ROLE stead_auth_owner LOGIN;
CREATE ROLE stead_auth_app LOGIN;
CREATE DATABASE stead OWNER stead_auth_owner;
```

Set each role's password interactively with `\password stead_auth_owner` and `\password stead_auth_app` in `psql`.

Copy `.env.example` to the ignored `.env.local`, fill in the runtime URL, and set `AUTH_ENCRYPTION_KEY` to 32 random bytes encoded in base64. Generate the key with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"` and keep it stable. Percent-encode special characters in URL credentials.

In the ignored `credentials/stead-postgres.env` file, set `DATABASE_ADMIN_URL=postgresql://stead_auth_owner:YOUR_OWNER_PASSWORD@127.0.0.1:5432/stead`.

```sh
npm ci
npm run db:migrate
```

Connect to the `stead` database in `psql` as `stead_auth_owner` and run `\i db/grant-runtime.sql` to grant the app role its permissions. Run it again after every migration: it covers authentication and the cash flow tables (no `DELETE` on accounts, categories, movements or templates, and `UPDATE` only on the columns the services change). The runtime uses `DATABASE_URL`. Prisma Migrate and owner commands use `DATABASE_ADMIN_URL` for administrative access. Keep the administrative URL in the migration or provisioning environment when deploying the app.

```sh
npm run auth:owner -- create
npm run dev
```

Enter the getstead email and password in the interactive owner command. On the first sign-in, add the setup key to a time-based authenticator and enter its six-digit code. If you lose the authenticator, run `npm run auth:owner -- reset` locally. This replaces the getstead password, revokes sessions, and resets the authenticator enrollment.

Open [getstead in English](http://127.0.0.1:3000/en) or [getstead in Italian](http://127.0.0.1:3000/it). Use the same loopback hostname as `APP_ORIGIN`.

## Verify

```sh
npm run lint
npm run typecheck
npm run test
npm run build
```

For integration tests, create a separate local database named `stead_auth_test`. Set `DATABASE_ADMIN_URL` to its owner connection URL for the `npm run db:migrate` command. Put the same URL in `DATABASE_URL` and a separate `AUTH_ENCRYPTION_KEY` in `.tmp/stead-auth-test.env`. Run `npm run test:postgres` to exercise the auth flow and the cash flow services with two synthetic users.

The cash flow suite creates its users through `DATABASE_ADMIN_URL` and runs the services through `DATABASE_URL`. Point `DATABASE_URL` at the least-privilege runtime role (after `db/grant-runtime.sql`) and the suite also checks the grants; the authentication suite needs a role that can create users, so run it with the owner URL.

### Disposable local PostgreSQL with Docker

```sh
docker run -d --name stead-test-pg -e POSTGRES_PASSWORD=admin_pw -p 127.0.0.1:55432:5432 postgres:17-alpine
docker exec -i stead-test-pg psql -U postgres -c "CREATE ROLE stead_auth_owner LOGIN PASSWORD 'owner_pw'" -c "CREATE ROLE stead_auth_app LOGIN PASSWORD 'app_pw'" -c "CREATE DATABASE stead_auth_test OWNER stead_auth_owner"
```

Write `.tmp/stead-auth-test.env` with `DATABASE_ADMIN_URL=postgresql://stead_auth_owner:owner_pw@127.0.0.1:55432/stead_auth_test`, the runtime URL `DATABASE_URL=postgresql://stead_auth_app:app_pw@127.0.0.1:55432/stead_auth_test`, `APP_ORIGIN=http://127.0.0.1:3100` and a fresh `AUTH_ENCRYPTION_KEY`. Then:

```sh
node --env-file=.tmp/stead-auth-test.env node_modules/prisma/build/index.js migrate deploy
docker exec -i stead-test-pg psql -U stead_auth_owner -d stead_auth_test < db/grant-runtime.sql
node --env-file=.tmp/stead-auth-test.env --test server/cash-flow/postgres.integration.ts
```

To try the app against it, run `npm run build` and `node --env-file=.tmp/stead-auth-test.env node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3100`. Remove the database with `docker rm -f stead-test-pg`.

## Naming

The product and package are called **getstead** (interface, page titles, cookies `getstead_session` and `getstead_login_challenge`, package name, brand files). Some internal identifiers keep the original `stead` prefix on purpose, because changing them would need a data migration or would make stored data unreadable: the PostgreSQL tables, enums and roles (`stead_*`), the key-derivation and rate-limit context strings in `server/auth/crypto.ts` and `server/cash-flow/text-crypto.ts` (they protect encrypted text already in the database), and local development names such as `credentials/stead-postgres.env`, `.tmp/stead-auth-test.env` and the test database `stead_auth_test`. Renaming the cookies signs everyone out once.

## Profile

The person icon opens a menu with profile settings, language and sign-out. Open `/en/profile` or `/it/profile` to set an optional display name, change email or password, or switch language. Login still uses email, password and 2FA; email and password changes require the current password. A password change revokes other sessions and pending login challenges, keeping the requesting session. The authenticated API exposes `GET` and `PATCH /api/profile`, `POST /api/profile/email` and `POST /api/profile/password`. After applying the profile migration, rerun `db/grant-runtime.sql`: its three new runtime-role column grants allow updating only `email`, `password_hash` and `display_name`, alongside the existing MFA grants.

## Net worth (M2)

Open `/en/net-worth` or `/it/net-worth` to see assets, liabilities, net worth, the change since the previous month end, and a 12-month trend. Balances use signed integer EUR cents: amounts owed are negative, assets sum positive account balances, and liabilities show the magnitude of negative balances. Card and debt accounts default to an owed balance in the form; you can change that for credit balances.

A balance check records an account's **end-of-day** balance. For a date D, getstead uses the latest check on or before D and adds non-voided movements strictly after the check date through D. Movements on the check date are already included. With no check, movements accumulate from zero. Transfer legs count toward account balances. A check for the same account and date replaces its balance; editing movements, replacing checks, or deleting checks recomputes history. No frozen snapshots are stored.

The trend uses each month end for the last 12 months and today for the current month, following Europe/Rome. Archived accounts remain included; record a zero check when closing one. An archived account with a remaining balance is flagged. Investment valuation, property values, and CSV import are outside M2.

The authenticated API is `/api/net-worth` (GET totals and history), `/api/net-worth/balances` (GET the most recent 100 checks, ordered by date then ID descending; POST a check, returning 201 on creation or 200 on replacement with the same check body), and `/api/net-worth/balances/:id` (DELETE). Mutations require the same-origin `Origin` header. After applying the M2 migration, run `db/grant-runtime.sql` again: the runtime role can read, insert, delete, and update only `balance_cents` on checks. The cash flow PostgreSQL integration suite also verifies M2 runtime grants, cross-user rejection, and historical recalculation.

## Cash flow and budget (M1)

Pages live under `/en` and `/it`: overview, `cash-flow` (Income and Expenses columns, new movement, separate Transfers group), `budget`, `recurring` and `accounts` (accounts, categories, rules). Each register group has its own 50-row server-filtered page (`pageIn`, `pageOut`, `pageTransfers`); month and filter changes reset all pages. Column totals remain the full month's totals, independent of account/category filters, and voided rows remain visible but do not count. Refunds reduce Expenses. The JSON API is under `/api/cash-flow/` (accounts, categories, movements, transfers, rules, budget, recurring, summary); every call needs the signed-in session, mutations need a same-origin `Origin` header, and responses are never cached. The movements endpoint accepts optional `direction=in|out|transfers` alongside its existing filters and `page`. Amounts are integer euro cents, movement dates are calendar dates, and "today" and calendar months follow Europe/Rome. Movement and recurring descriptions are stored as AES-256-GCM ciphertext, with a key derived from `AUTH_ENCRYPTION_KEY`: keep that key stable, because rotating it makes stored descriptions unreadable.
