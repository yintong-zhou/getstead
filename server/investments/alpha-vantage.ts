// Alpha Vantage market data: symbol search, closing price and EUR conversion, behind a shared Postgres cache.
//
// Rules this module enforces (all deterministic, none left to the caller):
// - Cache 12 h per key. A failed attempt is cached too and keeps the last valid payload.
// - At most 25 provider attempts per rolling 24 h across all keys (search, quote, FX), failures included.
//   A provider throttling answer starts a global cooldown.
// - The reservation (cache + budget + cooldown + attempt record) is one short transaction under a global
//   advisory lock. The provider is never called while that transaction is open.
// - GLOBAL_QUOTE (no entitlement) is updated at the end of the session, so today's quote is accepted; only
//   a date that is in the future everywhere (beyond UTC+14) is refused. FX closes are dated on or before the
//   quote day and strictly before today (UTC): today's FX candle is still forming.
// - Only certain currencies, and no UK listings: pence-versus-pounds ambiguity is not worth the risk.
// Nothing here logs; the API key only ever appears in the request URL. Every failure degrades to
// [] or null, so a caller never has to handle a provider error.
import { randomUUID } from "node:crypto";
import { Decimal } from "@prisma/client/runtime/client";
import { db } from "../auth/database.ts";
import { addDays, parseIsoDate } from "../cash-flow/dates.ts";
import { decimalInput } from "./calc.ts";

export type MarketListing = { symbol: string; name: string; market: string; currency: string };
/** unitPrice is in EUR (8 decimals); `currency` is the listing currency, fxRate its EUR value (null for EUR). */
export type MarketQuote = { asOf: string; unitPrice: string; currency: string; fxRate: string | null; fxAsOf: string | null };

const ExactDecimal = Decimal.clone({ precision: 60, rounding: Decimal.ROUND_HALF_UP });
const HOUR = 3_600_000;
const TTL_MS = 12 * HOUR;
const WINDOW_MS = 24 * HOUR;
const MAX_ATTEMPTS = 25;
const COOLDOWN_MS = 15 * 60_000;
const KEEP_REQUESTS_MS = 48 * HOUR;
const MAX_FX_GAP_DAYS = 7;
const MAX_RESULTS = 10;
const ENDPOINT = "https://www.alphavantage.co/query";
// Listing currencies with a plain ISO unit. GBP/GBX and other subunit-quoted markets stay out.
const CURRENCIES = new Set(["EUR", "USD", "CHF", "CAD", "AUD", "JPY", "SEK", "NOK", "DKK"]);
const TYPES = new Set(["Equity", "ETF", "Fund", "Mutual Fund"]);

export type MarketTx = {
  cache(key: string): Promise<{ attemptedAt: Date; payload: unknown } | null>;
  requestsSince(since: Date): Promise<number>;
  throttledSince(since: Date): Promise<boolean>;
  addRequest(id: string, at: Date): Promise<void>;
  /** Upsert the attempt time and keep any existing payload. */
  markAttempt(key: string, at: Date): Promise<void>;
  prune(before: Date): Promise<void>;
};
export type MarketStore = {
  /** One short transaction under the global advisory lock. */
  locked<T>(work: (tx: MarketTx) => Promise<T>): Promise<T>;
  /** Writes the payload only if the row still carries this attempt's timestamp. */
  save(key: string, token: Date, payload: unknown): Promise<void>;
  throttle(requestId: string): Promise<void>;
};
type Deps = { store: MarketStore; fetch: typeof globalThis.fetch; apiKey?: string };

type Reservation =
  | { kind: "fresh"; payload: unknown }
  | { kind: "blocked" }
  | { kind: "reserved"; requestId: string; token: Date; stale: unknown };
type Kind<P> = { parse(json: unknown, now: Date): P | null; check(payload: unknown): P | null };

