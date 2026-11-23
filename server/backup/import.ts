// Restores a backup (see tables.ts) into an account that has no data yet. The runtime role cannot
// delete history (db/grant-runtime.sql), so "replace" is impossible by design: empty accounts only.
//
// The whole file is validated before anything is written, every row gets a fresh id, encrypted
// text is sealed again under the new ids, and the insert runs in one transaction.

import { randomUUID } from "node:crypto";
import type { Prisma } from "../../db/generated/client.ts";
import { db } from "../auth/database.ts";
import { toDate } from "../cash-flow/dates.ts";
import { ApiError } from "../cash-flow/errors.ts";
import { encryptText } from "../cash-flow/text-crypto.ts";
import { Reader } from "../cash-flow/validate.ts";
import { audit, MAX_INSTRUMENTS, MAX_TRANSACTIONS } from "../investments/service.ts";
import { MAX_PROPERTIES, MAX_VALUATIONS } from "../property/service.ts";
import { BACKUP_FORMAT, BACKUP_VERSION, TABLES, type Field, type TableKey } from "./tables.ts";

type Row = Record<string, unknown>;
export type BackupRows = Record<TableKey, Row[]>;

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const CHUNK = 1_000;
const MAX_ARCHIVED_CHARGES = 2_000;

const isObject = (value: unknown): value is Row => typeof value === "object" && value !== null && !Array.isArray(value);
const invalid = (field: string, code = "validation"): never => { throw new ApiError(422, code, field); };

function readValue(reader: Reader, row: Row, name: string, field: Field): unknown {
  // Nullable fields accept null or an absent key; Reader's optional readers then return undefined.
  if ("nullable" in field && field.nullable && (row[name] === null || !(name in row))) return null;
  switch (field.kind) {
    case "id": case "ref": return reader.uuid(name);
    case "text": case "secret": return reader.text(name, field.max);
    case "enum": return reader.oneOf(name, field.values);
    case "date": return reader.date(name);
    case "int": {
      const value = reader.integer(name, field.min, field.max);
      return field.nonZero && value === 0 ? invalid(name) : value;
    }
    case "timestamp": {
      const raw = row[name];
      return typeof raw === "string" && TIMESTAMP.test(raw) && !Number.isNaN(Date.parse(raw)) ? raw : invalid(name);
    }
    case "decimal": {
      const raw = row[name];
      const shape = new RegExp(`^\\d{1,${field.digits}}(\\.\\d{1,${field.scale}})?$`);
      return typeof raw === "string" && shape.test(raw) && /[1-9]/.test(raw) ? raw : invalid(name);
    }
  }
}

function parseRow(row: unknown, fields: Record<string, Field>): Row {
  if (!isObject(row)) invalid("row");
  const known = new Set(Object.keys(fields));
  for (const key of Object.keys(row as Row)) if (!known.has(key)) invalid(key);
  const reader = new Reader(row as Row);
  return Object.fromEntries(Object.entries(fields).map(([name, field]) => [name, readValue(reader, row as Row, name, field)]));
}

/** Checks the file and returns its rows, still keyed by the file's ids. Pure: nothing is read or written. */
export function parseBackup(input: unknown): BackupRows {
  if (!isObject(input)) invalid("format");
  const file = input as Row;
  for (const key of Object.keys(file)) if (!["format", "version", "exportedAt", "data"].includes(key)) invalid(key);
  if (file.format !== BACKUP_FORMAT) invalid("format", "backup_format");
  if (file.version !== BACKUP_VERSION) invalid("version", "backup_version");
  if (!isObject(file.data)) invalid("data");
  const data = file.data as Row;
  for (const key of Object.keys(data)) if (!TABLES.some((table) => table.key === key)) invalid(`data.${key}`);

  const rows = {} as BackupRows;
  const ids = {} as Record<TableKey, Map<string, Row>>;
  for (const { key, fields } of TABLES) {
    const list = data[key] ?? [];
    if (!Array.isArray(list)) invalid(key);
    ids[key] = new Map();
    rows[key] = (list as unknown[]).map((raw, index) => {
      let row: Row;
      try {
        row = parseRow(raw, fields);
      } catch (error) {
        throw error instanceof ApiError ? new ApiError(422, error.code, `${key}[${index}].${error.field}`) : error;
      }
      for (const [name, field] of Object.entries(fields)) {
        if (field.kind === "ref" && !field.archived && row[name] !== null && !ids[field.table].has(row[name] as string)) {
          invalid(`${key}[${index}].${name}`, "backup_reference");
        }
      }
      if ("id" in fields) {
        if (ids[key].has(row.id as string)) invalid(`${key}[${index}].id`);
        ids[key].set(row.id as string, row);
      }
      return row;
    });
  }
  checkRules(rows, ids);
  return rows;
}

