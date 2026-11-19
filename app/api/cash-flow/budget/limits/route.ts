import { api } from "@/server/cash-flow/http";
import { clearOverride, setLimit } from "@/server/cash-flow/budget";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PUT = api(async ({ userId, body }) => setLimit(userId, await body()));
export const DELETE = api(({ userId, url }) => clearOverride(userId, url.searchParams));
