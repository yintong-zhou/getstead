import { listEvents } from "@/server/admin/logs";
import { api } from "@/server/cash-flow/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = api(async ({ url }) => listEvents(url.searchParams), { admin: true });
