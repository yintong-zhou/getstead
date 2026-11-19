// Category rules: a remembered word or phrase that suggests a category for a movement description.

import type { Prisma } from "../../db/generated/client.ts";
import { db } from "../auth/database.ts";
import { matchRule, normalizePhrase, type RuleRow } from "./calc.ts";
import { ApiError, notFound } from "./errors.ts";
import { Reader } from "./validate.ts";

type Client = Prisma.TransactionClient;
export type RuleDto = RuleRow;

/** Rules that point at an archived category are ignored, so an archived category is never suggested. */
async function activeRules(client: Client, userId: string): Promise<RuleRow[]> {
  return client.categoryRule.findMany({
    where: { userId, category: { archivedAt: null } },
    select: { id: true, phrase: true, categoryId: true },
  });
}

export async function suggestCategory(client: Client, userId: string, description: string) {
  return matchRule(description, await activeRules(client, userId));
}

/** Stores or re-points the rule for a phrase. The category must be one of the user's active categories. */
export async function rememberRule(client: Client, userId: string, phraseInput: string, categoryId: string): Promise<RuleDto> {
  const phrase = normalizePhrase(phraseInput);
  if (!phrase || phrase.length > 60) throw new ApiError(422, "validation", "rememberPhrase");
  const category = await client.category.findFirst({ where: { userId, id: categoryId, archivedAt: null }, select: { id: true } });
  if (!category) throw new ApiError(422, "validation", "categoryId");

  return client.categoryRule.upsert({
    where: { userId_phrase: { userId, phrase } },
    create: { userId, phrase, categoryId },
    update: { categoryId },
    select: { id: true, phrase: true, categoryId: true },
  });
}

export async function listRules(userId: string): Promise<RuleDto[]> {
  return db().categoryRule.findMany({
    where: { userId },
    select: { id: true, phrase: true, categoryId: true },
    orderBy: [{ phrase: "asc" }, { id: "asc" }],
  });
}

export async function createRule(userId: string, input: Record<string, unknown>) {
  const reader = new Reader(input);
  const phrase = reader.text("phrase", 60);
  const categoryId = reader.uuid("categoryId");
  reader.done();
  return rememberRule(db(), userId, phrase, categoryId);
}

export async function deleteRule(userId: string, id: string) {
  const { count } = await db().categoryRule.deleteMany({ where: { userId, id } });
  if (!count) throw notFound();
}

/** Read-only: which category would a description get? The description travels in the body, not the URL. */
export async function suggestForDescription(userId: string, input: Record<string, unknown>) {
  const reader = new Reader(input);
  const description = reader.text("description", 200);
  reader.done();
  const rule = await suggestCategory(db(), userId, description);
  return { categoryId: rule?.categoryId ?? null, rule };
}
