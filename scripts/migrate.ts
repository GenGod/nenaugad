import { localPool, migrate } from "./db.ts";
const pool = localPool(process.env.DATABASE_URL);
try { console.log(JSON.stringify({ migrationsApplied: await migrate(pool) })); }
catch { console.error("MIGRATION_FAILED: check the local database and migration checksums; no URL logged."); process.exitCode = 1; }
finally { await pool.end(); }
