# M4b rescoped: property costs only

## Context

M4a (properties, condominium instalments, one-off charges) is merged. The owner has narrowed M4b:
- **Property is a cost only** in this phase. Costs are condominium costs: ordinary instalments and extraordinary charges (plus balancing payments, already modelled as `CondoCharge` kind BALANCING).
- **Goal: calculate property costs well.** Today nothing sums them: `server/property/calc.ts` has no cost aggregate, the property page shows rows only, and `getOverview` ignores the amount actually paid.
- **Rental income is not a feature.** If the owner wants to track it, they book a normal INCOME movement and name the property in the description. No schema, no recurring-income engine.

Dropped from the old M4b (record in the plan doc): bills, subscriptions, rental income engine, `RecurringTemplate` income generalisation, encrypted attachments, reminders. Not built unless the owner reopens them.

No schema change is needed: with the unlink guard below, everything is derivable from `RecurringOccurrence`, `CondoCharge` and `Movement`. So no migration, no Neon step, no grant change.

## Cost definitions (to freeze in the plan doc, Codex reviews these)

All amounts are integer cents, bigint sums, `toSafeCents` back to number. Period = calendar year, default current year.
- **Paid ordinary** = `-movement.amount` of occurrences with status CONFIRMED or MATCHED and a `movementId`, by the movement's booking date. SKIPPED never counts. The real movement amount is used, not the template amount.
- **Paid extraordinary / balancing** = `-movement.amount` of settled, non-voided charges (`movementId` set), by the movement's booking date, split by `kind`.
- **Pending charges** = non-voided, unsettled charges, by `dueDate` in the period (charge `amountCents`).
- **Instalments not yet resolved** are all occurrences of non-archived schedules with no CONFIRMED, MATCHED or SKIPPED row, enumerated from the schedule rule with `occurrencesThrough(rule, Dec 31)` (one shared horizon, `MAX_OCCURRENCES = 10_000` in `server/cash-flow/dates.ts`, now also the default for listing, next-date lookup and `isOccurrence` validation, because a weekly schedule over the supported 100 years needs about 5,200 and costs must never count a date that cannot be resolved) and filtered to the selected year. They are priced at `template.amountCents`, split by today (Europe/Rome):
  - `overdueOrdinary`: due date earlier than today (any selected year; for a past year this is every unresolved instalment of that year). Included in `expectedTotal`, so an unpaid instalment never disappears when its date passes.
  - `forecastOrdinary`: due date in `[max(today, Jan 1), Dec 31]` of the selected year; an empty interval gives 0. A future year gives the whole year, a past year gives 0. No rolling 12-month alternative.
- **Historical attribution policy.** A paid ordinary cost is attributed to a property through `CondoSchedule`, which `deleteSchedule` physically removes. Therefore `deleteSchedule` is refused (`schedule_has_payments`, status 409) when the schedule has any CONFIRMED or MATCHED occurrence with a movement; the owner archives the template instead. Schedules without payments stay deletable. **Concurrency:** `deleteSchedule` must take the same user-scoped recurring-template row lock that `resolveOccurrence` takes (`server/cash-flow/recurring.ts`), before checking for payments, and keep it until the delete commits (lock order stays account, property, charge or template, movement). A controlled regression test runs unlink against confirm and match and asserts that a payment committed first prevents the unlink, and that a confirmation arriving after the unlink waits for it and then books against the already-unlinked template (it stays a normal recurring expense; the template survives `deleteSchedule`). Paid figures describe **currently linked settlements**: reopening a charge or an occurrence unlinks the movement (it stays booked as a normal movement) and the amount moves out of "paid" (back to pending/overdue for a charge or occurrence). This is documented in the README and tested (unlink refused, reopen, resettle).
- Amounts are what the owner pays. Millesimi and `ownershipBps` are not applied (as in M4a). Balancing credits stay normal movements (M4a decision).
- Output per property and a grand total: `paidOrdinary`, `paidExtraordinary`, `paidBalancing`, `paidTotal`, `pendingCharges`, `overdueOrdinary`, `forecastOrdinary`, `expectedTotal = paidTotal + pendingCharges + overdueOrdinary + forecastOrdinary`. Label as an estimate in the UI.
- Skipped on purpose: cost per sqm (no area field), cost vs property value, monthly series. Add when asked.

