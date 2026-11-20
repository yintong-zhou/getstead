import { api } from "@/server/cash-flow/http";
import { createProperty, getOverview } from "@/server/property/service";

export const runtime = "nodejs";
export const GET = api(async ({ userId }) => (await getOverview(userId)).properties);
export const POST = api(async ({ userId, body }) => createProperty(userId, await body()), { status: 201 });
