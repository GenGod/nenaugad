// Owner-run live import of the approved Himalayas feed into PostgreSQL.
// Refuses (exit 1) while the source policy is not enabled: approval of the
// permission matrix is not activation (tasks/S1-002 acceptance 7).
import { localDatabaseUrl, readConfig, ConfigurationError } from "../src/server/config.ts";
import { getSourcePolicy } from "../src/server/source-policies.ts";
import { runHimalayasImport } from "../src/server/import/himalayas-adapter.ts";
import { fetchHimalayasPage } from "../src/server/import/fetcher.ts";
import { createPostgresPersistence } from "../src/server/storage/snapshots.ts";
import { runExtractionPassAfterImport } from "../src/server/ai/extraction-pass.ts";
import { openAiTransport } from "../src/server/ai/openai-transport.ts";
import { localPool, migrate } from "./db.ts";

function pagesArg(): number {
  const arg = process.argv.find(a => a.startsWith("--pages="));
  const parsed = arg ? Number(arg.slice("--pages=".length)) : Number.NaN;
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 500 ? parsed : 25;
}

try {
  readConfig(process.env);
  const url = localDatabaseUrl(process.env.DATABASE_URL);
  const policy = getSourcePolicy("himalayas");
  if (!policy || !policy.enabled || policy.status !== "approved") {
    console.error(JSON.stringify({
      result: "refused",
      reason: "SOURCE_NOT_ENABLED",
      hint: "Activation is a separate owner review; see tasks/S1-002-himalayas-live-adapter.md",
    }));
    process.exit(1);
  }
  const pool = localPool(url);
  await migrate(pool);
  const persistence = createPostgresPersistence(pool, policy);
  const report = await runHimalayasImport({
    transport: cursor => fetchHimalayasPage({ cursor }),
    persistence,
    policy,
    now: new Date().toISOString(),
    maxPages: pagesArg(),
  });
  // C1: after an applied pass, extract what this source has not been extracted
  // for yet. Guarded and capped at 25 provider calls (B34); it never throws, so it
  // cannot fail the import or change its exit code (B31); with LIVE_AI_ENABLED off
  // the pass reports live_ai_disabled and nothing is sent or spent.
  const extraction = report.result === "applied" || report.result === "partial"
    ? await runExtractionPassAfterImport({
        pool, sourceId: "himalayas", transport: openAiTransport, now: new Date().toISOString(),
      })
    : null;
  await pool.end();
  console.log(JSON.stringify({ ...report, extraction }));
  process.exit(report.result === "applied" || report.result === "partial" ? 0 : 1);
} catch (error) {
  const code = error instanceof ConfigurationError ? error.message : "IMPORT_FAILED";
  console.error(JSON.stringify({ result: "failed", code }));
  process.exit(1);
}
