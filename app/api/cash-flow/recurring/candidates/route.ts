import { api } from "@/server/cash-flow/http";
import { occurrenceCandidates } from "@/server/cash-flow/recurring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = api(({ userId, url }) => occurrenceCandidates(userId, url.searchParams));
