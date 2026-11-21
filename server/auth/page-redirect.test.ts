import assert from "node:assert/strict";
import test from "node:test";
import { pageRedirect } from "./page-redirect.ts";

// The three kinds of page, as the page files declare them (see access-policy.test.ts).
const pages = {
  finance: {},
  admin: { shared: true },
  profile: { shared: true, allowPasswordChange: true },
} as const;
const path = { finance: "/overview", admin: "/admin", profile: "/profile" } as const;

const accounts = [
  { name: "user", admin: false },
  { name: "admin", admin: true }, // with or without 2FA: the role decides, the admin page itself asks for 2FA
].flatMap((account) => [false, true].map((mustChangePassword) => ({ ...account, mustChangePassword })));

test("user accounts keep their behavior; admin accounts only get profile and admin pages", () => {
  assert.equal(pageRedirect({ admin: false, mustChangePassword: false }, pages.finance), null);
  assert.equal(pageRedirect({ admin: false, mustChangePassword: false }, pages.admin), null); // the admin page 404s a user itself
  assert.equal(pageRedirect({ admin: false, mustChangePassword: true }, pages.finance), "/profile");
  assert.equal(pageRedirect({ admin: false, mustChangePassword: true }, pages.profile), null);

  assert.equal(pageRedirect({ admin: true, mustChangePassword: false }, pages.finance), "/admin");
  assert.equal(pageRedirect({ admin: true, mustChangePassword: false }, pages.admin), null);
  assert.equal(pageRedirect({ admin: true, mustChangePassword: false }, pages.profile), null);
  // A temporary password comes first: profile to change it, then the admin area.
  assert.equal(pageRedirect({ admin: true, mustChangePassword: true }, pages.finance), "/profile");
  assert.equal(pageRedirect({ admin: true, mustChangePassword: true }, pages.admin), "/profile");
  assert.equal(pageRedirect({ admin: true, mustChangePassword: true }, pages.profile), null);
});

test("every redirect lands on a page that renders: no loops, whatever the account", () => {
  for (const account of accounts) {
    for (const kind of Object.keys(pages) as (keyof typeof pages)[]) {
      const first = pageRedirect(account, pages[kind]);
      if (!first) continue;
      const landing = (Object.keys(path) as (keyof typeof pages)[]).find((k) => path[k] === first)!;
      assert.equal(pageRedirect(account, pages[landing]), null, `${JSON.stringify(account)} ${kind} -> ${first} must not redirect again`);
    }
  }
});
