import { api } from "@/server/cash-flow/http";
import { createTransaction, listTransactions } from "@/server/investments/service";

export const runtime = "nodejs";
export const GET = api(({ userId }) => listTransactions(userId));
export const POST = api(async ({ userId, body }) => createTransaction(userId, await body()), { status: 201 });
