import { strict as assert } from "node:assert";
import { AsyncLocalStorage } from "node:async_hooks";
import { test } from "node:test";
import { createMarketData, MarketRateLimit, type MarketStore, type MarketTx } from "./market-data.ts";

const now = new Date("2026-11-23T17:00:00Z");
const hour = 3_600_000;
const listing = { symbol: "TEST.PA", name: "Example ETF", market: "Paris", currency: "EUR" };
const close = { asOf: "2026-11-23", price: "10.123456785", currency: "EUR" };

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

function market(request: Parameters<typeof createMarketData>[0]["request"], enabled = true) {
  const { store, requests, cache, lock } = memoryStore();
  const calls: string[][] = [];
  const api = createMarketData({ store, enabled: () => enabled, request: (operation, value) => {
    assert.equal(lock.getStore(), undefined);
    calls.push([operation, value]);
    return request(operation, value);
  } });
  return { api, calls, requests, cache };
}

test("retains the saved Paris listing while querying its Yahoo ticker", async () => {
  const { api, calls } = market(async () => close);
  assert.deepEqual(await api.marketQuote({ ...listing, symbol: "TEST.PAR" }, now), {
    asOf: "2026-11-23", unitPrice: "10.12345679", currency: "EUR", fxRate: null, fxAsOf: null,
  });
  assert.deepEqual(calls, [["quote", "TEST.PA"]]);
});

test("rejects a listing when the provider returns a different currency", async () => {
  const { api } = market(async () => ({ ...close, currency: "USD" }));
  assert.equal(await api.marketQuote(listing, now), null);
});

test("stock closes convert with the last completed shared FX close", async () => {
  const { api, calls } = market(async (operation) => operation === "quote"
    ? { ...close, price: "100", currency: "USD" }
    : [["2026-11-22", "0.9"], ["2026-11-23", "0.8"]]);
  assert.deepEqual(await api.marketQuote({ ...listing, symbol: "TEST", currency: "USD" }, now), {
    asOf: "2026-11-23", unitPrice: "90", currency: "USD", fxRate: "0.9", fxAsOf: "2026-11-22",
  });
  await api.marketQuote({ ...listing, symbol: "OTHER", currency: "USD" }, now);
  assert.deepEqual(calls, [["quote", "TEST"], ["fx", "USD"], ["quote", "OTHER"]]);
});

test("searches are cached for twelve hours and concurrent requests reserve only once", async () => {
  const { api, calls } = market(async () => [listing]);
  await Promise.all([api.searchMarket("Example ETF", now), api.searchMarket("example   etf", now)]);
  assert.deepEqual(await api.searchMarket("Example ETF", new Date(now.getTime() + 12 * hour - 1)), [listing]);
  assert.deepEqual(calls, [["search", "Example ETF"]]);
  await api.searchMarket("Example ETF", new Date(now.getTime() + 12 * hour));
  assert.equal(calls.length, 2);
});

test("disabled bridges and invalid inputs consume no request budget", async () => {
  const disabled = market(async () => [listing], false);
  await disabled.api.searchMarket("Example", now);
  const { api, calls } = market(async () => [listing]);
  await api.searchMarket("invalid<body>", now);
  assert.equal(calls.length + disabled.calls.length, 0);
});

test("bad, future and unusable prices do not change valuations", async () => {
  for (const bad of [{ ...close, asOf: "2027-01-01" }, { ...close, price: "NaN" }, { ...close, price: "0" }]) {
    const { api } = market(async () => bad);
    assert.equal(await api.marketQuote(listing, now), null);
  }
});

test("a failed refresh keeps the last valid quotation without repeated requests", async () => {
  let attempts = 0;
  const { api, calls } = market(async () => {
    if (++attempts > 1) throw new Error("offline");
    return close;
  });
  const first = await api.marketQuote(listing, now);
  const next = new Date(now.getTime() + 12 * hour);
  assert.deepEqual(await api.marketQuote(listing, next), first);
  assert.deepEqual(await api.marketQuote(listing, next), first);
  assert.equal(calls.length, 2);
});

test("a listing without its first close retries after thirty minutes", async () => {
  let attempts = 0;
  const { api, calls } = market(async () => ++attempts === 1 ? null : close);
  assert.equal(await api.marketQuote(listing, now), null);
  assert.equal(await api.marketQuote(listing, new Date(now.getTime() + 29 * 60_000)), null);
  assert.equal((await api.marketQuote(listing, new Date(now.getTime() + 30 * 60_000)))?.asOf, close.asOf);
  assert.equal(calls.length, 2);
});

test("rate limiting stops subsequent cache misses during the cooldown", async () => {
  const { api, calls } = market(async () => { throw new MarketRateLimit(); });
  await api.searchMarket("Example", now);
  await api.searchMarket("Another", now);
  assert.equal(calls.length, 1);
});

test("the shared budget counts every attempt in the rolling window, including failures", async () => {
  const { api, calls } = market(async () => { throw new Error("offline"); });
  for (let i = 0; i < 26; i++) await api.searchMarket("Example " + i, now);
  assert.equal(calls.length, 25);
  await api.searchMarket("Another", new Date(now.getTime() + 24 * hour));
  assert.equal(calls.length, 26);
});
