// Owner-run live import of the RemoteJobs.org window into PostgreSQL (S1-007).
// Refuses (exit 1) while the source policy is not approved and enabled: the owner
// approved the permission matrix on 2026-11-07, and activation (enabled: true) is a
// separate owner step.
import { localDatabaseUrl, readConfig, ConfigurationError } from "../src/server/config.ts";
import { getSourcePolicy } from "../src/server/source-policies.ts";
import { runRemoteJobsOrgImport } from "../src/server/import/remotejobs-org-adapter.ts";
import { fetchRemoteJobsOrgPage } from "../src/server/import/fetcher.ts";
import { createPostgresPersistence } from "../src/server/storage/snapshots.ts";
import { runExtractionPassAfterImport, systemClock } from "../src/server/ai/extraction-pass.ts";
import { openAiTransport } from "../src/server/ai/openai-transport.ts";
import { localPool, migrate } from "./db.ts";

try {
  readConfig(process.env);
  const url = localDatabaseUrl(process.env.DATABASE_URL);
  const policy = getSourcePolicy("remotejobs_org");
  if (!policy || !policy.enabled || policy.status !== "approved") {
    console.error(JSON.stringify({
      result: "refused",
      reason: "SOURCE_NOT_ENABLED",
      hint: "Activation is a separate owner step after the matrix approval; see tasks/S1-007-remotejobs-org-source.md",
    }));
    process.exit(1);
  }
  const pool = localPool(url);
  await migrate(pool);
  const persistence = createPostgresPersistence(pool, policy);
  const report = await runRemoteJobsOrgImport({
    transport: offset => fetchRemoteJobsOrgPage({ offset }),
    persistence,
    policy,
    now: new Date().toISOString(),
  });
  // C1: the extraction pass asks send_to_ai_provider per source; this source does not
  // hold it, so the pass reports that and sends nothing. It never throws (B31).
  const extraction = report.result === "partial"
    ? await runExtractionPassAfterImport({
        pool, sourceId: "remotejobs_org", transport: openAiTransport, clock: systemClock,
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
