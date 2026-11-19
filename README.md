# Stead

Stead is a personal finance workspace. It has a private sign-in with two-step verification and, from milestone M1, manual cash flow and budget: accounts, categories, movements, transfers, category rules, monthly budgets and recurring expenses. The overview shows the signed-in user's own month. English is the default language, with Italian available from the header. CSV and Excel import is not part of M1.

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

Enter the Stead email and password in the interactive owner command. On the first sign-in, add the setup key to a time-based authenticator and enter its six-digit code. If you lose the authenticator, run `npm run auth:owner -- reset` locally. This replaces the Stead password, revokes sessions, and resets the authenticator enrollment.

Open [Stead in English](http://127.0.0.1:3000/en) or [Stead in Italian](http://127.0.0.1:3000/it). Use the same loopback hostname as `APP_ORIGIN`.

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

## Cash flow and budget (M1)

Pages live under `/en` and `/it`: overview, `cash-flow` (register, new movement, transfers), `budget`, `recurring` and `accounts` (accounts, categories, rules). The JSON API is under `/api/cash-flow/` (accounts, categories, movements, transfers, rules, budget, recurring, summary); every call needs the signed-in session, mutations need a same-origin `Origin` header, and responses are never cached. Amounts are integer euro cents, movement dates are calendar dates, and "today" and calendar months follow Europe/Rome. Movement and recurring descriptions are stored as AES-256-GCM ciphertext, with a key derived from `AUTH_ENCRYPTION_KEY`: keep that key stable, because rotating it makes stored descriptions unreadable.
