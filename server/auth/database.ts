import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../db/generated/client.ts";
import { databaseUrl } from "./config.ts";

const runtime = globalThis as typeof globalThis & { getsteadPrisma?: PrismaClient };

export function db() {
  return runtime.getsteadPrisma ??= new PrismaClient({
    adapter: new PrismaPg({
      connectionString: databaseUrl(),
      max: 4,
      connectionTimeoutMillis: 3_000,
      statement_timeout: 5_000,
    }),
    errorFormat: "minimal",
  });
}

export async function disconnectDb() {
  const client = runtime.getsteadPrisma;
  runtime.getsteadPrisma = undefined;
  await client?.$disconnect();
}
