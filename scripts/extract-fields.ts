// Guarded field extraction for stored postings (design item C1).
//
//   npm run extract:fields -- --prompt-only --snapshot=himalayas:abc  — review tool
//   npm run extract:fields -- --source=himalayas [--limit=10]         — live run
//
// `--prompt-only` prints the exact prompt and the worst-case reservation for one
// posting and calls nothing (no flag, no key, no money needed) — the review
// surface for the prompt wording.
//
// The live run spends money, so it refuses before loading anything unless the
// owner's switch is on: LIVE_AI_ENABLED must be exactly "true" AND the provider
// key must be present (the flag is the switch; a key is not approval — AGENTS.md,
// docs/OPEN_GAPS.md A1). Every call goes through the same guarded entry point as
// everything else (purpose `extraction`, approved 2026-10-04), one operation per
// posting, and each posting's text is sent only if its source grants
// `send_to_ai_provider` at use time.
//
// Output is counts, ids and reason CODES: no posting text, no prompt text, no
// model output. A rejected record's reasons are codes with a path
// (src/domain/extraction.ts), so a failure is diagnosable without reading data.
import { ConfigurationError, localDatabaseUrl, readConfig } from "../src/server/config.ts";
import { localPool, migrate } from "./db.ts";
import { isJobSnapshot } from "../src/domain/source-contracts.ts";
import { extractionInstruction, EXTRACTION_PROMPT_VERSION } from "../src/domain/extraction.ts";
import { extractPostingFields, extractionKey } from "../src/server/ai/extraction-service.ts";
import { openAiTransport } from "../src/server/ai/openai-transport.ts";
import { buildJobOnlyPrompt } from "../src/server/ai/personal-data-boundary.ts";
import { ensureBudget, GLOBAL_BUDGET_ID } from "../src/server/ai/spending.ts";
import { GPT6_LUNA, ownerBudgetId, reservationFor, worstCaseCostMicroCents } from "../src/server/ai/provider.ts";
import { readSnapshotCardsData } from "../src/server/storage/snapshots.ts";
import { getSourcePolicy, permissionFor } from "../src/server/source-policies.ts";

/** A dedicated owner for the extractor: quotas are per owner, and this is not a candidate. */
const EXTRACTOR_OWNER_ID = "u_extraction_001";

function argValue(name: string): string | undefined {
  return process.argv.find(argument => argument.startsWith(`--${name}=`))?.slice(name.length + 3);
}

