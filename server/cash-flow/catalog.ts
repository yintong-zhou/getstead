// Accounts and categories. Both are archived so old rows keep their references; unused ones can be deleted.

import type { Account, Category } from "../../db/generated/client.ts";
import { db } from "../auth/database.ts";
import { addDays, romeToday, toDate } from "./dates.ts";
import { Reader } from "./validate.ts";
import { conflict, notFound } from "./errors.ts";

export const accountTypes = ["CHECKING", "SAVINGS", "CARD", "BROKERAGE", "CRYPTO", "CASH", "DEBT", "PENSION"] as const;
export const categoryKinds = ["EXPENSE", "INCOME"] as const;

/** `institution` is the value the user set; null means it is recognised from the name (see accountInstitution). */
export type AccountDto = { id: string; name: string; type: Account["type"]; institution: string | null; archived: boolean; hasLogo: boolean };
export type CategoryDto = { id: string; name: string; kind: Category["kind"]; archived: boolean };

const logoPresence = { logo: { select: { accountId: true } } } as const;
const accountDto = (row: Account & { logo?: { accountId: string } | null }): AccountDto => ({
  id: row.id, name: row.name, type: row.type, institution: row.institution, archived: row.archivedAt !== null,
  hasLogo: Boolean(row.logo),
});
const categoryDto = (row: Category): CategoryDto => ({ id: row.id, name: row.name, kind: row.kind, archived: row.archivedAt !== null });

export async function listAccounts(userId: string, includeArchived = false) {
  const rows = await db().account.findMany({
    where: { userId, ...(includeArchived ? {} : { archivedAt: null }) },
    include: logoPresence,
    orderBy: [{ archivedAt: { sort: "asc", nulls: "first" } }, { name: "asc" }, { id: "asc" }],
  });
  return rows.map(accountDto);
}

/**
 * `openingBalanceCents` (signed, negative for an amount owed) starts the account at its current balance without a movement:
 * it is stored as a balance check for yesterday, so movements dated today still add on top of it.
 */
export async function createAccount(userId: string, input: Record<string, unknown>, now = new Date()) {
  const reader = new Reader(input);
  const name = reader.text("name", 80);
  const type = reader.oneOf("type", accountTypes);
  const institution = reader.nullableText("institution", 80) ?? null;
  const openingBalanceCents = reader.optionalSignedCents("openingBalanceCents");
  reader.done();
  return db().$transaction(async (client) => {
    const row = await client.account.create({ data: { userId, name, type, institution } });
    if (openingBalanceCents !== undefined) {
      await client.balanceCheck.create({
        data: { userId, accountId: row.id, asOf: toDate(addDays(romeToday(now), -1)), balanceCents: openingBalanceCents },
      });
    }
    return accountDto(row);
  });
}

/** Changing the type keeps every movement and balance check. */
export async function updateAccount(userId: string, id: string, input: Record<string, unknown>) {
  const reader = new Reader(input);
  const name = reader.optionalText("name", 80);
  const type = reader.optionalOneOf("type", accountTypes);
  const institution = reader.nullableText("institution", 80);
  const archived = reader.optionalBool("archived");
  reader.done();
  const row = await db().$transaction(async (client) => {
    const locked = await client.$queryRaw<{ id: string }[]>`SELECT account_id AS id FROM stead_accounts WHERE user_id = ${userId}::uuid AND account_id = ${id}::uuid FOR UPDATE`;
    if (!locked.length) throw notFound();
    if (type && !["BROKERAGE", "CRYPTO"].includes(type) && await client.investmentTransaction.count({ where: { userId, accountId: id } })) {
      throw conflict("investment_account");
    }
    // A property's mortgage link needs a DEBT account; the property writer locks this row too (FOR NO KEY UPDATE).
    if (type && type !== "DEBT" && await client.property.count({ where: { userId, mortgageAccountId: id } })) throw conflict("mortgage_account");
    return client.account.update({
      where: { userId_id: { userId, id } },
      include: logoPresence,
      data: { name, type, institution, ...(archived === undefined ? {} : { archivedAt: archived ? new Date() : null }) },
    });
  });
  return accountDto(row);
}

/** Deletes an account nothing references. Every reference is a RESTRICT foreign key, so the database decides "in use" atomically; the logo cascades. */
export async function deleteAccount(userId: string, id: string) {
  try {
    const { count } = await db().account.deleteMany({ where: { userId, id } });
    if (!count) throw notFound();
  } catch (error) {
    if ((error as { code?: string })?.code === "P2003") throw conflict("account_in_use");
    throw error;
  }
}

/**
 * Deletes a category no movement or template uses. Its rules and budget limits go with it in the same transaction;
 * the RESTRICT foreign keys on movements and templates make the database decide "in use" atomically and roll all of it back.
 */
export async function deleteCategory(userId: string, id: string) {
  try {
    await db().$transaction(async (client) => {
      await client.categoryRule.deleteMany({ where: { userId, categoryId: id } });
      await client.budgetLimit.deleteMany({ where: { userId, categoryId: id } });
      const { count } = await client.category.deleteMany({ where: { userId, id } });
      if (!count) throw notFound();
    });
  } catch (error) {
    if ((error as { code?: string })?.code === "P2003") throw conflict("category_in_use");
    throw error;
  }
}

export async function listCategories(userId: string, includeArchived = false) {
  const rows = await db().category.findMany({
    where: { userId, ...(includeArchived ? {} : { archivedAt: null }) },
    orderBy: [{ kind: "asc" }, { name: "asc" }, { id: "asc" }],
  });
  return rows.map(categoryDto);
}

export async function createCategory(userId: string, input: Record<string, unknown>) {
  const reader = new Reader(input);
  const data = { name: reader.text("name", 80), kind: reader.oneOf("kind", categoryKinds) };
  reader.done();
  return categoryDto(await db().category.create({ data: { userId, ...data } }));
}

/** The kind is fixed: changing it would silently move every past movement between income and spending. */
export async function updateCategory(userId: string, id: string, input: Record<string, unknown>) {
  const reader = new Reader(input);
  const name = reader.optionalText("name", 80);
  const archived = reader.optionalBool("archived");
  reader.done();
  const row = await db().category.update({
    where: { userId_id: { userId, id } },
    data: { name, ...(archived === undefined ? {} : { archivedAt: archived ? new Date() : null }) },
  });
  return categoryDto(row);
}

const starterNames = {
  en: {
    EXPENSE: ["Groceries", "Dining out", "Transport", "Bills", "Shopping", "Health", "Leisure"],
    INCOME: ["Salary", "Other income"],
  },
  it: {
    EXPENSE: ["Spesa", "Ristoranti", "Trasporti", "Bollette", "Acquisti", "Salute", "Tempo libero"],
    INCOME: ["Stipendio", "Altre entrate"],
  },
} as const;

/** Adds the starter set once; names that already exist are left alone. */
export async function addStarterCategories(userId: string, input: Record<string, unknown>) {
  const reader = new Reader(input);
  const locale = reader.oneOf("locale", ["en", "it"] as const);
  reader.done();
  const data = categoryKinds.flatMap((kind) => starterNames[locale][kind].map((name) => ({ userId, name, kind })));
  await db().category.createMany({ data, skipDuplicates: true });
  return listCategories(userId);
}
