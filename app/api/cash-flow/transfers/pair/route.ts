import { api } from "@/server/cash-flow/http";
import { pairMovements } from "@/server/cash-flow/movements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = api(async ({ userId, body }) => pairMovements(userId, await body()), { status: 201 });
