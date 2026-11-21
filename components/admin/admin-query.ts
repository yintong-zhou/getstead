// URL state of the admin screens (pure, so it can be unit tested and shared by server and client).
// Every value read from the URL is sanitised here, before it can reach the server.

export type UserStatus = "all" | "active" | "disabled";
export type UsersQuery = { q: string; status: UserStatus; page: number };

export const EVENT_KINDS = ["all", "ERROR", "SECURITY"] as const;
export type EventKindFilter = (typeof EVENT_KINDS)[number];
export type LogsQuery = { kind: EventKindFilter; code: string; email: string; from: string; to: string; page: number };

type Raw = Record<string, string | string[] | undefined>;

const text = (raw: Raw, name: string) => (typeof raw[name] === "string" ? raw[name] : "");

function page(raw: Raw) {
  const value = text(raw, "page");
  return /^\d{1,6}$/.test(value) && Number(value) >= 1 && Number(value) <= 100_000 ? Number(value) : 1;
}

const day = (value: string) => (/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) ? value : "");

export function parseUsersQuery(raw: Raw): UsersQuery {
  const status = text(raw, "status");
  return {
    q: text(raw, "q").trim().toLowerCase().slice(0, 254),
    status: status === "active" || status === "disabled" ? status : "all",
    page: page(raw),
  };
}

export function parseLogsQuery(raw: Raw): LogsQuery {
  const kind = EVENT_KINDS.find((value) => value === text(raw, "kind")) ?? "all";
  const code = text(raw, "code").trim();
  return {
    kind,
    code: /^[A-Za-z0-9_.:-]{1,64}$/.test(code) ? code : "",
    email: text(raw, "email").trim().toLowerCase().slice(0, 254),
    from: day(text(raw, "from")),
    to: day(text(raw, "to")),
    page: page(raw),
  };
}

/** Server parameters (and link query) for a users state; defaults are omitted. */
export function usersParams(query: Partial<UsersQuery>) {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.status && query.status !== "all") params.set("status", query.status);
  if (query.page && query.page > 1) params.set("page", String(query.page));
  return params;
}

export function logsParams(query: Partial<LogsQuery>) {
  const params = new URLSearchParams();
  if (query.kind && query.kind !== "all") params.set("kind", query.kind);
  if (query.code) params.set("code", query.code);
  if (query.email) params.set("email", query.email);
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  if (query.page && query.page > 1) params.set("page", String(query.page));
  return params;
}

const withQuery = (path: string, params: URLSearchParams) => (params.size ? `${path}?${params}` : path);

/** Changing any filter must pass `page: 1` (or omit it) to reset paging. */
export const usersHref = (locale: string, query: Partial<UsersQuery>) => withQuery(`/${locale}/admin`, usersParams(query));
export const logsHref = (locale: string, query: Partial<LogsQuery>) => withQuery(`/${locale}/admin/logs`, logsParams(query));
