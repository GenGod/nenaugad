// Guarded field extraction for stored postings (design item C1).
//
//   npm run extract:fields -- --prompt-only --snapshot=himalayas:abc  — review tool
//   npm run extract:fields -- --source=himalayas [--limit=10]         — live run
//
// `--limit` is the most provider calls per source (B32-001); without --source it
// applies to each source in turn. A malformed limit is refused, not ignored.
//
// `--prompt-only` prints the exact prompt and the worst-case reservation for one
// posting and calls nothing (no flag, no key, no money needed) — the review
// surface for the prompt wording.
//
// The live run spends money, so it refuses before loading anything unless the
// owner's switch is on: LIVE_AI_ENABLED must be exactly "true" AND the provider
// key must be present (the flag is the switch; a key is not approval — AGENTS.md,
// docs/OPEN_GAPS.md A1). The run itself is the SAME pass the worker uses
// (src/server/ai/extraction-pass.ts): approved purpose `extraction`, one
// operation per posting, per-source `send_to_ai_provider` asked at use time,
// stored records answering repeats. Its budget row is provisioned explicitly by
// `npm run seed:budgets` — the CLI does not provision money on its own.
//
// Output is counts, ids and reason CODES: no posting text, no prompt text, no
// model output. A rejected record's reasons are codes with a path
// (src/domain/extraction.ts), so a failure is diagnosable without reading data.
import { ConfigurationError, localDatabaseUrl, readConfig } from "../src/server/config.ts";
import { localPool, migrate } from "./db.ts";
import { limitArg } from "./cli-limit.ts";
import { isJobSnapshot } from "../src/domain/source-contracts.ts";
import { extractionInstruction, EXTRACTION_PROMPT_VERSION } from "../src/domain/extraction.ts";
import { extractionKey } from "../src/server/ai/extraction-service.ts";
import {
  failureCode, holdHint, runExtractionPass, summarizeExtractionPass,
} from "../src/server/ai/extraction-pass.ts";
import { openAiTransport } from "../src/server/ai/openai-transport.ts";
import { buildJobOnlyPrompt } from "../src/server/ai/personal-data-boundary.ts";
import { GPT6_LUNA, reservationFor, worstCaseCostMicroUsd } from "../src/server/ai/provider.ts";

function argValue(name: string): string | undefined {
  return process.argv.find(argument => argument.startsWith(`--${name}=`))?.slice(name.length + 3);
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
      const worstCase = worstCaseCostMicroUsd(reservationFor(prompt));
      console.log(JSON.stringify({
        ok: true,
        mode: "prompt_only",
        snapshotId: snapshot.id,
        snapshotVersion: snapshot.version,
        promptVersion: EXTRACTION_PROMPT_VERSION,
        idempotencyKey: extractionKey(snapshot),
        prompt,
        worstCaseMicroUsd: worstCase.toString(),
        operationCeilingMicroUsd: GPT6_LUNA.operationCeilingMicroUsd.toString(),
        note: "nothing was sent and nothing was spent: this prints the exact prompt and its reservation",
      }, null, 2));
      await pool.end();
      process.exit(0);
    }
    await pool.end();
  } else {
    // A malformed --limit used to run the whole catalog (B32-001): it is refused
    // first, so the owner learns it before the switch is ever on.
    const limitArgument = limitArg(process.argv);
    if (!limitArgument.ok) {
      console.error(JSON.stringify({
        ok: false, code: "INVALID_LIMIT",
        hint: "--limit=<positive integer>: the most provider calls per source",
      }));
      await pool.end();
      process.exit(1);
    }
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

    const requested = argValue("source");
    const sources = requested
      ? [requested]
      : (await pool.query("SELECT DISTINCT source_id FROM job_snapshots ORDER BY source_id"))
        .rows.map(entry => (entry as { source_id: string }).source_id);
    const limit = limitArgument.limit;

    const passes: Record<string, unknown>[] = [];
    let budgetRefused = false;
    let heldHint: string | undefined;
    for (const sourceId of sources) {
      const pass = await runExtractionPass({
        pool, sourceId, transport: openAiTransport, now, limit,
      });
      if (pass.outcome === "budget_refused") budgetRefused = true;
      if (pass.held) heldHint ??= holdHint(pass.held, now);
      passes.push({ ...summarizeExtractionPass(pass), results: pass.results });
    }
    console.log(JSON.stringify({
      ok: true,
      result: "run_finished",
      promptVersion: EXTRACTION_PROMPT_VERSION,
      modelId: GPT6_LUNA.modelId,
      passes,
      note: "counts, ids and codes only: posting text, prompt text and model output are not printed",
      ...(budgetRefused ? { hint: "the extractor's budget row is missing or exhausted: run npm run seed:budgets" } : {}),
      ...(heldHint === undefined ? {} : { holdHint: heldHint }),
    }, null, 2));
    await pool.end();
  }
} catch (error) {
  // A configuration error's message is its code. Any other message can quote the
  // data the error met, posting text included, so only a code is printed (B33).
  const code = error instanceof ConfigurationError ? error.message : "EXTRACT_FIELDS_FAILED";
  console.error(JSON.stringify({
    ok: false,
    code,
    detail: error instanceof ConfigurationError ? null : failureCode(error),
  }));
  process.exitCode = 1;
}
