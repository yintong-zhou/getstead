import { adminOverview } from "@/server/admin/users";
import { api } from "@/server/cash-flow/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = api(async () => adminOverview(), { admin: true });
