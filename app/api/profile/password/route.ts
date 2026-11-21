import { api } from "@/server/cash-flow/http";
import { changePassword } from "@/server/profile/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = api(async ({ userId, sessionToken, body }) => changePassword(userId, await body(), sessionToken), { allowPasswordChange: true, shared: true });
