import { api } from "@/server/cash-flow/http";
import { createCategory, listCategories } from "@/server/cash-flow/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = api(({ userId, url }) => listCategories(userId, url.searchParams.get("archived") === "1"));
export const POST = api(async ({ userId, body }) => createCategory(userId, await body()), { status: 201 });
