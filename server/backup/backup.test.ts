import assert from "node:assert/strict";
import test from "node:test";
import { ApiError } from "../cash-flow/errors.ts";
import { parseBackup } from "./import.ts";

// Synthetic data only.
const ids = {
  checking: "00000000-0000-4000-8000-000000000001", savings: "00000000-0000-4000-8000-000000000002",
  food: "00000000-0000-4000-8000-000000000003", transfer: "00000000-0000-4000-8000-000000000004",
  out: "00000000-0000-4000-8000-000000000005", in: "00000000-0000-4000-8000-000000000006",
  instrument: "00000000-0000-4000-8000-000000000007", trade: "00000000-0000-4000-8000-000000000008",
};
const at = "2026-11-01T10:00:00.000Z";

function file() {
  const account = (id: string, name: string, type = "CHECKING") => ({ id, name, type, customTypeId: null, archivedAt: null, createdAt: at });
  const leg = (id: string, accountId: string, amountCents: number, transferLeg: string) => ({
    id, accountId, categoryId: null, bookingDate: "2026-11-02", description: "Synthetic transfer", amountCents,
    voidedAt: null, transferId: ids.transfer, transferLeg, createdAt: at,
  });
  return {
    format: "getstead-backup", version: 1, exportedAt: at,
    data: {
      accounts: [account(ids.checking, "Synthetic checking"), account(ids.savings, "Synthetic broker", "BROKERAGE")],
      categories: [{ id: ids.food, name: "Synthetic food", kind: "EXPENSE", archivedAt: null, createdAt: at }],
      transfers: [{ id: ids.transfer, createdAt: at }],
      movements: [leg(ids.out, ids.checking, -5_000, "OUT"), leg(ids.in, ids.savings, 5_000, "IN")],
      instruments: [{ id: ids.instrument, name: "Synthetic ETF", symbol: null, isin: null, kind: "ETF",
        marketSymbol: null, marketName: null, marketCurrency: null, archivedAt: null }],
      investmentTransactions: [{ id: ids.trade, accountId: ids.savings, instrumentId: ids.instrument, type: "BUY",
        tradeDate: "2026-11-03", ordinal: 1, quantity: "2.5", amountCents: 4_000, feesCents: 0, taxWithheldCents: 0, voidedAt: null }],
    },
  };
}

function rejects(change: (backup: ReturnType<typeof file>) => void, code: string, field: string) {
  const backup = file();
  change(backup);
  assert.throws(() => parseBackup(backup), (error: unknown) =>
    error instanceof ApiError && error.status === 422 && error.code === code && error.field === field);
}

test("a well-formed backup parses, with missing tables read as empty", () => {
  const rows = parseBackup(file());
  assert.equal(rows.movements.length, 2);
  assert.equal(rows.investmentTransactions[0].quantity, "2.5");
  assert.deepEqual(rows.properties, []);
});

test("a retired charge can keep the ID of a deleted millesimal table", () => {
  const backup = file();
  const rows = parseBackup({ ...backup, data: {
    ...backup.data,
    properties: [{ id: ids.food, name: "Synthetic flat", kind: "PRIMARY_RESIDENCE", ownershipBps: 10_000 }],
    condoCharges: [{
      id: ids.trade, propertyId: ids.food, kind: "BALANCING", title: "Synthetic balancing",
      dueDate: "2026-11-20", amountCents: 500, tableId: ids.instrument, buildingTotalCents: 5_000,
    }],
  } });
  assert.equal(rows.condoCharges[0].tableId, ids.instrument);
});

test("a backup is rejected before anything is written when the file is wrong", () => {
  rejects((b) => { b.format = "other"; }, "backup_format", "format");
  rejects((b) => { b.version = 2; }, "backup_version", "version");
  rejects((b) => { (b.data.accounts[0] as Record<string, unknown>).extra = 1; }, "validation", "accounts[0].extra");
  rejects((b) => { b.data.movements[0].amountCents = 0; }, "validation", "movements[0].amountCents");
  rejects((b) => { b.data.investmentTransactions[0].quantity = "1e3"; }, "validation", "investmentTransactions[0].quantity");
  rejects((b) => { b.data.accounts[1].id = ids.checking; }, "validation", "accounts[1].id");
  rejects((b) => { b.data.movements[0].accountId = ids.food; }, "backup_reference", "movements[0].accountId");
  rejects((b) => { b.data.movements[1].amountCents = 4_000; }, "backup_transfer", "transfers[0]");
  rejects((b) => { b.data.investmentTransactions[0].accountId = ids.checking; }, "validation", "investmentTransactions[0].accountId");
});
