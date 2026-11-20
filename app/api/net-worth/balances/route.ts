import { NextResponse } from "next/server.js";
import { api } from "@/server/cash-flow/http";
import { listChecks, recordCheck } from "@/server/net-worth/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = api(({ userId }) => listChecks(userId));
export const POST = api(async ({ userId, body }) => {
  const { check, created } = await recordCheck(userId, await body());
  return NextResponse.json(check, { status: created ? 201 : 200 });
});
