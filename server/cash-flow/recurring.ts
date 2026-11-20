// Recurring expense templates and their occurrences. An occurrence exists only as a calendar date
// computed from the template; it becomes a record when it is resolved (confirmed into a new
// movement, matched to an existing one, or skipped). The unique (template, due date) key plus a row
// lock on the template make every occurrence resolve exactly once, even under concurrent requests.

import { randomUUID } from "node:crypto";
import type { Prisma, RecurringTemplate } from "../../db/generated/client.ts";
import { db } from "../auth/database.ts";
import { ApiError, conflict, notFound } from "./errors.ts";
import {
  fromDate, isOccurrence, nextOccurrenceAfter, occurrencesThrough, parseIsoDate, romeToday, toDate,
  type IsoDate, type Recurrence,
} from "./dates.ts";
import { candidatePaging, lockMovements, movementSelect, nearestCandidates, toMovementDto, type MovementDto } from "./movements.ts";
import { decryptText, encryptText, movementContext, templateContext } from "./text-crypto.ts";
import { Reader, queryUuid } from "./validate.ts";

type Client = Prisma.TransactionClient;
const frequencies = ["WEEKLY", "MONTHLY", "YEARLY"] as const;
const MAX_DUE = 100;

export type TemplateDto = {
  id: string;
  accountId: string;
  categoryId: string | null;
  description: string;
  amountCents: number;
  frequency: RecurringTemplate["frequency"];
  startDate: IsoDate;
  endDate: IsoDate | null;
  archived: boolean;
};
export type OccurrenceRef = { templateId: string; dueDate: IsoDate };

function templateDto(userId: string, row: RecurringTemplate): TemplateDto {
  return {
    id: row.id,
    accountId: row.accountId,
    categoryId: row.categoryId,
    description: decryptText(userId, templateContext(row.id), row.description),
    amountCents: row.amountCents,
    frequency: row.frequency,
    startDate: fromDate(row.startDate),
    endDate: row.endDate ? fromDate(row.endDate) : null,
    archived: row.archivedAt !== null,
  };
}

const rule = (row: Pick<RecurringTemplate, "frequency" | "startDate" | "endDate">): Recurrence => ({
  frequency: row.frequency,
  startDate: fromDate(row.startDate),
  endDate: row.endDate ? fromDate(row.endDate) : null,
});

async function expenseCategory(client: Client, userId: string, id: string) {
  const category = await client.category.findFirst({ where: { userId, id }, select: { kind: true, archivedAt: true } });
  if (!category || category.kind !== "EXPENSE") throw new ApiError(422, "validation", "categoryId");
  if (category.archivedAt) throw conflict("archived");
}

async function activeAccount(client: Client, userId: string, id: string) {
  const account = await client.account.findFirst({ where: { userId, id }, select: { archivedAt: true } });
  if (!account) throw new ApiError(422, "validation", "accountId");
  if (account.archivedAt) throw conflict("archived");
}

/** `client` lets a caller (condominium schedules) create the template inside its own transaction. */
export async function createTemplate(userId: string, input: Record<string, unknown>, client?: Client) {
  const reader = new Reader(input);
  const accountId = reader.uuid("accountId");
  const categoryId = reader.nullableUuid("categoryId") ?? null;
  const description = reader.text("description", 200);
  const amountCents = reader.cents("amountCents", true);
  const frequency = reader.oneOf("frequency", frequencies);
  const startDate = reader.date("startDate");
  const endDate = reader.nullableDate("endDate") ?? null;
  reader.done();
  if (endDate && endDate < startDate) throw new ApiError(422, "validation", "endDate");

  const create = async (tx: Client) => {
    await activeAccount(tx, userId, accountId);
    if (categoryId) await expenseCategory(tx, userId, categoryId);
    const id = randomUUID();
    const row = await tx.recurringTemplate.create({
      data: {
        id, userId, accountId, categoryId, amountCents, frequency,
        description: encryptText(userId, templateContext(id), description),
        startDate: toDate(startDate),
        endDate: endDate ? toDate(endDate) : null,
      },
    });
    return templateDto(userId, row);
  };
  return client ? create(client) : db().$transaction(create);
}

