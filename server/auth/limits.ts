import { encryptionKey } from "./config.ts";
import { digestRateLimitSubject } from "./crypto.ts";
import { inTransaction } from "./database.ts";

export function reserveAttempt(phase: "password" | "mfa", value: string) {
  const subject = digestRateLimitSubject(encryptionKey(), value);
  return inTransaction(async (connection) => {
    await connection.execute(`
      BEGIN
        INSERT INTO stead_auth_limits (phase, subject_digest, attempts, window_until)
        VALUES (:phase, :subject, 0, SYSTIMESTAMP + INTERVAL '15' MINUTE);
      EXCEPTION
        WHEN DUP_VAL_ON_INDEX THEN NULL;
      END;`, { phase, subject });

    const result = await connection.execute(`
      UPDATE stead_auth_limits
      SET attempts = CASE WHEN window_until <= SYSTIMESTAMP THEN 1 ELSE attempts + 1 END,
          window_until = CASE WHEN window_until <= SYSTIMESTAMP
            THEN SYSTIMESTAMP + INTERVAL '15' MINUTE ELSE window_until END
      WHERE phase = :phase AND subject_digest = :subject
        AND (attempts < 5 OR window_until <= SYSTIMESTAMP)`, { phase, subject });
    return result.rowsAffected === 1;
  });
}
