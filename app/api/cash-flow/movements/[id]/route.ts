import { api } from "@/server/cash-flow/http";
import { getMovement, updateMovement } from "@/server/cash-flow/movements";
import { paramId } from "@/server/cash-flow/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = api<{ id: string }>(({ userId, params }) => getMovement(userId, paramId(params.id)));
export const PATCH = api<{ id: string }>(async ({ userId, params, body }) => updateMovement(userId, paramId(params.id), await body()));
