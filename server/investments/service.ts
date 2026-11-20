// All writes serialize per user for quotas, then lock accounts before sorted instruments.
// The extra user lock also protects instruments shared across different brokerage accounts.
import type { Prisma, Instrument, InvestmentTransaction, PriceQuote } from "../../db/generated/client.ts";
import { db } from "../auth/database.ts";
import { addDays, addMonths, fromDate, monthOf, monthStart, romeToday, toDate } from "../cash-flow/dates.ts";
import { ApiError, conflict, notFound } from "../cash-flow/errors.ts";
import { Reader } from "../cash-flow/validate.ts";
import { allocation, decimalInput, holdingsValue, income, indicativeTax, instrumentKinds, position, toSafeCents, transactionTypes, validateHistory } from "./calc.ts";

type Client = Prisma.TransactionClient;
const MAX_TRANSACTION_CENTS = 100_000_000_000;
const MAX_INSTRUMENTS = 1_000;
const MAX_TRANSACTIONS = 10_000;

export function transactionInput(row: InvestmentTransaction) {
  return { ...row, tradeDate: fromDate(row.tradeDate), quantity: row.quantity?.toFixed() ?? null };
}
function quoteDto(row: PriceQuote) {
  return { id: row.id, instrumentId: row.instrumentId, asOf: fromDate(row.asOf), unitPrice: row.unitPrice.toFixed() };
}
export function quoteInput(row: PriceQuote) {
  return { ...row, asOf: fromDate(row.asOf), unitPrice: row.unitPrice.toFixed() };
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
async function audit(client: Client, userId: string, ids: string[]) {
  for (const instrumentId of new Set(ids)) {
    const rows = await client.investmentTransaction.findMany({ where: { userId, instrumentId } });
    const quotes = await client.priceQuote.findMany({ where: { userId, instrumentId } });
    validateHistory(rows.map(transactionInput), quotes.map(quoteInput));
  }
}
function write<T>(userId: string, operation: (client: Client) => Promise<T>) {
  return db().$transaction(async (client) => { await userLock(client, userId); return operation(client); }, { timeout: 30_000 });
}

function instrumentDto({ id, name, symbol, isin, kind, archivedAt }: Instrument) {
  return { id, name, symbol, isin, kind, archived: archivedAt !== null };
}
export async function listInstruments(userId: string) {
  const rows = await db().instrument.findMany({ where: { userId }, orderBy: [{ name: "asc" }, { id: "asc" }] });
  return rows.map(instrumentDto);
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
export async function createInstrument(userId: string, input: Record<string, unknown>) {
  const data = instrumentData(input);
  return write(userId, async (client) => {
    if (await client.instrument.count({ where: { userId } }) >= MAX_INSTRUMENTS) throw new ApiError(422, "instrument_limit");
    return instrumentDto(await client.instrument.create({ data: { ...data, userId, name: data.name!, kind: data.kind! } }));
  });
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

export async function getPortfolio(userId: string, now = new Date()) {
  const today = romeToday(now);
  const [instruments, rows, prices] = await db().$transaction([
    db().instrument.findMany({ where: { userId }, orderBy: [{ name: "asc" }, { id: "asc" }] }),
    db().investmentTransaction.findMany({ where: { userId } }), db().priceQuote.findMany({ where: { userId } }),
  ], { isolationLevel: "RepeatableRead" });
  const transactions = rows.map(transactionInput), quotes = prices.map(quoteInput);
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
  };
}
export type PortfolioData = Awaited<ReturnType<typeof getPortfolio>>;
