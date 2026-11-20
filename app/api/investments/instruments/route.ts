import { api } from "@/server/cash-flow/http";
import { createInstrument, listInstruments } from "@/server/investments/service";

export const runtime = "nodejs";
export const GET = api(({ userId }) => listInstruments(userId));
export const POST = api(async ({ userId, body }) => createInstrument(userId, await body()), { status: 201 });
