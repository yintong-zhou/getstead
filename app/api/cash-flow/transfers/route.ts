import { api } from "@/server/cash-flow/http";
import { createTransfer } from "@/server/cash-flow/movements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = api(async ({ userId, body }) => createTransfer(userId, await body()), { status: 201 });
