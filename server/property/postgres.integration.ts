// Integration tests against a local, disposable PostgreSQL database with synthetic users only.
// Services run through DATABASE_URL (the least-privilege runtime role); users and raw constraint
// probes go through DATABASE_ADMIN_URL.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after, before } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../db/generated/client.ts";
import { localPostgresUrl } from "../auth/config.ts";
import { db, disconnectDb } from "../auth/database.ts";
import { createAccount, createAccountType, updateAccount } from "../cash-flow/catalog.ts";
import { getDashboard } from "../cash-flow/dashboard.ts";
import { createMovement, updateMovement } from "../cash-flow/movements.ts";
import { addDays } from "../cash-flow/dates.ts";
import { deleteTemplate, resolveOccurrence, updateTemplate } from "../cash-flow/recurring.ts";
import { chargeContext, encryptText, movementContext } from "../cash-flow/text-crypto.ts";
import { getNetWorth, recordCheck } from "../net-worth/service.ts";
import {
  createProperty, createSchedule, createTable, createValuation, deleteSchedule, deleteTable, deleteValuation, getCosts, getOverview,
  listValuations, updateProperty,
} from "./service.ts";

let admin: PrismaClient;
before(() => {
  assert.equal(localPostgresUrl(process.env.DATABASE_URL).pathname, "/stead_auth_test");
  localPostgresUrl(process.env.DATABASE_ADMIN_URL);
  admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_ADMIN_URL }) });
});
after(async () => { await admin?.$disconnect(); await disconnectDb(); });

async function fixture() {
  const { id: userId } = await admin.user.create({ data: { email: `m4-${randomUUID()}@example.test`, passwordHash: "synthetic" } });
  const checking = await createAccount(userId, { name: "Synthetic checking", type: "CHECKING" });
  const savings = await createAccount(userId, { name: "Synthetic savings", type: "CHECKING" });
  const debt = await createAccount(userId, { name: "Synthetic mortgage", type: "DEBT" });
  const property = await createProperty(userId, { name: "Synthetic flat", kind: "PRIMARY_RESIDENCE" });
  return { userId, checking, savings, debt, property };
}
const rejects = (promise: Promise<unknown>, status: number, code?: string) => assert.rejects(promise, (error: unknown) => {
  const failure = error as { status?: number; code?: string };
  return failure.status === status && (!code || failure.code === code);
});
const movementsOf = (userId: string) => db().movement.count({ where: { userId } });

test("ownership: another user cannot read or change another property", async () => {
  const a = await fixture(), b = await fixture();
  const table = await createTable(a.userId, { propertyId: a.property.id, label: "General", unitMillesimi: 85 });
  await rejects(createProperty(b.userId, { name: "Intruder", kind: "OTHER", mortgageAccountId: a.debt.id }), 422);
  await rejects(createValuation(b.userId, { propertyId: a.property.id, asOf: "2026-11-01", valueCents: 100 }), 404);
  await rejects(createTable(b.userId, { propertyId: a.property.id, label: "X", unitMillesimi: 1 }), 404);
  await rejects(createSchedule(b.userId, { propertyId: a.property.id, accountId: b.checking.id, description: "x", amountCents: 100, frequency: "MONTHLY", startDate: "2026-11-01" }), 404);
  await rejects(updateProperty(b.userId, a.property.id, { name: "Hijack" }), 404);
  await rejects(deleteTable(b.userId, table.id), 404);
  assert.equal((await getOverview(b.userId)).properties.length, 1, "b sees only its own property");
  assert.equal(await movementsOf(a.userId) + await movementsOf(b.userId), 0, "no rejected call booked a movement");
});

