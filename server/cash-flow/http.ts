// Route-handler wrapper for /api/cash-flow. Every handler gets an authenticated user id taken from
// the session cookie, never from the request body or URL. Mutations also require a same-origin
// request, and every response is JSON with Cache-Control: no-store.

import { NextResponse, type NextRequest } from "next/server.js";
import { appOrigin } from "../auth/config.ts";
import { readAuthBody, sessionCookie } from "../auth/http.ts";
import { readSession } from "../auth/service.ts";
import { recordEvent } from "../admin/logs.ts";
import { ApiError } from "./errors.ts";

const noStore = { "Cache-Control": "no-store" };

export type ApiContext<P> = {
  userId: string;
  sessionToken: string;
  url: URL;
  params: P;
  /** The JSON object body; rejects a missing, oversized or non-object body with 400. */
  body: () => Promise<Record<string, unknown>>;
};

type Options = {
  status?: number;
  /** Only admins with two-step verification enabled may call the route. */
  admin?: boolean;
  /** The one route a user with a temporary password may still call: changing it. */
  allowPasswordChange?: boolean;
  /** Open to admin accounts too (the profile routes). Without it a route is for user accounts only. */
  shared?: boolean;
};

function json(data: unknown, status: number) {
  return NextResponse.json(data, { status, headers: noStore });
}

async function failure(error: unknown, request: NextRequest, userId: string | undefined) {
  if (error instanceof ApiError) return json({ error: error.code, field: error.field }, error.status);

  // Prisma codes are mapped without ever echoing a message, which can contain row values.
  const code = (error as { code?: unknown } | null)?.code;
  if (code === "P2025") return json({ error: "not_found" }, 404);
  if (code === "P2002") return json({ error: "conflict" }, 409);
  if (code === "P2003") return json({ error: "conflict" }, 409);

  // Log the error class only: messages and stacks may carry financial or personal data.
  const errorClass = error instanceof Error ? error.name : typeof error;
  console.error("cash-flow request failed", errorClass, typeof code === "string" ? code : "");
  await recordEvent({
    kind: "ERROR", code: typeof code === "string" ? code : errorClass,
    route: request.nextUrl.pathname, method: request.method, userId,
  });
  return json({ error: "internal" }, 500);
}

export function api<P = Record<string, never>>(
  handler: (context: ApiContext<P>) => Promise<unknown>,
  options: Options = {},
) {
  return async (request: NextRequest, route: { params: Promise<P> }): Promise<NextResponse> => {
    let userId: string | undefined;
    try {
      if (!["GET", "HEAD"].includes(request.method) && request.headers.get("origin") !== appOrigin().origin) {
        return json({ error: "forbidden" }, 403);
      }

      const sessionToken = request.cookies.get(sessionCookie)?.value;
      const session = await readSession(sessionToken);
      if (!session || !sessionToken) return json({ error: "unauthenticated" }, 401);
      userId = session.userId;
      if (session.mustChangePassword && !options.allowPasswordChange) return json({ error: "password_change_required" }, 403);
      if (options.admin && !(session.admin && session.hasTotp)) return json({ error: "forbidden" }, 403);
      // Finance routes are for user accounts: an admin account has no personal data to read or change here.
      if (session.admin && !options.admin && !options.shared) return json({ error: "forbidden" }, 403);

      const result = await handler({
        userId: session.userId,
        sessionToken,
        url: request.nextUrl,
        params: await route.params,
        body: async () => {
          const body = await readAuthBody(request, 16_384);
          if (!body) throw new ApiError(400, "bad_body");
          return body;
        },
      });
      if (result instanceof NextResponse) {
        result.headers.set("Cache-Control", noStore["Cache-Control"]);
        return result;
      }
      return result === undefined ? new NextResponse(null, { status: 204, headers: noStore }) : json(result, options.status ?? 200);
    } catch (error) {
      return failure(error, request, userId);
    }
  };
}
