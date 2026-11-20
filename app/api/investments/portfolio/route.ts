import { api } from "@/server/cash-flow/http";
import { getPortfolio } from "@/server/investments/service";

export const runtime = "nodejs";
export const GET = api(({ userId }) => getPortfolio(userId));
