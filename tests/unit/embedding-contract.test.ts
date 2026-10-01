import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import {
  DENSE_LEG_VERSION, EMBEDDING_MODEL, EMBEDDING_TASKS, INSTRUCTION_VERSION, PROFILE_TEXT_VERSION,
  QUERY_INSTRUCTION_TEMPLATE, assertComparable, assertEmbedderOutput, cosineSimilarity,
  derivedModelVersion, embeddingCacheKey, embeddingInput, embeddingInputsFor, jobEmbeddingText,
  l2Normalize, makeEmbeddingVector, profileEmbeddingText, taskInstruction,
  EmbeddingContractError, EmbeddingVersionMismatchError,
  type EmbeddingVector,
} from "../../src/domain/embeddings.ts";
import { createFakeEmbedder, FAKE_MODEL_VERSION } from "../support/fake-embedder.ts";
import { GOLDEN_SET } from "../../src/data/matching-golden.ts";

const VERSION = EMBEDDING_MODEL.version;

function vector(values: readonly number[], overrides: Partial<EmbeddingVector> = {}): EmbeddingVector {
  return makeEmbeddingVector({
    modelVersion: overrides.modelVersion ?? VERSION,
    instructionVersion: overrides.instructionVersion ?? INSTRUCTION_VERSION,
    role: overrides.role ?? "document",
    values,
  });
}

/** Values that must not be re-normalized (e.g. a zero vector, for the cosine rule). */
function rawVector(values: readonly number[], overrides: Partial<EmbeddingVector> = {}): EmbeddingVector {
  return makeEmbeddingVector({
    modelVersion: overrides.modelVersion ?? VERSION,
    instructionVersion: overrides.instructionVersion ?? INSTRUCTION_VERSION,
    role: overrides.role ?? "document",
    values, normalized: true,
  });
}

test("embedding: the version literal is derived from the artifact, not typed by hand", () => {
  // A hash or revision edit that forgets the version string would let two
  // different artifacts look like one space; this is the test that refuses it.
  assert.equal(EMBEDDING_MODEL.version, derivedModelVersion());
  assert.equal(EMBEDDING_MODEL.version, "qwen3-embedding-0.6b-int8@c25a394d-6d0ea863");
  assert.equal(EMBEDDING_MODEL.dim, 1024);
  assert.equal(EMBEDDING_MODEL.dtype, "int8");
  assert.match(EMBEDDING_MODEL.fileSha256, /^[0-9a-f]{64}$/u);
  assert.match(EMBEDDING_MODEL.revision, /^[0-9a-f]{40}$/u);
  assert.notEqual(EMBEDDING_MODEL.fileSha256, EMBEDDING_MODEL.alternativeFileSha256);
});

test("embedding: the instruction is on the query side only, and both mistakes are refusals", () => {
  const instruction = taskInstruction("matching");
  const asQuery = embeddingInput("query", "Python developer", instruction);
  assert.equal(asQuery, QUERY_INSTRUCTION_TEMPLATE.replace("{task}", instruction).replace("{query}", "Python developer"));
  assert.ok(asQuery.startsWith(`Instruct: ${EMBEDDING_TASKS.matching}\nQuery: `));

  // The document side must not carry the instruction: that would be a different
  // vector space for the same posting.
  assert.equal(embeddingInput("document", "Python developer", null), "Python developer");

  assert.throws(() => embeddingInput("query", "Python developer", null), (error: unknown) =>
    error instanceof EmbeddingContractError && error.message === "MISSING_QUERY_INSTRUCTION");
  assert.throws(() => embeddingInput("query", "Python developer", "   "), (error: unknown) =>
    error instanceof EmbeddingContractError && error.message === "MISSING_QUERY_INSTRUCTION");
  assert.throws(() => embeddingInput("document", "Python developer", instruction), (error: unknown) =>
    error instanceof EmbeddingContractError && error.message === "INSTRUCTION_ON_DOCUMENT_SIDE");
  assert.throws(() => embeddingInput("document", "  ", null), (error: unknown) =>
    error instanceof EmbeddingContractError && error.message === "EMPTY_EMBEDDING_TEXT");
});

test("embedding: the instruction text is pinned to its version", () => {
  // Editing the wording without bumping INSTRUCTION_VERSION would leave cached
  // vectors looking comparable; the literal below is the tripwire.
  assert.equal(INSTRUCTION_VERSION, "qwen3-instruct-l1");
  assert.equal(PROFILE_TEXT_VERSION, "profile-text-l1");
  assert.equal(DENSE_LEG_VERSION, "dense-l1");
  assert.equal(EMBEDDING_TASKS.matching,
    "Given a candidate profile, retrieve job postings the candidate could take");
});

test("embedding: request order and role decide the tokenized input", () => {
  const inputs = embeddingInputsFor([
    { role: "query", text: "candidate" },
    { role: "document", text: "posting" },
  ], "matching");
  assert.equal(inputs.length, 2);
  assert.ok(inputs[0]?.includes("Instruct:"));
  assert.ok(inputs[1]?.endsWith("posting"));
  assert.ok(!inputs[1]?.includes("Instruct:"));
});

