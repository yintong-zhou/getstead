import { api } from "@/server/cash-flow/http";
import { transferCandidates } from "@/server/cash-flow/movements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = api(({ userId, url }) => transferCandidates(userId, url.searchParams));
