// Error and security event log for the admin area. Rows hold a code, a route and user ids only:
// never emails, payloads, messages, stacks, IPs or amounts (AGENTS.md logging rule).

import type { EventKind, Prisma } from "../../db/generated/client.ts";
import { db } from "../auth/database.ts";
import { ApiError } from "../cash-flow/errors.ts";
import { integerParam } from "../cash-flow/movements.ts";
import { isUuid } from "../cash-flow/validate.ts";

export const EVENT_PAGE_SIZE = 50;
export const RETENTION_DAYS = 30;
const HOUR = 3_600_000;

export type EventInput = {
  kind: EventKind;
  code: string;
  route?: string | null;
  method?: string | null;
  userId?: string | null;
  actorId?: string | null;
};

const UUID_SEGMENT = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** A route path with ids replaced by `:id`, so rows group by endpoint and carry no identifiers. */
export function routePattern(pathname: string) {
  return pathname.replace(UUID_SEGMENT, ":id").slice(0, 200);
}

/** Keeps only characters that can never carry an email or free text into the log. */
export function eventCode(value: string) {
  return value.replace(/[^A-Za-z0-9_.:-]/g, "").slice(0, 64) || "unknown";
}

let lastPrune = 0;

/** Deletes rows past the retention window. */
export async function pruneEvents(now = Date.now()) {
  lastPrune = now;
  await db().eventLog.deleteMany({ where: { createdAt: { lt: new Date(now - RETENTION_DAYS * 24 * HOUR) } } });
}

/**
 * Writes one event and never throws: logging must not turn a handled failure into another one.
 * With `onceWithinMs`, an event with the same kind, code and user inside that window is not repeated,
 * which bounds the rows an attacker can create by hammering a rate-limited endpoint.
 */
export async function recordEvent(input: EventInput, onceWithinMs?: number) {
  try {
    const data = {
      kind: input.kind,
      code: eventCode(input.code),
      route: input.route ? routePattern(input.route) : null,
      method: input.method?.slice(0, 8) ?? null,
      userId: input.userId ?? null,
      actorId: input.actorId ?? null,
    };
    if (onceWithinMs) {
      const recent = await db().eventLog.findFirst({
        where: { kind: data.kind, code: data.code, userId: data.userId, createdAt: { gte: new Date(Date.now() - onceWithinMs) } },
        select: { id: true },
      });
      if (recent) return;
    }
    await db().eventLog.create({ data, select: { id: true } });
    // ponytail: prune piggybacks on traffic (at most hourly per process); move to Vercel Cron when cron lands.
    if (Date.now() - lastPrune > HOUR) await pruneEvents();
  } catch (error) {
    console.error("event log write failed", error instanceof Error ? error.name : typeof error);
  }
}

const KINDS = ["ERROR", "SECURITY"] as const;

function dateParam(params: URLSearchParams, name: string, endOfDay: boolean) {
  const value = params.get(name);
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) throw new ApiError(422, "validation", name);
  // ponytail: day boundaries are UTC, up to two hours off Rome time; convert if that ever matters.
  return new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
}

export type EventDto = {
  id: string; createdAt: string; kind: EventKind; code: string;
  route: string | null; method: string | null;
  userId: string | null; userEmail: string | null; actorEmail: string | null;
};

/** One page of events, newest first. Filters: kind, code (exact), email (substring), from/to (YYYY-MM-DD), userId. */
export async function listEvents(params: URLSearchParams) {
  const page = integerParam(params, "page", 1, 1, 100_000);
  const kind = params.get("kind");
  if (kind && !KINDS.includes(kind as EventKind)) throw new ApiError(422, "validation", "kind");
  const code = params.get("code");
  if (code && eventCode(code) !== code) throw new ApiError(422, "validation", "code");
  const email = params.get("email")?.trim().toLowerCase();
  if (email && email.length > 254) throw new ApiError(422, "validation", "email");
  const userId = params.get("userId");
  if (userId && !isUuid(userId)) throw new ApiError(422, "validation", "userId");
  const from = dateParam(params, "from", false);
  const to = dateParam(params, "to", true);

  if (Date.now() - lastPrune > HOUR) await pruneEvents();

  const where: Prisma.EventLogWhereInput = {
    ...(kind ? { kind: kind as EventKind } : {}),
    ...(code ? { code } : {}),
    ...(userId ? { userId } : {}),
    ...(email ? { user: { email: { contains: email } } } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
  };
  const rows = await db().eventLog.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: EVENT_PAGE_SIZE + 1,
    skip: (page - 1) * EVENT_PAGE_SIZE,
    select: {
      id: true, createdAt: true, kind: true, code: true, route: true, method: true, userId: true,
      user: { select: { email: true } }, actor: { select: { email: true } },
    },
  });
  return {
    page,
    hasMore: rows.length > EVENT_PAGE_SIZE,
    events: rows.slice(0, EVENT_PAGE_SIZE).map((row): EventDto => ({
      id: row.id, createdAt: row.createdAt.toISOString(), kind: row.kind, code: row.code,
      route: row.route, method: row.method, userId: row.userId,
      userEmail: row.user?.email ?? null, actorEmail: row.actor?.email ?? null,
    })),
  };
}