test("embedding: normalization is L2 and junk vectors are refused", () => {
  assert.deepEqual(l2Normalize([3, 4]), [0.6, 0.8]);
  assert.equal([...l2Normalize([0, 0, 5])].length, 3);
  assert.throws(() => l2Normalize([0, 0]), (error: unknown) =>
    error instanceof EmbeddingContractError && error.message === "NON_FINITE_EMBEDDING");
  assert.throws(() => l2Normalize([Number.NaN]), (error: unknown) =>
    error instanceof EmbeddingContractError && error.message === "NON_FINITE_EMBEDDING");
  assert.throws(() => vector([]), (error: unknown) =>
    error instanceof EmbeddingContractError && error.message === "EMPTY_EMBEDDING");
  assert.throws(() => vector([1, Number.POSITIVE_INFINITY]), (error: unknown) =>
    error instanceof EmbeddingContractError && error.message === "NON_FINITE_EMBEDDING");

  // normalized: true trusts the caller's vector — the storage path relies on it.
  const trusted = makeEmbeddingVector({
    modelVersion: VERSION, instructionVersion: INSTRUCTION_VERSION, role: "document",
    values: [1, 1], normalized: true,
  });
  assert.deepEqual(trusted.values, [1, 1]);
  assert.equal(trusted.dim, 2);
});

test("embedding: cosine behaves, and a dimension mismatch is a refusal", () => {
  const a = vector([1, 0]);
  const b = vector([0, 1]);
  const same = vector([2, 0]);
  assert.equal(cosineSimilarity(a, a), 1);
  assert.equal(cosineSimilarity(a, b), 0);
  assert.equal(cosineSimilarity(a, same), 1);
  assert.equal(cosineSimilarity(rawVector([0, 0]), a), 0);
  assert.throws(() => cosineSimilarity(a, vector([1, 0, 0])), (error: unknown) =>
    error instanceof EmbeddingContractError && error.message === "DIMENSION_MISMATCH");
});

test("embedding: mixing artifacts, instructions or roles is refused (fail-closed)", () => {
  const query = vector([1, 0], { role: "query" });
  const document = vector([1, 0], { role: "document" });
  assertComparable(query, [document, document]); // same space: fine
  assertComparable(query, []); // nothing to compare against is not a mismatch

  const otherModel = vector([1, 0], { role: "document", modelVersion: "fake/other" });
  assert.throws(() => assertComparable(query, [document, otherModel]), (error: unknown) =>
    error instanceof EmbeddingVersionMismatchError && error.message === "MODEL_VERSION_MISMATCH");

  const otherInstruction = vector([1, 0], { role: "document", instructionVersion: "qwen3-instruct-l2" });
  assert.throws(() => assertComparable(query, [document, otherInstruction]), (error: unknown) =>
    error instanceof EmbeddingVersionMismatchError && error.message === "INSTRUCTION_VERSION_MISMATCH");

  // Role mistakes are the silent-degradation class: a document vector used as a
  // query (or the reverse) is refused before any similarity is computed.
  assert.throws(() => assertComparable(document, [document]), (error: unknown) =>
    error instanceof EmbeddingVersionMismatchError && error.message === "QUERY_ROLE_REQUIRED");
  assert.throws(() => assertComparable(query, [query]), (error: unknown) =>
    error instanceof EmbeddingVersionMismatchError && error.message === "DOCUMENT_ROLE_REQUIRED");

  const otherDim = vector([1, 0, 0], { role: "document" });
  assert.throws(() => assertComparable(query, [otherDim]), (error: unknown) =>
    error instanceof EmbeddingVersionMismatchError && error.message === "DIMENSION_MISMATCH");
});

test("embedding: the cache key carries model, instruction and profile versions", () => {
  const base = embeddingCacheKey({ modelVersion: VERSION, instructionVersion: INSTRUCTION_VERSION, profileVersion: 3 });
  assert.equal(base, `${VERSION}|${INSTRUCTION_VERSION}|p3`);
  assert.notEqual(base, embeddingCacheKey({ modelVersion: "fake/other", instructionVersion: INSTRUCTION_VERSION, profileVersion: 3 }));
  assert.notEqual(base, embeddingCacheKey({ modelVersion: VERSION, instructionVersion: "qwen3-instruct-l2", profileVersion: 3 }));
  assert.notEqual(base, embeddingCacheKey({ modelVersion: VERSION, instructionVersion: INSTRUCTION_VERSION, profileVersion: 4 }));
  // The key is about versions, never about content.
  assert.ok(!base.includes("python"));
});

