import { Decimal } from "@prisma/client/runtime/client";
import { ApiError } from "../cash-flow/errors.ts";

const ExactDecimal = Decimal.clone({ precision: 60, rounding: Decimal.ROUND_HALF_UP });
const MAX_HOLDING_CENTS = 1_000_000_000_000n;
const MAX_SAFE_CENTS = BigInt(Number.MAX_SAFE_INTEGER);

export const instrumentKinds = ["STOCK", "ETF", "FUND", "IT_GOV_BOND", "BOND", "CRYPTO", "OTHER"] as const;
export type InstrumentKind = (typeof instrumentKinds)[number];
export const transactionTypes = ["BUY", "SELL", "DIVIDEND", "COUPON"] as const;
export type TransactionType = (typeof transactionTypes)[number];

export type Instrument = {
  id: string;
  name: string;
  kind: InstrumentKind;
  symbol?: string | null;
  isin?: string | null;
};
export type Transaction = {
  id: string;
  accountId: string;
  instrumentId: string;
  type: TransactionType;
  tradeDate: string;
  ordinal: number;
  quantity: string | null;
  amountCents: bigint;
  feesCents: bigint;
  taxWithheldCents: bigint;
  voidedAt?: Date | null;
};
export type Quote = { instrumentId: string; asOf: string; unitPrice: string };
export type RealisedGain = { instrumentId: string; year: number; gainCents: bigint };
export type Position = { quantity: string; costCents: bigint; averageCost: string; realised: RealisedGain[] };
export type Holding = {
  instrumentId: string;
  name: string;
  kind: InstrumentKind;
  quantity: string;
  averageCost: string;
  unitPrice: string;
  valueCents: number;
  costCents: number;
  gainCents: number;
  noPrice: boolean;
};
export type IndicativeTax = {
  year: number;
  taxClass: "ITALIAN_GOV" | "OTHER";
  gainCents: number;
  lossCents: number;
  taxCents: number;
};

function valueOutOfRange(field?: string): ApiError {
  return new ApiError(422, "value_out_of_range", field);
}

/** Parse a positive quantity (scale 10) or EUR unit price (scale 8). */
export function decimalInput(value: unknown, scale: number, field: string): string {
  const integerLimit = scale === 10 ? 18 : scale === 8 ? 10 : 0;
  const match = typeof value === "string" ? /^(\d+)(?:\.(\d+))?$/.exec(value.trim()) : null;
  if (!match || !integerLimit) throw valueOutOfRange(field);
  const whole = match[1].replace(/^0+/, "");
  const fraction = match[2] ?? "";
  if (whole.length > integerLimit || fraction.length > scale) throw valueOutOfRange(field);

  const trimmedFraction = fraction.replace(/0+$/, "");
  if (!whole && !trimmedFraction) throw valueOutOfRange(field);
  return trimmedFraction ? (whole || "0") + "." + trimmedFraction : whole;
}

export function toSafeCents(value: bigint | Decimal): number {
  if (typeof value !== "bigint" && (!value.isInteger() || value.abs().gt(MAX_SAFE_CENTS.toString()))) {
    throw valueOutOfRange();
  }
  const cents = typeof value === "bigint" ? value : BigInt(value.toFixed());
  if (cents < -MAX_SAFE_CENTS || cents > MAX_SAFE_CENTS) throw valueOutOfRange();
  return Number(cents);
}

function holdingValueCents(quantity: Decimal, costCents: bigint, unitPrice?: Decimal): bigint {
  const cents = unitPrice ? quantity.times(unitPrice).times(100) : new ExactDecimal(costCents.toString());
  if (cents.gt(MAX_HOLDING_CENTS.toString())) throw valueOutOfRange();
  return BigInt(cents.toFixed(0));
}

