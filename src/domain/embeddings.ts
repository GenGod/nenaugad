// Embedding contract (design item B1, owner decision 2026-09-30 §6.2).
//
// Three things are contract here rather than configuration, and each has a
// failure it exists to prevent:
//
//   * the ARTIFACT. A vector is only comparable with vectors from the same
//     ONNX file set: int8 and fp32 are numerically different spaces, so the
//     model VERSION is derived from the artifact (revision + weight hash) and a
//     bare model name is never accepted as a version. A model change is a new
//     version string, and two versions never mix (see assertComparable).
//   * the INSTRUCTION ASYMMETRY (research part 2 A3). The query side (profile,
//     CV) is embedded with a task instruction, the document side (posting) is
//     embedded without one. Losing the instruction on the query side does not
//     crash anything — it silently lowers quality — so the role travels with the
//     vector and both directions of the mistake are refused here.
//   * NORMALIZATION. L2, so cosine equals the dot product and vectors are
//     comparable across requests and across restarts.
//
// Fail-closed on mixing: combining vectors from different artifacts, different
// instruction revisions or different roles is refused, never averaged over. A
// half-reindexed catalog must rank with nothing rather than with two spaces.
//
// No model runs in this module: it is pure values and rules. The local model
// adapter is src/server/embeddings/local-embedder.ts, and a clearly labelled
// deterministic double for offline tests is src/domain/fake-embedder.ts.
import type { ManualProfileInput } from "./profile.ts";
import type { JobSnapshot } from "./source-contracts.ts";

export type EmbeddingRole = "query" | "document";

export const EMBEDDING_ROLES: readonly EmbeddingRole[] = ["query", "document"];

/**
 * The reference artifact. `version` is a literal (so a change shows up in a
 * diff) and a test asserts it still equals the value derived from the fields
 * below — the literal may not drift away from the hashes it claims to fix.
 */
export const EMBEDDING_MODEL = {
  /** Upstream model card. */
  id: "Qwen/Qwen3-Embedding-0.6B",
  /** License of the weights, checked 2026-09-30: Apache-2.0. */
  license: "Apache-2.0",
  /** The ONNX export we actually run (Node, no Python service). */
  repository: "onnx-community/Qwen3-Embedding-0.6B-ONNX",
  /** Commit of that repository: the file list cannot move under us. */
  revision: "c25a394dd583836952667c12f008335071b3f43d",
  /** Quantization is part of the artifact: int8 for CPU inference. */
  dtype: "int8",
  file: "onnx/model_int8.onnx",
  fileSha256: "6d0ea863f78b4a84afa3c7fcba1ec341572b5e28121aef77b7092b1dfdf679c7",
  /** sha256 of onnx/model_q4f16.onnx — the smaller alternative, not the reference. */
  alternativeFileSha256: "7f9ebb9a77c428f2b4c2d8ed8a2ee64f292a0b1ce7a3f027ccaaef150ef7bdd1",
  /** Output dimension. MRL (32–1024) exists upstream but is not enabled: the
   *  catalog is ~700 postings, and truncating dimensions buys nothing we need. */
  dim: 1024,
  /** Decoder-based embedding model: the last non-padding token is the sentence vector. */
  pooling: "last_token",
  /** Smallest documented context; our documents are 1–2k tokens (decision §2). */
  maxTokens: 32768,
  /** Turned into the version string below by the test, not by hand. */
  version: "qwen3-embedding-0.6b-int8@c25a394d-6d0ea863",
} as const;

/** Derived form of the version, kept next to the literal so drift fails a test. */
export function derivedModelVersion(): string {
  return `${EMBEDDING_MODEL.id.split("/")[1]?.toLowerCase()}-${EMBEDDING_MODEL.dtype}`
    + `@${EMBEDDING_MODEL.revision.slice(0, 8)}-${EMBEDDING_MODEL.fileSha256.slice(0, 8)}`;
}

/**
 * Version of the instruction text itself. Editing the wording below without
 * bumping this would leave old query vectors looking comparable, so an offline
 * test pins the instruction text to this version.
 */
export const INSTRUCTION_VERSION = "qwen3-instruct-l1";

/** The template from the model card: instruction on the query side only. */
export const QUERY_INSTRUCTION_TEMPLATE = "Instruct: {task}\nQuery: {query}";

export const EMBEDDING_TASKS = {
  /** Profile → postings: the only task B1 needs. */
  matching: "Given a candidate profile, retrieve job postings the candidate could take",
} as const;

export type EmbeddingTask = keyof typeof EMBEDDING_TASKS;

export class EmbeddingContractError extends Error {
  constructor(code: string) {
    super(code); // Codes only: no text of a profile or a posting ever reaches an error.
    this.name = "EmbeddingContractError";
  }
}

