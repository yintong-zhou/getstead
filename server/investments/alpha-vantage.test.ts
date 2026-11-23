// Synthetic payloads and a fake fetch: no network, no secret and no database. The in-memory store keeps
// the same contract as the Postgres one (global lock, cache rows, request rows, token-guarded save).
import { strict as assert } from "node:assert";
import { AsyncLocalStorage } from "node:async_hooks";
import { test } from "node:test";
import { createMarketData, type MarketStore, type MarketTx } from "./alpha-vantage.ts";

const T0 = new Date("2026-11-23T12:00:00.000Z");
const at = (ms: number) => new Date(T0.getTime() + ms);
const HOUR = 3_600_000;
const apple = { symbol: "AAPL", name: "Example Inc", market: "United States", currency: "USD" };
const euro = { symbol: "EXA.DEX", name: "Example AG", market: "XETRA", currency: "EUR" };

function memoryStore() {
  const cache = new Map<string, { attemptedAt: Date; payload: unknown }>();
  const requests: { id: string; at: Date; throttled: boolean }[] = [];
  const lock = new AsyncLocalStorage<boolean>(); // true only inside the caller's own lock transaction
  let chain: Promise<unknown> = Promise.resolve();
  const tx: MarketTx = {
    cache: async (key) => cache.get(key) ?? null,
    requestsSince: async (since) => requests.filter((row) => row.at > since).length,
    throttledSince: async (since) => requests.some((row) => row.throttled && row.at > since),
    addRequest: async (id, when) => { requests.push({ id, at: when, throttled: false }); },
    markAttempt: async (key, when) => { cache.set(key, { attemptedAt: when, payload: cache.get(key)?.payload ?? null }); },
    prune: async (before) => { for (let i = requests.length - 1; i >= 0; i--) if (requests[i].at < before) requests.splice(i, 1); },
  };
  const store: MarketStore = {
    locked: (work) => {
      const run = chain.then(() => lock.run(true, () => work(tx)));
      chain = run.catch(() => undefined);
      return run;
    },
    save: async (key, token, payload) => {
      const row = cache.get(key);
      if (row && row.attemptedAt.getTime() === token.getTime()) row.payload = payload;
    },
    throttle: async (id) => { const row = requests.find((entry) => entry.id === id); if (row) row.throttled = true; },
  };
  return { store, cache, requests, lock };
}

type Handler = (params: URLSearchParams) => unknown;
function market(handlers: Record<string, Handler>, apiKey: string | null = "test-key") {
  const memory = memoryStore();
  const calls: URL[] = [];
  const fetch = async (input: string | URL) => {
    const url = new URL(String(input));
    assert.equal(memory.lock.getStore(), undefined, "no fetch while the lock transaction is open");
    calls.push(url);
    const handler = handlers[url.searchParams.get("function") ?? ""];
    if (!handler) throw new Error("unexpected function");
    const body = handler(url.searchParams);
    if (body instanceof Response) return body;
    return Response.json(body);
  };
  return { ...memory, calls, handlers, api: createMarketData({ store: memory.store, fetch: fetch as typeof globalThis.fetch, apiKey: apiKey ?? undefined }) };
}

const quotePayload = (symbol: string, price: string, day: string) =>
  ({ "Global Quote": { "01. symbol": symbol, "05. price": price, "07. latest trading day": day } });
const fxPayload = (series: Record<string, string>) => ({
  "Meta Data": { "2. From Symbol": "USD" },
  "Time Series FX (Daily)": Object.fromEntries(Object.entries(series).map(([day, close]) => [day, { "1. open": close, "4. close": close }])),
});
const match = (symbol: string, over: Record<string, string> = {}) => ({
  "1. symbol": symbol, "2. name": "Example", "3. type": "Equity", "4. region": "United States",
  "8. currency": "USD", "9. matchScore": "1.0000", ...over,
});

