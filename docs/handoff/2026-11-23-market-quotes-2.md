---
type: handoff
date: 2026-11-23
status: awaiting production quote verification
seq: 2
prev: docs/handoff/2026-11-23-market-quotes.md
tags: [getstead, investments, market-data, yahoo-finance, vercel]
---

# Investment market quotes

## Obiettivo

Let users link an investment to the correct Yahoo Finance listing and see its latest recorded unit price in EUR and its unrealised gain in EUR and percent. Keep manual price entry available when the automatic service fails.

## A che punto siamo

- `feat/amount-expressions` matches its remote at `fa0bf22`. Pushed commits are `55342cb` (shared date picker, quote details and gain percentage) and `fa0bf22` (holdings spacing, removal of Delete from Holdings, visible quote controls). GitHub showed a failed branch preview and a successful deployment for main merge `a1f0a12`.
- The manual **Record price** form in **Investments → Price history** is still local. It uses the existing `POST /api/investments/quotes` endpoint. Browser verification used synthetic data and a mocked save. Lint, typecheck, build and all 153 Node tests passed with those changes.
- The Python adapter returned `AAPL · Apple Inc. · NASDAQ · USD` when run directly on the workstation. A read-only check of the remote PostgreSQL database configured in `.env.local` found all three market tables, the instrument link columns and the expected runtime grants. The shared request budget was below the cap and there was no recent throttling at the time of the check.
- The user reported adding `MARKET_DATA_BRIDGE_SECRET` on Vercel. The last instruction was to set Production `MARKET_DATA_BRIDGE_ORIGIN` to `https://getstead-finance.vercel.app` and redeploy. Whether the origin was set or the search retried remains unconfirmed.

## Cosa abbiamo provato che NON ha funzionato

- The deployed UI reported that the quote was unavailable for `AAPL`. The local lookup only established that Yahoo recognises the ticker. Vercel invokes the Python adapter over HTTPS, whereas the local probe executed the script directly.
- GitHub exposed deployment statuses, but the authenticated Vercel runtime logs were unavailable from this workspace. An unauthenticated POST to the public Python endpoint returned the expected JSON 401, confirming routing and the presence of the function. The authenticated call path still needs verification.

## Problemi incontrati e come li abbiamo risolti

- The quote control disappeared when the service was disabled. It now remains visible on eligible instruments and explains the disabled state.
- The error mentioned manual prices while the UI only showed history. The local form restores that path and directs the user to it in the error message.

## Decisioni prese

- Keep Holdings derived from active transactions and remaining quantity. Instrument management stays in Instruments.
- Use the verified public project origin for the production bridge. The generated deployment domain can be subject to Vercel Deployment Protection. Protection is a hypothesis pending the production retry or runtime logs.
- The checked database already has the quote schema and grants. Compare the production database and role before considering a migration.

## File toccati

- `components/date-field*` and `components/date-picker-days*` contain the shared date picker, styles and date-grid tests.
- `components/investments/investments-view.tsx` and `investments.css` render unit price, gain percentage and the read-only holdings layout.
- `components/investments/forms.tsx`, `copy.ts` and `investments-view.tsx` contain the uncommitted manual price entry and revised error copy.
- `server/investments/calc.ts` and `calc.test.ts` calculate and verify gain relative to remaining cost using decimal arithmetic.

## Dove vogliamo andare

1. Confirm that the Production origin was set and redeployed, then retry **Investments → Instruments → Link market quote → AAPL**.
2. If the request still fails, inspect Vercel Runtime Logs for the Next.js market search route and `/api/market_data` at the same timestamp. Check the response status and content type. Compare the Production database and runtime role with the checked database if the search fails before contacting the function.
3. Publish the manual price form when authorised. Stage only the three Investment files. Verify that a saved manual price appears in history and is used to value an open position.

## Da sapere prima di toccare qualcosa

- Use `py -3 -B` for local adapter probes to avoid creating bytecode files in the source tree. Keep the bridge secret server-side.
- The working tree also contains separate Admin and import work. Preserve it. Deployment and non-local migrations require owner approval.
