import { createRequire } from "node:module";
import { resolve } from "node:path";
import type { sqlServerConfig } from "../scripts/mssql-config.mjs";
export interface SqlRequest {
  input(name: string, type: unknown, value: unknown): SqlRequest;
  query<T = Record<string, unknown>>(text: string): Promise<{ recordset: T[]; recordsets?: Record<string, unknown>[][] }>;
}
export interface SqlPool {
  connect(): Promise<SqlPool>;
  close(): Promise<void>;
  on(event: "error", handler: (error: { code?: string }) => void): SqlPool;
}
export interface SqlTransaction {
  on(event: "rollback", handler: () => void): SqlTransaction;
  begin(level: number): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}
export interface SqlDriver {
  ConnectionPool: new (config: ReturnType<typeof sqlServerConfig>) => SqlPool;
  Request: new (connection: SqlPool | SqlTransaction) => SqlRequest;
  Transaction: new (pool: SqlPool) => SqlTransaction;
  ISOLATION_LEVEL: { READ_COMMITTED: number };
  NVarChar: (length: number) => unknown;
  Int: unknown;
  BigInt: unknown;
  MAX: number;
}
export function loadSqlServerDriver(): SqlDriver {
  // The driver is installed alongside its own manifest. This keeps a native
  // TCP dependency out of the Workers preview and allows controlled installation.
  const requireDriver = createRequire(resolve(/* turbopackIgnore: true */ process.cwd(), "drivers/sqlserver/package.json"));
  try {
    return requireDriver("mssql") as SqlDriver;
  } catch (error) {
    if ((error as { code?: string }).code !== "MODULE_NOT_FOUND") throw error;
    throw new Error("Driver SQL Server belum tersedia. Jalankan pnpm db:driver pada server Next.js.");
  }
}
