// Waitlist against the synthetic test database, through the least-privilege runtime role.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after, before } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../db/generated/client.ts";
import { localPostgresUrl } from "../auth/config.ts";
import { db, disconnectDb } from "../auth/database.ts";
import { reserveAttempt } from "../auth/limits.ts";
import { joinWaitlist } from "./service.ts";

let owner: PrismaClient;
const emails: string[] = [];

before(() => {
  const url = localPostgresUrl(process.env.DATABASE_URL);
  assert.equal(url.pathname, "/stead_auth_test", "Use the dedicated synthetic-test database.");
  localPostgresUrl(process.env.DATABASE_ADMIN_URL);
  owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_ADMIN_URL }) });
});

after(async () => {
  await owner.waitlistEntry.deleteMany({ where: { email: { in: emails } } });
  await owner.$disconnect();
  await disconnectDb();
});

function address() {
  const email = `wl-${randomUUID()}@example.test`;
  emails.push(email);
  return email;
}

test("joining twice with the same email keeps one row and the first language", async () => {
  const email = address();
  await joinWaitlist(email, "en");
  await joinWaitlist(email, "it");
  const rows = await owner.waitlistEntry.findMany({ where: { email } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.locale, "en");
});

test("the runtime role can add entries but cannot read the list back", async () => {
  await assert.rejects(db().waitlistEntry.findMany({ take: 1 }), (error) => /permission denied/i.test(String(error)));
});

test("the database refuses a language the site does not have", async () => {
  await assert.rejects(owner.waitlistEntry.create({ data: { email: address(), locale: "fr" } }), (error) => /check|constraint/i.test(String(error)));
});

test("the waitlist limiter lets five tries through per address, then stops", async () => {
  const subject = `203.0.113.${Math.floor(Math.random() * 250)}-${randomUUID()}`;
  const results = [];
  for (let attempt = 0; attempt < 6; attempt += 1) results.push(await reserveAttempt("waitlist", subject));
  assert.deepEqual(results, [true, true, true, true, true, false]);
});
