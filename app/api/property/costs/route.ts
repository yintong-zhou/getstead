import { api } from "@/server/cash-flow/http";
import { getCosts, parseCostQuery } from "@/server/property/service";

export const runtime = "nodejs";
export const GET = api(({ userId, url }) => getCosts(userId, parseCostQuery(url.searchParams)));
