// Route-handler wrapper for /api/cash-flow. Every handler gets an authenticated user id taken from
// the session cookie, never from the request body or URL. Mutations also require a same-origin
// request, and every response is JSON with Cache-Control: no-store.

import { NextResponse, type NextRequest } from "next/server.js";
import { appOrigin } from "../auth/config.ts";
import { readAuthBody, sessionCookie } from "../auth/http.ts";
import { readSession } from "../auth/service.ts";
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

type Options = { status?: number };

function json(data: unknown, status: number) {
  return NextResponse.json(data, { status, headers: noStore });
}

function failure(error: unknown) {
  if (error instanceof ApiError) return json({ error: error.code, field: error.field }, error.status);

  // Prisma codes are mapped without ever echoing a message, which can contain row values.
  const code = (error as { code?: unknown } | null)?.code;
  if (code === "P2025") return json({ error: "not_found" }, 404);
  if (code === "P2002") return json({ error: "conflict" }, 409);
  if (code === "P2003") return json({ error: "conflict" }, 409);

  // Log the error class only: messages and stacks may carry financial or personal data.
  console.error("cash-flow request failed", error instanceof Error ? error.name : typeof error, typeof code === "string" ? code : "");
  return json({ error: "internal" }, 500);
}

export function api<P = Record<string, never>>(
  handler: (context: ApiContext<P>) => Promise<unknown>,
  options: Options = {},
) {
  return async (request: NextRequest, route: { params: Promise<P> }): Promise<NextResponse> => {
    try {
      if (!["GET", "HEAD"].includes(request.method) && request.headers.get("origin") !== appOrigin().origin) {
        return json({ error: "forbidden" }, 403);
      }

      const sessionToken = request.cookies.get(sessionCookie)?.value;
      const session = await readSession(sessionToken);
      if (!session || !sessionToken) return json({ error: "unauthenticated" }, 401);

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
      return failure(error);
    }
  };
}