/** The schedule (frequency, start date) is fixed: changing it would re-time every resolved occurrence. */
export async function updateTemplate(userId: string, id: string, input: Record<string, unknown>) {
  const reader = new Reader(input);
  const accountId = reader.optionalUuid("accountId");
  const categoryId = reader.nullableUuid("categoryId");
  const description = reader.optionalText("description", 200);
  const amountCents = reader.optionalCents("amountCents", true);
  const endDate = reader.nullableDate("endDate");
  const archived = reader.optionalBool("archived");
  reader.done();

  return db().$transaction(async (tx) => {
    const current = await tx.recurringTemplate.findUnique({ where: { userId_id: { userId, id } } });
    if (!current) throw notFound();
    if (accountId && accountId !== current.accountId) await activeAccount(tx, userId, accountId);
    if (categoryId && categoryId !== current.categoryId) await expenseCategory(tx, userId, categoryId);
    if (endDate && endDate < fromDate(current.startDate)) throw new ApiError(422, "validation", "endDate");

    const row = await tx.recurringTemplate.update({
      where: { userId_id: { userId, id } },
      data: {
        accountId,
        categoryId,
        amountCents,
        description: description === undefined ? undefined : encryptText(userId, templateContext(id), description),
        endDate: endDate === undefined ? undefined : endDate ? toDate(endDate) : null,
        ...(archived === undefined ? {} : { archivedAt: archived ? new Date() : null }),
      },
    });
    return templateDto(userId, row);
  });
}

export async function listRecurring(userId: string, params: URLSearchParams, now = new Date()) {
  const includeArchived = params.get("archived") === "1";
  const today = romeToday(now);
  const rows = await db().recurringTemplate.findMany({
    where: { userId, ...(includeArchived ? {} : { archivedAt: null }) },
    orderBy: [{ startDate: "asc" }, { id: "asc" }],
  });
  const resolved = await db().recurringOccurrence.findMany({
    where: { userId, templateId: { in: rows.map((row) => row.id) } },
    select: { templateId: true, dueDate: true, status: true, movementId: true },
  });
  const resolvedKeys = new Set(resolved.map((item) => `${item.templateId}:${fromDate(item.dueDate)}`));

  const due: OccurrenceRef[] = [];
  const upcoming: OccurrenceRef[] = [];
  for (const row of rows.filter((item) => item.archivedAt === null)) {
    const schedule = rule(row);
    for (const dueDate of occurrencesThrough(schedule, today)) {
      if (!resolvedKeys.has(`${row.id}:${dueDate}`)) due.push({ templateId: row.id, dueDate });
    }
    const next = nextOccurrenceAfter(schedule, today);
    if (next) upcoming.push({ templateId: row.id, dueDate: next });
  }
  const byDate = (a: OccurrenceRef, b: OccurrenceRef) => a.dueDate.localeCompare(b.dueDate) || a.templateId.localeCompare(b.templateId);

  return {
    today,
    templates: rows.map((row) => templateDto(userId, row)),
    due: due.sort(byDate).slice(0, MAX_DUE),
    upcoming: upcoming.sort(byDate),
    skipped: resolved
      .filter((item) => item.status === "SKIPPED")
      .map((item) => ({ templateId: item.templateId, dueDate: fromDate(item.dueDate) }))
      .sort(byDate)
      .slice(-20),
  };
}

/**
 * Booked expenses that could settle this occurrence: same account, an outflow, not voided, not
 * paired, not already linked. Nearest to the due date first; `month` and `offset` reach older or
 * newer payments, so a bill paid weeks late (or booked early) is never out of reach.
 */
export async function occurrenceCandidates(userId: string, params: URLSearchParams) {
  const templateId = queryUuid(params.get("templateId"), "templateId");
  const dueDate = parseIsoDate(params.get("dueDate"));
  if (!templateId || !dueDate) throw new ApiError(422, "validation", templateId ? "dueDate" : "templateId");
  const paging = candidatePaging(params);
  const template = await db().recurringTemplate.findUnique({ where: { userId_id: { userId, id: templateId } } });
  if (!template) throw notFound();

  return nearestCandidates({
    userId, ...paging,
    accountId: template.accountId, sameAccount: true, amountCents: null, outflowOnly: true, sourceDate: dueDate,
  });
}

type Resolution = {
  /** The occurrence as resolved; after a reopen, the state it had just before (it is due again now). */
  occurrence: { templateId: string; dueDate: IsoDate; status: "CONFIRMED" | "MATCHED" | "SKIPPED"; movementId: string | null };
  movement?: MovementDto;
  /** Set by reopen. `templateArchived` says whether the template is inactive, so nothing surfaces as due. */
  reopened?: true;
  templateArchived?: boolean;
};

const actions = ["confirm", "match", "skip", "unskip", "reopen"] as const;

