---
type: handoff
date: 2026-11-20
status: M3 inspected by Codex (APPROVED), fix committed and pushed, PR #6 open and not merged, Neon already up to date; M4a scope decided, not planned yet
seq: 7
prev: docs/handoff/2026-11-20-stead-m3-investments.md
tags: [stead, m3, m4, codex, claude]
---

## Goal

Close M3 (investments), then plan and build M4a (properties and condominium) with Codex as independent reviewer and inspector. Claude plans and builds.

## Current state

- Branch `feat/m3-investments`, fix commit `843b0a7` (`server/investments/service.ts`, `server/investments/postgres.integration.ts`), on top of `847799b`.
- Codex inspection (`gpt-6.1-sol`, high, read-only, base `9ec221f`):
  - Round 1: REVISE, one medium finding M3-001. Account locks used `FOR UPDATE`, which conflicts with the `KEY SHARE` that movement inserts take through the foreign key. A transfer inserting its legs B then A could deadlock with an investment quote update locking A then B (500, no retry). The transfer path takes no advisory lock, so the claim holds.
  - Fix: `lockAccounts` now uses `FOR NO KEY UPDATE`. It still excludes `updateAccount` (`catalog.ts`, `FOR UPDATE`) and other investment writers. Regression test "investment account locks do not wait for in-flight movement inserts": an open transaction inserts a movement into the second account, and `recordQuote` must finish within 3 s. Positive control: with `FOR UPDATE` it blocks and fails (3.2 s); with the fix it passes (0.25 s).
  - Round 2 (fresh session, tree including the fix): **APPROVED**, no findings. Limitation stated by Codex: static review only, it ran no tests.
- Proof on the final tree (Claude): `lint`, `typecheck`, `test` 67/67, cash-flow + investments integration 45/45 on `stead_auth_test`, `build`. Run before the commit; the commit changes only those two files and this handoff.
- Pushed (`843b0a7`) and PR #6 opened against `main` (owner OK). **Not merged.**
- Neon (`test_neondb`, eu-central-1), checked read-only with the owner's OK: `_prisma_migrations` already lists `20261122090000_profile`, `20261123090000_investments` and `20261123100000_investment_deductions` as finished, and the runtime role's table and column grants match `db/grant-runtime.sql` exactly. Nothing was applied or re-run; no write was needed. The earlier notes saying these were pending are out of date.

## Decisions

- M4a scope (owner): properties and condominium only. Bills, subscriptions, encrypted attachments and cron/email reminders are later slices.
- Order (owner): close M3 first, plan M4a from the merged `main`.
- Roles (owner): Codex reviews the plan (max 5 rounds) and inspects the final diff in fresh sessions; Claude builds. Codex did not build because its credits ran out mid-build in M3.
- Starting sketch for the M4a plan, open for the owner interview: property with valuation history (pattern of `PriceQuote`), `propertyValueCents` in net worth next to `holdingsCents`, mortgage as an informational link to a `DEBT` account (no double count), condominium instalments on `RecurringTemplate`/`RecurringOccurrence`, advisory lock key 4.

## What we tried that did NOT work

- `claudex-loop` runner path: it is `skills/claudex-loop/scripts/runner.py` under the plugin cache, not `scripts/runner.py`.
- `py -3` works; `python` and `python3` do not on this machine. Print results with `PYTHONIOENCODING=utf-8` (the result files contain non-cp1252 characters).
- First version of the lock test inserted a movement with a fake description: the CHECK `stead_movements_description_check` needs a real envelope (`encryptText` + `movementContext`).

## Before changing anything

- Commit the fix only on the owner's OK, then push, PR (base `main`, includes plan commit `9ec221f`), merge. Codex approval covers the working tree with the fix; a later edit needs a new inspection.
- Local DB: container `stead-m1-pg`, port 55432, database `stead_auth_test`.
  `node --env-file=.tmp/stead-m1-test.env --test --test-concurrency=1 server/cash-flow/postgres.integration.ts server/investments/postgres.integration.ts`
- Run artifacts go outside the repo (session scratchpad). Round 1 and 2 artifacts are in `scratchpad/m3-inspect-1` and `m3-inspect-2`.
- Next after the merge: branch `docs/m4-property-plan` from `main`, interview on the open M4a decisions, `docs/plans/<date>-m4-property-condominium.md`, Codex plan review.
