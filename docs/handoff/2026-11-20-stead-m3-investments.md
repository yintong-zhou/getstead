---
type: handoff
date: 2026-11-20
status: built and verified locally; committed on the branch, not pushed; last fixes not independently inspected
seq: 6
prev: docs/handoff/2026-11-20-stead-profile.md
tags: [stead, m3, investments, codex, claude]
---

## Goal

Ship M3 investments (PROJECT.md): buys, sells, dividends and coupons; weighted average cost; manual prices; allocation; indicative capital gains and tax (26%, or 12.5% for Italian government bonds); net worth that includes holdings. The app tracks, it never recommends.

## Current state

- Branch `feat/m3-investments` in the main checkout `D:\DEVS\getstead`, based on `docs/m3-investments-plan` (`9ec221f`, the approved plan). One commit holds the whole build. **Not pushed, no PR.** `main` already contains the M2 fixes (PR #3) and the profile/logo/rename work (PR #4).
- The plan is `docs/plans/2026-11-20-m3-investments.md`. Owner confirmed all six decisions. Codex approved it at round 4 (11 findings, all accepted). Plan edits made after the build (deduction CHECKs, ordinal on move, holdings row, label-in-name, DTOs, 2e15 bound) were **not** reviewed by Codex.
- Built by Codex (`claudex-loop:codex-build`, plan approval). The Codex workspace ran out of credits after ~16 minutes, so Claude finished the build and made all later fixes. Authorship is therefore mixed.
- Done:
  - Migrations `20261123090000_investments` and `20261123100000_investment_deductions` (CHECKs: income tax ≤ amount, SELL fees + tax ≤ amount), `db/schema.prisma`, `db/grant-runtime.sql`.
  - `server/investments/{calc,service}.ts`: exact Decimal clone (precision 60), bigint cents with one checked `toSafeCents`, weighted average cost, replay order `(tradeDate, ordinal, id)`, account then instrument row locks, quotas (1,000 instruments, 10,000 transactions), indicative tax.
  - Derived brokerage cash feeds both `netWorthAt` and `monthlySeries`; `getNetWorth` returns `holdingsCents`; the Net worth page shows an "Investments (market value)" row.
  - `updateAccount` refuses a type change away from BROKERAGE/CRYPTO with history (409).
  - API `app/api/investments/**`, page `/[locale]/investments` (EN/IT), 7-column mobile nav (icons only below 360 px).
- Proof (Claude, final tree): `lint`, `typecheck`, `test` 67/67, `build`; cash-flow + investments integration 44/44 on `stead_auth_test`; fresh-database replay of all migrations + `grant-runtime.sql` + `prisma migrate diff` = no difference. Browser (Orca, synthetic data): 320, 360, 390 and 1280 px, no horizontal scroll, nav labels fit at 360 px, average cost shows `€ 100,33333333`.
- Inspections: Opus 5.5 round 1 REVISE (6 findings, all fixed); round 2 REVISE (3 findings: UI always sent `ordinal`, vacuous raw-SQL CHECK test, plan bound 1e15 vs 2e15; all fixed). **The inspection budget (2) is used up: the round 2 fixes and the plan edits have no independent review.**

## What we tried that did NOT work

- **Writing artifacts inside the checkout.** The runner refuses `--artifacts` inside the repo. Use the session scratchpad.
- **Reviewing in the old worktree and resuming in main.** `--resume` needs the same repo path, so the round had to be restarted on `D:\DEVS\getstead`.
- **Killing the runner with `Stop-Process` by command-line match.** It also killed unrelated `bash.exe` helpers. Kill by port or exact PID.
- **Codex as builder to the end.** "Your workspace is out of credits" mid-run. Do not retry Codex without asking about credits.
- **`server/investments/migration.integration.ts` in this environment.** It needs `CREATE DATABASE`, which the owner role lacks (`42501`). Replay by hand: create the database as `postgres` in the container, run `.tmp/replay.mjs`, drop it.
- **The first raw-SQL deduction test.** It "passed" only because the primary key had no default; a negative assertion without a positive control proves nothing.

## Problems and resolutions

- Average cost displayed with ~60 digits: the exact value stays in API/calc; `formatDecimal` in `components/investments/numbers.ts` rounds half-up to 8 places for display only.
- Short nav labels broke WCAG 2.5.3 (visible text not in the accessible name): EN/IT `nav.overview` is "Home", EN short "Recur."; `components/dashboard-copy.test.ts` enforces it.
- Moved transactions kept their ordinal: the service assigns the next one unless sent; the form now sends `ordinal` only when changed (`ordinalPatch`).
- Instrument and quote write responses leaked `userId`: DTOs added.
- Preview must be stopped before `npm run build` (the build rewrites `.next`).

## Decisions

- **Cash is derived, not linked movements.** BUY `−(amount + fees)`, SELL `+(amount − fees − tax)`, DIVIDEND/COUPON `+(amount − tax)`, same cutoff as movements. Rejected: linked movements, which risk double entry. Consequence: investment trades and dividends do not appear in the cash flow register, budget or monthly income/expense in v1 (stated in the UI and README).
- Unit price is EUR per unit; value = round-half-up(quantity × price × 100). Weighted average cost, EUR only, manual prices (fallback to cost, flagged "no price").
- Tax class: only `IT_GOV_BOND` is 12.5%; foreign government bonds use `BOND` (26%). Estimates follow the current `kind`.
- Mobile nav: 7 columns, labels from 360 px, icons only below with `aria-label`.
- Out of scope: CSV/Excel broker import, automatic prices, corporate actions, FX, FIFO/tax lots, loss carry-forward.

## Files touched

- `db/migrations/20261123090000_investments/`, `db/migrations/20261123100000_investment_deductions/`, `db/schema.prisma`, `db/grant-runtime.sql`: schema, CHECKs and runtime grants.
- `server/investments/{calc,service}.ts` and their tests (`calc.test.ts`, `postgres.integration.ts`, `migration.integration.ts`): domain logic.
- `server/net-worth/{calc,service}.ts`, `server/net-worth/calc.test.ts`: derived cash, holdings in totals and series, `holdingsCents`.
- `server/cash-flow/{catalog,validate}.ts`: account-type guard, validation helpers.
- `app/api/investments/**`, `app/[locale]/investments/page.tsx`, `components/investments/*`: API, page, forms, copy, CSS, number helpers.
- `components/app-shell.tsx`, `components/dashboard-copy.ts` (+ test), `app/globals.css`: 7-item nav.
- `components/net-worth/{net-worth-view.tsx,copy.ts}`: holdings row and cash-check warning for brokerage/crypto accounts.
- `package.json` (`test:postgres` includes the investments suite), `README.md`, `docs/plans/2026-11-20-m3-investments.md`.

## Where we want to go

1. Owner reviews the diff. Optional: one more fresh Opus inspection of the final tree (`inspect --host codex --builder codex --model claude-opus-5-5`, base = the plan commit `9ec221f`) to cover the round 2 fixes. When Codex credits are back, a Codex inspection of the Claude edits restores cross-provider coverage.
2. With the owner's OK: push `feat/m3-investments`, open the PR (after or on top of `docs/m3-investments-plan`), merge.
3. With the owner's explicit OK: apply to Neon `20261122090000_profile`, `20261123090000_investments` and `20261123100000_investment_deductions`, then run `db/grant-runtime.sql` again.
4. Then: CSV/Excel import (needs a real broker export), a vector logo, R1 (register read in separate snapshots), a `Select` component test.

## Before changing anything

- Local DB: container `stead-m1-pg`, port 55432, database `stead_auth_test` (Docker Desktop must be on). Suite: `node --env-file=.tmp/stead-m1-test.env --test --test-concurrency=1 server/cash-flow/postgres.integration.ts server/investments/postgres.integration.ts`.
- Fresh-chain check: `docker exec stead-m1-pg psql -U postgres -c "CREATE DATABASE stead_m3_chain_manual OWNER stead_auth_owner"`, then `node --env-file=.tmp/stead-m1-test.env .tmp/replay.mjs`, then drop the database.
- Preview: `npm run build`, then `node --env-file=.tmp/stead-m1-test.env node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3100`. Seed with `node --env-file=.tmp/stead-m1-test.env .tmp/seed-m3.ts <token-file>` (synthetic, local DB only) and set the cookie `getstead_session=<token>`. The preview is stopped. `.tmp/` is ignored.
- Claude CLI: `--model claude-opus-5-5`; Python: `py -3`. Run artifacts go outside the repo.
- No push, merge or remote migration without explicit OK.
