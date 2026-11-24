// Utility bills against the local, disposable PostgreSQL test database, synthetic users only.
// Services run through DATABASE_URL (the least-privilege runtime role); users and raw probes go
// through DATABASE_ADMIN_URL.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after, before } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../db/generated/client.ts";
import { localPostgresUrl } from "../auth/config.ts";
import { db, disconnectDb } from "../auth/database.ts";
import { createAccount, createCategory } from "../cash-flow/catalog.ts";
import { createMovement, getMovement, pairMovements, transferCandidates, updateMovement } from "../cash-flow/movements.ts";
import { createTemplate, resolveOccurrence } from "../cash-flow/recurring.ts";
import { billCandidates, createBill, deleteBill, getBills, linkBill, unlinkBill, updateBill } from "./bills.ts";
import { createProperty, getOverview, updateProperty } from "./service.ts";

let admin: PrismaClient;
before(() => {
  assert.equal(localPostgresUrl(process.env.DATABASE_URL).pathname, "/stead_auth_test");
  localPostgresUrl(process.env.DATABASE_ADMIN_URL);
  admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_ADMIN_URL }) });
});
after(async () => { await admin?.$disconnect(); await disconnectDb(); });

const NOW = new Date("2026-11-24T12:00:00Z"); // 24 November 2026 in Rome

