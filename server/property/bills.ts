// Utility bills per property (electricity, gas, internet). A bill is paid when it is linked to exactly
// one booked expense of the same amount; unlinking reopens it and leaves the movement in cash flow.
//
// Lock order for every bill write: the per-user property lock (key 4, see service.ts), then the bill
// row, then the movement row (`lockMovements`, the lock every cash-flow writer takes first). Cash-flow
// writers never lock bills, so no cycle is possible, and every eligibility check runs as a fresh
// read after the movement lock: a void, edit, pairing or recurring match that commits first is seen.

import { randomUUID } from "node:crypto";
import type { Prisma, UtilityBill } from "../../db/generated/client.ts";
import { db } from "../auth/database.ts";
import { fromDate, romeToday, toDate, type IsoDate } from "../cash-flow/dates.ts";
import { ApiError, conflict, notFound } from "../cash-flow/errors.ts";
import { candidatePaging, CANDIDATE_PAGE_SIZE, lockMovements, nearestCandidates, type MovementDto } from "../cash-flow/movements.ts";
import { MAX_CENTS, Reader } from "../cash-flow/validate.ts";
import { billStatus, billTotals, billTypes, type BillStatus } from "./calc.ts";
import { addressData, lockProperty, MAX_ADDRESS, write } from "./service.ts";

type Client = Prisma.TransactionClient;
export const MAX_BILLS = 5_000;

export type BillDto = {
  id: string;
  propertyId: string;
  type: UtilityBill["type"];
  provider: string;
  periodStart: IsoDate;
  periodEnd: IsoDate;
  dueDate: IsoDate;
  totalCents: number;
  rawMaterialCents: number | null;
  status: BillStatus;
  /** The movement that paid the bill, if linked. */
  payment: { movementId: string; accountId: string; bookingDate: IsoDate } | null;
};

const billInclude = { movement: { select: { id: true, accountId: true, bookingDate: true } } } satisfies Prisma.UtilityBillInclude;
type BillRow = Prisma.UtilityBillGetPayload<{ include: typeof billInclude }>;

function billDto(row: BillRow, today: IsoDate): BillDto {
  const dueDate = fromDate(row.dueDate);
  return {
    id: row.id, propertyId: row.propertyId, type: row.type, provider: row.provider,
    periodStart: fromDate(row.periodStart), periodEnd: fromDate(row.periodEnd), dueDate,
    totalCents: row.totalCents, rawMaterialCents: row.rawMaterialCents,
    status: billStatus(row.movementId !== null, dueDate, today),
    payment: row.movement ? { movementId: row.movement.id, accountId: row.movement.accountId, bookingDate: fromDate(row.movement.bookingDate) } : null,
  };
}

type BillFields = {
  type: UtilityBill["type"]; provider: string; periodStart: IsoDate; periodEnd: IsoDate; dueDate: IsoDate;
  totalCents: number; rawMaterialCents: number | null;
};

/** Rules on the bill as it will be saved, so a partial edit is checked against the stored values. */
function checkBill(bill: BillFields) {
  if (bill.periodStart > bill.periodEnd) throw new ApiError(422, "validation", "periodEnd");
  if (bill.rawMaterialCents !== null && (bill.type === "INTERNET" || bill.rawMaterialCents > bill.totalCents)) {
    throw new ApiError(422, "validation", "rawMaterialCents");
  }
}

function readBill(reader: Reader, partial: boolean) {
  const type = partial ? reader.optionalOneOf("type", billTypes) : reader.oneOf("type", billTypes);
  const provider = partial ? reader.optionalText("provider", 80) : reader.text("provider", 80);
  const periodStart = partial ? reader.optionalDate("periodStart") : reader.date("periodStart");
  const periodEnd = partial ? reader.optionalDate("periodEnd") : reader.date("periodEnd");
  const dueDate = partial ? reader.optionalDate("dueDate") : reader.date("dueDate");
  const totalCents = partial ? reader.optionalCents("totalCents", true) : reader.cents("totalCents", true);
  const rawMaterialCents = reader.nullableInteger("rawMaterialCents", 1, MAX_CENTS);
  return { type, provider, periodStart, periodEnd, dueDate, totalCents, rawMaterialCents };
}