export function valueInCents(quantity: string, unitPrice: string): bigint {
  return holdingValueCents(
    new ExactDecimal(decimalInput(quantity, 10, "quantity")),
    0n,
    new ExactDecimal(decimalInput(unitPrice, 8, "unitPrice")),
  );
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

type ReplayStep = { tradeDate: string; quantity: Decimal; costCents: bigint; realised?: RealisedGain };

function* replay(transactions: readonly Transaction[], asOf?: string): Generator<ReplayStep> {
  const trades = transactions
    .filter((row) => !row.voidedAt && (!asOf || row.tradeDate <= asOf) && (row.type === "BUY" || row.type === "SELL"))
    .sort((left, right) => compareText(left.tradeDate, right.tradeDate) || left.ordinal - right.ordinal || compareText(left.id, right.id));
  let quantity = new ExactDecimal("0");
  let costCents = 0n;
  for (const trade of trades) {
    const units = new ExactDecimal(decimalInput(trade.quantity, 10, "quantity"));
    let realised: RealisedGain | undefined;
    if (trade.type === "BUY") {
      quantity = quantity.plus(units);
      costCents += trade.amountCents + trade.feesCents;
    } else {
      if (units.gt(quantity)) throw new ApiError(422, "negative_position");
      const removed = BigInt(new ExactDecimal(costCents.toString()).times(units).div(quantity).toFixed(0));
      quantity = quantity.minus(units);
      costCents -= removed;
      realised = {
        instrumentId: trade.instrumentId,
        year: Number(trade.tradeDate.slice(0, 4)),
        gainCents: trade.amountCents - trade.feesCents - removed,
      };
    }
    yield { tradeDate: trade.tradeDate, quantity, costCents, realised };
  }
}

/** Replay one instrument through asOf, across all its accounts. */
export function position(transactions: readonly Transaction[], asOf: string): Position {
  let quantity = new ExactDecimal("0");
  let costCents = 0n;
  const realised: RealisedGain[] = [];
  for (const step of replay(transactions, asOf)) {
    ({ quantity, costCents } = step);
    if (step.realised) realised.push(step.realised);
  }
  const averageCost = quantity.isZero() ? "0" : new ExactDecimal(costCents.toString()).div(100).div(quantity).toFixed();
  return { quantity: quantity.toFixed(), costCents, averageCost, realised };
}

/** Check one instrument's trade history and each dated quote that applies to it. */
export function validateHistory(transactions: readonly Transaction[], quotes: readonly Quote[]): void {
  const orderedQuotes = [...quotes].sort((left, right) => compareText(left.asOf, right.asOf));
  let quoteIndex = 0;
  let unitPrice: Decimal | undefined;
  let previous: ReplayStep | undefined;
  function applyQuotes(through?: string) {
    while (quoteIndex < orderedQuotes.length && (!through || orderedQuotes[quoteIndex].asOf <= through)) {
      const quote = orderedQuotes[quoteIndex++];
      unitPrice = new ExactDecimal(decimalInput(quote.unitPrice, 8, "unitPrice"));
      // A quote dated on the trade day values the position after that day's trade.
      if (previous && quote.asOf !== through) holdingValueCents(previous.quantity, previous.costCents, unitPrice);
    }
  }
  for (const step of replay(transactions)) {
    applyQuotes(step.tradeDate);
    holdingValueCents(step.quantity, step.costCents, unitPrice);
    previous = step;
  }
  applyQuotes();
}

export function holdingsValue(
  instruments: readonly Instrument[], transactions: readonly Transaction[], quotes: readonly Quote[], asOf: string,
): Holding[] {
  const transactionsByInstrument = new Map<string, Transaction[]>();
  for (const transaction of transactions) {
    const rows = transactionsByInstrument.get(transaction.instrumentId);
    if (rows) rows.push(transaction);
    else transactionsByInstrument.set(transaction.instrumentId, [transaction]);
  }

  const latest = new Map<string, Quote>();
  for (const quote of quotes) {
    const previous = latest.get(quote.instrumentId);
    if (quote.asOf <= asOf && (!previous || previous.asOf < quote.asOf)) latest.set(quote.instrumentId, quote);
  }

  const holdings: Holding[] = [];
  for (const instrument of instruments) {
    const transactions = transactionsByInstrument.get(instrument.id);
    if (!transactions) continue;
    const { quantity, costCents, averageCost } = position(transactions, asOf);
    if (quantity === "0") continue;
    const quote = latest.get(instrument.id);
    const unitPrice = quote ? decimalInput(quote.unitPrice, 8, "unitPrice") : averageCost;
    // Aggregate units may exceed the precision of a single transaction's quantity column.
    const valueCents = holdingValueCents(new ExactDecimal(quantity), costCents, quote ? new ExactDecimal(unitPrice) : undefined);
    holdings.push({
      instrumentId: instrument.id, name: instrument.name, kind: instrument.kind, quantity, averageCost, unitPrice,
      valueCents: toSafeCents(valueCents), costCents: toSafeCents(costCents),
      gainCents: toSafeCents(valueCents - costCents), noPrice: !quote,
    });
  }
  return holdings;
}

export function allocation(holdings: readonly Holding[]): { kind: InstrumentKind; valueCents: number; share: string }[] {
  const byKind = new Map<InstrumentKind, bigint>();
  let total = 0n;
  for (const { kind, valueCents } of holdings) {
    const cents = BigInt(valueCents);
    total += cents;
    byKind.set(kind, (byKind.get(kind) ?? 0n) + cents);
  }
  const result = [];
  for (const kind of instrumentKinds) {
    const value = byKind.get(kind);
    if (value === undefined) continue;
    result.push({
      kind, valueCents: toSafeCents(value),
      share: total === 0n ? "0" : new ExactDecimal(value.toString()).div(total.toString()).toFixed(),
    });
  }
  return result;
}

export function cashEffects(transactions: readonly Transaction[]): { accountId: string; bookingDate: string; amountCents: number; voidedAt?: Date | null }[] {
  return transactions.filter((row) => !row.voidedAt).map((row) => {
    let amountCents = row.amountCents - row.taxWithheldCents;
    if (row.type === "BUY") amountCents = -(row.amountCents + row.feesCents);
    if (row.type === "SELL") amountCents -= row.feesCents;
    return { accountId: row.accountId, bookingDate: row.tradeDate, amountCents: toSafeCents(amountCents) };
  });
}

export function income(transactions: readonly Transaction[], { from, to }: { from: string; to: string }) {
  let gross = 0n;
  let net = 0n;
  for (const row of transactions) {
    if (row.voidedAt || row.tradeDate < from || row.tradeDate > to || (row.type !== "DIVIDEND" && row.type !== "COUPON")) continue;
    gross += row.amountCents;
    net += row.amountCents - row.taxWithheldCents;
  }
  return { grossCents: toSafeCents(gross), netCents: toSafeCents(net) };
}

export function indicativeTax(realised: readonly RealisedGain[], instruments: readonly Instrument[]): IndicativeTax[] {
  const kinds = new Map(instruments.map(({ id, kind }) => [id, kind]));
  const totals = new Map<string, { year: number; taxClass: IndicativeTax["taxClass"]; gain: bigint; loss: bigint }>();
  for (const entry of realised) {
    const taxClass = kinds.get(entry.instrumentId) === "IT_GOV_BOND" ? "ITALIAN_GOV" : "OTHER";
    const key = entry.year + "-" + taxClass;
    const total = totals.get(key) ?? { year: entry.year, taxClass, gain: 0n, loss: 0n };
    if (entry.gainCents >= 0n) total.gain += entry.gainCents;
    else total.loss -= entry.gainCents;
    totals.set(key, total);
  }
  return Array.from(totals.values())
    .sort((left, right) => left.year - right.year || compareText(left.taxClass, right.taxClass))
    .map(({ year, taxClass, gain, loss }) => {
      const net = gain - loss;
      const rate = taxClass === "ITALIAN_GOV" ? "0.125" : "0.26";
      const tax = net > 0n ? BigInt(new ExactDecimal(net.toString()).times(rate).toFixed(0)) : 0n;
      return { year, taxClass, gainCents: toSafeCents(gain), lossCents: toSafeCents(loss), taxCents: toSafeCents(tax) };
    });
}