test("marketDataEnabled follows the API key and never needs the database", () => {
  assert.equal(market({}, "k").api.marketDataEnabled(), true);
  assert.equal(market({}, "").api.marketDataEnabled(), false);
  assert.equal(market({}, null).api.marketDataEnabled(), false);
});

test("disabled provider never fetches or touches the store", async () => {
  const { api, calls, requests } = market({ SYMBOL_SEARCH: () => ({ bestMatches: [] }) }, "");
  assert.deepEqual(await api.searchMarket("apple", T0), []);
  assert.equal(await api.marketQuote(apple, T0), null);
  assert.equal(calls.length + requests.length, 0);
});

test("search keeps listed equities, ETFs and funds in supported currencies, never UK or subunit listings", async () => {
  const { api, calls } = market({
    SYMBOL_SEARCH: () => ({
      bestMatches: [
        match("AAPL"), match("AAPL"),
        match("EXA.DEX", { "4. region": "XETRA", "8. currency": "EUR", "2. name": "  Example   AG " }),
        match("VUSA.LON", { "4. region": "United Kingdom", "8. currency": "GBP" }),
        match("SHEL.LON", { "4. region": "United Kingdom", "8. currency": "USD" }),
        match("PENCE", { "8. currency": "GBX" }),
        match("FUNDX", { "3. type": "Mutual Fund" }),
        match("BONDX", { "3. type": "Bond" }),
        match("BAD SYMBOL!"),
        match("BRL1", { "8. currency": "BRL" }),
      ],
    }),
  });
  const listings = await api.searchMarket("  Example  ", T0);
  assert.deepEqual(listings, [
    { symbol: "AAPL", name: "Example", market: "United States", currency: "USD" },
    { symbol: "EXA.DEX", name: "Example AG", market: "XETRA", currency: "EUR" },
    { symbol: "FUNDX", name: "Example", market: "United States", currency: "USD" },
  ]);
  const url = calls[0];
  assert.equal(url.origin + url.pathname, "https://www.alphavantage.co/query");
  assert.equal(url.searchParams.get("keywords"), "Example");
  assert.equal(url.searchParams.get("apikey"), "test-key");
});

test("search rejects empty, oversized and control-character queries without a request", async () => {
  const { api, calls, requests } = market({ SYMBOL_SEARCH: () => ({ bestMatches: [] }) });
  for (const query of ["", "   ", "x".repeat(65), "a\nb", "a<b"]) assert.deepEqual(await api.searchMarket(query, T0), []);
  assert.equal(calls.length + requests.length, 0);
});

test("a cached search is reused for 12 hours, case and spacing insensitive, then refreshed", async () => {
  const { api, calls } = market({ SYMBOL_SEARCH: () => ({ bestMatches: [match("AAPL")] }) });
  await api.searchMarket("Apple Inc", T0);
  await api.searchMarket("apple   inc", at(12 * HOUR - 1));
  assert.equal(calls.length, 1);
  await api.searchMarket("apple inc", at(12 * HOUR));
  assert.equal(calls.length, 2);
});

test("concurrent identical calls make one request", async () => {
  const { api, calls } = market({ SYMBOL_SEARCH: () => ({ bestMatches: [match("AAPL")] }) });
  const [first, second] = await Promise.all([api.searchMarket("apple", T0), api.searchMarket("apple", T0)]);
  assert.equal(calls.length, 1);
  assert.equal(first.length, 1);
  assert.deepEqual(second, []);
});

test("an EUR quote is the rounded close with no FX", async () => {
  const { api, calls } = market({ GLOBAL_QUOTE: () => quotePayload("EXA.DEX", "123.456789555", "2026-11-20") });
  assert.deepEqual(await api.marketQuote(euro, T0), {
    asOf: "2026-11-20", unitPrice: "123.45678956", currency: "EUR", fxRate: null, fxAsOf: null,
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].searchParams.get("symbol"), "EXA.DEX");
});

