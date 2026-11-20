// A fresh, uniquely named local database proves the complete chain without resetting test data.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../db/generated/client.ts";
import { localPostgresUrl } from "../auth/config.ts";

test("fresh local migration chain and schema diff are clean", async () => {
  const url = localPostgresUrl(process.env.DATABASE_ADMIN_URL);
  assert.equal(url.pathname, "/stead_auth_test");
  const database = `stead_m3_chain_${randomUUID().replaceAll("-", "")}`;
  assert.match(database, /^stead_m3_chain_[a-f0-9]+$/);
  const owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }) });
  let created = false;
  try {
    await owner.$executeRawUnsafe(`CREATE DATABASE "${database}"`);
    created = true;
    url.pathname = `/${database}`;
    const env = { ...process.env, DATABASE_ADMIN_URL: url.toString(), DATABASE_URL: url.toString() };
    for (const args of [
      ["migrate", "deploy"],
      ["db", "execute", "--file", "db/grant-runtime.sql"],
      ["migrate", "diff", "--from-config-datasource", "--to-schema", "db/schema.prisma", "--exit-code"],
    ]) {
      const result = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", ...args], { env, encoding: "utf8", timeout: 60_000, windowsHide: true });
      assert.equal(result.status, 0, `${args.join(" ")}: ${result.stdout}\n${result.stderr}`);
    }
  } finally {
    if (created) await owner.$executeRawUnsafe(`DROP DATABASE "${database}" WITH (FORCE)`);
    await owner.$disconnect();
  }
});
