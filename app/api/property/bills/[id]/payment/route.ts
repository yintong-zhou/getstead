import { api } from "@/server/cash-flow/http";
import { paramId } from "@/server/cash-flow/validate";
import { linkBill, unlinkBill } from "@/server/property/bills";

export const runtime = "nodejs";
/** POST { movementId } marks the bill paid by that movement; DELETE reopens it and keeps the movement. */
export const POST = api<{ id: string }>(async ({ userId, params, body }) => linkBill(userId, paramId(params.id), await body()));
export const DELETE = api<{ id: string }>(({ userId, params }) => unlinkBill(userId, paramId(params.id)));
