import { api } from "@/server/cash-flow/http";
import { updateTotp } from "@/server/profile/service";

export const runtime = "nodejs";

export const POST = api(async ({ userId, sessionToken, body }) => updateTotp(userId, sessionToken, await body()), { shared: true });
