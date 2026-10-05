import assert from "node:assert/strict";
import { test } from "node:test";
import {
  GPT6_LUNA, worstCaseCostMicroCents, isPurposeApproved, reservationFor,
} from "../../src/server/ai/provider.ts";
import {
  BatchDisabledError, isBatchEnabled, checkBatch, parseBatchOutput, retrieveBatchResults, submitBatch,
} from "../../src/server/ai/openai-batch.ts";
import { openAiTransport } from "../../src/server/ai/openai-transport.ts";
import {
  PURPOSES_NEEDING_CANDIDATE_FACTS, PersonalDataBoundaryError, assertNoCandidateFacts, buildJobOnlyPrompt,
} from "../../src/server/ai/personal-data-boundary.ts";

test("provider config: GPT-6 Luna prices match the owner-approved tariff", () => {
  assert.equal(GPT6_LUNA.provider, "openai");
  assert.equal(GPT6_LUNA.modelId, "gpt-6-luna");
  assert.equal(GPT6_LUNA.inputMicroCentsPerMTok, 10_000n); // $0.10/MTok
  assert.equal(GPT6_LUNA.outputMicroCentsPerMTok, 50_000n); // $0.50/MTok
  assert.equal(GPT6_LUNA.operationCeilingMicroCents, 10_000n); // 1 cent
  assert.equal(GPT6_LUNA.ownerMonthlyQuotaMicroCents, 1_000_000n); // $1 (owner decision 2026-10-01)
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

test("purpose whitelist: cover_letter, job_matching and extraction are approved, nothing else", () => {
  // job_matching was approved by the owner on 2026-10-01; extraction on
  // 2026-10-04 (job-only, ≈0.03 cent per posting). The whitelist is enforced in
  // the gateway before dispatch (tests/integration/ai-guards.test.ts).
  assert.deepEqual([...GPT6_LUNA.approvedPurposes], ["cover_letter", "job_matching", "extraction"]);
  assert.equal(isPurposeApproved("cover_letter"), true);
  assert.equal(isPurposeApproved("job_matching"), true);
  assert.equal(isPurposeApproved("extraction"), true);
  assert.equal(isPurposeApproved("cv_extraction"), false);
  assert.equal(isPurposeApproved("job_extraction"), false);
  assert.equal(isPurposeApproved("anything_else"), false);
});

test("reservation bounds the request, not the expected answer (A4)", () => {
  // Input is bounded by the character count: no tokenizer emits more tokens than
  // characters, so this holds for Cyrillic text and for any future model too.
  const envelope = reservationFor("x".repeat(4000));
  assert.equal(envelope.inputTokens, 4000);
  // Output is the transport's hard maximum, because that is what the request may ask for.
  assert.equal(envelope.outputTokens, GPT6_LUNA.maxOutputTokens);
  const cost = worstCaseCostMicroCents(envelope);
  // 4000 in + 8192 out = 40 + 410 = 450 micro-cents, comfortably inside the 1-cent ceiling.
  assert.equal(cost, 450n);
  assert.ok(cost <= GPT6_LUNA.operationCeilingMicroCents,
    "a realistic prompt's worst case must fit the per-operation ceiling");
  // The envelope is monotone in the prompt: a longer prompt never reserves less.
  assert.ok(worstCaseCostMicroCents(reservationFor("x".repeat(9000)))
    > worstCaseCostMicroCents(reservationFor("x".repeat(4000))));
});

test("batch path is closed: nothing can reach a provider through it (C0 part 1)", async () => {
  // The batch path is off until it is brought behind the money guard; both locks
  // are asserted here — the switch and the throwing stubs.
  assert.equal(isBatchEnabled(), false);
  await assert.rejects(submitBatch([]), BatchDisabledError);
  await assert.rejects(checkBatch("batch_x"), BatchDisabledError);
  await assert.rejects(retrieveBatchResults("file_x", new Map()), BatchDisabledError);
});

test("batch output parser survives the closure: malformed lines and unknown ids are counted", () => {
  const mapping = new Map([["rel-a", "himalayas:a"]]);
  const text = [
    JSON.stringify({ custom_id: "rel-a",
      response: { body: { choices: [{ message: { content: JSON.stringify({
        score: 77, matched_skills: ["python"], missing_skills: [], explanation: "ok" }) } }] } } }),
    JSON.stringify({ custom_id: "rel-unknown", response: { body: { choices: [{ message: { content: "{}" } }] } } }),
    "{not json",
    JSON.stringify({ custom_id: "rel-a", response: { body: { choices: [{ message: { content: "not json either" } }] } } }),
  ].join("\n");
  const parsed = parseBatchOutput(text, mapping);
  // Four lines: one good score, one unknown custom id, one malformed line, and a
  // good envelope with an unparseable score (a missing score, not a crash).
  assert.equal(parsed.entries.length, 2);
  assert.equal(parsed.entries[0]?.score?.score, 77);
  assert.equal(parsed.entries[1]?.score, null);
  assert.equal(parsed.malformedLines, 1);
  assert.equal(parsed.unknownCustomIds, 1);
});

test("personal-data boundary: operations that need candidate facts are refused (owner 2026-10-01)", async () => {
  // All personal data stays inside the contour — otherwise the product risks being
  // banned under GDPR or similar law. The two shipped purposes cannot be expressed
  // without candidate facts, so both are refused; the gate is a switch, not a
  // blanket ban: `extraction` (approved 2026-10-04) is job-only and is listed
  // with an explicit `false` — a review record, not a missing row.
  assert.equal(PURPOSES_NEEDING_CANDIDATE_FACTS.cover_letter, true);
  assert.equal(PURPOSES_NEEDING_CANDIDATE_FACTS.job_matching, true);
  assert.equal(PURPOSES_NEEDING_CANDIDATE_FACTS.extraction, false);
  for (const purpose of ["cover_letter", "job_matching"]) {
    assert.throws(() => assertNoCandidateFacts(purpose), PersonalDataBoundaryError, purpose);
  }
  assert.doesNotThrow(() => assertNoCandidateFacts("extraction"));
  assert.doesNotThrow(() => assertNoCandidateFacts("job_only_rerank"));

  const prompt = buildJobOnlyPrompt(
    { title: "Backend Engineer", company: "Acme", description: "Python, postgres, remote." },
    "Rate this posting's clarity.",
  );
  assert.ok(prompt.includes("Python, postgres, remote."));
  assert.ok(!prompt.includes("candidate"));

  // The gate is only real if the paying call sites ask it: a boundary nobody calls
  // is the "dead approval" this project has been bitten by twice. Textual check on
  // purpose — the alternative is a route-level test harness that does not exist.
  const fs = await import("node:fs/promises");
  const callSites = [
    "src/app/api/v1/relevance/route.ts",
    "src/app/api/v1/cover-letters/[id]/generations/route.ts",
  ];
  for (const file of callSites) {
    const text = await fs.readFile(file, "utf8");
    assert.ok(text.includes("assertNoCandidateFacts("), `${file} must ask the personal-data boundary`);
  }
});

test("transport: unconfigured provider reports uncertain (fail-closed)", async () => {
  // No OPENAI_API_KEY in the test environment by design.
  delete process.env.OPENAI_API_KEY;
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
