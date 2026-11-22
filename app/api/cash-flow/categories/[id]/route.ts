import { api } from "@/server/cash-flow/http";
import { deleteCategory, updateCategory } from "@/server/cash-flow/catalog";
import { paramId } from "@/server/cash-flow/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = api<{ id: string }>(async ({ userId, params, body }) => updateCategory(userId, paramId(params.id), await body()));
export const DELETE = api<{ id: string }>(({ userId, params }) => deleteCategory(userId, paramId(params.id)));
