import { OWNER_BUDGET_PREFIX } from "./spending.ts";

// Owner-approved provider registration (AI-002, 2026-09-25; purpose set extended
// by the owner on 2026-10-01, per-user quota raised the same day).
// Prices are integer micro-cents per MILLION tokens; all cost math uses
// integer ceiling — never float (spec SP 9). The purpose whitelist is the
// ONLY set of operations this model may serve; everything else is refused.

/**
 * What the model may be asked to do — and the only things it may be asked to do.
 *
 * A purpose is not a task type (that is the spending bucket). `cover_letter` was
 * approved 2026-09-25 (AI-002); `job_matching` was approved by the owner on
 * 2026-10-01 — the relevance path already ran under it, and the approval makes
 * that explicit instead of implicit. The whitelist is enforced in the gateway
 * before dispatch (src/server/ai/gateway.ts), not only here.
 *
 * **Approving a purpose does not approve sending a source's text.** That is the
 * source policy's `send_to_ai_provider`, `denied` for every source today
 * (src/server/source-policies.ts). Both approvals are required, and neither
 * implies the other.
 */
export type ApprovedPurpose = "cover_letter" | "job_matching";

export type ProviderConfig = Readonly<{
  provider: "openai";
  modelId: "gpt-6-luna";
  // Verified at developers.openai.com/api/docs/pricing on 2026-09-25:
  // short-context standard: input $0.10/MTok, output $0.50/MTok.
  inputMicroCentsPerMTok: bigint; // 10_000 ($0.10 → 10 cents → 10_000 micro-cents)
  outputMicroCentsPerMTok: bigint; // 50_000 ($0.50 → 50 cents → 50_000 micro-cents)
  maxOutputTokens: number;
  approvedPurposes: readonly ApprovedPurpose[];
  // Owner-approved spending caps: the per-operation ceiling and the global budget
  // are from 2026-09-25; the per-user monthly quota was raised to $1 by the owner
  // on 2026-10-01 (was 50 cents).
  operationCeilingMicroCents: bigint; // 1 cent per operation
  ownerMonthlyQuotaMicroCents: bigint; // $1 per user per month
  globalBudgetMicroCents: bigint; // $10 total for the environment
}>;

export const GPT6_LUNA: ProviderConfig = {
  provider: "openai",
  modelId: "gpt-6-luna",
  inputMicroCentsPerMTok: 10_000n,
  outputMicroCentsPerMTok: 50_000n,
  maxOutputTokens: 8_192,
  approvedPurposes: ["cover_letter", "job_matching"],
  operationCeilingMicroCents: 10_000n,
  ownerMonthlyQuotaMicroCents: 1_000_000n,
  globalBudgetMicroCents: 10_000_000n,
};

/** The budget row id of one owner. Exported so provisioning and reporting agree. */
export function ownerBudgetId(ownerId: string): string {
  return `${OWNER_BUDGET_PREFIX}/${ownerId}`;
}

// Worst-case cost for a token envelope (integer ceiling, spec SP 9):
// the maximum allowed path is reserved, not an average or expected spend.
export function worstCaseCostMicroCents(params: Readonly<{
  inputTokens: number; outputTokens: number;
}>): bigint {
  const inputCost = (BigInt(params.inputTokens) * GPT6_LUNA.inputMicroCentsPerMTok +
    999_999n) / 1_000_000n;
  const outputCost = (BigInt(params.outputTokens) * GPT6_LUNA.outputMicroCentsPerMTok +
    999_999n) / 1_000_000n;
  return inputCost + outputCost;
}

export function isPurposeApproved(purpose: string): purpose is ApprovedPurpose {
  return (GPT6_LUNA.approvedPurposes as readonly string[]).includes(purpose);
}

/**
 * The token envelope to reserve for one dispatch of this prompt.
 *
 * The reservation must bound the REQUEST, not the expected answer (that invariant
 * is what the provider comment above claims, and what the old fixed 1200/400
 * envelope broke — docs/OPEN_GAPS.md A4: the transport may ask for
 * `maxOutputTokens` on every call). Input is bounded by the prompt's character
 * count, which is a true upper bound for any tokenizer (no tokenizer emits more
 * tokens than characters, and this holds for Cyrillic too); output is the
 * transport's hard maximum, because that is what the request permits.
 */
export function reservationFor(prompt: string): Readonly<{ inputTokens: number; outputTokens: number }> {
  return { inputTokens: prompt.length, outputTokens: GPT6_LUNA.maxOutputTokens };
}
