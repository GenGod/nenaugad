// Local generative model evaluation (task MODEL-001, owner decision No 4, item 2).
//
//   npm run eval:local-llm             — run the shipped rubric with the LOCAL model
//   npm run eval:local-llm -- --json   — machine-readable report
//   npm run eval:local-llm -- --limit=4
//
// What this measures, precisely: whether a local generative model, on THIS
// machine and with the runtime already installed (@huggingface/transformers +
// onnxruntime-node — no new dependency), can serve the SHIPPED relevance rubric
// (buildSinglePrompt) inside the personal-data contour. It reports JSON
// validity of the answers, score ordering against the hand-written golden
// grades, generation speed and memory. It is the feasibility spike the owner's
// batch/scoring decision waits on — NOT a product path and NOT a benchmark of
// the model in general: eight pairs of one profile are a first honest read, not
// a quality claim.
//
// Boundaries, for the same reasons the embedding loader has them: the artifact
// is loaded from models/<repository>/ with remote loading off (no request-time
// downloads), no database, no network; the candidate is already fetched and
// hash-verified by scripts/models-fetch-llm.ts.
import path from "node:path";
import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { GOLDEN_SET } from "../src/data/matching-golden.ts";
import { buildSinglePrompt, parseRelevanceResponse } from "../src/server/relevance-service.ts";

const REPO_ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const MODEL_ROOT = path.join(REPO_ROOT, "models");

/** Literal candidate directories and repositories: the argument never forms a path. */
const CANDIDATE_MODELS = {
  "qwen3-1.7b": {
    repository: "onnx-community/Qwen3-1.7B-ONNX",
    directory: path.join(MODEL_ROOT, "onnx-community", "Qwen3-1.7B-ONNX"),
    note: "thinking model; the /no_think soft switch and the template's empty think block are both applied",
  },
  "qwen2.5-1.5b": {
    repository: "onnx-community/Qwen2.5-1.5B-Instruct",
    directory: path.join(MODEL_ROOT, "onnx-community", "Qwen2.5-1.5B-Instruct"),
    note: "instruct model without a thinking mode",
  },
} as const;

type CandidateKey = keyof typeof CANDIDATE_MODELS;

/** Greedy decoding: the same inputs must give the same answer (determinism). */
const DEFAULT_MAX_NEW_TOKENS = 400;

/**
 * The strict variant of the shipped rubric: one added instruction. The shipped
 * prompt was written for a strong hosted model; a small local model that narrates
 * instead of answering may need to be told to answer only. Measured condition.
 */
const STRICT_SUFFIX = "\n\nReturn the JSON object only — no commentary, no reasoning.";

/**
 * JSON prefill (the `--prefill-json` condition): the prompt is rendered, then the
 * assistant turn is opened with the start of the object. This is what a serving
 * wrapper does when a small model narrates instead of answering — it is a
 * measured condition, clearly different from the shipped rubric, not a claim
 * that the shipped rubric works.
 */
const JSON_PREFILL = "{\"score\": ";

/** One profile, eight postings across the whole grade range (0..3). */
const PROFILE_ID = "p-ru-ml";
const PAIR_IDS = [
  "golden-j10", "golden-j36", "golden-j11", "golden-j21",
  "golden-j25", "golden-j35", "golden-j18", "golden-j28",
] as const;

type Row = Readonly<{
  id: string;
  grade: number;
  score: number | null;
  parse: "json_strict" | "json_extracted" | "invalid";
  outputTokens: number;
  seconds: number;
  tokensPerSecond: number;
  explanation: string;
}>;

function pearson(left: readonly number[], right: readonly number[]): number | null {
  const n = left.length;
  if (n < 3) return null;
  const meanL = left.reduce((sum, value) => sum + value, 0) / n;
  const meanR = right.reduce((sum, value) => sum + value, 0) / n;
  let cov = 0; let varL = 0; let varR = 0;
  for (let index = 0; index < n; index += 1) {
    const dl = (left[index] ?? 0) - meanL;
    const dr = (right[index] ?? 0) - meanR;
    cov += dl * dr; varL += dl * dl; varR += dr * dr;
  }
  if (varL === 0 || varR === 0) return null;
  return cov / Math.sqrt(varL * varR);
}

/** Ranks with ties averaged, then Pearson on the ranks = Spearman. */
function spearman(scores: readonly number[], grades: readonly number[]): number | null {
  const rank = (values: readonly number[]): number[] => {
    const order = values.map((value, index) => ({ value, index }))
      .sort((a, b) => a.value - b.value);
    const ranks = new Array<number>(values.length).fill(0);
    let start = 0;
    while (start < order.length) {
      let end = start;
      while (end + 1 < order.length && order[end + 1]!.value === order[start]!.value) end += 1;
      const average = (start + end) / 2 + 1;
      for (let index = start; index <= end; index += 1) ranks[order[index]!.index] = average;
      start = end + 1;
    }
    return ranks;
  };
  return pearson(rank(scores), rank(grades));
}