function numericArg(name: string): number | undefined {
  const raw = argValue(name);
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

try {
  readConfig(process.env);
  const pool = localPool(localDatabaseUrl(process.env.DATABASE_URL));
  await migrate(pool);
  const now = new Date().toISOString();
  const snapshotId = argValue("snapshot");

  if (snapshotId !== undefined) {
    const found = await pool.query("SELECT snapshot FROM job_snapshots WHERE id = $1", [snapshotId]);
    const row = found.rows[0] as { snapshot: unknown } | undefined;
    if (!row || !isJobSnapshot(row.snapshot)) {
      console.error(JSON.stringify({ ok: false, code: "SNAPSHOT_NOT_FOUND", snapshotId }));
      process.exitCode = 1;
    } else {
      const snapshot = row.snapshot;
      const prompt = buildJobOnlyPrompt({
        title: snapshot.title,
        company: snapshot.company_name,
        description: snapshot.description_text,
      }, extractionInstruction());
      const worstCase = worstCaseCostMicroCents(reservationFor(prompt));
      console.log(JSON.stringify({
        ok: true,
        mode: "prompt_only",
        snapshotId: snapshot.id,
        snapshotVersion: snapshot.version,
        promptVersion: EXTRACTION_PROMPT_VERSION,
        idempotencyKey: extractionKey(snapshot),
        prompt,
        worstCaseMicroCents: worstCase.toString(),
        operationCeilingMicroCents: GPT6_LUNA.operationCeilingMicroCents.toString(),
        note: "nothing was sent and nothing was spent: this prints the exact prompt and its reservation",
      }, null, 2));
      await pool.end();
      process.exit(0);
    }
    await pool.end();
  } else {
    const requested = argValue("source");
    const sources = requested
      ? [requested]
      : (await pool.query("SELECT DISTINCT source_id FROM job_snapshots ORDER BY source_id"))
        .rows.map(entry => (entry as { source_id: string }).source_id);

    // The owner's switch first, then the key: the flag is the switch, a key in
    // the environment is not approval (AGENTS.md).
    const liveAi = readConfig(process.env).liveAi;
    const hasKey = typeof process.env.OPENAI_API_KEY === "string" && process.env.OPENAI_API_KEY.length > 0;
    if (!liveAi || !hasKey) {
      console.log(JSON.stringify({
        ok: true,
        result: !liveAi ? "live_ai_disabled" : "provider_not_configured",
        note: "no call was attempted and nothing was spent; set LIVE_AI_ENABLED=true and provide the provider key"
          + " (the owner's switch, not the key, is the switch)",
        promptVersion: EXTRACTION_PROMPT_VERSION,
        hint: "review the prompt without spending: npm run extract:fields -- --prompt-only --snapshot=<id>",
      }));
      await pool.end();
      process.exit(0);
    }

    await ensureBudget({
      pool, budgetId: GLOBAL_BUDGET_ID, scope: "global",
      approvedLimitMinor: GPT6_LUNA.globalBudgetMicroCents,
    });
    await ensureBudget({
      pool, budgetId: ownerBudgetId(EXTRACTOR_OWNER_ID), scope: "owner", ownerId: EXTRACTOR_OWNER_ID,
      period: "monthly", approvedLimitMinor: GPT6_LUNA.ownerMonthlyQuotaMicroCents,
    });

    const limit = numericArg("limit");
    const tally = { extracted: 0, rejected: 0, already_extracted: 0, already_rejected: 0, unknown_source: 0, no_permission: 0, empty_text: 0 };
    const results: { snapshotId: string; status: string; codes?: readonly string[] }[] = [];
    let settledMicroCents = 0n;
    for (const sourceId of sources) {
      const policy = getSourcePolicy(sourceId);
      if (!policy) {
        tally.unknown_source += 1;
        results.push({ snapshotId: sourceId, status: "unknown_source" });
        continue;
      }
      if (permissionFor(policy, "send_to_ai_provider", now) !== "allowed") {
        tally.no_permission += 1;
        results.push({ snapshotId: sourceId, status: "no_permission" });
        continue;
      }
      const records = await readSnapshotCardsData(pool, sourceId);
      const sliced = limit === undefined ? records : records.slice(0, limit);
      for (const record of sliced) {
        const outcome = await extractPostingFields({
          pool, ownerId: EXTRACTOR_OWNER_ID, sourceId, snapshot: record.stored.snapshot,
          transport: openAiTransport, now,
        });
        tally[outcome.status] += 1;
        if ("provenance" in outcome) settledMicroCents += outcome.provenance.settledMinor;
        results.push({
          snapshotId: record.stored.snapshot.id,
          status: outcome.status,
          ...(outcome.status === "rejected" ? { codes: outcome.reasons.map(reason => reason.code) } : {}),
        });
      }
    }
    console.log(JSON.stringify({
      ok: true,
      result: "run_finished",
      promptVersion: EXTRACTION_PROMPT_VERSION,
      modelId: GPT6_LUNA.modelId,
      tally,
      settledMicroCents: settledMicroCents.toString(),
      results,
      note: "counts, ids and codes only: posting text, prompt text and model output are not printed",
    }, null, 2));
    await pool.end();
  }
} catch (error) {
  const code = error instanceof ConfigurationError ? error.message : "EXTRACT_FIELDS_FAILED";
  console.error(JSON.stringify({
    ok: false,
    code,
    detail: error instanceof Error && !(error instanceof ConfigurationError) ? error.message : null,
  }));
  process.exitCode = 1;
}
