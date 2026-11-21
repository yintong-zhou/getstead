import { api } from "@/server/cash-flow/http";
import { deleteAccount, updateAccount } from "@/server/cash-flow/catalog";
import { paramId } from "@/server/cash-flow/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = api<{ id: string }>(async ({ userId, params, body }) => updateAccount(userId, paramId(params.id), await body()));
export const DELETE = api<{ id: string }>(({ userId, params }) => deleteAccount(userId, paramId(params.id)));
