import { parseMonth } from "../cash-flow/dates.ts";
import { isUuid } from "../cash-flow/validate.ts";
import { transactionTypes } from "./calc.ts";

export const TRANSACTIONS_HISTORY = "/investments/history";

export type TransactionQuery = {
  type?: (typeof transactionTypes)[number];
  accountId?: string;
  instrumentId?: string;
  month?: string;
  page: number;
};

export function parseTransactionQuery(raw: Record<string, unknown>): TransactionQuery {
  const type = transactionTypes.find((value) => value === raw.type);
  const accountId = isUuid(raw.accountId) ? raw.accountId.toLowerCase() : undefined;
  const instrumentId = isUuid(raw.instrumentId) ? raw.instrumentId.toLowerCase() : undefined;
  const month = parseMonth(raw.month) ?? undefined;
  const page = typeof raw.page === "string" && /^[1-9]\d{0,3}$/.test(raw.page) ? Number(raw.page) : 1;
  return { type, accountId, instrumentId, month, page };
}

export function transactionHistoryHref(locale: string, query?: TransactionQuery) {
  const params = new URLSearchParams();
  if (query?.type) params.set("type", query.type);
  if (query?.accountId) params.set("accountId", query.accountId);
  if (query?.instrumentId) params.set("instrumentId", query.instrumentId);
  if (query?.month) params.set("month", query.month);
  if (query && query.page > 1) params.set("page", String(query.page));
  const search = params.toString();
  return `/${locale}${TRANSACTIONS_HISTORY}${search ? `?${search}` : ""}`;
}
