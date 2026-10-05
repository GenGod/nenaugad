// Fused-retrieval measurement on the frozen A1 golden set (design item B2).
//
//   npm run eval:retrieval             dense, BM25 and their RRF fusion side by side
//   npm run eval:retrieval -- --json   machine-readable report
//
// What this measures: three RETRIEVAL legs over the postings the gates already let
// through for each profile — dense (B1), BM25 (B2), and the RRF fusion of the two —
// scored with the same metric functions as A1. It is not the product ranking and it
// does not touch the ratchet; the decision it feeds is the switch decision (§6.4),
// where the fused order has to earn its place against the shipped ranker.
//
// The complementarity count is the honest core of B2: a fusion can only beat its
// legs where the legs disagree, so the report says exactly how many relevant
// postings each leg found that the other missed. If that number is zero, fusion is
// decoration and this command is the evidence.
//
// It uses the real local model and refuses to run without it — the deterministic
// double in tests/support says nothing about a model and is not reachable here.
// No database, no network.
import { GOLDEN_SET } from "../src/data/matching-golden.ts";
import { BM25_LEG_VERSION, bm25Rank, profileLexicalQuery, type Bm25Document } from "../src/domain/bm25.ts";
import { denseRetrieve } from "../src/domain/dense-retrieval.ts";
import {
  DENSE_LEG_VERSION, EMBEDDING_MODEL, jobEmbeddingText, profileEmbeddingText, type EmbeddingVector,
} from "../src/domain/embeddings.ts";
import { runMatchingEval } from "../src/domain/matching-eval.ts";
import {
  collectTopK, complementarity, gatedPostingsFor, measureRetrievalLeg,
  type RetrievalOrder, type RetrievalReport,
} from "../src/domain/retrieval-eval.ts";
import { RRF_K, RRF_VERSION, reciprocalRankFusion, type RrfScored } from "../src/domain/rrf.ts";
import { loadLocalEmbedder } from "../src/server/embeddings/local-embedder.ts";

function format(value: number | null): string {
  return value === null ? "n/a" : value.toFixed(3);
}

function pad(text: string, width: number): string {
  return text.length >= width ? text : text + " ".repeat(width - text.length);
}

function printReport(report: RetrievalReport): void {
  console.log([
    pad(report.legId, 18), pad("R@5", 8), pad("R@10", 8), pad("NDCG@5", 8), pad("NDCG@10", 8), "MRR",
  ].join(" "));
  for (const profile of report.profiles) {
    console.log([
      pad(profile.profileId, 18),
      pad(format(profile.recallAt5), 8), pad(format(profile.recallAt10), 8),
      pad(format(profile.ndcgAt5), 8), pad(format(profile.ndcgAt10), 8), format(profile.mrr),
    ].join(" "));
  }
  console.log([
    pad("aggregate", 18),
    pad(format(report.aggregate.recallAt5), 8), pad(format(report.aggregate.recallAt10), 8),
    pad(format(report.aggregate.ndcgAt5), 8), pad(format(report.aggregate.ndcgAt10), 8),
    format(report.aggregate.mrr),
  ].join(" "));
}

