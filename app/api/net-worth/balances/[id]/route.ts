import { api } from "@/server/cash-flow/http";
import { paramId } from "@/server/cash-flow/validate";
import { deleteCheck } from "@/server/net-worth/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DELETE = api<{ id: string }>(({ userId, params }) => deleteCheck(userId, paramId(params.id)));
