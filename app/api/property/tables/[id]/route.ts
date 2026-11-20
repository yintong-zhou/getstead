import { api } from "@/server/cash-flow/http";
import { paramId } from "@/server/cash-flow/validate";
import { deleteTable, updateTable } from "@/server/property/service";

export const runtime = "nodejs";
export const PATCH = api<{ id: string }>(async ({ userId, params, body }) => updateTable(userId, paramId(params.id), await body()));
export const DELETE = api<{ id: string }>(({ userId, params }) => deleteTable(userId, paramId(params.id)));
