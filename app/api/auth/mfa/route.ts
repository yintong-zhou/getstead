import type { NextRequest } from "next/server";
import { authResponse, challengeCookie, readAuthBody, sameOrigin, sessionCookie, writeAuthCookie } from "@/server/auth/http";
import { validTotpCode } from "@/server/auth/inputs";
import { verifyMfa } from "@/server/auth/service";

export const runtime = "nodejs";

export function POST(request: NextRequest) {
  return sameOrigin(request, async (secure) => {
    const code = (await readAuthBody(request))?.code;
    if (!validTotpCode(code)) return authResponse(400);

    const result = await verifyMfa(request.cookies.get(challengeCookie)?.value, code);
    if (result.status !== "ok") {
      const statuses = { limited: 429, expired: 410, invalid: 401 };
      return authResponse(statuses[result.status]);
    }

    const response = authResponse(204);
    writeAuthCookie(response, challengeCookie, "", 0, secure);
    writeAuthCookie(response, sessionCookie, result.token, 28_800, secure);
    return response;
  });
}
