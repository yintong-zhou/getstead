import { api } from "@/server/cash-flow/http";
import { updateCategory } from "@/server/cash-flow/catalog";
import { paramId } from "@/server/cash-flow/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = api<{ id: string }>(async ({ userId, params, body }) => updateCategory(userId, paramId(params.id), await body()));
