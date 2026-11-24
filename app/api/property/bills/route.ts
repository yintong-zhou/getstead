import { api } from "@/server/cash-flow/http";
import { createBill, getBills } from "@/server/property/bills";
import { parseCostQuery } from "@/server/property/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Bills due in `?year=` (default: the current Rome year) with their totals. */
export const GET = api(({ userId, url }) => getBills(userId, parseCostQuery(url.searchParams)));
export const POST = api(async ({ userId, body }) => createBill(userId, await body()), { status: 201 });
