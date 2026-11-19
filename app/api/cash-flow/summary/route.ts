import { api } from "@/server/cash-flow/http";
import { ApiError } from "@/server/cash-flow/errors";
import { monthOf, parseMonth, romeToday } from "@/server/cash-flow/dates";
import { monthSummary } from "@/server/cash-flow/reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = api(({ userId, url }) => {
  const month = url.searchParams.has("month") ? parseMonth(url.searchParams.get("month")) : monthOf(romeToday());
  if (!month) throw new ApiError(422, "validation", "month");
  return monthSummary(userId, month);
});
