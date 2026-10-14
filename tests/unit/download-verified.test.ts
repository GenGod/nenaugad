import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { downloadVerified } from "../../scripts/download-verified.ts";

// MODEL-002 (repair cycle 1): a 5 GB download was cut by the network after 2.4 GB and
// started over from zero. A verified download now resumes from its .part file with a
// Range request; the final sha256 and size still decide.
const PAYLOAD = randomBytes(256 * 1024);
const SHA256 = createHash("sha256").update(PAYLOAD).digest("hex");

type Mode = "cut-first" | "ignore-range" | "always-cut";

async function serve(mode: Mode): Promise<Readonly<{ url: string; server: Server; requests: string[] }>> {
  const requests: string[] = [];
  let served = 0;
  const server = createServer((request, response) => {
    const range = request.headers.range ?? "";
    requests.push(range);
    served += 1;
    const match = /^bytes=(\d+)-$/u.exec(range);
    const start = match && mode !== "ignore-range" ? Number(match[1]) : 0;
    const body = PAYLOAD.subarray(start);
    response.writeHead(start > 0 ? 206 : 200, {
      "content-length": String(body.length),
      ...(start > 0 ? { "content-range": `bytes ${start}-${PAYLOAD.length - 1}/${PAYLOAD.length}` } : {}),
    });
    // Cut the connection half-way, on the first request only or every time, once the
    // client has had time to read the first half (as a dropped connection mid-file).
    if ((mode === "cut-first" && served === 1) || mode === "always-cut") {
      response.write(body.subarray(0, Math.floor(body.length / 2)), () => {
        setTimeout(() => response.destroy(), 200);
      });
      return;
    }
    response.end(body);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("NO_ADDRESS");
  return { url: `http://127.0.0.1:${address.port}/file.bin`, server, requests };
}

async function withDirectory(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(path.join(tmpdir(), "nenaugad-download-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("a download cut half-way resumes with a Range request and is verified whole", async () => {
  const { url, server, requests } = await serve("cut-first");
  try {
    await withDirectory(async directory => {
      const target = path.join(directory, "file.bin");
      await downloadVerified({ url, target, sha256: SHA256, bytes: PAYLOAD.length, attempts: 3, retryDelayMs: 0 });
      assert.deepEqual(await readFile(target), PAYLOAD);
      assert.equal(requests[0], "");
      assert.match(requests[1] ?? "", /^bytes=[1-9]\d*-$/u);
      await assert.rejects(stat(`${target}.part`));
    });
  } finally {
    server.close();
  }
});

test("a .part file left by an earlier run is resumed, not restarted", async () => {
  const { url, server, requests } = await serve("cut-first");
  try {
    await withDirectory(async directory => {
      const target = path.join(directory, "file.bin");
      await writeFile(`${target}.part`, PAYLOAD.subarray(0, 1000));
      // The server cuts its first answer, so the run resumes twice.
      await downloadVerified({ url, target, sha256: SHA256, bytes: PAYLOAD.length, attempts: 3, retryDelayMs: 0 });
      assert.equal(requests[0], "bytes=1000-");
      assert.deepEqual(await readFile(target), PAYLOAD);
    });
  } finally {
    server.close();
  }
});

test("a server that ignores the range starts the file over, and it is still verified", async () => {
  const { url, server } = await serve("ignore-range");
  try {
    await withDirectory(async directory => {
      const target = path.join(directory, "file.bin");
      await writeFile(`${target}.part`, Buffer.from("not the start of the file"));
      await downloadVerified({ url, target, sha256: SHA256, bytes: PAYLOAD.length, attempts: 2, retryDelayMs: 0 });
      assert.deepEqual(await readFile(target), PAYLOAD);
    });
  } finally {
    server.close();
  }
});

test("a wrong hash is refused and nothing is kept; a connection that keeps dropping gives up", async () => {
  const good = await serve("ignore-range");
  const cut = await serve("always-cut");
  try {
    await withDirectory(async directory => {
      const target = path.join(directory, "file.bin");
      await assert.rejects(
        downloadVerified({ url: good.url, target, sha256: "0".repeat(64), bytes: PAYLOAD.length, attempts: 2, retryDelayMs: 0 }),
        /HASH_MISMATCH/u);
      await assert.rejects(stat(target));
      await assert.rejects(stat(`${target}.part`));

      await assert.rejects(
        downloadVerified({ url: cut.url, target, sha256: SHA256, bytes: PAYLOAD.length, attempts: 2, retryDelayMs: 0 }),
        /DOWNLOAD_INCOMPLETE/u);
      await assert.rejects(stat(target));
      assert.equal(cut.requests.length, 2);
    });
  } finally {
    good.server.close();
    cut.server.close();
  }
});
