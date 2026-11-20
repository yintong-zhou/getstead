---
type: handoff
date: 2026-11-20
status: built by Codex, cleaned by Claude, inspected (Opus APPROVED, Codex APPROVED twice); uncommitted in the worktree, not pushed
seq: 5
prev: docs/handoff/2026-11-20-stead-m2-debt.md
tags: [stead, profile, auth, codex]
---

## Goal

Replace the two toolbar buttons (language link and Sign out) with one person-icon button that opens a profile menu, plus a profile page with display name, email, password and language.

## Current state

- Work lives in the **worktree `D:\DEVS\getstead-profile`**, branch `feat/profile`, based on `fix/m2-debt-nav1` (`ce43c7c`, pushed, PR not opened). **Nothing is committed or pushed.** Merge `fix/m2-debt-nav1` first, or open this PR against it.
- Owner decisions: "username" is an optional **display name** (login stays email + password + 2FA); email and password changes need the **current password only** (no TOTP, no confirmation email); **menu + `/[locale]/profile` page**.
- Done:
  - Migration `20261122090000_profile` (`stead_users.display_name`, length CHECK) and a runtime-role grant of exactly `UPDATE (email, password_hash, display_name)` in `db/grant-runtime.sql`.
  - `server/profile/{service,inputs}.ts`; API `GET/PATCH /api/profile`, `POST /api/profile/email`, `POST /api/profile/password` through the existing `api()` wrapper (which now exposes `sessionToken`). Wrong password: 403 `invalid`; limiter: 429 `limited` (the shared "password" budget, 5 attempts / 15 min per user). Password change keeps the current session and revokes the others and all login challenges. Shared new-password rule `validNewPassword` (15+ characters, at most 512 bytes), also used by the owner CLI.
  - `components/profile/` (menu, page view, copy EN/IT, CSS), `user` icon, `components/auth/use-logout.ts`. The old `LogoutButton`, its CSS and the unused copy keys were removed.
- Proof (Claude, final tree): `lint`, `typecheck`, unit 40/40, `build`, cash-flow integration 30/30 (6 profile cases). Fresh database replay of all migrations + `grant-runtime.sql` + `prisma migrate diff` = no difference.
- Browser (Orca, synthetic data): menu at 320 px fits with no horizontal scroll, ARIA menu holds only menuitems, keyboard (ArrowDown/Up, Home, End, Escape with focus return, outside click), profile page in IT at 320 px, API statuses and `no-store`.
- Inspections: Opus 5.5 APPROVED with 4 low findings (all fixed or recorded); Codex APPROVED the final snapshot after the fixes.

## Problems and resolutions

- Codex's sandbox could not reach Docker or the browser; Claude ran the migration replay and the browser checks.
- Codex left `LogoutButton` and its CSS unused: removed.
- First display-name hardening (`\p{Cf}`) would have rejected ZWJ and broken emoji names: replaced by an explicit list (ZWSP, word joiner, BOM, bidi overrides and isolates), with tests that keep ZWJ.
- Editing the work order with `\u` escapes made them literal in the source: write escapes with `chr(92)` or review the bytes.

## Decisions and known limits

- Password-only re-authentication means someone with an open session who knows the password can also change the email without 2FA (owner's choice).
- A taken email returns 409, which reveals that the address is registered. Fine for the single-owner app; revisit before opening to other users.
- Language stays URL-based; it is not stored on the user.
- Every re-authentication attempt, successful or not, uses the sign-in limiter budget.
- Applying the migration and the new grant on Neon needs the owner's explicit OK; run `db/grant-runtime.sql` again after the migration.

## Where we want to go

1. Owner reviews and approves; commit, push, PR (after or on top of `fix/m2-debt-nav1`).
2. Settle the M3 decisions in `docs/plans/2026-11-20-m3-investments.md`, then build M3 with Codex.

## Before changing anything

- Same local DB and preview recipe as the previous handoff (`stead-m1-pg`, port 55432; `.tmp/stead-m1-test.env`; `.tmp/seed-ui.ts`). The preview is stopped.
- Claude CLI: `--model claude-opus-5-5`; Python: `py -3`. For a Codex inspection of mixed authorship use `--builder claude --provider codex`.
- No commit, push or remote migration without explicit OK.

## Update: logo and rename to getstead (same worktree, uncommitted, not inspected by Codex/Opus)

- **Logo:** the glass-drop mark replaces the "S" square (`components/brand-mark.tsx`, sidebar, mobile bar, sign-in page), `app/icon.png` and `app/apple-icon.png` replace `icon.svg`, master in `docs/brand/getstead-mark.png`, README header and `brand-guidelines.md` "Logo and name" rewritten. The mark is raster: a vector version is still to be drawn.
- **Rename:** visible name "Stead" became **getstead** (UI copy EN/IT, page titles, wordmark, owner CLI prompts, README, PROJECT.md, brand files). Cookies are now `getstead_session` and `getstead_login_challenge` (everyone is signed out once); the Prisma global is `getsteadPrisma`.
- **Deliberately unchanged** (see README "Naming"): DB tables/enums/roles `stead_*`, the crypto context strings (`stead-auth-rate-v1`, `stead-text-encryption-v1`, `stead-text-v…`: changing them would make stored encrypted text unreadable), `credentials/stead-postgres.env`, `.tmp/stead-*.env`, `stead_auth_test`, Docker names, and older handoffs and plans.
- **Preview recipe change:** set the cookie as `getstead_session=<token>` (older handoffs say `stead_session`).
- Proof on the final tree: lint, typecheck, unit 40/40, build, cash-flow integration 30/30; browser: title "Patrimonio | getstead", wordmark, new cookie logs in, old cookie name does not.
