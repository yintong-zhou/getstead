// Public waitlist. Email addresses never reach a log, and the same answer comes back whether the
// address is new or already on the list, so the endpoint cannot be used to check who signed up.

import { normalizeEmail } from "../auth/inputs.ts";
import { db } from "../auth/database.ts";
import { isLocale, type Locale } from "../locale.ts";

export type WaitlistRequest =
  | { status: "ok"; email: string; locale: Locale; turnstile: unknown }
  | { status: "bot" }
  | { status: "invalid" };

/** Reads the sign-up form body: a valid email, explicit consent, a known language, an empty honeypot. */
export function parseWaitlist(body: Record<string, unknown> | null): WaitlistRequest {
  if (!body) return { status: "invalid" };
  // The "website" field is hidden from people: anything typed into it came from a script.
  if (typeof body.website === "string" && body.website !== "") return { status: "bot" };
  const email = normalizeEmail(body.email);
  const locale = body.locale;
  if (!email || body.consent !== true || typeof locale !== "string" || !isLocale(locale)) return { status: "invalid" };
  return { status: "ok", email, locale, turnstile: body.turnstile };
}

/** Adds the email once. A second sign-up with the same address changes nothing. */
export async function joinWaitlist(email: string, locale: Locale) {
  await db().waitlistEntry.createMany({ data: [{ email, locale }], skipDuplicates: true });
}

/** The client address as the host reports it. On Vercel `x-forwarded-for` is set by the platform. */
export function clientAddress(headers: Headers) {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown-client";
}
