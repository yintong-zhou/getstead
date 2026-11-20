import { api } from "@/server/cash-flow/http";
import { changeEmail } from "@/server/profile/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = api(async ({ userId, body }) => changeEmail(userId, await body()));
