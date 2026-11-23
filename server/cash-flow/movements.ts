// Movements and transfers. All access is scoped by the authenticated user's id; related rows
// (account, category, paired movement) are looked up with the same id, and the database foreign
// keys additionally reject any cross-user link.

import { randomUUID } from "node:crypto";
import type { Prisma } from "../../db/generated/client.ts";
import { db } from "../auth/database.ts";
import { ApiError, conflict, notFound } from "./errors.ts";
import { addMonths, fromDate, monthStart, parseMonth, toDate, type IsoDate } from "./dates.ts";
import { rememberRule, suggestCategory } from "./rules.ts";
import { decryptText, encryptText, movementContext } from "./text-crypto.ts";
import { Reader, queryUuid } from "./validate.ts";

type Client = Prisma.TransactionClient;

export const movementSelect = {
  id: true,
  accountId: true,
  categoryId: true,
  bookingDate: true,
  description: true,
  amountCents: true,
  voidedAt: true,
  transferId: true,
  transferLeg: true,
  occurrence: { select: { templateId: true, dueDate: true } },
} satisfies Prisma.MovementSelect;
const select = movementSelect;
type Row = Prisma.MovementGetPayload<{ select: typeof select }>;

export type MovementDto = {
  id: string;
  accountId: string;
  categoryId: string | null;
  bookingDate: IsoDate;
  description: string;
  amountCents: number;
  voided: boolean;
  transferId: string | null;
  transferLeg: "OUT" | "IN" | null;
  /** The recurring occurrence this movement settles, if any. Edits that would break the link are refused. */
  linked: { templateId: string; dueDate: IsoDate } | null;
};

export function toMovementDto(userId: string, row: Row): MovementDto {
  return {
    id: row.id,
    accountId: row.accountId,
    categoryId: row.categoryId,
    bookingDate: fromDate(row.bookingDate),
    description: decryptText(userId, movementContext(row.id), row.description),
    amountCents: row.amountCents,
    voided: row.voidedAt !== null,
    transferId: row.transferId,
    transferLeg: row.transferLeg,
    linked: row.occurrence ? { templateId: row.occurrence.templateId, dueDate: fromDate(row.occurrence.dueDate) } : null,
  };
}

async function activeAccount(client: Client, userId: string, id: string, field = "accountId") {
  const account = await client.account.findFirst({ where: { userId, id }, select: { archivedAt: true } });
  if (!account) throw new ApiError(422, "validation", field);
  if (account.archivedAt) throw conflict("archived");
}

async function activeCategory(client: Client, userId: string, id: string, field = "categoryId") {
  const category = await client.category.findFirst({ where: { userId, id }, select: { archivedAt: true } });
  if (!category) throw new ApiError(422, "validation", field);
  if (category.archivedAt) throw conflict("archived");
}

/** Row locks serialize edits, voids and pairing of the same movement. Sorted to avoid deadlocks. */
export async function lockMovements(client: Client, userId: string, ids: string[]) {
  for (const id of [...ids].sort()) {
    const rows = await client.$queryRaw<{ id: string }[]>`
      SELECT movement_id AS id FROM stead_movements
      WHERE user_id = ${userId}::uuid AND movement_id = ${id}::uuid FOR UPDATE
    `;
    if (!rows.length) throw notFound();
  }
}

export const REGISTER_PAGE_SIZE = 50;

function registerWhere(userId: string, params: URLSearchParams): Prisma.MovementWhereInput {
  const month = params.has("month") ? parseMonth(params.get("month")) : undefined;
  if (month === null) throw new ApiError(422, "validation", "month");
  const accountId = queryUuid(params.get("accountId"), "accountId");
  const rawCategory = params.get("categoryId");
  const categoryId = rawCategory === "none" ? null : queryUuid(rawCategory, "categoryId");
  const direction = params.get("direction");
  if (direction !== null && !Object.hasOwn(directionWhere, direction)) throw new ApiError(422, "validation", "direction");
  return {
    userId,
    ...(month ? { bookingDate: { gte: toDate(monthStart(month)), lt: toDate(monthStart(addMonths(month, 1))) } } : {}),
    ...(accountId ? { accountId } : {}),
    ...(categoryId !== undefined ? { categoryId } : {}),
    ...(direction ? directionWhere[direction as keyof typeof directionWhere] : {}),
  };
}

