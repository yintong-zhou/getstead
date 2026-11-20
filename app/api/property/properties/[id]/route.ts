import { api } from "@/server/cash-flow/http";
import { paramId } from "@/server/cash-flow/validate";
import { updateProperty } from "@/server/property/service";

export const runtime = "nodejs";
export const PATCH = api<{ id: string }>(async ({ userId, params, body }) => updateProperty(userId, paramId(params.id), await body()));
