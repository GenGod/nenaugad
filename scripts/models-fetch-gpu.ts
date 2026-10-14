// GPU spike artifacts (task MODEL-002, owner approval 2026-10-13): the llama.cpp
// runtime and two GGUF candidates.
//
//   npm run models:fetch-gpu             — download what is missing, verify, unpack
//   npm run models:fetch-gpu -- --check  — verify what is on disk, download nothing
//   npm run models:fetch-gpu -- --vulkan — also the Vulkan build (the CUDA fallback)
//
// The discipline of scripts/models-fetch-llm.ts: every artifact is pinned (a
// release build, a model revision), verified against a sha256 and a size recorded
// here BEFORE it is renamed into place; an existing file with another hash is a
// refusal, not an overwrite. An interrupted download resumes from its .part file
// (scripts/download-verified.ts). Every path is a literal below (MODEL-001's caveat: no
// path is built from an argument). A zip is unpacked only after it is verified,
// with Windows' own tar.exe, which refuses absolute paths and `..` entries.
//
// Sources, checked 2026-10-13: ggml-org/llama.cpp build b11457 (2026-10-06, commit
// 5ad1c5da, MIT), the newest build at least 7 days old; the sha256 values are the
// release's own published asset digests. Qwen/Qwen3-VL-8B-Instruct-GGUF and
// Qwen/Qwen3-8B-GGUF (Apache-2.0) at pinned revisions; the sha256 values are the
// repositories' LFS metadata at those revisions. Text only: no vision projector.
//
// Nothing in src/ loads these: the spike's eval script talks to llama-server on
// loopback. Adopting a local model is a separate owner decision.
//
// Exit codes: 0 — every artifact present and verified; 1 — missing or not matching
// (a human must look); 2 — the download or unpacking could not run.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { downloadVerified } from "./download-verified.ts";

type Pin = Readonly<{
  url: string;
  /** Literal, relative to the repository root. */
  file: string;
  sha256: string;
  bytes: number;
  note: string;
  /** Unpack the verified zip into this literal directory. */
  unpackInto?: string;
  group: "cuda" | "vulkan" | "model";
}>;

const BUILD = "https://github.com/ggml-org/llama.cpp/releases/download/b11457";
const PINS: readonly Pin[] = [
  { group: "cuda", url: `${BUILD}/llama-b11457-bin-win-cuda-13.4-x64.zip`,
    file: "tools/llama.cpp/b11457/llama-b11457-bin-win-cuda-13.4-x64.zip",
    sha256: "0a640310af7490dd31c34e50fe8cebfaa3fc354cf55f683796f220bc21906892", bytes: 153137838,
    note: "llama.cpp binaries, CUDA 13.4", unpackInto: "tools/llama.cpp/b11457/cuda" },
  { group: "cuda", url: `${BUILD}/cudart-llama-bin-win-cuda-13.4-x64.zip`,
    file: "tools/llama.cpp/b11457/cudart-llama-bin-win-cuda-13.4-x64.zip",
    sha256: "738f8c251ac22b70c3ae6f83a10cf222725df0395246a2cf58f32bdb85fbe668", bytes: 423535356,
    note: "CUDA 13.4 runtime DLLs (no toolkit install)", unpackInto: "tools/llama.cpp/b11457/cuda" },
  { group: "vulkan", url: `${BUILD}/llama-b11457-bin-win-vulkan-x64.zip`,
    file: "tools/llama.cpp/b11457/llama-b11457-bin-win-vulkan-x64.zip",
    sha256: "d01301582c711a69b9747b5984710d6ca99e57d95f680d3d33753cec570b4cb6", bytes: 33377746,
    note: "llama.cpp binaries, Vulkan (fallback)", unpackInto: "tools/llama.cpp/b11457/vulkan" },
  { group: "model",
    url: "https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct-GGUF/resolve/f982a07559d4a2f6c8744d840bf6fccab30eea96/Qwen3VL-8B-Instruct-Q4_K_M.gguf",
    file: "models/Qwen/Qwen3-VL-8B-Instruct-GGUF/Qwen3VL-8B-Instruct-Q4_K_M.gguf",
    sha256: "67d1659bfe71b89d50b45a4ad1a9e5b997e5bb16ce5da66a6a6167abd569e9e2", bytes: 5027784800,
    note: "candidate 1: Qwen3-VL-8B-Instruct Q4_K_M (text weights)" },
  { group: "model",
    url: "https://huggingface.co/Qwen/Qwen3-8B-GGUF/resolve/7c41481f57cb95916b40956ab2f0b139b296d974/Qwen3-8B-Q4_K_M.gguf",
    file: "models/Qwen/Qwen3-8B-GGUF/Qwen3-8B-Q4_K_M.gguf",
    sha256: "d98cdcbd03e17ce47681435b5150e34c1417f50b5c0019dd560e4882c5745785", bytes: 5027783488,
    note: "candidate 2: Qwen3-8B Q4_K_M" },
];

