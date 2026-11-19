import { encryptionKey } from "./config.ts";
import { digestRateLimitSubject } from "./crypto.ts";
import { db } from "./database.ts";

export async function reserveAttempt(phase: "password" | "mfa", value: string) {
  const subject = digestRateLimitSubject(encryptionKey(), value);
  const reserved = await db().$executeRaw`
    INSERT INTO stead_auth_limits AS limits (phase, subject_digest, attempts, window_until)
    VALUES (${phase}, ${subject}, 1, statement_timestamp() + interval '15 minutes')
    ON CONFLICT (phase, subject_digest) DO UPDATE
    SET attempts = CASE WHEN limits.window_until <= statement_timestamp() THEN 1 ELSE limits.attempts + 1 END,
        window_until = CASE WHEN limits.window_until <= statement_timestamp()
          THEN EXCLUDED.window_until ELSE limits.window_until END
    WHERE limits.attempts < 5 OR limits.window_until <= statement_timestamp()
  `;
  return reserved === 1;
}
