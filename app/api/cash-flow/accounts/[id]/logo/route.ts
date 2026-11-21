import { NextResponse } from "next/server";
import { findAccountLogo, readAccountLogo, removeAccountLogo, uploadAccountLogo } from "@/server/cash-flow/account-logo-service";
import { api } from "@/server/cash-flow/http";
import { paramId } from "@/server/cash-flow/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { id: string };

export const GET = api<Params>(async ({ userId, params }) => new NextResponse(
  new Uint8Array(await readAccountLogo(userId, paramId(params.id))),
  { headers: {
    "Content-Type": "image/webp",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'",
    "Cross-Origin-Resource-Policy": "same-origin",
  } },
));

export const POST = api<Params>(async ({ userId, params, body }) =>
  findAccountLogo(userId, paramId(params.id), await body()));

export const PUT = api<Params>(async ({ userId, params, request }) =>
  uploadAccountLogo(userId, paramId(params.id), request));

export const DELETE = api<Params>(async ({ userId, params }) =>
  removeAccountLogo(userId, paramId(params.id)));
