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
  const account = (id: string, name: string, type = "CHECKING") => ({ id, name, type, archivedAt: null, createdAt: at });
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
  rejects((b) => { b.version = 5; }, "backup_version", "version");
  rejects((b) => { (b.data.accounts[0] as Record<string, unknown>).extra = 1; }, "validation", "accounts[0].extra");
  rejects((b) => { b.data.movements[0].amountCents = 0; }, "validation", "movements[0].amountCents");
  rejects((b) => { b.data.investmentTransactions[0].quantity = "1e3"; }, "validation", "investmentTransactions[0].quantity");
  rejects((b) => { b.data.accounts[1].id = ids.checking; }, "validation", "accounts[1].id");
  rejects((b) => { b.data.movements[0].accountId = ids.food; }, "backup_reference", "movements[0].accountId");
  rejects((b) => { b.data.movements[1].amountCents = 4_000; }, "backup_transfer", "transfers[0]");
  rejects((b) => { b.data.investmentTransactions[0].accountId = ids.checking; }, "validation", "investmentTransactions[0].accountId");
});

test("version 2 adds an optional encrypted address and utility bills; a version 1 file still parses without them", () => {
  const v1 = parseBackup(file());
  assert.deepEqual(v1.utilityBills, []);

  const flat = "00000000-0000-4000-8000-000000000009", bill = "00000000-0000-4000-8000-00000000000a", paid = "00000000-0000-4000-8000-00000000000b";
  const payment = { id: paid, accountId: ids.checking, categoryId: ids.food, bookingDate: "2026-11-20", description: "Synthetic power",
    amountCents: -8_420, voidedAt: null, transferId: null, transferLeg: null, createdAt: at };
  const v2 = () => {
    const backup = file();
    return { ...backup, version: 2, data: {
      ...backup.data,
      movements: [...backup.data.movements, payment],
      properties: [{ id: flat, name: "Synthetic flat", kind: "PRIMARY_RESIDENCE", ownershipBps: 10_000, address: "Via Sintetica 1, Milano" }],
      utilityBills: [{ id: bill, propertyId: flat, type: "ELECTRICITY", provider: "Synthetic Power", periodStart: "2026-09-01",
        periodEnd: "2026-10-31", dueDate: "2026-11-20", totalCents: 8_420, rawMaterialCents: 4_000, movementId: paid, createdAt: at }],
    } };
  };
  const rows = parseBackup(v2());
  assert.equal(rows.properties[0].address, "Via Sintetica 1, Milano");
  assert.equal(rows.utilityBills[0].movementId, paid);

  const broken = (change: (backup: ReturnType<typeof v2>) => void, code: string, field: string) => {
    const backup = v2();
    change(backup);
    assert.throws(() => parseBackup(backup), (error: unknown) => error instanceof ApiError && error.code === code && error.field === field);
  };
  broken((b) => { b.data.utilityBills[0].totalCents = 8_421; }, "backup_bill", "utilityBills[0].movementId");
  broken((b) => { b.data.utilityBills[0].periodEnd = "2026-08-31"; }, "validation", "utilityBills[0].periodEnd");
  broken((b) => { b.data.utilityBills[0].type = "INTERNET"; }, "validation", "utilityBills[0].rawMaterialCents");
  broken((b) => { b.data.utilityBills[0].movementId = ids.out; }, "backup_bill", "utilityBills[0].movementId");
});

test("a backup written with custom account types still loads: the label is dropped, the built-in type stays", () => {
  const backup = file();
  const fund = "00000000-0000-4000-8000-000000000009";
  Object.assign(backup.data, { customAccountTypes: [{ id: fund, name: "Synthetic fund", baseType: "CHECKING", archivedAt: null, createdAt: at }] });
  Object.assign(backup.data.accounts[0], { customTypeId: fund });
  const rows = parseBackup(backup);
  assert.equal(rows.accounts[0].type, "CHECKING");
  assert.equal("customTypeId" in rows.accounts[0], false);
  assert.equal("customAccountTypes" in rows, false);
});
