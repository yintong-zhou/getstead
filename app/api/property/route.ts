import { api } from "@/server/cash-flow/http";
import { getOverview } from "@/server/property/service";

export const runtime = "nodejs";
export const GET = api(({ userId }) => getOverview(userId));
