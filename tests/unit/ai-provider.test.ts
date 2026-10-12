import assert from "node:assert/strict";
import { test } from "node:test";
import {
  GPT6_LUNA, MICRO_USD_PER_DOLLAR, worstCaseCostMicroUsd, isPurposeApproved, reservationFor,
} from "../../src/server/ai/provider.ts";
import {
  BatchDisabledError, isBatchEnabled, checkBatch, parseBatchOutput, retrieveBatchResults, submitBatch,
} from "../../src/server/ai/openai-batch.ts";
import { openAiTransport, usageCostMicroUsd } from "../../src/server/ai/openai-transport.ts";
import { IN_FLIGHT_GRACE_MS } from "../../src/server/ai/spending.ts";
import {
  PURPOSES_NEEDING_CANDIDATE_FACTS, PersonalDataBoundaryError, assertNoCandidateFacts, buildJobOnlyPrompt,
} from "../../src/server/ai/personal-data-boundary.ts";

test("provider config: the tariff and the caps count in one unit, micro-dollars (B35)", () => {
  assert.equal(GPT6_LUNA.provider, "openai");
  assert.equal(GPT6_LUNA.modelId, "gpt-6-luna");
  assert.equal(MICRO_USD_PER_DOLLAR, 1_000_000n);
  // developers.openai.com/api/docs/pricing, re-read 2026-10-07: gpt-6-luna, standard
  // short context, $0.10 per million input tokens and $0.50 per million output tokens.
  assert.equal(GPT6_LUNA.inputMicroUsdPerMTok, 100_000n); // $0.10
  assert.equal(GPT6_LUNA.outputMicroUsdPerMTok, 500_000n); // $0.50
  // The owner-approved caps, in the same unit.
  assert.equal(GPT6_LUNA.operationCeilingMicroUsd, 10_000n); // 1 cent
  assert.equal(GPT6_LUNA.ownerMonthlyQuotaMicroUsd, 1_000_000n); // $1 (owner decision 2026-10-01)
  assert.equal(GPT6_LUNA.globalBudgetMicroUsd, 10_000_000n); // $10
});

test("a million tokens cost what the pricing page says (B35)", () => {
  // The ledger used to book a tenth of this: the tariff was written as if a cent
  // were 1,000 units while the caps count 10,000 to the cent.
  assert.equal(worstCaseCostMicroUsd({ inputTokens: 1_000_000, outputTokens: 0 }), MICRO_USD_PER_DOLLAR / 10n);
  assert.equal(worstCaseCostMicroUsd({ inputTokens: 0, outputTokens: 1_000_000 }), MICRO_USD_PER_DOLLAR / 2n);
});

test("a call is settled at the page's price from the usage the provider reports (B35)", () => {
  // The path the defect lived on: the transport turns the reported tokens into the
  // amount the ledger settles.
  assert.equal(usageCostMicroUsd({ prompt_tokens: 1_000_000, completion_tokens: 0 }), 100_000n);
  assert.equal(usageCostMicroUsd({ prompt_tokens: 0, completion_tokens: 1_000_000 }), 500_000n);
  // A call like the first live run's: about 1,700 tokens in and 800 out, $0.00057.
  assert.equal(usageCostMicroUsd({ prompt_tokens: 1_700, completion_tokens: 800 }), 570n);
  // Missing usage is uncertain billing, never a free call.
  assert.equal(usageCostMicroUsd(undefined), null);
  assert.equal(usageCostMicroUsd({ prompt_tokens: 10 }), null);
});

test("worst-case cost uses integer ceiling, never float", () => {
  // 28K input + 6K output (cover letter envelope from SP 9)
  const cost = worstCaseCostMicroUsd({ inputTokens: 28_000, outputTokens: 6_000 });
  // 28000*100000/1000000 = 2800; 6000*500000/1000000 = 3000 → 5800 μ$ (0.58 cents)
  assert.equal(cost, 5_800n);
  // A single token rounds UP (conservative): 0.1 μ$ and 0.5 μ$ become 1 each.
  assert.equal(worstCaseCostMicroUsd({ inputTokens: 1, outputTokens: 1 }), 2n);
  // Zero tokens = zero
  assert.equal(worstCaseCostMicroUsd({ inputTokens: 0, outputTokens: 0 }), 0n);
  // The ceiling is not exceeded even at the token-envelope maximum
  assert.ok(cost <= GPT6_LUNA.operationCeilingMicroUsd,
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
  const cost = worstCaseCostMicroUsd(envelope);
  // 4000 in + 8192 out = 400 + 4096 = 4496 μ$ (0.45 cents), inside the 1-cent ceiling.
  assert.equal(cost, 4_496n);
  assert.ok(cost <= GPT6_LUNA.operationCeilingMicroUsd,
    "a realistic prompt's worst case must fit the per-operation ceiling");
  // The envelope is monotone in the prompt: a longer prompt never reserves less.
  assert.ok(worstCaseCostMicroUsd(reservationFor("x".repeat(9000)))
    > worstCaseCostMicroUsd(reservationFor("x".repeat(4000))));
  // The longest prompt the ceiling admits: 59,040 characters (5904 + 4096 = 10,000 μ$).
  // The longest posting on the local database (2026-10-07) is about 19,300 with the
  // instruction, about 0.6 cents.
  assert.equal(worstCaseCostMicroUsd(reservationFor("x".repeat(59_040))), GPT6_LUNA.operationCeilingMicroUsd);
  assert.ok(worstCaseCostMicroUsd(reservationFor("x".repeat(59_041))) > GPT6_LUNA.operationCeilingMicroUsd);
  assert.ok(worstCaseCostMicroUsd(reservationFor("x".repeat(19_400))) <= GPT6_LUNA.operationCeilingMicroUsd);
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

test("transport: a call ends well inside the ledger's in-flight grace and is never retried (B48)", async () => {
  // `ai:holds --settle` treats an operation still `in_flight` this long after its
  // dispatch as a crash. That is sound only while the transport bounds a call far
  // below the grace and never retries. Textual check: the client's options are private.
  const fs = await import("node:fs/promises");
  const text = await fs.readFile("src/server/ai/openai-transport.ts", "utf8");
  const timeout = Number(/\btimeout:\s*([0-9_]+)/u.exec(text)?.[1]?.replaceAll("_", ""));
  assert.ok(timeout > 0, "the transport sets a timeout");
  assert.match(text, /\bmaxRetries:\s*0\b/u);
  assert.ok(IN_FLIGHT_GRACE_MS >= 10 * timeout, `grace ${IN_FLIGHT_GRACE_MS} ms vs timeout ${timeout} ms`);
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
    reservedMinor: 0n, settledMinor: 0n, updatedAt: new Date().toISOString(),
  }, 1);
  assert.equal(result.kind, "uncertain");
});
