// Model artifact download (design item B1, owner decision 2026-09-30 §6.3).
//
// `npm run models:fetch`           — download what is missing, verify every file
// `npm run models:fetch -- --check` — verify what is on disk, download nothing
//
// Why this is a separate reviewed command and not a runtime behaviour: the
// embeddings contract forbids downloads at request time (src/server/embeddings/
// local-embedder.ts switches remote loading off), and the project allows external
// transport only through reviewed modules. Model weights are not an npm package,
// so this script is the one reviewed place that talks to Hugging Face.
//
// What it guarantees:
//   * the revision is pinned (a commit, not `main`), so the file list cannot move;
//   * every file is verified against a sha256 recorded in this file BEFORE it is
//     renamed into place — a partially downloaded or substituted weight file
//     never becomes the artifact the runtime loads;
//   * an existing file with a different hash is a refusal, not an overwrite;
//   * nothing is written outside models/<repository>/.
//
// The hash of the reference weight file comes from the embedding contract itself,
// so the contract and the download cannot disagree about which artifact we run.
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
import { EMBEDDING_MODEL } from "../src/domain/embeddings.ts";

const REPOSITORY = EMBEDDING_MODEL.repository;
const REVISION = EMBEDDING_MODEL.revision;
const MODEL_ROOT = path.resolve("models");
const TARGET_DIRECTORY = path.resolve(MODEL_ROOT, REPOSITORY);

type FilePin = Readonly<{ file: string; sha256: string; bytes: number; note: string }>;

/**
 * The artifact's file set. The weight hashes come from the model repository's
 * published LFS metadata at the pinned revision; the small tokenizer/config hashes
 * were computed from a download of that same revision on 2026-09-30 (tokenizer.json
 * cross-checked against its published LFS hash, which matched).
 */
const FILES: readonly FilePin[] = [
  { file: EMBEDDING_MODEL.file, sha256: EMBEDDING_MODEL.fileSha256, bytes: 613527539,
    note: "reference weights, int8" },
  { file: "tokenizer.json", sha256: "def76fb086971c7867b829c23a26261e38d9d74e02139253b38aeb9df8b4b50a",
    bytes: 11423705, note: "fast tokenizer data" },
  { file: "tokenizer_config.json", sha256: "977648852447cb6587327ff3205b0a84cf2fc9f05621d6c8e88a497caafab2e1",
    bytes: 9731, note: "tokenizer settings" },
  { file: "config.json", sha256: "66a10929782f3c9a3cd5dec90e2a95c60e05736134a63cd54479eeae80bed175",
    bytes: 1576, note: "model config (architecture, pooling-relevant fields)" },
  { file: "special_tokens_map.json", sha256: "76862e765266b85aa9459767e33cbaf13970f327a0e88d1c65846c2ddd3a1ecd",
    bytes: 613, note: "special tokens" },
  { file: "added_tokens.json", sha256: "c0284b582e14987fbd3d5a2cb2bd139084371ed9acbae488829a1c900833c680",
    bytes: 707, note: "added tokens" },
];

const USER_AGENT = "nenaugad-models-fetch/1.0 (+local development; contact: repository owner)";
const DOWNLOAD_TIMEOUT_MS = 30 * 60 * 1000;

/** sha256 of a file on disk, read incrementally: the weight never fits in memory. */
async function fileDigest(filename: string): Promise<Readonly<{ sha256: string; bytes: number }>> {
  const hash = createHash("sha256");
  let bytes = 0;
  await pipeline(createReadStream(filename), async (source) => {
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
  // Files live in subdirectories of the artifact (`onnx/model_int8.onnx`), so the
  // parent has to exist before the stream opens — otherwise the first byte write
  // fails with ENOENT and the run reports only "could not run".
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
    console.error(`Unknown argument(s): ${unknown.join(", ")}. Usage: models:fetch [--check]`);
    return 2;
  }
  console.log(`Artifact: ${REPOSITORY} @ ${REVISION.slice(0, 8)} (${EMBEDDING_MODEL.dtype})`);
  console.log(`Target:   models/${REPOSITORY}/`);
  console.log(`Runtime version string: ${EMBEDDING_MODEL.version}`);
  if (!checkOnly) await mkdir(TARGET_DIRECTORY, { recursive: true });

  let failed = 0;
  let fetched = 0;
  let totalBytes = 0;
  for (const pin of FILES) {
    const target = path.resolve(TARGET_DIRECTORY, pin.file);
    // Boundary check: a pin can only ever place a file inside its directory.
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
      // A present-but-different file is never overwritten silently: it means the
      // artifact moved or something else wrote here.
      console.error(`  MISMATCH ${pin.file}: expected ${pin.sha256}, found ${actual.sha256}`);
      failed += 1;
      continue;
    }
    if (checkOnly) {
      console.error(`  MISSING  ${pin.file} (${pin.bytes} bytes) — run npm run models:fetch`);
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
  // A reminder, not a claim: this script only moves bytes.
  console.log("This verifies bytes, not rights: running the model on a source's text is governed by that source's process_with_ml permission.");
  return 0;
}

// `--check` on a fresh checkout should fail with a readable message, not a stack.
try {
  process.exitCode = await main();
} catch (error) {
  console.error(`models:fetch could not run: ${error instanceof Error ? error.message : "unknown"}`);
  process.exitCode = 2;
}
