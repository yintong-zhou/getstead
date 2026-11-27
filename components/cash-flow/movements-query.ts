// URL state of the Movements screens (pure, so it can be unit tested and shared by server and client).
// Every value read from the URL is sanitised here, before it can reach the server registry.

import { monthOf, parseMonth } from "../../server/cash-flow/dates.ts";
import { isUuid } from "../../server/cash-flow/validate.ts";

export const HISTORY_TYPES = ["all", "in", "out", "transfers"] as const;
export type HistoryType = (typeof HISTORY_TYPES)[number];

export type HistoryQuery = {
  type: HistoryType;
  /** "YYYY-MM", or "all" for every period. */
  month: string;
  accountId?: string;
  categoryId?: string;
  page: number;
  pageSize: 10 | 20 | 30;
};

type Raw = Partial<Record<"type" | "month" | "accountId" | "categoryId" | "page" | "pageSize", string>>;

/** Preview length on the cash-flow page: 3 rows, or 5 with `show=5`. */
export const previewSize = (raw?: string): 3 | 5 => (raw === "5" ? 5 : 3);

export function parseHistoryQuery(raw: Raw, today: string): HistoryQuery {
  const type = HISTORY_TYPES.find((value) => value === raw.type) ?? "all";
  const month = raw.month === "all" ? "all" : parseMonth(raw.month) ?? monthOf(today);
  const accountId = isUuid(raw.accountId) ? raw.accountId.toLowerCase() : undefined;
  const categoryId = raw.categoryId === "none" ? "none" : isUuid(raw.categoryId) ? raw.categoryId.toLowerCase() : undefined;
  const page = /^\d{1,6}$/.test(raw.page ?? "") && Number(raw.page) >= 1 && Number(raw.page) <= 100_000 ? Number(raw.page) : 1;
  const pageSize = raw.pageSize === "20" ? 20 : raw.pageSize === "30" ? 30 : 10;
  return { type, month, accountId, categoryId, page, pageSize };
}

/** Parameters for the existing register (`listMovementsPage`). "All periods" simply omits the month. */
export function registerParams(query: HistoryQuery) {
  const params = new URLSearchParams();
  if (query.month !== "all") params.set("month", query.month);
  if (query.accountId) params.set("accountId", query.accountId);
  if (query.categoryId) params.set("categoryId", query.categoryId);
  if (query.type !== "all") params.set("direction", query.type);
  params.set("page", String(query.page));
  params.set("pageSize", String(query.pageSize));
  return params;
}

/** Link to a history state. Changing any filter must pass `page: 1` (the default) to reset paging. */
export function historyHref(locale: string, query: Partial<HistoryQuery> & Pick<HistoryQuery, "month">) {
  const params = new URLSearchParams({ month: query.month });
  if (query.type && query.type !== "all") params.set("type", query.type);
  if (query.accountId) params.set("accountId", query.accountId);
  if (query.categoryId) params.set("categoryId", query.categoryId);
  if (query.page && query.page > 1) params.set("page", String(query.page));
  if (query.pageSize && query.pageSize !== 10) params.set("pageSize", String(query.pageSize));
  return `/${locale}/cash-flow/history?${params}`;
}
