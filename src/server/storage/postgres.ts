import { Pool } from "pg";
import { isStarterJob, type CatalogRepository, type StarterJob } from "../../domain/job.ts";
import { localDatabaseUrl } from "../config.ts";

const globalPool = globalThis as typeof globalThis & { atlasPool?: Pool };

function pool(): Pool {
  if (!globalPool.atlasPool) {
    globalPool.atlasPool = new Pool({
      connectionString: localDatabaseUrl(process.env.DATABASE_URL),
      max: 3, connectionTimeoutMillis: 3000, idleTimeoutMillis: 10000,
      statement_timeout: 4000
    });
    globalPool.atlasPool.on("error", () => {
      console.error(JSON.stringify({ code: "DATABASE_POOL_ERROR" }));
    });
  }
  return globalPool.atlasPool;
}

export const postgresRepository: CatalogRepository = {
  async all() {
    // This table deliberately accepts only synthetic seed data. Not a live-source warehouse.
    const result = await pool().query<{ payload: unknown }>(
      "SELECT payload FROM atlas_demo_jobs ORDER BY id LIMIT $1", [501]
    );
    if (result.rows.length > 500) throw new Error("STARTER_DATASET_LIMIT");
    const records: StarterJob[] = [];
    for (const row of result.rows) {
      if (!isStarterJob(row.payload)) throw new Error("INVALID_STORED_FIXTURE");
      records.push(row.payload);
    }
    return records;
  }
};
