// Full export of one user's data as a versioned JSON document (see tables.ts for the format).
// Encrypted text is decrypted: the file must restore under new row ids and on another key.

import type { Prisma } from "../../db/generated/client.ts";
import { db } from "../auth/database.ts";
import { fromDate } from "../cash-flow/dates.ts";
import { decryptText } from "../cash-flow/text-crypto.ts";
import { BACKUP_FORMAT, BACKUP_VERSION, TABLES, type Field } from "./tables.ts";

type Row = Record<string, unknown>;
type Delegate = { findMany(args: object): Prisma.PrismaPromise<Row[]> };

function exportValue(field: Field, value: unknown, userId: string, rowId: string) {
  if (value === null) return null;
  switch (field.kind) {
    case "secret": return decryptText(userId, field.context(rowId), value as Uint8Array);
    case "date": return fromDate(value as Date);
    case "timestamp": return (value as Date).toISOString();
    case "int": return Number(value);
    case "decimal": return (value as Prisma.Decimal).toFixed();
    default: return value;
  }
}

export async function exportBackup(userId: string, now = new Date()) {
  const client = db() as unknown as Record<string, Delegate>;
  // Rows are ordered by id; import hands out new ids in the same order, so a re-export lines up.
  const reads = TABLES.map(({ model, fields }) => client[model].findMany({
    where: { userId },
    orderBy: "id" in fields ? { id: "asc" } : [{ instrumentId: "asc" }, { asOf: "asc" }],
  }));
  const results = await db().$transaction(reads, { isolationLevel: "RepeatableRead" });

  const data: Record<string, Row[]> = {};
  TABLES.forEach(({ key, fields }, index) => {
    data[key] = results[index].map((row) => Object.fromEntries(Object.entries(fields).map(([name, field]) =>
      [name, exportValue(field, row[name], userId, row.id as string)])));
  });
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now.toISOString(), data };
}
