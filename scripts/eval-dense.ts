// Dense-leg measurement on the frozen A1 golden set (design item B1).
//
//   npm run eval:dense             table: the dense leg next to the v4 ranker
//   npm run eval:dense -- --json   machine-readable report
//
// What this measures, precisely: the RETRIEVAL leg alone — profile vector
// against posting vectors, cosine order — over the postings the gates already
// let through for each profile. It is NOT the product ranking and it does not
// touch the ratchet: the ratchet lives in tests/unit/matching-eval.test.ts and
// guards the shipped ranker (v4). The plan's rule for switching anything on
// (§6.4) is that the fused order must not fall below those floors — this command
// is the input to that decision, not the decision.
//
// It uses the real local model and refuses to run without it: the deterministic
// double in tests/support produces numbers that say nothing about a model, so it
// is deliberately not reachable from here. No database, no network.
import { GOLDEN_SET } from "../src/data/matching-golden.ts";
import { ndcgAtK, meanOfApplicable, recallAtK, reciprocalRank, RELEVANT_GRADE } from "../src/domain/eval-metrics.ts";
import { runMatchingEval } from "../src/domain/matching-eval.ts";
import { denseRetrieve } from "../src/domain/dense-retrieval.ts";
import {
  DENSE_LEG_VERSION, EMBEDDING_MODEL, INSTRUCTION_VERSION, PROFILE_TEXT_VERSION,
  jobEmbeddingText, profileEmbeddingText, type EmbeddingVector,
} from "../src/domain/embeddings.ts";
import { evaluateJob } from "../src/domain/matching.ts";
import { loadLocalEmbedder } from "../src/server/embeddings/local-embedder.ts";

function format(value: number | null): string {
  return value === null ? "n/a" : value.toFixed(3);
}

function pad(text: string, width: number): string {
  return text.length >= width ? text : text + " ".repeat(width - text.length);
}

/** The postings a profile may see, exactly as the A1 harness builds them. */
function shownFor(profileIndex: number): readonly string[] {
  const golden = GOLDEN_SET.profiles[profileIndex];
  if (!golden) return [];
  return GOLDEN_SET.jobs
    .filter(job => {
      const evaluation = evaluateJob(job.snapshot, golden.profile);
      return evaluation.status === "eligible" || evaluation.status === "needs_review";
    })
    .map(job => job.snapshot.id);
}

