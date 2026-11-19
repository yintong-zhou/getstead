import { api } from "@/server/cash-flow/http";
import { resolveOccurrence } from "@/server/cash-flow/recurring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = api(async ({ userId, body }) => resolveOccurrence(userId, await body()));
