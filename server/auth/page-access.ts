import { cookies } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { recordError } from "../admin/logs.ts";
import { challengeCookie, sessionCookie } from "./http.ts";
import { readChallenge, readSession } from "./service.ts";
import { getProfile } from "../profile/service.ts";
import type { Locale } from "../locale.ts";
import { pageRedirect } from "./page-redirect.ts";

export async function readPageSession() {
  try {
    const token = (await cookies()).get(sessionCookie)?.value;
    return await readSession(token) ? "authenticated" : "anonymous";
  } catch (error) {
    unstable_rethrow(error);
    await recordError(error, "page:session");
    return "unavailable";
  }
}

export async function readPageChallenge() {
  try {
    const token = (await cookies()).get(challengeCookie)?.value;
    return await readChallenge(token);
  } catch (error) {
    unstable_rethrow(error);
    await recordError(error, "page:challenge");
    return { status: "unavailable" } as const;
  }
}

async function pageUser() {
  try {
    const token = (await cookies()).get(sessionCookie)?.value;
    const session = await readSession(token);
    if (!session) return { status: "anonymous" } as const;
    const profile = await getProfile(session.userId);
    return { status: "authenticated", userId: session.userId, admin: session.admin && session.hasTotp, profile } as const;
  } catch (error) {
    unstable_rethrow(error);
    await recordError(error, "page:user");
    return { status: "unavailable" } as const;
  }
}

/**
 * The signed-in user's id for a protected page, or why there is none. A user still on a temporary
 * password is sent to the profile page (the only page allowed to skip this) to choose a new one.
 *
 * Pages are finance pages by default: an admin account is sent to the admin area instead. Only the
 * profile and admin pages pass `shared`, and the admin pages check the role themselves.
 */
export async function readPageUser(locale: Locale, { allowPasswordChange = false, shared = false } = {}) {
  const user = await pageUser();
  // redirect() throws, so it must stay outside the try/catch above.
  const target = user.status === "authenticated" ? pageRedirect(user.profile, { allowPasswordChange, shared }) : null;
  if (target) redirect(`/${locale}${target}`);
  return user;
}