test("constraints and runtime privileges: the database rejects what the service would, with positive controls", async () => {
  const { userId, property } = await fixture();
  const [rights] = await db().$queryRaw<Record<string, boolean>[]>`
    SELECT has_table_privilege(current_user, 'stead_properties', 'DELETE') AS property_delete,
      has_table_privilege(current_user, 'stead_condo_charges', 'DELETE') AS charge_delete,
      has_table_privilege(current_user, 'stead_property_valuations', 'DELETE') AS valuation_delete,
      has_column_privilege(current_user, 'stead_properties', 'user_id', 'UPDATE') AS ownership_update,
      has_column_privilege(current_user, 'stead_condo_charges', 'amount_cents', 'UPDATE') AS charge_amount_update`;
  assert.deepEqual(rights, { property_delete: false, charge_delete: false, valuation_delete: true, ownership_update: false, charge_amount_update: false });

  const id = randomUUID();
  const row = (extra: Record<string, unknown> = {}) => ({
    id: randomUUID(), userId, propertyId: property.id, kind: "BALANCING" as const, title: encryptText(userId, chargeContext(id), "x"),
    dueDate: new Date("2026-11-05"), amountCents: 1_000_000_000, ...extra,
  });
  await admin.condoCharge.create({ data: row() }); // positive control: the boundary amount is accepted
  await assert.rejects(admin.condoCharge.create({ data: row({ amountCents: 1_000_000_001 }) }));
  await assert.rejects(admin.condoCharge.create({ data: row({ amountCents: 0 }) }));
  await assert.rejects(admin.condoCharge.create({ data: row({ title: Buffer.from("short") }) }));
  await assert.rejects(admin.condoCharge.create({ data: row({ buildingTotalCents: 5n }) }), "building total without a table");
  await assert.rejects(admin.condoTable.create({ data: { userId, propertyId: property.id, label: "Bad", unitMillesimi: 1001, totalMillesimi: 1000 } }));
  await admin.condoTable.create({ data: { userId, propertyId: property.id, label: "Edge", unitMillesimi: 1000, totalMillesimi: 1000 } });
  await assert.rejects(admin.property.create({ data: { userId, name: "Zero share", kind: "OTHER", ownershipBps: 0 } }));
  await admin.property.create({ data: { userId, name: "Full share", kind: "OTHER", ownershipBps: 10_000 } });
  await assert.rejects(admin.propertyValuation.create({ data: { userId, propertyId: property.id, asOf: new Date("2026-01-01"), valueCents: 1_000_000_000_001n } }));
  await admin.propertyValuation.create({ data: { userId, propertyId: property.id, asOf: new Date("2026-01-01"), valueCents: 1_000_000_000_000n } });
});


test("mortgage link: DEBT accounts only, one property per loan, and the account type is protected", async () => {
  const { userId, checking, debt, property } = await fixture();
  await rejects(updateProperty(userId, property.id, { mortgageAccountId: checking.id }), 422);
  await updateProperty(userId, property.id, { mortgageAccountId: debt.id });
  await rejects(updateAccount(userId, debt.id, { type: "CHECKING" }), 409, "mortgage_account");
  const loan = await createAccountType(userId, { name: "Synthetic home loan", baseType: "DEBT" });
  const card = await createAccountType(userId, { name: "Synthetic store card", baseType: "CARD" });
  await rejects(updateAccount(userId, debt.id, { customTypeId: card.id }), 409, "mortgage_account");
  assert.equal((await updateAccount(userId, debt.id, { customTypeId: loan.id })).customTypeId, loan.id, "a debt-based label keeps the mortgage link");
  await assert.rejects(createProperty(userId, { name: "Other flat", kind: "OTHER", mortgageAccountId: debt.id }), "one loan is not linked to two properties");
  await updateProperty(userId, property.id, { mortgageAccountId: null });
  assert.equal((await updateAccount(userId, debt.id, { type: "CHECKING" })).type, "CHECKING", "positive control: unlinked, the type can change");
});

