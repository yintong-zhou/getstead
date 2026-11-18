import type { NextRequest } from "next/server";
import { authResponse, challengeCookie, sameOrigin, sessionCookie, writeAuthCookie } from "@/server/auth/http";
import { signOut } from "@/server/auth/service";

export const runtime = "nodejs";

export function POST(request: NextRequest) {
  return sameOrigin(request, async (secure) => {
    await signOut(request.cookies.get(sessionCookie)?.value, request.cookies.get(challengeCookie)?.value);

    const response = authResponse(204);
    writeAuthCookie(response, sessionCookie, "", 0, secure);
    writeAuthCookie(response, challengeCookie, "", 0, secure);
    return response;
  });
}
