import { resetUserPassword } from "@/server/admin/users";
import { api } from "@/server/cash-flow/http";
import { paramId } from "@/server/cash-flow/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = api<{ id: string }>(async ({ userId, params }) => resetUserPassword(userId, paramId(params.id)), { admin: true });
