import { api } from "@/server/cash-flow/http";
import { getNetWorth } from "@/server/net-worth/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = api(({ userId }) => getNetWorth(userId));
