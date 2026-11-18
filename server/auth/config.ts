function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error("Missing authentication configuration.");
  return value;
}

export function oracleConfig() {
  return {
    user: required("ORACLE_USER"),
    password: required("ORACLE_PASSWORD"),
    connectString: required("ORACLE_CONNECT_STRING"),
  };
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
