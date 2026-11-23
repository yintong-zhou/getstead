// The backup file format, one descriptor per user table. Export and import both walk this list, so a
// table or column is described exactly once. Order matters: a table only references tables above it,
// which is also the order rows are inserted on import.

import {
  AccountType, BudgetLimitKind, CategoryKind, CondoChargeKind, InstrumentKind, InvestmentTransactionType,
  OccurrenceStatus, PropertyKind, RecurrenceFrequency, TransferLeg,
} from "../../db/generated/enums.ts";
import { MAX_CENTS } from "../cash-flow/money.ts";
import { chargeContext, movementContext, templateContext } from "../cash-flow/text-crypto.ts";

export const BACKUP_FORMAT = "getstead-backup";
export const BACKUP_VERSION = 1;

type Nullable = { nullable?: boolean };
export type Field =
  | { kind: "id" }
  | ({ kind: "ref"; table: TableKey; archived?: true } & Nullable)
  | ({ kind: "text"; max: number } & Nullable)
  /** Stored encrypted with a context bound to the row id; exported in clear. */
  | { kind: "secret"; max: number; context: (id: string) => string }
  | ({ kind: "enum"; values: readonly string[] } & Nullable)
  | ({ kind: "date" } & Nullable)
  | ({ kind: "timestamp" } & Nullable)
  /** `big` columns are BigInt in Prisma; every bound here is below 2^53, so JSON numbers are exact. */
  | ({ kind: "int"; min: number; max: number; nonZero?: boolean; big?: boolean } & Nullable)
  /** Exported as a plain decimal string so no precision is lost. */
  | ({ kind: "decimal"; digits: number; scale: number } & Nullable);

export type Table = { key: TableKey; model: string; fields: Record<string, Field> };

const values = (enumeration: Record<string, string>) => Object.values(enumeration);
const id = { kind: "id" } as const;
const ref = (table: TableKey, nullable = false): Field => ({ kind: "ref", table, nullable });
const text = (max: number, nullable = false): Field => ({ kind: "text", max, nullable });
const oneOf = (enumeration: Record<string, string>, nullable = false): Field => ({ kind: "enum", values: values(enumeration), nullable });
const date: Field = { kind: "date" };
const nullableDate: Field = { kind: "date", nullable: true };
const timestamp: Field = { kind: "timestamp" };
const nullableTimestamp: Field = { kind: "timestamp", nullable: true };
const int = (min: number, max: number, extra: { nonZero?: boolean; big?: boolean; nullable?: boolean } = {}): Field => ({ kind: "int", min, max, ...extra });
const MAX_INT = 2_147_483_647;

const tableKeys = [
  "customAccountTypes", "categories", "transfers", "instruments", "accounts", "balanceChecks", "categoryRules",
  "budgetLimits", "properties", "recurringTemplates", "movements", "investmentTransactions", "priceQuotes",
  "marketPriceQuotes", "propertyValuations", "condoTables", "condoSchedules", "recurringOccurrences", "condoCharges",
] as const;
export type TableKey = (typeof tableKeys)[number];