const ROOT = path.resolve(".");
const USER_AGENT = "nenaugad-models-fetch-gpu/1.0 (+local development; contact: repository owner)";
const DOWNLOAD_TIMEOUT_MS = 90 * 60 * 1000;

function inside(relative: string): string {
  const target = path.resolve(ROOT, relative);
  const allowed = [path.resolve(ROOT, "tools", "llama.cpp"), path.resolve(ROOT, "models")];
  if (!allowed.some(base => target.startsWith(base + path.sep))) throw new Error(`OUTSIDE_TARGET ${relative}`);
  return target;
}

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

async function exists(filename: string): Promise<boolean> {
  try {
    return (await stat(filename)).isFile();
  } catch {
    return false;
  }
}

/** Unpacks a verified zip once; a marker names the zip's hash. */
async function unpack(pin: Pin, zip: string): Promise<void> {
  if (!pin.unpackInto) return;
  const directory = inside(pin.unpackInto);
  const marker = path.join(directory, `.unpacked-${pin.sha256.slice(0, 16)}`);
  if (await exists(marker)) return;
  await mkdir(directory, { recursive: true });
  const tar = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe");
  const result = spawnSync(tar, ["-xf", zip, "-C", directory], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`UNPACK_FAILED ${result.stderr.trim().slice(0, 200)}`);
  await writeFile(marker, `${pin.url}\n${pin.sha256}\n`);
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const checkOnly = args.includes("--check");
  const vulkan = args.includes("--vulkan");
  const unknown = args.filter(argument => argument !== "--check" && argument !== "--vulkan");
  if (unknown.length > 0) {
    console.error(`Unknown argument(s): ${unknown.join(", ")}. Usage: models:fetch-gpu [--check] [--vulkan]`);
    return 2;
  }
  if (process.platform !== "win32") {
    console.error("These pins are the Windows x64 builds; this machine is not Windows.");
    return 2;
  }
  let failed = 0;
  for (const pin of PINS.filter(item => item.group !== "vulkan" || vulkan)) {
    const target = inside(pin.file);
    if (await exists(target)) {
      const actual = await fileDigest(target);
      if (actual.sha256 !== pin.sha256 || actual.bytes !== pin.bytes) {
        console.error(`  MISMATCH ${pin.file}: expected ${pin.sha256}, found ${actual.sha256}`);
        failed += 1;
        continue;
      }
      console.log(`  ok       ${pin.file} (${pin.bytes} bytes, ${pin.note})`);
    } else if (checkOnly) {
      console.error(`  MISSING  ${pin.file} (${pin.bytes} bytes) — run npm run models:fetch-gpu`);
      failed += 1;
      continue;
    } else {
      process.stdout.write(`  fetching ${pin.file} (${pin.bytes} bytes) ... `);
      try {
        // Resumes a .part file left by an interrupted run (MODEL-002 repair cycle 1).
        await downloadVerified({
          url: pin.url, target, sha256: pin.sha256, bytes: pin.bytes,
          userAgent: USER_AGENT, timeoutMs: DOWNLOAD_TIMEOUT_MS,
        });
      } catch (error) {
        console.error(`failed: ${error instanceof Error ? error.message : "unknown"}`);
        return 2;
      }
      console.log("verified");
    }
    if (!checkOnly) {
      try {
        await unpack(pin, target);
      } catch (error) {
        console.error(`  unpacking ${pin.file} failed: ${error instanceof Error ? error.message : "unknown"}`);
        return 2;
      }
    }
  }
  if (failed > 0) {
    console.error(`${failed} artifact(s) missing or not matching — a human must resolve this.`);
    return 1;
  }
  console.log("Every artifact verified. This checks bytes, not fitness: the MODEL-002 measurement decides that.");
  return 0;
}

try {
  process.exitCode = await main();
} catch (error) {
  console.error(`models:fetch-gpu could not run: ${error instanceof Error ? error.message : "unknown"}`);
  process.exitCode = 2;
}
