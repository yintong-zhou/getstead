import { api } from "@/server/cash-flow/http";
import { createTemplate, listRecurring } from "@/server/cash-flow/recurring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = api(({ userId, url }) => listRecurring(userId, url.searchParams));
export const POST = api(async ({ userId, body }) => createTemplate(userId, await body()), { status: 201 });
