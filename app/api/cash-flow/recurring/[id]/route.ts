import { api } from "@/server/cash-flow/http";
import { deleteTemplate, updateTemplate } from "@/server/cash-flow/recurring";
import { paramId } from "@/server/cash-flow/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = api<{ id: string }>(async ({ userId, params, body }) => updateTemplate(userId, paramId(params.id), await body()));
export const DELETE = api<{ id: string }>(async ({ userId, params }) => deleteTemplate(userId, paramId(params.id)));
