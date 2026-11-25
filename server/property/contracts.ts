import { randomUUID } from "node:crypto";
import { db } from "../auth/database.ts";
import { fromDate, toDate } from "../cash-flow/dates.ts";
import { ApiError, notFound } from "../cash-flow/errors.ts";
import { Reader } from "../cash-flow/validate.ts";
import { billTypes, validUtilityPrice } from "./calc.ts";
import { lockProperty, write } from "./service.ts";

function fields(input: Record<string, unknown>) {
  const r = new Reader(input);
  const type = r.oneOf("type", billTypes);
  const provider = r.text("provider", 80);
  const unitPrice = r.text("unitPrice", 13);
  const unit = r.text("unit", 30);
  const activationDate = r.date("activationDate");
  const periodStart = r.date("periodStart");
  const periodEnd = r.date("periodEnd");
  const durationMonths = r.integer("durationMonths", 1, 1200);
  r.done();
  if (!validUtilityPrice(unitPrice)) throw new ApiError(422, "validation", "unitPrice");
  if (periodStart > periodEnd) throw new ApiError(422, "validation", "periodEnd");
  return { type, provider, unitPrice, unit, activationDate: toDate(activationDate), periodStart: toDate(periodStart), periodEnd: toDate(periodEnd), durationMonths };
}

export async function getContracts(userId: string) {
  const rows = await db().utilityContract.findMany({ where: { userId }, orderBy: [{ periodStart: "desc" }, { id: "desc" }] });
  return rows.map((r) => ({ ...r, unitPrice: r.unitPrice.toFixed(), activationDate: fromDate(r.activationDate), periodStart: fromDate(r.periodStart), periodEnd: fromDate(r.periodEnd), createdAt: r.createdAt.toISOString() }));
}
export type Contracts = Awaited<ReturnType<typeof getContracts>>;

export async function createContract(userId: string, input: Record<string, unknown>) {
  const { propertyId, ...rest } = input;
  const r = new Reader({ propertyId });
  const id = r.uuid("propertyId");
  const data = fields(rest);
  return write(userId, async (tx) => {
    await lockProperty(tx, userId, id);
    if (await tx.utilityContract.count({ where: { userId } }) >= 5000) throw new ApiError(422, "validation");
    await tx.utilityContract.create({ data: { id: randomUUID(), userId, propertyId: id, ...data } });
  });
}

export async function updateContract(userId: string, id: string, input: Record<string, unknown>) {
  const data = fields(input);
  return write(userId, async (tx) => {
    const row = await tx.utilityContract.findUnique({ where: { userId_id: { userId, id } } });
    if (!row) throw notFound();
    await tx.utilityContract.update({ where: { userId_id: { userId, id } }, data });
  });
}
