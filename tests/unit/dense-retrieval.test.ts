import test from "node:test";
import assert from "node:assert/strict";
import { denseRetrieve, describeDenseRanking, type DenseCandidate } from "../../src/domain/dense-retrieval.ts";
import { EMBEDDING_MODEL, INSTRUCTION_VERSION, makeEmbeddingVector, type EmbeddingVector } from "../../src/domain/embeddings.ts";
import { createFakeEmbedder } from "../support/fake-embedder.ts";

const VERSION = EMBEDDING_MODEL.version;

function document(values: readonly number[], overrides: Partial<EmbeddingVector> = {}): EmbeddingVector {
  return makeEmbeddingVector({
    modelVersion: overrides.modelVersion ?? VERSION,
    instructionVersion: overrides.instructionVersion ?? INSTRUCTION_VERSION,
    role: "document",
    values,
  });
}

const query = makeEmbeddingVector({
  modelVersion: VERSION, instructionVersion: INSTRUCTION_VERSION, role: "query", values: [1, 0],
});

test("dense: candidates are ordered by cosine similarity to the query", () => {
  const candidates: DenseCandidate[] = [
    { id: "gamma", embedding: document([0, 1]) },
    { id: "alpha", embedding: document([1, 0]) },
    { id: "beta", embedding: document([1, 1]) },
  ];
  const ranking = denseRetrieve(query, candidates);
  assert.deepEqual(ranking.ranked.map(entry => entry.id), ["alpha", "beta", "gamma"]);
  assert.equal(ranking.ranked[0]?.similarity, 1);
  assert.equal(ranking.ranked[2]?.similarity, 0);
  assert.deepEqual(ranking.refusals, []);
  assert.deepEqual(ranking.uncovered, []);
});

test("dense: equal similarity breaks on id, so the same inputs give the same order", () => {
  const candidates: DenseCandidate[] = [
    { id: "z", embedding: document([1, 0]) },
    { id: "a", embedding: document([2, 0]) },
  ];
  const first = denseRetrieve(query, candidates);
  const second = denseRetrieve(query, [...candidates].reverse());
  assert.deepEqual(first.ranked.map(entry => entry.id), ["a", "z"]);
  // Byte-identical, not merely equivalent: the A1 harness compares two runs.
  assert.equal(JSON.stringify(first), JSON.stringify(second));
});

test("dense: a posting without a vector is uncovered, not suspicious and not fatal", () => {
  const candidates: DenseCandidate[] = [
    { id: "covered", embedding: document([1, 0]) },
    { id: "not-yet-indexed" },
    { id: "explicitly-null", embedding: null },
  ];
  const ranking = denseRetrieve(query, candidates);
  assert.deepEqual(ranking.ranked.map(entry => entry.id), ["covered"]);
  assert.deepEqual(ranking.uncovered, ["not-yet-indexed", "explicitly-null"]);
  assert.deepEqual(ranking.refusals, []);
});

test("dense: one foreign vector disables the leg instead of mixing two spaces", () => {
  const candidates: DenseCandidate[] = [
    { id: "old-model", embedding: document([1, 0], { modelVersion: "fake/older" }) },
    { id: "current", embedding: document([1, 0]) },
  ];
  const ranking = denseRetrieve(query, candidates);
  assert.deepEqual(ranking.ranked, []);
  assert.deepEqual(ranking.refusals, [{ code: "MODEL_VERSION_MISMATCH", candidates: 2 }]);
  assert.deepEqual(ranking.uncovered, []);

  const otherInstruction: DenseCandidate[] = [
    { id: "old-instruction", embedding: document([1, 0], { instructionVersion: "qwen3-instruct-l2" }) },
  ];
  assert.equal(denseRetrieve(query, otherInstruction).refusals[0]?.code, "INSTRUCTION_VERSION_MISMATCH");
});

test("dense: a document vector cannot be used as the query", () => {
  const ranking = denseRetrieve(document([1, 0]), [{ id: "any", embedding: document([1, 0]) }]);
  assert.deepEqual(ranking.ranked, []);
  assert.equal(ranking.refusals[0]?.code, "QUERY_ROLE_REQUIRED");
});

test("dense: the limit keeps the best positions and covers no new ones", () => {
  const candidates: DenseCandidate[] = [
    { id: "a", embedding: document([1, 0]) },
    { id: "b", embedding: document([1, 1]) },
    { id: "c", embedding: document([0, 1]) },
    { id: "d" },
  ];
  const ranking = denseRetrieve(query, candidates, 2);
  assert.deepEqual(ranking.ranked.map(entry => entry.id), ["a", "b"]);
  assert.deepEqual(ranking.uncovered, ["d"]);
});

test("dense: the operator line carries counts and codes, never ids", () => {
  const ranking = denseRetrieve(query, [
    { id: "himalayas:private-posting", embedding: document([1, 0]) },
    { id: "not-indexed" },
  ]);
  const line = describeDenseRanking(ranking);
  assert.equal(line, "dense: ranked=1 uncovered=1");
  assert.ok(!line.includes("himalayas:private-posting"));

  const refused = describeDenseRanking(denseRetrieve(query, [
    { id: "x", embedding: document([1, 0], { modelVersion: "fake/older" }) },
  ]));
  assert.equal(refused, "dense: ranked=0 uncovered=0 refused=MODEL_VERSION_MISMATCH");
});

test("dense: through the deterministic double, the closest text wins", async () => {
  const embedder = createFakeEmbedder();
  const [asQuery] = await embedder.embed(
    [{ role: "query", text: "senior python developer remote" }], "matching",
  );
  const documents = await embedder.embed([
    { role: "document", text: "senior python developer, remote, async team" },
    { role: "document", text: "welder for an oil platform" },
    { role: "document", text: "python developer" },
  ], "matching");
  const ranking = denseRetrieve(asQuery!, [
    { id: "welder", embedding: documents[1] },
    { id: "python-short", embedding: documents[2] },
    { id: "python-close", embedding: documents[0] },
  ]);
  assert.equal(ranking.ranked[0]?.id, "python-close");
  assert.equal(ranking.ranked.at(-1)?.id, "welder");
});
