import { localPool, seed } from "./db.ts";
const pool = localPool(process.env.DATABASE_URL);
try { console.log(JSON.stringify({ syntheticRecordsChanged: await seed(pool) })); }
catch { console.error("SEED_FAILED: run migrations on the isolated local database first."); process.exitCode = 1; }
finally { await pool.end(); }
