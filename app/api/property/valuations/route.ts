import { api } from "@/server/cash-flow/http";
import { createValuation } from "@/server/property/service";

export const runtime = "nodejs";
export const POST = api(async ({ userId, body }) => createValuation(userId, await body()), { status: 201 });
