// Guarded LLM extraction of posting fields (design item C1): one posting through
// the gateway, validated by src/domain/extraction.ts, stored with provenance by
// extraction-store.ts.
//
// What the run guarantees:
//   * the provider is asked only under the approved purpose `extraction` and
//     only through the one guarded entry point — reservation, attempt counters,
//     deadline, uncertain handling and settlement all apply;
//   * the source's `send_to_ai_provider` is asked HERE, at the point of use: a
//     source without the grant (or with an expired policy) is refused before any
//     text is assembled, and an unknown source never passes;
//   * the idempotency key is content-addressed — the hash of the fields the
//     provider receives and the prompt version are in it, not the posting version,
//     which moves on any re-map (docs/OPEN_GAPS.md B28) — so the same input is paid
//     for at most once, and a stored record answers a repeat with no call at all;
//   * the prompt is built through `buildJobOnlyPrompt`, the single constructor
//     the personal-data boundary allows: its input type cannot carry a profile
//     field, so this feature cannot leak candidate facts by construction.
//
// Codes, ids and counts travel outward; posting text and prompt text do not
// (the stored payload is the extraction itself — job data by construction).
import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { jobEmbeddingText } from "../../domain/embeddings.ts";
import {
  EXTRACTION_PROMPT_VERSION, extractionInstruction, parseExtraction,
  type ExtractedFields, type ExtractionRejection,
} from "../../domain/extraction.ts";
import type { JobSnapshot } from "../../domain/source-contracts.ts";
import { executeGuardedOperation, type ModelTransport } from "./gateway.ts";
import { buildJobOnlyPrompt } from "./personal-data-boundary.ts";
import { GPT6_LUNA, reservationFor, worstCaseCostMicroCents } from "./provider.ts";
import { getSourcePolicy, permissionFor } from "../source-policies.ts";
import {
  loadExtraction, storeExtraction, type ExtractionProvenance,
} from "./extraction-store.ts";

export type ExtractionOutcome =
  | Readonly<{ status: "extracted"; fields: ExtractedFields; provenance: ExtractionProvenance }>
  | Readonly<{ status: "rejected"; reasons: readonly ExtractionRejection[]; provenance: ExtractionProvenance }>
  | Readonly<{ status: "already_extracted"; fields: ExtractedFields; provenance: ExtractionProvenance }>
  | Readonly<{ status: "already_rejected"; reasons: readonly ExtractionRejection[]; provenance: ExtractionProvenance }>
  | Readonly<{ status: "unknown_source" }>
  | Readonly<{ status: "no_permission" }>
  | Readonly<{ status: "empty_text" }>;

type ExtractionInput = Readonly<Pick<JobSnapshot, "title" | "company_name" | "description_text">>;

/**
 * The input of a paid extraction: the hash of exactly the fields the provider
 * receives, as a JSON array, so text moved from one field to another is another
 * input. The posting version is not the input: a re-map that leaves these fields
 * alone finds the record it already paid for (docs/OPEN_GAPS.md B28).
 */
export function extractionInputHash(snapshot: ExtractionInput): string {
  return createHash("sha256")
    .update(JSON.stringify([snapshot.title, snapshot.company_name, snapshot.description_text]), "utf8")
    .digest("hex");
}

/** The idempotency key: same posting + same input + same prompt = same paid operation. */
export function extractionKey(snapshot: ExtractionInput & Readonly<{ id: string }>): string {
  return `extraction:${snapshot.id}:${extractionInputHash(snapshot)}:${EXTRACTION_PROMPT_VERSION}`;
}

/**
 * Extracts fields for one posting. Refusals come before any money or text
 * moves; a stored record for the same input and prompt answers without a
 * second call, whatever the posting version.
 */
export async function extractPostingFields(params: Readonly<{
  pool: Pool;
  ownerId: string;
  /** The source of the posting, as the storage row carries it (the snapshot contract has no source_id). */
  sourceId: string;
  snapshot: JobSnapshot;
  transport: ModelTransport | null;
  now: string;
}>): Promise<ExtractionOutcome> {
  const policy = getSourcePolicy(params.sourceId);
  if (!policy) return { status: "unknown_source" };
  if (permissionFor(policy, "send_to_ai_provider", params.now) !== "allowed") {
    return { status: "no_permission" };
  }
  const text = jobEmbeddingText(params.snapshot);
  if (text.trim().length === 0) return { status: "empty_text" };

  const inputHash = extractionInputHash(params.snapshot);
  const stored = await loadExtraction(params.pool, { snapshotId: params.snapshot.id, inputHash });
  if (stored !== null) {
    return stored.status === "accepted" && stored.fields !== null
      ? { status: "already_extracted", fields: stored.fields, provenance: stored.provenance }
      : { status: "already_rejected", reasons: stored.reasons, provenance: stored.provenance };
  }

  const prompt = buildJobOnlyPrompt({
    title: params.snapshot.title,
    company: params.snapshot.company_name,
    description: params.snapshot.description_text,
  }, extractionInstruction());
  const worstCase = worstCaseCostMicroCents(reservationFor(prompt));

  const settled = await executeGuardedOperation({
    pool: params.pool,
    ownerId: params.ownerId,
    purpose: "extraction",
    idempotencyKey: extractionKey(params.snapshot),
    worstCaseMinor: worstCase,
    transport: params.transport,
    prompt,
    now: params.now,
  });

  const parsed = parseExtraction(settled.output, text);
  const provenance: ExtractionProvenance = {
    promptVersion: EXTRACTION_PROMPT_VERSION,
    modelVersion: GPT6_LUNA.modelId,
    operationId: settled.operationId,
    settledMinor: settled.settledMinor,
  };
  if (parsed.ok) {
    await storeExtraction(params.pool, {
      snapshotId: params.snapshot.id,
      snapshotVersion: params.snapshot.version,
      inputHash,
      status: "accepted",
      fields: parsed.fields,
      rawOutput: null,
      reasons: [],
      provenance,
    });
    return { status: "extracted", fields: parsed.fields, provenance };
  }
  await storeExtraction(params.pool, {
    snapshotId: params.snapshot.id,
    snapshotVersion: params.snapshot.version,
    inputHash,
    status: "rejected",
    fields: null,
    rawOutput: settled.output,
    reasons: parsed.reasons,
    provenance,
  });
  return { status: "rejected", reasons: parsed.reasons, provenance };
}
