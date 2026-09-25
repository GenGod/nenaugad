import assert from "node:assert/strict";
import { test } from "node:test";
import {
  GPT6_LUNA, worstCaseCostMicroCents, isPurposeApproved,
} from "../../src/server/ai/provider.ts";
import { isOpenAIConfigured, resetOpenAIClient, openAiTransport } from "../../src/server/ai/openai-transport.ts";

test("provider config: GPT-6 Luna prices match the owner-approved tariff", () => {
  assert.equal(GPT6_LUNA.provider, "openai");
  assert.equal(GPT6_LUNA.modelId, "gpt-6-luna");
  assert.equal(GPT6_LUNA.inputMicroCentsPerMTok, 10_000n); // $0.10/MTok
  assert.equal(GPT6_LUNA.outputMicroCentsPerMTok, 50_000n); // $0.50/MTok
  assert.equal(GPT6_LUNA.operationCeilingMicroCents, 10_000n); // 1 cent
  assert.equal(GPT6_LUNA.ownerMonthlyQuotaMicroCents, 500_000n); // 50 cents
  assert.equal(GPT6_LUNA.globalBudgetMicroCents, 10_000_000n); // $10
});

test("worst-case cost uses integer ceiling, never float", () => {
  // 28K input + 6K output (cover letter envelope from SP 9)
  const cost = worstCaseCostMicroCents({ inputTokens: 28_000, outputTokens: 6_000 });
  // 28000*10000/1000000 = 280; 6000*50000/1000000 = 300 → 580 micro-cents
  assert.equal(cost, 580n);
  // Single token rounds UP (conservative)
  const single = worstCaseCostMicroCents({ inputTokens: 1, outputTokens: 1 });
  assert.ok(single >= 1n, "a single token must cost at least 1 micro-cent (ceil)");
  // Zero tokens = zero
  assert.equal(worstCaseCostMicroCents({ inputTokens: 0, outputTokens: 0 }), 0n);
  // The ceiling is not exceeded even at the token-envelope maximum
  const envelope = worstCaseCostMicroCents({ inputTokens: 28_000, outputTokens: 6_000 });
  assert.ok(envelope <= GPT6_LUNA.operationCeilingMicroCents,
    "worst case must fit inside the 1-cent ceiling");
});

test("purpose whitelist: only cover_letter is approved", () => {
  assert.equal(isPurposeApproved("cover_letter"), true);
  assert.equal(isPurposeApproved("cv_extraction"), false);
  assert.equal(isPurposeApproved("job_extraction"), false);
  assert.equal(isPurposeApproved("anything_else"), false);
});

test("transport: unconfigured provider reports uncertain (fail-closed)", async () => {
  // No OPENAI_API_KEY in the test environment by design.
  delete process.env.OPENAI_API_KEY;
  resetOpenAIClient();
  assert.equal(isOpenAIConfigured(), false);
  // The transport returns uncertain without crashing — the gateway will
  // handle it as a hold-retained refusal.
  const result = await openAiTransport.dispatchOnce({
    id: "op_test", ownerId: "u_test", taskType: "cover_letter",
    idempotencyKey: "k", status: "in_flight", attemptCount: 1,
    inputHash: "h", deadlineAt: new Date().toISOString(),
    reservedMinor: 0n, settledMinor: 0n,
  }, 1);
  assert.equal(result.kind, "uncertain");
});
