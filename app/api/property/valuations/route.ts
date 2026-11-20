import { api } from "@/server/cash-flow/http";
import { createValuation, listValuations } from "@/server/property/service";

export const runtime = "nodejs";
export const GET = api(({ userId }) => listValuations(userId));
export const POST = api(async ({ userId, body }) => createValuation(userId, await body()), { status: 201 });
