import { NextResponse } from "next/server.js";
import { appOrigin } from "./config.ts";

export const sessionCookie = "getstead_session";
export const challengeCookie = "getstead_login_challenge";

export function authResponse(status: number) {
  return new NextResponse(null, { status, headers: { "Cache-Control": "no-store" } });
}

export async function sameOrigin(request: Request, action: (secure: boolean) => Promise<NextResponse>) {
  try {
    const origin = appOrigin();
    if (request.headers.get("origin") !== origin.origin) return authResponse(403);
    return await action(origin.protocol === "https:");
  } catch {
    return authResponse(503);
  }
}

export async function readAuthBody(request: Request, maxBytes = 4_096) {
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json" || !request.body) return null;
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0;
  let body = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return null;
      }
      body += decoder.decode(chunk.value, { stream: true });
    }
    const value: unknown = JSON.parse(body + decoder.decode());
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

export function writeAuthCookie(response: NextResponse, name: string, value: string, maxAge: number, secure: boolean) {
  response.cookies.set(name, value, {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: "/",
    maxAge,
  });
}
