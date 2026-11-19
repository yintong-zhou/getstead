// Month totals and the six-month trend, computed by calc.ts from the user's own movements.

import { db } from "../auth/database.ts";
import { summarize, type CalcMovement } from "./calc.ts";
import { addMonths, fromDate, monthOf, monthStart, toDate, type Month } from "./dates.ts";

export type CalcRow = CalcMovement & { month: Month };

/** Movements booked from the first day of `from` up to, not including, the first day after `to`. */
export async function loadCalcRows(userId: string, from: Month, to: Month): Promise<CalcRow[]> {
  const rows = await db().movement.findMany({
    where: { userId, bookingDate: { gte: toDate(monthStart(from)), lt: toDate(monthStart(addMonths(to, 1))) } },
    select: {
      amountCents: true,
      categoryId: true,
      voidedAt: true,
      transferId: true,
      bookingDate: true,
      category: { select: { kind: true } },
    },
  });
  return rows.map((row) => ({
    amountCents: row.amountCents,
    categoryId: row.categoryId,
    categoryKind: row.category?.kind ?? null,
    voided: row.voidedAt !== null,
    paired: row.transferId !== null,
    month: monthOf(fromDate(row.bookingDate)),
  }));
}

export async function monthSummary(userId: string, month: Month) {
  return { month, ...summarize(await loadCalcRows(userId, month, month)) };
}

/** The `count` months ending at `end`, oldest first, with zero rows for empty months. */
export async function trend(userId: string, end: Month, count = 6) {
  const start = addMonths(end, 1 - count);
  const rows = await loadCalcRows(userId, start, end);
  return Array.from({ length: count }, (_, index) => {
    const month = addMonths(start, index);
    const { incomeCents, expenseCents } = summarize(rows.filter((row) => row.month === month));
    return { month, incomeCents, expenseCents };
  });
}
