import { api } from "@/server/cash-flow/http";
import { createProperty } from "@/server/property/service";

export const runtime = "nodejs";
export const POST = api(async ({ userId, body }) => createProperty(userId, await body()), { status: 201 });
