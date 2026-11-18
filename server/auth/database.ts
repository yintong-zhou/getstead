import oracledb, { type BindParameters, type Connection, type Pool } from "oracledb";
import { oracleConfig } from "./config.ts";

const runtime = globalThis as typeof globalThis & { steadOraclePool?: Promise<Pool> };

function getPool() {
  runtime.steadOraclePool ??= oracledb.createPool({
    ...oracleConfig(),
    poolAlias: "stead-auth",
    poolMin: 0,
    poolMax: 4,
    poolIncrement: 1,
    queueTimeout: 3_000,
  }).catch((error: unknown) => {
    runtime.steadOraclePool = undefined;
    throw error;
  });
  return runtime.steadOraclePool;
}

export async function withConnection<T>(work: (connection: Connection) => Promise<T>) {
  const connection = await (await getPool()).getConnection();
  try {
    connection.callTimeout = 5_000;
    return await work(connection);
  } finally {
    await connection.close();
  }
}

export function inTransaction<T>(work: (connection: Connection) => Promise<T>) {
  return withConnection(async (connection) => {
    try {
      const result = await work(connection);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  });
}

export async function one<T>(connection: Connection, sql: string, binds: BindParameters) {
  const result = await connection.execute<T>(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
  return result.rows?.[0] ?? null;
}

export async function closePool() {
  const pool = runtime.steadOraclePool;
  runtime.steadOraclePool = undefined;
  if (pool) await (await pool).close(0);
}
