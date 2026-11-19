/** A failure the caller can act on. The code is stable; no message or value ever leaves the server. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly field?: string;

  constructor(status: number, code: string, field?: string) {
    super(code);
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

export const notFound = () => new ApiError(404, "not_found");
export const conflict = (code = "conflict") => new ApiError(409, code);