test("a schedule creates its template and link atomically, and instalments confirm once through Recurring", async () => {
  const { userId, checking, property } = await fixture();
  const stranger = await fixture();
  const bad = { propertyId: property.id, accountId: checking.id, description: "Instalment", amountCents: -5, frequency: "MONTHLY", startDate: "2026-11-01" };
  await rejects(createSchedule(userId, bad), 422);
  await rejects(createSchedule(userId, { ...bad, amountCents: 5_000, accountId: stranger.checking.id }), 422);
  assert.equal(await db().recurringTemplate.count({ where: { userId } }), 0, "a failed schedule leaves no template behind");
  assert.equal(await db().condoSchedule.count({ where: { userId } }), 0);
  const created = await createSchedule(userId, { ...bad, amountCents: 5_000, startDate: "2026-11-05" });
  const listed = (await getOverview(userId, new Date("2026-11-20T12:00:00Z"))).properties.find((item) => item.id === property.id)!;
  assert.equal(listed.schedules[0].description, "Instalment");
  assert.equal(listed.schedules[0].nextDue, "2026-11-05", "the unresolved 5 November instalment is overdue and shown first");
  const confirm = () => resolveOccurrence(userId, { action: "confirm", templateId: created.template.id, dueDate: "2026-11-05" }, new Date("2026-11-20T12:00:00Z"));
  const results = await Promise.allSettled([confirm(), confirm()]);
  assert.equal(results.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal(await movementsOf(userId), 1);
  const after = (await getOverview(userId, new Date("2026-11-20T12:00:00Z"))).properties.find((item) => item.id === property.id)!;
  assert.equal(after.schedules[0].nextDue, "2026-12-05", "once confirmed, the next one is next month");
});

test("a property write that locks an account does not wait for an in-flight movement insert (no transfer deadlock)", async () => {
  const { userId, debt, property } = await fixture();
  let release!: () => void, inserted!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  const ready = new Promise<void>((resolve) => { inserted = resolve; });
  // An open transaction that inserted a movement into the DEBT account holds KEY SHARE on its row.
  const open = db().$transaction(async (tx) => {
    const id = randomUUID();
    await tx.movement.create({ data: { id, userId, accountId: debt.id, bookingDate: new Date("2026-11-03T00:00:00Z"), description: encryptText(userId, movementContext(id), "synthetic"), amountCents: 1 } });
    inserted();
    await held;
  });
  await ready;
  const link = updateProperty(userId, property.id, { mortgageAccountId: debt.id });
  const outcome = await Promise.race([link.then(() => "done"), new Promise((resolve) => setTimeout(() => resolve("blocked"), 3000))]);
  release();
  await open;
  await link;
  assert.equal(outcome, "done");
});

test("net worth adds the owner's value share, leaves the mortgage as the only liability, and equity is derived", async () => {
  const { userId, checking, debt, property } = await fixture();
  await updateProperty(userId, property.id, { ownershipBps: 5_000, mortgageAccountId: debt.id });
  await createValuation(userId, { propertyId: property.id, asOf: "2026-01-01", valueCents: 30_000_000 });
  const latest = await createValuation(userId, { propertyId: property.id, asOf: "2026-11-01", valueCents: 32_000_000 });
  await recordCheck(userId, { accountId: checking.id, asOf: "2026-11-01", balanceCents: 1_000_000 });
  await recordCheck(userId, { accountId: debt.id, asOf: "2026-11-01", balanceCents: -12_000_000 });
  const now = new Date("2026-11-20T12:00:00Z");
  const netWorth = await getNetWorth(userId, now);
  assert.equal(netWorth.propertiesCents, 16_000_000);
  assert.equal(netWorth.liabilitiesCents, 12_000_000);
  assert.equal(netWorth.netCents, 1_000_000 + 16_000_000 - 12_000_000);
  assert.equal(netWorth.series.at(-1)!.netCents, netWorth.netCents);
  const row = (await getOverview(userId, now)).properties[0];
  assert.equal(row.shareValueCents, 16_000_000);
  assert.equal(row.equityCents, 4_000_000);
  assert.equal(row.valueAsOf, "2026-11-01");
  await deleteValuation(userId, latest.id);
  assert.equal((await getNetWorth(userId, now)).propertiesCents, 15_000_000, "the earlier valuation applies again");
  await updateProperty(userId, property.id, { soldOn: "2026-11-10" });
  assert.equal((await getNetWorth(userId, now)).propertiesCents, 0, "sold properties drop out");
});

test("next due skips instalments that Recurring has confirmed, matched or skipped, and shows overdue ones first", async () => {
  const { userId, checking, property } = await fixture();
  const now = new Date("2026-11-20T12:00:00Z");
  const make = (description: string) => createSchedule(userId, { propertyId: property.id, accountId: checking.id, description, amountCents: 5_000, frequency: "MONTHLY", startDate: "2026-11-20" });
  const nextDue = async (description: string) => (await getOverview(userId, now)).properties[0].schedules.find((row) => row.description === description)!.nextDue;
  const confirmed = await make("Confirmed"), skipped = await make("Skipped"), matched = await make("Matched");
  for (const name of ["Confirmed", "Skipped", "Matched"]) assert.equal(await nextDue(name), "2026-11-20", "unresolved today is the next due date");
  await resolveOccurrence(userId, { action: "confirm", templateId: confirmed.template.id, dueDate: "2026-11-20" }, now);
  await resolveOccurrence(userId, { action: "skip", templateId: skipped.template.id, dueDate: "2026-11-20" }, now);
  const payment = await createMovement(userId, { accountId: checking.id, bookingDate: "2026-11-20", description: "Synthetic payment", amountCents: -5_000, categoryId: null });
  await resolveOccurrence(userId, { action: "match", templateId: matched.template.id, dueDate: "2026-11-20", movementId: payment.id }, now);
  for (const name of ["Confirmed", "Skipped", "Matched"]) assert.equal(await nextDue(name), "2026-12-20", `${name}: resolved today moves to the next month`);
  await resolveOccurrence(userId, { action: "reopen", templateId: confirmed.template.id, dueDate: "2026-11-20" }, now);
  assert.equal(await nextDue("Confirmed"), "2026-11-20", "reopened, it is due again");
});

test("property value shows in net worth and on the dashboard even with no accounts, and the collection reads are scoped", async () => {
  const { id: userId } = await admin.user.create({ data: { email: `m4-${randomUUID()}@example.test`, passwordHash: "synthetic" } });
  const other = await fixture();
  const home = await createProperty(userId, { name: "Account-free flat", kind: "OTHER" });
  await createValuation(userId, { propertyId: home.id, asOf: "2026-01-01", valueCents: 20_000_000 });
  const dashboard = await getDashboard(userId, new Date("2026-11-20T12:00:00Z"));
  assert.equal(dashboard.hasAccounts, false);
  assert.equal(dashboard.showNetWorth, true, "a valued property is enough to show net worth");
  assert.equal(dashboard.netWorthCents, 20_000_000);
  assert.equal((await getDashboard(other.userId, new Date("2026-11-20T12:00:00Z"))).showNetWorth, true, "positive control: accounts also show it");
  assert.equal((await listValuations(userId)).length, 1);
  assert.equal((await listValuations(other.userId)).length, 0, "another user's reads are empty");
});

// ---------------------------------------------------------------- costs (M4b)

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("costs count only instalments and archived charges leave movements editable", async () => {
  const a = await fixture(), b = await fixture();
  const due = new Date("2026-11-20T12:00:00Z"), now = new Date("2026-11-21T12:00:00Z");
  const schedule = await createSchedule(a.userId, { propertyId: a.property.id, accountId: a.checking.id, description: "Synthetic instalment", amountCents: 5_000, frequency: "MONTHLY", startDate: "2026-08-20" });
  const templateId = schedule.template.id;
  await resolveOccurrence(a.userId, { action: "confirm", templateId, dueDate: "2026-08-20" }, due);
  await resolveOccurrence(a.userId, { action: "skip", templateId, dueDate: "2026-09-20" }, due);
  const payment = await createMovement(a.userId, { accountId: a.checking.id, bookingDate: "2026-10-21", description: "Synthetic payment", amountCents: -5_200, categoryId: null });
  await resolveOccurrence(a.userId, { action: "match", templateId, dueDate: "2026-10-20", movementId: payment.id }, due);
  // 20 November is unresolved and past (overdue), 20 December is ahead (forecast).



  const legacyPayment = await createMovement(a.userId, { accountId: a.checking.id, bookingDate: "2026-09-01", description: "Legacy payment", amountCents: -500_000, categoryId: null });
  const table = await createTable(a.userId, { propertyId: a.property.id, label: "General", unitMillesimi: 100 });
  const archive = async (movementId: string | null, tableId: string | null) => {
    const id = randomUUID();
    return admin.condoCharge.create({ data: {
      id, userId: a.userId, propertyId: a.property.id, kind: "EXTRAORDINARY",
      title: encryptText(a.userId, chargeContext(id), "Archived charge"), dueDate: new Date("2026-09-01"),
      amountCents: 500_000, movementId, tableId, buildingTotalCents: tableId ? 5_000_000n : null,
    } });
  };
  const settled = await archive(legacyPayment.id, table.id);
  await archive(null, null);
  assert.ok(!("charges" in (await getOverview(a.userId, now)).properties[0]));
  assert.equal(await movementsOf(a.userId), 3, "archiving does not book a new movement");
  const storedPayment = await admin.movement.findUniqueOrThrow({ where: { id: legacyPayment.id } });
  assert.deepEqual([storedPayment.accountId, storedPayment.amountCents, storedPayment.bookingDate.toISOString().slice(0, 10)],
    [a.checking.id, -500_000, "2026-09-01"]);

  const mine = async (year = 2026) => (await getCosts(a.userId, { year }, now)).total;
  assert.deepEqual(await mine(), { paidTotal: 10_200, overdueOrdinary: 5_000, forecastOrdinary: 5_000, expectedTotal: 20_200 });
  assert.equal((await mine(2025)).expectedTotal, 0);
  assert.equal((await getCosts(a.userId, { year: 2026, propertyId: a.property.id }, now)).properties.length, 1);
  await deleteTable(a.userId, table.id);
  assert.equal((await admin.condoCharge.findUniqueOrThrow({ where: { id: settled.id } })).tableId, table.id);
  assert.equal((await updateMovement(a.userId, legacyPayment.id, { voided: true })).voided, true);

  await resolveOccurrence(a.userId, { action: "reopen", templateId, dueDate: "2026-08-20" }, now);
  const after = await mine();
  assert.deepEqual([after.paidTotal, after.overdueOrdinary], [5_200, 10_000]);

  const theirs = await getCosts(b.userId, { year: 2026 }, now);
  assert.equal(theirs.total.paidTotal, 0);
  assert.equal(theirs.properties.length, 1, "b sees only its own property");
  await rejects(getCosts(b.userId, { year: 2026, propertyId: a.property.id }, now), 404);
  await rejects(getCosts(a.userId, { year: 1999 }, now), 422, "validation");
});

test("unlinking an instalment schedule is refused once it has a payment, and waits for a concurrent confirmation", async () => {
  const { userId, checking, property } = await fixture();
  const now = new Date("2026-11-20T12:00:00Z");
  const make = (description: string) => createSchedule(userId, { propertyId: property.id, accountId: checking.id, description, amountCents: 5_000, frequency: "MONTHLY", startDate: "2026-11-20" });
  const unused = await make("Unused"), skipped = await make("Skipped only"), paid = await make("Paid");
  await resolveOccurrence(userId, { action: "skip", templateId: skipped.template.id, dueDate: "2026-11-20" }, now);
  await resolveOccurrence(userId, { action: "confirm", templateId: paid.template.id, dueDate: "2026-11-20" }, now);
  await rejects(deleteSchedule(userId, paid.id), 409, "schedule_has_payments");
  await deleteSchedule(userId, unused.id);
  await deleteSchedule(userId, skipped.id);
  await resolveOccurrence(userId, { action: "reopen", templateId: paid.template.id, dueDate: "2026-11-20" }, now);
  await deleteSchedule(userId, paid.id);
  assert.equal((await getOverview(userId, now)).properties[0].schedules.length, 0, "payment-free schedules unlink; the reopened one too");

  // Controlled race: a confirmation holds the template lock and has inserted its occurrence but not
  // committed. The unlink must wait for it, then see the payment and refuse.
  const racing = await make("Racing");
  const movement = await createMovement(userId, { accountId: checking.id, bookingDate: "2026-11-20", description: "Synthetic payment", amountCents: -5_000, categoryId: null });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let locked!: () => void;
  const holding = new Promise<void>((resolve) => { locked = resolve; });
  const confirming = admin.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT template_id FROM stead_recurring_templates WHERE user_id = ${userId}::uuid AND template_id = ${racing.template.id}::uuid FOR UPDATE`;
    await tx.recurringOccurrence.create({ data: { userId, templateId: racing.template.id, dueDate: new Date("2026-11-20"), status: "CONFIRMED", movementId: movement.id } });
    locked();
    await gate;
  });
  await holding;
  const unlink = deleteSchedule(userId, racing.id).then(() => "deleted", (error: { code?: string }) => error.code ?? "failed");
  assert.equal(await Promise.race([unlink, sleep(700).then(() => "blocked")]), "blocked", "the unlink waits for the template lock");
  release();
  await confirming;
  assert.equal(await unlink, "schedule_has_payments", "and then sees the committed payment");
});

test("deleting recurring instalments keeps paid property costs and removes future instalments", async () => {
  const { userId, checking, property } = await fixture();
  const now = new Date("2026-11-21T12:00:00Z");
  const make = (description: string) => createSchedule(userId, {
    propertyId: property.id, accountId: checking.id, description, amountCents: 5_000,
    frequency: "MONTHLY", startDate: "2026-11-20",
  });
  const paid = await make("Synthetic paid"), unpaid = await make("Synthetic unpaid");
  await resolveOccurrence(userId, { action: "confirm", templateId: paid.template.id, dueDate: "2026-11-20" }, now);
  await deleteTemplate(userId, unpaid.template.id);
  await deleteTemplate(userId, paid.template.id);
  assert.equal((await getOverview(userId, now)).properties[0].schedules.length, 0);
  assert.deepEqual((await getCosts(userId, { year: 2026 }, now)).total, {
    paidTotal: 5_000, overdueOrdinary: 0, forecastOrdinary: 0, expectedTotal: 5_000,
  });
});

test("costs: archived schedules add nothing and a weekly date beyond index 5,000 resolves and shows as paid", async () => {
  const { userId, checking, property } = await fixture();
  const now = new Date("2026-11-21T12:00:00Z");
  const costs = async (year: number, at = now) => (await getCosts(userId, { year }, at)).total;

  const monthly = await createSchedule(userId, { propertyId: property.id, accountId: checking.id, description: "Synthetic", amountCents: 5_000, frequency: "MONTHLY", startDate: "2026-10-20" });
  assert.deepEqual([(await costs(2026)).overdueOrdinary, (await costs(2026)).forecastOrdinary], [10_000, 5_000]);
  await updateTemplate(userId, monthly.template.id, { archived: true });
  assert.equal((await costs(2026)).expectedTotal, 0, "archived: no overdue and no forecast");
  await updateTemplate(userId, monthly.template.id, { archived: false });
  assert.equal((await costs(2026)).expectedTotal, 15_000, "restored: counted again");


  const weekly = await createSchedule(userId, { propertyId: property.id, accountId: checking.id, description: "Weekly since 2000", amountCents: 100, frequency: "WEEKLY", startDate: "2000-01-01" });
  const late = addDays("2000-01-01", 5_100 * 7);
  const lateNow = new Date(`${addDays(late, 1)}T12:00:00Z`);
  await resolveOccurrence(userId, { action: "confirm", templateId: weekly.template.id, dueDate: late }, lateNow);
  assert.equal((await costs(Number(late.slice(0, 4)), lateNow)).paidTotal, 100, "overdue before, paid after the confirmation");
});

test("costs read one snapshot while instalments are confirmed and reopened concurrently", async () => {
  const { userId, checking, property } = await fixture();
  const due = new Date("2026-09-20T12:00:00Z"), now = new Date("2026-11-21T12:00:00Z");
  const schedule = await createSchedule(userId, { propertyId: property.id, accountId: checking.id, description: "Synthetic", amountCents: 5_000, frequency: "MONTHLY", startDate: "2026-09-20" });
  const templateId = schedule.template.id;
  // Each instalment is overdue or paid at the same 5,000 EUR cents, so the expected total never changes.
  const before = (await getCosts(userId, { year: 2026 }, now)).total.expectedTotal;
  let running = true;
  const toggler = (async () => {
    for (let i = 0; i < 25; i++) {
      await resolveOccurrence(userId, { action: "confirm", templateId, dueDate: "2026-09-20" }, due);
      await resolveOccurrence(userId, { action: "reopen", templateId, dueDate: "2026-09-20" }, due);
    }
    running = false;
  })();
  const seen = new Set<number>();
  while (running) seen.add((await getCosts(userId, { year: 2026 }, now)).total.expectedTotal);
  await toggler;
  assert.deepEqual([...seen], [before], "every read saw a consistent state");
});

/**
 * Orders two real writers deterministically: an outside transaction holds the template row lock, the
 * first writer queues on it, then the second; releasing it lets them run in queue order.
 */
async function queuedPair(userId: string, templateId: string, first: () => Promise<unknown>, second: () => Promise<unknown>) {
  const outcome = (promise: Promise<unknown>) => promise.then(() => ({ ok: true as const }), (error: { code?: string }) => ({ ok: false as const, code: error.code }));
  let release!: () => void, locked!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const holding = new Promise<void>((resolve) => { locked = resolve; });
  const holder = admin.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT template_id FROM stead_recurring_templates WHERE user_id = ${userId}::uuid AND template_id = ${templateId}::uuid FOR UPDATE`;
    locked();
    await gate;
  });
  await holding;
  const one = outcome(first());
  await sleep(400);
  const two = outcome(second());
  await sleep(400);
  release();
  await holder;
  return [await one, await two];
}

