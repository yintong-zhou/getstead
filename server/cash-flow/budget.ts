// Monthly expense budgets. A base limit applies from its month onward until the next base; an
// override applies to one month only. Limits are stored per month, never rewritten for the past,
// so changing a base today leaves every earlier month's applicable limit exactly as it was.

import { db } from "../auth/database.ts";
import { applicableLimit, spentByCategory, varianceOf, type LimitRow } from "./calc.ts";
import { ApiError, notFound } from "./errors.ts";
import { fromDate, monthOf, monthStart, parseMonth, romeToday, toDate, type Month } from "./dates.ts";
import { loadCalcRows } from "./reports.ts";
import { Reader, isUuid } from "./validate.ts";

export type BudgetRow = {
  categoryId: string;
  name: string;
  archived: boolean;
  /** Net of refunds: a refund booked in the month reduces it. May be negative. */
  spentCents: number;
  limitCents: number | null;
  limitSource: "base" | "override" | "none";
  /** limit - spent: positive is room left, negative is over budget. Null without a limit. */
  varianceCents: number | null;
};

export async function getBudget(userId: string, month: Month): Promise<{ month: Month; rows: BudgetRow[] }> {
  const [categories, limits, movements] = await Promise.all([
    db().category.findMany({ where: { userId, kind: "EXPENSE" }, orderBy: [{ name: "asc" }, { id: "asc" }] }),
    db().budgetLimit.findMany({ where: { userId, month: { lte: toDate(monthStart(month)) } } }),
    loadCalcRows(userId, month, month),
  ]);
  const spent = spentByCategory(movements);

  const rows = categories.map((category): BudgetRow => {
    const categoryLimits: LimitRow[] = limits
      .filter((row) => row.categoryId === category.id)
      .map((row) => ({ month: monthOf(fromDate(row.month)), kind: row.kind, limitCents: row.limitCents }));
    const { limitCents, source } = applicableLimit(categoryLimits, month);
    const spentCents = spent.get(category.id) ?? 0;
    return {
      categoryId: category.id,
      name: category.name,
      archived: category.archivedAt !== null,
      spentCents,
      limitCents,
      limitSource: source,
      varianceCents: varianceOf(limitCents, spentCents),
    };
  });
  // An archived category stays visible only while it still explains the month's numbers.
  return { month, rows: rows.filter((row) => !row.archived || row.spentCents !== 0 || row.limitCents !== null) };
}

async function expenseCategory(userId: string, categoryId: string) {
  const category = await db().category.findFirst({ where: { userId, id: categoryId }, select: { kind: true, archivedAt: true } });
  if (!category || category.kind !== "EXPENSE") throw new ApiError(422, "validation", "categoryId");
  if (category.archivedAt) throw new ApiError(409, "archived");
}

/**
 * Without `month`: the recurring base limit, effective from the current month (null removes the
 * budget from this month on). With `month`: a limit for that one month. Months before the current
 * one are frozen history and cannot be changed.
 */
export async function setLimit(userId: string, input: Record<string, unknown>, now = new Date()) {
  const reader = new Reader(input);
  const categoryId = reader.uuid("categoryId");
  const target = reader.has("month") ? reader.month("month") : null;
  const isOverride = target !== null;
  const limitCents = isOverride ? reader.limit("limitCents") : reader.nullableLimit("limitCents");
  reader.done();
  if (limitCents === undefined) throw new ApiError(422, "validation", "limitCents");

  const current = monthOf(romeToday(now));
  if (target !== null && target < current) throw new ApiError(409, "frozen_month");
  await expenseCategory(userId, categoryId);

  const month = toDate(monthStart(target ?? current));
  const kind = isOverride ? "OVERRIDE" : "BASE";
  await db().budgetLimit.upsert({
    where: { userId_categoryId_month_kind: { userId, categoryId, month, kind } },
    create: { userId, categoryId, month, kind, limitCents },
    update: { limitCents },
  });
  return getBudget(userId, target ?? current);
}

/** Removes a one-month override so the month falls back to the base limit. */
export async function clearOverride(userId: string, params: URLSearchParams, now = new Date()) {
  const categoryId = params.get("categoryId");
  const month = parseMonth(params.get("month"));
  if (!isUuid(categoryId) || !month) throw new ApiError(422, "validation", isUuid(categoryId) ? "month" : "categoryId");
  if (month < monthOf(romeToday(now))) throw new ApiError(409, "frozen_month");

  const { count } = await db().budgetLimit.deleteMany({
    where: { userId, categoryId, month: toDate(monthStart(month)), kind: "OVERRIDE" },
  });
  if (!count) throw notFound();
  return getBudget(userId, month);
}
