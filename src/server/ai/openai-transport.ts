// Real OpenAI transport implementing the gateway's ModelTransport interface.
// Exactly ONE call per dispatch — the operation's attempt counter is the
// only retry budget (SDK maxRetries is set to 0 in the constructor).
// A network error, timeout, or any failure between send and response is
// `uncertain`: the hold is retained, the money may be spent, no blind retry.
import OpenAI from "openai";
import type { ModelTransport } from "./gateway.ts";
import type { OperationRow } from "./spending.ts";
import { GPT6_LUNA, worstCaseCostMicroCents } from "./provider.ts";

// Lazy client: never instantiated at module scope — the key is absent in
// test/CI environments by design (fail-closed).
let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (client === null) {
    client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY ?? "",
      maxRetries: 0, // SP 9: SDK auto-retry MUST be off
      timeout: 30_000,
    });
  }
  return client;
}

export function resetOpenAIClient(): void {
  client = null;
}

export function isOpenAIConfigured(): boolean {
  return typeof process.env.OPENAI_API_KEY === "string" &&
    process.env.OPENAI_API_KEY.length > 0;
}

export const openAiTransport: ModelTransport = {
  async dispatchOnce(operation: OperationRow, _attempt: number) {
    if (!isOpenAIConfigured()) {
      // No key configured: this is a configuration error, not uncertain
      // billing — nothing was sent. The gateway checks this before
      // reserving, so reaching here means a race; treat as uncertain to
      // stay conservative.
      return { kind: "uncertain" as const };
    }
    try {
      const completion = await getClient().chat.completions.create({
        model: GPT6_LUNA.modelId,
        messages: [
          { role: "system", content: "You are a careful cover letter generator. Output valid JSON only." },
          { role: "user", content: `Operation ${operation.id}, attempt ${operation.attemptCount}. Generate a cover letter draft.` },
        ],
        // GPT-6 models require max_completion_tokens (not max_tokens).
        max_completion_tokens: GPT6_LUNA.maxOutputTokens,
        response_format: { type: "json_object" },
      });
      const usage = completion.usage;
      if (!usage || usage.prompt_tokens === undefined || usage.completion_tokens === undefined) {
        // Response arrived but usage is missing: uncertain billing.
        return { kind: "uncertain" as const };
      }
      const actualMinor = worstCaseCostMicroCents({
        inputTokens: usage.prompt_tokens,
        outputTokens: usage.completion_tokens,
      });
      const output = completion.choices[0]?.message?.content ?? "";
      if (output.length === 0) {
        return { kind: "uncertain" as const };
      }
      return { kind: "result" as const, actualMinor, output };
    } catch {
      // Network error, timeout, rate limit, 5xx — anything between send
      // and a parseable response is uncertain billing (SP 9).
      return { kind: "uncertain" as const };
    }
  },
};