test("unlink versus the real confirm and match writers: the payment that commits first decides, and nothing is lost", async () => {
  const { userId, checking, property } = await fixture();
  const now = new Date("2026-11-20T12:00:00Z");
  const make = (description: string) => createSchedule(userId, { propertyId: property.id, accountId: checking.id, description, amountCents: 5_000, frequency: "MONTHLY", startDate: "2026-11-20" });
  const paidThisYear = async () => (await getCosts(userId, { year: 2026 }, now)).total.paidTotal;
  const schedulesLeft = async () => (await getOverview(userId, now)).properties[0].schedules.length;

  // Payment first (confirm, then match): the unlink waits, sees the committed payment and refuses.
  const confirmed = await make("Confirm first");
  const [confirmOk, unlinkRefused] = await queuedPair(userId, confirmed.template.id,
    () => resolveOccurrence(userId, { action: "confirm", templateId: confirmed.template.id, dueDate: "2026-11-20" }, now),
    () => deleteSchedule(userId, confirmed.id));
  assert.deepEqual([confirmOk.ok, unlinkRefused], [true, { ok: false, code: "schedule_has_payments" }]);
  assert.equal(await paidThisYear(), 5_000, "the payment keeps its property");

  const matched = await make("Match first");
  const payment = await createMovement(userId, { accountId: checking.id, bookingDate: "2026-11-20", description: "Synthetic payment", amountCents: -4_800, categoryId: null });
  const [matchOk, matchUnlink] = await queuedPair(userId, matched.template.id,
    () => resolveOccurrence(userId, { action: "match", templateId: matched.template.id, dueDate: "2026-11-20", movementId: payment.id }, now),
    () => deleteSchedule(userId, matched.id));
  assert.deepEqual([matchOk.ok, matchUnlink], [true, { ok: false, code: "schedule_has_payments" }]);
  assert.equal(await paidThisYear(), 9_800);
  assert.equal(await schedulesLeft(), 2, "both schedules are still linked");

  // Unlink first: the confirmation waits for the delete, then books against the surviving, unlinked template.
  const unlinkFirst = await make("Unlink first");
  const [deleted, lateConfirm] = await queuedPair(userId, unlinkFirst.template.id,
    () => deleteSchedule(userId, unlinkFirst.id),
    () => resolveOccurrence(userId, { action: "confirm", templateId: unlinkFirst.template.id, dueDate: "2026-11-20" }, now));
  assert.deepEqual([deleted.ok, lateConfirm.ok], [true, true]);
  assert.equal(await schedulesLeft(), 2, "the unlinked schedule is gone from the property");
  assert.equal(await paidThisYear(), 9_800, "the late payment is a normal recurring expense, not a property cost");
  const occurrence = await db().recurringOccurrence.findFirst({ where: { userId, templateId: unlinkFirst.template.id }, select: { status: true, movementId: true } });
  assert.deepEqual([occurrence?.status, occurrence?.movementId !== null], ["CONFIRMED", true], "the template survived and holds the movement link");
});
