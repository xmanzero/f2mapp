import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";

/** Kiểu bảng sẽ sinh tự động (kysely-codegen) khi schema ổn định; tạm để any. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DB = any;

let db: Kysely<DB> | null = null;

export function getDb(): Kysely<DB> {
  if (!process.env.DATABASE_URL) throw new Error("Chưa đặt DATABASE_URL");
  db ??= new Kysely<DB>({ dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: process.env.DATABASE_URL }) }) });
  return db;
}
