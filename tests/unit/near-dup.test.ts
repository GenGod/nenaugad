import assert from "node:assert/strict";
import { test } from "node:test";
import { makeEmbeddingVector, type EmbeddingVector } from "../../src/domain/embeddings.ts";
import {
  NEAR_DUP_THRESHOLDS,
  nearDuplicateCandidates,
  textNeighbours,
  type NearDupItem,
} from "../../src/domain/near-dup.ts";

// B5 (design item B5): the rule that turns pairwise cosines into a REVIEW queue.
// These tests pin the rule's semantics with hand-built vectors; the thresholds
// themselves were measured with the real artifact (see the measurement block in
// src/domain/near-dup.ts) and the real-model behaviour is re-measured by hand
// when the artifact changes (docs/EMBEDDING_PLAYBOOK.md).

const MODEL = "unit-test-model-v1";
const INSTRUCTION = "unit-test-instruction-v1";

/**
 * A unit vector whose cosine with the base [1, 0] is exactly `cosine` — every
 * scenario below is relative to one base item, so these numbers are the cosines
 * the rule actually compares (no accidental coupling between the others).
 */
function unit(cosine: number, modelVersion = MODEL): EmbeddingVector {
  return makeEmbeddingVector({
    modelVersion, instructionVersion: INSTRUCTION, role: "document",
    values: [cosine, Math.sqrt(1 - cosine * cosine)],
  });
}

function item(id: string, options: Readonly<{
  textCosine: number;
  titleCosine: number;
  companyKey?: string;
  sourceId?: string;
  dedupKey?: string;
  geographyKey?: string;
  modelVersion?: string;
}>): NearDupItem {
  return {
    id,
    sourceId: options.sourceId ?? "himalayas",
    companyKey: options.companyKey ?? "meridian labs",
    dedupKey: options.dedupKey ?? `key-${id}`,
    geographyKey: options.geographyKey ?? "worldwide:",
    text: unit(options.textCosine, options.modelVersion),
    title: unit(options.titleCosine, options.modelVersion),
  };
}

function assertClose(actual: number | undefined, expected: number, what: string): void {
  assert.ok(actual !== undefined, `${what} is present`);
  assert.ok(Math.abs(actual - expected) < 1e-9, `${what}: ${actual} vs ${expected}`);
}

test("V4 half 1: a translated posting lands in the queue", () => {
  // The measured EN/RU pair: text 0.811, titles 0.846.
  const a = item("en", { textCosine: 1, titleCosine: 1 });
  const b = item("ru", { textCosine: 0.811, titleCosine: 0.846, sourceId: "jobicy" });
  const queue = nearDuplicateCandidates([a, b]);
  assert.equal(queue.length, 1);
  const pair = queue[0];
  assert.ok(pair);
  assert.deepEqual([pair.a, pair.b], ["en", "ru"]);
  assertClose(pair.textCosine, 0.811, "text cosine");
  assertClose(pair.titleCosine, 0.846, "title cosine");
  assert.equal(pair.sameCompany, true);
  assert.equal(pair.sameSource, false);
});

test("V4 half 2: another role at the same company does not reach the queue", () => {
  // The measured pair: text 0.582, titles 0.731 — both below their threshold.
  const a = item("engineer", { textCosine: 1, titleCosine: 1 });
  const b = item("designer", { textCosine: 0.582, titleCosine: 0.731 });
  assert.deepEqual(nearDuplicateCandidates([a, b]), []);
  assert.deepEqual(textNeighbours([a, b], NEAR_DUP_THRESHOLDS.textCosine), []);
});

test("the title gate keeps boilerplate-heavy different roles out of the queue", () => {
  // Same employer, shared remote/benefits boilerplate: the text cosine alone
  // would queue the pair (0.75 clears the text threshold) — the title cosine
  // (0.70) is what says "these are different jobs".
  const a = item("engineer", { textCosine: 1, titleCosine: 1 });
  const b = item("designer", { textCosine: 0.75, titleCosine: 0.70 });
  assert.equal(textNeighbours([a, b], NEAR_DUP_THRESHOLDS.textCosine).length, 1);
  assert.deepEqual(nearDuplicateCandidates([a, b]), []);
});

test("the text gate keeps same-title templates at other companies out", () => {
  // The mirrored failure: identical titles (cosine 1) with unrelated texts —
  // a shared job title is not a duplicate.
  const a = item("backend-a", { textCosine: 1, titleCosine: 1 });
  const b = item("backend-b", { textCosine: 0.55, titleCosine: 1, companyKey: "northwind data" });
  assert.deepEqual(nearDuplicateCandidates([a, b]), []);
});

