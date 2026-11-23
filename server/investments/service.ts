// All writes serialize per user for quotas, then lock accounts before sorted instruments.
// The extra user lock also protects instruments shared across different brokerage accounts.
import type { Prisma, Instrument, InvestmentTransaction, MarketPriceQuote, PriceQuote } from "../../db/generated/client.ts";
import { db } from "../auth/database.ts";
import { addDays, addMonths, fromDate, monthOf, monthStart, romeToday, toDate } from "../cash-flow/dates.ts";
import { ApiError, conflict, notFound } from "../cash-flow/errors.ts";
import { Reader } from "../cash-flow/validate.ts";
import { allocation, decimalInput, holdingsValue, income, indicativeTax, instrumentKinds, portfolioTrend, position, toSafeCents, transactionTypes, validateHistory } from "./calc.ts";
import { buildTrend } from "../trend.ts";
import { marketDataEnabled, marketQuote, marketTicker, searchMarket, type MarketListing } from "./market-data.ts";

type Client = Prisma.TransactionClient;
const MAX_TRANSACTION_CENTS = 100_000_000_000;
export const MAX_INSTRUMENTS = 1_000;
export const MAX_TRANSACTIONS = 10_000;

export function transactionInput(row: InvestmentTransaction) {
  return { ...row, tradeDate: fromDate(row.tradeDate), quantity: row.quantity?.toFixed() ?? null };
}
function quoteDto(row: PriceQuote) {
  return { id: row.id, instrumentId: row.instrumentId, asOf: fromDate(row.asOf), unitPrice: row.unitPrice.toFixed() };
}
export function quoteInput(row: PriceQuote) {
  return { ...row, asOf: fromDate(row.asOf), unitPrice: row.unitPrice.toFixed() };
}
export function marketQuoteInput(row: MarketPriceQuote) {
  return { instrumentId: row.instrumentId, asOf: fromDate(row.asOf), unitPrice: row.unitPrice.toFixed(), source: "MARKET" as const };
}
function transactionDto(row: InvestmentTransaction) {
  const input = transactionInput(row);
  return { id: row.id, accountId: row.accountId, instrumentId: row.instrumentId, type: row.type,
    tradeDate: input.tradeDate, ordinal: row.ordinal, quantity: input.quantity,
    amountCents: toSafeCents(row.amountCents), feesCents: toSafeCents(row.feesCents),
    taxWithheldCents: toSafeCents(row.taxWithheldCents), voided: row.voidedAt !== null };
}
export type TransactionDto = ReturnType<typeof transactionDto>;

