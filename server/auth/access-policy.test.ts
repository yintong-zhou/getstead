// Guards the admin/user separation at the source level: a new route or page that forgets the
// guard must fail here. Behavior is covered by server/admin/postgres.integration.ts.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const files = (dir: string, name: string) =>
  readdirSync(dir, { recursive: true, encoding: "utf8" })
    .map((path) => path.replaceAll("\\", "/"))
    .filter((path) => path === name || path.endsWith(`/${name}`))
    .map((path) => ({ path, source: readFileSync(`${dir}/${path}`, "utf8") }));

test("API routes are finance-only unless they are admin or profile routes", () => {
  const routes = files("app/api", "route.ts").filter(({ path }) => !/^(auth|waitlist)\//.test(path));
  assert.ok(routes.length > 30);
  for (const { path, source } of routes) {
    assert.match(source, /\bapi(<.*>)?\(/, `${path} must go through api()`);
    if (path.startsWith("admin/")) assert.match(source, /admin: true/, path);
    else if (path.startsWith("profile/")) assert.match(source, /shared: true/, path);
    else assert.doesNotMatch(source, /admin: true|shared: true/, `${path} must stay closed to admin accounts`);
  }
});

test("pages read the session through readPageUser, and only profile and admin pages are shared", () => {
  // Public or pre-login pages: no session guard of their own.
  const open = new Set(["page.tsx", "login/page.tsx", "login/mfa/page.tsx", "privacy/page.tsx"]);
  const pages = files("app/[locale]", "page.tsx");
  assert.ok(pages.length > 10);
  for (const { path, source } of pages) {
    if (open.has(path)) continue;
    assert.match(source, /readPageUser\(locale/, `${path} must call readPageUser`);
    const shared = /^(profile|admin)(\/|$)/.test(path);
    assert.equal(/shared: true/.test(source), shared, `${path}: shared only on profile and admin pages`);
  }
});
