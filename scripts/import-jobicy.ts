// Owner-run live import of the approved Jobicy window feed into PostgreSQL.
// Refuses (exit 1) while the source policy is not enabled: approval of the
// permission matrix is not activation (tasks/S1-003 acceptance 6).
import { localDatabaseUrl, readConfig, ConfigurationError } from "../src/server/config.ts";
import { getSourcePolicy } from "../src/server/source-policies.ts";
import { runJobicyImport } from "../src/server/import/jobicy-adapter.ts";
import { fetchJobicyWindow } from "../src/server/import/fetcher.ts";
import { createPostgresPersistence } from "../src/server/storage/snapshots.ts";
import { runExtractionPassAfterImport, systemClock } from "../src/server/ai/extraction-pass.ts";
import { openAiTransport } from "../src/server/ai/openai-transport.ts";
import { localPool, migrate } from "./db.ts";

try {
  readConfig(process.env);
  const url = localDatabaseUrl(process.env.DATABASE_URL);
  const policy = getSourcePolicy("jobicy");
  if (!policy || !policy.enabled || policy.status !== "approved") {
    console.error(JSON.stringify({
      result: "refused",
      reason: "SOURCE_NOT_ENABLED",
      hint: "Activation is a separate owner review; see tasks/S1-003-jobicy-second-source.md",
    }));
    process.exit(1);
  }
  const pool = localPool(url);
  await migrate(pool);
  const persistence = createPostgresPersistence(pool, policy);
  const report = await runJobicyImport({
    transport: () => fetchJobicyWindow({ count: 200 }),
    persistence,
    policy,
    now: new Date().toISOString(),
  });
  // C1: after a successful pass, extract what this source has not been extracted
  // for yet (jobicy's success result is "partial" — a window feed is never a
  // complete catalog). Guarded and capped at 25 provider calls (B34); it never
  // throws, so it cannot fail the import or change its exit code (B31); with
  // LIVE_AI_ENABLED off the pass reports live_ai_disabled and nothing is sent or
  // spent.
  const extraction = report.result === "partial"
    ? await runExtractionPassAfterImport({
        pool, sourceId: "jobicy", transport: openAiTransport, clock: systemClock,
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
