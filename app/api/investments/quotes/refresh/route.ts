import { api } from "@/server/cash-flow/http";
import { refreshMarketQuotes } from "@/server/investments/service";

export const runtime = "nodejs";
export const POST = api(({ userId }) => refreshMarketQuotes(userId));
