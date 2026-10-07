// The periodic form of the extraction run (design item C1): every caller that
// wants "extract whatever this source has not been extracted for yet" goes
// through here — the worker after an import pass, the import scripts after a
// successful run, and the CLI's live mode. One loop, one set of rules.
//
// Rules, inherited from the service and restated for the loop:
//   * the owner's switch first: with LIVE_AI_ENABLED off the pass reports
//     `live_ai_disabled` and touches nothing — no text is assembled, no money
//     moves. That is today's normal state, not a failure;
//   * per posting the guarded service asks the source's `send_to_ai_provider`,
//     answers repeats from the stored record, and stores a rejection instead of
//     dropping it — this loop only counts what happened, per posting;
//   * tombstones are skipped: retention blanked their text, so there is nothing
//     to extract and no reason to pay for an empty prompt;
//   * a missing or exhausted budget row is a refusal (`OWNER_BUDGET_MISSING`,
//     `BUDGET_UNAVAILABLE`, `BUDGET_EXCEEDED`), not "no cap": the pass stops and
//     names the code — continuing would fail identically for every remaining
//     posting;
//   * an operation that still holds money stops the source (owner decision
//     2026-10-07, B31): the money question is open, and the owner settles it
//     with `npm run ai:holds`. Before reading any posting the pass refuses with
//     `held` while such an operation exists for one of this source's postings,
//     so no tick keeps dispatching while a provider misbehaves; met in the loop,
//     the same stops the pass;
//   * a closed operation (settled with its result lost, failed, or cancelled by
//     the owner) and a posting over the per-operation ceiling block only their
//     own posting: counted as `blocked`, and the pass goes on. The block holds
//     until the posting's text changes — no retry resets a root operation's
//     limit;
//   * any other failure propagates: one posting's oddity must not silently end
//     the pass. After an import, `runExtractionPassAfterImport` turns it into a
//     code, so extraction can never fail or pause the import.
//
// The extractor is a system operation with its own owner (EXTRACTOR_OWNER_ID):
// extraction is not a candidate action, and the ledger refuses a missing owner
// row — `npm run seed:budgets` provisions it explicitly.

import type { Pool } from "pg";
import { readConfig } from "../config.ts";
import { getSourcePolicy, permissionFor } from "../source-policies.ts";
import { readSnapshotCardsData } from "../storage/snapshots.ts";
import {
  BudgetError, HOLDING_STATUSES, findOperationByKey, type OperationStatus,
} from "./spending.ts";
import { PURPOSE_TASK_TYPE, type ModelTransport } from "./gateway.ts";
import { extractPostingFields, extractionKey } from "./extraction-service.ts";

/** The budget row the extraction run books into; provisioned by `npm run seed:budgets`. */
export const EXTRACTOR_OWNER_ID = "u_extraction_001";

const BUDGET_REFUSAL_CODES: ReadonlySet<string> = new Set([
  "OWNER_BUDGET_MISSING", "BUDGET_UNAVAILABLE", "BUDGET_EXCEEDED",
]);

/** Refused before any reservation, for this posting alone: its prompt is over the per-operation ceiling. */
const POSTING_REFUSAL_CODES: ReadonlySet<string> = new Set(["OPERATION_CEILING_EXCEEDED"]);

export type ExtractionPassCounts = Readonly<{
  extracted: number;
  rejected: number;
  already_extracted: number;
  already_rejected: number;
  empty_text: number;
  tombstoned_skipped: number;
  /** Postings whose operation is closed without a stored record, or over the ceiling (B31). */
  blocked: number;
}>;

/** The operation that stopped the pass: it still holds money (B31). Ids and a status, no text. */
export type ExtractionHold = Readonly<{
  snapshotId: string;
  operationId: string;
  status: OperationStatus;
  /** The ledger's deadline for the operation's next step. */
  deadlineAt: string;
}>;

/**
 * What to tell the owner about a hold. A call reserved or in flight before its
 * deadline may still be running in another process (the CLI beside the worker):
 * cancelling it would understate a charge that is about to settle.
 */
export function holdHint(hold: ExtractionHold, now: string): string {
  return hold.status !== "uncertain" && Date.parse(hold.deadlineAt) > Date.parse(now)
    ? `a call may still be in flight until ${hold.deadlineAt}: run again after that, do not cancel it`
    : "an operation still holds money: check the provider's usage page, then npm run ai:holds";
}

