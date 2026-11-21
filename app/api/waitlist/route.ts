import { authResponse, readAuthBody, sameOrigin } from "@/server/auth/http";
import { reserveAttempt } from "@/server/auth/limits";
import { recordEvent } from "@/server/admin/logs";
import { clientAddress, joinWaitlist, parseWaitlist } from "@/server/waitlist/service";
import { verifyTurnstile } from "@/server/turnstile";

const LIMIT_WINDOW_MS = 15 * 60_000;
const event = { route: "/api/waitlist", method: "POST" } as const;

export const runtime = "nodejs";

export function POST(request: Request) {
  return sameOrigin(request, async () => {
    const input = parseWaitlist(await readAuthBody(request));
    if (input.status === "invalid") return authResponse(400);

    try {
      // The address is hashed inside reserveAttempt; neither it nor the email is logged.
      if (!await reserveAttempt("waitlist", clientAddress(request.headers))) {
        await recordEvent({ ...event, kind: "SECURITY", code: "waitlist_limited" }, LIMIT_WINDOW_MS);
        return authResponse(429);
      }
      // A bot gets the same success answer as a person, and nothing is stored.
      if (input.status === "ok") {
        if (!await verifyTurnstile(input.turnstile, "waitlist", clientAddress(request.headers))) {
          await recordEvent({ ...event, kind: "SECURITY", code: "waitlist_challenge_failed" }, LIMIT_WINDOW_MS);
          return authResponse(403);
        }
        await joinWaitlist(input.email, input.locale);
      }
      return authResponse(204);
    } catch {
      // A missing table or grant would otherwise show up only as a silent 503: leave a row for the admin log.
      await recordEvent({ ...event, kind: "ERROR", code: "waitlist_failed" }, LIMIT_WINDOW_MS);
      return authResponse(503);
    }
  });
}
