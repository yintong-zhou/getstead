// Accounts and categories. Both are archived, never deleted, so old movements keep their references.

import type { Account, Category } from "../../db/generated/client.ts";
import { db } from "../auth/database.ts";
import { Reader } from "./validate.ts";
import { conflict, notFound } from "./errors.ts";
import { supportsAccountLogo } from "./logo-catalog.ts";

export const accountTypes = ["CHECKING", "CARD", "BROKERAGE", "CRYPTO", "CASH", "DEBT"] as const;
export const categoryKinds = ["EXPENSE", "INCOME"] as const;

export type AccountDto = { id: string; name: string; type: Account["type"]; archived: boolean; hasLogo: boolean };
export type CategoryDto = { id: string; name: string; kind: Category["kind"]; archived: boolean };

const logoPresence = { logo: { select: { accountId: true } } } as const;
const accountDto = (row: Account & { logo?: { accountId: string } | null }): AccountDto => ({
  id: row.id, name: row.name, type: row.type, archived: row.archivedAt !== null,
  hasLogo: supportsAccountLogo(row.type) && Boolean(row.logo),
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

export async function createAccount(userId: string, input: Record<string, unknown>) {
  const reader = new Reader(input);
  const data = { name: reader.text("name", 80), type: reader.oneOf("type", accountTypes) };
  reader.done();
  return accountDto(await db().account.create({ data: { userId, ...data } }));
}

export async function updateAccount(userId: string, id: string, input: Record<string, unknown>) {
  const reader = new Reader(input);
  const name = reader.optionalText("name", 80);
  const type = reader.optionalOneOf("type", accountTypes);
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
      data: { name, type, ...(archived === undefined ? {} : { archivedAt: archived ? new Date() : null }) },
    });
  });
  return accountDto(row);
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