## Tasks

**T0. Codex plan review (before any code).** Run `claudex-loop` in review mode on this plan (host claude, provider codex), max 2 rounds, hash-bound as for M4a. Ask Codex specifically to challenge the cost definitions (date basis, matched-movement amounts, voided/reopened charges, forecast edges). Accept or reject each finding in writing, then freeze the plan.

**T1. Pure cost math** (`server/property/calc.ts`, test `calc.test.ts`). Functions that take plain rows (`{kind, cents, date}`) and return the totals above; forecast function over schedule rows using `dates.ts`. Cases: year boundary, skipped, matched with amount different from the template, schedule with `endDate`, empty period, past/current/future selected year, an unpaid instalment becoming overdue (regression), a weekly schedule started in 2000 still forecasting 2100, overflow raises `value_out_of_range`.

**T2. Service** (`server/property/service.ts`: `getCosts(userId, {propertyId?, year})`). Query occurrences joined to movements and charges, **every query scoped by `userId`**, no logging of amounts. Does not take new locks (read only) and reads everything in one RepeatableRead transaction, so a concurrent confirm or reopen can never make an instalment count as neither paid nor overdue, or as both (proved by a stress test that fails under READ COMMITTED). Integration tests in `server/property/postgres.integration.ts`, modelled on the test at line 280: confirmed vs matched vs skipped, charge settled then reopened (moves back to pending), voided charge excluded, another user's data never counted, archived schedule gives no forecast or overdue, `deleteSchedule` refused once a payment exists and allowed before (plus the unlink-versus-confirm/match concurrency test), reopen and resettle move amounts between paid and pending/overdue.

Also in T2: the `deleteSchedule` guard in `server/property/service.ts:208` (new error code `schedule_has_payments` in the API error map and in `components/property/copy.ts` EN/IT; the Unlink button explains "archive it instead").

**T3. API** `GET /api/property/costs?year=&propertyId=` in `app/api/property/costs/route.ts`, same auth and error pattern as the other `app/api/property/**` handlers (including `value_out_of_range`). Route test only if the existing handlers have one.

**T4. UI** in `components/property/`: a "Costs" block on `PropertyCard` (`property-view.tsx`) with a year selector (links only inside 2000-2100) and the figures above, plus a small total across properties at the top of the page. Strings in `components/property/copy.ts` (EN and IT, the `Record<Locale, typeof en>` type forces both). Estimate label on the forecast. Short hint text: "Rental or other income: record it as a normal income movement and mention the property in the description." Check in the browser (Orca, synthetic data) at 320, 360, 390, 1280 px, EN and IT, no horizontal scroll.

**T5. Docs.** New plan doc `docs/plans/2026-11-21-m4b-property-costs.md` (this plan, frozen) stating the dropped items; README section "Property and condominium" gets the cost definitions. No new directive (needs owner OK).

**T6. Verification and inspection.** `npm run lint`, `typecheck`, `test`, `build`, and the three integration suites on `stead_auth_test` (needs Docker Desktop started; the daemon is down now). One negative control: remove the `userId` filter in `getCosts` and see the isolation test fail. Then a Codex build inspection (also covering the unreviewed M4a `value_out_of_range` fix, base `b67fe8b`), fix findings, handoff file, commit. No push without the owner's OK.

## Order and dependencies

T0 → T1 → T2 → T3 → T4 → T5 → T6. T1 and T5's plan doc can be drafted in parallel with T0's review, but code starts only after T0 is done.

## Critical files

`server/property/calc.ts`, `server/property/service.ts`, `server/property/postgres.integration.ts`, `server/cash-flow/dates.ts` (reuse), `app/api/property/costs/route.ts` (new), `components/property/property-view.tsx`, `components/property/copy.ts`.

## Verification (end to end)

Seed synthetic data: one property, one monthly instalment (confirm two, skip one, match one with a different amount), one extraordinary charge settled, one pending, one voided. Hand-compute expected totals first, assert them in the integration test, then confirm the same numbers on the page in the browser and in the API response. Repeat for a second user and check nothing leaks.
