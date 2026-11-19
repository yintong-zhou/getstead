import { api } from "@/server/cash-flow/http";
import { updateTemplate } from "@/server/cash-flow/recurring";
import { paramId } from "@/server/cash-flow/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = api<{ id: string }>(async ({ userId, params, body }) => updateTemplate(userId, paramId(params.id), await body()));
