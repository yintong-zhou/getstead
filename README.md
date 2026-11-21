<p align="center">
  <img src="public/brand/getstead-mark.png" width="96" alt="getstead mark">
</p>

<h1 align="center">getstead</h1>

<p align="center">
  A private workspace for your money, investments and property.
</p>

<p align="center">
  <a href="#what-you-can-track">Features</a> ?
  <a href="#run-locally">Getting started</a> ?
  <a href="#verify">Testing</a> ?
  <a href="#how-it-works">Architecture</a> ?
  <a href="#license">License</a>
</p>

getstead brings cash flow, budgets, net worth, investments and condominium costs together in one browser app. It is designed for personal use, with data scoped to the signed-in user. The interface is available in English and Italian.

## What you can track

| Area | Available today |
| --- | --- |
| **Cash flow and budget** | Accounts, categories, movements, transfers, categorisation rules, monthly budgets and recurring expenses. |
| **Net worth** | Account balance checks, assets and liabilities, and a 12-month trend. Investment holdings and property valuations contribute to the total. |
| **Investments** | Instruments, trades, dividends, coupons, manual prices, holdings, allocation and indicative tax estimates. |
| **Property** | Property valuations, ownership shares, condominium tables, instalments, one-off charges and annual costs. |
| **Account** | Private sign-in with optional two-step verification, profile settings and language selection. |

Tax figures are indicative estimates, not tax statements. Investment prices and property values are entered manually. CSV and Excel import, automatic bank connections and investment advice are not currently available.

## How it works

getstead is a full-stack Next.js application built with TypeScript, React and Tailwind CSS. PostgreSQL and Prisma handle persistence; application logic and data access live in `server/`, while `app/` contains pages and API route handlers. Financial amounts use integer cents or decimal arithmetic.

| Directory | Purpose |
| --- | --- |
| `app/` | Pages and REST API route handlers |
| `components/` | Interface components |
| `server/` | Business logic and data access |
| `db/` | Prisma schema, migrations and runtime grants |
| `public/` | Static assets |
| `docs/` | Project plans and handoffs |

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

Enter the getstead email and password in the interactive owner command. Sign in with your email and password. To enable two-step verification, open Profile and settings, re-enter your password, add the setup key to a time-based authenticator, and enter its six-digit code. If you lose the authenticator, run `npm run auth:owner -- reset` locally. This replaces the getstead password, revokes sessions, and resets the authenticator enrollment.

To make an account an admin, run `npm run auth:owner -- promote` and enter its email. The admin area (Profile menu → Admin, or `/en/admin`) opens only once the account has two-step verification enabled. From there you can create users, reset passwords, disable or enable accounts, and read the error and security log.

