// Everything the overview page shows, for one authenticated user and the current Europe/Rome month.

import { db } from "../auth/database.ts";
import { getNetWorth } from "../net-worth/service.ts";
import { getBudget } from "./budget.ts";
import { listAccounts, listCategories } from "./catalog.ts";
import { monthOf, romeToday, type IsoDate, type Month } from "./dates.ts";
import { movementSelect, toMovementDto } from "./movements.ts";
import { listRecurring } from "./recurring.ts";
import { trend } from "./reports.ts";

export type DashboardData = Awaited<ReturnType<typeof getDashboard>>;

export async function getDashboard(userId: string, now = new Date()) {
  const today = romeToday(now);
  const month: Month = monthOf(today);

  const [accounts, categories, rows, months, budget, recurring, netWorth] = await Promise.all([
    listAccounts(userId, true),
    listCategories(userId, true),
    db().movement.findMany({
      where: { userId, voidedAt: null },
      select: movementSelect,

      orderBy: [{ bookingDate: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      take: 6,
    }),
    trend(userId, month, 6),
    getBudget(userId, month),
    listRecurring(userId, new URLSearchParams(), now),
    getNetWorth(userId, now),
  ]);

  const accountNames = new Map(accounts.map((account) => [account.id, account.name]));
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  const current = months.at(-1)!;
  const templates = new Map(recurring.templates.map((template) => [template.id, template]));

  return {
    today,
    month,
    hasAccounts: accounts.some((account) => !account.archived),
    showNetWorth: accounts.length > 0 || netWorth.propertiesCents > 0,
    hasMovements: rows.length > 0,
    incomeCents: current.incomeCents,
    expenseCents: current.expenseCents,
    monthlyNetCents: current.incomeCents - current.expenseCents,
    netWorthCents: netWorth.netCents,
    trend: months,
    latest: rows.map((row) => {
      const movement = toMovementDto(userId, row);
      return {
        id: movement.id,
        bookingDate: movement.bookingDate,
        description: movement.description,
        amountCents: movement.amountCents,
        accountName: accountNames.get(movement.accountId) ?? "",
        categoryName: movement.categoryId ? categoryNames.get(movement.categoryId) ?? null : null,
        isTransfer: movement.transferId !== null,
      };
    }),
    budgets: budget.rows
      .filter((row) => row.limitCents !== null)
      .sort((a, b) => b.spentCents / (b.limitCents || 1) - a.spentCents / (a.limitCents || 1) || a.name.localeCompare(b.name))
      .slice(0, 5),
    dueCount: recurring.due.length,
    due: recurring.due.slice(0, 3).map(({ templateId, dueDate }): { description: string; amountCents: number; dueDate: IsoDate } => ({
      description: templates.get(templateId)?.description ?? "",
      amountCents: templates.get(templateId)?.amountCents ?? 0,
      dueDate,
    })),
  };
}
