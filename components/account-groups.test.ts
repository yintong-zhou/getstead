import assert from "node:assert/strict";
import test from "node:test";
import { groupByInstitution } from "./account-groups.ts";

const accounts = [
  { id: "1", institution: "Revolut" },
  { id: "2", institution: null },
  { id: "3", institution: "Example Bank" },
  { id: "4", institution: "revolut" },
];

test("accounts of one institution form a group in place of the first one; a lone institution stays an account", () => {
  const items = groupByInstitution(accounts, (account) => account.institution);
  assert.deepEqual(items.map((item) => item.kind === "group" ? `group:${item.accounts.map(({ id }) => id).join(",")}` : item.account.id),
    ["group:1,4", "2", "3"]);
  assert.equal(items[0].kind === "group" && items[0].name, "Revolut");
});