/**
 * The string that is actually fed to the tokenizer. Both mistakes are refusals:
 * a query without its instruction is a silent quality regression, and an
 * instruction on a document is a (smaller) version-space change, because the
 * stored vector would then not match the document contract.
 */
export function embeddingInput(role: EmbeddingRole, text: string, instruction: string | null): string {
  if (text.trim().length === 0) throw new EmbeddingContractError("EMPTY_EMBEDDING_TEXT");
  if (role === "query") {
    if (instruction === null || instruction.trim().length === 0) {
      throw new EmbeddingContractError("MISSING_QUERY_INSTRUCTION");
    }
    return QUERY_INSTRUCTION_TEMPLATE.replace("{task}", instruction).replace("{query}", text);
  }
  if (instruction !== null) throw new EmbeddingContractError("INSTRUCTION_ON_DOCUMENT_SIDE");
  return text;
}

/** The instruction a query for this task carries. */
export function taskInstruction(task: EmbeddingTask): string {
  return EMBEDDING_TASKS[task];
}

export type EmbeddingVector = Readonly<{
  modelVersion: string;
  instructionVersion: string;
  role: EmbeddingRole;
  dim: number;
  /** L2-normalized, finite. */
  values: readonly number[];
}>;

/**
 * The text a posting is embedded from: title plus body, in the order the model
 * card describes a document. Kept in one place so the indexing job and any
 * future re-index cannot embed slightly different text for the same posting.
 * excerpt is deliberately NOT used: the vector must describe what the posting
 * says, not the 200-character preview.
 */
export function jobEmbeddingText(snapshot: JobSnapshot): string {
  return `${snapshot.title}\n\n${snapshot.description_text}`;
}

export function l2Normalize(values: readonly number[]): readonly number[] {
  let sum = 0;
  for (const value of values) sum += value * value;
  const norm = Math.sqrt(sum);
  if (!Number.isFinite(norm) || norm === 0) throw new EmbeddingContractError("NON_FINITE_EMBEDDING");
  return values.map(value => value / norm);
}

/**
 * Builds a validated vector. Zero-length and non-finite vectors are refused
 * here rather than producing NaN similarities later, where the symptom would
 * look like "the ranker behaves oddly" instead of "the model returned junk".
 */
export function makeEmbeddingVector(params: Readonly<{
  modelVersion: string;
  instructionVersion: string;
  role: EmbeddingRole;
  values: readonly number[];
  /** Skip normalization when the caller knows the model already normalized. */
  normalized?: boolean;
}>): EmbeddingVector {
  const { values } = params;
  if (values.length === 0) throw new EmbeddingContractError("EMPTY_EMBEDDING");
  for (const value of values) {
    if (!Number.isFinite(value)) throw new EmbeddingContractError("NON_FINITE_EMBEDDING");
  }
  return {
    modelVersion: params.modelVersion,
    instructionVersion: params.instructionVersion,
    role: params.role,
    dim: values.length,
    values: params.normalized ? [...values] : l2Normalize(values),
  };
}

export function cosineSimilarity(a: EmbeddingVector, b: EmbeddingVector): number {
  if (a.dim !== b.dim) throw new EmbeddingContractError("DIMENSION_MISMATCH");
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < a.dim; index += 1) {
    const left = a.values[index] ?? 0;
    const right = b.values[index] ?? 0;
    dot += left * right;
    normA += left * left;
    normB += right * right;
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;
  return dot / denominator;
}

export class EmbeddingVersionMismatchError extends Error {
  constructor(code: string) {
    super(code); // Code only; a mismatch is about artifacts, not about content.
    this.name = "EmbeddingVersionMismatchError";
  }
}

/**
 * The fail-closed gate (V4): a query vector and the document vectors it is
 * compared against must come from one artifact, one instruction revision, and
 * the right roles. Anything else throws and no dense signal is produced.
 *
 * Absent documents are not a mismatch — a posting without a vector is simply
 * not covered by the dense leg (a half-indexed catalog during a rollout is a
 * normal state, and the caller sees which ids were uncovered).
 */
export function assertComparable(
  query: EmbeddingVector,
  documents: readonly EmbeddingVector[],
): void {
  if (query.role !== "query") throw new EmbeddingVersionMismatchError("QUERY_ROLE_REQUIRED");
  for (const document of documents) {
    if (document.role !== "document") throw new EmbeddingVersionMismatchError("DOCUMENT_ROLE_REQUIRED");
    if (document.modelVersion !== query.modelVersion) {
      throw new EmbeddingVersionMismatchError("MODEL_VERSION_MISMATCH");
    }
    if (document.instructionVersion !== query.instructionVersion) {
      throw new EmbeddingVersionMismatchError("INSTRUCTION_VERSION_MISMATCH");
    }
    if (document.dim !== query.dim) throw new EmbeddingVersionMismatchError("DIMENSION_MISMATCH");
  }
}

