import { api } from "@/server/cash-flow/http";
import { createMovement, listMovements, listMovementsPage } from "@/server/cash-flow/movements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = api(({ userId, url }) => (url.searchParams.has("page") ? listMovementsPage(userId, url.searchParams) : listMovements(userId, url.searchParams)));
export const POST = api(async ({ userId, body }) => createMovement(userId, await body()), { status: 201 });
