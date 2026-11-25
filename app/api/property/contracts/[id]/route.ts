import { api } from "@/server/cash-flow/http";
import { paramId } from "@/server/cash-flow/validate";
import { updateContract } from "@/server/property/contracts";
export const runtime = "nodejs";
export const PATCH = api<{ id: string }>(async ({ userId, params, body }) => updateContract(userId, paramId(params.id), await body()));
