---
type: handoff
date: 2026-11-20
status: M4a built and verified locally; committed on feat/m4-property, not pushed, no PR; last fix not independently inspected
seq: 8
prev: docs/handoff/2026-11-20-stead-m3-closeout.md
tags: [stead, m4a, property, condominium, codex, claude]
---

## Goal

M4a (properties and condominium) per `docs/plans/2026-11-20-m4-property-condominium.md`: properties with valuation history, ownership share and informational mortgage link; condominium millesimi tables, instalments on the recurring engine, and one-off charges (balancing payments, extraordinary works) that settle into one expense movement; property value in net worth. Bills, subscriptions, rental income, attachments and reminders are later slices.

## Current state

- Branch `feat/m4-property`, stacked on `docs/m4-property-plan` (PR #7, plan only, **open, not merged**). Pre-build base `b67fe8b`. Commits: build `d04ddbc`, inspection fixes `04531d1`, plus the last small fix and this handoff. **Not pushed, no PR for the build.**
- M3 is merged (PR #6, `edd2e6c`); `main` is aligned. Neon already had the three M3-era migrations and matching grants (checked read-only). **`20261124090000_property` is applied to the local test database only.**
- Plan review: Codex round 1 REVISE (3 findings, accepted), round 2 APPROVED, hash-bound.
- Build inspection by Codex (`gpt-6.1-sol`, base `b67fe8b`, Claude built):
  - Round 1 REVISE, 7 findings, all accepted and fixed: charge-linked movement could get an INCOME category (guard now shared with occurrences); CHECK on `building_total_cents` let NULL through when a table was set; next due ignored resolved occurrences; property value hidden on the net worth page and dashboard with zero accounts; archived properties stayed in the default list; collection GET endpoints missing; charges not split pending/settled.
  - Round 2 REVISE, 1 low finding: charge cap violations returned `validation` instead of `value_out_of_range`. Fixed and tested. **That fix has no independent inspection: the budget of 2 inspection rounds was used.**
- Proof on the final tree (Claude): `lint`, `typecheck`, `test` 77/77, cash-flow + investments + property integration 58/58 on `stead_auth_test`, `build`; fresh-database replay of all migrations plus `grant-runtime.sql` plus `prisma migrate diff` exit 0 (before the last service-only fix, which changes no schema); negative controls: removing each protection (account lock mode, charge guards on void/edit/pair/match, INCOME guard, the CHECK) makes the matching test fail. Browser (Orca, synthetic data): property page at 320, 360, 390 and 1280 px, no horizontal scroll, all 8 nav labels fit from 390 px, icons only below; EN and IT.

## Decisions

- Owner: valuation history; ownership share and millesimi are two separate things (millesimi split costs and weigh votes, never enter net worth); mortgage is an informational link to a `DEBT` account; instalments reuse `RecurringTemplate`; one-off charges in their own table; rental income deferred to M4b because `RecurringTemplate` is expense-only.
- A settling movement is protected like an occurrence-linked one (void, edit, pair, candidates) and cannot also match an occurrence; enforced under `lockMovements`, not by a constraint.
- Account row locks use `FOR NO KEY UPDATE` (the M3 deadlock lesson). Advisory lock key 4.
- Payable charge amount is capped at the movement limit (1,000,000,000 cents); the building-wide amount may reach 1e11.
- English short nav label for Accounts is now "Acc." (the 8-item bar made "Accounts" 47 px in a 44 px cell).

## What we tried that did NOT work

- A bash command mixing several heredocs and a Python heredoc failed to parse as a whole; write multi-file edits with the Write tool and a small script instead.
- The Orca `viewport` setting is cleared by each navigation: set it after `goto`. Emulated `innerWidth` reads about 35 px above the requested width.
- Removing a CHECK for a negative control lets the probe insert an invalid row that blocks re-adding the CHECK; delete the synthetic row first.
- My first seed used an 87-character property name; the 80-character limit rejected it (as it should).

## Files touched

- `db/schema.prisma`, `db/migrations/20261124090000_property/`, `db/grant-runtime.sql`.
- `server/property/{calc,service}.ts` (+ tests, `postgres.integration.ts`); `server/cash-flow/{movements,recurring,catalog,text-crypto,validate,dashboard}.ts`; `server/net-worth/{calc,service}.ts`.
- `app/api/property/**`, `app/[locale]/property/page.tsx`, `components/property/*`, `components/{app-shell,dashboard-copy}.ts(x)`, `components/cash-flow/{movements-view,copy}`, `components/net-worth/*`, `app/globals.css`, `package.json`, `README.md`.

## Where we want to go

1. Owner reviews the diff. Optional: one more fresh Codex inspection (base `b67fe8b`) to cover the last fix.
2. Merge PR #7 (plan), then push `feat/m4-property`, open its PR and merge. Needs the owner's OK.
3. Apply `20261124090000_property` to Neon and re-run `db/grant-runtime.sql`, only with the owner's explicit OK.
4. Then M4b: bills, subscriptions and rental income (needs a decision on generalising `RecurringTemplate` to income), encrypted attachments, reminders.

## Before changing anything

- Local DB: container `stead-m1-pg`, port 55432, database `stead_auth_test`: `node --env-file=.tmp/stead-m1-test.env --test --test-concurrency=1 server/cash-flow/postgres.integration.ts server/investments/postgres.integration.ts server/property/postgres.integration.ts`.
- Preview: stop it before `npm run build`; start with `node --env-file=.tmp/stead-m1-test.env node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3100`; seed with `.tmp/seed-m4.ts <token-file>` (synthetic, local DB only); cookie `getstead_session`. The preview is stopped.
- Codex runs: runner at `skills/claudex-loop/scripts/runner.py` in the plugin cache, `py -3`, artifacts in the session scratchpad (outside the repo); inspections used `--host claude --builder claude --provider codex`.
- No push, merge or remote migration without explicit OK.