test("a USD quote converts with the last FX close on or before the quote day and before today (UTC)", async () => {
  const { api, calls } = market({
    GLOBAL_QUOTE: () => quotePayload("AAPL", "100.10", "2026-11-20"),
    FX_DAILY: () => fxPayload({ "2026-11-23": "0.5", "2026-11-21": "0.6", "2026-11-20": "0.92345678", "2026-11-19": "0.9" }),
  });
  assert.deepEqual(await api.marketQuote(apple, T0), {
    asOf: "2026-11-20", unitPrice: "92.43802368", currency: "USD", fxRate: "0.92345678", fxAsOf: "2026-11-20",
  });
  const fx = calls[1].searchParams;
  assert.equal(fx.get("function"), "FX_DAILY");
  assert.equal(fx.get("from_symbol"), "USD");
  assert.equal(fx.get("to_symbol"), "EUR");
});

test("rounding is half up on the converted price", async () => {
  const { api } = market({
    GLOBAL_QUOTE: () => quotePayload("AAPL", "1", "2026-11-20"),
    FX_DAILY: () => fxPayload({ "2026-11-20": "0.123456785" }),
  });
  assert.equal((await api.marketQuote(apple, T0))?.unitPrice, "0.12345679");
});

test("an FX close older than a week before the quote day, or newer only, gives no quote", async () => {
  const stale = market({
    GLOBAL_QUOTE: () => quotePayload("AAPL", "100", "2026-11-20"),
    FX_DAILY: () => fxPayload({ "2026-11-10": "0.9" }),
  });
  assert.equal(await stale.api.marketQuote(apple, T0), null);
  const newer = market({
    GLOBAL_QUOTE: () => quotePayload("AAPL", "100", "2026-11-20"),
    FX_DAILY: () => fxPayload({ "2026-11-21": "0.9", "2026-11-23": "0.9" }),
  });
  assert.equal(await newer.api.marketQuote(apple, T0), null);
});

test("today's quote is accepted, and so is the next day in east Asia, but never a date that is future everywhere", async () => {
  const today = market({ GLOBAL_QUOTE: () => quotePayload("EXA.DEX", "10", "2026-11-23") });
  assert.equal((await today.api.marketQuote(euro, T0))?.asOf, "2026-11-23");
  const asia = market({ GLOBAL_QUOTE: () => quotePayload("EXA.DEX", "10", "2026-11-24") });
  assert.equal((await asia.api.marketQuote(euro, new Date("2026-11-23T20:00:00Z")))?.asOf, "2026-11-24");
  const future = market({ GLOBAL_QUOTE: () => quotePayload("EXA.DEX", "10", "2026-11-25") });
  assert.equal(await future.api.marketQuote(euro, T0), null);
  assert.equal(future.cache.get("quote:EXA.DEX")?.payload, null);
  assert.equal(await future.api.marketQuote(euro, at(HOUR)), null);
  assert.equal(future.calls.length, 1);
});

test("a USD quote dated today uses the last completed FX day, not today's forming candle", async () => {
  const { api } = market({
    GLOBAL_QUOTE: () => quotePayload("AAPL", "10", "2026-11-23"),
    FX_DAILY: () => fxPayload({ "2026-11-23": "0.5", "2026-11-22": "0.8", "2026-11-20": "0.9" }),
  });
  const quote = await api.marketQuote(apple, T0);
  assert.equal(quote?.fxAsOf, "2026-11-22");
  assert.equal(quote?.unitPrice, "8");
});

