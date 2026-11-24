// Deterministic finance rules. Pure functions over integer cents: no database, clock or locale.

import { type Month } from "./dates.ts";

export type CategoryKindName = "EXPENSE" | "INCOME";

/** The fields of a movement that totals depend on. */
export type CalcMovement = {
  amountCents: number;
  categoryId: string | null;
  categoryKind: CategoryKindName | null;
  voided: boolean;
  paired: boolean;
  excluded?: boolean;
};

/** Voided movements and both legs of a transfer never reach any total. */
export function counts(movement: CalcMovement) {
  return !movement.voided && !movement.paired && !movement.excluded;
}

/**
 * Net spending of one movement. A movement in an expense category subtracts its signed amount, so
 * a refund (positive amount) reduces spending. Uncategorised movements are spending when negative.
 * Zero for anything that counts as income instead.
 */
function expenseOf(movement: CalcMovement) {
  if (movement.categoryKind === "EXPENSE") return -movement.amountCents;
  if (movement.categoryKind === null && movement.amountCents < 0) return -movement.amountCents;
  return 0;
}

function incomeOf(movement: CalcMovement) {
  if (movement.categoryKind === "INCOME") return movement.amountCents;
  if (movement.categoryKind === null && movement.amountCents > 0) return movement.amountCents;
  return 0;
}

export function summarize(movements: readonly CalcMovement[]) {
  let incomeCents = 0;
  let expenseCents = 0;
  for (const movement of movements) {
    if (!counts(movement)) continue;
    incomeCents += incomeOf(movement);
    expenseCents += expenseOf(movement);
  }
  return { incomeCents, expenseCents, netCents: incomeCents - expenseCents };
}

/** Net spent per expense category (refunds included). Income categories and transfers never appear. */
export function spentByCategory(movements: readonly CalcMovement[]) {
  const spent = new Map<string, number>();
  for (const movement of movements) {
    if (!counts(movement) || movement.categoryKind !== "EXPENSE" || !movement.categoryId) continue;
    spent.set(movement.categoryId, (spent.get(movement.categoryId) ?? 0) + expenseOf(movement));
  }
  return spent;
}

export type LimitRow = { month: Month; kind: "BASE" | "OVERRIDE"; limitCents: number | null };

/**
 * The limit that applies to `month`: that month's override if there is one, otherwise the latest
 * base that starts on or before it. A null limit means the category has no budget.
 */
export function applicableLimit(rows: readonly LimitRow[], month: Month) {
  const override = rows.find((row) => row.kind === "OVERRIDE" && row.month === month);
  if (override) return { limitCents: override.limitCents, source: "override" as const };

  let base: LimitRow | undefined;
  for (const row of rows) {
    if (row.kind === "BASE" && row.month <= month && (!base || row.month > base.month)) base = row;
  }
  return base?.limitCents != null
    ? { limitCents: base.limitCents, source: "base" as const }
    : { limitCents: null, source: "none" as const };
}

/** Positive variance means room left; negative means over the limit. */
export function varianceOf(limitCents: number | null, spentCents: number) {
  return limitCents === null ? null : limitCents - spentCents;
}

// ---- Category rules ----------------------------------------------------------------------------

/** Lower case, without accents, with punctuation and runs of whitespace reduced to single spaces. */
export function normalizePhrase(text: string) {
  return text
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export type RuleRow = { id: string; phrase: string; categoryId: string };

/**
 * The rule whose phrase occurs in the description as whole words. The longest phrase wins; equal
 * lengths go to the alphabetically first phrase, then the smaller id, so the outcome never depends
 * on row order.
 */
export function matchRule<T extends RuleRow>(description: string, rules: readonly T[]): T | null {
  const haystack = ` ${normalizePhrase(description)} `;
  let best: T | null = null;
  for (const rule of rules) {
    if (!rule.phrase || !haystack.includes(` ${rule.phrase} `)) continue;
    if (
      !best ||
      rule.phrase.length > best.phrase.length ||
      (rule.phrase.length === best.phrase.length &&
        (rule.phrase < best.phrase || (rule.phrase === best.phrase && rule.id < best.id)))
    ) best = rule;
  }
  return best;
}
