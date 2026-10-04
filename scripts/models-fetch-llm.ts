// Candidate generative-model artifact download (task MODEL-001, owner decision
// No 4, item 2 — the evaluation the batch/scoring decision waits on).
//
//   npm run models:fetch-llm           — download what is missing, verify every file
//   npm run models:fetch-llm -- --check — verify what is on disk, download nothing
//
// Same discipline as scripts/models-fetch.ts, and for the same reasons: the
// revision is pinned (a commit, not `main`), every file is verified against a
// sha256 recorded here BEFORE it is renamed into place, an existing file with a
// different hash is a refusal rather than an overwrite, and nothing is written
// outside models/<repository>/.
//
// Scope, stated plainly: this script exists for the MODEL-001 evaluation, not as
// a product dependency. If the owner adopts a local generative model, its pins
// move into a domain contract (like EMBEDDING_MODEL) and the runtime call site
// gets the same reviewed treatment as the embedding transport; until then the
// artifact is data on disk and nothing in src/ loads it.
//
// License note (checked 2026-10-02): the upstream model is Qwen/Qwen3-1.7B,
// Apache-2.0; the ONNX export is onnx-community/Qwen3-1.7B-ONNX at the pinned
// revision below. The small-file hashes were computed from a download of that
// revision on 2026-10-02; the weight hash and the tokenizer hash are the
// repository's own published LFS metadata at the same revision (they matched).
//
// Exit codes: 0 — every file present and verified; 1 — a file is missing or does
// not match (a human must look); 2 — the download could not run (network, disk).
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";

const REPOSITORY = "onnx-community/Qwen3-1.7B-ONNX";
const REVISION = "cc6a06a21d614e9b8e92a6adfab1074d4e7d2438";
const MODEL_ROOT = path.resolve("models");
const TARGET_DIRECTORY = path.resolve(MODEL_ROOT, REPOSITORY);

type FilePin = Readonly<{ file: string; sha256: string; bytes: number; note: string }>;

const FILES: readonly FilePin[] = [
  { file: "onnx/model_quantized.onnx",
    sha256: "202ed81928b7f34c31505b46479c310e131fec307a045eab2537e7c494feb427",
    bytes: 1742387852, note: "weights, q8 (int8-style quantized) — the CPU candidate" },
  { file: "tokenizer.json",
    sha256: "e7a95fce95bf5b0946d0ddb3f9d7caa030b7e850bbe92b0edb26bcf563e9f3d5",
    bytes: 9117040, note: "fast tokenizer data" },
  { file: "tokenizer_config.json",
    sha256: "b0a8115cf05a7002cbe2575058c0139c1dee3f06f221c05717c3444947d78b9f",
    bytes: 9705, note: "tokenizer settings incl. chat template" },
  { file: "chat_template.jinja",
    sha256: "87a2728cb8dc9fe424d624542f6060ec05a1d285ebbec578bb078900e33396b5",
    bytes: 4116, note: "standalone chat template (Qwen3 thinking switch)" },
  { file: "config.json",
    sha256: "d443f9cfc878a105bd075083230394623e477574e47061784744534361214d00",
    bytes: 943, note: "model config" },
  { file: "generation_config.json",
    sha256: "9e9e031ae8bca36eefcdcdd0b35d83c61baa01e31d68d5f5a961c9ca1a4b95bf",
    bytes: 219, note: "generation defaults" },
  { file: "vocab.json",
    sha256: "ca10d7e9fb3ed18575dd1e277a2579c16d108e32f27439684afa0e10b1440910",
    bytes: 2776833, note: "legacy vocabulary (fallback tokens)" },
  { file: "merges.txt",
    sha256: "8831e4f1a044471340f7c0a83d7bd71306a5b867e95fd870f74d0c5308a904d5",
    bytes: 1671853, note: "legacy merges (fallback tokenizer)" },
];

const USER_AGENT = "nenaugad-models-fetch-llm/1.0 (+local development; contact: repository owner)";
const DOWNLOAD_TIMEOUT_MS = 30 * 60 * 1000;

