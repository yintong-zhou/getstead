function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error("Missing authentication configuration.");
  return value;
}

export function databaseUrl() {
  return required("DATABASE_URL");
}

export function localPostgresUrl(value: string | undefined) {
  const url = URL.parse(value ?? "");
  if (
    !url ||
    !["postgresql:", "postgres:"].includes(url.protocol) ||
    !["127.0.0.1", "[::1]", "localhost"].includes(url.hostname) ||
    url.searchParams.has("host")
  ) {
    throw new Error("This command requires a local PostgreSQL connection.");
  }
  return url;
}

export function appOrigin() {
  const raw = required("APP_ORIGIN");
  const url = new URL(raw);
  const loopback = ["127.0.0.1", "[::1]", "localhost"].includes(url.hostname);
  const allowed = url.protocol === "https:" || (url.protocol === "http:" && loopback);
  if (url.origin !== raw || !allowed) throw new Error("Invalid application origin.");
  return url;
}

export function encryptionKey() {
  const encoded = required("AUTH_ENCRYPTION_KEY");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32 || key.toString("base64") !== encoded) {
    throw new Error("Invalid authentication encryption key.");
  }
  return key;
}