Open [getstead in English](http://127.0.0.1:3000/en) or [getstead in Italian](http://127.0.0.1:3000/it) for the public home page; the signed-in app starts at `/en/overview`. Use the same loopback hostname as `APP_ORIGIN`.

The home page is prerendered, so `APP_ORIGIN` must be the public origin at build time: canonical links, the sitemap, `robots.txt` and the share image read it. The waitlist (`POST /api/waitlist`) stores one row per email in `stead_waitlist`; the app role can only insert, so read the list on the owner connection. Set `PRIVACY_CONTACT_EMAIL` so the privacy notice shows a contact address before the waitlist goes live.

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

The person icon opens a menu with profile settings, language and sign-out. Open `/en/profile` or `/it/profile` to set an optional display name, change email or password, or switch language. Two-step verification is off by default. Enable it with your current password and an authenticator code, or disable it with your current password and a fresh code. Both changes sign out your other sessions. Email and password changes require the current password. A password change revokes other sessions and pending login challenges, keeping the requesting session. The authenticated API exposes `GET` and `PATCH /api/profile`, `POST /api/profile/email` `POST /api/profile/password` and `POST /api/profile/totp`. After applying the profile migration, rerun `db/grant-runtime.sql`: its three new runtime-role column grants allow updating only `email`, `password_hash` and `display_name`, alongside the existing MFA grants.

## Net worth (M2)

Open `/en/net-worth` or `/it/net-worth` to see assets, liabilities, net worth, the change since the previous month end, and a 12-month trend. Balances use signed integer EUR cents: amounts owed are negative, assets sum positive account balances, and liabilities show the magnitude of negative balances. Card and debt accounts default to an owed balance in the form; you can change that for credit balances.

A balance check records an account's **end-of-day** balance. For a date D, getstead uses the latest check on or before D and adds non-voided movements strictly after the check date through D. Movements on the check date are already included. With no check, movements accumulate from zero. Transfer legs count toward account balances. A check for the same account and date replaces its balance; editing movements, replacing checks, or deleting checks recomputes history. No frozen snapshots are stored.

The trend uses each month end for the last 12 months and today for the current month, following Europe/Rome. Archived accounts remain included; record a zero check when closing one. An archived account with a remaining balance is flagged. Investment valuation, property values, and CSV import are outside M2.

The authenticated API is `/api/net-worth` (GET totals and history), `/api/net-worth/balances` (GET the most recent 100 checks, ordered by date then ID descending; POST a check, returning 201 on creation or 200 on replacement with the same check body), and `/api/net-worth/balances/:id` (DELETE). Mutations require the same-origin `Origin` header. After applying the M2 migration, run `db/grant-runtime.sql` again: the runtime role can read, insert, delete, and update only `balance_cents` on checks. The cash flow PostgreSQL integration suite also verifies M2 runtime grants, cross-user rejection, and historical recalculation.

## Cash flow and budget (M1)

Pages live under `/en` and `/it`: overview, `cash-flow` (Income and Expenses columns, new movement, separate Transfers group), `budget`, `recurring` and `accounts` (accounts, categories, rules). Each register group has its own 50-row server-filtered page (`pageIn`, `pageOut`, `pageTransfers`); month and filter changes reset all pages. Column totals remain the full month's totals, independent of account/category filters, and voided rows remain visible but do not count. Refunds reduce Expenses. The JSON API is under `/api/cash-flow/` (accounts, categories, movements, transfers, rules, budget, recurring, summary); every call needs the signed-in session, mutations need a same-origin `Origin` header, and responses are never cached. The movements endpoint accepts optional `direction=in|out|transfers` alongside its existing filters and `page`. Amounts are integer euro cents, movement dates are calendar dates, and "today" and calendar months follow Europe/Rome. Movement and recurring descriptions are stored as AES-256-GCM ciphertext, with a key derived from `AUTH_ENCRYPTION_KEY`: keep that key stable, because rotating it makes stored descriptions unreadable.

## Investments (M3)

Open `/en/investments` or `/it/investments` to manage instruments, buys, sells, dividends, coupons and dated manual prices. Holdings show exact fractional quantities, weighted average cost, market value, unrealised gain and allocation by instrument kind, alongside a 12-month market-value history. All amounts are EUR: enter the actual EUR amount paid or received for foreign-currency instruments. getstead tracks investments; it never recommends trades.

Quantities are decimal strings with up to 10 decimal places (`Decimal(28,10)`); unit prices are positive EUR-per-unit decimal strings with up to 8 (`Decimal(18,8)`). Calculations use a separate 60-digit decimal context with half-up rounding. Transaction amounts, fees and withholding use integer cents, each at most 100,000,000,000 cents; dividends and coupons have no fees and buys have no withholding. A buy adds gross amount plus fees to cost basis. A sell removes the rounded proportional weighted-average basis; realised gain is gross proceeds minus fees minus removed basis, before withholding. Trade amount is the actual gross amount, independently entered from the manual valuation price. A dated valuation uses the latest quote on or before that date; without a quote it falls back to remaining cost and is marked **no price**. Manual quotes replace the price for the same instrument and date and can be removed.

Execution order is `(tradeDate, ordinal, id)` per instrument across accounts. New rows receive the next ordinal on that date, including voided rows in its allocation; edit the ordinal to change same-day execution order. Changes, voids, restores and instrument reassignments replay both affected histories and reject any negative position or historical holding value over 1,000,000,000,000 cents. Instruments and accounts can be archived; historical holdings remain included. Unarchive or reassign to active parents before editing/restoring an archived association. Investment transaction history is voided, never deleted. Each user can have at most 1,000 instruments (archived included) and 10,000 transactions (voided included).

For **brokerage and crypto accounts**, a balance check means **cash only at the end of its day**. Investment transactions strictly after the latest check date through the valuation date derive cash effects: BUY −(gross + fees), SELL +(gross − fees − withholding), DIVIDEND/COUPON +(gross − withholding). Check-day transactions are already included in that check. Net worth adds holdings to those cash balances: a €600 buy after a €1,000 cash check gives €400 cash + €600 holdings = €1,000. Voiding removes the cash effect and position effect. Deposits into the broker remain normal transfer movements. **Do not also enter a cash-flow movement for the same investment transaction.** No linked movements are created; investment trades, dividends and coupons are excluded from the cash-flow register, budgets and monthly cash-flow income/expense in v1. Income is shown separately on Investments.

Tax cards are an **indicative estimate, not a tax statement**. Realised gains and losses net within each calendar year and tax class; positive net gains are estimated at 26%, or 12.5% only for `IT_GOV_BOND` (Italian government bonds). Foreign government bonds use `BOND` at 26%. Losses are displayed, never carried forward. Changing an instrument's current kind recalculates all historical estimates. Withholding is recorded separately from this estimate.

All investment APIs use the existing authenticated, same-origin, no-store wrapper: `GET/POST /api/investments/instruments`, `PATCH /api/investments/instruments/:id`, `GET/POST /api/investments/transactions`, `PATCH /api/investments/transactions/:id` (including `{ "voided": true/false }`), `GET/POST /api/investments/quotes`, `DELETE /api/investments/quotes/:id`, and `GET /api/investments/portfolio`. Decimal JSON inputs must be strings, cents must be safe integer numbers. Invalid values return 422 (`value_out_of_range` for decimal/range limits, `negative_position` for overselling). Incompatible account type changes return 409 `investment_account`, even when their transaction history is voided. Unknown fields are rejected.

M3 writes take a per-user transaction advisory lock to serialize quota checks, then lock account rows in ID order, then affected instrument rows in ID order; account-type edits take the same account lock. Net worth and portfolio reads use RepeatableRead snapshots. Exact accumulation uses bigint or the isolated Decimal context; the checked `toSafeCents()` converter rejects overflow before numeric display. Because gross amounts and fees each have their own cap, accumulated cash/cost magnitudes can reach 2e15 cents, rather than the plan's 1e15 estimate; holdings are bounded by 1e15 and all numeric boundaries remain checked.

The migration `20261123090000_investments` follows profile. Apply only to a local database unless separately approved, then rerun `db/grant-runtime.sql` for the three new tables. The runtime role cannot delete instruments/transactions or update identity/ownership columns. No dependency was added. CSV/Excel broker imports, automatic prices, corporate actions, FX, tax lots and loss carry-forward remain out of scope.

Additional synthetic local proof (URLs must point to the dedicated local test database):

```sh
node --env-file=.tmp/stead-m1-test.env --test --test-concurrency=1 server/cash-flow/postgres.integration.ts server/investments/postgres.integration.ts
node --env-file=.tmp/stead-m1-test.env node_modules/prisma/build/index.js migrate diff --from-config-datasource --to-schema db/schema.prisma --exit-code
node --env-file=.tmp/stead-m1-test.env --test server/investments/migration.integration.ts
```

The fresh-chain test creates and drops only its uniquely named, empty `stead_m3_chain_*` local database and requires `CREATEDB`; it fails explicitly if the test owner lacks that privilege. The regular investment integration suite uses the runtime role for services and the owner only to provision synthetic fixtures.

## Property and condominium (M4a)

Open `/en/property` or `/it/property` to track properties and their condominium. A property has an estimated value over time (one valuation per date; the latest on or before today counts, with none it counts as zero and is flagged), your ownership share (basis points, for example 50% for half) and an optional informational link to a `DEBT` account as its mortgage. The loan already counts as a liability in net worth, so linking it changes no total; the card only shows equity (your value share minus the mortgage balance). A property sold on a date stops counting from that date. All values are your own estimates, not appraisals.

Condominium: millesimi tables (for example General, Lift) hold your thousandths out of the building total; they split building-wide amounts and show your voting weight, and they never enter net worth. Regular instalments are ordinary expense recurrences linked to the property: confirm each one in Recurring, which books the movement exactly once. Balancing payments and approved extraordinary works are one-off charges with a due date; settling one books one expense movement, and a settling movement cannot be voided, turned into income, moved or paired until the charge is reopened (and it cannot also settle a recurring occurrence). A charge's payable amount stops at the movement limit of 10,000,000.00 EUR; the building-wide amount may be larger. Rental income, bills, subscriptions, attachments and reminders are not part of this slice.

### Property costs (M4b)

In this phase a property is a cost: only condominium costs are tracked, regular instalments and one-off charges (balancing payments, extraordinary works). The property page and `GET /api/property/costs?year=YYYY[&propertyId=…]` show, per property and in total, for one calendar year (default: the current year in Europe/Rome):

- **Paid**: the real movement amounts of confirmed or matched instalments and of settled charges, by the movement's booking date, split into regular, extraordinary and balancing. Skipped instalments and voided charges never count. Paid means *currently linked settlement*: reopening a charge or an instalment unlinks its movement (which stays booked as a normal movement) and the amount moves back to pending or overdue.
- **Pending charges**: unsettled, non-voided charges due in the year.
- **Overdue** and **still to come**: instalments of active schedules that Recurring has not resolved, at the schedule amount. Due before today they are overdue (never dropped from the total); from today to 31 December they are still to come. A past year has nothing to come, a future year is all to come.
- **Expected total** = paid + pending charges + overdue + still to come. An estimate, not an accounting statement. Millesimi and ownership share are not applied: amounts are what you pay.

Unlinking an instalment schedule (`DELETE /api/property/schedules/:id`) is refused with 409 `schedule_has_payments` once it has a payment, because the link is what attributes paid costs to the property; archive the recurring expense instead. The check runs under the recurring template row lock, the same lock confirm and match take. Rental or other income is not modelled: record it as a normal income movement and name the property in the description. Bills, subscriptions, a rental-income engine, attachments and reminders are not planned for now (see `docs/plans/2026-11-21-m4b-property-costs.md`). No schema change and no migration.

APIs (same authenticated, same-origin, no-store wrapper): `GET /api/property`, `GET /api/property/costs`, `POST /api/property/properties`, `PATCH /api/property/properties/:id`, `POST /api/property/valuations`, `PATCH|DELETE /api/property/valuations/:id`, `POST /api/property/tables`, `PATCH|DELETE /api/property/tables/:id`, `POST /api/property/schedules`, `DELETE /api/property/schedules/:id`, `POST /api/property/charges`, `PATCH /api/property/charges/:id` (fields, `{ "voided": true }`, `{ "action": "settle", "accountId": "…" }` or `{ "action": "reopen" }`).

M4a writes take a per-user advisory lock (key 4), then lock the account row with `FOR NO KEY UPDATE` (never `FOR UPDATE`, which deadlocks with transfers), then property, charge and movement rows. The migration `20261124090000_property` follows investments. Apply only to a local database unless separately approved, then rerun `db/grant-runtime.sql` for the five new tables. The runtime role cannot delete properties or charges. No dependency was added. `test:postgres` includes `server/property/postgres.integration.ts`.

## License

Proprietary and confidential. See [LICENSE](LICENSE) for the full notice.
