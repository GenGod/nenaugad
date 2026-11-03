// Owner-run live import of the Remote First Jobs window into PostgreSQL (S1-006).
// Refuses (exit 1) while the source policy is not approved and enabled: approval
// of the permission matrix is not activation.
import { localDatabaseUrl, readConfig, ConfigurationError } from "../src/server/config.ts";
import { getSourcePolicy } from "../src/server/source-policies.ts";
import { runRemoteFirstJobsImport } from "../src/server/import/remote-first-jobs-adapter.ts";
import { fetchRemoteFirstJobsPage } from "../src/server/import/fetcher.ts";
import { createPostgresPersistence } from "../src/server/storage/snapshots.ts";
import { runExtractionPassAfterImport, systemClock } from "../src/server/ai/extraction-pass.ts";
import { openAiTransport } from "../src/server/ai/openai-transport.ts";
import { localPool, migrate } from "./db.ts";

try {
  readConfig(process.env);
  const url = localDatabaseUrl(process.env.DATABASE_URL);
  const policy = getSourcePolicy("remote_first_jobs");
  if (!policy || !policy.enabled || policy.status !== "approved") {
    console.error(JSON.stringify({
      result: "refused",
      reason: "SOURCE_NOT_ENABLED",
      hint: "Approval and activation are separate owner steps; see tasks/S1-006-remote-first-jobs-source.md",
    }));
    process.exit(1);
  }
  const pool = localPool(url);
  await migrate(pool);
  const persistence = createPostgresPersistence(pool, policy);
  const report = await runRemoteFirstJobsImport({
    transport: page => fetchRemoteFirstJobsPage({ page }),
    persistence,
    policy,
    now: new Date().toISOString(),
  });
  // C1: the extraction pass asks send_to_ai_provider per source; this source does not
  // hold it, so the pass reports that and sends nothing. It never throws (B31).
  const extraction = report.result === "partial"
    ? await runExtractionPassAfterImport({
        pool, sourceId: "remote_first_jobs", transport: openAiTransport, clock: systemClock,
      })
    : null;
  await pool.end();
  console.log(JSON.stringify({ ...report, extraction }));
  process.exit(report.result === "partial" ? 0 : 1);
} catch (error) {
  const code = error instanceof ConfigurationError ? error.message : "IMPORT_FAILED";
  console.error(JSON.stringify({ result: "failed", code }));
  process.exit(1);
}
