// Owner-approved provider registration (AI-002, 2026-09-25).
// Prices are integer micro-cents per MILLION tokens; all cost math uses
// integer ceiling — never float (spec SP 9). The purpose whitelist is the
// ONLY set of operations this model may serve; everything else is refused.

export type ApprovedPurpose = "cover_letter";

export type ProviderConfig = Readonly<{
  provider: "openai";
  modelId: "gpt-6-luna";
  // Verified at developers.openai.com/api/docs/pricing on 2026-09-25:
  // short-context standard: input $0.10/MTok, output $0.50/MTok.
  inputMicroCentsPerMTok: bigint; // 10_000 ($0.10 → 10 cents → 10_000 micro-cents)
  outputMicroCentsPerMTok: bigint; // 50_000 ($0.50 → 50 cents → 50_000 micro-cents)
  maxOutputTokens: number;
  approvedPurposes: readonly ApprovedPurpose[];
  // Owner-approved spending caps (2026-09-25):
  operationCeilingMicroCents: bigint; // 1 cent per operation
  ownerMonthlyQuotaMicroCents: bigint; // 50 cents per user per month
  globalBudgetMicroCents: bigint; // $10 total for the environment
}>;

export const GPT6_LUNA: ProviderConfig = {
  provider: "openai",
  modelId: "gpt-6-luna",
  inputMicroCentsPerMTok: 10_000n,
  outputMicroCentsPerMTok: 50_000n,
  maxOutputTokens: 8_192,
  approvedPurposes: ["cover_letter"],
  operationCeilingMicroCents: 10_000n,
  ownerMonthlyQuotaMicroCents: 500_000n,
  globalBudgetMicroCents: 10_000_000n,
};

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
