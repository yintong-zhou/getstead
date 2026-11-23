// Properties and condominium (M4a). Every write takes a per-user advisory lock (key 4) first, then
// row locks in a fixed order: account (FOR NO KEY UPDATE, never FOR UPDATE: movement inserts hold
// KEY SHARE on the account row and FOR UPDATE would deadlock with a transfer), property, charge,
// movement. Properties and charges are archived or voided, never deleted.

import { randomUUID } from "node:crypto";
import type { CondoCharge, Prisma, Property } from "../../db/generated/client.ts";
import { db } from "../auth/database.ts";
import { fromDate, nextOccurrenceAfter, occurrencesThrough, romeToday, toDate, type IsoDate } from "../cash-flow/dates.ts";
import { ApiError, conflict, notFound } from "../cash-flow/errors.ts";
import { lockMovements, movementSelect, toMovementDto } from "../cash-flow/movements.ts";
import { createTemplate } from "../cash-flow/recurring.ts";
import { chargeContext, decryptText, encryptText, movementContext, templateContext } from "../cash-flow/text-crypto.ts";
import { MAX_CENTS, Reader } from "../cash-flow/validate.ts";
import { getNetWorth } from "../net-worth/service.ts";
import {
  addCosts, chargeKinds, costsToNumbers, emptyCosts, equityCents, millesimiShareCents, propertiesAt, propertyCosts, propertyKinds, votingWeight,
  type CostSchedule, type PaidCost,
} from "./calc.ts";

type Client = Prisma.TransactionClient;
export const MAX_PROPERTIES = 50;
export const MAX_VALUATIONS = 2_000;
export const MAX_CHARGES = 2_000;
const MAX_VALUE_CENTS = 1_000_000_000_000;
const MAX_BUILDING_CENTS = 100_000_000_000;

