import { api } from "@/server/cash-flow/http";
import { paramId } from "@/server/cash-flow/validate";
import { findInstrumentMarket, linkInstrumentMarket } from "@/server/investments/service";

export const runtime = "nodejs";
export const POST = api<{ id: string }>(async ({ userId, params, body }) => findInstrumentMarket(userId, paramId(params.id), await body()));
export const PATCH = api<{ id: string }>(async ({ userId, params, body }) => linkInstrumentMarket(userId, paramId(params.id), await body()));
