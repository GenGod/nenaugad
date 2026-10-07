import { OWNER_BUDGET_PREFIX } from "./spending.ts";

// Owner-approved provider registration (AI-002, 2026-09-25; purpose set extended
// by the owner on 2026-10-01 and again on 2026-10-04, per-user quota raised to
// $1 on 2026-10-01).
// Money is integer micro-dollars (μ$, one millionth of a dollar; 1 cent =
// 10,000 μ$) everywhere: prices per MILLION tokens, caps, reservations and the
// ledger's `*_minor` columns. All cost math uses integer ceiling — never float
// (spec SP 9). The purpose whitelist is the ONLY set of operations this model
// may serve; everything else is refused.
//
// The unit used to be called "micro-cents" and was never defined: the caps
// counted 10,000 to the cent, the tariff 1,000, so every call was booked at a
// tenth of its price and the caps let ten times as much through (B35). Every
// figure below is now written from MICRO_USD_PER_DOLLAR.

/** The money unit: one dollar in micro-dollars. */
export const MICRO_USD_PER_DOLLAR = 1_000_000n;

/** Prices are per million tokens. Equal to MICRO_USD_PER_DOLLAR by coincidence only. */
const TOKENS_PER_MTOK = 1_000_000n;

/**
 * What the model may be asked to do — and the only things it may be asked to do.
 *
 * A purpose is not a task type (that is the spending bucket). `cover_letter` was
 * approved 2026-09-25 (AI-002); `job_matching` was approved by the owner on
 * 2026-10-01 — the relevance path already ran under it, and the approval makes
 * that explicit instead of implicit. `extraction` was approved on 2026-10-04
 * (the C0-002 packet): field extraction from a posting's text, job-only by
 * construction, estimated at ≈0.03 cent per posting; the first live run
 * (2026-10-07, 5 postings) cost ≈0.05 cent each. The whitelist is enforced in the
 * gateway before dispatch (src/server/ai/gateway.ts), not only here.
 *
 * **Approving a purpose does not approve sending a source's text.** That is the
 * source policy's `send_to_ai_provider`, which the owner granted for all three
 * sources on 2026-10-01 (AI-005, src/server/source-policies.ts). Both approvals
 * are required, and neither implies the other.
 */
export type ApprovedPurpose = "cover_letter" | "job_matching" | "extraction";

export type ProviderConfig = Readonly<{
  provider: "openai";
  modelId: "gpt-6-luna";
  // Verified at developers.openai.com/api/docs/pricing on 2026-09-25 and again on
  // 2026-10-07: short-context standard, input $0.10/MTok, output $0.50/MTok
  // (cached input $0.01/MTok, not used: pricing every input token as uncached can
  // only overestimate).
  inputMicroUsdPerMTok: bigint;
  outputMicroUsdPerMTok: bigint;
  maxOutputTokens: number;
  approvedPurposes: readonly ApprovedPurpose[];
  // Owner-approved spending caps: the per-operation ceiling and the global budget
  // are from 2026-09-25; the per-user monthly quota was raised to $1 by the owner
  // on 2026-10-01 (was 50 cents).
  operationCeilingMicroUsd: bigint;
  ownerMonthlyQuotaMicroUsd: bigint;
  globalBudgetMicroUsd: bigint;
}>;

export const GPT6_LUNA: ProviderConfig = {
  provider: "openai",
  modelId: "gpt-6-luna",
  inputMicroUsdPerMTok: MICRO_USD_PER_DOLLAR / 10n, // $0.10
  outputMicroUsdPerMTok: MICRO_USD_PER_DOLLAR / 2n, // $0.50
  maxOutputTokens: 8_192,
  approvedPurposes: ["cover_letter", "job_matching", "extraction"],
  operationCeilingMicroUsd: MICRO_USD_PER_DOLLAR / 100n, // 1 cent per operation
  ownerMonthlyQuotaMicroUsd: MICRO_USD_PER_DOLLAR, // $1 per user per month
  globalBudgetMicroUsd: 10n * MICRO_USD_PER_DOLLAR, // $10 total for the environment
};

/** The budget row id of one owner. Exported so provisioning and reporting agree. */
export function ownerBudgetId(ownerId: string): string {
  return `${OWNER_BUDGET_PREFIX}/${ownerId}`;
}

// Worst-case cost for a token envelope (integer ceiling, spec SP 9):
// the maximum allowed path is reserved, not an average or expected spend.
export function worstCaseCostMicroUsd(params: Readonly<{
  inputTokens: number; outputTokens: number;
}>): bigint {
  // Prices are per million tokens; the ceiling division rounds each part up.
  const inputCost = (BigInt(params.inputTokens) * GPT6_LUNA.inputMicroUsdPerMTok +
    TOKENS_PER_MTOK - 1n) / TOKENS_PER_MTOK;
  const outputCost = (BigInt(params.outputTokens) * GPT6_LUNA.outputMicroUsdPerMTok +
    TOKENS_PER_MTOK - 1n) / TOKENS_PER_MTOK;
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
 * count, which is far above the token count for ordinary text in any script
 * (Cyrillic included); it is not a strict bound: a rare character (an emoji, some
 * CJK) can be several byte-level tokens, and the transport's system message and
 * chat framing add a few dozen tokens. Output is the transport's hard maximum,
 * because that is what the request permits. A call that costs more than this is
 * settled in full and frees no other operation's hold (B36).
 */
export function reservationFor(prompt: string): Readonly<{ inputTokens: number; outputTokens: number }> {
  return { inputTokens: prompt.length, outputTokens: GPT6_LUNA.maxOutputTokens };
}
