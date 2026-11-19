import { api } from "@/server/cash-flow/http";
import { suggestForDescription } from "@/server/cash-flow/rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST rather than GET so the description never appears in a URL.
export const POST = api(async ({ userId, body }) => suggestForDescription(userId, await body()));
