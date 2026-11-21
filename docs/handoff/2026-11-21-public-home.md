---
type: handoff
date: 2026-11-21
status: public home and waitlist code committed on feat/public-home and pushed; waitlist migration NOT applied to Neon; not merged, not deployed; skill gate left at FAIL 29 (round 2 of 3)
seq: 1
prev: nessuno
tags: [stead, public-home, seo, waitlist, i18n, claude]
---

# Handoff: public home page and waitlist

## Goal
A public, static, indexable home page in English and Italian that presents getstead in a warm, plain way (a friend who knows money, not a sales pitch), with a waitlist as the main action. The product is still invite-only, so the page has to say only what the app does today. It sits on top of the M5 work: see `docs/handoff/2026-11-21-stead-m5-admin-2.md` (branch `feat/public-home` starts from `feat/m5-admin`, which is not merged).

## Where we are
- **Built and committed on `feat/public-home`:**
  - Home at `/en` and `/it`, prerendered (`●` in the build). Sections: hero with a product preview, cash flow and budget, net worth, investments, home and property, how it works, data, FAQ, waitlist, footer.
  - The signed-in dashboard moved from `/{locale}` to `/{locale}/overview`; app shell, login and MFA redirects updated.
  - SEO: `metadataBase` from `APP_ORIGIN`, canonical and hreflang (`x-default` is `/en`), Open Graph and Twitter tags, `app/[locale]/opengraph-image.tsx`, `app/robots.ts`, `app/sitemap.ts`, JSON-LD (`WebSite` and `SoftwareApplication`, no rating or price), privacy page.
  - Waitlist: `POST /api/waitlist`, table `stead_waitlist`, INSERT-only grant for the runtime role.
- **Verified:** `lint`, `typecheck`, `build` pass; `npm run test` 107/107. Waitlist integration on the local container 4/4 (admin suite still 7/7). Route exercised end to end against the local DB: new email 204, duplicate 204 with one row (first language kept), honeypot 204 and nothing stored, sixth attempt per address 429 with a `waitlist_limited` event that holds no email or IP. Perf check: 0 FAIL, no layout shift. Copy-lint: 0 FAIL, 0 WARN. Real Chrome Tab check: the FAQ questions show a 2px blue ring and a tinted background.
- **Not done:**
  - The waitlist migration has **not** been applied to Neon, so the form returns 503 there (and logs `waitlist_failed`) until it is.
  - Not merged, not deployed. No independent review.
  - Skill gate (`design-taste-frontend`): `GATE: FAIL 29 (round 2 of 3)`. See below.

## What we tried that did NOT work
- **The skill's kit checkers on a Next.js page.** `assets/layout/check.mjs` crashes (`r.sections is not iterable`) because it expects the kit's static markup. `consistency.mjs` and the gate run, but they judge against kit structure (`header.nav`, `.wrap`, `footer.closing`, `--h` screens, kit moments).
- **Forcing every section to `min-height: 100svh`** to satisfy "one section per screen". It made sections half empty (`empty-area`, `section-air` FAILs went up) and looked worse. Reverted: only the hero fills the screen.
- **Alternating split layout** (text left, then right). The checker wants every h2 on one left line, and alternation also looked uneven. Now text is always left, picture right, on a 12-column grid (text columns 1-5, picture 7-12).
- **`vector-effect: non-scaling-stroke` with `pathLength` dashes** for the net worth line. Dash lengths then use screen units and the draw animation breaks. Fixed with a 450x100 viewBox and no `vector-effect`.
- **A shell one-liner with `node -e '...'` containing apostrophes** broke on Italian text. Use a script file in `.tmp/` instead.
- **A first review-fix script** wrote `"mescolata"` with inner double quotes into a TS string. Caught by reading the diff; fixed by rewording.

## Problems met and how they were solved
- **Eager logo images below the fold** (perf FAIL): `BrandMark` always had `priority`. It now takes `priority` (default `true`); the previews and the footer pass `false`.
- **Overflow at 320px** in the footer links: `.landing-nav-links` now wraps. Tap targets (wordmark, consent row) raised to 44-48px.
- **Silent 503 if the table or grant is missing:** the route now wraps the limiter and the insert in `try/catch` and records an `ERROR` event.
- **Email in the URL if the form submits before hydration:** `method="post"` on the form (same pattern as `login-form.tsx`).
- **robots and noindex:** the login pages are no longer disallowed in `robots.txt`, so crawlers can read their `noindex` tag.
- **Privacy notice claimed "nothing else" is kept:** the rate limiter stores a keyed hash of the IP in `stead_auth_limits` (never pruned). The notice now says so, in both languages.

