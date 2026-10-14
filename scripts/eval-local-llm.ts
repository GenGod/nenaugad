// Local generative model evaluation (task MODEL-001, owner decision No 4, item 2).
//
//   npm run eval:local-llm             — run the shipped rubric with the LOCAL model
//   npm run eval:local-llm -- --json   — machine-readable report
//   npm run eval:local-llm -- --limit=4
//
// MODEL-002 (owner approval 2026-10-13): the same matrix on the GPU, through a
// llama.cpp `llama-server` started by hand on the fixed loopback endpoint below
// with one of the GGUF candidates (npm run models:fetch-gpu):
//
//   npm run eval:local-llm -- --transport=llama-server --model=qwen3-vl-8b
//   ... --pairs=all          — all 39 graded pairs of the profile, not the 8
//   ... --json-schema        — llama.cpp's JSON-schema constraint (a measured condition)
//   ... --task=letters       — the letter leg: the shipped prompt and validator
//
// MODEL-003: a role check before the skill rating, against a held-out split:
//
//   ... --profile=p-backend-eu        — another golden-set profile (p-ru-ml by default)
//   ... --rubric=role-gate|role-first — a variant of the shipped rubric (below)
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
import { spawnSync } from "node:child_process";
import { GOLDEN_SET } from "../src/data/matching-golden.ts";
import { buildSinglePrompt, parseRelevanceResponse } from "../src/server/relevance-service.ts";
import { buildLetterPrompt, letterJobExcerpt } from "../src/server/letters/prompt.ts";
import { validateLetter } from "../src/server/letters/validator.ts";

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

/**
 * MODEL-002's GGUF candidates. They are loaded by llama-server, not by this script:
 * the script only checks that the server holds the file it names.
 */
const GPU_CANDIDATES = {
  "qwen3-vl-8b": {
    repository: "Qwen/Qwen3-VL-8B-Instruct-GGUF", file: "Qwen3VL-8B-Instruct-Q4_K_M.gguf", thinking: false,
    note: "instruct model without a thinking mode; text weights only",
  },
  "qwen3-8b": {
    repository: "Qwen/Qwen3-8B-GGUF", file: "Qwen3-8B-Q4_K_M.gguf", thinking: true,
    note: "hybrid thinking model; /no_think and enable_thinking=false are both applied",
  },
} as const;

type GpuCandidateKey = keyof typeof GPU_CANDIDATES;

/** The only endpoint the GPU transport talks to: loopback, a fixed port. */
const LLAMA_SERVER = "http://127.0.0.1:8089";

/** The shipped answer shape as a JSON schema, for the `--json-schema` condition. */
const RELEVANCE_SCHEMA = {
  type: "object",
  properties: {
    score: { type: "integer", minimum: 0, maximum: 100 },
    matched_skills: { type: "array", items: { type: "string" } },
    missing_skills: { type: "array", items: { type: "string" } },
    explanation: { type: "string" },
  },
  required: ["score", "matched_skills", "missing_skills", "explanation"],
  additionalProperties: false,
} as const;

/** MODEL-002's go thresholds, fixed before measuring (owner approval 2026-10-13). */
const GO = { minSpearman: 0.6, maxGradeZeroScore: 49, maxMedianSeconds: 15 } as const;

/**
 * MODEL-003's rubric variants. Each keeps the shipped rubric's candidate and job lines and
 * replaces its rating instructions with a role check first. The wording is generic on
 * purpose: it names no job of the golden set (tasks/MODEL-003-role-aware-rubric.md).
 */
const ROLE_CHECK = "First decide whether the job's own role — the work the person hired will do day to day — is one of the candidate's target roles or a close variant of one. A job that names the candidate's skills but hires for a different kind of work is not a role match.\n"
  + "If it is not a role match, the score is at most 20, whatever the skills.\n"
  + "If it is a role match, rate relevance 0-100 by how well the candidate's confirmed skills match the job requirements. Identify which specific skills matched and which are missing.\n";
