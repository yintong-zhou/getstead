import { api } from "@/server/cash-flow/http";
import { paramId } from "@/server/cash-flow/validate";
import { deleteInstrument, updateInstrument } from "@/server/investments/service";

export const runtime = "nodejs";
export const PATCH = api<{ id: string }>(async ({ userId, params, body }) => updateInstrument(userId, paramId(params.id), await body()));
export const DELETE = api<{ id: string }>(({ userId, params }) => deleteInstrument(userId, paramId(params.id)));
