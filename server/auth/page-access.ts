import { cookies } from "next/headers";
import { challengeCookie, sessionCookie } from "./http.ts";
import { readChallenge, readSession } from "./service.ts";

export async function readPageSession() {
  try {
    const token = (await cookies()).get(sessionCookie)?.value;
    return await readSession(token) ? "authenticated" : "anonymous";
  } catch {
    return "unavailable";
  }
}

export async function readPageChallenge() {
  try {
    const token = (await cookies()).get(challengeCookie)?.value;
    return await readChallenge(token);
  } catch {
    return { status: "unavailable" } as const;
  }
}

/** The signed-in user's id for a protected page, or why there is none. */
export async function readPageUser() {
  try {
    const token = (await cookies()).get(sessionCookie)?.value;
    const session = await readSession(token);
    return session ? ({ status: "authenticated", userId: session.userId } as const) : ({ status: "anonymous" } as const);
  } catch {
    return { status: "unavailable" } as const;
  }
}
