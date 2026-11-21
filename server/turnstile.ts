// Cloudflare Turnstile check for public forms (waitlist, login). A token is single-use, so every
// attempt needs a fresh one. Tokens, secrets and addresses are never logged.

import { appOrigin } from "./auth/config.ts";

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * True only when Cloudflare confirms the token for this action and this site's hostname.
 * Returns false for a rejected or missing token; throws when Cloudflare cannot be reached, so
 * the caller answers 503 instead of blaming the visitor.
 * Without TURNSTILE_SECRET the check is skipped outside production and fails closed in production.
 */
export async function verifyTurnstile(token: unknown, action: string, remoteip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  // Cloudflare tokens stay under 2048 characters.
  if (typeof token !== "string" || token === "" || token.length > 2048) return false;

  const response = await fetch(SITEVERIFY, {
    method: "POST",
    body: new URLSearchParams({ secret, response: token, remoteip }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("Turnstile unavailable.");
  const result = (await response.json()) as { success?: boolean; action?: string; hostname?: string };
  return result.success === true && result.action === action && result.hostname === appOrigin().hostname;
}