class Throttled extends Error {}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const today = (now: Date) => now.toISOString().slice(0, 10);
// The calendar date in the furthest-ahead time zone (UTC+14): no real trading day is later than this.
const latestPossibleDay = (now: Date) => new Date(now.getTime() + 14 * HOUR).toISOString().slice(0, 10);

/** Positive decimal that fits fx_rate/unit_price columns; returns it without trailing zeros. */
function positive(value: unknown): string {
  if (typeof value !== "string" || !/^\d{1,16}(\.\d{1,12})?$/.test(value.trim())) throw new Error("number");
  const number = new ExactDecimal(value.trim());
  if (!number.gt(0)) throw new Error("number");
  return number.toFixed();
}
function day(value: unknown): string {
  const date = parseIsoDate(value);
  if (!date || date < "2000-01-01" || date > "2100-12-31") throw new Error("date");
  return date;
}

// Listings -----------------------------------------------------------------------------------------

function listingOk(symbol: unknown, currency: unknown, market: unknown): symbol is string {
  return typeof symbol === "string" && /^[A-Za-z0-9][A-Za-z0-9.\-]{0,23}$/.test(symbol)
    && typeof currency === "string" && CURRENCIES.has(currency)
    && !/.LON$/i.test(symbol) // London suffix: never rely on the market text alone for the UK rule
    && typeof market === "string" && market.trim() !== "" && market.trim().toLowerCase() !== "united kingdom";
}
const clean = (value: unknown, max: number) => typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";

function checkListings(payload: unknown): MarketListing[] | null {
  if (!Array.isArray(payload)) return null;
  const rows: MarketListing[] = [];
  for (const row of payload) {
    if (!isRecord(row) || !listingOk(row.symbol, row.currency, row.market)) return null;
    rows.push({ symbol: row.symbol, name: clean(row.name, 120), market: clean(row.market, 60), currency: row.currency as string });
  }
  return rows;
}
const searchKind: Kind<MarketListing[]> = {
  check: checkListings,
  parse(json) {
    const matches = isRecord(json) ? json.bestMatches : null;
    if (!Array.isArray(matches)) throw new Error("shape");
    const seen = new Set<string>();
    const rows: MarketListing[] = [];
    for (const match of matches) {
      if (!isRecord(match)) continue;
      const symbol = clean(match["1. symbol"], 24).toUpperCase();
      const name = clean(match["2. name"], 120);
      const market = clean(match["4. region"], 60);
      const currency = clean(match["8. currency"], 8);
      if (!TYPES.has(clean(match["3. type"], 20)) || !name || !listingOk(symbol, currency, market) || seen.has(symbol)) continue;
      seen.add(symbol);
      rows.push({ symbol, name, market, currency });
    }
    return rows.slice(0, MAX_RESULTS);
  },
};

// Quotes and FX ------------------------------------------------------------------------------------

type Close = { asOf: string; price: string };
const quoteKind = (symbol: string): Kind<Close> => ({
  check: (payload) => isRecord(payload) && typeof payload.asOf === "string" && typeof payload.price === "string"
    ? { asOf: payload.asOf, price: payload.price } : null,
  parse(json, now) {
    const quote = isRecord(json) ? json["Global Quote"] : null;
    if (!isRecord(quote) || String(quote["01. symbol"]).toUpperCase() !== symbol) throw new Error("shape");
    const asOf = day(quote["07. latest trading day"]);
    const price = positive(quote["05. price"]);
    return asOf <= latestPossibleDay(now) ? { asOf, price } : null;
  },
});

type FxRow = [date: string, rate: string];
const fxKind: Kind<FxRow[]> = {
  check: (payload) => Array.isArray(payload) && payload.every((row) => Array.isArray(row) && typeof row[0] === "string" && typeof row[1] === "string")
    ? (payload as FxRow[]) : null,
  parse(json, now) {
    const series = isRecord(json) ? json["Time Series FX (Daily)"] : null;
    if (!isRecord(series)) throw new Error("shape");
    const rows: FxRow[] = [];
    for (const [date, entry] of Object.entries(series)) {
      // Today's candle is still forming; it must not be cached and reused on a later day.
      if (!isRecord(entry) || !parseIsoDate(date) || date >= today(now)) continue;
      try { rows.push([date, positive(entry["4. close"])]); } catch { /* skip an unusable day */ }
    }
    if (!rows.length) throw new Error("empty");
    return rows.sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 100);
  },
};

