/** Chạy các file db/migrations/NNNN_*.sql chưa chạy, theo thứ tự tên, mỗi file một transaction. */
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../db/migrations");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query("create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())");
const done = new Set((await client.query<{ name: string }>("select name from schema_migrations")).rows.map((r) => r.name));

for (const file of (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort()) {
  if (done.has(file)) continue;
  const sql = await readFile(path.join(dir, file), "utf8");
  await client.query("begin");
  try {
    await client.query(sql);
    await client.query("insert into schema_migrations(name) values ($1)", [file]);
    await client.query("commit");
    console.log("✓", file);
  } catch (e) {
    await client.query("rollback");
    console.error("✗", file);
    throw e;
  }
}
await client.end();
