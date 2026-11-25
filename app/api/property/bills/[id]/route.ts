import { api } from "@/server/cash-flow/http";
import { paramId } from "@/server/cash-flow/validate";
import { deleteBill, updateBill } from "@/server/property/bills";

export const runtime = "nodejs";
export const PATCH = api<{ id: string }>(async ({ userId, params, body }) => updateBill(userId, paramId(params.id), await body()));
export const DELETE = api<{ id: string }>(({ userId, params }) => deleteBill(userId, paramId(params.id)));