// Bounds mirror the CHECK constraints in db/migrations, so a bad file fails validation, not an INSERT.
const fields: Record<TableKey, [model: string, Record<string, Field>]> = {
  customAccountTypes: ["customAccountType", { id, name: text(80), baseType: oneOf(AccountType), archivedAt: nullableTimestamp, createdAt: timestamp }],
  categories: ["category", { id, name: text(80), kind: oneOf(CategoryKind), archivedAt: nullableTimestamp, createdAt: timestamp }],
  transfers: ["transfer", { id, createdAt: timestamp }],
  instruments: ["instrument", {
    id, name: text(120), symbol: text(24, true), isin: text(12, true), kind: oneOf(InstrumentKind),
    marketSymbol: text(200, true), marketName: text(200, true), marketCurrency: text(10, true), archivedAt: nullableTimestamp,
  }],
  accounts: ["account", {
    id, name: text(80), type: oneOf(AccountType), customTypeId: ref("customAccountTypes", true),
    archivedAt: nullableTimestamp, createdAt: timestamp,
  }],
  balanceChecks: ["balanceCheck", { id, accountId: ref("accounts"), asOf: date, balanceCents: int(-MAX_CENTS, MAX_CENTS), createdAt: timestamp }],
  categoryRules: ["categoryRule", { id, phrase: text(60), categoryId: ref("categories"), createdAt: timestamp }],
  budgetLimits: ["budgetLimit", {
    id, categoryId: ref("categories"), month: date, kind: oneOf(BudgetLimitKind), limitCents: int(0, MAX_CENTS, { nullable: true }),
  }],
  properties: ["property", {
    id, name: text(80), kind: oneOf(PropertyKind), ownershipBps: int(1, 10_000), mortgageAccountId: ref("accounts", true),
    soldOn: nullableDate, archivedAt: nullableTimestamp,
  }],
  recurringTemplates: ["recurringTemplate", {
    id, accountId: ref("accounts"), categoryId: ref("categories", true),
    description: { kind: "secret", max: 200, context: templateContext }, amountCents: int(1, MAX_CENTS),
    frequency: oneOf(RecurrenceFrequency), startDate: date, endDate: nullableDate, archivedAt: nullableTimestamp, createdAt: timestamp,
    deletedAt: nullableTimestamp,
  }],
  movements: ["movement", {
    id, accountId: ref("accounts"), categoryId: ref("categories", true), bookingDate: date,
    description: { kind: "secret", max: 200, context: movementContext }, amountCents: int(-MAX_CENTS, MAX_CENTS, { nonZero: true }),
    voidedAt: nullableTimestamp, transferId: ref("transfers", true), transferLeg: oneOf(TransferLeg, true), createdAt: timestamp,
  }],
  investmentTransactions: ["investmentTransaction", {
    id, accountId: ref("accounts"), instrumentId: ref("instruments"), type: oneOf(InvestmentTransactionType), tradeDate: date,
    ordinal: int(1, MAX_INT), quantity: { kind: "decimal", digits: 18, scale: 10, nullable: true },
    amountCents: int(1, 100_000_000_000, { big: true }), feesCents: int(0, 100_000_000_000, { big: true }),
    taxWithheldCents: int(0, 100_000_000_000, { big: true }), voidedAt: nullableTimestamp,
  }],
  priceQuotes: ["priceQuote", { id, instrumentId: ref("instruments"), asOf: date, unitPrice: { kind: "decimal", digits: 10, scale: 8 } }],
  // No id: the primary key is (user, instrument, date).
  marketPriceQuotes: ["marketPriceQuote", {
    instrumentId: ref("instruments"), asOf: date, unitPrice: { kind: "decimal", digits: 10, scale: 8 }, currency: text(10),
    fxRate: { kind: "decimal", digits: 16, scale: 12, nullable: true }, fxAsOf: nullableDate,
  }],
  propertyValuations: ["propertyValuation", { id, propertyId: ref("properties"), asOf: date, valueCents: int(1, 1_000_000_000_000, { big: true }) }],
  condoTables: ["condoTable", { id, propertyId: ref("properties"), label: text(60), unitMillesimi: int(1, 100_000), totalMillesimi: int(1, 100_000) }],
  condoSchedules: ["condoSchedule", { id, propertyId: ref("properties"), templateId: ref("recurringTemplates") }],
  recurringOccurrences: ["recurringOccurrence", {
    id, templateId: ref("recurringTemplates"), dueDate: date, status: oneOf(OccurrenceStatus), movementId: ref("movements", true), createdAt: timestamp,
  }],
  condoCharges: ["condoCharge", {
    id, propertyId: ref("properties"), kind: oneOf(CondoChargeKind), title: { kind: "secret", max: 120, context: chargeContext },
    dueDate: date, amountCents: int(1, MAX_CENTS), approvedOn: nullableDate,
    tableId: { kind: "ref", table: "condoTables", nullable: true, archived: true },
    buildingTotalCents: int(1, 100_000_000_000, { big: true, nullable: true }), voidedAt: nullableTimestamp, movementId: ref("movements", true),
  }],
};

export const TABLES: Table[] = tableKeys.map((key) => ({ key, model: fields[key][0], fields: fields[key][1] }));
