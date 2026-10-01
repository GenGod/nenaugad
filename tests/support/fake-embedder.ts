// A deterministic stand-in for the embedding model — a TEST DOUBLE, not a model.
//
// Why it exists: `npm run check:offline` must pass on a checkout without the
// 600 MB artifact and without the runtime package (decision §6.3), and the
// integration tests need vectors to store, compare and delete. It is a hashed
// bag of tokens: same text -> same vector, shared vocabulary -> higher cosine,
// no vocabulary -> near zero. That is enough to test plumbing, privacy and
// version handling — and nothing else.
//
// What it must never be used for: quality numbers. It has no cross-lingual
// ability at all (its tokens are literal), so a dense measurement taken with it
// says nothing about a real model. Its modelVersion is prefixed `fake/` and can
// never be confused with the artifact's version, and nothing under src/ imports
// this file (tests/unit/embedding-contract.test.ts asserts that).
import {
  INSTRUCTION_VERSION, embeddingInputsFor, makeEmbeddingVector,
  type Embedder, type EmbeddingRequest, type EmbeddingTask, type EmbeddingVector,
} from "../../src/domain/embeddings.ts";

export const FAKE_MODEL_VERSION = "fake/deterministic-bag-of-tokens-v1";

const FAKE_DIM = 1024;

/** FNV-1a over code points; stable across runs and platforms. */
function hashToken(token: string): number {
  let hash = 0x811c9dc5;
  for (const character of token) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

function tokenize(text: string): readonly string[] {
  return text.toLowerCase().split(/[^\p{L}\p{N}+#.]+/u).filter(token => token.length > 0);
}

function encode(text: string): readonly number[] {
  const values = new Array<number>(FAKE_DIM).fill(0);
  for (const token of tokenize(text)) {
    const hash = hashToken(token);
    const index = hash % FAKE_DIM;
    // Sign hashing: unrelated tokens cancel instead of all pulling one way, which
    // keeps two unrelated texts near zero rather than near one.
    const sign = (hash >>> 16) % 2 === 0 ? 1 : -1;
    values[index] = (values[index] ?? 0) + sign;
  }
  return values;
}

export function createFakeEmbedder(overrides: Partial<Pick<Embedder, "modelVersion" | "instructionVersion" | "dim">> = {}): Embedder {
  const modelVersion = overrides.modelVersion ?? FAKE_MODEL_VERSION;
  const instructionVersion = overrides.instructionVersion ?? INSTRUCTION_VERSION;
  const dim = overrides.dim ?? FAKE_DIM;
  return {
    modelVersion,
    instructionVersion,
    dim,
    async embed(requests: readonly EmbeddingRequest[], task: EmbeddingTask): Promise<readonly EmbeddingVector[]> {
      const texts = embeddingInputsFor(requests, task);
      return texts.map((text, index) => {
        const values = encode(text);
        return makeEmbeddingVector({
          modelVersion,
          instructionVersion,
          role: requests[index]?.role ?? "document",
          values: dim === FAKE_DIM ? values : values.slice(0, dim),
        });
      });
    },
  };
}
