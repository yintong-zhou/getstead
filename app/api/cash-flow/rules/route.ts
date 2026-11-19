import { api } from "@/server/cash-flow/http";
import { createRule, listRules } from "@/server/cash-flow/rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = api(({ userId }) => listRules(userId));
export const POST = api(async ({ userId, body }) => createRule(userId, await body()), { status: 201 });
