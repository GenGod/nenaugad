// A download verified by sha256 and size, resumable from its `.part` file (MODEL-002,
// repair cycle 1: a 5 GB model download was cut by the network after 2.4 GB, and the
// fetch script started every retry from zero).
//
// Each attempt continues the `.part` file with an HTTP Range request. Only a 206 answer
// whose Content-Range starts exactly where the file ends is appended; a server that
// answers 200 (it ignored the range) starts the file over; any other range starts over
// too. Once the file has every byte, it is hashed whole: a wrong sha256 or size deletes
// it and refuses. Nothing is renamed into place unverified. A `.part` file left by a
// run that gave up is kept, so the next run resumes it.
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { setTimeout as sleep } from "node:timers/promises";

export type VerifiedDownload = Readonly<{
  url: string;
  target: string;
  sha256: string;
  bytes: number;
  /** Requests in all, the first included (5 by default). */
  attempts?: number;
  retryDelayMs?: number;
  userAgent?: string;
  /** Per request (90 minutes by default). */
  timeoutMs?: number;
}>;

async function sizeOf(filename: string): Promise<number> {
  try {
    return (await stat(filename)).size;
  } catch {
    return 0;
  }
}

async function sha256Of(filename: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(createReadStream(filename), async (source) => {
    for await (const chunk of source) hash.update(chunk as Buffer);
  });
  return hash.digest("hex");
}

/** One request: continues `part` from `offset` if the server honours the range, else rewrites it. */
async function fetchInto(pin: VerifiedDownload, part: string, offset: number): Promise<void> {
  const response = await fetch(pin.url, {
    headers: {
      ...(pin.userAgent ? { "user-agent": pin.userAgent } : {}),
      ...(offset > 0 ? { range: `bytes=${offset}-` } : {}),
    },
    signal: AbortSignal.timeout(pin.timeoutMs ?? 90 * 60 * 1000),
  });
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
  let append = false;
  if (offset > 0 && response.status === 206) {
    const range = response.headers.get("content-range") ?? "";
    if (range !== `bytes ${offset}-${pin.bytes - 1}/${pin.bytes}`) {
      await response.body.cancel();
      await rm(part, { force: true });
      throw new Error(`RANGE_MISMATCH ${range.slice(0, 80)}`);
    }
    append = true;
  }
  await pipeline(
    Readable.fromWeb(response.body as unknown as WebReadableStream),
    createWriteStream(part, { flags: append ? "a" : "w" }),
  );
}

export async function downloadVerified(pin: VerifiedDownload): Promise<void> {
  const attempts = pin.attempts ?? 5;
  const part = `${pin.target}.part`;
  await mkdir(path.dirname(pin.target), { recursive: true });
  let lastError = "no attempt made";
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let offset = await sizeOf(part);
    if (offset > pin.bytes) {
      await rm(part, { force: true });
      offset = 0;
    }
    if (offset < pin.bytes) {
      try {
        await fetchInto(pin, part, offset);
      } catch (error) {
        lastError = error instanceof Error ? error.message : "unknown";
        if (attempt < attempts) await sleep(pin.retryDelayMs ?? 5000);
        continue;
      }
    }
    const size = await sizeOf(part);
    if (size < pin.bytes) {
      // The answer ended early without an error: resume on the next attempt.
      lastError = `ended at ${size} of ${pin.bytes} bytes`;
      continue;
    }
    const digest = await sha256Of(part);
    if (digest !== pin.sha256 || size !== pin.bytes) {
      await rm(part, { force: true });
      throw new Error(`HASH_MISMATCH expected ${pin.sha256}/${pin.bytes} got ${digest}/${size}`);
    }
    await rename(part, pin.target);
    return;
  }
  throw new Error(`DOWNLOAD_INCOMPLETE after ${attempts} attempts: ${lastError}`);
}