async function lockBill(client: Client, userId: string, id: string) {
  const rows = await client.$queryRaw<{ id: string }[]>`SELECT bill_id AS id FROM stead_utility_bills WHERE user_id = ${userId}::uuid AND bill_id = ${id}::uuid FOR UPDATE`;
  if (!rows.length) throw notFound();
  return client.utilityBill.findUniqueOrThrow({ where: { userId_id: { userId, id } } });
}
async function loadBill(client: Client, userId: string, id: string, now: Date) {
  return billDto(await client.utilityBill.findUniqueOrThrow({ where: { userId_id: { userId, id } }, include: billInclude }), romeToday(now));
}

/**
 * `address` optionally sets the property's address with its first bill; it is refused once the
 * property has one (edit the property instead), so a bill form never overwrites it silently.
 */
export async function createBill(userId: string, input: Record<string, unknown>, now = new Date()) {
  const reader = new Reader(input);
  const propertyId = reader.uuid("propertyId");
  const fields = readBill(reader, false) as BillFields & { rawMaterialCents: number | null | undefined };
  const address = reader.optionalText("address", MAX_ADDRESS);
  reader.done();
  const bill: BillFields = { ...fields, rawMaterialCents: fields.rawMaterialCents ?? null };
  checkBill(bill);
  return write(userId, async (client) => {
    await lockProperty(client, userId, propertyId);
    if (await client.utilityBill.count({ where: { userId } }) >= MAX_BILLS) throw new ApiError(422, "bill_limit");
    if (address !== undefined) {
      const property = await client.property.findUniqueOrThrow({ where: { userId_id: { userId, id: propertyId } }, select: { address: true } });
      if (property.address) throw conflict("address_exists");
      await client.property.update({ where: { userId_id: { userId, id: propertyId } }, data: { address: addressData(userId, propertyId, address) } });
    }
    const id = randomUUID();
    await client.utilityBill.create({
      data: {
        id, userId, propertyId, type: bill.type, provider: bill.provider, totalCents: bill.totalCents, rawMaterialCents: bill.rawMaterialCents,
        periodStart: toDate(bill.periodStart), periodEnd: toDate(bill.periodEnd), dueDate: toDate(bill.dueDate),
      },
    });
    return loadBill(client, userId, id, now);
  });
}

/** Every field can change, except the total of a paid bill: unlink the payment first. */
export async function updateBill(userId: string, id: string, input: Record<string, unknown>, now = new Date()) {
  const reader = new Reader(input);
  const changes = readBill(reader, true);
  reader.done();
  return write(userId, async (client) => {
    const current = await lockBill(client, userId, id);
    if (current.movementId && changes.totalCents !== undefined && changes.totalCents !== current.totalCents) throw conflict("bill_linked");
    const next: BillFields = {
      type: changes.type ?? current.type,
      provider: changes.provider ?? current.provider,
      periodStart: changes.periodStart ?? fromDate(current.periodStart),
      periodEnd: changes.periodEnd ?? fromDate(current.periodEnd),
      dueDate: changes.dueDate ?? fromDate(current.dueDate),
      totalCents: changes.totalCents ?? current.totalCents,
      rawMaterialCents: changes.rawMaterialCents === undefined ? current.rawMaterialCents : changes.rawMaterialCents,
    };
    checkBill(next);
    await client.utilityBill.update({
      where: { userId_id: { userId, id } },
      data: { ...next, periodStart: toDate(next.periodStart), periodEnd: toDate(next.periodEnd), dueDate: toDate(next.dueDate) },
    });
    return loadBill(client, userId, id, now);
  });
}

