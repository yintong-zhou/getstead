// Yahoo Finance listings and daily closes behind a shared PostgreSQL cache.
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { Decimal } from "@prisma/client/runtime/client";
import { recordEvent } from "../admin/logs.ts";
import { db } from "../auth/database.ts";
import { addDays, parseIsoDate } from "../cash-flow/dates.ts";
import { decimalInput } from "./calc.ts";

export type MarketListing = { symbol: string; name: string; market: string; currency: string };
/** unitPrice is in EUR (8 decimals); `currency` is the listing currency, fxRate its EUR value (null for EUR). */
export type MarketQuote = { asOf: string; unitPrice: string; currency: string; fxRate: string | null; fxAsOf: string | null };

const ExactDecimal = Decimal.clone({ precision: 60, rounding: Decimal.ROUND_HALF_UP });
const HOUR = 3_600_000;
const TTL_MS = 12 * HOUR;
const PRICE_TTL_MS = 4 * HOUR;
const EMPTY_TTL_MS = 30 * 60_000;
const WINDOW_MS = 24 * HOUR;
const MAX_ATTEMPTS = 25;
const COOLDOWN_MS = 15 * 60_000;
const KEEP_REQUESTS_MS = 48 * HOUR;
const MAX_FX_GAP_DAYS = 7;
const SYMBOL = /^[A-Z0-9][A-Z0-9.-]{0,23}$/;
const CURRENCY = /^[A-Z]{3}$/;

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
type Operation = "search" | "quote" | "fx" | "benchmarks";
type Deps = { store: MarketStore; enabled: () => boolean; request: (operation: Operation, value: string) => Promise<unknown> };

type Reservation =
  | { kind: "fresh"; payload: unknown }
  | { kind: "blocked" }
  | { kind: "reserved"; requestId: string; token: Date; stale: unknown };
type Parse<P> = (payload: unknown) => P | null;
export class MarketRateLimit extends Error {}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const today = (now: Date) => now.toISOString().slice(0, 10);
// The calendar date in the furthest-ahead time zone (UTC+14): no real trading day is later than this.
const latestPossibleDay = (now: Date) => new Date(now.getTime() + 14 * HOUR).toISOString().slice(0, 10);

/** Positive decimal that fits fx_rate/unit_price columns; returns it without trailing zeros. */
function positive(value: unknown, scale = 18): string | null {
  if (typeof value !== "string" || !/^\d{1,16}(\.\d{1,30})?$/.test(value)) return null;
  const number = new ExactDecimal(value).toDecimalPlaces(scale);
  return number.gt(0) ? number.toFixed() : null;
}
function day(value: unknown): string | null {
  const date = parseIsoDate(value);
  return date && date >= "2000-01-01" && date <= "2100-12-31" ? date : null;
}

// Saved listings use exchange-qualified symbols. Translate known venue suffixes when reading.
const yahooSuffixes: Record<string, string> = { PAR: "PA", DEX: "DE", LON: "L", MIL: "MI", TRT: "TO", SHZ: "SZ", SHH: "SS", BSE: "BO" };

export function marketTicker(symbol: string) {
  return symbol.toUpperCase().replace(/\.([A-Z]+)$/, (suffix, venue: string) =>
    Object.hasOwn(yahooSuffixes, venue) ? "." + yahooSuffixes[venue] : suffix);
}

function checkListings(payload: unknown): MarketListing[] | null {
  if (!Array.isArray(payload)) return null;
  return payload.filter((row): row is MarketListing =>
    isRecord(row) && typeof row.symbol === "string" && SYMBOL.test(row.symbol) &&
    typeof row.name === "string" && row.name.length > 0 && typeof row.market === "string" && row.market.length > 0 &&
    typeof row.currency === "string" && CURRENCY.test(row.currency))
    .map(({ symbol, name, market, currency }) => ({ symbol, name: name.slice(0, 120), market: market.slice(0, 60), currency }));
}

