---
type: handoff
date: 2026-11-20
status: built, fixed over 5 Codex rounds, inspected; committed locally on the feature branch, not pushed
seq: 3
prev: docs/handoff/2026-11-19-stead-net-worth.md
tags: [stead, ui, liquid-glass, cash-flow, select, codex]
---

## Goal

Before M3, refactor the existing UI as the owner asked: a minimal look with fewer outlines, cards and buttons that feel raised and three-dimensional, and an iOS Liquid Glass profile. In Cash flow, income and expenses must be clearly separated. Dropdowns and scrollbars must use the app's own style, not the browser's.

## Current state

- Work lives in the **worktree `D:\DEVS\getstead-ui`** on branch `feat/ui-glass-cashflow-split`, based on `7ee770d` (main, M2 merged). The work is committed locally (one commit, not pushed, no PR yet).
- The approved plan is `C:\Users\zhouy\.claude\plans\leggi-2026-11-19-stead-net-worth-md-e-ri-splendid-treehouse.md`. The Codex work order, Claude's pre-edits patch, fix list 1 and both build results are in `D:\DEVS\getstead-ui\.tmp\claudex\`.
- Codex built it through `claudex-loop:codex-build` (`--unreviewed-spec`, plan approved by the owner but not reviewed through claudex), followed by one fix round (F1–F6). Claude read the whole diff after the first round. After the fix round Claude spot-checked only F1–F6.
- Done:
  - Glass tokens and surfaces, with no borders: cards, buttons, fields, the mobile floating pill navigation, a background gradient, thin app scrollbars, and opaque fallbacks for reduced transparency or missing `backdrop-filter`.
  - `components/select.tsx`: an accessible select-only combobox (ARIA, keyboard, type-ahead, groups, hidden input for FormData). It opens upward above the mobile navigation and replaces all 15 native `<select>`.
  - Cash flow: **Income | Expenses** columns, each with its total and an independent pager (`pageIn`, `pageOut`), plus a separate **Transfers** card (`pageTransfers`). The server filter is `direction=in|out|transfers` in `registerWhere`.
  - Brand guidelines and README updated.
- Proof rerun by Claude after the fix round: `lint`, `typecheck`, `test` (36/36) and `build` (default Turbopack) passed. `server/cash-flow/postgres.integration.ts` passed 22/22, including the new direction-partition test.
- Browser check on synthetic data, at 320, 390 and 1280 px: cash flow, dashboard, net worth and login are OK. Blur is active, there is no horizontal scroll, and the dropdown is legible and opens upward near the navigation. Keyboard flow and accessibility names were verified.
- **Update (later the same day), inspections and fixes:**
  - Round 1 inspections (Codex and Opus) both gave REVISE. Fix rounds F7–F20 followed, all built through Codex with `--resume`:
    - hero tint raised from 70% to 85% (captions were about 4.0:1, now 6.4:1, deviation recorded in the guidelines);
    - Select: focus on open for Safari, no `onChange` when re-picking the current option (it used to clear the "owed" checkbox in Net worth), a space continues type-ahead, `aria-controls` only while open, the listbox takes its name from the field label;
    - empty states aware of filters and of empty pages, Transfers card shown only when the month has transfers;
    - `backdrop-filter: none` on quiet and solid buttons, blur on icon and secondary auth buttons;
    - guideline fixes (hairline, colour/border, the `-webkit-` prefix note).
  - Final inspections: Codex APPROVED an earlier snapshot (before F12–F20; the `direction` filter it covers has not changed since). Opus APPROVED the final snapshot with two low findings: the handoff drift (fixed here) and NAV-1 below.
  - Proof rerun by Claude on the final snapshot: `lint`, `typecheck`, `test` (36/36), `build`, and `postgres.integration.ts` 22/22.
  - Browser check (Orca, synthetic data): dashboard, cash flow, budget, recurring, accounts and net worth at 768 and 390 px. No horizontal scroll, no native select, blur active, hero legible. Not rechecked in the browser after F12–F20.
- **Open (not fixed):**
  - **NAV-1:** mobile navigation labels are 9 px and truncated below 400 px ("Flussi di cas…"). The owner has to choose: shorter labels, or icons only.
  - **R1 (declined):** the three register pages and the summary are read in separate database snapshots. A write from another tab in between can show a row twice or in neither column until a refresh. Fix if needed with one RepeatableRead transaction, as in `server/net-worth/service.ts`.
  - There is no component test for `Select` (no DOM test harness, no new dependency).
  - Cosmetic: the "Regole per le categorie" card on the accounts page has tighter title and description spacing than the other cards (not checked against the old UI).

## What we tried that did NOT work

- **Delegated build in the main checkout.** The runner requires a clean checkout, and `D:\DEVS\getstead` has the owner's staged edit to `brand-guidelines.md`. The work moved to the worktree. Claude's two pre-edits (copy keys and the `direction` filter) were reverted there and passed to Codex as "Step 0" in the work order.
- **`node_modules` as a junction to the main checkout.** Turbopack refuses dependencies outside the workspace root ("Could not find the Next.js package"). The fix was `npm ci` local to the worktree, with the same lockfile and no new dependencies.
- **Writing both `backdrop-filter` and `-webkit-backdrop-filter`.** Tailwind v4's Lightning CSS merges them and emits only the prefixed one, which Chromium ignores. The computed value was `none` everywhere, so the "glass" was just translucent white. Write **only** the unprefixed property and let the build add the prefix.