export async function deleteBill(userId: string, id: string) {
  await write(userId, async (client) => {
    const current = await lockBill(client, userId, id);
    if (current.movementId) throw conflict("bill_linked");
    await client.utilityBill.delete({ where: { userId_id: { userId, id } } });
  });
}

/**
 * Booked expenses that could pay the bill: any of the user's accounts, exactly the bill total as an
 * outflow, not voided, paired, matched to a recurring occurrence or paying another bill. Nearest to
 * the due date first; `month` and `offset` reach the rest of the history.
 */
export async function billCandidates(userId: string, id: string, params: URLSearchParams) {
  const paging = candidatePaging(params);
  const bill = await db().utilityBill.findUnique({ where: { userId_id: { userId, id } } });
  if (!bill) throw notFound();
  if (bill.movementId) return { pageSize: CANDIDATE_PAGE_SIZE, hasMore: false, movements: [] as MovementDto[] };
  return nearestCandidates({
    userId, ...paging, accountId: null, sameAccount: true, amountCents: -bill.totalCents, outflowOnly: true, sourceDate: fromDate(bill.dueDate),
  });
}

/** Links one eligible movement to an open bill; the same rules as the candidate list, rechecked under the locks. */
export async function linkBill(userId: string, id: string, input: Record<string, unknown>, now = new Date()) {
  const reader = new Reader(input);
  const movementId = reader.uuid("movementId");
  reader.done();
  return write(userId, async (client) => {
    const bill = await lockBill(client, userId, id);
    if (bill.movementId) throw conflict("bill_linked");
    await lockMovements(client, userId, [movementId]);
    const movement = await client.movement.findUniqueOrThrow({
      where: { userId_id: { userId, id: movementId } },
      select: {
        amountCents: true, voidedAt: true, transferId: true, category: { select: { kind: true } },
        occurrence: { select: { id: true } }, utilityBill: { select: { id: true } },
      },
    });
    if (movement.voidedAt) throw conflict("voided");
    if (movement.transferId) throw conflict("paired");
    if (movement.occurrence || movement.utilityBill) throw conflict("already_linked");
    if (movement.category?.kind === "INCOME") throw conflict("sign_mismatch");
    if (movement.amountCents !== -bill.totalCents) throw conflict("amount_mismatch");
    await client.utilityBill.update({ where: { userId_id: { userId, id } }, data: { movementId } });
    return loadBill(client, userId, id, now);
  });
}

/** Reopens the bill. The movement stays booked in cash flow, unchanged. */
export async function unlinkBill(userId: string, id: string, now = new Date()) {
  return write(userId, async (client) => {
    const bill = await lockBill(client, userId, id);
    if (!bill.movementId) throw conflict("not_linked");
    await lockMovements(client, userId, [bill.movementId]);
    await client.utilityBill.update({ where: { userId_id: { userId, id } }, data: { movementId: null } });
    return loadBill(client, userId, id, now);
  });
}

/**
 * Bills due in one calendar year for every property (archived and sold ones included), newest due
 * date first, with paid, due and overdue totals per property and overall. Read-only, one snapshot.
 */
export async function getBills(userId: string, query: { year: number }, now = new Date()) {
  const today = romeToday(now);
  const { year } = query;
  const { properties, rows } = await db().$transaction(async (tx) => ({
    properties: await tx.property.findMany({ where: { userId }, select: { id: true }, orderBy: [{ name: "asc" }, { id: "asc" }] }),
    rows: await tx.utilityBill.findMany({
      where: { userId, dueDate: { gte: toDate(`${year}-01-01`), lte: toDate(`${year}-12-31`) } },
      include: billInclude, orderBy: [{ dueDate: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    }),
  }), { isolationLevel: "RepeatableRead" });
  const bills = rows.map((row) => billDto(row, today));
  return {
    year, today, bills,
    properties: properties.map(({ id }) => ({ propertyId: id, ...billTotals(bills.filter((bill) => bill.propertyId === id)) })),
    total: billTotals(bills),
  };
}
export type Bills = Awaited<ReturnType<typeof getBills>>;
