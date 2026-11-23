import { api } from "@/server/cash-flow/http";
import { ApiError } from "@/server/cash-flow/errors";

export const runtime = "nodejs";
const gone = api<{ id: string }>(async () => { throw new ApiError(410, "gone"); });
export const PATCH = gone;