test("thresholds are inclusive at the boundary", () => {
  const a = item("base", { textCosine: 1, titleCosine: 1 });
  const b = item("edge", {
    textCosine: NEAR_DUP_THRESHOLDS.textCosine,
    titleCosine: NEAR_DUP_THRESHOLDS.titleCosine,
  });
  assert.equal(nearDuplicateCandidates([a, b]).length, 1);
});

test("exact duplicates (equal A4 key) never enter the queue", () => {
  // A4 already groups these into one card; the near-dup queue is for what A4
  // cannot see. The pair is visible to the cheap pass, which makes the skip a
  // property of the rule and not of the caller.
  const a = item("source-a-record", { textCosine: 1, titleCosine: 1, dedupKey: "same" });
  const b = item("source-b-record", { textCosine: 1, titleCosine: 1, dedupKey: "same", sourceId: "jobicy" });
  assert.equal(textNeighbours([a, b], NEAR_DUP_THRESHOLDS.textCosine).length, 1);
  assert.deepEqual(nearDuplicateCandidates([a, b]), []);
});

test("a different hiring scope is a different opportunity, however close the text", () => {
  // The live-catalog case that shaped this rule: "Python | UK" vs "Python | USA"
  // at one company, text cosine 0.94 — the same posting title under a different
  // hiring scope. A4 treats geography as identity; merging across it would
  // silently widen eligibility, so the queue must not even ask.
  const a = item("uk", { textCosine: 1, titleCosine: 1, geographyKey: "countries:GB" });
  const b = item("usa", { textCosine: 0.94, titleCosine: 0.94, geographyKey: "countries:US" });
  assert.equal(textNeighbours([a, b], NEAR_DUP_THRESHOLDS.textCosine).length, 1);
  assert.deepEqual(nearDuplicateCandidates([a, b]), []);
  // "Unspecified" is its own key and never matches a specified scope, exactly as
  // in A4 — the price of the veto, recorded in the module header.
  const c = item("unspecified", { textCosine: 1, titleCosine: 1, geographyKey: "unspecified" });
  assert.deepEqual(nearDuplicateCandidates([a, c]), []);
});

test("an empty company key never counts as 'same company'", () => {
  const a = item("x", { textCosine: 1, titleCosine: 1, companyKey: "" });
  const b = item("y", { textCosine: 0.9, titleCosine: 0.9, companyKey: "" });
  const pair = nearDuplicateCandidates([a, b])[0];
  assert.ok(pair);
  assert.equal(pair.sameCompany, false);
});

test("the queue is deterministic: best first, then by id, independent of input order", () => {
  const a = item("a", { textCosine: 1, titleCosine: 1 });
  const b = item("b", { textCosine: 0.9, titleCosine: 0.9 });
  const c = item("c", { textCosine: 0.8, titleCosine: 0.8 });
  const forward = nearDuplicateCandidates([a, b, c]);
  const backward = nearDuplicateCandidates([c, b, a]);
  const ids = (pairs: readonly { a: string; b: string }[]) => pairs.map(pair => [pair.a, pair.b]);
  assert.deepEqual(ids(forward), ids(backward));
  // b-c sits highest: its own cosine is dot(unit(0.9), unit(0.8)) > 0.9.
  assert.deepEqual(ids(forward)[0], ["b", "c"]);
  for (let index = 1; index < forward.length; index += 1) {
    assert.ok((forward[index - 1]?.textCosine ?? 0) >= (forward[index]?.textCosine ?? 0));
  }
});

test("vectors from two artifacts are refused, not compared", () => {
  const a = item("a", { textCosine: 1, titleCosine: 1 });
  const b = item("b", { textCosine: 1, titleCosine: 1, modelVersion: "other-model-v2" });
  assert.throws(() => nearDuplicateCandidates([a, b]), /MODEL_VERSION_MISMATCH/u);
});

test("a query vector is refused: the rule compares documents", () => {
  const a = item("a", { textCosine: 1, titleCosine: 1 });
  const queryish: NearDupItem = {
    ...a,
    id: "query",
    text: makeEmbeddingVector({
      modelVersion: MODEL, instructionVersion: INSTRUCTION, role: "query", values: [1, 0],
    }),
  };
  assert.throws(() => nearDuplicateCandidates([a, queryish]), /DOCUMENT_ROLE_REQUIRED/u);
});

test("an empty or single-item catalog produces an empty queue", () => {
  assert.deepEqual(nearDuplicateCandidates([]), []);
  assert.deepEqual(nearDuplicateCandidates([item("only", { textCosine: 1, titleCosine: 1 })]), []);
});
