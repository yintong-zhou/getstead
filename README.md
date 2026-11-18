# Stead

Stead is a personal finance workspace. The first milestone includes a private sign-in and a responsive dashboard using synthetic data. English is the default language, with Italian available from the header.

## Run locally

Use Node.js 22.18 or later on the 22.x line, or Node.js 24 or later.

```sh
npm ci
npm run dev
```

Open [Stead in English](http://127.0.0.1:3000/en) or [Stead in Italian](http://127.0.0.1:3000/it). Use the same loopback hostname as `APP_ORIGIN`.

## Local Oracle setup

In the local Oracle XE `XEPDB1` PDB, provision `stead_auth_owner` with `CREATE SESSION`, `CREATE TABLE`, and a quota on the development tablespace. Provision `stead_auth_app` with `CREATE SESSION`. Database login passwords in Oracle XE 21c can be at most 30 bytes.

Apply `db/migrations/001-auth.sql` once to the empty owner schema through SQL*Plus. Then run `db/grant-local-auth.sql` as the provisioning administrator in the same PDB. Both steps are additive. If a statement fails, inspect the new schema before retrying. Oracle commits DDL statements individually.

Set the following in the ignored `.env.local` file.

| Variable | Local value |
| --- | --- |
| `APP_ORIGIN` | `http://127.0.0.1:3000` |
| `ORACLE_CONNECT_STRING` | `127.0.0.1:1521/XEPDB1` |
| `ORACLE_USER` | `stead_auth_app` |
| `ORACLE_PASSWORD` | Password of the runtime database account |
| `AUTH_ENCRYPTION_KEY` | 32 random bytes encoded in base64. Keep it stable across restarts. |

Run `npm run auth:owner -- create` in an interactive terminal. Enter the schema owner's Oracle password when prompted, then choose the Stead email and password. The command can also read `ORACLE_ADMIN_USER` and `ORACLE_ADMIN_PASSWORD` from the ignored `credentials/stead-auth-owner.env` file. Keep schema-owner credentials out of `.env.local`.

On the first sign-in, add the setup key manually to a time-based authenticator and enter its six-digit code. If you lose the authenticator, run `npm run auth:owner -- reset` locally. This replaces the Stead password, revokes sessions, and resets the authenticator enrollment.

## Verify

```sh
npm run lint
npm run typecheck
npm run test
npm run build
```

For integration tests, apply the same migration in a separate local schema named `stead_auth_test`, with the same owner privileges. Set its `ORACLE_USER`, `ORACLE_PASSWORD`, `ORACLE_CONNECT_STRING`, and a separate `AUTH_ENCRYPTION_KEY` in `.tmp/stead-auth-test.env`. Run `npm run test:oracle` to exercise the auth flow against that schema with synthetic accounts.
