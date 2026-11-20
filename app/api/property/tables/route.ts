import { api } from "@/server/cash-flow/http";
import { createTable } from "@/server/property/service";

export const runtime = "nodejs";
export const POST = api(async ({ userId, body }) => createTable(userId, await body()), { status: 201 });
