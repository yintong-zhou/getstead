import { api } from "@/server/cash-flow/http";
import { unpairTransfer } from "@/server/cash-flow/movements";
import { paramId } from "@/server/cash-flow/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DELETE = api<{ id: string }>(({ userId, params }) => unpairTransfer(userId, paramId(params.id)));
