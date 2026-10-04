// Near-duplicate candidate queue over stored posting vectors (design item B5).
//
//   npm run dedup:candidates                        — the review queue, best-first
//   npm run dedup:candidates -- --limit=50 --min-text=0.7 --min-title=0.75
//
// Why a human list and not a merge: the brief is explicit — candidates go to a
// confirmation queue (an LLM behind it is C5; until then a manual review), and
// nothing is merged or hidden automatically. A wrong merge hides a real second
// job; a wrongly queued pair costs a reviewer a minute. This command touches no
// product path, writes nothing to the database, and changes no card.
//
// What it prints: titles and company names — public catalog metadata, the same
// fields the catalog shows — plus ids, sources and cosine scores. Description
// text is never printed; nobody's personal data is involved.
//
// `process_with_ml` is asked per source at the point of use: postings of a
// source whose permission is not "allowed" now are skipped whole (their titles
// are not embedded) and the source is reported with its outcome, the same rule
// the dense leg follows.
//
// Title vectors are embedded lazily: the cheap text-only pass runs first, and
// only postings that appear in a text neighbourhood get a title vector — the
// common case is a handful of postings, not the whole catalog.
import { localDatabaseUrl, readConfig, ConfigurationError } from "../src/server/config.ts";
import { localPool, migrate } from "./db.ts";
import { dedupKey, geographyKey, normalizeCompany } from "../src/domain/dedup.ts";
import type { EmbeddingVector } from "../src/domain/embeddings.ts";
import {
  NEAR_DUP_THRESHOLDS, NEAR_DUP_VERSION, nearDuplicateCandidates, textNeighbours,
  type NearDupItem, type TextVectorItem,
} from "../src/domain/near-dup.ts";
import { loadEmbeddedPostings, type EmbeddedPosting } from "../src/server/embeddings/embedding-service.ts";
import { loadLocalEmbedder } from "../src/server/embeddings/local-embedder.ts";
import { getSourcePolicy, permissionFor } from "../src/server/source-policies.ts";

function numericArg(name: string, fallback: number, max: number): number {
  const arg = process.argv.find(argument => argument.startsWith(`--${name}=`));
  if (!arg) return fallback;
  const parsed = Number(arg.slice(name.length + 3));
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > max) {
    console.error(`--${name} must be a number in (0, ${max}]`);
    process.exit(2);
  }
  return parsed;
}

try {
  readConfig(process.env);
  const pool = localPool(localDatabaseUrl(process.env.DATABASE_URL));
  await migrate(pool);
  const now = new Date().toISOString();
  const thresholds = {
    textCosine: numericArg("min-text", NEAR_DUP_THRESHOLDS.textCosine, 1),
    titleCosine: numericArg("min-title", NEAR_DUP_THRESHOLDS.titleCosine, 1),
  };
  const limit = Math.floor(numericArg("limit", 50, 10_000));

  // The model is loaded after the cheap arguments, before any text is embedded.
  const embedder = await loadLocalEmbedder();
  const postings = await loadEmbeddedPostings(pool, {
    modelVersion: embedder.modelVersion,
    instructionVersion: embedder.instructionVersion,
  });

  const allowed: EmbeddedPosting[] = [];
  const skipped = new Map<string, number>();
  for (const posting of postings) {
    const policy = getSourcePolicy(posting.sourceId);
    const outcome = policy === undefined ? "unknown_source" : permissionFor(policy, "process_with_ml", now);
    if (outcome === "allowed") {
      allowed.push(posting);
    } else {
      const key = `${posting.sourceId}: ${outcome}`;
      skipped.set(key, (skipped.get(key) ?? 0) + 1);
    }
  }

  const textItems: TextVectorItem[] = allowed.map(posting => ({
    id: posting.snapshotId,
    text: posting.vector,
  }));
  const neighbours = textNeighbours(textItems, thresholds.textCosine);
  const involved = new Set<string>();
  for (const neighbour of neighbours) {
    involved.add(neighbour.a);
    involved.add(neighbour.b);
  }

  // Title vectors, only for postings a text neighbourhood named.
  const byId = new Map(allowed.map(posting => [posting.snapshotId, posting]));
  const titleVectors = new Map<string, EmbeddingVector>();
  const involvedPostings = [...involved].map(id => byId.get(id)).filter(posting => posting !== undefined);
  if (involvedPostings.length > 0) {
    const vectors = await embedder.embed(
      involvedPostings.map(posting => ({ role: "document", text: posting.snapshot.title })),
      "matching",
    );
    involvedPostings.forEach((posting, index) => {
      const vector = vectors[index];
      if (vector) titleVectors.set(posting.snapshotId, vector);
    });
  }

  const queueItems: NearDupItem[] = involvedPostings.flatMap(posting => {
    const title = titleVectors.get(posting.snapshotId);
    return title === undefined ? [] : [{
      id: posting.snapshotId,
      text: posting.vector,
      title,
      sourceId: posting.sourceId,
      companyKey: normalizeCompany(posting.snapshot.company_name),
      dedupKey: dedupKey(posting.snapshot),
      geographyKey: geographyKey(posting.snapshot),
    }];
  });
  const queue = nearDuplicateCandidates(queueItems, thresholds);

  const describe = (id: string) => {
    const posting = byId.get(id);
    if (!posting) return { id, title: null, company: null, source: null };
    return {
      id,
      title: posting.snapshot.title,
      company: posting.snapshot.company_name,
      source: posting.sourceId,
    };
  };
  const exactPairsAmongNeighbours = neighbours.filter(neighbour => {
    const a = byId.get(neighbour.a);
    const b = byId.get(neighbour.b);
    return a !== undefined && b !== undefined && dedupKey(a.snapshot) === dedupKey(b.snapshot);
  }).length;

  console.log(JSON.stringify({
    ok: true,
    rule: NEAR_DUP_VERSION,
    modelVersion: embedder.modelVersion,
    instructionVersion: embedder.instructionVersion,
    thresholds,
    postings: {
      withVectors: postings.length,
      checked: allowed.length,
      skippedBySource: [...skipped.entries()].map(([key, count]) => ({ source: key, postings: count })),
    },
    pairsAboveTextThreshold: neighbours.length,
    exactDuplicatePairsSkipped: exactPairsAmongNeighbours,
    candidates: queue.length,
    pairs: queue.slice(0, limit).map(pair => ({
      a: describe(pair.a),
      b: describe(pair.b),
      textCosine: Number(pair.textCosine.toFixed(4)),
      titleCosine: Number(pair.titleCosine.toFixed(4)),
      sameCompany: pair.sameCompany,
      sameSource: pair.sameSource,
    })),
    note: "a review list, not a merge: no card changes and nothing is hidden;"
      + " a pair is a question for a human (an LLM confirmation behind this queue is C5)",
  }));
  await pool.end();
} catch (error) {
  const code = error instanceof ConfigurationError ? error.message : "DEDUP_CANDIDATES_FAILED";
  console.error(JSON.stringify({
    ok: false,
    code,
    detail: error instanceof Error && !(error instanceof ConfigurationError) ? error.message : null,
  }));
  process.exitCode = 1;
}