async function main(): Promise<number> {
  if (process.argv.includes("--help")) {
    console.log("Usage: npm run eval:dense [-- --json]");
    return 0;
  }
  console.log(`Dense leg ${DENSE_LEG_VERSION} · model ${EMBEDDING_MODEL.version}`
    + ` · instruction ${INSTRUCTION_VERSION} · profile text ${PROFILE_TEXT_VERSION}`);
  console.log(`Set ${GOLDEN_SET.id} v${GOLDEN_SET.version} · ${GOLDEN_SET.jobs.length} postings × ${GOLDEN_SET.profiles.length} profiles`
    + ` · reference time ${GOLDEN_SET.evaluatedAt}`);

  let embedder: Awaited<ReturnType<typeof loadLocalEmbedder>>;
  try {
    embedder = await loadLocalEmbedder();
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    console.error(`The local model is not available (${code}). Run npm run models:fetch first;`
      + " this command will not substitute a fake embedder for a model.");
    return 2;
  }

  // Documents first: this is the indexing cost, paid once per posting and then
  // stored. Queries are per request, so their latency is the one that matters.
  const documentsStart = Date.now();
  const documentVectors = await embedder.embed(
    GOLDEN_SET.jobs.map(job => ({ role: "document" as const, text: jobEmbeddingText(job.snapshot) })),
    "matching",
  );
  const documentsMs = Date.now() - documentsStart;
  const byJobId = new Map<string, EmbeddingVector>(
    GOLDEN_SET.jobs.map((job, index) => [job.snapshot.id, documentVectors[index]!]),
  );

  const gradesByProfile = new Map(GOLDEN_SET.judgments.map(judgment => [judgment.profileId, judgment.grades]));
  const queryLatencies: number[] = [];
  const rows: {
    profileId: string; segment: string; shown: number; relevant: number; uncovered: number;
    recallAt5: number | null; recallAt10: number | null; ndcgAt5: number | null; ndcgAt10: number | null;
    mrr: number | null;
  }[] = [];
  let refusals = 0;

  for (const [index, golden] of GOLDEN_SET.profiles.entries()) {
    const shown = shownFor(index);
    const grades = gradesByProfile.get(golden.id) ?? {};
    const relevant = new Set(shown.filter(id => (grades[id] ?? 0) >= RELEVANT_GRADE));

    const queryStart = Date.now();
    const [query] = await embedder.embed(
      [{ role: "query", text: profileEmbeddingText(golden.profile) }], "matching",
    );
    queryLatencies.push(Date.now() - queryStart);
    if (!query) throw new Error("EMBEDDER_EMPTY_RESULT");

    const ranking = denseRetrieve(query, shown.map(id => ({ id, embedding: byJobId.get(id) ?? null })));
    if (ranking.refusals.length > 0) {
      refusals += 1;
      console.error(`${golden.id}: dense leg refused — ${ranking.refusals.map(refusal => refusal.code).join(",")}`);
    }
    const rankedIds = ranking.ranked.map(entry => entry.id);
    const rankedGrades = rankedIds.map(id => grades[id] ?? 0);
    const judgedGrades = shown.map(id => grades[id] ?? 0);

    rows.push({
      profileId: golden.id, segment: golden.segment, shown: shown.length, relevant: relevant.size,
      uncovered: ranking.uncovered.length,
      recallAt5: recallAtK(rankedIds, relevant, 5),
      recallAt10: recallAtK(rankedIds, relevant, 10),
      ndcgAt5: ndcgAtK(rankedGrades, judgedGrades, 5),
      ndcgAt10: ndcgAtK(rankedGrades, judgedGrades, 10),
      mrr: reciprocalRank(rankedIds, relevant),
    });
  }

  const aggregate = {
    recallAt5: meanOfApplicable(rows.map(row => row.recallAt5)),
    recallAt10: meanOfApplicable(rows.map(row => row.recallAt10)),
    ndcgAt5: meanOfApplicable(rows.map(row => row.ndcgAt5)),
    ndcgAt10: meanOfApplicable(rows.map(row => row.ndcgAt10)),
    mrr: meanOfApplicable(rows.map(row => row.mrr)),
  };
  const sortedQueries = [...queryLatencies].sort((left, right) => left - right);
  const latency = {
    documentsTotalMs: documentsMs,
    documentsPerPostingMs: documentsMs / GOLDEN_SET.jobs.length,
    queryMedianMs: sortedQueries[Math.floor(sortedQueries.length / 2)] ?? 0,
    queryMaxMs: sortedQueries.at(-1) ?? 0,
  };
  const ranker = runMatchingEval(GOLDEN_SET).aggregate;

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({
      leg: DENSE_LEG_VERSION, model: EMBEDDING_MODEL.version,
      instruction: INSTRUCTION_VERSION, profileText: PROFILE_TEXT_VERSION,
      setId: GOLDEN_SET.id, setVersion: GOLDEN_SET.version, evaluatedAt: GOLDEN_SET.evaluatedAt,
      profiles: rows,
      aggregate: {
        recallAt5: aggregate.recallAt5.mean, recallAt10: aggregate.recallAt10.mean,
        ndcgAt5: aggregate.ndcgAt5.mean, ndcgAt10: aggregate.ndcgAt10.mean, mrr: aggregate.mrr.mean,
      },
      rankerV4: ranker,
      latency,
      refusals,
    }, null, 2));
    return refusals > 0 ? 1 : 0;
  }

  console.log([
    pad("profile", 18), pad("shown", 6), pad("relevant", 9), pad("uncovered", 10),
    pad("R@5", 8), pad("R@10", 8), pad("NDCG@5", 8), pad("NDCG@10", 8), "MRR",
  ].join(" "));
  for (const row of rows) {
    console.log([
      pad(row.profileId, 18), pad(String(row.shown), 6), pad(String(row.relevant), 9),
      pad(String(row.uncovered), 10),
      pad(format(row.recallAt5), 8), pad(format(row.recallAt10), 8),
      pad(format(row.ndcgAt5), 8), pad(format(row.ndcgAt10), 8), format(row.mrr),
    ].join(" "));
  }
  console.log(`\nDense leg over ${aggregate.recallAt5.count} profiles:`
    + ` R@5 ${format(aggregate.recallAt5.mean)} · R@10 ${format(aggregate.recallAt10.mean)}`
    + ` · NDCG@5 ${format(aggregate.ndcgAt5.mean)} · NDCG@10 ${format(aggregate.ndcgAt10.mean)}`
    + ` · MRR ${format(aggregate.mrr.mean)}`);
  console.log(`For reference, the shipped ranker on the same set:`
    + ` R@5 ${format(ranker.recallAt5)} · R@10 ${format(ranker.recallAt10)}`
    + ` · NDCG@5 ${format(ranker.ndcgAt5)} · NDCG@10 ${format(ranker.ndcgAt10)} · MRR ${format(ranker.mrr)}`);
  console.log(`Latency: ${latency.documentsPerPostingMs.toFixed(1)} ms per posting to index`
    + ` (${latency.documentsTotalMs} ms for ${GOLDEN_SET.jobs.length})`
    + ` · profile query median ${latency.queryMedianMs} ms, max ${latency.queryMaxMs} ms`);
  if (refusals > 0) {
    console.error(`\nLEG_REFUSED: ${refusals} profile(s) could not be ranked by this leg (see above).`);
    return 1;
  }
  console.log("\nThis is retrieval quality, not the product ranking: the dense leg is not fused with BM25 (B2)"
    + " and the feed is not ordered by it.");
  return 0;
}

try {
  process.exitCode = await main();
} catch (error) {
  console.error(`eval:dense could not run: ${error instanceof Error ? error.message : "unknown"}`);
  process.exitCode = 2;
}
