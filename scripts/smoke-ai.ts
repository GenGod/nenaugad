// One-time live smoke: exactly one guarded AI call through the full stack.
// Verifies: budget reservation → real OpenAI dispatch → usage-based settlement.
import { localPool } from "./db.ts";
import { executeGuardedOperation } from "../src/server/ai/gateway.ts";
import { openAiTransport } from "../src/server/ai/openai-transport.ts";
import { GPT6_LUNA, worstCaseCostMicroCents } from "../src/server/ai/provider.ts";

const pool = localPool(process.env.DATABASE_URL);
const worstCase = worstCaseCostMicroCents({ inputTokens: 1000, outputTokens: 2000 });
console.log("worst-case:", worstCase.toString(), "micro-cents (ceiling:",
  GPT6_LUNA.operationCeilingMicroCents.toString() + ")");

try {
  const result = await executeGuardedOperation({
    pool,
    ownerId: "u_smoke_ai_001",
    taskType: "cover_letter",
    idempotencyKey: "smoke-" + Date.now(),
    worstCaseMinor: worstCase,
    transport: openAiTransport,
    now: new Date().toISOString(),
  });
  console.log("=== RESULT ===");
  console.log("status: settled");
  console.log("settledMinor:", result.settledMinor.toString());
  console.log("output (first 200):", result.output.slice(0, 200));
  const budget = await pool.query(
    "SELECT settled_minor, held_minor FROM ai_budgets WHERE id = $1",
    ["budget/global/total"],
  );
  const row = budget.rows[0] as { settled_minor: string; held_minor: string };
  console.log("budget after: settled=" + row.settled_minor + " held=" + row.held_minor);
  console.log("remaining:", (10000000 - Number(row.settled_minor)).toString(), "micro-cents");
} catch (error) {
  console.error("ERROR:", error instanceof Error ? error.constructor.name + ": " + error.message : String(error));
  const budget = await pool.query(
    "SELECT settled_minor, held_minor FROM ai_budgets WHERE id = $1",
    ["budget/global/total"],
  ).catch(() => ({ rows: [{ settled_minor: "?", held_minor: "?" }] }));
  const row = budget.rows[0] as { settled_minor: string; held_minor: string };
  console.log("budget after error: settled=" + row.settled_minor + " held=" + row.held_minor);
} finally {
  await pool.end().catch(() => undefined);
}
