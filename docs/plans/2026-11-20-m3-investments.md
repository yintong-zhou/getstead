# M3 Investments — implementation plan (DRAFT, for owner approval)

Spec (PROJECT.md): buys, sells, dividends and coupons; average cost; current value with manually entered prices; allocation; indicative capital gains and losses at 26%, or 12.5% for Italian government bonds. The app tracks, it never recommends. Base: `main` after the M2-debt branch is merged. Do not build before approval.

## Decisions to confirm (owner)

1. **Quantities as exact decimals.** Units can be fractional (ETF savings plans, crypto to 8 decimals). Proposal: `Prisma.Decimal` (already shipped with Prisma, no new dependency), column `Decimal(28,10)`. Rejected: JS floats (forbidden by AGENTS.md) and integer micro-units (overflow for large crypto quantities).
2. **Money as integer cents, unit prices as exact decimals.** Trade amounts, fees, dividends and values are integer cents. A unit price is `Decimal(18,8)` because some instruments cost less than one cent per unit. Value in cents = round-half-up(quantity × price), done only in `server/`.
3. **Cost method: weighted average cost** (costo medio ponderato), the usual Italian method per instrument. Rejected for v1: FIFO and LIFO, tax-lot tracking.
4. **EUR only in v1.** Foreign-currency instruments are entered at the EUR amounts the owner actually paid or received. No FX table.
5. **Net worth integration, no double counting.** For `BROKERAGE` and `CRYPTO` accounts, the existing balance checks stay as the **cash** balance. Net worth = M2 total + market value of holdings. The UI says so next to the balance-check form for those account types.
6. **Prices.** One manual price per instrument and date. Market value at date D uses the latest price on or before D; with no price it falls back to the average cost and is flagged "no price".

## Model

- `Instrument`: `id`, `userId`, `name`, optional `symbol`/`isin`, `kind` (`STOCK | ETF | FUND | GOV_BOND | BOND | CRYPTO | OTHER`), `archivedAt`. Unique `(userId, name)`. The tax class is derived: `GOV_BOND` is 12.5%, everything else 26% (a pure function, easy to change).
- `InvestmentTransaction`: `id`, `userId`, `accountId` (a brokerage or crypto account of the same user), `instrumentId`, `type` (`BUY | SELL | DIVIDEND | COUPON`), `tradeDate`, `quantity` (BUY/SELL only, > 0), `amountCents` (gross, > 0), `feesCents` (>= 0), `taxWithheldCents` (>= 0, DIVIDEND/COUPON/SELL), `voidedAt`. Foreign keys include `userId` like M1 and M2, `ON DELETE RESTRICT`.
- `PriceQuote`: `id`, `userId`, `instrumentId`, `asOf` date, `unitPrice` Decimal. Unique `(userId, instrumentId, asOf)`.
- All tables get CHECK constraints (ranges, sign rules) and a block in `db/grant-runtime.sql`. Every query is scoped by `userId`.

## Pure calculation (`server/investments/calc.ts`, node:test, synthetic data)

- `position(transactions, asOf)`: quantity held and average cost. A BUY adds `amountCents + feesCents` to total cost. A SELL removes `round(totalCost × soldQty / heldQty)` and realises `proceeds − fees − removedCost`. Selling more than the held quantity is rejected (422), also when a backdated edit would make history negative.
- `holdingsValue(positions, quotes, asOf)` and `allocation(holdings)`: share by value and by `kind`.
- `income(transactions, range)`: dividends and coupons, gross and net of withholding.
- `indicativeTax(realisedByYear, kinds)`: 26% or 12.5% of **positive** gains per instrument class. Losses are shown, never carried forward (out of scope). Every figure carries the label "indicative estimate, not a tax statement".
- Tests: one buy; several buys and a partial sell (rounding); sell all; sell too much; backdated sell; voided rows ignored; price fallback; 12.5% bond class; gains and losses netted per tax class.

## Service, API, UI

1. **Schema and migration** `db/migrations/<ts>_investments/migration.sql` plus grants. Apply to Neon only with explicit approval.
2. **Service** `server/investments/service.ts`: CRUD for instruments, transactions (void instead of delete, like movements), quotes; `getPortfolio(userId, now)` (holdings, allocation, realised gain by year, income, indicative tax) and a 12-month market value series. Validation goes through `Reader` in `server/cash-flow/validate.ts`. No amounts in logs.
3. **Net worth hook**: `getNetWorth` adds holdings value to totals and to `monthlySeries` (month-end holdings value), inside the same RepeatableRead transaction. The dashboard card follows automatically.
4. **API** `app/api/investments/**` via the existing `api()` wrapper: `instruments`, `transactions`, `quotes`, `portfolio`.
5. **UI** page `/[locale]/investments` (EN and IT): hero with total value and unrealised gain, holdings table (quantity, average cost, price, value, gain), allocation bar, add-transaction form, quick price entry per holding, income and realised-gain/tax cards with the estimate label. Nav item (short label that fits 48 px at 320 px: "Invest." or "Titoli" — check), glass style and brand guidelines, works at 320 px.
6. **Tests**: calc unit tests; integration tests for user isolation, constraints, runtime-role grants, negative-position rejection, net worth including holdings.
7. **Docs**: README section; handoff.

## Out of scope for M3

CSV/Excel import of broker files (separate step, needs a real broker export), automatic prices, corporate actions (splits, mergers), FX, FIFO and tax lots, tax-loss carry-forward, goals and projections, any buy/sell recommendation.

## Verification

`lint`, `typecheck`, `test`, `build`; fresh-database migration chain plus `prisma migrate diff` clean; cash-flow and new integration suites on `stead-m1-pg`; browser check at 320/390/1280 px on synthetic data; independent Opus inspection.
