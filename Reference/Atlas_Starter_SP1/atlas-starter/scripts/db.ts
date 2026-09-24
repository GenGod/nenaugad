import { Pool } from "pg";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { readConfig, localDatabaseUrl } from "../src/server/config.ts";
import { jobs } from "../src/data/fixtures.ts";

export function localPool(url: string | undefined, testOnly = false): Pool {
  readConfig(process.env);
  return new Pool({
    connectionString: localDatabaseUrl(url, testOnly), max: 2,
    connectionTimeoutMillis: 3000, statement_timeout: 10000
  });
}

export async function migrate(pool: Pool): Promise<number> {
  const client = await pool.connect();
  let count = 0;
  try {
    await client.query("BEGIN");
    // Transaction-scoped lock makes parallel local migrations serial.
    await client.query("SELECT pg_advisory_xact_lock($1)", [82131001]);
    await client.query(`CREATE TABLE IF NOT EXISTS atlas_schema_migrations (
      name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const directory = new URL("../migrations/", import.meta.url);
    const names = (await readdir(directory)).filter(n => /^\d{4}_[a-z0-9_]+\.sql$/u.test(n)).sort();
    for (const name of names) {
      const sql = await readFile(new URL(name, directory), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const previous = await client.query<{ checksum: string }>(
        "SELECT checksum FROM atlas_schema_migrations WHERE name = $1", [name]
      );
      if (previous.rows[0]) {
        if (previous.rows[0].checksum !== checksum) throw new Error("MIGRATION_CHECKSUM_MISMATCH");
        continue;
      }
      await client.query(sql);
      await client.query("INSERT INTO atlas_schema_migrations(name, checksum) VALUES ($1,$2)", [name, checksum]);
      count += 1;
    }
    await client.query("COMMIT");
    return count;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

export async function seed(pool: Pool): Promise<number> {
  const client = await pool.connect();
  let changed = 0;
  try {
    await client.query("BEGIN");
    for (const job of jobs) {
      const payload = JSON.stringify(job);
      const hash = createHash("sha256").update(payload).digest("hex");
      const result = await client.query(
        `INSERT INTO atlas_demo_jobs (id, source_id, external_id, content_hash, payload)
         VALUES ($1,$2,$3,$4,$5::jsonb)
         ON CONFLICT (id) DO UPDATE SET content_hash=EXCLUDED.content_hash,
           payload=EXCLUDED.payload, updated_at=now()
         WHERE atlas_demo_jobs.content_hash IS DISTINCT FROM EXCLUDED.content_hash`,
        [job.id, job.sourceId, job.externalId, hash, payload]
      );
      changed += result.rowCount ?? 0;
    }
    await client.query("COMMIT");
    return changed;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