async function fixture() {
  const { id: userId } = await admin.user.create({ data: { email: `bills-${randomUUID()}@example.test`, passwordHash: "synthetic" } });
  const checking = await createAccount(userId, { name: "Synthetic checking", type: "CHECKING" });
  const card = await createAccount(userId, { name: "Synthetic card", type: "CARD" });
  const property = await createProperty(userId, { name: "Synthetic flat", kind: "PRIMARY_RESIDENCE" });
  return { userId, checking, card, property };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const bill = (f: Fixture, extra: Record<string, unknown> = {}) => createBill(f.userId, {
  propertyId: f.property.id, type: "ELECTRICITY", provider: "Synthetic Power", periodStart: "2026-09-01", periodEnd: "2026-10-31",
  dueDate: "2026-11-20", totalCents: 8_420, ...extra,
}, NOW);
const expense = (f: Fixture, amountCents: number, bookingDate = "2026-11-19", accountId = f.checking.id, extra: Record<string, unknown> = {}) =>
  createMovement(f.userId, { accountId, bookingDate, description: "Synthetic payment", amountCents, categoryId: null, ...extra });
const rejects = (promise: Promise<unknown>, status: number, code?: string, field?: string) => assert.rejects(promise, (error: unknown) => {
  const failure = error as { status?: number; code?: string; field?: string };
  return failure.status === status && (!code || failure.code === code) && (!field || failure.field === field);
});

test("runtime role: bills cannot change owner or property, addresses are writable, and both are sealed", async () => {
  const [rights] = await db().$queryRaw<Record<string, boolean>[]>`
    SELECT has_table_privilege(current_user, 'stead_utility_bills', 'DELETE') AS bill_delete,
      has_column_privilege(current_user, 'stead_utility_bills', 'user_id', 'UPDATE') AS owner_update,
      has_column_privilege(current_user, 'stead_utility_bills', 'property_id', 'UPDATE') AS property_update,
      has_column_privilege(current_user, 'stead_utility_bills', 'movement_id', 'UPDATE') AS link_update,
      has_column_privilege(current_user, 'stead_properties', 'address_enc', 'UPDATE') AS address_update`;
  assert.deepEqual(rights, { bill_delete: true, owner_update: false, property_update: false, link_update: true, address_update: true });
  const f = await fixture();
  const row = (extra: Record<string, unknown>) => ({
    userId: f.userId, propertyId: f.property.id, type: "GAS" as const, provider: "X", periodStart: new Date("2026-01-01"),
    periodEnd: new Date("2026-01-31"), dueDate: new Date("2026-02-15"), totalCents: 1_000, ...extra,
  });
  await admin.utilityBill.create({ data: row({ totalCents: 1_000_000_000, rawMaterialCents: 1_000_000_000 }) }); // positive control
  await assert.rejects(admin.utilityBill.create({ data: row({ totalCents: 1_000_000_001 }) }));
  await assert.rejects(admin.utilityBill.create({ data: row({ totalCents: 0 }) }));
  await assert.rejects(admin.utilityBill.create({ data: row({ periodEnd: new Date("2025-12-31") }) }));
  await assert.rejects(admin.utilityBill.create({ data: row({ rawMaterialCents: 1_001 }) }));
  await assert.rejects(admin.utilityBill.create({ data: row({ type: "INTERNET", rawMaterialCents: 1 }) }));
  await assert.rejects(admin.utilityBill.create({ data: row({ provider: "  " }) }));
  await assert.rejects(admin.property.update({ where: { id: f.property.id }, data: { address: Buffer.from("short") } }));
});

test("the same address on two properties, encrypted per row, editable later and supplied with the first bill", async () => {
  const f = await fixture();
  const address = "Via Sintetica 12, 20100 Milano";
  const a = await createProperty(f.userId, { name: "Flat 1", kind: "RENTAL", address });
  const b = await createProperty(f.userId, { name: "Flat 2", kind: "RENTAL", address });
  assert.equal(a.address, address);
  assert.equal(b.address, address, "no uniqueness: two units in one building share the address");
  const raw = await admin.property.findMany({ where: { id: { in: [a.id, b.id] } }, select: { address: true } });
  assert.ok(raw.every((row) => row.address && !Buffer.from(row.address).toString("utf8").includes("Sintetica")), "stored encrypted");
  assert.notDeepEqual(raw[0].address, raw[1].address);
  // A sealed address copied onto the other row no longer decrypts (bound to the property id).
  const sealedA = (await admin.property.findUniqueOrThrow({ where: { id: a.id } })).address;
  await admin.property.update({ where: { id: b.id }, data: { address: sealedA } });
  await assert.rejects(getOverview(f.userId, NOW));
  await updateProperty(f.userId, b.id, { address: "Via Sintetica 14, 20100 Milano" });
  assert.equal((await updateProperty(f.userId, a.id, { address: "Corso Sintetico 1" })).address, "Corso Sintetico 1", "editable after entry");
  const overview = await getOverview(f.userId, NOW);
  assert.equal(overview.properties.find((row) => row.id === b.id)!.address, "Via Sintetica 14, 20100 Milano");
  assert.equal((await updateProperty(f.userId, a.id, { address: null })).address, null, "null clears it");
  await rejects(updateProperty(f.userId, a.id, { address: "" }), 422, "validation", "address");

  // The first bill may carry the address of a property that has none, in the same transaction.
  assert.equal(f.property.address, null);
  await bill(f, { address: "Piazza Sintetica 3" });
  assert.equal((await getOverview(f.userId, NOW)).properties.find((row) => row.id === f.property.id)!.address, "Piazza Sintetica 3");
  const before = await db().utilityBill.count({ where: { userId: f.userId } });
  await rejects(bill(f, { address: "Elsewhere 1" }), 409, "address_exists");
  assert.equal(await db().utilityBill.count({ where: { userId: f.userId } }), before, "a refused address leaves no bill behind");
});

test("bills validate periods, types and integer cents on the server", async () => {
  const f = await fixture();
  await rejects(bill(f, { periodEnd: "2026-08-31" }), 422, "validation", "periodEnd");
  await rejects(bill(f, { type: "INTERNET", rawMaterialCents: 100 }), 422, "validation", "rawMaterialCents");
  await rejects(bill(f, { rawMaterialCents: 8_421 }), 422, "validation", "rawMaterialCents");
  await rejects(bill(f, { rawMaterialCents: 0 }), 422, "validation", "rawMaterialCents");
  for (const totalCents of [84.2, 0, -100, "8420", 1_000_000_001, null]) await rejects(bill(f, { totalCents }), 422, "validation", "totalCents");
  await rejects(bill(f, { type: "WATER" }), 422, "validation", "type");
  await rejects(bill(f, { provider: " " }), 422, "validation", "provider");
  await rejects(bill(f, { dueDate: "2026-02-30" }), 422, "validation", "dueDate");
  await rejects(bill(f, { userId: randomUUID() }), 422, "validation", "userId");
  const created = await bill(f, { rawMaterialCents: 4_000 });
  assert.equal(created.rawMaterialCents, 4_000);
  await rejects(updateBill(f.userId, created.id, { type: "INTERNET" }, NOW), 422, "validation", "rawMaterialCents");
  const internet = await updateBill(f.userId, created.id, { type: "INTERNET", rawMaterialCents: null }, NOW);
  assert.equal(internet.rawMaterialCents, null);
  await rejects(updateBill(f.userId, created.id, { periodStart: "2026-11-01" }, NOW), 422, "validation", "periodEnd");
  assert.equal(await db().utilityBill.count({ where: { userId: f.userId } }), 1);
});

test("provider is stored on each bill: switching provider and editing one bill leaves the others", async () => {
  const f = await fixture();
  const first = await bill(f, { provider: "Synthetic Power", dueDate: "2026-09-20" });
  const second = await bill(f, { provider: "Other Synthetic Energy", dueDate: "2026-11-20" });
  await updateBill(f.userId, first.id, { provider: "Synthetic Power Ltd" }, NOW);
  const { bills } = await getBills(f.userId, { year: 2026 }, NOW);
  assert.deepEqual(bills.map((row) => [row.id, row.provider]), [[second.id, "Other Synthetic Energy"], [first.id, "Synthetic Power Ltd"]]);
});

test("payment picker: exact-amount expenses of any account, nearest the due date, without transfers, recurring or other bills", async () => {
  const f = await fixture();
  const income = await createCategory(f.userId, { name: "Synthetic salary", kind: "INCOME" });
  const target = await bill(f); // 84.20 due 20 Nov
  const near = await expense(f, -8_420, "2026-11-21", f.card.id);
  const far = await expense(f, -8_420, "2026-10-01");
  await expense(f, -8_421, "2026-11-20"); // mismatched amount
  await expense(f, 8_420, "2026-11-20"); // inflow
  await expense(f, -8_420, "2026-11-20", f.checking.id, { categoryId: income.id }); // income category
  const voided = await expense(f, -8_420, "2026-11-20");
  await updateMovement(f.userId, voided.id, { voided: true });
  const transferOut = await expense(f, -8_420, "2026-11-20");
  const transferIn = await expense(f, 8_420, "2026-11-20", f.card.id);
  await pairMovements(f.userId, { movementIds: [transferOut.id, transferIn.id] });
  const template = await createTemplate(f.userId, { accountId: f.checking.id, description: "Synthetic plan", amountCents: 8_420, frequency: "MONTHLY", startDate: "2026-11-20" });
  const matched = await expense(f, -8_420, "2026-11-20");
  await resolveOccurrence(f.userId, { action: "match", templateId: template.id, dueDate: "2026-11-20", movementId: matched.id }, NOW);
  const other = await bill(f, { provider: "Other bill" });
  const taken = await expense(f, -8_420, "2026-11-20");
  await linkBill(f.userId, other.id, { movementId: taken.id }, NOW);

  const page = await billCandidates(f.userId, target.id, new URLSearchParams());
  assert.deepEqual(page.movements.map((row) => row.id), [near.id, far.id], "only eligible, nearest first, across accounts");
  assert.deepEqual((await billCandidates(f.userId, target.id, new URLSearchParams({ month: "2026-10" }))).movements.map((row) => row.id), [far.id]);

  // The same rules hold when a movement id is posted directly.
  for (const [movement, code] of [[voided.id, "voided"], [transferOut.id, "paired"], [matched.id, "already_linked"], [taken.id, "already_linked"]] as const) {
    await rejects(linkBill(f.userId, target.id, { movementId: movement }, NOW), 409, code);
  }
  const mismatched = await expense(f, -8_421, "2026-11-20");
  await rejects(linkBill(f.userId, target.id, { movementId: mismatched.id }, NOW), 409, "amount_mismatch");
  const paid = await linkBill(f.userId, target.id, { movementId: near.id }, NOW);
  assert.equal(paid.status, "PAID");
  assert.deepEqual(paid.payment, { movementId: near.id, accountId: f.card.id, bookingDate: "2026-11-21" });
  assert.deepEqual((await billCandidates(f.userId, target.id, new URLSearchParams())).movements, [], "a paid bill offers nothing");
  await rejects(linkBill(f.userId, target.id, { movementId: far.id }, NOW), 409, "bill_linked");
});

test("a paid bill keeps its total and stays; unlinking reopens it and keeps the movement", async () => {
  const f = await fixture();
  const target = await bill(f, { dueDate: "2026-11-10" });
  const payment = await expense(f, -8_420);
  await linkBill(f.userId, target.id, { movementId: payment.id }, NOW);
  await rejects(deleteBill(f.userId, target.id), 409, "bill_linked");
  await rejects(updateBill(f.userId, target.id, { totalCents: 8_000 }, NOW), 409, "bill_linked");
  const edited = await updateBill(f.userId, target.id, { provider: "Renamed", totalCents: 8_420, dueDate: "2026-11-12" }, NOW);
  assert.equal(edited.status, "PAID", "other fields, and the same total, still change");

  const reopened = await unlinkBill(f.userId, target.id, NOW);
  assert.equal(reopened.status, "OVERDUE", "due 12 November, open on 24 November");
  assert.equal(reopened.payment, null);
  const movement = await getMovement(f.userId, payment.id);
  assert.equal(movement.amountCents, -8_420);
  assert.equal(movement.voided, false, "the cash-flow movement is untouched");
  await rejects(unlinkBill(f.userId, target.id, NOW), 409, "not_linked");
  assert.equal((await updateBill(f.userId, target.id, { totalCents: 8_000 }, NOW)).totalCents, 8_000);
  await deleteBill(f.userId, target.id);
  assert.equal((await getMovement(f.userId, payment.id)).amountCents, -8_420);
});

test("cash-flow edits respect a bill link: no void, amount change, income category, pairing or recurring match", async () => {
  const f = await fixture();
  const income = await createCategory(f.userId, { name: "Synthetic refund", kind: "INCOME" });
  const target = await bill(f);
  const payment = await expense(f, -8_420);
  await linkBill(f.userId, target.id, { movementId: payment.id }, NOW);
  await rejects(updateMovement(f.userId, payment.id, { voided: true }), 409, "bill_linked");
  await rejects(updateMovement(f.userId, payment.id, { amountCents: -8_000 }), 409, "bill_linked");
  await rejects(updateMovement(f.userId, payment.id, { categoryId: income.id }), 409, "bill_linked");
  const moved = await updateMovement(f.userId, payment.id, { accountId: f.card.id, description: "Synthetic power bill", bookingDate: "2026-11-18" });
  assert.equal(moved.accountId, f.card.id, "account, date and description stay editable");
  const counterpart = await expense(f, 8_420, "2026-11-18", f.checking.id);
  await rejects(pairMovements(f.userId, { movementIds: [payment.id, counterpart.id] }), 409, "bill_linked");
  assert.deepEqual((await transferCandidates(f.userId, new URLSearchParams({ movementId: payment.id }))).movements, []);
  assert.ok(!(await transferCandidates(f.userId, new URLSearchParams({ movementId: counterpart.id }))).movements.some((row) => row.id === payment.id));
  const template = await createTemplate(f.userId, { accountId: f.card.id, description: "Synthetic plan", amountCents: 8_420, frequency: "MONTHLY", startDate: "2026-11-18" });
  await rejects(resolveOccurrence(f.userId, { action: "match", templateId: template.id, dueDate: "2026-11-18", movementId: payment.id }, NOW), 409, "already_linked");
  await unlinkBill(f.userId, target.id, NOW);
  assert.equal((await updateMovement(f.userId, payment.id, { amountCents: -8_000 })).amountCents, -8_000, "positive control: unlinked, it changes");
});

test("summary by due date in the selected year, across properties (archived and sold included), overdue from the next Rome day", async () => {
  const f = await fixture();
  const sold = await createProperty(f.userId, { name: "Synthetic sold flat", kind: "SECOND_HOME", soldOn: "2026-06-30" });
  await updateProperty(f.userId, sold.id, { archived: true });
  const crossYear = await bill(f, { type: "GAS", periodStart: "2026-12-01", periodEnd: "2027-01-31", dueDate: "2027-01-15", totalCents: 12_000 });
  const lastYear = await bill(f, { periodStart: "2025-11-01", periodEnd: "2025-12-31", dueDate: "2026-01-10", totalCents: 5_000 });
  const overdue = await bill(f, { dueDate: "2026-11-23", totalCents: 3_000 });
  const dueToday = await bill(f, { dueDate: "2026-11-24", totalCents: 2_000 });
  const archivedBill = await createBill(f.userId, {
    propertyId: sold.id, type: "INTERNET", provider: "Synthetic Fibre", periodStart: "2026-05-01", periodEnd: "2026-05-31", dueDate: "2026-06-05", totalCents: 2_990,
  }, NOW);
  await linkBill(f.userId, lastYear.id, { movementId: (await expense(f, -5_000, "2026-01-09")).id }, NOW);

  const year = await getBills(f.userId, { year: 2026 }, NOW);
  assert.deepEqual(year.bills.map((row) => row.id), [dueToday.id, overdue.id, archivedBill.id, lastYear.id], "due date newest first; the 2027 bill is not here");
  assert.deepEqual(year.bills.map((row) => row.status), ["DUE", "OVERDUE", "OVERDUE", "PAID"]);
  assert.deepEqual(year.total, { paidCents: 5_000, dueCents: 2_000, overdueCents: 5_990 });
  assert.deepEqual(year.properties.find((row) => row.propertyId === sold.id), { propertyId: sold.id, paidCents: 0, dueCents: 0, overdueCents: 2_990 });
  assert.deepEqual(year.properties.find((row) => row.propertyId === f.property.id), { propertyId: f.property.id, paidCents: 5_000, dueCents: 2_000, overdueCents: 3_000 });

  const next = await getBills(f.userId, { year: 2027 }, NOW);
  assert.deepEqual(next.bills.map((row) => row.id), [crossYear.id], "a bill counts in the year of its due date, not its period");
  assert.deepEqual(next.total, { paidCents: 0, dueCents: 12_000, overdueCents: 0 });

  // 23:30 UTC on 24 November is 00:30 on 25 November in Rome: the bill due on the 24th is now overdue.
  const late = await getBills(f.userId, { year: 2026 }, new Date("2026-11-24T23:30:00Z"));
  assert.equal(late.bills.find((row) => row.id === dueToday.id)!.status, "OVERDUE");
  const early = await getBills(f.userId, { year: 2026 }, new Date("2026-11-24T22:30:00Z"));
  assert.equal(early.bills.find((row) => row.id === dueToday.id)!.status, "DUE");
});

test("user isolation: another user can neither see nor touch bills, properties or movements", async () => {
  const a = await fixture(), b = await fixture();
  const own = await bill(a);
  const payment = await expense(a, -8_420);
  const foreign = await expense(b, -8_420);
  await rejects(createBill(b.userId, { propertyId: a.property.id, type: "GAS", provider: "X", periodStart: "2026-01-01", periodEnd: "2026-01-31", dueDate: "2026-02-01", totalCents: 100 }, NOW), 404);
  await rejects(updateBill(b.userId, own.id, { provider: "Hijack" }, NOW), 404);
  await rejects(deleteBill(b.userId, own.id), 404);
  await rejects(billCandidates(b.userId, own.id, new URLSearchParams()), 404);
  await rejects(linkBill(b.userId, own.id, { movementId: payment.id }, NOW), 404);
  await rejects(unlinkBill(b.userId, own.id, NOW), 404);
  await rejects(linkBill(a.userId, own.id, { movementId: foreign.id }, NOW), 404, "not_found", undefined);
  assert.deepEqual((await billCandidates(a.userId, own.id, new URLSearchParams())).movements.map((row) => row.id), [payment.id], "b's identical expense is not offered");
  assert.deepEqual((await getBills(b.userId, { year: 2026 }, NOW)).bills, []);
  assert.equal((await getBills(a.userId, { year: 2026 }, NOW)).bills.length, 1);
});

test("concurrency: the first writer wins and no state mixes a link with a conflicting change", async () => {
  const f = await fixture();
  const settle = async (...calls: (() => Promise<unknown>)[]) => (await Promise.allSettled(calls.map((call) => call()))).map((row) => row.status);
  const linkedTo = async (id: string) => (await db().utilityBill.findUniqueOrThrow({ where: { id } })).movementId;

  // Two bills race for one movement: exactly one link.
  const [first, second] = [await bill(f), await bill(f, { provider: "Second" })];
  const shared = await expense(f, -8_420);
  const twoBills = await settle(() => linkBill(f.userId, first.id, { movementId: shared.id }, NOW), () => linkBill(f.userId, second.id, { movementId: shared.id }, NOW));
  assert.equal(twoBills.filter((status) => status === "fulfilled").length, 1);
  assert.equal(await db().utilityBill.count({ where: { userId: f.userId, movementId: shared.id } }), 1);

  for (let round = 0; round < 3; round += 1) {
    // Link against void: either the bill is paid by a live movement, or the movement is voided and the bill open.
    const target = await bill(f, { provider: `Void race ${round}` });
    const movement = await expense(f, -8_420);
    await settle(() => linkBill(f.userId, target.id, { movementId: movement.id }, NOW), () => updateMovement(f.userId, movement.id, { voided: true }));
    const voided = (await getMovement(f.userId, movement.id)).voided;
    assert.ok(voided !== ((await linkedTo(target.id)) === movement.id), "exactly one of the two writes took effect");

    // Link against an amount edit: a linked movement always carries the bill total.
    const edited = await bill(f, { provider: `Edit race ${round}` });
    const editMovement = await expense(f, -8_420);
    await settle(() => linkBill(f.userId, edited.id, { movementId: editMovement.id }, NOW), () => updateMovement(f.userId, editMovement.id, { amountCents: -9_000 }));
    if (await linkedTo(edited.id)) assert.equal((await getMovement(f.userId, editMovement.id)).amountCents, -8_420);

    // Link against pairing: never both.
    const paired = await bill(f, { provider: `Pair race ${round}` });
    const out = await expense(f, -8_420), into = await expense(f, 8_420, "2026-11-19", f.card.id);
    const pair = await settle(() => linkBill(f.userId, paired.id, { movementId: out.id }, NOW), () => pairMovements(f.userId, { movementIds: [out.id, into.id] }));
    assert.equal(pair.filter((status) => status === "fulfilled").length, 1);

    // Link against a recurring match of the same movement: one wins.
    const template = await createTemplate(f.userId, { accountId: f.checking.id, description: `Plan ${round}`, amountCents: 8_420, frequency: "MONTHLY", startDate: "2026-11-19" });
    const contested = await bill(f, { provider: `Match race ${round}` });
    const both = await expense(f, -8_420);
    const match = await settle(
      () => linkBill(f.userId, contested.id, { movementId: both.id }, NOW),
      () => resolveOccurrence(f.userId, { action: "match", templateId: template.id, dueDate: "2026-11-19", movementId: both.id }, NOW),
    );
    assert.equal(match.filter((status) => status === "fulfilled").length, 1);
    const occurrences = await db().recurringOccurrence.count({ where: { userId: f.userId, movementId: both.id } });
    assert.equal(occurrences + ((await linkedTo(contested.id)) === both.id ? 1 : 0), 1);

    // Delete or total edit against link: never a deleted bill with a link, never a changed total on a paid bill.
    const doomed = await bill(f, { provider: `Delete race ${round}` });
    const pay = await expense(f, -8_420);
    await settle(() => linkBill(f.userId, doomed.id, { movementId: pay.id }, NOW), () => deleteBill(f.userId, doomed.id));
    const left = await db().utilityBill.findUnique({ where: { id: doomed.id } });
    assert.ok(left === null || left.movementId === pay.id);
    const resized = await bill(f, { provider: `Total race ${round}` });
    const payResized = await expense(f, -8_420);
    await settle(() => linkBill(f.userId, resized.id, { movementId: payResized.id }, NOW), () => updateBill(f.userId, resized.id, { totalCents: 9_999 }, NOW));
    const row = await db().utilityBill.findUniqueOrThrow({ where: { id: resized.id } });
    assert.ok(row.movementId === null ? row.totalCents === 9_999 : row.totalCents === 8_420);
  }
});