async function main(): Promise<number> {
  if (process.argv.includes("--help")) {
    console.log("Usage: npm run eval:retrieval [-- --json]");
    return 0;
  }
  console.log(`Set ${GOLDEN_SET.id} v${GOLDEN_SET.version} · reference time ${GOLDEN_SET.evaluatedAt}`);
  console.log(`Legs: dense ${DENSE_LEG_VERSION} (${EMBEDDING_MODEL.version}) · ${BM25_LEG_VERSION} · ${RRF_VERSION} k=${RRF_K}`);

  let embedder: Awaited<ReturnType<typeof loadLocalEmbedder>>;
  try {
    embedder = await loadLocalEmbedder();
  } catch (error) {
    console.error(`The local model is not available (${error instanceof Error ? error.message : "UNKNOWN"}).`
      + " Run npm run models:fetch first; this command will not substitute a fake embedder for a model.");
    return 2;
  }

  const documentsStart = Date.now();
  const documentVectors = await embedder.embed(
    GOLDEN_SET.jobs.map(job => ({ role: "document" as const, text: jobEmbeddingText(job.snapshot) })),
    "matching",
  );
  const documentsMs = Date.now() - documentsStart;
  const vectorsByJobId = new Map<string, EmbeddingVector>(
    GOLDEN_SET.jobs.map((job, index) => [job.snapshot.id, documentVectors[index]!]),
  );
  const bm25Documents: readonly Bm25Document[] = GOLDEN_SET.jobs.map(job => ({
    id: job.snapshot.id,
    text: `${job.snapshot.title}\n${job.snapshot.description_text}`,
  }));
  const bm25ById = new Map(bm25Documents.map(document => [document.id, document]));

  // The dense leg needs the query vector per profile; BM25 needs its own query
  // text. Both orders are computed per profile and kept for the fusion.
  const denseOrders = new Map<string, RetrievalOrder>();
  const bm25Orders = new Map<string, RetrievalOrder>();
  const fusedOrders = new Map<string, RetrievalOrder>();
  const fusionDetail = new Map<string, readonly RrfScored[]>();
  let refusals = 0;
  let queryMsTotal = 0;
  let bm25MsTotal = 0;

  for (const [index, golden] of GOLDEN_SET.profiles.entries()) {
    const gatedIds = gatedPostingsFor(GOLDEN_SET, index);
    const queryStart = Date.now();
    const [query] = await embedder.embed(
      [{ role: "query", text: profileEmbeddingText(golden.profile) }], "matching",
    );
    queryMsTotal += Date.now() - queryStart;
    if (!query) throw new Error("EMBEDDER_EMPTY_RESULT");

    const ranking = denseRetrieve(query, gatedIds.map(id => ({ id, embedding: vectorsByJobId.get(id) ?? null })));
    if (ranking.refusals.length > 0) {
      refusals += 1;
      console.error(`${golden.id}: dense leg refused — ${ranking.refusals.map(refusal => refusal.code).join(",")}`);
    }
    denseOrders.set(golden.id, { ids: ranking.ranked.map(entry => entry.id), uncovered: ranking.uncovered });

    const bm25Start = Date.now();
    const bm25Scored = bm25Rank(
      profileLexicalQuery(golden.profile),
      gatedIds.map(id => bm25ById.get(id)!).filter(Boolean),
    );
    bm25MsTotal += Date.now() - bm25Start;
    const bm25Ids = bm25Scored.map(entry => entry.id);
    bm25Orders.set(golden.id, {
      ids: bm25Ids,
      uncovered: gatedIds.filter(id => !bm25Ids.includes(id)),
    });

    const fused = reciprocalRankFusion([denseOrders.get(golden.id)!.ids, bm25Ids]);
    fusionDetail.set(golden.id, fused);
    fusedOrders.set(golden.id, { ids: fused.map(entry => entry.id), uncovered: [] });
  }

  const orderOf = (orders: Map<string, RetrievalOrder>) =>
    (_profile: unknown, gatedIds: readonly string[], profileIndex: number): RetrievalOrder => {
      const golden = GOLDEN_SET.profiles[profileIndex];
      return orders.get(golden?.id ?? "") ?? { ids: gatedIds, uncovered: [] };
    };

  const denseReport = measureRetrievalLeg(GOLDEN_SET, `dense ${DENSE_LEG_VERSION}`, orderOf(denseOrders));
  const bm25Report = measureRetrievalLeg(GOLDEN_SET, BM25_LEG_VERSION, orderOf(bm25Orders));
  const fusedReport = measureRetrievalLeg(GOLDEN_SET, `fused k=${RRF_K}`, orderOf(fusedOrders));
  const ranker = runMatchingEval(GOLDEN_SET).aggregate;

  const denseTop = collectTopK(GOLDEN_SET, orderOf(denseOrders), 10);
  const bm25Top = collectTopK(GOLDEN_SET, orderOf(bm25Orders), 10);
  const shared = complementarity(GOLDEN_SET, denseTop, bm25Top);

  // Calibration, not preference: what the harness says about other k values and
  // about weighting the legs differently. A fusion cannot be better than its legs
  // unless they disagree, so if a heavy weight on one leg beats the equal-weight
  // fusion, the honest reading is "this leg is not contributing yet".
  const fuse = (k: number, weights?: readonly number[]) => {
    const orders = new Map<string, RetrievalOrder>();
    for (const golden of GOLDEN_SET.profiles) {
      const fused = reciprocalRankFusion(
        [denseOrders.get(golden.id)?.ids ?? [], bm25Orders.get(golden.id)?.ids ?? []],
        weights === undefined ? { k } : { k, weights },
      );
      orders.set(golden.id, { ids: fused.map(entry => entry.id), uncovered: [] });
    }
    return measureRetrievalLeg(GOLDEN_SET, `k=${k}`, orderOf(orders));
  };
  const kSweep = [10, 30, 60, 100].map(k => ({ k, report: fuse(k) }));
  const weightSweep = [
    { weights: [1, 1] as const, label: "dense 1 · bm25 1" },
    { weights: [2, 1] as const, label: "dense 2 · bm25 1" },
    { weights: [1, 2] as const, label: "dense 1 · bm25 2" },
    { weights: [1, 3] as const, label: "dense 1 · bm25 3" },
    { weights: [0, 1] as const, label: "dense 0 · bm25 1 (BM25 alone)" },
  ].map(entry => ({ ...entry, report: fuse(RRF_K, entry.weights) }));
  const best = [...kSweep].sort((left, right) => right.report.aggregate.ndcgAt10 - left.report.aggregate.ndcgAt10)[0];

  const fusedPositions = [...fusionDetail.entries()].map(([profileId, fused]) => ({
    profileId,
    top: fused.slice(0, 3).map(entry => ({
      id: entry.id, positions: entry.positions, score: Number(entry.score.toFixed(6)),
    })),
  }));

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({
      set: { id: GOLDEN_SET.id, version: GOLDEN_SET.version, evaluatedAt: GOLDEN_SET.evaluatedAt },
      legs: {
        dense: { version: DENSE_LEG_VERSION, model: EMBEDDING_MODEL.version, report: denseReport },
        bm25: { version: BM25_LEG_VERSION, report: bm25Report },
        fused: { version: RRF_VERSION, k: RRF_K, report: fusedReport },
      },
      rankerV4: ranker,
      complementarityAt10: shared,
      kSweep: kSweep.map(entry => ({ k: entry.k, ndcgAt10: entry.report.aggregate.ndcgAt10, recallAt10: entry.report.aggregate.recallAt10 })),
      weightSweep: weightSweep.map(entry => ({
        label: entry.label, weights: entry.weights,
        ndcgAt10: entry.report.aggregate.ndcgAt10, ndcgAt5: entry.report.aggregate.ndcgAt5,
        recallAt10: entry.report.aggregate.recallAt10, mrr: entry.report.aggregate.mrr,
      })),
      bestK: best?.k ?? null,
      fusedPositions,
      latency: {
        documentsTotalMs: documentsMs,
        denseQueryTotalMs: queryMsTotal,
        bm25TotalMs: bm25MsTotal,
      },
      refusals,
    }, null, 2));
    return refusals > 0 ? 1 : 0;
  }

  for (const report of [denseReport, bm25Report, fusedReport]) {
    printReport(report);
    console.log("");
  }
  console.log(`For reference, the shipped ranker: R@5 ${format(ranker.recallAt5)} · R@10 ${format(ranker.recallAt10)}`
    + ` · NDCG@5 ${format(ranker.ndcgAt5)} · NDCG@10 ${format(ranker.ndcgAt10)} · MRR ${format(ranker.mrr)}`);
  console.log(`\nComplementarity over relevant postings in the top-10 (${shared.relevantTotal} total):`
    + ` both ${shared.foundByAll} · dense only ${shared.foundByFirstOnly} · BM25 only ${shared.foundBySecondOnly}`
    + ` · neither ${shared.foundByNeither}`);
  console.log(`k sweep (NDCG@10): ${kSweep.map(entry => `${entry.k} → ${format(entry.report.aggregate.ndcgAt10)}`).join(" · ")}`
    + ` · best by measurement: k=${best?.k ?? "n/a"} (the constant stays ${RRF_K} until a winner is clear)`);
  console.log("leg weighting (NDCG@10 / R@10): " + weightSweep
    .map(entry => `${entry.label} → ${format(entry.report.aggregate.ndcgAt10)}/${format(entry.report.aggregate.recallAt10)}`)
    .join(" · "));
  console.log(`Latency: ${documentsMs} ms to embed ${GOLDEN_SET.jobs.length} postings`
    + ` · profile query ${queryMsTotal} ms for ${GOLDEN_SET.profiles.length} profiles`
    + ` · BM25 ${bm25MsTotal} ms for all profiles (in-Node, no index)`);
  if (refusals > 0) {
    console.error(`\nLEG_REFUSED: ${refusals} profile(s) could not be ranked by the dense leg (see above).`);
    return 1;
  }
  console.log("\nRetrieval only: the fused order is not wired into the feed and has not been shown to beat"
    + " the shipped ranker — that is the switch decision (§6.4), not this measurement.");
  return 0;
}

try {
  process.exitCode = await main();
} catch (error) {
  console.error(`eval:retrieval could not run: ${error instanceof Error ? error.message : "unknown"}`);
  process.exitCode = 2;
}
