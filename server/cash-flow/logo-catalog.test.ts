import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import sharp from "sharp";
import { accountTypes } from "./catalog.ts";
import { accountInstitution, findCatalogLogo, logoCatalog, logoGroupsByType } from "./logo-catalog.ts";

test("the catalog resolves bank and broker aliases without guessing ambiguous names", () => {
  for (const [name, id] of [
    ["Cònto INTESA Sanpaolo", "intesa-sanpaolo"], ["Uni Credit", "unicredit"],
    ["N-26", "n26"], ["SelfyConto", "mediolanum"], ["Crédit Agricole Italia", "credit-agricole"], ["Revolut personale", "revolut"],
    ["Trade Republic spare cash", "trade-republic"], ["Investimenti IBKR", "interactive-brokers"],
    ["Trading212", "trading-212"], ["Portafoglio Directa", "directa"],
    ["Amex Gold", "american-express"], ["Wallet Coinbase", "coinbase"],
  ]) assert.equal(findCatalogLogo(name)?.id, id);
  for (const name of ["Conto famiglia", "Shopping", "Fineco / Banco BPM", "Directa e DEGIRO"]) {
    assert.equal(findCatalogLogo(name), null);
  }
});

test("every account type has a picker configuration and every group it names has providers", () => {
  for (const type of accountTypes) {
    assert.ok(type in logoGroupsByType, type);
    for (const group of logoGroupsByType[type]) assert.ok(logoCatalog.some((provider) => provider.group === group), `${type}/${group}`);
  }
});

test("every catalog entry ships a sourced, unique WebP thumbnail", async () => {
  assert.equal(new Set(logoCatalog.map(({ id }) => id)).size, logoCatalog.length);
  assert.ok(logoCatalog.some(({ group }) => group === "bank"));
  assert.ok(logoCatalog.some(({ group }) => group === "broker"));
  for (const { id, asset } of logoCatalog) {
    assert.match(id, /^[a-z0-9-]+$/);
    assert.equal(new URL(asset).protocol, "https:");
    const image = await readFile(new URL(`../../public/account-logos/${id}.webp`, import.meta.url));
    const { format, width, height } = await sharp(image).metadata();
    assert.equal(format, "webp", id);
    assert.ok(width <= 128 && height <= 128, id);
  }
});

test("an account's institution is the one set, else the provider its name mentions", () => {
  assert.equal(accountInstitution({ name: "Revolut Titoli", institution: null }), "Revolut");
  assert.equal(accountInstitution({ name: "Conto Revolut", institution: null }), "Revolut");
  assert.equal(accountInstitution({ name: "Shared expenses", institution: null }), null);
  assert.equal(accountInstitution({ name: "Revolut Titoli", institution: "Example Bank" }), "Example Bank");
});
