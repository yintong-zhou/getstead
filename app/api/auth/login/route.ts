import { authResponse, challengeCookie, readAuthBody, sameOrigin, sessionCookie, writeAuthCookie } from "@/server/auth/http";
import { normalizeEmail, validPasswordInput } from "@/server/auth/inputs";
import { signIn } from "@/server/auth/service";
import { recordEvent } from "@/server/admin/logs";
import { verifyTurnstile } from "@/server/turnstile";
import { clientAddress } from "@/server/waitlist/service";

const LIMIT_WINDOW_MS = 15 * 60_000;

export const runtime = "nodejs";

export function POST(request: Request) {
  return sameOrigin(request, async (secure) => {
    const body = await readAuthBody(request);
    const email = normalizeEmail(body?.email);
    const password = body?.password;
    if (!email || !validPasswordInput(password)) return authResponse(400);

    const event = { kind: "SECURITY", route: "/api/auth/login", method: "POST" } as const;
    // Bots are stopped before any password is checked. An unreachable Cloudflare answers 503 through sameOrigin.
    if (!await verifyTurnstile(body?.turnstile, "login", clientAddress(request.headers))) {
      await recordEvent({ ...event, code: "login_challenge_failed" }, LIMIT_WINDOW_MS);
      return authResponse(403);
    }

    const result = await signIn(email, password);
    // Single wrong passwords are not logged: only a tripped limiter (once per window) or a disabled account.
    if (result.status === "limited") {
      await recordEvent({ ...event, code: "login_limited", userId: result.userId }, LIMIT_WINDOW_MS);
      return authResponse(429);
    }
    if (result.status === "disabled") {
      await recordEvent({ ...event, code: "login_disabled", userId: result.userId });
      return authResponse(401);
    }
    if (result.status === "invalid") return authResponse(401);

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
