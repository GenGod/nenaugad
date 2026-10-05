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
//     posting. Any other failure propagates: one posting's oddity must not
//     silently end the pass.
//
// The extractor is a system operation with its own owner (EXTRACTOR_OWNER_ID):
// extraction is not a candidate action, and the ledger refuses a missing owner
// row — `npm run seed:budgets` provisions it explicitly.

import type { Pool } from "pg";
import { readConfig } from "../config.ts";
import { getSourcePolicy, permissionFor } from "../source-policies.ts";
import { readSnapshotCardsData } from "../storage/snapshots.ts";
import { BudgetError } from "./spending.ts";
import type { ModelTransport } from "./gateway.ts";
import { extractPostingFields } from "./extraction-service.ts";

/** The budget row the extraction run books into; provisioned by `npm run seed:budgets`. */
export const EXTRACTOR_OWNER_ID = "u_extraction_001";

const BUDGET_REFUSAL_CODES: ReadonlySet<string> = new Set([
  "OWNER_BUDGET_MISSING", "BUDGET_UNAVAILABLE", "BUDGET_EXCEEDED",
]);

export type ExtractionPassCounts = Readonly<{
  extracted: number;
  rejected: number;
  already_extracted: number;
  already_rejected: number;
  empty_text: number;
  tombstoned_skipped: number;
}>;

export type ExtractionPassResult = Readonly<{
  sourceId: string;
  outcome: "live_ai_disabled" | "unknown_source" | "no_permission" | "budget_refused" | "ran";
  /** Set when outcome is `budget_refused`: the ledger's own code. */
  code?: string;
  counts: ExtractionPassCounts;
  settledMicroCents: bigint;
  /** Per posting: id, status, and reason codes for a rejection. No text. */
  results: readonly Readonly<{ snapshotId: string; status: string; codes?: readonly string[] }>[];
}>;

function emptyCounts(): { -readonly [K in keyof ExtractionPassCounts]: number } {
  return {
    extracted: 0, rejected: 0, already_extracted: 0, already_rejected: 0,
    empty_text: 0, tombstoned_skipped: 0,
  };
}

/** The compact report the import scripts and the worker log: no per-posting list. */
export function summarizeExtractionPass(pass: ExtractionPassResult): Readonly<{
  sourceId: string;
  outcome: string;
  code?: string;
  counts: ExtractionPassCounts;
  settledMicroCents: string;
}> {
  return {
    sourceId: pass.sourceId,
    outcome: pass.outcome,
    ...(pass.code === undefined ? {} : { code: pass.code }),
    counts: pass.counts,
    settledMicroCents: pass.settledMicroCents.toString(),
  };
}

export async function runExtractionPass(params: Readonly<{
  pool: Pool;
  sourceId: string;
  transport: ModelTransport | null;
  now: string;
  /** Cap per pass; the worker uses it to stay polite, the scripts stay unbounded. */
  limit?: number;
}>): Promise<ExtractionPassResult> {
  const base = { sourceId: params.sourceId, counts: emptyCounts(), settledMicroCents: 0n, results: [] as { snapshotId: string; status: string; codes?: readonly string[] }[] };
  const policy = getSourcePolicy(params.sourceId);
  if (!policy) return { ...base, outcome: "unknown_source" };
  if (!readConfig(process.env).liveAi) return { ...base, outcome: "live_ai_disabled" };
  if (permissionFor(policy, "send_to_ai_provider", params.now) !== "allowed") {
    return { ...base, outcome: "no_permission" };
  }

  const records = await readSnapshotCardsData(params.pool, params.sourceId);
  const sliced = params.limit === undefined ? records : records.slice(0, params.limit);
  const counts = emptyCounts();
  const results: { snapshotId: string; status: string; codes?: readonly string[] }[] = [];
  let settledMicroCents = 0n;
  for (const record of sliced) {
    // The lifecycle is the contract's own tombstone marker (RET-001); the card
    // reader does not carry `tombstoned_at`, and the snapshot is the authority
    // on its own state.
    if (record.stored.snapshot.lifecycle === "tombstoned") {
      counts.tombstoned_skipped += 1;
      continue;
    }
    try {
      const outcome = await extractPostingFields({
        pool: params.pool,
        ownerId: EXTRACTOR_OWNER_ID,
        sourceId: params.sourceId,
        snapshot: record.stored.snapshot,
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
        snapshotId: record.stored.snapshot.id,
        status: outcome.status,
        ...(outcome.status === "rejected" ? { codes: outcome.reasons.map(reason => reason.code) } : {}),
      });
    } catch (error) {
      if (error instanceof BudgetError && BUDGET_REFUSAL_CODES.has(error.message)) {
        return { sourceId: params.sourceId, outcome: "budget_refused", code: error.message, counts, settledMicroCents, results };
      }
      throw error;
    }
  }
  return { sourceId: params.sourceId, outcome: "ran", counts, settledMicroCents, results };
}
