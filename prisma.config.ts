import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { defineConfig } from "prisma/config";

for (const file of ["credentials/stead-postgres.env", ".env.local", ".env"]) {
  if (existsSync(file)) loadEnvFile(file);
}

export default defineConfig({
  schema: "db/schema.prisma",
  migrations: { path: "db/migrations" },
  datasource: { url: process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL },
});