/**
 * Cache key part for a profile vector (decision §6.5): the version of the model,
 * the instruction and the profile all belong in the key, so a change in any of
 * them cannot serve a stale vector. Profile text is not part of the key and
 * never appears in it.
 */
export function embeddingCacheKey(params: Readonly<{
  modelVersion: string;
  instructionVersion: string;
  profileVersion: number;
}>): string {
  return `${params.modelVersion}|${params.instructionVersion}|p${params.profileVersion}`;
}

/**
 * Bumped whenever the dense leg's own behaviour changes, the way RANKER_VERSION
 * works for the ranker: a measurement is only comparable inside one version.
 */
export const DENSE_LEG_VERSION = "dense-l1";

/**
 * The canonical text of a profile on the query side. Built only from the fields
 * the profile contract actually carries (src/domain/profile.ts): nothing is
 * inferred, no id, no email, no free text is ever added. Versioned like the
 * instruction, because changing the wording changes every query vector.
 */
export const PROFILE_TEXT_VERSION = "profile-text-l1";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export function profileEmbeddingText(input: ManualProfileInput): string {
  const lines: string[] = [];
  if (input.targetRoles.length > 0) lines.push(`Target roles: ${input.targetRoles.join("; ")}`);
  if (input.skills.length > 0) lines.push(`Skills: ${input.skills.join("; ")}`);
  if (input.residenceCountry !== null) lines.push(`Residence country: ${input.residenceCountry}`);
  if (input.timezone !== null) lines.push(`Timezone: ${input.timezone}`);
  if (input.employmentTypes.length > 0) {
    lines.push(`Employment types: ${input.employmentTypes
      .map(type => type.replace(/^employment_/u, "").replace(/_/gu, " ")).join("; ")}`);
  }
  if (input.availabilityWindows.length > 0) {
    const windows = input.availabilityWindows.map(window =>
      `${window.weekdays.map(day => WEEKDAY_LABELS[day - 1] ?? String(day)).join(",")} ${window.start}-${window.end}`);
    lines.push(`Available: ${windows.join("; ")}`);
  }
  if (input.zeroMandatoryAttendance) lines.push("No mandatory attendance");
  const pay = input.minimumCompensation;
  if (pay !== null) {
    lines.push(`Minimum pay: ${pay.amount} ${pay.currency} ${pay.period}`
      + ` (${pay.hard ? "required" : "preference"}, ${pay.taxBasis} basis)`);
  }
  // A profile that carries nothing is a caller error, not an empty query: an
  // empty string would embed the instruction alone and look like a valid vector.
  if (lines.length === 0) throw new EmbeddingContractError("EMPTY_PROFILE_TEXT");
  return lines.join("\n");
}

/** One text to embed, with the role that decides the instruction. */
export type EmbeddingRequest = Readonly<{ role: EmbeddingRole; text: string }>;

/**
 * The port every embedder implements. The instruction asymmetry is applied here,
 * once, so an implementation cannot forget it: a query always gets the task
 * instruction, a document never does.
 */
export type Embedder = Readonly<{
  /** Artifact identity; must equal EMBEDDING_MODEL.version for the reference model. */
  modelVersion: string;
  instructionVersion: string;
  dim: number;
  embed(requests: readonly EmbeddingRequest[], task: EmbeddingTask): Promise<readonly EmbeddingVector[]>;
}>;

/** The exact strings an embedder tokenizes, in request order. */
export function embeddingInputsFor(
  requests: readonly EmbeddingRequest[],
  task: EmbeddingTask,
): readonly string[] {
  const instruction = taskInstruction(task);
  return requests.map(request =>
    embeddingInput(request.role, request.text, request.role === "query" ? instruction : null));
}

/**
 * Checks what an embedder handed back before any of it is stored or compared:
 * same count, same roles, same artifact, right dimension. An embedder that
 * silently returns a mean-pooled or an unnormalized vector would otherwise
 * degrade quality without failing anything.
 */
export function assertEmbedderOutput(
  vectors: readonly EmbeddingVector[],
  requests: readonly EmbeddingRequest[],
  embedder: Embedder,
): void {
  if (vectors.length !== requests.length) throw new EmbeddingContractError("EMBEDDER_COUNT_MISMATCH");
  vectors.forEach((vector, index) => {
    const request = requests[index];
    if (!request) throw new EmbeddingContractError("EMBEDDER_COUNT_MISMATCH");
    if (vector.role !== request.role) throw new EmbeddingContractError("EMBEDDER_ROLE_MISMATCH");
    if (vector.modelVersion !== embedder.modelVersion) throw new EmbeddingContractError("EMBEDDER_VERSION_MISMATCH");
    if (vector.instructionVersion !== embedder.instructionVersion) {
      throw new EmbeddingContractError("EMBEDDER_INSTRUCTION_MISMATCH");
    }
    if (vector.dim !== embedder.dim) throw new EmbeddingContractError("EMBEDDER_DIMENSION_MISMATCH");
  });
}
