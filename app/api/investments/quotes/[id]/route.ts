import { api } from "@/server/cash-flow/http";
import { paramId } from "@/server/cash-flow/validate";
import { deleteQuote } from "@/server/investments/service";

export const runtime = "nodejs";
export const DELETE = api<{ id: string }>(({ userId, params }) => deleteQuote(userId, paramId(params.id)));
