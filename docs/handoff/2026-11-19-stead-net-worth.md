---
type: handoff
date: 2026-11-19
status: ready for review
seq: 2
prev: docs/handoff/2026-11-19-stead-cash-flow.md
tags: [stead, m2, net-worth, postgres, codex]
---

## Goal

Ship M2 net worth: assets minus liabilities, a monthly snapshot and a trend chart (PROJECT.md). It is the next milestone after M1 cash flow, and the owner needs it to see their whole financial position in one place.

## Current state

- M2 is implemented on branch `feat/m2-net-worth` in the worktree `D:\DEVS\getstead-m2`, based on `0d4e178` (M1). The spec is `docs/plans/2026-11-19-m2-net-worth.md`.
- Codex built it through `claudex-loop:codex-build` with an unreviewed spec. Claude then reviewed the diff and removed one redundant index.
- Accounts get dated balance checks. The service computes current net worth, assets and liabilities, per-account balances, a 12-month series and the change since the previous month end. The work also adds a REST API under `/api/net-worth`, an EN/IT page at `/[locale]/net-worth`, a navigation entry and a dashboard card.
- Proof, rerun by Claude on 2026-11-19:
  - `lint`, `typecheck` and `build` passed, and `test` passed 36 of 36.
  - The full migration chain applied cleanly to a fresh database, then `grant-runtime.sql` ran, and `prisma migrate diff` reported no difference.
  - `server/cash-flow/postgres.integration.ts` passed all 21 tests, including the 3 new M2 tests.
- An independent inspection by a fresh Claude Opus 5.5 instance, with read-only access, returned APPROVED with 5 low-severity findings (see "Next steps").
- Not verified: the 320 px mobile layout and the visual appearance of the chart.

## Attempts that failed

- **Inspector on the default CLI model.** The Claude CLI defaults to Fable 5.2, which requires paid usage credits, so the run failed with 429 `credits_required`. Rerunning with `--model claude-opus-5-5` worked. Do not spend credits without asking.
- **Integration suite on a database with a different name.** The test guard requires the database name `stead_auth_test` (error: "Use the dedicated synthetic-test database"). The fix was to rename databases instead of changing the env file.
- **Codex attempts.** Codex could not replay the migrations on a fresh database (Docker and privileges were blocked in its sandbox) and could not open Orca's browser. Claude ran the fresh replay instead.

## Problems and resolutions

- **Auth integration test fails.** `server/auth/postgres.integration.ts` fails with `permission denied for table stead_users` because `createOwner` runs as the runtime role, which deliberately lacks INSERT on users. This predates M2: the old database has the same grant. Run only the cash-flow suite with `.tmp/stead-m1-test.env`, as the M1 handoff already said.
- **Redundant index.** `@@unique([userId, accountId, asOf])` and `@@index` on the same columns were duplicates. The `@@index` and its `CREATE INDEX` statement were removed.

## Decisions

- **Balance checks instead of stored snapshots.** A balance check is the account's balance at the end of a day. Month ends are derived from checks plus movements, so editing an old movement corrects history. Rejected: a frozen monthly snapshot table, because it drifts when old data is edited.
- **Balance rule.** The balance on date D is the latest check on or before D, plus the non-voided movements dated after the check and up to D. With no check, it starts from 0. Movements dated on the check day are already included in the check. Transfer legs count.
- **Assets and liabilities by sign, not by account type.** Positive balances are assets and negative balances are liabilities, so debts and cards are entered as negative values. Rejected: classifying by type, because an overdrawn checking account would be misclassified.
- **Archived accounts are included.** The UI flags an archived account whose balance is not zero, and suggests recording a check of 0 when an account is closed.
- **Chart.** The trend is inline SVG with no new dependencies. `call()` takes an optional `base` instead of duplicating the client.

## Files touched

- `db/schema.prisma`, `db/migrations/20261121090000_net_worth/migration.sql`: the `BalanceCheck` model (`stead_balance_checks`), with a foreign key on (user_id, account_id) and a check constraint of ±1e9 cents.
- `db/grant-runtime.sql`: SELECT, INSERT, UPDATE(balance_cents) and DELETE on the new table.
- `server/net-worth/calc.ts` and `calc.test.ts`: pure functions `balanceAt`, `netWorthAt` and `monthlySeries`.
- `server/net-worth/service.ts`: `listChecks`, `recordCheck` (upsert, date not after today in Rome, foreign key error mapped to 409), `deleteCheck` and `getNetWorth`.
- `server/cash-flow/validate.ts`: `Reader.signedCents`, which accepts zero.
- `server/cash-flow/dashboard.ts`, `components/dashboard.tsx`, `components/dashboard-copy.ts`: the net worth card.
- `app/api/net-worth/**`, `app/[locale]/net-worth/page.tsx`: the API and the page.
- `components/net-worth/*`: the view, the EN/IT copy and the CSS.
- `components/app-shell.tsx`, `components/cash-flow/{api.ts,copy.ts,cash-flow.css}`, `app/globals.css`: the navigation entry and the `call()` base.
- `server/cash-flow/postgres.integration.ts`: 3 M2 tests (user isolation, constraints, recomputing history).
- `README.md`: the net worth section.
- `docs/plans/2026-11-19-m2-net-worth.md`: the spec.

## Next steps

1. Check the 320 px and 390 px layout of the page and of the 6-item navigation in the browser.
2. Fix NW-1 (medium in practice). A check dated today makes movements for today that are added later invisible. Default the date to yesterday, or show a warning when the date is today.
3. Fix NW-3. Hide the net worth card on the dashboard when there are no accounts.
4. Fix NW-2, NW-4 and NW-5 if needed:
   - NW-2: compute the 12 months per account in a single pass instead of filtering the full lists for each account and date.
   - NW-4: return 200 instead of 201 when the upsert replaces an existing check.
   - NW-5: limit the checks list to the most recent N.
5. Merge `feat/m2-net-worth` once the owner accepts it. Applying the migration and `grant-runtime.sql` on Neon requires explicit approval.
6. Then start M3 investments. CSV and Excel import remains a separate follow-up.

## Before changing anything

- The main checkout `D:\DEVS\getstead` is still on `migrate/prisma-postgres` with the owner's uncommitted edit to `brand-guidelines.md`. Do not touch it. M2 lives in the worktree.
- Local databases in container `stead-m1-pg`, port 55432:
  - `stead_auth_test` is now the fresh database with M2 applied.
  - The previous database was renamed `stead_auth_test_prev`, not deleted. It holds the old M2 index, which Codex had applied.
  - The preview on 3100 pointed to the old name: restart it if needed.
- Run the integration suite with `node --env-file=.tmp/stead-m1-test.env --test --test-concurrency=1 server/cash-flow/postgres.integration.ts`.
- For claudex inspections, use `py -3` (`python` is not on PATH) and pass `--model claude-opus-5-5`.
