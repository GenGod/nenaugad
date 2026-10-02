// Local embedding model adapter (design item B1, owner decision 2026-09-30 §6.2/§6.3).
//
// The model runs on this machine only. Text never leaves the process, there is no
// provider call and no API key anywhere on this path — that is the whole reason
// the reference artifact is a local ONNX export and not an embedding API.
//
// Three properties are enforced here and each exists for a failure it prevents:
//
//   * NOTHING IS DOWNLOADED AT RUN TIME. Remote model loading is switched off
//     and the weights are read from a local directory that scripts/models-fetch.ts
//     filled, hash-verified. A missing artifact is a clear refusal, never a silent
//     fetch from the network in the middle of a request.
//   * THE LAYER IS INERT WITHOUT THE MODEL. The runtime package is imported
//     dynamically and the files are checked first, so a checkout without the
//     600 MB artifact still passes `npm run check` and still serves the feed.
//   * POOLING AND NORMALIZATION ARE OURS, not the pipeline default. Qwen3-
//     Embedding is a decoder used as an embedder: the sentence vector is the last
//     non-padding token (contract: EMBEDDING_MODEL.pooling). A convenience
//     pipeline would mean-pool and silently produce a different space.
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  EMBEDDING_MODEL, INSTRUCTION_VERSION, embeddingInputsFor, l2Normalize, makeEmbeddingVector,
  type Embedder, type EmbeddingRequest, type EmbeddingTask, type EmbeddingVector,
} from "../../domain/embeddings.ts";

export class LocalEmbedderError extends Error {
  constructor(code: string) {
    super(code); // Codes only: never a path, never model text.
    this.name = "LocalEmbedderError";
  }
}

/** Repository root, resolved from this file, not from the working directory. */
const REPO_ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");

/** Where scripts/models-fetch.ts puts the verified artifact. */
export const MODEL_ROOT = path.join(REPO_ROOT, "models");
export const MODEL_DIRECTORY = path.join(MODEL_ROOT, EMBEDDING_MODEL.repository);
export const MODEL_FILE_PATH = path.join(MODEL_DIRECTORY, EMBEDDING_MODEL.file);

/**
 * Documents are embedded ONE at a time. Measured on the target machine
 * (2026-09-30, i5-13450HX, int8, texts of 2002 tokens):
 *
 *   batch 8 → 39 s per pass, RSS 14.5 → 20 GB and still climbing
 *   batch 1 → 4.1-5.5 s per pass, RSS steady around 3 GB
 *
 * Two facts explain it, and neither is a setting we can tune away: the ONNX
 * graph materializes the KV cache of all 28 layers (`present.*`) on every pass
 * even though an embedding never uses it (~4.6 GB per batch-8 pass at that
 * length), and padding to the longest sequence makes a batch's work grow like
 * batch × maxLen². At real posting lengths batching therefore buys no throughput
 * at all — only memory. Short inputs (a query, a title) pay little for padding,
 * so this constant is the one place to revisit if the leg ever embeds many short
 * texts at once.
 *
 * Consequence, stated plainly: a full re-index of the ~700-posting catalog costs
 * roughly half an hour of CPU on this machine, which is why `--limit` exists in
 * the CLI and why indexing is resumable by construction (only changed postings
 * are embedded again).
 */
const BATCH_SIZE = 1;

export function modelDirectoryFor(repository: string): string {
  return path.join(MODEL_ROOT, repository);
}

async function assertArtifactPresent(): Promise<void> {
  try {
    const info = await stat(MODEL_FILE_PATH);
    if (!info.isFile()) throw new LocalEmbedderError("EMBEDDING_MODEL_NOT_A_FILE");
  } catch (error) {
    if (error instanceof LocalEmbedderError) throw error;
    throw new LocalEmbedderError("EMBEDDING_MODEL_NOT_FOUND");
  }
}

/** Minimal shapes of what the runtime package returns; no `any` crosses this line. */
type TensorLike = Readonly<{ dims: readonly number[]; data: ArrayLike<number | bigint> }>;
type ModelOutput = Readonly<{ last_hidden_state?: TensorLike }>;

/**
 * Loads the artifact from disk. The dynamic import is deliberate: a checkout
 * without `@huggingface/transformers` installed must still type-check, lint, run
 * the offline suite and serve the product.
 */
