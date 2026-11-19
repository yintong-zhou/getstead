import { api } from "@/server/cash-flow/http";
import { createAccount, listAccounts } from "@/server/cash-flow/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = api(({ userId, url }) => listAccounts(userId, url.searchParams.get("archived") === "1"));
export const POST = api(async ({ userId, body }) => createAccount(userId, await body()), { status: 201 });
