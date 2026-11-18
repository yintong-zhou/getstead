export function normalizeEmail(value: unknown) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(email)
    ? email
    : null;
}

export function validPasswordInput(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && Buffer.byteLength(value) <= 512;
}

export function validTotpCode(value: unknown): value is string {
  return typeof value === "string" && /^[0-9]{6}$/.test(value);
}