// Same split as incomeOf/expenseOf in calc.ts, so each column's rows add up to the month totals:
// the category kind decides (a refund is a positive EXPENSE row), the sign only when uncategorised.
// Transfers are neither. The three sets partition the register.
const directionWhere = {
  in: { transferId: null, OR: [{ category: { kind: "INCOME" } }, { categoryId: null, amountCents: { gt: 0 } }] },
  out: { transferId: null, OR: [{ category: { kind: "EXPENSE" } }, { categoryId: null, amountCents: { lt: 0 } }] },
  transfers: { transferId: { not: null } },
} satisfies Record<string, Prisma.MovementWhereInput>;

// One total order, so pages never overlap or skip rows: date, then insertion time, then id.
const registerOrder = [{ bookingDate: "desc" }, { createdAt: "desc" }, { id: "desc" }] satisfies Prisma.MovementOrderByWithRelationInput[];

export function integerParam(params: URLSearchParams, name: string, fallback: number, min: number, max: number) {
  if (!params.has(name)) return fallback;
  const value = Number(params.get(name));
  if (!Number.isInteger(value) || value < min || value > max) throw new ApiError(422, "validation", name);
  return value;
}

/** Filtered movements, newest first. `limit` (default 200, at most 500) and `offset` select a slice. */
export async function listMovements(userId: string, params: URLSearchParams) {
  const where = registerWhere(userId, params);
  const limit = integerParam(params, "limit", 200, 1, 500);
  const offset = integerParam(params, "offset", 0, 0, 1_000_000);
  const rows = await db().movement.findMany({ where, select, orderBy: registerOrder, take: limit, skip: offset });
  return rows.map((row) => toMovementDto(userId, row));
}

/** One fixed-size register page (1-based `page`) and whether another follows. */
export async function listMovementsPage(userId: string, params: URLSearchParams) {
  const where = registerWhere(userId, params);
  const page = integerParam(params, "page", 1, 1, 100_000);
  const rows = await db().movement.findMany({
    where, select, orderBy: registerOrder, take: REGISTER_PAGE_SIZE + 1, skip: (page - 1) * REGISTER_PAGE_SIZE,
  });
  return {
    page,
    pageSize: REGISTER_PAGE_SIZE,
    hasMore: rows.length > REGISTER_PAGE_SIZE,
    movements: rows.slice(0, REGISTER_PAGE_SIZE).map((row) => toMovementDto(userId, row)),
  };
}

export async function getMovement(userId: string, id: string) {
  const row = await db().movement.findUnique({ where: { userId_id: { userId, id } }, select });
  if (!row) throw notFound();
  return toMovementDto(userId, row);
}

/**
 * An explicit categoryId (a category or null) always wins. Only when the field is absent does the
 * longest matching remembered phrase pick the category.
 */
export async function createMovement(userId: string, input: Record<string, unknown>) {
  const reader = new Reader(input);
  const accountId = reader.uuid("accountId");
  const bookingDate = reader.date("bookingDate");
  const description = reader.text("description", 200);
  const amountCents = reader.cents("amountCents");
  const explicitCategory = reader.nullableUuid("categoryId");
  const rememberPhrase = reader.optionalText("rememberPhrase", 60);
  reader.done();

  return db().$transaction(async (tx) => {
    await activeAccount(tx, userId, accountId);
    if (explicitCategory) await activeCategory(tx, userId, explicitCategory);
    const categoryId = explicitCategory !== undefined
      ? explicitCategory
      : (await suggestCategory(tx, userId, description))?.categoryId ?? null;

    if (rememberPhrase !== undefined) {
      if (!categoryId) throw new ApiError(422, "validation", "rememberPhrase");
      await rememberRule(tx, userId, rememberPhrase, categoryId);
    }

    const id = randomUUID();
    const row = await tx.movement.create({
      data: {
        id,
        userId,
        accountId,
        categoryId,
        bookingDate: toDate(bookingDate),
        description: encryptText(userId, movementContext(id), description),
        amountCents,
      },
      select,
    });
    return toMovementDto(userId, row);
  });
}

