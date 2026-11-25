import { api } from "@/server/cash-flow/http";
import { createContract, getContracts } from "@/server/property/contracts";
export const runtime = "nodejs";
export const GET = api(({ userId }) => getContracts(userId));
export const POST = api(async ({ userId, body }) => createContract(userId, await body()), { status: 201 });
