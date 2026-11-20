import { api } from "@/server/cash-flow/http";
import { paramId } from "@/server/cash-flow/validate";
import { deleteSchedule } from "@/server/property/service";

export const runtime = "nodejs";
export const DELETE = api<{ id: string }>(({ userId, params }) => deleteSchedule(userId, paramId(params.id)));
