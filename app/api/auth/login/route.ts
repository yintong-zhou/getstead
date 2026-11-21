import { authResponse, challengeCookie, readAuthBody, sameOrigin, sessionCookie, writeAuthCookie } from "@/server/auth/http";
import { normalizeEmail, validPasswordInput } from "@/server/auth/inputs";
import { signIn } from "@/server/auth/service";

export const runtime = "nodejs";

export function POST(request: Request) {
  return sameOrigin(request, async (secure) => {
    const body = await readAuthBody(request);
    const email = normalizeEmail(body?.email);
    const password = body?.password;
    if (!email || !validPasswordInput(password)) return authResponse(400);

    const result = await signIn(email, password);
    if (result.status === "limited" || result.status === "invalid") return authResponse(result.status === "limited" ? 429 : 401);

    const response = authResponse(result.status === "mfa" ? 202 : 204);
    if (result.status === "mfa") {
      writeAuthCookie(response, challengeCookie, result.token, 300, secure);
      writeAuthCookie(response, sessionCookie, "", 0, secure);
    } else {
      writeAuthCookie(response, sessionCookie, result.token, 28_800, secure);
      writeAuthCookie(response, challengeCookie, "", 0, secure);
    }
    return response;
  });
}
