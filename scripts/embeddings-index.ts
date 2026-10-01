// Owner-run indexing of stored postings into dense vectors (design item B1).
//
//   npm run embeddings:index -- --embedder=local [--source=himalayas] [--limit=50]
//
// Refuses without an explicit `--embedder=local`: the real model is the only
// thing this command will embed with. The deterministic double lives in
// tests/support and must never be able to write vectors into a real database —
// a fake vector stored today would look like a real one tomorrow.
//
// What it does per source: asks `process_with_ml` for that source (decision
// §6.1) and embeds the postings whose text has no vector yet or changed since
// the vector was made. A source without the grant is reported as skipped, never
// partially indexed.
//
// Counts only in the output: no posting text, no vector, no profile field.
import { localDatabaseUrl, readConfig, ConfigurationError } from "../src/server/config.ts";
import { indexSourceEmbeddings, countPostings } from "../src/server/embeddings/embedding-service.ts";
import { loadLocalEmbedder } from "../src/server/embeddings/local-embedder.ts";
import { getSourcePolicy, permissionFor } from "../src/server/source-policies.ts";
import { localPool, migrate } from "./db.ts";

function numericArg(name: string): number | undefined {
  const arg = process.argv.find(argument => argument.startsWith(`--${name}=`));
  if (!arg) return undefined;
  const parsed = Number(arg.slice(name.length + 3));
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

try {
  const args = process.argv.slice(2);
  const embedderArg = args.find(argument => argument.startsWith("--embedder="));
  if (embedderArg !== "--embedder=local") {
    console.error("Refusing to run: pass --embedder=local. The deterministic double is a test"
      + " double and is not reachable from this command.");
    process.exit(1);
  }
  readConfig(process.env);
  const url = localDatabaseUrl(process.env.DATABASE_URL);
  const pool = localPool(url);
  await migrate(pool);

  const requested = args.find(argument => argument.startsWith("--source="))?.slice("--source=".length);
  const sources = requested
    ? [requested]
    : (await pool.query("SELECT DISTINCT source_id FROM job_snapshots ORDER BY source_id"))
      .rows.map(row => (row as { source_id: string }).source_id);
  if (sources.length === 0) {
    console.log(JSON.stringify({ result: "empty", note: "no stored postings — import a source first" }));
    await pool.end();
    process.exit(0);
  }

  // The model is loaded once for the whole run, after the cheap refusals: a
  // missing artifact must not look like a database problem.
  const now = new Date().toISOString();
  const eligible = sources.filter(sourceId => {
    const policy = getSourcePolicy(sourceId);
    return policy !== undefined && permissionFor(policy, "process_with_ml", now) === "allowed";
  });
  if (eligible.length === 0) {
    console.log(JSON.stringify({
      result: "no_source_with_ml_grant",
      sources: sources.map(sourceId => ({ sourceId, outcome: "no_permission" })),
    }));
    await pool.end();
    process.exit(0);
  }

  const embedder = await loadLocalEmbedder();
  const limit = numericArg("limit");
  const reports = [];
  for (const sourceId of sources) {
    const report = await indexSourceEmbeddings({
      pool, sourceId, embedder, now, limit,
      // Counts only, and only when there is work: a full catalog is tens of
      // minutes of CPU on this machine.
      onProgress: (done, total) => console.log(`${sourceId}: embedded ${done}/${total}`),
    });
    reports.push({ ...report, stored: await countPostings(pool, sourceId) });
  }
  await pool.end();
  const partial = reports.filter(report => report.outcome === "partial_store");
  for (const report of partial) {
    // Not a model problem and not an application bug: the database could not find
    // a posting it just handed us. Say what it means and what fixes it.
    console.error(`${report.sourceId}: ${report.unreachable?.length ?? 0} posting(s) could not be attached to their`
      + " snapshot — the database cannot resolve these ids by primary key (index ordering vs server collation"
      + " after a database image change). Remedy: REINDEX TABLE job_snapshots (owner action)."
      + ` Vectors for the rest are stored; unreachable: ${report.unreachable?.join(", ") ?? ""}`);
  }
  console.log(JSON.stringify({
    result: reports.every(report => !["unknown_source", "partial_store"].includes(report.outcome)) ? "ok" : "partial",
    model: embedder.modelVersion,
    now,
    reports,
  }, null, 2));
  process.exit(partial.length > 0 ? 1 : 0);
} catch (error) {
  // A missing model is a distinct, actionable outcome; anything else is a failure.
  const code = error instanceof Error ? error.message : "UNKNOWN";
  const hint = code.startsWith("EMBEDDING_MODEL") || code === "EMBEDDING_RUNTIME_NOT_INSTALLED"
    ? " (run npm run models:fetch, then check docs/EMBEDDING_PLAYBOOK.md)"
    : "";
  console.error(JSON.stringify({
    result: "failed",
    code: error instanceof ConfigurationError ? `config:${code}` : code,
    hint: hint || undefined,
  }));
  process.exit(1);
}