type Close = { asOf: string; price: string; currency: string; previous?: { asOf: string; price: string }; history?: { asOf: string; price: string }[] };
function checkClose(payload: unknown, now: Date): Close | null {
  if (!isRecord(payload) || typeof payload.currency !== "string" || !CURRENCY.test(payload.currency)) return null;
  const asOf = day(payload.asOf), price = positive(payload.price);
  if (!asOf || asOf > latestPossibleDay(now) || !price) return null;
  // Payloads cached before the adapter sent the previous close have none.
  const storedPrevious = isRecord(payload.previous) ? payload.previous : {};
  const previousAsOf = day(payload.previousAsOf ?? storedPrevious.asOf), previousPrice = positive(payload.previousPrice ?? storedPrevious.price);
  const previous = previousAsOf && previousAsOf < asOf && previousPrice ? { asOf: previousAsOf, price: previousPrice } : undefined;
  const history = Array.isArray(payload.history) ? payload.history.flatMap((row) => {
    const date = day(Array.isArray(row) ? row[0] : isRecord(row) ? row.asOf : null);
    const price = positive(Array.isArray(row) ? row[1] : isRecord(row) ? row.price : null);
    return date && date <= asOf && price ? [{ asOf: date, price }] : [];
  }) : undefined;
  return { asOf, price, currency: payload.currency, previous, history };
}

/** Index points of a benchmark: latest close, the close before it, and the last close of the previous year. */
export type Benchmark = { asOf: string; close: string; previousClose: string; yearStartClose: string | null };
export type Benchmarks = { sp500: Benchmark | null; vix: Benchmark | null };
function checkBenchmark(payload: unknown): Benchmark | null {
  if (!isRecord(payload)) return null;
  const asOf = day(payload.asOf), close = positive(payload.close), previousClose = positive(payload.previousClose);
  return asOf && close && previousClose ? { asOf, close, previousClose, yearStartClose: positive(payload.yearStartClose) } : null;
}
function checkBenchmarks(payload: unknown): Benchmarks | null {
  if (!isRecord(payload)) return null;
  const result = { sp500: checkBenchmark(payload.sp500), vix: checkBenchmark(payload.vix) };
  return result.sp500 || result.vix ? result : null;
}
const BENCHMARKS_KEY = "yahoo:benchmarks:";