test("invalid payloads, unknown symbols and a symbol mismatch are failed attempts that stay cached 12 hours", async () => {
  for (const body of [{}, { "Global Quote": {} }, quotePayload("OTHER", "10", "2026-11-20"),
    quotePayload("EXA.DEX", "-1", "2026-11-20"), quotePayload("EXA.DEX", "0", "2026-11-20"),
    quotePayload("EXA.DEX", "NaN", "2026-11-20"), quotePayload("EXA.DEX", "10", "2026-02-31"),
    quotePayload("EXA.DEX", "99999999999.5", "2026-11-20"), { "Error Message": "Invalid API call." }]) {
    const { api, calls } = market({ GLOBAL_QUOTE: () => body });
    assert.equal(await api.marketQuote(euro, T0), null);
    assert.equal(await api.marketQuote(euro, at(HOUR)), null);
    assert.equal(calls.length, 1);
  }
});

test("network errors, HTTP errors and malformed JSON are failures, cached, and never leak the key", async () => {
  const cases: Handler[] = [
    () => { throw new Error("socket hang up test-key"); },
    () => new Response("oops", { status: 500 }),
    () => new Response("not json", { status: 200 }),
  ];
  for (const handler of cases) {
    const { api, calls, requests } = market({ GLOBAL_QUOTE: handler });
    assert.equal(await api.marketQuote(euro, T0), null);
    assert.equal(await api.marketQuote(euro, at(1)), null);
    assert.equal(calls.length, 1);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].throttled, false);
  }
});

test("a failed refresh keeps the previous valid payload and serves it", async () => {
  let fail = false;
  const { api, calls, cache } = market({
    GLOBAL_QUOTE: () => fail ? { "Error Message": "x" } : quotePayload("EXA.DEX", "10", "2026-11-20"),
  });
  assert.equal((await api.marketQuote(euro, T0))?.unitPrice, "10");
  fail = true;
  const later = at(13 * HOUR);
  assert.equal((await api.marketQuote(euro, later))?.unitPrice, "10");
  assert.equal(calls.length, 2);
  assert.equal(cache.get("quote:EXA.DEX")?.attemptedAt.getTime(), later.getTime());
  assert.equal((await api.marketQuote(euro, at(14 * HOUR)))?.unitPrice, "10");
  assert.equal(calls.length, 2);
});

test("provider throttling marks the request and pauses every key for the cooldown", async () => {
  const { api, calls, requests } = market({
    SYMBOL_SEARCH: () => ({ Information: "Thank you for using Alpha Vantage! standard API rate limit is 25 requests per day." }),
    GLOBAL_QUOTE: () => quotePayload("EXA.DEX", "10", "2026-11-20"),
  });
  assert.deepEqual(await api.searchMarket("apple", T0), []);
  assert.equal(requests[0].throttled, true);
  assert.equal(await api.marketQuote(euro, at(60_000)), null);
  assert.equal(calls.length, 1);
  assert.ok(await api.marketQuote(euro, at(HOUR)));
  assert.equal(calls.length, 2);
});

test("HTTP 429 and a Note body count as throttling", async () => {
  for (const handler of [() => new Response("slow down", { status: 429 }), () => ({ Note: "calls per minute" })]) {
    const { api, requests } = market({ GLOBAL_QUOTE: handler });
    await api.marketQuote(euro, T0);
    assert.equal(requests[0].throttled, true);
  }
});

test("at most 25 attempts per rolling 24 hours, counting failures; blocked calls are neither fetched nor cached", async () => {
  const { api, calls, requests, cache } = market({ SYMBOL_SEARCH: () => ({ bestMatches: [] }), GLOBAL_QUOTE: () => ({ "Error Message": "x" }) });
  for (let i = 0; i < 25; i++) await api.searchMarket(`query ${i}`, at(i * 60_000));
  assert.equal(calls.length, 25);
  assert.deepEqual(await api.searchMarket("one more", at(30 * 60_000)), []);
  assert.equal(await api.marketQuote(euro, at(30 * 60_000)), null);
  assert.equal(calls.length, 25);
  assert.equal(cache.has("search:one more"), false);
  assert.equal(cache.has("quote:EXA.DEX"), false);
  await api.searchMarket("after the window", at(24 * HOUR + 60_000));
  assert.equal(calls.length, 26);
  await api.searchMarket("much later", at(80 * HOUR));
  assert.equal(requests.length, 1, "request rows older than 48 hours are pruned");
});

