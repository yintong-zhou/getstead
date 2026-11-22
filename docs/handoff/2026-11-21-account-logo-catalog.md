---
type: handoff
date: 2026-11-21
status: Merged and pushed to main, logo migration applied to Neon, production UI smoke test pending
seq: 1
prev: null
tags: [getstead, accounts, logos, brokers, neon]
---

# Account logo catalog

## Goal

Make checking and brokerage accounts easy to identify in Getstead, including accounts with personal names. Use recognizable brand images where available and a consistent generic icon elsewhere.

## Where we are

- Local `main` and `origin/main` point to `720e487` (`feat: add bank and broker logo catalog`). The working tree was clean before this handoff.
- The app bundles 31 logos, including 22 banks and digital account providers and 9 brokers. New checking and brokerage accounts look up an unambiguous match by name. In **Accounts → Logo**, users can choose and preview a provider, upload an image, paste a public HTTPS image or site link, or remove a logo. Accounts without a working image show the generic bank icon.
- **Show archived** is a keyboard-accessible switch in the Accounts card header. It controls both archived accounts and archived categories.
- Lint, typecheck, build, 123 unit tests, and both logo-related local PostgreSQL integration tests passed. Orca verified the Directa picker, preview, save and rendered logo at 390 px. The production build trace included all 31 assets.
- With owner approval, Prisma applied `20261127090000_account_logos` to Neon `neondb`. Read-only checks confirmed its checksum and completed history entry, the composite foreign key, the runtime grants, and successful access as `stead_auth_app`. The waitlist migration `20261126090000_waitlist` is still pending.
- Production browser behavior and Vercel deployment status were not checked after the push.

## What we tried that did not work

- Homepage scraping alone missed providers. The N26 and Revolut homepages returned HTTP 403 to the server, while publisher image URLs worked. A white Intesa header/mobile mark was barely visible on the light UI. The catalog now uses bundled images checked on a light background, including Intesa's publisher app icon.
- Running all PostgreSQL integration tests with the runtime role failed the existing TOTP reset test on `stead_auth_limits` DELETE. The auth suite passed separately with the owner role. The logo tests passed with the restricted runtime role.
- The repository's standard Prisma deployment would have included the pending waitlist migration. A temporary config under `.tmp/` included the nine applied migrations and the logo migration, allowing Prisma to apply exactly the authorized change.

## Problems encountered and how we resolved them

- Claude Code's read-only review found that the original HTML parsing regex could scale quadratically. The link fallback now uses a bounded scanner and has regression coverage for large markup. The downloader validates public HTTPS destinations, pins the resolved address, checks redirects, and caps reads.
- The logo form overflowed on a 390 px viewport. Constraining the panel grid and fields fixed the overflow.
- The Neon owner configuration may name `test_neondb`. The rollout matched the direct owner endpoint to the configured pooled runtime endpoint, then used `/neondb` explicitly in a process-local configuration.

## Decisions

- Keep logo matching local and bundle verified WebP thumbnails. This avoids fetching provider homepages on account creation and preserves private account names. Logo.dev and Brandfetch were compared as optional sources. There is no integration or subscription.
- Keep one explicit provider picker alongside name matching because a personal name can be ambiguous. Explicit choices and successful custom replacements take precedence over automatic results. Save each chosen thumbnail with the account through the existing encrypted storage.
- Preserve public HTTPS links and uploads as fallbacks for brands outside the catalog. Allow only validated PNG, JPEG, or WebP before normalization.

## Files changed

- `server/cash-flow/logo-catalog.ts` and `public/account-logos/` define the source URLs, aliases, and bundled thumbnails.
- `components/cash-flow/accounts-view.tsx`, `account-logo.tsx`, and `cash-flow.css` implement account matching, previews, fallback icons, and the archive switch.
- `server/cash-flow/account-logo-service.ts`, `bank-logos.ts`, and `app/api/cash-flow/accounts/[id]/logo/route.ts` handle catalog choices and authenticated image storage, retrieval, and remote input.
- `db/migrations/20261127090000_account_logos/migration.sql`, `db/schema.prisma`, and `db/grant-runtime.sql` define the logo table and grants.
- `server/cash-flow/logo-catalog.test.ts`, `bank-logos.test.ts`, and `postgres.integration.ts` verify catalog assets, remote input, ownership, and persistence.

## Next steps

1. Check whether the deployed Vercel build includes `720e487`. If an authorized production smoke test is requested, verify existing logos and the fallback icon on **Accounts**. Use local synthetic data for write tests.
2. Treat the pending waitlist migration as a separate operation. Apply it only with explicit owner authorization.

## Before changing anything

- Run PostgreSQL tests against the local `stead_auth_test` database. Use `.tmp/stead-m1-test.env` for runtime-role integration tests and `.tmp/stead-owner-test.env` for the auth suite. The default `.tmp/stead-auth-test.env` may contain unrelated Oracle settings.
- `.env.local` points to Neon. Verify the database and pending migration names before invoking Prisma. Keep connection strings and real account data out of logs and test fixtures.
