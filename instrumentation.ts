import type { Instrumentation } from "next";

// Errors thrown by pages, server components and the auth routes (API routes behind api() catch and
// log their own). Only the error class and the route pattern are stored, never the message.
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { recordEvent } = await import("./server/admin/logs.ts");
  await recordEvent({
    kind: "ERROR",
    code: error instanceof Error ? error.name : "unknown",
    route: context.routePath,
    method: request.method,
  });
};