export async function loadLocalEmbedder(): Promise<Embedder> {
  await assertArtifactPresent();
  let transformers: {
    env: { allowRemoteModels: boolean; allowLocalModels: boolean; localModelPath: string };
    AutoTokenizer: { from_pretrained: (id: string, options: Record<string, unknown>) => Promise<TokenizerLike> };
    AutoModel: { from_pretrained: (id: string, options: Record<string, unknown>) => Promise<ModelLike> };
  };
  try {
    transformers = await import("@huggingface/transformers") as unknown as typeof transformers;
  } catch {
    throw new LocalEmbedderError("EMBEDDING_RUNTIME_NOT_INSTALLED");
  }
  // Off by default upstream and off explicitly here: the artifact is local.
  transformers.env.allowRemoteModels = false;
  transformers.env.allowLocalModels = true;
  transformers.env.localModelPath = MODEL_ROOT;
  const loadOptions = { dtype: EMBEDDING_MODEL.dtype, local_files_only: true } as Record<string, unknown>;
  try {
    const tokenizer = await transformers.AutoTokenizer.from_pretrained(EMBEDDING_MODEL.repository, loadOptions);
    const model = await transformers.AutoModel.from_pretrained(EMBEDDING_MODEL.repository, loadOptions);
    return createEmbedder(tokenizer, model);
  } catch (error) {
    if (error instanceof LocalEmbedderError) throw error;
    throw new LocalEmbedderError("EMBEDDING_MODEL_LOAD_FAILED");
  }
}

type TokenizerLike = (text: string[], options: Record<string, unknown>) => Promise<{
  attention_mask: TensorLike;
  [key: string]: unknown;
}>;
type ModelLike = (inputs: Record<string, unknown>) => Promise<ModelOutput>;

/** Exported for tests: the pooling and batching logic without the weights. */
export function createEmbedder(tokenizer: TokenizerLike, model: ModelLike): Embedder {
  async function embedBatch(requests: readonly EmbeddingRequest[], task: EmbeddingTask): Promise<readonly EmbeddingVector[]> {
    const texts = embeddingInputsFor(requests, task);
    const inputs = await tokenizer([...texts], {
      padding: true,
      truncation: true,
      // The contract's window. Our postings are 1-2k tokens, so this is a bound
      // against a pathological input, not a real truncation.
      max_length: EMBEDDING_MODEL.maxTokens,
    });
    const output = await model(inputs as unknown as Record<string, unknown>);
    const hidden = output.last_hidden_state;
    if (!hidden) throw new LocalEmbedderError("EMBEDDING_OUTPUT_UNEXPECTED");
    const dims = hidden.dims;
    const batch = dims[0] ?? 0;
    const sequence = dims[1] ?? 0;
    const dim = dims[2] ?? 0;
    if (dim !== EMBEDDING_MODEL.dim) throw new LocalEmbedderError("EMBEDDING_DIMENSION_UNEXPECTED");
    const mask = inputs.attention_mask.data;
    const vectors: EmbeddingVector[] = [];
    for (let index = 0; index < batch; index += 1) {
      // Last non-padding token: correct for both padding sides, which is why the
      // mask is used instead of assuming the convention of the tokenizer config.
      let last = 0;
      for (let step = 0; step < sequence; step += 1) {
        if (Number(mask[index * sequence + step] ?? 0) === 1) last = step;
      }
      const values: number[] = [];
      for (let d = 0; d < dim; d += 1) values.push(Number(hidden.data[(index * sequence + last) * dim + d] ?? 0));
      vectors.push(makeEmbeddingVector({
        modelVersion: EMBEDDING_MODEL.version,
        instructionVersion: INSTRUCTION_VERSION,
        role: requests[index]?.role ?? "document",
        values: l2Normalize(values),
        normalized: true,
      }));
    }
    return vectors;
  }

  return {
    modelVersion: EMBEDDING_MODEL.version,
    instructionVersion: INSTRUCTION_VERSION,
    dim: EMBEDDING_MODEL.dim,
    async embed(requests, task) {
      const vectors: EmbeddingVector[] = [];
      for (let start = 0; start < requests.length; start += BATCH_SIZE) {
        const slice = requests.slice(start, start + BATCH_SIZE);
        vectors.push(...await embedBatch(slice, task));
      }
      return vectors;
    },
  };
}
