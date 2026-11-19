import { api } from "@/server/cash-flow/http";
import { getBudget } from "@/server/cash-flow/budget";
import { ApiError } from "@/server/cash-flow/errors";
import { monthOf, parseMonth, romeToday } from "@/server/cash-flow/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = api(({ userId, url }) => {
  const month = url.searchParams.has("month") ? parseMonth(url.searchParams.get("month")) : monthOf(romeToday());
  if (!month) throw new ApiError(422, "validation", "month");
  return getBudget(userId, month);
});