function extractJsonObject(raw: string): string | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  return raw.slice(start, end + 1);
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const showRaw = args.includes("--show-raw");
  const strict = args.includes("--strict");
  const prefillJson = args.includes("--prefill-json");
  const requestedModel = args.find(argument => argument.startsWith("--model="))?.slice("--model=".length);
  const candidates: readonly string[] = Object.keys(CANDIDATE_MODELS);
  if (requestedModel !== undefined && !candidates.includes(requestedModel)) {
    console.error(`Unknown model: ${requestedModel}. Known: ${candidates.join(", ")}`);
    return 2;
  }
  const modelKey: CandidateKey = (requestedModel ?? "qwen3-1.7b") as CandidateKey;
  const candidate = CANDIDATE_MODELS[modelKey];
  const weightFile = path.join(candidate.directory, "onnx", "model_quantized.onnx");
  const maxTokens = Number(args.find(argument => argument.startsWith("--max-tokens="))?.slice("--max-tokens=".length) ?? DEFAULT_MAX_NEW_TOKENS);
  const limit = Number(args.find(argument => argument.startsWith("--limit="))?.slice("--limit=".length) ?? PAIR_IDS.length);

  try {
    await access(weightFile);
  } catch {
    console.error(`The candidate model is not on disk (${weightFile}). Run npm run models:fetch-llm first;`
      + " this command will not download weights at run time.");
    return 2;
  }

  const golden = GOLDEN_SET.profiles.find(profile => profile.id === PROFILE_ID);
  const judgments = GOLDEN_SET.judgments.find(judgment => judgment.profileId === PROFILE_ID);
  if (!golden || !judgments) {
    console.error(`PROFILE_NOT_FOUND: ${PROFILE_ID}`);
    return 2;
  }
  const pairs = PAIR_IDS.slice(0, limit).map(id => {
    const job = GOLDEN_SET.jobs.find(entry => entry.snapshot.id === id);
    if (!job) throw new Error(`GOLDEN_JOB_NOT_FOUND: ${id}`);
    return { id, job, grade: judgments.grades[id] ?? 0 };
  });

  console.log(`Candidate: ${candidate.repository} (q8, CPU) · profile ${PROFILE_ID} · ${pairs.length} pairs`);
  console.log(`Model dir: models/${candidate.repository}`);
  console.log(`Note:      ${candidate.note}`);

  const transformers = await import("@huggingface/transformers") as unknown as {
    env: { allowRemoteModels: boolean; allowLocalModels: boolean; localModelPath: string };
    AutoTokenizer: { from_pretrained: (id: string, options: Record<string, unknown>) => Promise<{
      apply_chat_template: (conversation: unknown, options: Record<string, unknown>) => string;
      (text: string): Promise<{ input_ids: { dims: readonly number[] } }>;
      batch_decode: (tensor: unknown, options: Record<string, unknown>) => string[];
    }> };
    AutoModelForCausalLM: { from_pretrained: (id: string, options: Record<string, unknown>) => Promise<{
      generate: (options: Record<string, unknown>) => Promise<{
        dims: readonly number[];
        slice: (axis0: null, axis1: readonly number[]) => unknown;
      }>;
    }> };
  };

  // Off by default upstream and off explicitly here: the artifact is local.
  transformers.env.allowRemoteModels = false;
  transformers.env.allowLocalModels = true;
  transformers.env.localModelPath = MODEL_ROOT;

  const loadStart = Date.now();
  const tokenizer = await transformers.AutoTokenizer.from_pretrained(candidate.repository, { local_files_only: true });
  const model = await transformers.AutoModelForCausalLM.from_pretrained(candidate.repository, {
    dtype: "q8", local_files_only: true,
  });
  const loadMs = Date.now() - loadStart;
  const rssAfterLoadMb = Math.round(process.memoryUsage().rss / 1024 / 1024);

  const rows: Row[] = [];
  const started = Date.now();
  for (const pair of pairs) {
    const snapshot = pair.job.snapshot;
    const rubric = buildSinglePrompt(
      { title: snapshot.title, company: snapshot.company_name, description: snapshot.description_text },
      { targetRoles: golden.profile.targetRoles, country: golden.profile.residenceCountry ?? "не указана",
        skills: golden.profile.skills },
    );
    const prompt = strict ? rubric + STRICT_SUFFIX : rubric;
    // The soft switch belongs to the thinking model; the non-thinking candidate
    // gets the plain rubric.
    const conversation = [{ role: "user", content: modelKey === "qwen3-1.7b" ? `${prompt}\n\n/no_think` : prompt }];
    let rendered: string;
    try {
      rendered = tokenizer.apply_chat_template(conversation, {
        tokenize: false, add_generation_prompt: true, enable_thinking: false,
      });
    } catch {
      // The template refuses the extra switch: the "/no_think" marker above is
      // the model's own soft switch.
      rendered = tokenizer.apply_chat_template(conversation, { tokenize: false, add_generation_prompt: true });
    }
    const inputs = await tokenizer(rendered + (prefillJson ? JSON_PREFILL : ""));
    const inputTokens = inputs.input_ids.dims[1] ?? 0;
    const generationStart = Date.now();
    const output = await model.generate({
      ...inputs, max_new_tokens: maxTokens, do_sample: false,
    });
    const seconds = (Date.now() - generationStart) / 1000;
    const outputTokens = (output.dims[1] ?? inputTokens) - inputTokens;
    const decoded = tokenizer.batch_decode(
      output.slice(null, [inputTokens, output.dims[1] ?? inputTokens]),
      { skip_special_tokens: true },
    )[0] ?? "";
    // The prefill text came from us, not from the model: put it back so the
    // parser sees the whole object.
    const raw = prefillJson ? JSON_PREFILL + decoded : decoded;

    let parsed = parseRelevanceResponse(raw);
    let parse: Row["parse"] = parsed ? "json_strict" : "invalid";
    if (!parsed) {
      const fragment = extractJsonObject(raw);
      if (fragment) {
        parsed = parseRelevanceResponse(fragment);
        if (parsed) parse = "json_extracted";
      }
    }
    if (!parsed) {
      // A reasoning model tends to answer AFTER its commentary; take the last
      // balanced-ish object before giving up (still validated by the parser).
      const lastStart = raw.lastIndexOf("{");
      const lastEnd = raw.lastIndexOf("}");
      if (lastStart !== -1 && lastEnd > lastStart) {
        parsed = parseRelevanceResponse(raw.slice(lastStart, lastEnd + 1));
        if (parsed) parse = "json_extracted";
      }
    }
    const row: Row = {
      id: pair.id, grade: pair.grade, score: parsed?.score ?? null, parse,
      outputTokens, seconds: Math.round(seconds * 10) / 10,
      tokensPerSecond: seconds > 0 ? Math.round((outputTokens / seconds) * 10) / 10 : 0,
      explanation: (parsed?.explanation ?? raw.replace(/\s+/gu, " ").slice(0, 120)),
    };
    rows.push(row);
    console.log(`${row.id}  grade ${row.grade}  score ${row.score ?? "—"}  ${row.parse}`
      + `  ${row.seconds}s  ${row.tokensPerSecond} tok/s  ${row.outputTokens} out-tokens`);
    if (showRaw) console.log(`    raw: ${raw.replace(/\s+/gu, " ").slice(0, 600)}`);
  }
  const totalSeconds = (Date.now() - started) / 1000;
  const rssPeakMb = Math.round(process.memoryUsage().rss / 1024 / 1024);

  const scored = rows.filter(row => row.score !== null);
  const validShare = rows.length === 0 ? 0 : scored.length / rows.length;
  const meanTokensPerSecond = rows.length === 0
    ? 0 : rows.reduce((sum, row) => sum + row.tokensPerSecond, 0) / rows.length;
  const correlation = spearman(
    scored.map(row => row.score ?? 0),
    scored.map(row => row.grade),
  );

  const report = {
    candidate: candidate.repository, modelKey, dtype: "q8",
    condition: prefillJson ? "prefill-json" : strict ? "strict" : "shipped",
    runtime: "@huggingface/transformers (installed) + onnxruntime-node",
    profileId: PROFILE_ID,
    loadMs, rssAfterLoadMb, rssPeakMb, totalSeconds: Math.round(totalSeconds * 10) / 10,
    validShare: Math.round(validShare * 1000) / 1000,
    meanTokensPerSecond: Math.round(meanTokensPerSecond * 10) / 10,
    spearmanScoresVsGrades: correlation === null ? null : Math.round(correlation * 1000) / 1000,
    rows,
  };
  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`\nLoad ${(loadMs / 1000).toFixed(1)}s · RSS after load ${rssAfterLoadMb} MB, peak ${rssPeakMb} MB`);
    console.log(`Valid JSON: ${(validShare * 100).toFixed(0)}% (${scored.length}/${rows.length})`
      + ` · mean ${meanTokensPerSecond.toFixed(1)} tok/s · total ${totalSeconds.toFixed(0)}s`);
    console.log(`Spearman(scores vs hand grades): ${correlation === null ? "n/a" : correlation.toFixed(3)}`
      + " — a first read from eight pairs, not a quality claim.");
    console.log("Local model, inside the contour: no request leaves this machine.");
  }
  return scored.length === 0 ? 1 : 0;
}

try {
  process.exitCode = await main();
} catch (error) {
  console.error(`eval:local-llm could not run: ${error instanceof Error ? error.message : "unknown"}`);
  process.exitCode = 2;
}