function convert(close: Close, currency: string, fx: FxRow | null): MarketQuote | null {
  try {
    const unitPrice = decimalInput(new ExactDecimal(close.price).times(fx?.[1] ?? "1").toDecimalPlaces(8).toFixed(), 8, "unitPrice");
    return { asOf: close.asOf, unitPrice, currency, fxRate: fx?.[1] ?? null, fxAsOf: fx?.[0] ?? null };
  } catch {
    return null; // zero after rounding or out of column range
  }
}

// Shared mechanics ---------------------------------------------------------------------------------

export function createMarketData(deps: Deps) {
  const { store } = deps;

  async function reserve(key: string, now: Date): Promise<Reservation> {
    return store.locked<Reservation>(async (tx) => {
      const row = await tx.cache(key);
      if (row && row.attemptedAt.getTime() > now.getTime() - TTL_MS) return { kind: "fresh", payload: row.payload };
      if (await tx.throttledSince(new Date(now.getTime() - COOLDOWN_MS))) return { kind: "blocked" };
      if (await tx.requestsSince(new Date(now.getTime() - WINDOW_MS)) >= MAX_ATTEMPTS) return { kind: "blocked" };
      const requestId = randomUUID();
      await tx.prune(new Date(now.getTime() - KEEP_REQUESTS_MS));
      await tx.addRequest(requestId, now);
      await tx.markAttempt(key, now);
      return { kind: "reserved", requestId, token: now, stale: row?.payload ?? null };
    });
  }

  async function request(params: Record<string, string>): Promise<unknown> {
    const url = new URL(ENDPOINT);
    for (const [name, value] of Object.entries({ ...params, apikey: deps.apiKey ?? "" })) url.searchParams.set(name, value);
    const response = await deps.fetch(url.toString(), { signal: AbortSignal.timeout(8_000), redirect: "error", headers: { accept: "application/json" } });
    if (response.status === 429) throw new Throttled();
    if (!response.ok) throw new Error("http");
    const json: unknown = await response.json();
    // Alpha Vantage answers rate limits and plan limits with HTTP 200 and a Note/Information text.
    if (isRecord(json) && ("Note" in json || "Information" in json)) throw new Throttled();
    return json;
  }

  /** Cached provider call. Never throws; null means "nothing usable". */
  async function cached<P>(key: string, now: Date, params: Record<string, string>, kind: Kind<P>): Promise<P | null> {
    let reservation: Reservation;
    try { reservation = await reserve(key, now); } catch { return null; }
    if (reservation.kind === "fresh") return kind.check(reservation.payload);
    if (reservation.kind === "blocked") return null;
    let payload: P | null = null;
    let throttled = false;
    try { payload = kind.parse(await request(params), now); } catch (error) { throttled = error instanceof Throttled; }
    try {
      if (throttled) await store.throttle(reservation.requestId);
      if (payload !== null) await store.save(key, reservation.token, payload);
    } catch { /* the attempt is already recorded; the next call after the TTL retries */ }
    return payload ?? kind.check(reservation.stale);
  }

  const marketDataEnabled = () => Boolean(deps.apiKey);

  async function searchMarket(query: string, now = new Date()): Promise<MarketListing[]> {
    const text = typeof query === "string" ? query.trim() : "";
    if (!marketDataEnabled() || !/^[\p{L}\p{N} .,&'+-]{1,64}$/u.test(text)) return [];
    const keywords = text.replace(/ +/g, " ");
    return await cached(`search:${keywords.toLowerCase()}`, now, { function: "SYMBOL_SEARCH", keywords }, searchKind) ?? [];
  }

  async function marketQuote(listing: MarketListing, now = new Date()): Promise<MarketQuote | null> {
    if (!marketDataEnabled() || !isRecord(listing) || !listingOk(listing.symbol, listing.currency, listing.market)) return null;
    const symbol = listing.symbol.toUpperCase();
    const close = await cached(`quote:${symbol}`, now, { function: "GLOBAL_QUOTE", symbol }, quoteKind(symbol));
    if (!close) return null;
    if (listing.currency === "EUR") return convert(close, "EUR", null);
    const series = await cached(`fx:${listing.currency}`, now, { function: "FX_DAILY", from_symbol: listing.currency, to_symbol: "EUR" }, fxKind);
    // Latest close on or before the quote day and before today (UTC), not older than a week.
    const limit = [close.asOf, addDays(today(now), -1)].sort()[0];
    const fx = series?.filter(([date]) => date <= limit && date >= addDays(close.asOf, -MAX_FX_GAP_DAYS))
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))[0];
    return fx ? convert(close, listing.currency, fx) : null;
  }

  return { marketDataEnabled, searchMarket, marketQuote };
}