export async function resolveOccurrence(userId: string, input: Record<string, unknown>, now = new Date()): Promise<Resolution | undefined> {
  const reader = new Reader(input);
  const action = reader.oneOf("action", actions);
  const templateId = reader.uuid("templateId");
  const dueDate = reader.date("dueDate");
  const movementId = action === "match" ? reader.uuid("movementId") : undefined;
  const amountCents = action === "confirm" ? reader.optionalCents("amountCents", true) : undefined;
  const bookingDate = action === "confirm" ? reader.optionalDate("bookingDate") : undefined;
  reader.done();

  if (action === "unskip") {
    const { count } = await db().recurringOccurrence.deleteMany({ where: { userId, templateId, dueDate: toDate(dueDate), status: "SKIPPED" } });
    if (!count) throw notFound();
    return undefined;
  }

  if (action === "reopen") {
    // Makes a confirmed or matched occurrence due again. The movement stays booked and unlinked,
    // so the person decides whether to void or adjust it before matching or confirming again.
    // An archived template can be reopened too: this is the only way to free its linked movements.
    // The archive itself is left alone, so nothing becomes due and the template stays inactive.
    return db().$transaction(async (tx): Promise<Resolution> => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT template_id AS id FROM stead_recurring_templates
        WHERE user_id = ${userId}::uuid AND template_id = ${templateId}::uuid FOR UPDATE
      `;
      if (!locked.length) throw notFound();
      const template = await tx.recurringTemplate.findUniqueOrThrow({ where: { userId_id: { userId, id: templateId } } });
      const occurrence = await tx.recurringOccurrence.findUnique({ where: { templateId_dueDate: { templateId, dueDate: toDate(dueDate) } } });
      if (!occurrence || occurrence.status === "SKIPPED") throw notFound();
      // Same lock order as match, edit and void (template, then movement), so none can interleave.
      if (occurrence.movementId) await lockMovements(tx, userId, [occurrence.movementId]);
      await tx.recurringOccurrence.deleteMany({ where: { id: occurrence.id, userId } });
      return {
        occurrence: { templateId, dueDate, status: occurrence.status, movementId: occurrence.movementId },
        reopened: true,
        templateArchived: template.archivedAt !== null,
      };
    });
  }

  return db().$transaction(async (tx): Promise<Resolution> => {
    // The template row lock serializes concurrent resolutions of the same schedule.
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT template_id AS id FROM stead_recurring_templates
      WHERE user_id = ${userId}::uuid AND template_id = ${templateId}::uuid FOR UPDATE
    `;
    if (!locked.length) throw notFound();
    const template = await tx.recurringTemplate.findUniqueOrThrow({ where: { userId_id: { userId, id: templateId } } });
    if (template.archivedAt) throw conflict("archived");
    if (!isOccurrence(rule(template), dueDate)) throw new ApiError(422, "validation", "dueDate");
    if (dueDate > romeToday(now)) throw conflict("not_due");
    const existing = await tx.recurringOccurrence.findUnique({ where: { templateId_dueDate: { templateId, dueDate: toDate(dueDate) } } });
    if (existing) throw conflict("already_resolved");

    const base = { userId, templateId, dueDate: toDate(dueDate) };

    if (action === "skip") {
      await tx.recurringOccurrence.create({ data: { ...base, status: "SKIPPED" } });
      return { occurrence: { templateId, dueDate, status: "SKIPPED", movementId: null } };
    }

    if (action === "match") {
      await lockMovements(tx, userId, [movementId!]);
      const movement = await tx.movement.findUniqueOrThrow({
        where: { userId_id: { userId, id: movementId! } },
        select: { accountId: true, amountCents: true, voidedAt: true, transferId: true, occurrence: { select: { id: true } }, condoCharge: { select: { id: true } } },
      });
      if (movement.accountId !== template.accountId) throw conflict("account_mismatch");
      if (movement.amountCents >= 0) throw conflict("sign_mismatch");
      if (movement.voidedAt) throw conflict("voided");
      if (movement.transferId) throw conflict("paired");
      // A movement settles at most one thing: an occurrence or a condominium charge (checked under the movement lock).
      if (movement.occurrence || movement.condoCharge) throw conflict("already_linked");
      await tx.recurringOccurrence.create({ data: { ...base, status: "MATCHED", movementId } });
      return { occurrence: { templateId, dueDate, status: "MATCHED", movementId: movementId! } };
    }

    // confirm: book the expense and record the resolution in the same transaction.
    await activeAccount(tx, userId, template.accountId);
    const category = template.categoryId
      ? await tx.category.findFirst({ where: { userId, id: template.categoryId, archivedAt: null }, select: { id: true } })
      : null;
    const id = randomUUID();
    const description = decryptText(userId, templateContext(template.id), template.description);
    const row = await tx.movement.create({
      data: {
        id, userId,
        accountId: template.accountId,
        categoryId: category?.id ?? null,
        bookingDate: toDate(bookingDate ?? dueDate),
        description: encryptText(userId, movementContext(id), description),
        amountCents: -(amountCents ?? template.amountCents),
      },
      select: movementSelect,
    });
    await tx.recurringOccurrence.create({ data: { ...base, status: "CONFIRMED", movementId: id } });
    return { occurrence: { templateId, dueDate, status: "CONFIRMED", movementId: id }, movement: { ...toMovementDto(userId, row), linked: { templateId, dueDate } } };
  });
}
