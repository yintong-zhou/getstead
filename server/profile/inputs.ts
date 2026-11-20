import { ApiError } from "../cash-flow/errors.ts";

// Rejects control characters plus invisible or direction-overriding format characters; ZWJ/ZWNJ stay (emoji, Persian).
export function normalizeDisplayName(input: unknown): string | null {
  if (typeof input !== "string" || /[\p{Cc}\u200B\u2060\uFEFF\u202A-\u202E\u2066-\u2069]/u.test(input)) {
    throw new ApiError(422, "validation", "displayName");
  }
  const name = input.trim().normalize("NFC");
  if ([...name].length > 60) throw new ApiError(422, "validation", "displayName");
  return name || null;
}
