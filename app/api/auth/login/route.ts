import { authResponse, challengeCookie, readAuthBody, sameOrigin, writeAuthCookie } from "@/server/auth/http";
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
    if (result.status !== "ok") return authResponse(result.status === "limited" ? 429 : 401);

    const response = authResponse(204);
    writeAuthCookie(response, challengeCookie, result.token, 300, secure);
    return response;
  });
}
