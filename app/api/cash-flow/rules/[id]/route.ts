import { api } from "@/server/cash-flow/http";
import { deleteRule } from "@/server/cash-flow/rules";
import { paramId } from "@/server/cash-flow/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DELETE = api<{ id: string }>(({ userId, params }) => deleteRule(userId, paramId(params.id)));