## Problems and resolutions

- **Popup and navigation unreadable (text behind showed through).** Cause: the `backdrop-filter` issue above. Fixed (F1), and the popup fill was raised to about 94% white (F3).
- **Popup closing on a click on its scrollbar.** Fixed (F2): `preventDefault` on pointerdown now covers the whole listbox.
- **Navigation labels broke mid-word at 390 px ("Panoramic|a").** Fixed (F6): labels no longer wrap, and they end in an ellipsis when they don't fit ("Flussi di cas…").
- **First `npm run typecheck` after the fresh `npm ci` exited 1.** It was transient: rerunning passed with no errors.
- **Docker Desktop off.** Start it with `Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"`, then run `docker start stead-m1-pg`.

## Decisions

- **Glass is the only style, always on.** Rejected: an alternative theme with a toggle in Settings, as the guidelines originally described.
- **Two Income | Expenses columns, with independent server-side pagination.** Rejected: tabs, stacked sections, and the whole month without pages.
- **Classification follows the existing `calc.ts` rule.** The category kind decides; the sign decides only for uncategorised movements. Refunds go in **Expenses** and reduce it, transfers are excluded and shown apart, and column totals equal the month totals. Rejected: refunds in Income. That was the owner's first pick, revised once Claude pointed out that the totals would no longer match.
- **In-house `<Select>`, no dependency.** Rejected: CSS `appearance: base-select` (Chrome only) and Radix (new dependency).
- **The New movement form keeps its fields and is only restyled.** NW-1…NW-5 stay out of this step.
- **Codex deviations, accepted for now:**
  - The primary button tint is at least 90% instead of 70%: at 70%, white text is about 3.1:1, which fails AA.
  - `--muted` is darkened to `#536277` for contrast on glass.
  - Date and month pickers stay native.

## Files touched (worktree)

- `server/cash-flow/movements.ts`: `direction` filter (`directionWhere`, `Object.hasOwn` validation, 422 on invalid values).
- `app/[locale]/cash-flow/page.tsx`: `pageIn`, `pageOut` and `pageTransfers`, with 3 parallel `listMovementsPage` calls.
- `components/cash-flow/movements-view.tsx`: columns, the Transfers card, `Pager`, `categoryGroups`, and the new `Select`.
- `components/select.tsx` (new): the combobox.
- `components/cash-flow/{accounts-view,recurring-view}.tsx`, `components/net-worth/net-worth-view.tsx`: `Select` replacements.
- `components/cash-flow/copy.ts` (EN and IT): added `transfersTitle`, `noIncome`, `noExpenses`, `noIncomeMatches`, `noExpensesMatches`, `emptyPage` and `backToFirstPage`; removed `noMovementsTitle` and `noMovementsBody`.
- `app/globals.css`, `components/cash-flow/cash-flow.css`, `components/auth/auth.css`, `components/net-worth/net-worth.css`: glass, scrollbars, fallbacks and `.flow-columns`.
- `server/cash-flow/postgres.integration.ts`: the direction-partition test.
- `brand-guidelines.md`: the Liquid Glass section rewritten as the only style. The owner's staged edit in the main checkout removes another paragraph and does not conflict.
- `README.md`: cash flow register and the `direction` API parameter.
- Ignored, not committed: `.tmp/seed-ui.ts` (synthetic UI fixture), `.tmp/claudex/*`, `.tmp/stead-m1-test.env`.

## Where we want to go

1. Ask the owner about NAV-1: mobile navigation labels end in "…" below 400 px. Shorter names or icons only? (The hero tint question is settled: 85%.) Fix it, then rerun the proof and one inspection.
2. Optional: decide on R1 and on a quick browser recheck of the Select and the empty states after F12–F20.
3. With the owner's OK: push the branch, open the PR, and reconcile `brand-guidelines.md` with the owner's staged edit in the main checkout.
5. Then: the M2 fixes NW-1…NW-5 (from the net worth handoff), and after them M3 investments.

## Before changing anything

- **Two checkouts:**
  - `D:\DEVS\getstead` is on `main` with the owner's staged `brand-guidelines.md` edit: do not touch it.
  - The UI work is only in `D:\DEVS\getstead-ui`.
- **Local test database:** container `stead-m1-pg`, port 55432, database `stead_auth_test`. Integration suite: `node --env-file=.tmp/stead-m1-test.env --test --test-concurrency=1 server/cash-flow/postgres.integration.ts`.
- **Preview:**
  1. Run `npm run build`.
  2. Start the server with `node --env-file=.tmp/stead-m1-test.env node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3100` (`APP_ORIGIN` is `http://127.0.0.1:3100`).
  3. Create a synthetic user with a session: `node --env-file=.tmp/stead-m1-test.env .tmp/seed-ui.ts <token-file>`. It refuses any database other than `stead_auth_test`.
  4. In the Orca browser, set `document.cookie = "stead_session=<token>; path=/"` and open `/it/cash-flow`.

  Stop the preview before a new build: `.next` gets rewritten.
- **Orca viewport:** use `orca viewport ... --mobile`, and run it again after every `goto` or `reload`.
- **Claude CLI:** use `--model claude-opus-5-5`. The default, Fable, requires paid credits.
- **Python and npm:** use `py -3`. For Codex, PowerShell blocks `npm.ps1`, so it uses `npm.cmd`.
- **No commit, push or remote migration** without explicit OK.