async function setVoided(userId: string, id: string, voided: boolean) {
  return db().$transaction(async (tx) => {
    await lockMovements(tx, userId, [id]);
    const current = await tx.movement.findUniqueOrThrow({ where: { userId_id: { userId, id } }, select });
    // A paired leg must be unpaired first, otherwise its partner would stay excluded from nothing.
    if (current.transferId) throw conflict("paired");
    // A movement that settles a recurring occurrence must be reopened first, or the occurrence would keep a dead link.
    if (voided && current.occurrence) throw conflict("linked");
    const row = await tx.movement.update({
      where: { userId_id: { userId, id } },
      data: { voidedAt: voided ? current.voidedAt ?? new Date() : null },
      select,
    });
    return toMovementDto(userId, row);
  });
}

export async function updateMovement(userId: string, id: string, input: Record<string, unknown>) {
  const reader = new Reader(input);
  const voided = reader.optionalBool("voided");
  if (voided !== undefined) {
    reader.done(); // voiding and restoring are the only change in their request
    return setVoided(userId, id, voided);
  }

  const accountId = reader.optionalUuid("accountId");
  const bookingDate = reader.optionalDate("bookingDate");
  const description = reader.optionalText("description", 200);
  const amountCents = reader.optionalCents("amountCents");
  const categoryId = reader.nullableUuid("categoryId");
  const rememberPhrase = reader.optionalText("rememberPhrase", 60);
  reader.done();

  return db().$transaction(async (tx) => {
    await lockMovements(tx, userId, [id]);
    const current = await tx.movement.findUniqueOrThrow({ where: { userId_id: { userId, id } }, select });
    if (current.voidedAt) throw conflict("voided");

    const changesAccount = accountId !== undefined && accountId !== current.accountId;
    const changesAmount = amountCents !== undefined && amountCents !== current.amountCents;
    // Both legs were validated as equal and opposite when they were paired.
    if (current.transferId && (changesAccount || changesAmount)) throw conflict("paired");
    // A linked movement must stay an outflow in the occurrence's account.
    if (current.occurrence && (changesAccount || (amountCents !== undefined && amountCents > 0))) throw conflict("linked");

    if (changesAccount) await activeAccount(tx, userId, accountId);
    if (categoryId && categoryId !== current.categoryId) await activeCategory(tx, userId, categoryId);
    const finalCategory = categoryId === undefined ? current.categoryId : categoryId;
    // A movement that settles an occurrence is an expense: an INCOME category would turn it into negative income.
    if (finalCategory && finalCategory !== current.categoryId && current.occurrence) {
      const picked = await tx.category.findFirst({ where: { userId, id: finalCategory }, select: { kind: true } });
      if (picked?.kind === "INCOME") throw conflict("linked");
    }
    if (rememberPhrase !== undefined) {
      if (!finalCategory) throw new ApiError(422, "validation", "rememberPhrase");
      await rememberRule(tx, userId, rememberPhrase, finalCategory);
    }

    const row = await tx.movement.update({
      where: { userId_id: { userId, id } },
      data: {
        accountId,
        categoryId,
        bookingDate: bookingDate ? toDate(bookingDate) : undefined,
        description: description === undefined ? undefined : encryptText(userId, movementContext(id), description),
        amountCents,
      },
      select,
    });
    return toMovementDto(userId, row);
  });
}

// ---- Transfers ---------------------------------------------------------------------------------

export type TransferDto = { id: string; out: MovementDto; in: MovementDto };