async function userLock(client: Client, userId: string) {
  await client.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${userId}, 3))`;
}
// FOR NO KEY UPDATE, not FOR UPDATE: movement inserts hold KEY SHARE on the account row through the
// foreign key, and FOR UPDATE would deadlock with a transfer that inserts its legs in the opposite
// account order. NO KEY UPDATE still excludes updateAccount (catalog.ts, FOR UPDATE) and other investment writers.
async function lockAccounts(client: Client, userId: string, ids: string[]) {
  for (const id of [...new Set(ids)].sort()) {
    const rows = await client.$queryRaw<{ id: string }[]>`SELECT account_id AS id FROM stead_accounts WHERE user_id = ${userId}::uuid AND account_id = ${id}::uuid FOR NO KEY UPDATE`;
    if (!rows.length) throw new ApiError(422, "validation", "accountId");
  }
}
async function lockInstruments(client: Client, userId: string, ids: string[]) {
  for (const id of [...new Set(ids)].sort()) {
    const rows = await client.$queryRaw<{ id: string }[]>`SELECT instrument_id AS id FROM stead_instruments WHERE user_id = ${userId}::uuid AND instrument_id = ${id}::uuid FOR UPDATE`;
    if (!rows.length) throw new ApiError(422, "validation", "instrumentId");
  }
}
async function lockInstrumentHistory(client: Client, userId: string, instrumentId: string) {
  const row = await client.instrument.findFirst({ where: { userId, id: instrumentId } });
  if (!row) throw notFound();
  const accounts = await client.investmentTransaction.findMany({ where: { userId, instrumentId }, select: { accountId: true }, distinct: ["accountId"] });
  await lockAccounts(client, userId, accounts.map((account) => account.accountId));
  await lockInstruments(client, userId, [instrumentId]);
  return row;
}
export async function audit(client: Client, userId: string, ids: string[]) {
  for (const instrumentId of new Set(ids)) {
    const rows = await client.investmentTransaction.findMany({ where: { userId, instrumentId } });
    const quotes = await client.priceQuote.findMany({ where: { userId, instrumentId } });
    const market = await client.marketPriceQuote.findMany({ where: { userId, instrumentId } });
    const transactions = rows.map(transactionInput), prices = quotes.map(quoteInput), closes = market.map(marketQuoteInput);
    validateHistory(transactions, [...closes, ...prices]);
    // A manual quote can be removed later, exposing an automatic quote on the same date.
    if (closes.length && prices.length) validateHistory(transactions, [...prices, ...closes]);
  }
}
function write<T>(userId: string, operation: (client: Client) => Promise<T>) {
  return db().$transaction(async (client) => { await userLock(client, userId); return operation(client); }, { timeout: 30_000 });
}

function instrumentDto(row: Instrument) {
  const { id, name, symbol, isin, kind, archivedAt } = row;
  return { id, name, symbol, isin, kind, archived: archivedAt !== null, market: linkedMarket(row) };
}
function supportsMarket(kind: Instrument["kind"]) {
  return kind === "STOCK" || kind === "ETF" || kind === "FUND";
}
function linkedMarket({ marketSymbol, marketName, marketCurrency, name, kind }: Instrument): MarketListing | null {
  return marketSymbol && marketName && marketCurrency && supportsMarket(kind)
    ? { symbol: marketTicker(marketSymbol), market: marketName, currency: marketCurrency, name } : null;
}

function marketColumns(listing: MarketListing | null) {
  return { marketSymbol: listing?.symbol ?? null, marketName: listing?.market ?? null, marketCurrency: listing?.currency ?? null };
}

export async function findInstrumentMarket(userId: string, instrumentId: string, input: Record<string, unknown>) {
  const reader = new Reader(input);
  const query = reader.text("query", 64);
  reader.done();
  const instrument = await db().instrument.findFirst({ where: { userId, id: instrumentId } });
  if (!instrument) throw notFound();
  if (!supportsMarket(instrument.kind) || instrument.archivedAt) throw conflict("market_unavailable");
  const listings = await searchMarket(query);
  if (!listings) throw new ApiError(503, "market_unavailable");
  return listings;
}

export async function linkInstrumentMarket(userId: string, instrumentId: string, input: Record<string, unknown>) {
  const reader = new Reader(input);
  const symbol = reader.nullableText("symbol", 80);
  const query = reader.optionalText("query", 64);
  reader.done();
  if (symbol === undefined || (symbol && !query)) throw new ApiError(422, "validation", "symbol");

  const listing = symbol && query
    ? (await findInstrumentMarket(userId, instrumentId, { query })).find((candidate) => candidate.symbol === symbol)
    : null;
  if (symbol && !listing) throw new ApiError(422, "market_unavailable");
  return write(userId, async (client) => {
    const instrument = await client.instrument.findFirst({ where: { userId, id: instrumentId } });
    if (!instrument) throw notFound();
    if (listing && (instrument.archivedAt || !supportsMarket(instrument.kind))) throw conflict("market_unavailable");
    const row = await client.instrument.update({ where: { userId_id: { userId, id: instrumentId } },
      data: marketColumns(listing ?? null) });
    return instrumentDto(row);
  });
}
export async function listInstruments(userId: string) {
  const rows = await db().instrument.findMany({ where: { userId }, orderBy: [{ name: "asc" }, { id: "asc" }],
    include: { _count: { select: { marketQuotes: true } } } });
  return rows.map((row) => ({ ...instrumentDto(row), marketQuoteCount: row._count.marketQuotes }));
}
export type InstrumentDto = Awaited<ReturnType<typeof listInstruments>>[number];

function instrumentData(input: Record<string, unknown>, partial = false) {
  const reader = new Reader(input);
  const name = partial ? reader.optionalText("name", 120) : reader.text("name", 120);
  const kind = partial ? reader.optionalOneOf("kind", instrumentKinds) : reader.oneOf("kind", instrumentKinds);
  const symbol = reader.nullableText("symbol", 24);
  const isin = reader.nullableText("isin", 12);
  if (isin && !/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin)) throw new ApiError(422, "validation", "isin");
  const archived = partial ? reader.optionalBool("archived") : undefined;
  reader.done();
  return { name, kind, symbol, isin, ...(archived === undefined ? {} : { archivedAt: archived ? new Date() : null }) };
}
async function insertInstrument(userId: string, data: ReturnType<typeof instrumentData>, listing: MarketListing | null = null) {
  return write(userId, async (client) => {
    if (await client.instrument.count({ where: { userId } }) >= MAX_INSTRUMENTS) throw new ApiError(422, "instrument_limit");
    return instrumentDto(await client.instrument.create({
      data: { ...data, ...marketColumns(listing), userId, name: data.name!, kind: data.kind! },
    }));
  });
}

export async function createInstrument(userId: string, input: Record<string, unknown>) {
  return insertInstrument(userId, instrumentData(input));
}

export type InstrumentSetupResult =
  | { status: "choose"; listings: MarketListing[] }
  | { status: "created"; instrument: ReturnType<typeof instrumentDto>; quoteLookup?: "unmatched" | "unavailable" };

export async function setupInstrument(userId: string, input: Record<string, unknown>, lookup = searchMarket): Promise<InstrumentSetupResult> {
  const { listingSymbol, ...initial } = input;
  const reader = new Reader({ listingSymbol });
  const selection = reader.optionalText("listingSymbol", 24);
  const data = instrumentData(initial);
  const ticker = data.symbol ? marketTicker(data.symbol) : null;
  const qualifiedTicker = ticker?.includes(".") ?? false;
  let listings: MarketListing[] = [];
  let quoteLookup: "unmatched" | "unavailable" | undefined;
  async function find(query: string) {
    const matches = await lookup(query);
    if (matches === null) quoteLookup = "unavailable";
    else quoteLookup ??= "unmatched";
    return matches ?? [];
  }
  if (data.kind && supportsMarket(data.kind)) {
    if (data.isin) listings = await find(data.isin);
    if (qualifiedTicker && listings.some(({ symbol }) => symbol === ticker)) {
      listings = listings.filter(({ symbol }) => symbol === ticker);
    }
    if (!listings.length && ticker) {
      listings = (await find(ticker)).filter(({ symbol }) =>
        symbol === ticker || (!qualifiedTicker && symbol.startsWith(ticker + ".")));
    }
  }

  if (selection) {
    const listing = listings.find(({ symbol }) => symbol === selection);
    if (!listing) throw new ApiError(422, "market_unavailable");
    return { status: "created", instrument: await insertInstrument(userId, data, listing) };
  }
  if (listings.length > 1) return { status: "choose", listings };
  return { status: "created", instrument: await insertInstrument(userId, data, listings[0]),
    quoteLookup: listings.length ? undefined : quoteLookup };
}
export async function updateInstrument(userId: string, id: string, input: Record<string, unknown>) {
  const data = instrumentData(input, true);
  return write(userId, async (client) => {
    await lockInstrumentHistory(client, userId, id);
    const row = await client.instrument.update({ where: { userId_id: { userId, id } }, data });
    await audit(client, userId, [id]);
    return instrumentDto(row);
  });
}

/**
 * Permanently deletes one instrument with all its transactions and price quotes ("position" in the UI).
 * One transaction under the user lock, so it is all-or-nothing and no concurrent write slips in between.
 * Every statement filters on userId; another user's id is a 404 and touches nothing.
 * Cash effects of the deleted transactions disappear too, so brokerage balances and net worth can change.
 */
export async function deleteInstrument(userId: string, id: string) {
  return write(userId, async (client) => {
    await lockInstrumentHistory(client, userId, id);
    const quotes = await client.priceQuote.deleteMany({ where: { userId, instrumentId: id } });
    const marketQuotes = await client.marketPriceQuote.count({ where: { userId, instrumentId: id } });
    const transactions = await client.investmentTransaction.deleteMany({ where: { userId, instrumentId: id } });
    await client.instrument.delete({ where: { userId_id: { userId, id } } });
    return { transactions: transactions.count, quotes: quotes.count + marketQuotes };
  });
}

function cents(reader: Reader, field: string, min = 0) {
  // Reader performs the boundary/type check; report the investment range with its stable code.
  let amount: number;
  try { amount = reader.integer(field, min, MAX_TRANSACTION_CENTS); }
  catch (error) {
    if (error instanceof ApiError) throw new ApiError(422, "value_out_of_range", field);
    throw error;
  }
  return BigInt(amount);
}
function transactionData(input: Record<string, unknown>, partial = false) {
  const reader = new Reader(input);
  const accountId = partial ? reader.optionalUuid("accountId") : reader.uuid("accountId");
  const instrumentId = partial ? reader.optionalUuid("instrumentId") : reader.uuid("instrumentId");
  const type = partial ? reader.optionalOneOf("type", transactionTypes) : reader.oneOf("type", transactionTypes);
  const tradeDate = partial ? reader.optionalDate("tradeDate") : reader.date("tradeDate");
  const rawQuantity = reader.nullableText("quantity", 80);
  const quantity = rawQuantity == null ? rawQuantity : decimalInput(rawQuantity, 10, "quantity");
  const amountCents = !partial || reader.has("amountCents") ? cents(reader, "amountCents", 1) : undefined;
  const feesCents = reader.has("feesCents") ? cents(reader, "feesCents") : partial ? undefined : 0n;
  const taxWithheldCents = reader.has("taxWithheldCents") ? cents(reader, "taxWithheldCents") : partial ? undefined : 0n;
  const ordinal = partial && reader.has("ordinal") ? reader.integer("ordinal", 1, 2_147_483_647) : undefined;
  const voided = partial ? reader.optionalBool("voided") : undefined;
  reader.done();
  return { accountId, instrumentId, type, tradeDate: tradeDate ? toDate(tradeDate) : undefined, quantity, amountCents, feesCents, taxWithheldCents, ordinal,
    ...(voided === undefined ? {} : { voidedAt: voided ? new Date() : null }) };
}
function validShape(row: { type: string; quantity: unknown; amountCents: bigint; feesCents: bigint; taxWithheldCents: bigint }) {
  const trade = row.type === "BUY" || row.type === "SELL";
  if (trade ? !row.quantity : row.quantity != null) throw new ApiError(422, "validation", "quantity");
  if (!trade && row.feesCents !== 0n) throw new ApiError(422, "validation", "feesCents");
  if (row.type === "BUY" && row.taxWithheldCents !== 0n) throw new ApiError(422, "validation", "taxWithheldCents");
  // Deductions never exceed the gross amount: income stays non-negative and a sale never debits cash.
  if (!trade && row.taxWithheldCents > row.amountCents) throw new ApiError(422, "validation", "taxWithheldCents");
  if (row.type === "SELL" && row.feesCents + row.taxWithheldCents > row.amountCents) throw new ApiError(422, "validation", "feesCents");
}
async function usableParents(client: Client, userId: string, accountId: string, instrumentId: string) {
  const account = await client.account.findFirst({ where: { userId, id: accountId } });
  const instrument = await client.instrument.findFirst({ where: { userId, id: instrumentId } });
  if (!account || !["BROKERAGE", "CRYPTO"].includes(account.type)) throw new ApiError(422, "validation", "accountId");
  if (!instrument) throw new ApiError(422, "validation", "instrumentId");
  if (account.archivedAt || instrument.archivedAt) throw conflict("archived");
}
async function nextOrdinal(client: Client, userId: string, instrumentId: string, tradeDate: Date) {
  const { _max } = await client.investmentTransaction.aggregate({ where: { userId, instrumentId, tradeDate }, _max: { ordinal: true } });
  if (_max.ordinal === 2_147_483_647) throw new ApiError(422, "value_out_of_range", "ordinal");
  return (_max.ordinal ?? 0) + 1;
}
export async function listTransactions(userId: string) {
  const rows = await db().investmentTransaction.findMany({ where: { userId }, orderBy: [{ tradeDate: "desc" }, { ordinal: "desc" }, { id: "desc" }] });
  return rows.map(transactionDto);
}
export async function createTransaction(userId: string, input: Record<string, unknown>) {
  const data = transactionData(input);
  return write(userId, async (client) => {
    await lockAccounts(client, userId, [data.accountId!]);
    await lockInstruments(client, userId, [data.instrumentId!]);
    await usableParents(client, userId, data.accountId!, data.instrumentId!);
    if (await client.investmentTransaction.count({ where: { userId } }) >= MAX_TRANSACTIONS) throw new ApiError(422, "transaction_limit");
    const create = { userId, accountId: data.accountId!, instrumentId: data.instrumentId!, type: data.type!, tradeDate: data.tradeDate!,
      ordinal: await nextOrdinal(client, userId, data.instrumentId!, data.tradeDate!), quantity: data.quantity ?? null,
      amountCents: data.amountCents!, feesCents: data.feesCents!, taxWithheldCents: data.taxWithheldCents! };
    validShape(create);
    const row = await client.investmentTransaction.create({ data: create });
    await audit(client, userId, [row.instrumentId]);
    return transactionDto(row);
  });
}
export async function updateTransaction(userId: string, id: string, input: Record<string, unknown>) {
  const data = transactionData(input, true);
  return write(userId, async (client) => {
    const old = await client.investmentTransaction.findFirst({ where: { userId, id } });
    if (!old) throw notFound();
    const accountId = data.accountId ?? old.accountId, instrumentId = data.instrumentId ?? old.instrumentId;
    await lockAccounts(client, userId, [old.accountId, accountId]);
    await lockInstruments(client, userId, [old.instrumentId, instrumentId]);
    const voidOnly = Object.keys(input).length === 1 && input.voided === true;
    if (!voidOnly) await usableParents(client, userId, accountId, instrumentId);
    // Moving a row to another date or instrument puts it last in that day's order unless the caller picks an ordinal.
    const moved = instrumentId !== old.instrumentId || (data.tradeDate !== undefined && data.tradeDate.getTime() !== old.tradeDate.getTime());
    const patch = moved && data.ordinal === undefined
      ? { ...data, ordinal: await nextOrdinal(client, userId, instrumentId, data.tradeDate ?? old.tradeDate) } : data;
    const merged = { ...old, ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) };
    validShape(merged);
    const row = await client.investmentTransaction.update({ where: { userId_id: { userId, id } }, data: patch });
    await audit(client, userId, [old.instrumentId, instrumentId]);
    return transactionDto(row);
  });
}

export async function listQuotes(userId: string) {
  return (await db().priceQuote.findMany({ where: { userId }, orderBy: [{ asOf: "desc" }, { id: "desc" }] })).map(quoteDto);
}
export async function recordQuote(userId: string, input: Record<string, unknown>) {
  const reader = new Reader(input);
  const instrumentId = reader.uuid("instrumentId"), asOf = reader.date("asOf");
  const unitPrice = decimalInput(reader.text("unitPrice", 80), 8, "unitPrice");
  reader.done();
  return write(userId, async (client) => {
    const instrument = await lockInstrumentHistory(client, userId, instrumentId);
    if (instrument.archivedAt) throw conflict("archived");
    const row = await client.priceQuote.upsert({ where: { userId_instrumentId_asOf: { userId, instrumentId, asOf: toDate(asOf) } },
      create: { userId, instrumentId, asOf: toDate(asOf), unitPrice }, update: { unitPrice } });
    await audit(client, userId, [instrumentId]);
    return quoteDto(row);
  });
}
export async function deleteQuote(userId: string, id: string) {
  return write(userId, async (client) => {
    const row = await client.priceQuote.findFirst({ where: { userId, id } });
    if (!row) throw notFound();
    await lockInstrumentHistory(client, userId, row.instrumentId);
    await client.priceQuote.delete({ where: { userId_id: { userId, id } } });
    await audit(client, userId, [row.instrumentId]);
  });
}

export async function refreshMarketQuotes(userId: string, now = new Date(),
  readQuote = marketDataEnabled() ? marketQuote : undefined) {
  if (!readQuote) return { changed: false, unavailable: 0 };
  const deadline = Date.now() + 10_000;
  const today = romeToday(now);
  const [instruments, rows, prices] = await db().$transaction([
    db().instrument.findMany({ where: { userId, archivedAt: null, marketSymbol: { not: null } }, orderBy: { id: "asc" } }),
    db().investmentTransaction.findMany({ where: { userId, tradeDate: { lte: toDate(today) }, voidedAt: null } }),
    db().marketPriceQuote.groupBy({ by: ["instrumentId"], orderBy: { instrumentId: "asc" }, where: { userId }, _max: { asOf: true } }),
  ], { isolationLevel: "RepeatableRead" });
  const open = new Set(holdingsValue(instruments, rows.map(transactionInput), [], today).map(({ instrumentId }) => instrumentId));
  const latest = new Map(prices.map(({ instrumentId, _max }) => [instrumentId, _max?.asOf?.getTime() ?? 0]));
  const eligible = instruments.filter(({ id }) => open.has(id))
    .sort((a, b) => (latest.get(a.id) ?? 0) - (latest.get(b.id) ?? 0));
  let changed = false, unavailable = 0;
  for (let index = 0; index < eligible.length && Date.now() < deadline; index += 4) {
    const results = await Promise.all(eligible.slice(index, index + 4).map(async (instrument) => {
      const listing = linkedMarket(instrument);
      if (!listing) return false;
      const quote = await readQuote(listing, now);
      if (!quote) unavailable++;
      if (!quote || quote.asOf > today || (latest.get(instrument.id) ?? 0) >= toDate(quote.asOf).getTime()) return false;
      try {
        return await write(userId, async (client) => {
          const instrumentId = instrument.id;
          const current = await client.instrument.findFirst({ where: { userId, id: instrumentId, archivedAt: null } });
          if (!current || current.marketSymbol !== instrument.marketSymbol || current.marketCurrency !== quote.currency || !supportsMarket(current.kind)) return false;
          const trades = await client.investmentTransaction.findMany({ where: { userId, instrumentId, voidedAt: null } });
          if (position(trades.map(transactionInput), today).quantity === "0") return false;
          const saved = await client.marketPriceQuote.createMany({ skipDuplicates: true, data: {
            userId, instrumentId, asOf: toDate(quote.asOf), unitPrice: quote.unitPrice, currency: quote.currency,
            fxRate: quote.fxRate, fxAsOf: quote.fxAsOf ? toDate(quote.fxAsOf) : null,
          } });
          if (saved.count) await audit(client, userId, [instrumentId]);
          return saved.count > 0;
        });
      } catch (error) {
        if (error instanceof ApiError && error.code === "value_out_of_range") return false;
        throw error;
      }
    }));
    changed ||= results.some(Boolean);
  }
  return { changed, unavailable };
}

/** `trend` adds the period chart; only the investments page asks for it. */
export async function getPortfolio(userId: string, now = new Date(), { trend = false } = {}) {
  const today = romeToday(now);
  const [instruments, rows, prices, market] = await db().$transaction([
    db().instrument.findMany({ where: { userId }, orderBy: [{ name: "asc" }, { id: "asc" }] }),
    db().investmentTransaction.findMany({ where: { userId } }), db().priceQuote.findMany({ where: { userId } }),
    db().marketPriceQuote.findMany({ where: { userId } }),
  ], { isolationLevel: "RepeatableRead" });
  const transactions = rows.map(transactionInput), quotes = [...prices.map(quoteInput), ...market.map(marketQuoteInput)];
  const holdings = holdingsValue(instruments, transactions, quotes, today);
  const realised = instruments.flatMap((instrument) => position(transactions.filter((row) => row.instrumentId === instrument.id), today).realised);
  const byYear = new Map<number, bigint>();
  for (const row of realised) byYear.set(row.year, (byYear.get(row.year) ?? 0n) + row.gainCents);
  return { today, holdings, allocation: allocation(holdings),
    valueCents: toSafeCents(holdings.reduce((sum, row) => sum + BigInt(row.valueCents), 0n)),
    gainCents: toSafeCents(holdings.reduce((sum, row) => sum + BigInt(row.gainCents), 0n)),
    income: income(transactions, { from: `${today.slice(0, 4)}-01-01`, to: today }),
    realisedByYear: [...byYear].sort(([a], [b]) => b - a).map(([year, gain]) => ({ year, gainCents: toSafeCents(gain) })),
    tax: indicativeTax(realised, instruments),
    series: Array.from({ length: 12 }, (_, index) => {
      const month = addMonths(monthOf(today), index - 11);
      const asOf = index === 11 ? today : addDays(monthStart(addMonths(month, 1)), -1);
      return { month, valueCents: toSafeCents(holdingsValue(instruments, transactions, quotes, asOf).reduce((sum, row) => sum + BigInt(row.valueCents), 0n)) };
    }),
    trend: trend ? buildTrend(today, transactions.reduce<string | null>((first, row) => row.voidedAt || (first && first <= row.tradeDate) ? first : row.tradeDate, null),
      (dates) => portfolioTrend(instruments, transactions, quotes, dates)) : undefined,
  };
}
export type PortfolioData = Awaited<ReturnType<typeof getPortfolio>>;
