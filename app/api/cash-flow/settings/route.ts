import { api } from "@/server/cash-flow/http";
import { getCashReporting, updateCashReporting } from "@/server/cash-flow/cash-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = api(({ userId }) => getCashReporting(userId));
export const PATCH = api(async ({ userId, body }) => updateCashReporting(userId, await body()));
