import { setUserDisabled } from "@/server/admin/users";
import { api } from "@/server/cash-flow/http";
import { paramId } from "@/server/cash-flow/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = api<{ id: string }>(async ({ userId, params }) => { await setUserDisabled(userId, paramId(params.id), false); }, { admin: true });
