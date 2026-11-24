import { db } from "../auth/database.ts";
import { ApiError } from "./errors.ts";
import { Reader } from "./validate.ts";

export async function getCashReporting(userId: string) {
  return db().user.findUniqueOrThrow({ where: { id: userId }, select: { excludeCash: true } });
}

export async function updateCashReporting(userId: string, input: Record<string, unknown>) {
  const reader = new Reader(input);
  const excludeCash = reader.optionalBool("excludeCash");
  reader.done();
  if (excludeCash === undefined) throw new ApiError(422, "validation", "excludeCash");
  return db().user.update({ where: { id: userId }, data: { excludeCash }, select: { excludeCash: true } });
}
