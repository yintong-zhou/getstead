import { api } from "@/server/cash-flow/http";
import { getProfile, updateDisplayName } from "@/server/profile/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = api(({ userId }) => getProfile(userId));
export const PATCH = api(async ({ userId, body }) => updateDisplayName(userId, (await body()).displayName));
