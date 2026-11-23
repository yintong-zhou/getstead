import { NextResponse } from "next/server";
import { api } from "@/server/cash-flow/http";
import { setupInstrument } from "@/server/investments/service";

export const runtime = "nodejs";
export const POST = api(async ({ userId, body }) => {
  const result = await setupInstrument(userId, await body());
  return NextResponse.json(result, { status: result.status === "created" ? 201 : 200 });
});