async function userLock(client: Client, userId: string) {
  await client.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${userId}, 4))`;
}
function write<T>(userId: string, operation: (client: Client) => Promise<T>) {
  return db().$transaction(async (client) => { await userLock(client, userId); return operation(client); }, { timeout: 30_000 });
}
async function lockAccount(client: Client, userId: string, id: string, field = "accountId") {
  const rows = await client.$queryRaw<{ id: string }[]>`SELECT account_id AS id FROM stead_accounts WHERE user_id = ${userId}::uuid AND account_id = ${id}::uuid FOR NO KEY UPDATE`;
  if (!rows.length) throw new ApiError(422, "validation", field);
}
async function lockProperty(client: Client, userId: string, id: string) {
  const rows = await client.$queryRaw<{ id: string }[]>`SELECT property_id AS id FROM stead_properties WHERE user_id = ${userId}::uuid AND property_id = ${id}::uuid FOR UPDATE`;
  if (!rows.length) throw notFound();
}
async function lockCharge(client: Client, userId: string, id: string) {
  const rows = await client.$queryRaw<{ id: string }[]>`SELECT charge_id AS id FROM stead_condo_charges WHERE user_id = ${userId}::uuid AND charge_id = ${id}::uuid FOR UPDATE`;
  if (!rows.length) throw notFound();
}
/** Range failures on money use the same stable code as investments. */
function bounded(reader: Reader, field: string, min: number, max: number) {
  try { return reader.integer(field, min, max); }
  catch (error) {
    if (error instanceof ApiError) throw new ApiError(422, "value_out_of_range", field);
    throw error;
  }
}
/** Same as `bounded`, but a null clears the value and an absent key stays undefined. */
function nullableBounded(reader: Reader, field: string, min: number, max: number) {
  try { return reader.nullableInteger(field, min, max); }
  catch (error) {
    if (error instanceof ApiError) throw new ApiError(422, "value_out_of_range", field);
    throw error;
  }
}
async function mortgageAccount(client: Client, userId: string, accountId: string) {
  await lockAccount(client, userId, accountId, "mortgageAccountId");
  const account = await client.account.findFirst({ where: { userId, id: accountId }, select: { type: true } });
  if (account?.type !== "DEBT") throw new ApiError(422, "validation", "mortgageAccountId");
}

// ---------------------------------------------------------------- properties

function propertyData(input: Record<string, unknown>, partial: boolean) {
  const reader = new Reader(input);
  const name = partial ? reader.optionalText("name", 80) : reader.text("name", 80);
  const kind = partial ? reader.optionalOneOf("kind", propertyKinds) : reader.oneOf("kind", propertyKinds);
  const ownershipBps = reader.has("ownershipBps") ? reader.integer("ownershipBps", 1, 10_000) : partial ? undefined : 10_000;
  const mortgageAccountId = reader.nullableUuid("mortgageAccountId");
  const soldOn = reader.nullableDate("soldOn");
  const archived = partial ? reader.optionalBool("archived") : undefined;
  reader.done();
  return {
    name, kind, ownershipBps, mortgageAccountId, soldOn,
    ...(archived === undefined ? {} : { archivedAt: archived ? new Date() : null }),
  };
}
const soldOnData = (soldOn: IsoDate | null | undefined) => soldOn === undefined ? undefined : soldOn === null ? null : toDate(soldOn);

export async function createProperty(userId: string, input: Record<string, unknown>) {
  const data = propertyData(input, false);
  return write(userId, async (client) => {
    if (await client.property.count({ where: { userId } }) >= MAX_PROPERTIES) throw new ApiError(422, "property_limit");
    if (data.mortgageAccountId) await mortgageAccount(client, userId, data.mortgageAccountId);
    const row = await client.property.create({
      data: { userId, name: data.name!, kind: data.kind!, ownershipBps: data.ownershipBps!, mortgageAccountId: data.mortgageAccountId ?? null, soldOn: soldOnData(data.soldOn) ?? null },
    });
    return propertyDto(row);
  });
}
export async function updateProperty(userId: string, id: string, input: Record<string, unknown>) {
  const data = propertyData(input, true);
  return write(userId, async (client) => {
    if (data.mortgageAccountId) await mortgageAccount(client, userId, data.mortgageAccountId);
    await lockProperty(client, userId, id);
    const row = await client.property.update({
      where: { userId_id: { userId, id } },
      data: { name: data.name, kind: data.kind, ownershipBps: data.ownershipBps, mortgageAccountId: data.mortgageAccountId, soldOn: soldOnData(data.soldOn), archivedAt: data.archivedAt },
    });
    return propertyDto(row);
  });
}
function propertyDto(row: Property) {
  return {
    id: row.id, name: row.name, kind: row.kind, ownershipBps: row.ownershipBps,
    mortgageAccountId: row.mortgageAccountId, soldOn: row.soldOn ? fromDate(row.soldOn) : null, archived: row.archivedAt !== null,
  };
}

// ---------------------------------------------------------------- valuations

export async function createValuation(userId: string, input: Record<string, unknown>) {
  const reader = new Reader(input);
  const propertyId = reader.uuid("propertyId");
  const asOf = reader.date("asOf");
  const valueCents = bounded(reader, "valueCents", 1, MAX_VALUE_CENTS);
  reader.done();
  return write(userId, async (client) => {
    await lockProperty(client, userId, propertyId);
    if (await client.propertyValuation.count({ where: { userId } }) >= MAX_VALUATIONS) throw new ApiError(422, "valuation_limit");
    const row = await client.propertyValuation.create({ data: { userId, propertyId, asOf: toDate(asOf), valueCents: BigInt(valueCents) } });
    return { id: row.id, propertyId, asOf, valueCents };
  });
}
export async function updateValuation(userId: string, id: string, input: Record<string, unknown>) {
  const reader = new Reader(input);
  const valueCents = bounded(reader, "valueCents", 1, MAX_VALUE_CENTS);
  reader.done();
  return write(userId, async (client) => {
    const current = await client.propertyValuation.findUnique({ where: { userId_id: { userId, id } } });
    if (!current) throw notFound();
    await lockProperty(client, userId, current.propertyId);
    const row = await client.propertyValuation.update({ where: { userId_id: { userId, id } }, data: { valueCents: BigInt(valueCents) } });
    return { id, propertyId: row.propertyId, asOf: fromDate(row.asOf), valueCents };
  });
}
export async function deleteValuation(userId: string, id: string) {
  await write(userId, async (client) => {
    const current = await client.propertyValuation.findUnique({ where: { userId_id: { userId, id } } });
    if (!current) throw notFound();
    await lockProperty(client, userId, current.propertyId);
    await client.propertyValuation.delete({ where: { userId_id: { userId, id } } });
  });
}

// ---------------------------------------------------------------- millesimal tables

function tableData(input: Record<string, unknown>, partial: boolean) {
  const reader = new Reader(input);
  const propertyId = partial ? undefined : reader.uuid("propertyId");
  const label = partial ? reader.optionalText("label", 60) : reader.text("label", 60);
  const unitMillesimi = reader.has("unitMillesimi") ? reader.integer("unitMillesimi", 1, 100_000) : partial ? undefined : reader.integer("unitMillesimi", 1, 100_000);
  const totalMillesimi = reader.has("totalMillesimi") ? reader.integer("totalMillesimi", 1, 100_000) : partial ? undefined : 1_000;
  reader.done();
  return { propertyId, label, unitMillesimi, totalMillesimi };
}
export async function createTable(userId: string, input: Record<string, unknown>) {
  const data = tableData(input, false);
  if (data.unitMillesimi! > data.totalMillesimi!) throw new ApiError(422, "validation", "unitMillesimi");
  return write(userId, async (client) => {
    await lockProperty(client, userId, data.propertyId!);
    const row = await client.condoTable.create({ data: { userId, propertyId: data.propertyId!, label: data.label!, unitMillesimi: data.unitMillesimi!, totalMillesimi: data.totalMillesimi! } });
    return tableDto(row);
  });
}
export async function updateTable(userId: string, id: string, input: Record<string, unknown>) {
  const data = tableData(input, true);
  return write(userId, async (client) => {
    const current = await client.condoTable.findUnique({ where: { userId_id: { userId, id } } });
    if (!current) throw notFound();
    await lockProperty(client, userId, current.propertyId);
    const unit = data.unitMillesimi ?? current.unitMillesimi, total = data.totalMillesimi ?? current.totalMillesimi;
    if (unit > total) throw new ApiError(422, "validation", "unitMillesimi");
    const row = await client.condoTable.update({ where: { userId_id: { userId, id } }, data: { label: data.label, unitMillesimi: data.unitMillesimi, totalMillesimi: data.totalMillesimi } });
    return tableDto(row);
  });
}
export async function deleteTable(userId: string, id: string) {
  await write(userId, async (client) => {
    const current = await client.condoTable.findUnique({ where: { userId_id: { userId, id } } });
    if (!current) throw notFound();
    await lockProperty(client, userId, current.propertyId);
    // The composite foreign key (ON DELETE RESTRICT) refuses a table that charges still use.
    if (await client.condoCharge.count({ where: { userId, tableId: id } })) throw conflict("in_use");
    await client.condoTable.delete({ where: { userId_id: { userId, id } } });
  });
}
function tableDto(row: { id: string; propertyId: string; label: string; unitMillesimi: number; totalMillesimi: number }) {
  return { id: row.id, propertyId: row.propertyId, label: row.label, unitMillesimi: row.unitMillesimi, totalMillesimi: row.totalMillesimi, weight: votingWeight(row.unitMillesimi, row.totalMillesimi) };
}

// ---------------------------------------------------------------- instalment schedules

/** Creates an expense template and links it to the property in one transaction; confirming stays in Recurring. */
export async function createSchedule(userId: string, input: Record<string, unknown>) {
  const { propertyId: rawProperty, ...template } = input;
  const propertyId = new Reader({ propertyId: rawProperty }).uuid("propertyId");
  return write(userId, async (client) => {
    await lockProperty(client, userId, propertyId);
    const created = await createTemplate(userId, template, client);
    const row = await client.condoSchedule.create({ data: { userId, propertyId, templateId: created.id } });
    return { id: row.id, propertyId, template: created };
  });
}
/**
 * Unlinking removes the only property-to-template association, which cost reports need for paid
 * history, so it is refused once any instalment has a movement (archive the template instead).
 * The template row lock is the one `resolveOccurrence` takes: a confirmation committed first is seen
 * by the check; one arriving later waits for the delete and books against a template that is no
 * longer a property schedule, which is what the unlink meant.
 */
export async function deleteSchedule(userId: string, id: string) {
  await write(userId, async (client) => {
    const current = await client.condoSchedule.findUnique({ where: { userId_id: { userId, id } } });
    if (!current) throw notFound();
    await lockProperty(client, userId, current.propertyId);
    await client.$queryRaw`SELECT template_id FROM stead_recurring_templates WHERE user_id = ${userId}::uuid AND template_id = ${current.templateId}::uuid FOR UPDATE`;
    if (await client.recurringOccurrence.count({ where: { userId, templateId: current.templateId, movementId: { not: null } } })) throw conflict("schedule_has_payments");
    await client.condoSchedule.delete({ where: { userId_id: { userId, id } } });
  });
}

// ---------------------------------------------------------------- one-off charges

async function chargeTable(client: Client, userId: string, propertyId: string, tableId: string) {
  const table = await client.condoTable.findFirst({ where: { userId, propertyId, id: tableId }, select: { id: true } });
  if (!table) throw new ApiError(422, "validation", "tableId");
}
function chargeFields(reader: Reader, partial: boolean) {
  const kind = partial ? reader.optionalOneOf("kind", chargeKinds) : reader.oneOf("kind", chargeKinds);
  const title = partial ? reader.optionalText("title", 120) : reader.text("title", 120);
  const dueDate = partial ? reader.optionalDate("dueDate") : reader.date("dueDate");
  const amountCents = partial && !reader.has("amountCents") ? undefined : bounded(reader, "amountCents", 1, MAX_CENTS);
  const approvedOn = reader.nullableDate("approvedOn");
  const tableId = reader.nullableUuid("tableId");
  const buildingTotalCents = nullableBounded(reader, "buildingTotalCents", 1, MAX_BUILDING_CENTS);
  return { kind, title, dueDate, amountCents, approvedOn, tableId, buildingTotalCents };
}
export async function createCharge(userId: string, input: Record<string, unknown>) {
  const reader = new Reader(input);
  const propertyId = reader.uuid("propertyId");
  const f = chargeFields(reader, false);
  reader.done();
  const hasTable = typeof f.tableId === "string", hasTotal = typeof f.buildingTotalCents === "number";
  if (hasTable !== hasTotal) throw new ApiError(422, "validation", hasTable ? "buildingTotalCents" : "tableId");
  if (hasTotal && f.buildingTotalCents! < f.amountCents!) throw new ApiError(422, "validation", "buildingTotalCents");
  return write(userId, async (client) => {
    await lockProperty(client, userId, propertyId);
    if (await client.condoCharge.count({ where: { userId } }) >= MAX_CHARGES) throw new ApiError(422, "charge_limit");
    if (hasTable) await chargeTable(client, userId, propertyId, f.tableId!);
    const id = randomUUID();
    const row = await client.condoCharge.create({
      data: {
        id, userId, propertyId, kind: f.kind!, title: encryptText(userId, chargeContext(id), f.title!), dueDate: toDate(f.dueDate!), amountCents: f.amountCents!,
        approvedOn: f.approvedOn ? toDate(f.approvedOn) : null, tableId: hasTable ? f.tableId! : null, buildingTotalCents: hasTotal ? BigInt(f.buildingTotalCents!) : null,
      },
    });
    return chargeDto(userId, row, null);
  });
}

const chargeActions = ["settle", "reopen"] as const;
export async function updateCharge(userId: string, id: string, input: Record<string, unknown>) {
  const reader = new Reader(input);
  const action = reader.optionalOneOf("action", chargeActions);
  if (action === "settle") return settleCharge(userId, id, reader);
  if (action === "reopen") { reader.done(); return reopenCharge(userId, id); }
  const voided = reader.optionalBool("voided");
  if (voided !== undefined) { reader.done(); return setChargeVoided(userId, id, voided); }
  const f = chargeFields(reader, true);
  reader.done();
  return write(userId, async (client) => {
    await lockCharge(client, userId, id);
    const current = await client.condoCharge.findUniqueOrThrow({ where: { userId_id: { userId, id } } });
    if (current.movementId) throw conflict("settled");
    if (current.voidedAt) throw conflict("voided");
    const table = f.tableId === undefined ? current.tableId : f.tableId;
    const total = f.buildingTotalCents === undefined ? (current.buildingTotalCents === null ? null : Number(current.buildingTotalCents)) : f.buildingTotalCents;
    const amount = f.amountCents ?? current.amountCents;
    if ((table === null) !== (total === null)) throw new ApiError(422, "validation", table === null ? "buildingTotalCents" : "tableId");
    if (total !== null && total < amount) throw new ApiError(422, "validation", "buildingTotalCents");
    if (table && table !== current.tableId) await chargeTable(client, userId, current.propertyId, table);
    const row = await client.condoCharge.update({
      where: { userId_id: { userId, id } },
      data: {
        kind: f.kind, amountCents: f.amountCents,
        title: f.title === undefined ? undefined : encryptText(userId, chargeContext(id), f.title),
        dueDate: f.dueDate ? toDate(f.dueDate) : undefined,
        approvedOn: f.approvedOn === undefined ? undefined : f.approvedOn ? toDate(f.approvedOn) : null,
        tableId: table, buildingTotalCents: total === null ? null : BigInt(total),
      },
    });
    return chargeDto(userId, row, null);
  });
}
async function setChargeVoided(userId: string, id: string, voided: boolean) {
  return write(userId, async (client) => {
    await lockCharge(client, userId, id);
    const current = await client.condoCharge.findUniqueOrThrow({ where: { userId_id: { userId, id } } });
    if (current.movementId) throw conflict("settled"); // reopen first, so the movement is never left pointing at a voided charge
    const row = await client.condoCharge.update({ where: { userId_id: { userId, id } }, data: { voidedAt: voided ? current.voidedAt ?? new Date() : null } });
    return chargeDto(userId, row, null);
  });
}
/** Books one expense movement for the charge, exactly once: the charge row lock plus the unique movement link. */
async function settleCharge(userId: string, id: string, reader: Reader) {
  const accountId = reader.uuid("accountId");
  const bookingDate = reader.optionalDate("bookingDate");
  const categoryId = reader.nullableUuid("categoryId") ?? null;
  reader.done();
  return write(userId, async (client) => {
    await lockAccount(client, userId, accountId);
    await lockCharge(client, userId, id);
    const current = await client.condoCharge.findUniqueOrThrow({ where: { userId_id: { userId, id } } });
    if (current.voidedAt) throw conflict("voided");
    if (current.movementId) throw conflict("already_settled");
    const account = await client.account.findFirst({ where: { userId, id: accountId }, select: { archivedAt: true } });
    if (!account) throw new ApiError(422, "validation", "accountId");
    if (account.archivedAt) throw conflict("archived");
    if (categoryId) {
      const category = await client.category.findFirst({ where: { userId, id: categoryId }, select: { kind: true, archivedAt: true } });
      if (!category || category.kind !== "EXPENSE") throw new ApiError(422, "validation", "categoryId");
      if (category.archivedAt) throw conflict("archived");
    }
    const movementId = randomUUID();
    const title = decryptText(userId, chargeContext(id), current.title);
    const movement = await client.movement.create({
      data: {
        id: movementId, userId, accountId, categoryId,
        bookingDate: bookingDate ? toDate(bookingDate) : current.dueDate,
        description: encryptText(userId, movementContext(movementId), title),
        amountCents: -current.amountCents,
      },
      select: movementSelect,
    });
    const row = await client.condoCharge.update({ where: { userId_id: { userId, id } }, data: { movementId } });
    return { charge: chargeDto(userId, row, null), movement: toMovementDto(userId, { ...movement, condoCharge: { id } }) };
  });
}
/** Unlinks the movement and leaves it booked, as reopening a recurring occurrence does. */
async function reopenCharge(userId: string, id: string) {
  return write(userId, async (client) => {
    await lockCharge(client, userId, id);
    const current = await client.condoCharge.findUniqueOrThrow({ where: { userId_id: { userId, id } } });
    if (!current.movementId) throw conflict("not_settled");
    await lockMovements(client, userId, [current.movementId]);
    const row = await client.condoCharge.update({ where: { userId_id: { userId, id } }, data: { movementId: null } });
    return { charge: chargeDto(userId, row, null) };
  });
}
function chargeDto(userId: string, row: CondoCharge, table: { unitMillesimi: number; totalMillesimi: number } | null) {
  const buildingTotalCents = row.buildingTotalCents === null ? null : Number(row.buildingTotalCents);
  return {
    id: row.id, propertyId: row.propertyId, kind: row.kind, title: decryptText(userId, chargeContext(row.id), row.title),
    dueDate: fromDate(row.dueDate), amountCents: row.amountCents, approvedOn: row.approvedOn ? fromDate(row.approvedOn) : null,
    tableId: row.tableId, buildingTotalCents,
    /** What the millesimi table gives for the building-wide amount; the invoiced `amountCents` is what counts. */
    expectedShareCents: table && buildingTotalCents !== null ? millesimiShareCents(buildingTotalCents, table.unitMillesimi, table.totalMillesimi) : null,
    voided: row.voidedAt !== null, settled: row.movementId !== null, movementId: row.movementId,
  };
}

// ---------------------------------------------------------------- overview

export async function getOverview(userId: string, now = new Date()) {
  const today = romeToday(now);
  const [properties, valuations, tables, schedules, charges, netWorth, resolved] = await Promise.all([
    db().property.findMany({ where: { userId }, orderBy: [{ name: "asc" }, { id: "asc" }] }),
    db().propertyValuation.findMany({ where: { userId }, orderBy: [{ asOf: "desc" }, { id: "asc" }] }),
    db().condoTable.findMany({ where: { userId }, orderBy: [{ label: "asc" }, { id: "asc" }] }),
    db().condoSchedule.findMany({ where: { userId }, include: { template: true }, orderBy: { id: "asc" } }),
    db().condoCharge.findMany({ where: { userId }, orderBy: [{ dueDate: "asc" }, { id: "asc" }] }),
    getNetWorth(userId, now),
    db().recurringOccurrence.findMany({ where: { userId, template: { condoSchedule: { isNot: null } } }, select: { templateId: true, dueDate: true } }),
  ]);
  const resolvedKeys = new Set(resolved.map((item) => `${item.templateId}:${fromDate(item.dueDate)}`));
  const valuationInput = valuations.map((row) => ({ propertyId: row.propertyId, asOf: fromDate(row.asOf), valueCents: Number(row.valueCents) }));
  const at = propertiesAt(properties.map((row) => ({ id: row.id, ownershipBps: row.ownershipBps, soldOn: row.soldOn ? fromDate(row.soldOn) : null })), valuationInput, today);
  const byProperty = new Map(at.rows.map((row) => [row.id, row]));
  const balances = new Map(netWorth.perAccount.map((row) => [row.id, row.balanceCents]));
  const tableById = new Map(tables.map((row) => [row.id, row]));
  return {
    today,
    propertiesCents: at.totalCents,
    properties: properties.map((row) => {
      const value = byProperty.get(row.id)!;
      const debt = row.mortgageAccountId ? balances.get(row.mortgageAccountId) ?? null : null;
      const latest = valuationInput.filter((item) => item.propertyId === row.id && item.asOf <= today).sort((a, b) => b.asOf.localeCompare(a.asOf))[0];
      return {
        ...propertyDto(row),
        valueCents: value.valueCents, valueAsOf: latest?.asOf ?? null, shareValueCents: value.shareValueCents, noValuation: value.noValuation,
        debtBalanceCents: debt, equityCents: debt === null || value.noValuation ? null : equityCents(value.shareValueCents, debt),
        valuations: valuations.filter((item) => item.propertyId === row.id).map((item) => ({ id: item.id, asOf: fromDate(item.asOf), valueCents: Number(item.valueCents) })),
        tables: tables.filter((item) => item.propertyId === row.id).map(tableDto),
        schedules: schedules.filter((item) => item.propertyId === row.id).map((item) => {
          const rule = { frequency: item.template.frequency, startDate: fromDate(item.template.startDate), endDate: item.template.endDate ? fromDate(item.template.endDate) : null };
          return {
            id: item.id, templateId: item.templateId, description: decryptText(userId, templateContext(item.templateId), item.template.description),
            amountCents: item.template.amountCents, frequency: item.template.frequency, archived: item.template.archivedAt !== null,
            nextDue: item.template.archivedAt ? null : nextUnresolved(item.templateId, rule, today, resolvedKeys),
          };
        }),
        charges: charges.filter((item) => item.propertyId === row.id).map((item) => chargeDto(userId, item, item.tableId ? tableById.get(item.tableId) ?? null : null)),
      };
    }),
  };
}
export type Overview = Awaited<ReturnType<typeof getOverview>>;
/** The earliest occurrence Recurring has not resolved (confirmed, matched or skipped): overdue ones first, else the next future one. */
function nextUnresolved(templateId: string, rule: Parameters<typeof occurrencesThrough>[0], today: IsoDate, resolved: Set<string>) {
  const open = occurrencesThrough(rule, today).find((date) => !resolved.has(`${templateId}:${date}`));
  return open ?? nextOccurrenceAfter(rule, today);
}

export async function listValuations(userId: string) {
  const rows = await db().propertyValuation.findMany({ where: { userId }, orderBy: [{ asOf: "desc" }, { id: "asc" }] });
  return rows.map((row) => ({ id: row.id, propertyId: row.propertyId, asOf: fromDate(row.asOf), valueCents: Number(row.valueCents) }));
}
export async function listCharges(userId: string) {
  const rows = await db().condoCharge.findMany({ where: { userId }, include: { table: true }, orderBy: [{ dueDate: "asc" }, { id: "asc" }] });
  return rows.map((row) => chargeDto(userId, row, row.table));
}

// ---------------------------------------------------------------- costs

const costYear = (value: number) => {
  if (!Number.isInteger(value) || value < 2000 || value > 2100) throw new ApiError(422, "validation", "year");
  return value;
};
/** Parses the optional `year` and `propertyId` query values; the year defaults to the current Rome year. */
export function parseCostQuery(params: URLSearchParams, now = new Date()) {
  const raw = params.get("year");
  const year = raw === null ? Number(romeToday(now).slice(0, 4)) : costYear(/^\d{4}$/.test(raw) ? Number(raw) : NaN);
  const id = params.get("propertyId");
  return { year, propertyId: id === null ? undefined : new Reader({ propertyId: id }).uuid("propertyId") };
}

/**
 * Condominium costs per property for one calendar year, plus a total. Read-only: no lock is taken.
 * Paid figures are the currently linked settlements (a reopened charge or instalment is not paid any
 * more), dated by the movement's booking date; see `propertyCosts` for overdue and forecast.
 */
export async function getCosts(userId: string, query: { year: number; propertyId?: string }, now = new Date()) {
  const year = costYear(query.year);
  const today = romeToday(now);
  const first = toDate(`${year}-01-01`), last = toDate(`${year}-12-31`);
  const propertyFilter = query.propertyId ? { id: query.propertyId } : {};
  // One RepeatableRead snapshot: a confirmation or reopening committing between two reads must not
  // make an instalment count as neither paid nor overdue, or as both.
  const { properties, occurrences, charges, schedules, resolved } = await db().$transaction(async (tx) => {
    const properties = await tx.property.findMany({ where: { userId, ...propertyFilter }, orderBy: [{ name: "asc" }, { id: "asc" }] });
    if (query.propertyId && !properties.length) throw notFound();
    const ids = properties.map((row) => row.id);
    const inYear = { bookingDate: { gte: first, lte: last }, voidedAt: null };
    const occurrences = await tx.recurringOccurrence.findMany({
      where: { userId, movementId: { not: null }, movement: { is: inYear }, template: { condoSchedule: { is: { propertyId: { in: ids } } } } },
      select: { movement: { select: { amountCents: true, bookingDate: true } }, template: { select: { condoSchedule: { select: { propertyId: true } } } } },
    });
    const charges = await tx.condoCharge.findMany({
      where: { userId, propertyId: { in: ids }, voidedAt: null },
      select: { propertyId: true, kind: true, dueDate: true, amountCents: true, movementId: true, movement: { select: { amountCents: true, bookingDate: true, voidedAt: true } } },
    });
    const schedules = await tx.condoSchedule.findMany({ where: { userId, propertyId: { in: ids } }, include: { template: true } });
    const resolved = await tx.recurringOccurrence.findMany({
      where: { userId, dueDate: { gte: first, lte: last }, template: { condoSchedule: { is: { propertyId: { in: ids } } } } },
      select: { templateId: true, dueDate: true },
    });
    return { properties, occurrences, charges, schedules, resolved };
  }, { isolationLevel: "RepeatableRead", timeout: 30_000 });

  const resolvedBy = new Map<string, Set<IsoDate>>();
  for (const row of resolved) {
    const set = resolvedBy.get(row.templateId) ?? new Set<IsoDate>();
    set.add(fromDate(row.dueDate));
    resolvedBy.set(row.templateId, set);
  }
  let total = emptyCosts();
  const rows = properties.map((property) => {
    const paid: PaidCost[] = [];
    for (const row of occurrences) {
      if (row.template.condoSchedule?.propertyId === property.id && row.movement) paid.push({ kind: "ORDINARY", cents: -row.movement.amountCents, date: fromDate(row.movement.bookingDate) });
    }
    const pending = [];
    for (const row of charges) {
      if (row.propertyId !== property.id) continue;
      if (row.movementId === null) pending.push({ cents: row.amountCents, dueDate: fromDate(row.dueDate) });
      else if (row.movement && !row.movement.voidedAt) paid.push({ kind: row.kind, cents: -row.movement.amountCents, date: fromDate(row.movement.bookingDate) });
    }
    const costSchedules: CostSchedule[] = schedules.filter((item) => item.propertyId === property.id).map((item) => ({
      rule: { frequency: item.template.frequency, startDate: fromDate(item.template.startDate), endDate: item.template.endDate ? fromDate(item.template.endDate) : null },
      amountCents: item.template.amountCents, archived: item.template.archivedAt !== null, resolved: resolvedBy.get(item.templateId) ?? new Set<IsoDate>(),
    }));
    const totals = propertyCosts({ year, today, paid, pending, schedules: costSchedules });
    total = addCosts(total, totals);
    return { propertyId: property.id, name: property.name, archived: property.archivedAt !== null, ...costsToNumbers(totals) };
  });
  return { year, today, properties: rows, total: costsToNumbers(total) };
}
export type Costs = Awaited<ReturnType<typeof getCosts>>;