async function transferDto(client: Client, userId: string, id: string): Promise<TransferDto> {
  const legs = await client.movement.findMany({ where: { userId, transferId: id }, select });
  const out = legs.find((leg) => leg.transferLeg === "OUT");
  const incoming = legs.find((leg) => leg.transferLeg === "IN");
  if (!out || !incoming) throw notFound();
  return { id, out: toMovementDto(userId, out), in: toMovementDto(userId, incoming) };
}

/** Books both sides of a transfer at once. The dates may fall in different months. */
export async function createTransfer(userId: string, input: Record<string, unknown>) {
  const reader = new Reader(input);
  const fromAccountId = reader.uuid("fromAccountId");
  const toAccountId = reader.uuid("toAccountId");
  const amountCents = reader.cents("amountCents", true);
  const bookingDate = reader.date("bookingDate");
  const inBookingDate = reader.optionalDate("inBookingDate") ?? bookingDate;
  const description = reader.text("description", 200);
  reader.done();
  if (fromAccountId === toAccountId) throw new ApiError(422, "validation", "toAccountId");

  return db().$transaction(async (tx) => {
    await activeAccount(tx, userId, fromAccountId, "fromAccountId");
    await activeAccount(tx, userId, toAccountId, "toAccountId");
    const { id: transferId } = await tx.transfer.create({ data: { userId }, select: { id: true } });

    const leg = (accountId: string, date: IsoDate, cents: number, transferLeg: "OUT" | "IN") => {
      const id = randomUUID();
      return tx.movement.create({
        data: {
          id, userId, accountId, transferId, transferLeg,
          bookingDate: toDate(date),
          description: encryptText(userId, movementContext(id), description),
          amountCents: cents,
        },
      });
    };
    await leg(fromAccountId, bookingDate, -amountCents, "OUT");
    await leg(toAccountId, inBookingDate, amountCents, "IN");
    return transferDto(tx, userId, transferId);
  });
}

/**
 * Pairs two existing movements into a transfer. They must belong to the user, sit in different
 * accounts, have equal and opposite amounts, be neither voided nor already paired.
 */
export async function pairMovements(userId: string, input: Record<string, unknown>) {
  const reader = new Reader(input);
  const [firstId, secondId] = reader.uuids("movementIds", 2);
  reader.done();
  if (firstId === secondId) throw new ApiError(422, "validation", "movementIds");

  return db().$transaction(async (tx) => {
    await lockMovements(tx, userId, [firstId, secondId]);
    const rows = await tx.movement.findMany({ where: { userId, id: { in: [firstId, secondId] } }, select });
    if (rows.length !== 2) throw notFound();
    const [a, b] = rows;

    if (a.voidedAt || b.voidedAt) throw conflict("voided");
    if (a.transferId || b.transferId) throw conflict("already_paired");
    if (a.occurrence || b.occurrence) throw conflict("linked");
    if (a.accountId === b.accountId) throw conflict("same_account");
    if (a.amountCents !== -b.amountCents) throw conflict("amount_mismatch");

    const { id: transferId } = await tx.transfer.create({ data: { userId }, select: { id: true } });
    for (const row of rows) {
      await tx.movement.update({
        where: { userId_id: { userId, id: row.id } },
        data: { transferId, transferLeg: row.amountCents < 0 ? "OUT" : "IN" },
      });
    }
    return transferDto(tx, userId, transferId);
  });
}

/** Reverses a pairing. Both movements stay in the register and count in totals again. */
export async function unpairTransfer(userId: string, transferId: string) {
  await db().$transaction(async (tx) => {
    const legs = await tx.movement.findMany({ where: { userId, transferId }, select: { id: true } });
    if (!legs.length) throw notFound();
    await lockMovements(tx, userId, legs.map((leg) => leg.id));
    await tx.movement.updateMany({ where: { userId, transferId }, data: { transferId: null, transferLeg: null } });
    await tx.transfer.delete({ where: { userId_id: { userId, id: transferId } } });
  });
}

export const CANDIDATE_PAGE_SIZE = 20;

