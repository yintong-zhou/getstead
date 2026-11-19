# Stead

Stead is a personal finance workspace. The first milestone includes a private sign-in and a responsive dashboard using synthetic data. English is the default language, with Italian available from the header.

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

Connect to the `stead` database in `psql` as `stead_auth_owner` and run `\i db/grant-runtime.sql` to grant the app role its authentication permissions. The runtime uses `DATABASE_URL`. Prisma Migrate and owner commands use `DATABASE_ADMIN_URL` for administrative access. Keep the administrative URL in the migration or provisioning environment when deploying the app.

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

For integration tests, create a separate local database named `stead_auth_test`. Set `DATABASE_ADMIN_URL` to its owner connection URL for the `npm run db:migrate` command. Put the same URL in `DATABASE_URL` and a separate `AUTH_ENCRYPTION_KEY` in `.tmp/stead-auth-test.env`. Run `npm run test:postgres` to exercise the auth flow with synthetic accounts.
