---
type: handoff
date: 2026-11-19
status: verified locally
seq: 1
prev: null
tags: [stead, m1, cash-flow, budget, postgres]
---

## Goal

Make Stead usable for day-to-day cash flow and budgeting. The owner can enter movements by hand, reconcile internal transfers, and see monthly spending and recurring expenses in a bilingual dashboard.

## Current state

- Claude Code implemented M1 on `migrate/prisma-postgres`, starting from `4977d94`. This handoff was recorded immediately before the requested local commit.
- Accounts, categories, manual movements, rules, transfers, budgets, refunds, and recurring expenses are available in English and Italian. The dashboard shows the signed-in user's figures.
- `lint`, `typecheck`, `test` (31 passed), `build`, and the PostgreSQL runtime suite (18 passed) passed on 2026-11-19. Browser checks covered login and MFA, manual entry, pagination, refunds, transfers, budget controls, and recurring reconciliation. Mobile checks used 320 px and 390 px iframes.
- The preview at `http://127.0.0.1:3100/it` uses the disposable Docker container `stead-m1-pg` on loopback port 55432 and requires a synthetic account. The owner reported applying the migrations on Neon. The running preview was verified against local PostgreSQL.

## Attempts that failed

- M0 typecheck and build initially failed because the Prisma dependencies and generated client were missing locally. `npm ci` restored both.
- Browser viewport emulation did not resize the preview, so mobile layout was checked in sized iframes.

## Problems and resolutions

- Quick saves could bypass category rules. The form now sends an explicit category only when selected and lets the server apply the rule in automatic mode. Suggestions are tied to the description that produced them.
- Register and match lists could hide older records. Pagination keeps the register filters, and match lists support paging and month selection.
- Editing a linked recurring movement could invalidate the match. The service guards incompatible edits and offers an explicit unlink action. Archiving a recurring template preserves its archived state when unlinking.
- The original transfer constraint accepted a missing leg on a paired movement. An additive migration makes the leg mandatory and checks its sign. The full migration chain passed on a fresh local database.

## Decisions

- M1 uses manual entry. CSV and Excel import were deferred at the owner's request.
- Store money in integer euro cents. Use Europe/Rome calendar months and book refunds against the expense category in the month of the credit.
- Exclude both transfer legs from cash-flow and budget totals. Keep budget history by applying base changes from the current month and one-month overrides to the selected month.
- Confirm, match, or skip recurring occurrences manually. Encrypt movement descriptions at rest and scope every query to the signed-in user.

## Files touched

- `app/[locale]/`, `app/api/cash-flow/`, and `components/` contain the protected pages, REST endpoints, forms, and real dashboard.
- `server/cash-flow/`, `server/auth/`, and `server/locale.ts` hold the financial rules, tests, protected request handling, and locale helpers.
- `db/schema.prisma`, `db/grant-runtime.sql`, and `db/migrations/` add the finance schema, restricted runtime grants, and transfer constraint.
- `README.md` and `package.json` document setup and expose the integration test command.

## Next steps

1. Confirm the M1 commit with `git log -1 --oneline`.
2. If asked to validate Neon end to end, start this version with the configured Neon connection and check the owner's authenticated flow. Confirm the runtime role has the M1 grants during that check.
3. Take up M2 net worth after M1 acceptance. Keep CSV and Excel as a separate follow-up.

## Before changing anything

- `brand-guidelines.md` contains a pre-existing owner edit outside the M1 commit. Preserve it.
- Use `node --env-file=.tmp/stead-m1-test.env --test server/cash-flow/postgres.integration.ts` for the local runtime-role suite. The older `.tmp/stead-auth-test.env` predates PostgreSQL and must be regenerated before using the default `test:postgres` command.
- Keep `AUTH_ENCRYPTION_KEY` stable because it also derives the description encryption key. Keep local credentials and synthetic fixtures out of Git. Any remote migration or deployment requires explicit approval.