type CandidateQuery = {
  userId: string;
  accountId: string;
  /** true: only that account (recurring); false: every other account (transfers). */
  sameAccount: boolean;
  /** Exact amount to match, or null for any. */
  amountCents: number | null;
  outflowOnly: boolean;
  /** Candidates are ordered by distance from this date. */
  sourceDate: IsoDate;
  month?: string | null;
  offset: number;
};

/** Optional `month` and `offset` query parameters shared by both candidate endpoints. */
export function candidatePaging(params: URLSearchParams) {
  const month = params.has("month") ? parseMonth(params.get("month")) : null;
  if (params.has("month") && !month) throw new ApiError(422, "validation", "month");
  return { month, offset: integerParam(params, "offset", 0, 0, 100_000) };
}

/**
 * Unvoided, unpaired movements that are not already settling a recurring occurrence, nearest
 * date first. The whole history is reachable through `offset`, and `month` narrows it, so no
 * valid counterpart is hidden by an arbitrary cut-off.
 */
export async function nearestCandidates(query: CandidateQuery) {
  const { userId, offset } = query;
  const from = query.month ? monthStart(query.month) : null;
  const to = query.month ? monthStart(addMonths(query.month, 1)) : null;
  const ids = await db().$queryRaw<{ id: string }[]>`
    SELECT m.movement_id AS id FROM stead_movements m
    WHERE m.user_id = ${userId}::uuid
      AND ((${query.sameAccount}::boolean AND m.account_id = ${query.accountId}::uuid)
        OR (NOT ${query.sameAccount}::boolean AND m.account_id <> ${query.accountId}::uuid))
      AND (${query.amountCents}::int IS NULL OR m.amount_cents = ${query.amountCents}::int)
      AND (NOT ${query.outflowOnly}::boolean OR m.amount_cents < 0)
      AND (NOT ${query.outflowOnly}::boolean OR NOT EXISTS (
        SELECT 1 FROM stead_categories k WHERE k.user_id = m.user_id AND k.category_id = m.category_id AND k.kind = 'INCOME'
      ))
      AND m.voided_at IS NULL AND m.transfer_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM stead_recurring_occurrences o WHERE o.user_id = m.user_id AND o.movement_id = m.movement_id
      )
      AND (${from}::date IS NULL OR m.booking_date >= ${from}::date)
      AND (${to}::date IS NULL OR m.booking_date < ${to}::date)
    ORDER BY abs(m.booking_date - ${query.sourceDate}::date), m.booking_date DESC, m.movement_id
    LIMIT ${CANDIDATE_PAGE_SIZE + 1} OFFSET ${offset}
  `;
  const wanted = ids.slice(0, CANDIDATE_PAGE_SIZE).map((row) => row.id);
  const rows = await db().movement.findMany({ where: { userId, id: { in: wanted } }, select });
  const order = new Map(wanted.map((id, index) => [id, index]));
  return {
    pageSize: CANDIDATE_PAGE_SIZE,
    hasMore: ids.length > CANDIDATE_PAGE_SIZE,
    movements: rows.sort((a, b) => order.get(a.id)! - order.get(b.id)!).map((row) => toMovementDto(userId, row)),
  };
}

/** Movements that could be paired with the given one: another account, exactly the opposite amount. */
export async function transferCandidates(userId: string, params: URLSearchParams) {
  const id = queryUuid(params.get("movementId"), "movementId");
  if (!id) throw new ApiError(422, "validation", "movementId");
  const paging = candidatePaging(params);
  const source = await db().movement.findUnique({ where: { userId_id: { userId, id } }, select });
  if (!source) throw notFound();
  const empty = { pageSize: CANDIDATE_PAGE_SIZE, hasMore: false, movements: [] as MovementDto[] };
  // A voided, paired or recurring-linked movement cannot be paired, so it has no counterparts to offer.
  if (source.voidedAt || source.transferId || source.occurrence) return empty;

  return nearestCandidates({
    userId, ...paging,
    accountId: source.accountId, sameAccount: false, amountCents: -source.amountCents,
    outflowOnly: false, sourceDate: fromDate(source.bookingDate),
  });
}
