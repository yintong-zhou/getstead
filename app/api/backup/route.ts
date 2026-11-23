import { NextResponse } from "next/server";
import { recordEvent } from "@/server/admin/logs";
import { readAuthBody } from "@/server/auth/http";
import { exportBackup } from "@/server/backup/export";
import { importBackup } from "@/server/backup/import";
import { romeToday } from "@/server/cash-flow/dates";
import { ApiError } from "@/server/cash-flow/errors";
import { api } from "@/server/cash-flow/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ponytail: 4 MB cap from Vercel's 4.5 MB request body limit; move to client-side gzip or a blob upload if real backups outgrow it.
const MAX_BACKUP_BYTES = 4_000_000;
const event = { kind: "SECURITY", route: "/api/backup" } as const;

export const GET = api(async ({ userId }) => {
  const backup = await exportBackup(userId);
  await recordEvent({ ...event, code: "backup_exported", method: "GET", userId });
  return new NextResponse(JSON.stringify(backup), { headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Disposition": `attachment; filename="getstead-backup-${romeToday()}.json"`,
    "X-Content-Type-Options": "nosniff",
  } });
});

export const POST = api(async ({ userId, request }) => {
  if (Number(request.headers.get("content-length")) > MAX_BACKUP_BYTES) throw new ApiError(413, "backup_too_large");
  const body = await readAuthBody(request, MAX_BACKUP_BYTES);
  if (!body) throw new ApiError(400, "bad_body");
  const counts = await importBackup(userId, body);
  await recordEvent({ ...event, code: "backup_imported", method: "POST", userId });
  return counts;
});
