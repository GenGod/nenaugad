// Dense search for one profile (design item B1).
//
// The vertical slice B2 will fuse with BM25: gate-approved candidates in, a
// position list out. It exists today and is tested today even though the feed is
// not ordered by it — the same shadow-first discipline as A9, and it is what
// makes the privacy and version rules testable against a live database rather
// than only in memory.
//
// The profile vector is cached by (model_version, instruction_version,
// profile_text_version, profile_version) — decision §6.5: a change in any of the
// three versions must not serve a stale vector, and a profile edit is a new
// version, so an edited profile is re-embedded on its next request.
//
// Permission is asked per source, at the point of use: the postings of a source
// whose `process_with_ml` is not "allowed" have no dense representation at all,
// and the leg returns nothing rather than something partial.
import type { Pool } from "pg";
import { denseRetrieve, type DenseRanking } from "../../domain/dense-retrieval.ts";
import {
  PROFILE_TEXT_VERSION, profileEmbeddingText, type Embedder,
} from "../../domain/embeddings.ts";
import type { ManualProfileInput } from "../../domain/profile.ts";
import { getSourcePolicy, permissionFor } from "../source-policies.ts";
import { loadJobEmbeddings, loadProfileEmbedding, saveProfileEmbedding } from "./embedding-service.ts";

export type DenseSearchResult = Readonly<{
  sourceId: string;
  outcome: "ok" | "no_permission" | "unknown_source";
  ranking: DenseRanking;
  /**
   * Whether the profile vector had to be computed now. Reported because the
   * first request after a profile edit is the expensive one, and the latency
   * budget (A9: p95 <= 250 ms) is checked with that in mind.
   */
  embeddedQuery: boolean;
}>;

const EMPTY_RANKING: DenseRanking = { ranked: [], uncovered: [], refusals: [] };

export async function denseSearchForProfile(params: Readonly<{
  pool: Pool;
  sourceId: string;
  userId: string;
  profileVersion: number;
  profile: ManualProfileInput;
  /** Ids the caller already gated — the dense leg never widens the pool. */
  candidateIds: readonly string[];
  embedder: Embedder;
  now: string;
  limit?: number;
}>): Promise<DenseSearchResult> {
  const { pool, sourceId, userId, profileVersion, profile, candidateIds, embedder, now, limit } = params;
  const policy = getSourcePolicy(sourceId);
  if (!policy) return { sourceId, outcome: "unknown_source", ranking: EMPTY_RANKING, embeddedQuery: false };
  if (permissionFor(policy, "process_with_ml", now) !== "allowed") {
    return { sourceId, outcome: "no_permission", ranking: EMPTY_RANKING, embeddedQuery: false };
  }

  let embeddedQuery = false;
  let query = await loadProfileEmbedding(pool, {
    userId, profileVersion,
    modelVersion: embedder.modelVersion,
    instructionVersion: embedder.instructionVersion,
    profileTextVersion: PROFILE_TEXT_VERSION,
  });
  if (!query) {
    const [vector] = await embedder.embed(
      [{ role: "query", text: profileEmbeddingText(profile) }], "matching",
    );
    if (!vector) throw new Error("EMBEDDER_EMPTY_RESULT");
    query = vector;
    await saveProfileEmbedding(pool, { userId, profileVersion, profileTextVersion: PROFILE_TEXT_VERSION, vector });
    embeddedQuery = true;
  }

  const embeddings = await loadJobEmbeddings({
    pool, snapshotIds: candidateIds, modelVersion: embedder.modelVersion,
    instructionVersion: embedder.instructionVersion,
  });
  const candidates = candidateIds.map(id => ({ id, embedding: embeddings.get(id) ?? null }));
  return { sourceId, outcome: "ok", ranking: denseRetrieve(query, candidates, limit), embeddedQuery };
}
