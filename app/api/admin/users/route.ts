import { createUser, listUsers } from "@/server/admin/users";
import { api } from "@/server/cash-flow/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = api(async ({ url }) => listUsers(url.searchParams), { admin: true });
export const POST = api(async ({ userId, body }) => createUser(userId, await body()), { admin: true, status: 201 });