/** Rules the app enforces on every write but the database does not. */
function checkRules(rows: BackupRows, ids: Record<TableKey, Map<string, Row>>) {
  const accountType = (id: unknown) => ids.accounts.get(id as string)?.type;
  rows.accounts.forEach((account, index) => {
    if (account.customTypeId !== null && ids.customAccountTypes.get(account.customTypeId as string)?.baseType !== account.type) {
      invalid(`accounts[${index}].customTypeId`);
    }
  });

  const legs = new Map<string, Row[]>();
  rows.movements.forEach((movement, index) => {
    if ((movement.transferId === null) !== (movement.transferLeg === null)) invalid(`movements[${index}].transferLeg`);
    if (movement.transferId !== null) legs.set(movement.transferId as string, [...legs.get(movement.transferId as string) ?? [], movement]);
  });
  // A transfer left without legs (after unpairing) is harmless; one with legs needs exactly OUT + IN.
  rows.transfers.forEach((transfer, index) => {
    const pair = legs.get(transfer.id as string);
    if (!pair) return;
    const out = pair.find((leg) => leg.transferLeg === "OUT"), into = pair.find((leg) => leg.transferLeg === "IN");
    if (pair.length !== 2 || !out || !into || (out.amountCents as number) >= 0 || (out.amountCents as number) + (into.amountCents as number) !== 0
      || out.accountId === into.accountId) invalid(`transfers[${index}]`, "backup_transfer");
  });

  rows.investmentTransactions.forEach((transaction, index) => {
    if (!["BROKERAGE", "CRYPTO"].includes(accountType(transaction.accountId) as string)) invalid(`investmentTransactions[${index}].accountId`);
  });
  rows.properties.forEach((property, index) => {
    if (property.mortgageAccountId !== null && accountType(property.mortgageAccountId) !== "DEBT") invalid(`properties[${index}].mortgageAccountId`);
  });
  rows.condoCharges.forEach((charge, index) => {
    const table = ids.condoTables.get(charge.tableId as string);
    if (table && table.propertyId !== charge.propertyId) invalid(`condoCharges[${index}].tableId`);
  });

  const caps: [TableKey, number, string][] = [
    ["instruments", MAX_INSTRUMENTS, "instrument_limit"], ["investmentTransactions", MAX_TRANSACTIONS, "transaction_limit"],
    ["properties", MAX_PROPERTIES, "property_limit"], ["propertyValuations", MAX_VALUATIONS, "valuation_limit"],
    ["condoCharges", MAX_ARCHIVED_CHARGES, "charge_limit"],
  ];
  for (const [key, cap, code] of caps) if (rows[key].length > cap) invalid(key, code);
}

/** File rows to Prisma rows owned by `userId`, under fresh ids handed out in file order. */
function toRecords(userId: string, rows: BackupRows) {
  const newIds = {} as Record<TableKey, Map<string, string>>;
  for (const { key } of TABLES) {
    // Sorted fresh ids keep the file's order, so a re-export lists rows the same way.
    const fresh = rows[key].map(() => randomUUID()).sort();
    newIds[key] = new Map(rows[key].map((row, index) => [row.id as string, fresh[index]]));
  }
  return TABLES.map(({ key, model, fields }) => ({ key, model, records: rows[key].map((row) => {
    const rowId = newIds[key].get(row.id as string)!;
    const record: Row = { userId };
    for (const [name, field] of Object.entries(fields)) {
      const value = row[name];
      if (value === null) record[name] = null;
      else if (field.kind === "id") record[name] = rowId;
      else if (field.kind === "ref") {
        const mapped = newIds[field.table].get(value as string);
        record[name] = field.archived ? mapped ?? value : mapped;
      }
      else if (field.kind === "secret") record[name] = encryptText(userId, field.context(rowId), value as string);
      else if (field.kind === "date") record[name] = toDate(value as string);
      else if (field.kind === "timestamp") record[name] = new Date(value as string);
      else if (field.kind === "int" && field.big) record[name] = BigInt(value as number);
      else record[name] = value;
    }
    return record;
  }) }));
}

type Delegate = { count(args: object): Promise<number>; createMany(args: { data: Row[] }): Promise<unknown> };

export async function importBackup(userId: string, input: unknown) {
  const tables = toRecords(userId, parseBackup(input));
  try {
    await db().$transaction(async (tx) => {
      // The same per-user locks the investment (3) and property (4) writers take.
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${userId}, 3))`;
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${userId}, 4))`;
      const client = tx as unknown as Record<string, Delegate>;
      for (const { model } of tables) {
        if (await client[model].count({ where: { userId } }) > 0) throw new ApiError(409, "backup_not_empty");
      }
      for (const { model, records } of tables) {
        for (let start = 0; start < records.length; start += CHUNK) {
          await client[model].createMany({ data: records.slice(start, start + CHUNK) });
        }
      }
      const instruments = tables.find(({ key }) => key === "instruments")!.records.map((row) => row.id as string);
      await audit(tx as Prisma.TransactionClient, userId, instruments);
    }, { timeout: 60_000 });
  } catch (error) {
    // A row the database refuses (unique, foreign key or check constraint) is a bad file, not a server fault.
    // Check violations arrive as P2039 with the Postgres SQLSTATE in the adapter cause (class 23 = integrity).
    const failure = error as { code?: unknown; meta?: { driverAdapterError?: { cause?: { code?: unknown } } } } | null;
    const sqlState = failure?.meta?.driverAdapterError?.cause?.code;
    if (!(error instanceof ApiError) && (failure?.code === "P2002" || failure?.code === "P2003" || (typeof sqlState === "string" && sqlState.startsWith("23")))) {
      throw new ApiError(422, "backup_invalid");
    }
    throw error;
  }
  return Object.fromEntries(tables.map(({ key, records }) => [key, records.length])) as Record<TableKey, number>;
}
