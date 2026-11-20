import { api } from "@/server/cash-flow/http";
import { createSchedule } from "@/server/property/service";

export const runtime = "nodejs";
export const POST = api(async ({ userId, body }) => createSchedule(userId, await body()), { status: 201 });
