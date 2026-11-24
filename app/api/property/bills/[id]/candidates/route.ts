import { api } from "@/server/cash-flow/http";
import { paramId } from "@/server/cash-flow/validate";
import { billCandidates } from "@/server/property/bills";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Movements that could pay the bill; optional `month` and `offset` as in the recurring picker. */
export const GET = api<{ id: string }>(({ userId, params, url }) => billCandidates(userId, paramId(params.id), url.searchParams));
