import { api } from "@/server/cash-flow/http";
import { listQuotes, recordQuote } from "@/server/investments/service";

export const runtime = "nodejs";
export const GET = api(({ userId }) => listQuotes(userId));
export const POST = api(async ({ userId, body }) => recordQuote(userId, await body()), { status: 201 });
