import { api } from "@/server/cash-flow/http";
import { refreshMarket } from "@/server/investments/service";

export const runtime = "nodejs";
export const POST = api(({ userId }) => refreshMarket(userId));