type PassEntry = Readonly<{
  snapshotId: string;
  status: string;
  codes?: readonly string[];
  /** For a blocked posting: the status of the operation that blocks it. */
  operationStatus?: OperationStatus;
}>;

export type ExtractionPassResult = Readonly<{
  sourceId: string;
  outcome: "live_ai_disabled" | "unknown_source" | "no_permission" | "budget_refused" | "held" | "ran";
  /** The ledger's own code: set when outcome is `budget_refused`, or `held` in the loop. */
  code?: string;
  /** Set when outcome is `held`: the posting and the operation to resolve with `npm run ai:holds`. */
  held?: ExtractionHold;
  counts: ExtractionPassCounts;
  settledMicroCents: bigint;
  /** Per posting: id, status, and reason codes for a rejection or a block. No text. */
  results: readonly PassEntry[];
}>;

function emptyCounts(): { -readonly [K in keyof ExtractionPassCounts]: number } {
  return {
    extracted: 0, rejected: 0, already_extracted: 0, already_rejected: 0,
    empty_text: 0, tombstoned_skipped: 0, blocked: 0,
  };
}

export type ExtractionPassSummary = Readonly<{
  sourceId: string;
  outcome: string;
  code?: string;
  held?: ExtractionHold;
  counts: ExtractionPassCounts;
  settledMicroCents: string;
}>;

/** The compact report the import scripts and the worker log: no per-posting list. */
export function summarizeExtractionPass(pass: ExtractionPassResult): ExtractionPassSummary {
  return {
    sourceId: pass.sourceId,
    outcome: pass.outcome,
    ...(pass.code === undefined ? {} : { code: pass.code }),
    ...(pass.held === undefined ? {} : { held: pass.held }),
    counts: pass.counts,
    settledMicroCents: pass.settledMicroCents.toString(),
  };
}

/**
 * The oldest extractor operation for one of this source's postings that still
 * holds money. A key is `extraction:<posting id>:...` (extraction-service.ts), so
 * joining on the source's postings ties a hold to its source without parsing ids.
 */
async function openHold(pool: Pool, sourceId: string): Promise<ExtractionHold | null> {
  const result = await pool.query(`
    SELECT o.id, o.status, o.deadline_at, s.id AS snapshot_id FROM ai_operations o
    JOIN job_snapshots s ON s.source_id = $2 AND starts_with(o.idempotency_key, 'extraction:' || s.id || ':')
    WHERE o.owner_id = $1 AND o.task_type = $3 AND o.status = ANY($4::text[])
    ORDER BY o.updated_at, o.id
    LIMIT 1`,
  [EXTRACTOR_OWNER_ID, sourceId, PURPOSE_TASK_TYPE.extraction, [...HOLDING_STATUSES]]);
  const row = result.rows[0] as
    | { id: string; status: OperationStatus; deadline_at: Date; snapshot_id: string }
    | undefined;
  return row
    ? { snapshotId: row.snapshot_id, operationId: row.id, status: row.status, deadlineAt: new Date(row.deadline_at).toISOString() }
    : null;
}

