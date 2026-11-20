// Request validation for the JSON API. Every field is read through a Reader, which rejects
// anything it was not asked about, so a misspelled or smuggled field cannot be silently ignored.

import { ApiError } from "./errors.ts";
import { MAX_CENTS } from "./money.ts";
import { parseIsoDate, parseMonth, type IsoDate, type Month } from "./dates.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTROL = /[\u0000-\u001f\u007f]/;

export { MAX_CENTS };

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

export class Reader {
  private readonly seen = new Set<string>();
  private readonly body: Record<string, unknown>;

  constructor(body: Record<string, unknown>) {
    this.body = body;
  }

  has(key: string) {
    return Object.hasOwn(this.body, key);
  }

  private take(key: string) {
    this.seen.add(key);
    return this.has(key) ? this.body[key] : undefined;
  }

  private invalid(key: string): never {
    throw new ApiError(422, "validation", key);
  }

  text(key: string, max: number): string {
    const value = this.optionalText(key, max);
    if (value === undefined) this.invalid(key);
    return value;
  }

  nullableText(key: string, max: number): string | null | undefined {
    if (this.has(key) && this.body[key] === null) {
      this.seen.add(key);
      return null;
    }
    return this.optionalText(key, max);
  }

  /** Explicit bounds for domains whose integer limits differ from cash flow. */
  integer(key: string, min: number, max: number): number {
    const raw = this.take(key);
    if (!Number.isSafeInteger(raw) || (raw as number) < min || (raw as number) > max) this.invalid(key);
    return raw as number;
  }

  optionalText(key: string, max: number): string | undefined {
    const raw = this.take(key);
    if (raw === undefined) return undefined;
    const value = typeof raw === "string" ? raw.normalize("NFC").trim() : "";
    if (!value || [...value].length > max || CONTROL.test(value)) this.invalid(key);
    return value;
  }

  uuid(key: string): string {
    const value = this.optionalUuid(key);
    if (!value) this.invalid(key);
    return value;
  }

  optionalUuid(key: string): string | undefined {
    const raw = this.take(key);
    if (raw === undefined) return undefined;
    if (!isUuid(raw)) this.invalid(key);
    return raw.toLowerCase();
  }

  /** undefined when absent, null when explicitly null, otherwise a UUID. */
  nullableUuid(key: string): string | null | undefined {
    if (this.has(key) && this.body[key] === null) {
      this.seen.add(key);
      return null;
    }
    return this.optionalUuid(key);
  }

  oneOf<T extends string>(key: string, values: readonly T[]): T {
    const value = this.optionalOneOf(key, values);
    if (value === undefined) this.invalid(key);
    return value;
  }

  optionalOneOf<T extends string>(key: string, values: readonly T[]): T | undefined {
    const raw = this.take(key);
    if (raw === undefined) return undefined;
    if (typeof raw !== "string" || !values.includes(raw as T)) this.invalid(key);
    return raw as T;
  }

  /** Integer cents. `positive` rejects zero and negatives; otherwise any non-zero amount. */
  cents(key: string, positive = false): number {
    const value = this.optionalCents(key, positive);
    if (value === undefined) this.invalid(key);
    return value;
  }

  optionalCents(key: string, positive = false): number | undefined {
    const raw = this.take(key);
    if (raw === undefined) return undefined;
    if (!Number.isSafeInteger(raw) || raw === 0 || Math.abs(raw as number) > MAX_CENTS || (positive && (raw as number) < 0)) {
      this.invalid(key);
    }
    return raw as number;
  }

  /** Signed integer cents, including zero for balance checks. */
  signedCents(key: string): number {
    const raw = this.take(key);
    if (!Number.isSafeInteger(raw) || Math.abs(raw as number) > MAX_CENTS) this.invalid(key);
    return raw as number;
  }

  /** A limit may be zero. */
  limit(key: string): number {
    const raw = this.take(key);
    if (!Number.isSafeInteger(raw) || (raw as number) < 0 || (raw as number) > MAX_CENTS) this.invalid(key);
    return raw as number;
  }

  /** undefined when absent, null when explicitly null, otherwise a limit. */
  nullableLimit(key: string): number | null | undefined {
    if (!this.has(key)) return undefined;
    if (this.body[key] === null) {
      this.seen.add(key);
      return null;
    }
    return this.limit(key);
  }

  date(key: string): IsoDate {
    const value = this.optionalDate(key);
    if (!value) this.invalid(key);
    return value;
  }

  optionalDate(key: string): IsoDate | undefined {
    const raw = this.take(key);
    if (raw === undefined) return undefined;
    const value = parseIsoDate(raw);
    if (!value || value < "2000-01-01" || value > "2100-12-31") this.invalid(key);
    return value;
  }

  nullableDate(key: string): IsoDate | null | undefined {
    if (this.has(key) && this.body[key] === null) {
      this.seen.add(key);
      return null;
    }
    return this.optionalDate(key);
  }

  month(key: string): Month {
    const raw = this.take(key);
    const value = parseMonth(raw);
    if (!value) this.invalid(key);
    return value;
  }

  optionalBool(key: string): boolean | undefined {
    const raw = this.take(key);
    if (raw === undefined) return undefined;
    if (typeof raw !== "boolean") this.invalid(key);
    return raw;
  }

  /** An array of exactly `size` UUIDs. */
  uuids(key: string, size: number): string[] {
    const raw = this.take(key);
    if (!Array.isArray(raw) || raw.length !== size || !raw.every(isUuid)) this.invalid(key);
    return raw.map((value: string) => value.toLowerCase());
  }

  /** Call last: rejects any field that was not read. */
  done() {
    for (const key of Object.keys(this.body)) {
      if (!this.seen.has(key)) throw new ApiError(422, "validation", key);
    }
  }
}

/** Query-string values come from the URL, so they get the same strictness. */
export function queryUuid(value: string | null, field: string) {
  if (value === null) return undefined;
  if (!isUuid(value)) throw new ApiError(422, "validation", field);
  return value.toLowerCase();
}

/** A path parameter that is not a UUID cannot name any row. */
export function paramId(value: string) {
  if (!isUuid(value)) throw new ApiError(404, "not_found");
  return value.toLowerCase();
}
