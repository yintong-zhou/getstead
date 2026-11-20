---
type: handoff
date: 2026-11-20
status: built by Codex, fixed by Claude, inspected (APPROVED x2); uncommitted in the worktree, not pushed
seq: 4
prev: docs/handoff/2026-11-20-stead-ui-glass.md
tags: [stead, m2, nav, net-worth, codex]
---

## Goal

Close the debt before M3: NAV-1 (mobile navigation labels truncated) and the M2 findings NW-1…NW-5. Then prepare the M3 investments spec (spec only, not built).

## Current state

- Work lives in the **worktree `D:\DEVS\getstead-m2fix`**, branch `fix/m2-debt-nav1`, base `d602cbf` (main). **Nothing is committed or pushed.** The M3 draft spec is `docs/plans/2026-11-20-m3-investments.md`, waiting for the owner.
- Codex built NAV-1 and NW-1…NW-5 through `claudex-loop:codex-build` (`--unreviewed-spec`). Claude then edited four files (see Problems) and re-ran the proof.
- Done:
  - **NAV-1:** separate `nav` labels in `components/dashboard-copy.ts`, used by `components/app-shell.tsx` (headings unchanged). EN keeps the natural labels. IT: Home, Patrimonio, Flussi, Budget, Ricorrenti, Conti. Measured in the browser at 320 and 390 px, EN and IT: no truncation (the nav item is 48 px wide; the old "Panoramica" 52 px and "Flussi di cassa" 61 px overflowed).
  - **NW-1:** the balance-check date defaults to yesterday; an inline `role="note"` warning (linked by `aria-describedby`) appears only when the date is today. Checked in the browser.
  - **NW-2:** `monthlySeries` groups by account once and advances cursors; a unit test compares it with the `netWorthAt` reference.
  - **NW-3:** the dashboard net worth card shows only when the user has any account, archived ones included (`showNetWorth`).
  - **NW-4:** POST `/api/net-worth/balances` returns 201 on creation and 200 on replacement. `recordCheck` returns `{ check, created }`; `api()` passes a returned `NextResponse` through with `no-store`.
  - **NW-5:** `listChecks` returns the latest 100 (`RECENT_CHECK_LIMIT`), newest first.
- Proof, run by Claude on the final tree: `lint`, `typecheck`, `test` 37/37, `build`, and `server/cash-flow/postgres.integration.ts` 24/24. Live HTTP check on the production build: 201 then 200, `cache-control: no-store`.
- Inspections of the final snapshot: Opus 5.5 (Claude CLI) **APPROVED**, Codex (read-only) **APPROVED**. The only finding left is that Codex's `.tmp/m2-debt-report.md` is stale (NAV-1 rule, NW-4 mechanism, NW-5 heading). It is gitignored and advisory.
- Not verified: the Prisma upsert on the compound key compiling to a native `INSERT … ON CONFLICT` under real concurrency (the 4-way concurrent integration test passes, which is consistent with it); screen-reader output of the new warning.

## Problems and resolutions

- **Codex over-shortened the labels** to 8 characters ("Worth", "Flow", "Repeat" in EN). Claude measured the real widths and restored the natural wording where it fits; the work order was revised to match.
- **Race in `recordCheck`.** Codex's `createMany` + `update` transaction gave a spurious 404 if a delete committed in between (found by both inspectors, round 1). Replaced with one atomic `upsert` with a pre-generated UUID; `created = row.id === id`.
- **Warning wording** ("will not be counted separately") hid the consequence: now it says later movements dated today will not change the balance.
- **Hardcoded "100" in the UI heading.** Removed; the limit stays in the server constant and the README.
- **The route imported `NextResponse` from `next/server`** while `http.ts` uses `next/server.js` (the `instanceof` check depends on one class). Aligned to `next/server.js` and verified live.
- **`inspect --builder codex` refuses a Codex inspector.** For the mixed-authorship Codex inspection use `--builder claude --provider codex`.
- Codex's sandbox could not reach Docker or Orca; Claude ran the DB suite and the browser checks.

## Decisions

- The 8-character label rule was dropped: the constraint is fitting 48 px at 320 px without ellipsis.
- 201/200 through a returned `NextResponse` instead of a status callback in `api()`: keeps the service signal out of the JSON body.
- R1 (register read in separate snapshots), a `Select` component test, and the accounts-card spacing stay out of this round.

## Files touched (worktree)

- `components/dashboard-copy.ts`, `components/app-shell.tsx` (nav labels)
- `components/net-worth/{net-worth-view.tsx,copy.ts}` (NW-1, NW-5 heading)
- `components/dashboard.tsx`, `server/cash-flow/dashboard.ts` (NW-3)
- `server/net-worth/{calc.ts,calc.test.ts,service.ts}`, `server/cash-flow/http.ts`, `app/api/net-worth/balances/route.ts` (NW-2, NW-4, NW-5)
- `server/cash-flow/postgres.integration.ts` (new tests: show/hide card, 201/200, concurrent create, 100 limit and tie order)
- `README.md` (API notes), `docs/plans/2026-11-20-m3-investments.md` (new, draft)

## Where we want to go

1. Owner reviews the diff in `D:\DEVS\getstead-m2fix`; with their OK: commit, push `fix/m2-debt-nav1`, open the PR, merge. No migration is involved.
2. Owner reviews `docs/plans/2026-11-20-m3-investments.md` and settles its six decisions (decimal quantities, average cost, EUR only, no double counting for brokerage cash, manual prices).
3. Then build M3 through Codex, as for M2.
4. Optional: R1, a `Select` test harness, CSV import (needs a real bank or broker export).

## Before changing anything

- `D:\DEVS\getstead` is on `main`, clean. The UI worktree `D:\DEVS\getstead-ui` is already merged and can be removed with `git worktree remove` when the owner agrees.
- Local DB: container `stead-m1-pg`, port 55432, database `stead_auth_test`. Suite: `node --env-file=.tmp/stead-m1-test.env --test --test-concurrency=1 server/cash-flow/postgres.integration.ts`.
- Preview: `npm run build`, then `node --env-file=.tmp/stead-m1-test.env node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3100`; seed with `node --env-file=.tmp/stead-m1-test.env .tmp/seed-ui.ts <token-file>`. The preview is stopped now.
- Claude CLI: `--model claude-opus-5-5` (the default needs paid credits). Python: `py -3`.
- No commit, push or remote migration without explicit OK.
