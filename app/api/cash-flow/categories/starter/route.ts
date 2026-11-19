import { api } from "@/server/cash-flow/http";
import { addStarterCategories } from "@/server/cash-flow/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = api(async ({ userId, body }) => addStarterCategories(userId, await body()));
