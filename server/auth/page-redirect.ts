/**
 * Where a signed-in account must go instead of the page it asked for, or null to render it. Pure, so
 * the redirect table (and its freedom from loops) is unit-tested in page-redirect.test.ts.
 */
export function pageRedirect(
  profile: { admin: boolean; mustChangePassword: boolean },
  { allowPasswordChange = false, shared = false } = {},
): "/profile" | "/admin" | null {
  if (profile.mustChangePassword && !allowPasswordChange) return "/profile";
  if (profile.admin && !shared) return "/admin";
  return null;
}
