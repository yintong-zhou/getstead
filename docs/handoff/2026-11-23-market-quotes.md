---
type: handoff
date: 2026-11-23
status: verified locally, ready for Vercel rollout
seq: 1
prev: null
tags: [getstead, investments, market-data, yahoo-finance]
---

# Investment market quotes

## Goal

Use daily closing quotes to value open positions and show portfolio performance. Link a listing during instrument creation so the owner can start collecting prices without a separate setup step.

## Current state

- On `feat/amount-expressions`, yfinance fetches market data. Prices are converted to EUR and feed Investments and Net Worth. Chart history accumulates from the first saved close. Manual prices take precedence on the same date.
- Instrument setup tries ISIN first and falls back to the ticker. A single match links automatically. Several candidates require a choice and confirmation before creation. A completed search with no match and an unavailable lookup show different notices. The existing Manage market quote panel uses the same source and supports relinking.
- The quote panel adapts to narrow screens, Delete sits at the right of each holding, and purchases show the total paid with fees included.
- Lint, typecheck, build, 151 Node tests, 21 PostgreSQL investment tests and 2 Python tests passed. The Orca browser verified automatic linking, mobile selection and cancellation with synthetic data. A live Yahoo Finance lookup returned a completed close for a public ticker. The Python function has yet to be verified on Vercel.
- Remote migration `20261129090000_market_quotes` and its runtime grants are applied. The latest read-only check found zero pending or unfinished migrations and confirmed the required permissions.

## What we tried that did not work

- Searching again through Manage market quote with the same input uses the same Yahoo Finance source. A different listing ticker can yield different results.
- A recently listed Paris ETF returned only the current trading session. Using that candle early would treat an intraday price as the closing price.
- The local migration test role lacked `CREATEDB`. A fresh-schema test with the local Docker database owner succeeded. The Prisma comparison reported only the existing no-op difference on the user role default.

## Problems encountered and fixes

- Overview, Net Worth, Investments and Property returned Prisma `P2022` after the quote schema was introduced. Applying the pending remote migration and its grants restored all four server queries.
- Yahoo's session close metadata can arrive as a timezone-aware pandas timestamp. The adapter accepts that form and epoch timestamps. If a listing has no completed close, the cache waits 30 minutes before retrying.
- Existing Paris links use a different exchange suffix. The adapter translates supported suffixes on read, for example `.PAR` to `.PA`, and checks the currency before applying the new price.

## Decisions

- Keep the PostgreSQL quote schema and stored history during the provider change. The existing cache gets a separate `yahoo:` key namespace.
- Cache successful lookups for 12 hours and cap uncached lookups at 25 per rolling 24 hours. Keep the reservation atomic and perform provider calls outside the database transaction.
- Keep the transaction API's separate price and fee fields. The purchase form converts the inclusive total to price plus fees when saving and recombines them when editing.

## Files touched

- `api/market_data.py`, `requirements.txt` and `server/investments/market-data.ts` implement the Python transport, cache, and conversion.
- `app/api/investments/instruments/setup/route.ts` and `server/investments/service.ts` handle lookup, candidate verification and atomic creation.
- `components/investments/` and `app/[locale]/investments/page.tsx` contain the setup dialog, quote panel, row alignment and purchase form.
- `server/investments/market-data.test.ts`, `market_data_test.py` and `postgres.integration.ts` cover caching, daily close handling and setup. `components/investments/copy.test.ts` and `numbers.test.ts` cover the purchase label and total.
- `.env.example` and `README.md` document the market-data configuration.

## Next steps

With deployment approval, set `MARKET_DATA_BRIDGE_SECRET` in Vercel and deploy the branch. Verify that its Python function is reachable, then use an open position with a completed market close to verify that the dated price and gain appear in Investments and Net Worth. If deployment protection blocks the function, use the accessible origin described in the README.

## Before changing anything

- Install `requirements.txt` with Python 3.12 for local development. Set `MARKET_DATA_PYTHON` if the default interpreter has a different environment.
- Run `py -3 -B -m unittest discover -s server/investments -p market_data_test.py` for the Python adapter. Use the synthetic local PostgreSQL configuration for integration tests.
- No further database migration is needed for this change. The working tree contains separate admin and import changes outside this handoff.
