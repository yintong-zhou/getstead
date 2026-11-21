import type { CashFlowCopy } from "./copy";

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string; field?: string };

/** Never throws: a dropped connection is reported as `network`. */
export async function call<T = unknown>(method: string, path: string, body?: unknown, base = "/api/cash-flow"): Promise<ApiResult<T>> {
  try {
    const file = body instanceof Blob ? body : undefined;
    const response = await fetch(`${base}${path}`, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": file ? file.type || "application/octet-stream" : "application/json" },
      body: file ?? (body === undefined ? undefined : JSON.stringify(body)),
      cache: "no-store",
    });
    if (response.ok) {
      return { ok: true, data: (response.status === 204 ? undefined : await response.json()) as T };
    }
    const failure = (await response.json().catch(() => ({}))) as { error?: string; field?: string };
    return { ok: false, status: response.status, error: failure.error ?? "generic", field: failure.field };
  } catch {
    return { ok: false, status: 0, error: "network" };
  }
}

/** A readable message for a failed call, naming the field when the server pointed at one. */
export function errorText(copy: CashFlowCopy, result: Extract<ApiResult<unknown>, { ok: false }>) {
  const message = copy.errors[result.error] ?? copy.errors.generic;
  const field = result.field ? copy.fields[result.field] : undefined;
  return field && result.error === "validation" ? `${message} (${field})` : message;
}