test("embedding: a lying embedder is caught before anything is stored", async () => {
  const embedder = createFakeEmbedder();
  const requests = [
    { role: "query" as const, text: "one" },
    { role: "document" as const, text: "two" },
  ];
  // What the double actually produces is the honest baseline: it must pass, or
  // the check would reject the whole offline path.
  const produced = await embedder.embed(requests, "matching");
  assert.doesNotThrow(() => assertEmbedderOutput(produced, requests, embedder));

  const [firstRequest, secondRequest] = requests;
  assert.ok(firstRequest && secondRequest);
  assert.throws(() => assertEmbedderOutput([produced[0]!], requests, embedder), (error: unknown) =>
    error instanceof EmbeddingContractError && error.message === "EMBEDDER_COUNT_MISMATCH");
  assert.throws(() => assertEmbedderOutput([produced[1]!, produced[0]!], requests, embedder), (error: unknown) =>
    error instanceof EmbeddingContractError && error.message === "EMBEDDER_ROLE_MISMATCH");
  assert.throws(() => assertEmbedderOutput([
    rawVector(produced[0]!.values, { role: "query", modelVersion: "fake/other" }), produced[1]!,
  ], requests, embedder),
  (error: unknown) => error instanceof EmbeddingContractError && error.message === "EMBEDDER_VERSION_MISMATCH");
  assert.throws(() => assertEmbedderOutput([
    produced[0]!,
    rawVector(produced[1]!.values, { modelVersion: FAKE_MODEL_VERSION, instructionVersion: "qwen3-instruct-l2" }),
  ], requests, embedder),
  (error: unknown) => error instanceof EmbeddingContractError && error.message === "EMBEDDER_INSTRUCTION_MISMATCH");
  assert.throws(() => assertEmbedderOutput([
    produced[0]!, rawVector(produced[1]!.values.slice(0, 8), { modelVersion: FAKE_MODEL_VERSION }),
  ], requests, embedder),
  (error: unknown) => error instanceof EmbeddingContractError && error.message === "EMBEDDER_DIMENSION_MISMATCH");
});

test("embedding: the posting text is title and body, never the excerpt", () => {
  const snapshot = GOLDEN_SET.jobs[0]!.snapshot;
  const text = jobEmbeddingText(snapshot);
  assert.ok(text.startsWith(snapshot.title));
  assert.ok(text.includes(snapshot.description_text));
  assert.ok(text.length > snapshot.description_text.length);
});

test("embedding: the profile text carries the profile contract fields and nothing else", () => {
  const golden = GOLDEN_SET.profiles[0]!;
  const text = profileEmbeddingText(golden.profile);
  assert.ok(text.includes(golden.profile.targetRoles[0]!));
  assert.ok(text.includes(golden.profile.skills[0]!));
  assert.ok(text.includes(`Residence country: ${golden.profile.residenceCountry}`));
  assert.ok(!text.includes(golden.id));
  // Same input, same text: the query vector must be reproducible.
  assert.equal(text, profileEmbeddingText(golden.profile));
  // A profile with nothing in it is a caller error, not an empty query.
  assert.throws(() => profileEmbeddingText({
    residenceCountry: null, timezone: null, targetRoles: [], skills: [], employmentTypes: [],
    availabilityWindows: [], zeroMandatoryAttendance: false, minimumCompensation: null, showNeedsReview: false,
  }), (error: unknown) => error instanceof EmbeddingContractError && error.message === "EMPTY_PROFILE_TEXT");
});

test("embedding: the deterministic double is a test double and stays one", async () => {
  const embedder = createFakeEmbedder();
  assert.equal(embedder.modelVersion, FAKE_MODEL_VERSION);
  assert.ok(embedder.modelVersion.startsWith("fake/"));
  assert.equal(embedder.dim, EMBEDDING_MODEL.dim);
  const same = await embedder.embed([{ role: "document", text: "python developer" }], "matching");
  const again = await embedder.embed([{ role: "document", text: "python developer" }], "matching");
  assert.deepEqual(same, again); // deterministic across calls
  const other = await embedder.embed([{ role: "document", text: "welder" }], "matching");
  assert.equal(cosineSimilarity(same[0]!, same[0]!), 1);
  assert.ok(cosineSimilarity(same[0]!, other[0]!) < 0.5);

  // A query embedded through the fake still carries the instruction: the double
  // must exercise the same input-building path as the real adapter.
  const asQuery = await embedder.embed([{ role: "query", text: "python developer" }], "matching");
  assert.notDeepEqual(asQuery[0]!.values, same[0]!.values);
});

test("embedding: no production module imports the fake embedder", async () => {
  // The double lives in tests/support on purpose; if it ever appears under src/,
  // a fake could be wired into a product path. This walks the real tree inside an
  // explicit boundary: anything resolving outside src/ is a bug in the walk.
  const srcRoot = path.resolve(process.cwd(), "src");
  const offenders: string[] = [];
  async function walk(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const candidate = path.resolve(directory, entry.name);
      if (candidate !== srcRoot && !candidate.startsWith(srcRoot + path.sep)) {
        throw new Error("WALK_ESCAPES_SOURCE_ROOT");
      }
      if (entry.isDirectory()) { await walk(candidate); continue; }
      if (!/\.(?:ts|tsx)$/u.test(entry.name)) continue;
      const text = await readFile(candidate, "utf8");
      // An actual import, not a mention in a comment: the contract module names
      // this double in prose on purpose.
      if (/(?:from|import)\s*\(?\s*["'][^"']*fake-embedder/u.test(text)) {
        offenders.push(path.relative(srcRoot, candidate));
      }
    }
  }
  await walk(srcRoot);
  assert.deepEqual(offenders, []);
});