// Postgres store ----------------------------------------------------------------------------------

const iso = (date: Date) => date.toISOString();

function postgresStore(): MarketStore {
  return {
    locked: (work) => db().$transaction(async (client) => {
      // Same pattern as the other advisory locks: SELECT 1 FROM the function (a void result cannot be deserialized).
      await client.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended('stead:market-data', 4))`;
      return work({
        async cache(key) {
          const rows = await client.$queryRaw<{ attempted_at: Date; payload: unknown }[]>`
            SELECT attempted_at, payload FROM stead_market_cache WHERE cache_key = ${key}`;
          return rows[0] ? { attemptedAt: new Date(rows[0].attempted_at), payload: rows[0].payload } : null;
        },
        async requestsSince(since) {
          const rows = await client.$queryRaw<{ n: number }[]>`
            SELECT count(*)::int AS n FROM stead_market_requests WHERE attempted_at > ${iso(since)}::timestamptz`;
          return rows[0]?.n ?? 0;
        },
        async throttledSince(since) {
          const rows = await client.$queryRaw<{ hit: number }[]>`
            SELECT 1 AS hit FROM stead_market_requests WHERE throttled AND attempted_at > ${iso(since)}::timestamptz LIMIT 1`;
          return rows.length > 0;
        },
        async addRequest(id, at) {
          await client.$executeRaw`INSERT INTO stead_market_requests (id, attempted_at) VALUES (${id}::uuid, ${iso(at)}::timestamptz)`;
        },
        async markAttempt(key, at) {
          await client.$executeRaw`
            INSERT INTO stead_market_cache (cache_key, attempted_at) VALUES (${key}, ${iso(at)}::timestamptz)
            ON CONFLICT (cache_key) DO UPDATE SET attempted_at = EXCLUDED.attempted_at`;
        },
        async prune(before) {
          await client.$executeRaw`DELETE FROM stead_market_requests WHERE attempted_at < ${iso(before)}::timestamptz`;
        },
      });
    }, { maxWait: 5_000, timeout: 5_000 }),
    async save(key, token, payload) {
      await db().$executeRaw`
        UPDATE stead_market_cache SET payload = ${JSON.stringify(payload)}::jsonb
        WHERE cache_key = ${key} AND attempted_at = ${iso(token)}::timestamptz`;
    },
    async throttle(requestId) {
      await db().$executeRaw`UPDATE stead_market_requests SET throttled = true WHERE id = ${requestId}::uuid`;
    },
  };
}

// The key is read per call so a rotated or removed key takes effect without a restart.
const defaults = createMarketData({
  store: postgresStore(),
  fetch: (input, init) => globalThis.fetch(input, init),
  get apiKey() { return process.env.ALPHA_VANTAGE_SECRET?.trim() || undefined; },
});
export const { marketDataEnabled, searchMarket, marketQuote } = defaults;