test("a USD quote costs two attempts and fails whole when the FX leg cannot be fetched", async () => {
  const { api, requests } = market({
    GLOBAL_QUOTE: () => quotePayload("AAPL", "100", "2026-11-20"),
    FX_DAILY: () => ({ "Error Message": "x" }),
  });
  assert.equal(await api.marketQuote(apple, T0), null);
  assert.equal(requests.length, 2);
});

test("the FX series is shared between symbols in the same currency", async () => {
  const { api, calls } = market({
    GLOBAL_QUOTE: (params) => quotePayload(params.get("symbol")!, "10", "2026-11-20"),
    FX_DAILY: () => fxPayload({ "2026-11-20": "0.9" }),
  });
  await api.marketQuote(apple, T0);
  await api.marketQuote({ ...apple, symbol: "MSFT" }, T0);
  assert.deepEqual(calls.map((url) => url.searchParams.get("function")), ["GLOBAL_QUOTE", "FX_DAILY", "GLOBAL_QUOTE"]);
});

test("unsupported currencies, UK markets and malformed listings are refused before any request", async () => {
  const { api, calls, requests } = market({ GLOBAL_QUOTE: () => quotePayload("X", "1", "2026-11-20") });
  for (const listing of [
    { ...euro, currency: "GBP" }, { ...euro, currency: "GBX" }, { ...euro, currency: "eur" }, { ...euro, currency: "BRL" },
    { ...euro, market: "United Kingdom" }, { ...euro, symbol: "SHEL.LON", currency: "USD", market: "Somewhere" }, { ...euro, symbol: "A B" }, { ...euro, symbol: "" }, { ...euro, symbol: "A".repeat(25) },
  ]) assert.equal(await api.marketQuote(listing, T0), null);
  assert.equal(calls.length + requests.length, 0);
});

test("a write from a superseded attempt is ignored", async () => {
  const { api, cache } = market({
    GLOBAL_QUOTE: () => {
      // While this slow fetch is in flight, a later attempt (a newer token) takes over the key.
      cache.set("quote:EXA.DEX", { attemptedAt: at(99 * HOUR), payload: "newer" });
      return quotePayload("EXA.DEX", "10", "2026-11-20");
    },
  });
  await api.marketQuote(euro, T0);
  assert.equal(cache.get("quote:EXA.DEX")?.payload, "newer");
});

test("a failing save never escapes and the fetched value is still returned", async () => {
  const memory = market({ GLOBAL_QUOTE: () => quotePayload("EXA.DEX", "10", "2026-11-20") });
  const broken = createMarketData({
    store: { ...memory.store, save: async () => { throw new Error("db down"); } },
    fetch: (async () => Response.json(quotePayload("EXA.DEX", "10", "2026-11-20"))) as typeof globalThis.fetch,
    apiKey: "k",
  });
  assert.equal((await broken.marketQuote(euro, T0))?.unitPrice, "10", "the fetched value is still returned");
});

test("a forming FX candle is never cached, so a later day cannot mistake it for a close", async () => {
  const { api } = market({
    GLOBAL_QUOTE: (params) => quotePayload(params.get("symbol")!, "10", params.get("symbol") === "AAPL" ? "2026-11-20" : "2026-11-23"),
    FX_DAILY: () => fxPayload({ "2026-11-23": "0.5", "2026-11-20": "0.9" }),
  });
  await api.marketQuote(apple, new Date("2026-11-23T20:00:00Z")); // fetches FX while 11-23 is still forming
  const next = await api.marketQuote({ ...apple, symbol: "MSFT" }, new Date("2026-11-24T02:00:00Z"));
  assert.equal(next?.fxAsOf, "2026-11-20");
  assert.equal(next?.fxRate, "0.9");
});
