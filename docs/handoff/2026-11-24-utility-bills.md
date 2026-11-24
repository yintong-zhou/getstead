---
type: handoff
date: 2026-11-24
status: ready for review
seq: 1
prev: none
tags: [property, utility-bills, backup, postgres]
---

## Objective

Add property utility bills and encrypted property addresses so users can track due and paid household costs, link existing cash-flow payments, and preserve the records in backups.

## Current state

Implemented and verified with Claude Code on local branch `yintong-zhou/utility-bills-verify`, worktree `C:/Users/zhouy/orca/workspaces/getstead/utility-bills-verify`, HEAD `d1cf703`. The branch is not pushed; before this handoff its worktree was clean. Base is `77dfb75` (merged integration work). Commits: `ae6e696` feature, `8a7d8fc` runtime INSERT grant fix, `d1cf703` owner-connection test fix.

Bills have yearly property and aggregate summaries, Rome-date overdue status, per-bill providers, encrypted editable addresses, authenticated APIs, exact-amount payment linking under locks, and backup v2 with v1 restore support. Sold and archived properties retain history. Migrations were applied only to the local synthetic test database.

Final checks on `d1cf703`: lint and typecheck pass; unit tests 163/163; local PostgreSQL tests 110/110; build passes with local test environment loaded. Claude exercised synthetic user flows in Italian and English at desktop and 390px mobile, including payment linking, unlinking, editing and backup-related paths. The build was independently repeated with `node --env-file=.tmp/stead-auth-test.env -e "const p=require('node:child_process').spawnSync('npm.cmd',['run','build'],{stdio:'inherit',shell:true});process.exit(p.status ?? 1)"`.

## What did not work

- Running the PostgreSQL suite under the runtime role originally gave three failures: Prisma inserts `exclude_cash`, but its INSERT grant was missing. Once fixed, the existing TOTP test exposed a separate owner-only reset operation performed with runtime credentials.
- Do not grant the runtime role DELETE on `stead_auth_limits` to make that test pass. The test now uses a dedicated owner connection for reset and asserts that runtime access is denied without partial changes.
- A bare build without the local environment failed because `APP_ORIGIN` is required by `app/robots.ts`; this predates the feature. Load an appropriate local environment before building.
- Building a `git archive` export with `node_modules` junctioned outside its root failed because of Turbopack restrictions. Use the real feature worktree.

## Problems and resolutions

- Another activity switched the original Claude worktree to `fix/visual-bug` and committed `e32d636` during implementation. The utility changes were isolated in transfer commit `ae6e696` based on `77dfb75`, then verified in a separate worktree. Do not overwrite or clean the original worktree: it contains uncommitted utility changes and belongs to the other activity.
- Added an `exclude_cash` INSERT grant migration and updated `db/grant-runtime.sql`; no runtime role privilege to change user roles was added. The auth integration test separates owner and runtime connections.
- A local Oracle test credential was printed in a Claude agent transcript. Rotate it; do not copy its value into notes, logs, or chat.

## Decisions

- Use the existing year selector for bill history and aggregate figures, based on due date; instead of separate selectors, this keeps the property views consistent.
- Reuse the recurring movement picker and recheck eligibility under movement locks; do not create a new cash-flow payment or allow a linked total change.
- Preserve `fix/visual-bug` and its worktree; use the separate verified branch rather than switch or reset the shared worktree.
- Keep migrations local until explicit authorization for any non-local database. No deploy or push was performed.

## Files touched

- `db/schema.prisma`, `db/migrations/20261203090000_utility_bills/migration.sql`, `db/grant-runtime.sql`: encrypted address, utility bill schema, constraints and runtime grants.
- `db/migrations/20261204090000_users_exclude_cash_insert/migration.sql`: fixes existing user INSERT privilege.
- `server/property/bills.ts`, `server/property/calc.ts`, `server/property/service.ts`: validation, summaries, property addresses, payment linking and locking.
- `server/cash-flow/movements.ts`, `server/cash-flow/recurring.ts`, `server/cash-flow/text-crypto.ts`: payment eligibility, cash-flow guards and encryption purpose.
- `app/api/property/bills/` and `app/[locale]/property/page.tsx`: authenticated bill routes and page data.
- `components/property/`, `components/cash-flow/movement-picker.tsx`, `components/cash-flow/recurring-view.tsx`, `components/cash-flow/copy.ts`, `components/format.ts`, `components/profile/copy.ts`: UI, shared picker and EN/IT copy.
- `server/backup/tables.ts`, `server/backup/import.ts`, `server/backup/backup.test.ts`, `server/backup/postgres.integration.ts`: v2 backup, v1 compatibility and linked-bill round-trip tests.
- `server/property/bills.test.ts`, `server/property/bills.integration.ts`, `package.json`: unit and PostgreSQL bill coverage and test registration.
- `server/auth/owner.ts`, `server/auth/postgres.integration.ts`, `server/admin/postgres.integration.ts`: owner test connection and privilege regression coverage.

## Where to go next

Review the committed feature branch and agree the desired integration or publication step with the owner; no merge or deployment was requested. Rotate the exposed local test credential. If changes are made after this handoff, rerun the applicable checks, including the full required gates before declaring completion.

## Before touching anything

- Follow the project AGENTS.md: ask before adding dependencies, pushing to main, deploying, applying non-local migrations, deleting user data, or creating/rewriting directives. Source and technical documentation are English.
- Current original workspace `D:/DEVS/getstead` is on `integration/ui-info-backup` at `8f49601`, with untracked `.claude/` and `.mcp.json`; preserve them.
- Original Claude worktree `C:/Users/zhouy/orca/workspaces/getstead/utility-bills` is on `fix/visual-bug` with uncommitted utility-bill changes. The feature branch is in the separate `utility-bills-verify` worktree.
- `refs/transfer/utility-bills` points to the earlier feature-only commit; the final branch also contains the grant and test fixes. Do not integrate only the transfer ref.
- `npm run test:postgres` uses `.tmp/stead-auth-test.env`, including a local owner connection for its owner-only test. Never print this file. A pre-existing `pg` adapter deprecation warning may appear while tests pass.
- Detailed local reports: `C:/Users/zhouy/orca/workspaces/getstead/utility-bills/.tmp/transfer/REPORT.md` and `C:/Users/zhouy/orca/workspaces/getstead/utility-bills-verify/.tmp/verify/REPORT.md`; these are ignored scratch files, not durable versioned artifacts.