export async function runExtractionPass(params: Readonly<{
  pool: Pool;
  sourceId: string;
  transport: ModelTransport | null;
  now: string;
  /** Cap per pass; the worker uses it to stay polite, the scripts stay unbounded. */
  limit?: number;
}>): Promise<ExtractionPassResult> {
  const base = { sourceId: params.sourceId, counts: emptyCounts(), settledMicroCents: 0n, results: [] as PassEntry[] };
  const policy = getSourcePolicy(params.sourceId);
  if (!policy) return { ...base, outcome: "unknown_source" };
  if (!readConfig(process.env).liveAi) return { ...base, outcome: "live_ai_disabled" };
  if (permissionFor(policy, "send_to_ai_provider", params.now) !== "allowed") {
    return { ...base, outcome: "no_permission" };
  }
  const hold = await openHold(params.pool, params.sourceId);
  if (hold) return { ...base, outcome: "held", held: hold };

  const records = await readSnapshotCardsData(params.pool, params.sourceId);
  const sliced = params.limit === undefined ? records : records.slice(0, params.limit);
  const counts = emptyCounts();
  const results: PassEntry[] = [];
  let settledMicroCents = 0n;
  for (const record of sliced) {
    const snapshot = record.stored.snapshot;
    // The lifecycle is the contract's own tombstone marker (RET-001); the card
    // reader does not carry `tombstoned_at`, and the snapshot is the authority
    // on its own state.
    if (snapshot.lifecycle === "tombstoned") {
      counts.tombstoned_skipped += 1;
      continue;
    }
    try {
      const outcome = await extractPostingFields({
        pool: params.pool,
        ownerId: EXTRACTOR_OWNER_ID,
        sourceId: params.sourceId,
        snapshot,
        transport: params.transport,
        now: params.now,
      });
      if (outcome.status !== "unknown_source" && outcome.status !== "no_permission") {
        counts[outcome.status] += 1;
      }
      // Only a fresh call settles money in THIS pass: an already_* answer comes
      // from the stored record whose provenance names an older payment, and
      // counting it again would inflate the run's cost.
      if (outcome.status === "extracted" || outcome.status === "rejected") {
        settledMicroCents += outcome.provenance.settledMinor;
      }
      results.push({
        snapshotId: snapshot.id,
        status: outcome.status,
        ...(outcome.status === "rejected" ? { codes: outcome.reasons.map(reason => reason.code) } : {}),
      });
    } catch (error) {
      if (!(error instanceof BudgetError)) throw error;
      // The ledger's code alone does not say whether money is still held: an
      // uncertain dispatch surfaces as BUDGET_UNAVAILABLE, and DEADLINE_EXPIRED
      // covers a hold and a settled call alike. The posting's own operation does.
      const operation = await findOperationByKey({
        pool: params.pool, ownerId: EXTRACTOR_OWNER_ID,
        taskType: PURPOSE_TASK_TYPE.extraction, idempotencyKey: extractionKey(snapshot),
      });
      if (operation && HOLDING_STATUSES.has(operation.status)) {
        return {
          sourceId: params.sourceId, outcome: "held", code: error.message,
          held: {
            snapshotId: snapshot.id, operationId: operation.id, status: operation.status,
            deadlineAt: operation.deadlineAt,
          },
          counts, settledMicroCents, results,
        };
      }
      // A budget refusal stops the pass even for a posting whose operation is
      // closed: with the global budget at zero (the kill switch) the gateway
      // refuses before the ledger looks at the operation.
      if (BUDGET_REFUSAL_CODES.has(error.message)) {
        return { sourceId: params.sourceId, outcome: "budget_refused", code: error.message, counts, settledMicroCents, results };
      }
      if (operation || POSTING_REFUSAL_CODES.has(error.message)) {
        counts.blocked += 1;
        results.push({
          snapshotId: snapshot.id, status: "blocked", codes: [error.message],
          ...(operation ? { operationStatus: operation.status } : {}),
        });
        continue;
      }
      throw error;
    }
  }
  return { sourceId: params.sourceId, outcome: "ran", counts, settledMicroCents, results };
}

export type ExtractionAfterImport =
  | ExtractionPassSummary
  | Readonly<{ sourceId: string; outcome: "error"; code: string }>;

/**
 * A code safe to log or print: the ledger's code, or an error's own code when it is
 * a plain code (a PostgreSQL SQLSTATE, say); never a message, which can quote the
 * data the error met. Used after an import and by `npm run extract:fields` (B33).
 */
export function failureCode(error: unknown): string {
  if (error instanceof BudgetError) return error.message;
  const code = (error as { code?: unknown } | null | undefined)?.code;
  return typeof code === "string" && /^[A-Z0-9_]{1,64}$/u.test(code) ? code : "EXTRACTION_FAILED";
}

/**
 * The pass as an import's follow-up (the worker and the import scripts). It never
 * throws: an exception becomes a code, never a message (a database error can quote
 * data), so extraction cannot fail an import, pause its source or change its exit
 * code (B31).
 */
export async function runExtractionPassAfterImport(
  params: Parameters<typeof runExtractionPass>[0],
): Promise<ExtractionAfterImport> {
  try {
    return summarizeExtractionPass(await runExtractionPass(params));
  } catch (error) {
    return { sourceId: params.sourceId, outcome: "error", code: failureCode(error) };
  }
}