const RUBRIC_VARIANTS = {
  "role-gate": `${ROLE_CHECK}Return JSON: {"role_match": <true|false>, "score": <0-100>, "matched_skills": [...], "missing_skills": [...], "explanation": "..."}`,
  "role-first": `${ROLE_CHECK}Return JSON: {"job_role": "<the job's own role in a few words>", "role_match": <true|false>, "score": <0-100>, "matched_skills": [...], "missing_skills": [...], "explanation": "..."}`,
} as const;

type RubricKey = "shipped" | keyof typeof RUBRIC_VARIANTS;

/** The shipped rubric, or a variant built on its candidate and job lines. */
function applyRubric(shipped: string, rubric: RubricKey): string {
  if (rubric === "shipped") return shipped;
  const cut = shipped.indexOf("\n\nRate relevance");
  if (cut === -1) throw new Error("SHIPPED_RUBRIC_CHANGED: the variants are built on its candidate and job lines");
  return `${shipped.slice(0, cut)}\n\n${RUBRIC_VARIANTS[rubric]}`;
}

/** A variant's `role_match`, read from the answer's object; null if absent. */
function roleMatchOf(raw: string): boolean | null {
  const fragment = extractJsonObject(raw);
  if (!fragment) return null;
  try {
    const value = (JSON.parse(fragment) as { role_match?: unknown }).role_match;
    return typeof value === "boolean" ? value : null;
  } catch {
    return null;
  }
}

/** The letter leg: three synthetic golden-set profiles, each with its two best-graded jobs. */
const LETTER_PROFILE_IDS = ["p-ru-ml", "p-backend-eu", "p-frontend-latam"] as const;

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

/** The shipped parser first, then the object inside the text, then the last object. */
function parseAnswer(raw: string): Readonly<{ parsed: ReturnType<typeof parseRelevanceResponse>; parse: Row["parse"] }> {
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
  return { parsed, parse };
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : ((sorted[middle - 1]! + sorted[middle]!) / 2);
}

type ServerAnswer = Readonly<{ raw: string; outputTokens: number; promptTokens: number; seconds: number; tokensPerSecond: number }>;

