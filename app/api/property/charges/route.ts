import { api } from "@/server/cash-flow/http";
import { createCharge } from "@/server/property/service";

export const runtime = "nodejs";
export const POST = api(async ({ userId, body }) => createCharge(userId, await body()), { status: 201 });
