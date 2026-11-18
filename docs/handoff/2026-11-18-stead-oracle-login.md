---
type: handoff
date: 2026-11-18
status: in corso
seq: 1
prev: null
tags: [stead, m0, oracle, authentication]
---

## Obiettivo

Build Stead, a private personal finance workspace for cash flow, budgets, net worth, investments, and home expenses. M0 establishes the bilingual dashboard and protects access before real financial data is added.

## A che punto siamo

- Local Oracle XE 21c is reachable at `127.0.0.1:1521/XEPDB1`. The migration and runtime grants are applied. The Italian login returned HTTP 200 at `http://127.0.0.1:3000/it/login`.
- Claude Code built the English and Italian login and MFA screens and reviewed the integration. Browser verification covered first-time TOTP enrollment, a subsequent login, logout, direct dashboard protection, and layout at 320 px. The dashboard uses synthetic data.
- The browser fixture was removed. The development schema currently has zero Stead account rows and zero TOTP enrollments. The owner setup prompt is no longer running. The user chose to configure SQL Developer manually. Its GUI connection remains unverified.
- On 2026-11-18, lint, typecheck, five unit tests, two Oracle integration tests, and the build passed. The dashboard and auth changes are uncommitted on `main`, which still points to `887b682`.

## Cosa abbiamo provato che NON ha funzionato

- Starting a second Next.js process on port 3001 with the test schema environment was rejected by the command runner. The working approach was Oracle integration tests in the dedicated test schema plus a temporary synthetic account for browser checks against the running app on port 3000.

## Problemi incontrati e come li abbiamo risolti

- Oracle returned `ORA-00972` during schema provisioning because a generated database password exceeded the Oracle XE 21c limit of 30 bytes. Shorter random passwords allowed the additive migration to complete.
- Oracle returned `ORA-01745` on logout because `:session` is a reserved bind name. The query now binds `:digest`.
- The logout button made the Italian dashboard overflow at 320 px. The compact header now places the demo label on a separate row. The browser checks passed at 320, 375, and 390 px.

## Decisioni prese

- Use local Oracle XE with the thin `oracledb` driver and separate owner, runtime, and test credentials. The earlier PostgreSQL option was dropped when the user chose Oracle.
- Use a privately provisioned account, email and password, TOTP, and opaque server-side sessions. WebAuthn was deferred after the user chose an authenticator app. Public registration, email recovery, and deployment are outside this milestone.
- Use the repository's English-first locale layout and the brand guidelines. Keep the dashboard synthetic until the data feature milestones.

## File toccati

- `app/[locale]/`, `components/auth/`, `components/dashboard.tsx`, `app/globals.css` — branded dashboard and localizable login, MFA, logout, and page access.
- `components/dashboard-copy.ts`, `components/icon.tsx`, `app/icon.svg`, `public/fonts/` — localized dashboard copy, icons, and the bundled Plus Jakarta Sans font with its license.
- `app/api/auth/`, `server/auth/` — login handlers, Oracle pool and auth service, owner CLI, password and TOTP storage, and auth tests.
- `db/migrations/001-auth.sql`, `db/grant-local-auth.sql` — auth tables, indexes, and runtime grants.
- `server/demo-dashboard.ts`, `server/demo-dashboard.test.ts` — synthetic ledger and integer-cent calculations.
- `package.json`, `package-lock.json`, `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`, `.gitignore`, `README.md` — app foundations, dependency lock, verification commands, and local setup instructions.

## Dove vogliamo andare

1. Confirm whether the user successfully configured SQL Developer. Use a Basic connection for `stead_auth_owner`, role Default, host `127.0.0.1`, port `1521`, and **Service name** `XEPDB1`. The portable app is extracted at `%LOCALAPPDATA%/Programs/Oracle/SQLDeveloper-26.2/sqldeveloper/sqldeveloper.exe`.
2. Have the user run `npm run auth:owner -- create` in an interactive local terminal and choose their email and password privately. Then complete TOTP enrollment at `http://127.0.0.1:3000/it/login` and confirm the first personal sign-in.
3. Once the local M0 flow is accepted, continue with M1 cash flow and budget when the user requests it.

## Da sapere prima di toccare qualcosa

- Use `127.0.0.1` in the browser to match `APP_ORIGIN`. Runtime DB configuration is in ignored `.env.local`. The SQL Developer password is the value of `ORACLE_ADMIN_PASSWORD` in ignored `credentials/stead-auth-owner.env`. Keep credential values out of chat and logs.
- `stead_auth_app` serves the app with restricted grants. `stead_auth_owner` owns the tables and provisions the personal account. `stead_auth_test` is the isolated synthetic test schema. Run the latter suite with `npm run test:oracle`.
- The initial SQL migration has already run in both the owner and test schemas. Check existing objects before applying additional DDL. Pushing to `main`, deploying, and migrating a non-local database require user approval under `AGENTS.md`.
