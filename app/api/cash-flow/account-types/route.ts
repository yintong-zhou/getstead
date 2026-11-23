import { api } from "@/server/cash-flow/http";
import { createAccountType, listAccountTypes } from "@/server/cash-flow/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = api(({ userId }) => listAccountTypes(userId));
export const POST = api(async ({ userId, body }) => createAccountType(userId, await body()), { status: 201 });
