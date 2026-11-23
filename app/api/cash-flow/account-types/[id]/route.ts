import { api } from "@/server/cash-flow/http";
import { deleteAccountType, updateAccountType } from "@/server/cash-flow/catalog";
import { paramId } from "@/server/cash-flow/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = api<{ id: string }>(async ({ userId, params, body }) => updateAccountType(userId, paramId(params.id), await body()));
export const DELETE = api<{ id: string }>(({ userId, params }) => deleteAccountType(userId, paramId(params.id)));
