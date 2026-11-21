---
type: handoff
date: 2026-11-21
status: M4b (property costs) committed and pushed (8120b08); final Codex inspection APPROVED M4b; one M1 matcher finding fixed afterwards without re-inspection
seq: 9
prev: docs/handoff/2026-11-20-stead-m4a-property.md
tags: [stead, m4b, property, costs, condominium, codex, claude]
---

## Goal

M4b rescoped by the owner on 2026-11-21: in this phase a property is **a cost only**. Track condominium costs (regular instalments, balancing payments, extraordinary works) and calculate them well. Rental or other income is not a feature: the owner books a normal income movement and names the property in the description. Dropped, not planned: bills, subscriptions, rental-income engine / generalising `RecurringTemplate` to income, encrypted attachments, reminders. Plan: `docs/plans/2026-11-21-m4b-property-costs.md` (Codex plan review: round 1 REVISE 4 findings accepted, round 2 REVISE 1 finding accepted and applied, no round 3 by choice).

## Current state

- Working tree on `main` (base `39f66e6`), all changes uncommitted: `server/property/{calc,service}.ts` (+ tests, integration), `server/cash-flow/dates.ts`, `app/api/property/costs/route.ts` (new), `app/[locale]/property/page.tsx`, `components/property/{property-view.tsx,copy.ts,property.css}`, `README.md`, the plan doc, this handoff. No schema change, no migration, no grant change, so nothing to apply on Neon.
- What it does: `getCosts(userId, {year, propertyId?}, now)` and `GET /api/property/costs?year=&propertyId=`; page shows a "Condominium costs" card (all properties, year arrows limited to 2000-2100) and a block per property. Figures: paidOrdinary / paidExtraordinary / paidBalancing / paidTotal (real movement amounts by booking date, currently linked settlements only), pendingCharges, overdueOrdinary, forecastOrdinary, expectedTotal. Definitions are in the README ("Property costs (M4b)").
- Behaviour changes outside the new feature: `deleteSchedule` now refuses with 409 `schedule_has_payments` once any instalment has a movement (archive the template instead), under the recurring-template row lock; `server/cash-flow/dates.ts` has one `MAX_OCCURRENCES = 10_000` default for listing, next date, `isOccurrence` and costs (was 5,000; weekly schedules over 100 years need about 5,200).
- Proof (Claude, on the final tree): `lint`, `typecheck`, `test` 85/85, cash-flow + investments + property integration 63/63 on `stead_auth_test`, `build`. Negative controls: no `userId` filter in `getCosts` fails the isolation test; no template lock in `deleteSchedule` fails both the controlled race and the ordered real-writer race; READ COMMITTED instead of RepeatableRead fails the snapshot stress test 3 of 3. Browser (Orca, synthetic seed): costs card at 320, 360, 390, 1280 px, EN and IT, no horizontal scroll, totals equal the hand-computed ones, an invalid `?year=` falls back to the current year.
- Inspection by Codex (base `39f66e6`, Claude built): round 1 REVISE, 3 findings fixed (snapshot read, one recurrence horizon, year-arrow bounds); round 2 REVISE, 1 medium finding, test coverage only (races with the real confirm and match writers). I added `queuedPair` and "unlink versus the real confirm and match writers" after the budget of 2 rounds was used, so **that test addition has no independent inspection**.
- Not covered by any inspection: the M4a `value_out_of_range` fix for charge caps (still pending from the previous handoff).

## Final inspection (after the first push)

- M4b alone (base `39f66e6`): APPROVED, no findings (it also covered the unlink race tests). M4a plus M4b (base `b67fe8b`, which includes the M4a cap fix): one medium finding, no problem with the cap fix. The recurring matcher accepted an outflow in an INCOME category as an instalment payment, so costs counted it as paid while cash-flow reports counted negative income. Fixed: `resolveOccurrence` match rejects it (409 `sign_mismatch`, "Choose an expense, not an income."), and `nearestCandidates` with `outflowOnly` (used only by recurring) no longer offers such movements; regression asserts in the cash-flow integration test, negative controls fail. This fix has no independent inspection.

## Decisions

- Costs are what the owner pays: millesimi and ownership share are never applied. Balancing credits stay normal movements.
- Period is a calendar year (Europe/Rome today). Unresolved instalments before today are overdue and stay in the expected total; from today to 31 December they are forecast; a past year has nothing forecast.
- Paid history is attributed through `CondoSchedule`, so unlinking is refused once payments exist instead of adding a schema column.
- Skipped on purpose (add when asked): cost per sqm (no area field), cost versus property value, monthly series.

## What we tried that did NOT work

- Negative control "confirm takes no lock" cannot fail the unlink-first race test: the occurrence insert takes a foreign-key KEY SHARE lock on the template row, which already conflicts with unlink's FOR UPDATE. The explicit lock in `resolveOccurrence` is redundant for that race; the unlink-side lock is the one the tests prove.
- `orca cookie set` fails with "Invalid cookie fields" on 127.0.0.1; set `getstead_session` with `orca eval` and `document.cookie` instead.
- A bash command combining a quoted heredoc with several quote styles failed to parse; use the Write tool for a Python script (as noted in the M4a handoff).

## Where we want to go

1. Owner decision: commit M4b (suggested message: `feat: M4b property costs`) and push, or review first.
2. Optional: a fresh Codex inspection of the final tree (base `39f66e6`, plus base `b67fe8b` to cover the M4a cap fix).
3. Then the next slice is the owner's call; the old M4b items above are dropped unless reopened.

## Before changing anything

- Docker Desktop must be running; container `stead-m1-pg` (port 55432, database `stead_auth_test`) was started this session and is running: `node --env-file=.tmp/stead-m1-test.env --test --test-concurrency=1 server/cash-flow/postgres.integration.ts server/investments/postgres.integration.ts server/property/postgres.integration.ts`.
- Preview: stop it before `npm run build`; start with `node --env-file=.tmp/stead-m1-test.env node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3100`; seed with `node --env-file=.tmp/stead-m1-test.env .tmp/seed-m4.ts <token-file>` (synthetic, local DB only). The preview is stopped.
- Codex runs: runner at `skills/claudex-loop/scripts/runner.py` in the plugin cache, `py -3`, artifacts in the session scratchpad; inspections used `--host claude --builder claude`.
- No commit, push, merge or remote migration without explicit OK.