/** sha256 of a file on disk, read incrementally: the weight never fits in memory. */
async function fileDigest(filename: string): Promise<Readonly<{ sha256: string; bytes: number }>> {
  const hash = createHash("sha256");
  let bytes = 0;
  await pipeline(createReadStream(filename), async function* (source) {
    for await (const chunk of source) {
      const buffer = chunk as Buffer;
      hash.update(buffer);
      bytes += buffer.length;
    }
  });
  return { sha256: hash.digest("hex"), bytes };
}

async function download(pin: FilePin, target: string): Promise<void> {
  const url = `https://huggingface.co/${REPOSITORY}/resolve/${REVISION}/${pin.file}`;
  const response = await fetch(url, {
    headers: { "user-agent": USER_AGENT },
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
  await mkdir(path.dirname(target), { recursive: true });
  const part = `${target}.part`;
  const hash = createHash("sha256");
  let bytes = 0;
  await pipeline(
    Readable.fromWeb(response.body as unknown as WebReadableStream),
    async function* (source) {
      for await (const chunk of source) {
        const buffer = Buffer.from(chunk as Uint8Array);
        hash.update(buffer);
        bytes += buffer.length;
        yield buffer;
      }
    },
    createWriteStream(part),
  );
  const digest = hash.digest("hex");
  if (digest !== pin.sha256 || bytes !== pin.bytes) {
    await rm(part, { force: true });
    throw new Error(`HASH_MISMATCH expected ${pin.sha256}/${pin.bytes} got ${digest}/${bytes}`);
  }
  await rename(part, target);
}

async function exists(filename: string): Promise<boolean> {
  try {
    const info = await stat(filename);
    return info.isFile();
  } catch {
    return false;
  }
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const checkOnly = args.includes("--check");
  const unknown = args.filter(argument => argument !== "--check");
  if (unknown.length > 0) {
    console.error(`Unknown argument(s): ${unknown.join(", ")}. Usage: models:fetch-llm [--check]`);
    return 2;
  }
  console.log(`Candidate artifact: ${REPOSITORY} @ ${REVISION.slice(0, 8)} (q8, CPU candidate)`);
  console.log(`Target: models/${REPOSITORY}/`);
  if (!checkOnly) await mkdir(TARGET_DIRECTORY, { recursive: true });

  let failed = 0;
  let fetched = 0;
  let totalBytes = 0;
  for (const pin of FILES) {
    const target = path.resolve(TARGET_DIRECTORY, pin.file);
    if (target !== TARGET_DIRECTORY && !target.startsWith(TARGET_DIRECTORY + path.sep)) {
      console.error(`refusing to write outside the model directory: ${pin.file}`);
      return 2;
    }
    if (await exists(target)) {
      const actual = await fileDigest(target);
      if (actual.sha256 === pin.sha256 && actual.bytes === pin.bytes) {
        console.log(`  ok       ${pin.file} (${pin.bytes} bytes, ${pin.note})`);
        totalBytes += pin.bytes;
        continue;
      }
      console.error(`  MISMATCH ${pin.file}: expected ${pin.sha256}, found ${actual.sha256}`);
      failed += 1;
      continue;
    }
    if (checkOnly) {
      console.error(`  MISSING  ${pin.file} (${pin.bytes} bytes) — run npm run models:fetch-llm`);
      failed += 1;
      continue;
    }
    process.stdout.write(`  fetching ${pin.file} (${pin.bytes} bytes) ... `);
    try {
      await download(pin, target);
    } catch (error) {
      console.error(`failed: ${error instanceof Error ? error.message : "unknown"}`);
      return 2;
    }
    console.log("verified");
    fetched += 1;
    totalBytes += pin.bytes;
  }

  console.log(fetched > 0
    ? `Downloaded ${fetched} file(s); artifact verified (${totalBytes} bytes total).`
    : `Nothing to download; artifact verified (${totalBytes} bytes total).`);
  if (failed > 0) {
    console.error(`${failed} file(s) missing or not matching — a human must resolve this.`);
    return 1;
  }
  console.log("This verifies bytes, not rights or fitness: the candidate feeds the MODEL-001 evaluation, and adopting it is a separate owner decision.");
  return 0;
}

try {
  process.exitCode = await main();
} catch (error) {
  console.error(`models:fetch-llm could not run: ${error instanceof Error ? error.message : "unknown"}`);
  process.exitCode = 2;
}