async function serverPost(pathname: string, body: unknown): Promise<Record<string, unknown>> {
  const response = await fetch(`${LLAMA_SERVER}${pathname}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    signal: AbortSignal.timeout(10 * 60 * 1000),
  });
  if (!response.ok) throw new Error(`LLAMA_SERVER_${response.status} ${pathname}`);
  return await response.json() as Record<string, unknown>;
}

/** One greedy generation on the server: the chat template, then the completion. */
async function serverGenerate(params: Readonly<{
  prompt: string; thinking: boolean; maxTokens: number; prefill: string; jsonSchema: unknown;
}>): Promise<ServerAnswer> {
  const content = params.thinking ? `${params.prompt}\n\n/no_think` : params.prompt;
  const template = await serverPost("/apply-template", {
    messages: [{ role: "user", content }], chat_template_kwargs: { enable_thinking: false },
  });
  const rendered = String(template.prompt ?? "");
  if (rendered.length === 0) throw new Error("LLAMA_SERVER_EMPTY_TEMPLATE");
  const started = Date.now();
  const result = await serverPost("/completion", {
    prompt: rendered + params.prefill, n_predict: params.maxTokens,
    temperature: 0, top_k: 1, seed: 42, cache_prompt: false,
    ...(params.jsonSchema === null ? {} : { json_schema: params.jsonSchema }),
  });
  const seconds = (Date.now() - started) / 1000;
  const timings = (result.timings ?? {}) as { predicted_per_second?: number };
  return {
    raw: params.prefill + String(result.content ?? ""),
    outputTokens: Number(result.tokens_predicted ?? 0),
    promptTokens: Number(result.tokens_evaluated ?? 0),
    seconds,
    tokensPerSecond: Math.round((timings.predicted_per_second ?? 0) * 10) / 10,
  };
}

/** Whole-GPU memory in use now (nvidia-smi), MiB; null if it cannot be read. */
function gpuMemoryUsedMb(): number | null {
  const result = spawnSync("nvidia-smi", ["--query-gpu=memory.used", "--format=csv,noheader,nounits"], { encoding: "utf8" });
  const value = Number(result.stdout?.trim().split(/\s+/u)[0]);
  return result.status === 0 && Number.isFinite(value) ? value : null;
}

/** The server must hold the candidate this run names, or the numbers would be someone else's. */
async function checkServerModel(file: string): Promise<string | null> {
  try {
    const response = await fetch(`${LLAMA_SERVER}/props`, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return `llama-server answered ${response.status} on /props`;
    const props = await response.json() as { model_path?: unknown };
    const modelPath = String(props.model_path ?? "");
    return modelPath.replace(/\\/gu, "/").endsWith(`/${file}`) ? null
      : `llama-server holds ${path.basename(modelPath) || "an unknown model"}, not ${file}`;
  } catch {
    return `llama-server is not reachable on ${LLAMA_SERVER} (start it first; see tasks/MODEL-002-gpu-spike.md)`;
  }
}

async function runOnServer(args: readonly string[]): Promise<number> {
  const asJson = args.includes("--json");
  const showRaw = args.includes("--show-raw");
  const strict = args.includes("--strict");
  const prefillJson = args.includes("--prefill-json");
  const jsonSchema = args.includes("--json-schema");
  const letters = args.includes("--task=letters");
  const requestedModel = args.find(argument => argument.startsWith("--model="))?.slice("--model=".length);
  const candidates: readonly string[] = Object.keys(GPU_CANDIDATES);
  if (requestedModel === undefined || !candidates.includes(requestedModel)) {
    console.error(`--transport=llama-server needs --model= one of: ${candidates.join(", ")}`);
    return 2;
  }
  if (prefillJson && jsonSchema) {
    console.error("--prefill-json and --json-schema are separate conditions; pick one.");
    return 2;
  }
  const modelKey = requestedModel as GpuCandidateKey;
  const candidate = GPU_CANDIDATES[modelKey];
  const refusal = await checkServerModel(candidate.file);
  if (refusal) {
    console.error(refusal);
    return 2;
  }
  if (letters) return runLetters(modelKey, asJson);

  const maxTokens = Number(args.find(argument => argument.startsWith("--max-tokens="))?.slice("--max-tokens=".length) ?? DEFAULT_MAX_NEW_TOKENS);
  const allPairs = args.includes("--pairs=all");
  const profileId = args.find(argument => argument.startsWith("--profile="))?.slice("--profile=".length) ?? PROFILE_ID;
  const rubricArgument = args.find(argument => argument.startsWith("--rubric="))?.slice("--rubric=".length) ?? "shipped";
  const rubrics: readonly string[] = ["shipped", ...Object.keys(RUBRIC_VARIANTS)];
  if (!rubrics.includes(rubricArgument)) {
    console.error(`Unknown rubric: ${rubricArgument}. Known: ${rubrics.join(", ")}`);
    return 2;
  }
  const rubricKey = rubricArgument as RubricKey;
  const golden = GOLDEN_SET.profiles.find(profile => profile.id === profileId);
  const judgments = GOLDEN_SET.judgments.find(judgment => judgment.profileId === profileId);
  if (!golden || !judgments) {
    console.error(`PROFILE_NOT_FOUND: ${profileId}. Known: ${GOLDEN_SET.profiles.map(profile => profile.id).join(", ")}`);
    return 2;
  }
  const ids: readonly string[] = allPairs ? Object.keys(judgments.grades) : PAIR_IDS;
  const pairs = ids.map(id => {
    const job = GOLDEN_SET.jobs.find(entry => entry.snapshot.id === id);
    if (!job) throw new Error(`GOLDEN_JOB_NOT_FOUND: ${id}`);
    return { id, job, grade: judgments.grades[id] ?? 0 };
  });
  const condition = jsonSchema ? "json-schema" : prefillJson ? "prefill-json" : strict ? "strict" : "shipped";
  console.log(`Candidate: ${candidate.repository} (Q4_K_M, llama-server on the GPU) · profile ${profileId} · ${pairs.length} pairs · ${condition} · rubric ${rubricKey}`);
  console.log(`Note:      ${candidate.note}`);

  const rows: (Row & { promptTokens: number; roleMatch: boolean | null })[] = [];
  const started = Date.now();
  for (const pair of pairs) {
    const snapshot = pair.job.snapshot;
    const rubric = buildSinglePrompt(
      { title: snapshot.title, company: snapshot.company_name, description: snapshot.description_text },
      { targetRoles: golden.profile.targetRoles, country: golden.profile.residenceCountry ?? "не указана",
        skills: golden.profile.skills },
    );
    const prompt = applyRubric(rubric, rubricKey);
    const answer = await serverGenerate({
      prompt: strict ? prompt + STRICT_SUFFIX : prompt, thinking: candidate.thinking, maxTokens,
      prefill: prefillJson ? JSON_PREFILL : "", jsonSchema: jsonSchema ? RELEVANCE_SCHEMA : null,
    });
    const { parsed, parse } = parseAnswer(answer.raw);
    const row = {
      id: pair.id, grade: pair.grade, score: parsed?.score ?? null, parse,
      outputTokens: answer.outputTokens, promptTokens: answer.promptTokens,
      seconds: Math.round(answer.seconds * 10) / 10, tokensPerSecond: answer.tokensPerSecond,
      explanation: parsed?.explanation ?? answer.raw.replace(/\s+/gu, " ").slice(0, 120),
      roleMatch: rubricKey === "shipped" ? null : roleMatchOf(answer.raw),
    };
    rows.push(row);
    console.log(`${row.id}  grade ${row.grade}  score ${row.score ?? "—"}  ${row.parse}`
      + `${row.roleMatch === null ? "" : `  role_match ${row.roleMatch}`}`
      + `  ${row.seconds}s  ${row.tokensPerSecond} tok/s  ${row.promptTokens} in / ${row.outputTokens} out`);
    if (showRaw) console.log(`    raw: ${answer.raw.replace(/\s+/gu, " ").slice(0, 600)}`);
  }
  const totalSeconds = (Date.now() - started) / 1000;
  const scored = rows.filter(row => row.score !== null);
  const correlation = spearman(scored.map(row => row.score ?? 0), scored.map(row => row.grade));
  const gradeZeroHigh = rows.filter(row => row.grade === 0 && (row.score ?? 0) > GO.maxGradeZeroScore)
    .map(row => ({ id: row.id, score: row.score }));
  const medianSeconds = median(rows.map(row => row.seconds));
  const go = allPairs && scored.length === rows.length && correlation !== null
    && correlation >= GO.minSpearman && gradeZeroHigh.length === 0 && medianSeconds <= GO.maxMedianSeconds;
  const report = {
    candidate: candidate.repository, modelKey, quant: "Q4_K_M", condition, rubric: rubricKey,
    runtime: "llama.cpp llama-server b11457 (CUDA 13.4), loopback",
    profileId, pairs: rows.length, totalSeconds: Math.round(totalSeconds * 10) / 10,
    validShare: rows.length === 0 ? 0 : Math.round((scored.length / rows.length) * 1000) / 1000,
    medianSeconds, meanTokensPerSecond: rows.length === 0 ? 0
      : Math.round((rows.reduce((sum, row) => sum + row.tokensPerSecond, 0) / rows.length) * 10) / 10,
    spearmanScoresVsGrades: correlation === null ? null : Math.round(correlation * 1000) / 1000,
    gradeZeroScoredHigh: gradeZeroHigh, gpuMemoryUsedMb: gpuMemoryUsedMb(),
    go: allPairs ? go : "not judged: the go thresholds apply to all 39 pairs",
    rows,
  };
  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`\nValid JSON: ${scored.length}/${rows.length} · median ${medianSeconds}s per pair · mean ${report.meanTokensPerSecond} tok/s · total ${report.totalSeconds}s`);
    console.log(`Spearman(scores vs hand grades): ${correlation === null ? "n/a" : correlation.toFixed(3)}`
      + ` · grade-0 postings scored ${GO.maxGradeZeroScore + 1}+: ${gradeZeroHigh.length === 0 ? "none" : gradeZeroHigh.map(item => `${item.id} ${item.score}`).join(", ")}`);
    console.log(`GPU memory in use: ${report.gpuMemoryUsedMb ?? "n/a"} MiB · go: ${report.go}`);
    console.log("Local model, inside the contour: no request leaves this machine.");
  }
  return scored.length === 0 ? 1 : 0;
}

/** The letter leg: the shipped prompt, the route's parse, the shipped validator. */
async function runLetters(modelKey: GpuCandidateKey, asJson: boolean): Promise<number> {
  const candidate = GPU_CANDIDATES[modelKey];
  const cases = LETTER_PROFILE_IDS.flatMap(profileId => {
    const golden = GOLDEN_SET.profiles.find(profile => profile.id === profileId);
    const judgments = GOLDEN_SET.judgments.find(judgment => judgment.profileId === profileId);
    if (!golden || !judgments) throw new Error(`PROFILE_NOT_FOUND: ${profileId}`);
    const best = Object.entries(judgments.grades)
      .sort(([idA, gradeA], [idB, gradeB]) => (gradeB - gradeA) || idA.localeCompare(idB)).slice(0, 2);
    return best.map(([jobId, grade]) => {
      const job = GOLDEN_SET.jobs.find(entry => entry.snapshot.id === jobId);
      if (!job) throw new Error(`GOLDEN_JOB_NOT_FOUND: ${jobId}`);
      return { profileId, golden, jobId, grade, job: job.snapshot };
    });
  });
  console.log(`Letter leg: ${candidate.repository} · ${cases.length} letters · the shipped prompt and validator`);
  const results = [];
  for (const item of cases) {
    const prompt = buildLetterPrompt({
      targetRoles: item.golden.profile.targetRoles, country: item.golden.profile.residenceCountry,
      job: { title: item.job.title, company: item.job.company_name, excerpt: letterJobExcerpt(null, item.job.description_text) },
    });
    const answer = await serverGenerate({ prompt, thinking: candidate.thinking, maxTokens: 900, prefill: "", jsonSchema: null });
    // The route's own reading: the JSON field if there is one, else the raw text.
    let body = answer.raw;
    let json = false;
    try {
      const parsed = JSON.parse(answer.raw) as { cover_letter?: unknown };
      if (typeof parsed.cover_letter === "string" && parsed.cover_letter.length > 0) {
        body = parsed.cover_letter;
        json = true;
      }
    } catch { /* raw output, as the route keeps it */ }
    const validation = validateLetter({
      body, profileTargetRoles: item.golden.profile.targetRoles,
      profileCountry: item.golden.profile.residenceCountry, jobTitle: item.job.title, jobCompany: item.job.company_name,
    });
    const words = body.trim().split(/\s+/u).filter(Boolean).length;
    const letters = body.replace(/[^\p{L}]/gu, "");
    const cyrillicShare = letters.length === 0 ? 0 : (letters.match(/\p{Script=Cyrillic}/gu)?.length ?? 0) / letters.length;
    const result = {
      profileId: item.profileId, jobId: item.jobId, grade: item.grade, jobTitle: item.job.title, company: item.job.company_name,
      json, passed: validation.passed, issues: validation.issues.map(issue => issue.code), words,
      language: cyrillicShare > 0.5 ? "ru" : "en", seconds: Math.round(answer.seconds * 10) / 10,
      tokensPerSecond: answer.tokensPerSecond, body,
    };
    results.push(result);
    console.log(`\n## ${result.profileId} → ${result.jobId} (grade ${result.grade}): ${result.jobTitle} at ${result.company}`);
    console.log(`validator ${result.passed ? "passed" : `failed: ${result.issues.join(", ")}`} · ${result.words} words · ${result.language} · json ${result.json} · ${result.seconds}s · ${result.tokensPerSecond} tok/s`);
    console.log(result.body);
  }
  const passed = results.filter(result => result.passed).length;
  if (asJson) console.log(JSON.stringify({ candidate: candidate.repository, passed, total: results.length, results }, null, 2));
  else console.log(`\nValidator: ${passed}/${results.length} passed without repair. A human reads every letter before any verdict.`);
  return 0;
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const transport = args.find(argument => argument.startsWith("--transport="))?.slice("--transport=".length);
  if (transport === "llama-server") return runOnServer(args);
  if (transport !== undefined) {
    console.error(`Unknown transport: ${transport}. Known: llama-server (the default is the installed CPU runtime).`);
    return 2;
  }
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

    const { parsed, parse } = parseAnswer(raw);
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
