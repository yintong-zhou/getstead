import { api } from "@/server/cash-flow/http";
import { paramId } from "@/server/cash-flow/validate";
import { deleteValuation, updateValuation } from "@/server/property/service";

export const runtime = "nodejs";
export const PATCH = api<{ id: string }>(async ({ userId, params, body }) => updateValuation(userId, paramId(params.id), await body()));
export const DELETE = api<{ id: string }>(({ userId, params }) => deleteValuation(userId, paramId(params.id)));