## Decisions taken
- **Name on the page is "getstead"** (not "Bilancio" from the brand guidelines). Alternative kept out: a constant for the name.
- **Home static on `/{locale}`, dashboard on `/{locale}/overview`.** Rejected: one URL serving two pages (would stay dynamic, weak for SEO).
- **Claims limited to what exists:** manual entry, no bank sync, no CSV import, no Pro tier, no invented figures. The limits are stated on the page.
- **Brand wins over the skill:** Plus Jakarta Sans, Liquid Glass, brand blue; progress bars stay (brand uses them for budgets); no stock photos; no shader effects; no new violet. The skill's deal commands (palette, font pairing) were not used.
- **Body text colour `#3B4658`** on the landing instead of `--muted`, for AAA contrast; recorded in `brand-guidelines.md`.
- **Metadata origin is `APP_ORIGIN`**, not a new env var. A new variable was rejected to avoid a second source of truth.
- **Waitlist stores the email in clear** (like `User.email`), with no `userId`; the runtime role can only INSERT. An encrypted email was rejected: the owner has to be able to mail the list. Alternative not built: an admin view (admins must not see data).
- **No FAQPage JSON-LD** (no rich result any more), no rating or price markup.
- **Privacy text is a draft that describes the code.** The owner must own the wording.

## Files touched
- `app/[locale]/page.tsx` (now the home), `app/[locale]/overview/page.tsx` (the old dashboard, `noindex`), `app/[locale]/layout.tsx` (only `metadataBase` and a default title), `app/[locale]/privacy/page.tsx`, `app/[locale]/opengraph-image.tsx`, `app/robots.ts`, `app/sitemap.ts`, `server/seo.ts`.
- `components/landing/`: `landing.tsx`, `mocks.tsx` (previews, synthetic cents), `copy.ts` (EN/IT), `privacy-copy.ts`, `waitlist-form.tsx`, `landing.css`, `copy.test.ts`.
- `components/app-shell.tsx`, `components/auth/{login-form,mfa-form}.tsx`, `app/[locale]/login/{page,mfa/page}.tsx`: dashboard path is `/overview`. `components/brand-mark.tsx`: `priority` prop.
- Waitlist: `app/api/waitlist/route.ts`, `server/waitlist/{service.ts,service.test.ts,postgres.integration.ts}`, `server/auth/limits.ts` (phase `"waitlist"`), `db/schema.prisma`, `db/migrations/20261126090000_waitlist/`, `db/grant-runtime.sql`, `package.json` (`test:postgres` list).
- Docs: `README.md`, `.env.example` (`PRIVACY_CONTACT_EMAIL`), `PROJECT.md` (dated exception to "no marketing"), `brand-guidelines.md` (marketing type scale), `.gitignore` (`.taste-skill/`).

## Where we want to go
1. **Get the owner's approval, then apply `db/migrations/20261126090000_waitlist` and `db/grant-runtime.sql` to Neon** (admin connection). Until then the waitlist form fails with 503.
2. **Set `PRIVACY_CONTACT_EMAIL`** and settle the data controller, then have the privacy notice reviewed. Set `APP_ORIGIN` to the public origin **at build time** (canonical, sitemap, robots and the share image read it).
3. **Native read of the Italian copy** (`components/landing/copy.ts`, `privacy-copy.ts`).
4. Decide the gate: either restructure the page onto the kit's `.wrap`/`header.nav`/`--h` skeleton (works against the brand and the layout), or have the owner close it with `gate.mjs --done "<their words>"`. 27-29 FAILs are listed in the last report; only `heading-scale` (net worth amount at 390px) and the FAQ `split-pair` are worth a real look.
5. Then: independent review of the diff, merge order with `feat/m5-admin`, make `/` redirect permanent if the owner agrees, OG font (ttf of Plus Jakarta Sans in `public/fonts`).

## Before touching anything
- **`.env.local` points at the Neon database.** Do not run migrations, the dev server or any test against it by accident. Local synthetic container: `127.0.0.1:55432`, env file `.tmp/stead-m1-test.env` (runtime role plus admin URL). Run `node --env-file=.tmp/stead-m1-test.env --test --test-concurrency=1 server/waitlist/postgres.integration.ts`. Do not use `.tmp/stead-auth-test.env`: it holds unrelated Oracle settings, so `npm run test:postgres` as written will not find a Postgres URL.
- `.tmp/apply-waitlist-local.mjs` applies the migration and grants to the local container only (it refuses any other host).
- Prisma client: run `npx prisma generate` after pulling (it is gitignored); `WaitlistEntry` does not exist before that.
- `/en/overview` is the app's first page now; old bookmarks to `/en` land on the public home.
- The `sample-label` gate FAIL (footer note that the preview numbers are made up) is deliberate: the previews show invented figures and the AGENTS.md rule is to label synthetic data.
- The gate hook runs when you finish in Claude Code and needs a server on `127.0.0.1:3100` (`npx next start -H 127.0.0.1 -p 3100`). Without it the gate reports a false "no `<main>`" FAIL.
