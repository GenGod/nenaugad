import test from "node:test";
import assert from "node:assert/strict";
import { localPool, migrate, seed } from "../../scripts/db.ts";
import { isStarterJob, parseCatalogQuery, selectCatalog } from "../../src/domain/job.ts";

// Missing config fails loudly. Never report a skipped DB suite as passing.
const pool = localPool(process.env.TEST_DATABASE_URL, true);
test.after(async () => { await pool.end(); });

test("migrations and seed are repeatable; catalog reads real PostgreSQL", async () => {
  await migrate(pool);
  assert.equal(await migrate(pool), 0);
  await seed(pool);
  const before = await pool.query("SELECT id, updated_at FROM atlas_demo_jobs ORDER BY id");
  assert.equal(await seed(pool), 0);
  const after = await pool.query("SELECT id, updated_at FROM atlas_demo_jobs ORDER BY id");
  assert.deepEqual(before.rows, after.rows);
  const rows = await pool.query<{ payload: unknown }>("SELECT payload FROM atlas_demo_jobs ORDER BY id");
  const values = rows.rows.map(row => row.payload);
  assert.ok(values.every(isStarterJob));
  assert.equal(selectCatalog(values, parseCatalogQuery(new URLSearchParams())).total, 4);
});
test("database rejects non-synthetic data", async () => {
  await migrate(pool);
  await assert.rejects(pool.query(
    `INSERT INTO atlas_demo_jobs(id,source_id,external_id,content_hash,payload)
     VALUES ($1,$2,$3,$4,$5::jsonb)`,
    ["forbidden", "live-source", "forbidden", "x", JSON.stringify({ synthetic:false })]
  ));
});
test("bound values are never interpreted as SQL", async () => {
  await migrate(pool);
  await seed(pool);
  const rows = await pool.query("SELECT id FROM atlas_demo_jobs WHERE id=$1", ["' OR 1=1 --"]);
  assert.equal(rows.rowCount, 0);
});