type FxRow = [date: string, rate: string];
function checkFx(payload: unknown): FxRow[] | null {
  if (!Array.isArray(payload)) return null;
  const rates: FxRow[] = [];
  for (const row of payload) {
    if (!Array.isArray(row)) continue;
    const asOf = day(row[0]), rate = positive(row[1], 12);
    if (asOf && rate) rates.push([asOf, rate]);
  }
  return rates.length ? rates.sort(([a], [b]) => b.localeCompare(a)) : null;
}

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

  async function reserve(key: string, now: Date, operation: Operation): Promise<Reservation> {
    return store.locked<Reservation>(async (tx) => {
      const row = await tx.cache(key);
      // An instrument can open trading before it has a first daily close.
      const ttl = row?.payload == null ? EMPTY_TTL_MS : operation === "search" ? TTL_MS : PRICE_TTL_MS;
      if (row && row.attemptedAt.getTime() > now.getTime() - ttl) return { kind: "fresh", payload: row.payload };
      if (await tx.throttledSince(new Date(now.getTime() - COOLDOWN_MS))) return { kind: "blocked" };
      if (await tx.requestsSince(new Date(now.getTime() - WINDOW_MS)) >= MAX_ATTEMPTS) return { kind: "blocked" };
      const requestId = randomUUID();
      await tx.prune(new Date(now.getTime() - KEEP_REQUESTS_MS));
      await tx.addRequest(requestId, now);
      await tx.markAttempt(key, now);
      return { kind: "reserved", requestId, token: now, stale: row?.payload ?? null };
    });
  }

  async function cached<P>(operation: Operation, value: string, now: Date, parse: Parse<P>): Promise<P | null> {
    const key = `yahoo:${operation}:${operation === "search" ? value.toLowerCase() : value}`;
    let reservation: Reservation;
    try { reservation = await reserve(key, now, operation); } catch { return null; }
    if (reservation.kind === "fresh") return parse(reservation.payload);
    if (reservation.kind === "blocked") return null;
    let payload: P | null = null;
    let throttled = false;
    try { payload = parse(await deps.request(operation, value)); } catch (error) { throttled = error instanceof MarketRateLimit; }
    try {
      if (throttled) await store.throttle(reservation.requestId);
      if (payload !== null) await store.save(key, reservation.token, payload);
    } catch { /* The reservation still prevents a repeated request. */ }
    return payload ?? parse(reservation.stale);
  }

  const marketDataEnabled = deps.enabled;

  async function searchMarket(query: string, now = new Date()): Promise<MarketListing[] | null> {
    const text = query.trim();
    if (!marketDataEnabled() || !/^[\p{L}\p{N} .,&'+-]{1,64}$/u.test(text)) return null;
    return cached("search", text.replace(/ +/g, " "), now, checkListings);
  }

  /** Completed closes in EUR, converted with the historical FX close for each date. */
  async function marketQuote(listing: MarketListing, now = new Date()): Promise<(MarketQuote & { previous?: MarketQuote | null; history?: MarketQuote[] }) | null> {
    const symbol = marketTicker(listing.symbol);
    if (!marketDataEnabled() || !SYMBOL.test(symbol) || !CURRENCY.test(listing.currency)) return null;
    const close = await cached("quote", symbol, now, (payload) => checkClose(payload, now));
    if (!close || close.currency !== listing.currency) return null;
    const series = listing.currency === "EUR" ? null : await cached("fx", listing.currency, now, checkFx);
    const convertClose = (row: { asOf: string; price: string } | undefined) => {
      if (!row) return null;
      // The series is descending; find the newest eligible FX close without scanning years of history.
      let left = 0, right = series?.length ?? 0;
      while (left < right) {
        const middle = Math.floor((left + right) / 2);
        if (series![middle][0] > row.asOf || series![middle][0] >= today(now)) left = middle + 1;
        else right = middle;
      }
      const rate = listing.currency === "EUR" ? null : series?.[left];
      if (listing.currency !== "EUR" && (!rate || rate[0] < addDays(row.asOf, -MAX_FX_GAP_DAYS))) return null;
      return convert({ ...row, currency: close.currency }, listing.currency, rate ?? null);
    };
    const latest = convertClose(close);
    if (!latest) return null;
    const previous = convertClose(close.previous);
    const history = close.history?.map(convertClose).filter((row): row is MarketQuote => row !== null);
    return { ...latest, previous, ...(history ? { history } : {}) };
  }

  /** Fetches the benchmarks when the shared cache is older than its TTL; at most one request per TTL for all users. */
  async function refreshBenchmarks(now = new Date()): Promise<Benchmarks | null> {
    return marketDataEnabled() ? cached("benchmarks", "", now, checkBenchmarks) : null;
  }

  return { marketDataEnabled, searchMarket, marketQuote, refreshBenchmarks };
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

const runPython = promisify(execFile);

async function requestMarket(operation: Operation, value: string): Promise<unknown> {
  const payload = JSON.stringify({ operation, value });
  if (!process.env.VERCEL) {
    const python = process.env.MARKET_DATA_PYTHON || (process.platform === "win32" ? "py" : "python3");
    const args = python === "py" ? ["-3"] : [];
    try {
      const { stdout } = await runPython(python, [...args, resolve("api/market_data.py"), payload], {
        timeout: 16_000, maxBuffer: 8_388_608, windowsHide: true,
      });
      return JSON.parse(stdout);
    } catch (error) {
      if ((error as { code?: unknown }).code === 75) throw new MarketRateLimit();
      throw new Error("Market data adapter failed");
    }
  }
  const origin = process.env.MARKET_DATA_BRIDGE_ORIGIN || `https://${process.env.VERCEL_URL}`;
  const url = new URL("/api/market_data", origin);
  if (url.protocol !== "https:") throw new Error("Market data adapter requires HTTPS");
  // Failures are logged as a code only (operation and HTTP status), so an admin can tell a wrong secret from a Yahoo block.
  const fail = async (code: string) => {
    await recordEvent({ kind: "ERROR", code: `market_bridge_${operation}_${code}`, route: "/api/market_data", method: "POST" }, 10 * 60_000);
    throw new Error("Market data adapter failed");
  };
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.MARKET_DATA_BRIDGE_SECRET}` },
      body: payload,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(16_000),
    });
  } catch {
    return fail("fetch");
  }
  if (response.status === 429) throw new MarketRateLimit();
  if (!response.ok) return fail(String(response.status));
  return response.json();
}

const defaults = createMarketData({
  store: postgresStore(),
  enabled: () => !process.env.VERCEL ||
    Boolean(process.env.MARKET_DATA_BRIDGE_SECRET && (process.env.MARKET_DATA_BRIDGE_ORIGIN || process.env.VERCEL_URL)),
  request: requestMarket,
});
export const { marketDataEnabled, searchMarket, marketQuote, refreshBenchmarks } = defaults;

/** The cached benchmarks of any age, without a network call, so a page render never waits on Yahoo. */
export async function readBenchmarks(): Promise<Benchmarks | null> {
  const rows = await db().$queryRaw<{ payload: unknown }[]>`SELECT payload FROM stead_market_cache WHERE cache_key = ${BENCHMARKS_KEY}`;
  return checkBenchmarks(rows[0]?.payload);
}
