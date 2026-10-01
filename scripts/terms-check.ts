// Terms-of-service snapshot check (source review item).
//
// `npm run terms:check` fetches the terms page of every source that has a
// committed snapshot, normalizes it with the shared fingerprint function and
// compares the result with the recorded value. Exit codes:
//   0 — every page still fingerprints to its recorded value;
//   1 — at least one page changed: a HUMAN must re-read the terms;
//   2 — fetch or file I/O failed (the check did not run, and says so).
//
// `npm run terms:check -- --write` re-baselines the committed snapshots after a
// human has read the new text. It writes the snapshot and the manifest only; the
// source policy's `terms_hash` and version are updated by hand, and the offline
// unit test (tests/unit/terms-fingerprint.test.ts) fails until they are.
//
// This command talks to the network on purpose and therefore is NOT part of
// `npm run check`. It makes no rights decision: a changed fingerprint means
// "re-read", never "still fine".
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { normalizeTermsText, termsFingerprint } from "../src/server/terms-fingerprint.ts";

const MANIFEST = "docs/sources/terms/snapshots.json";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

type SnapshotEntry = Readonly<{
  url: string;
  fetched_at: string;
  snapshot: string;
  sha256: string;
}>;
type Manifest = Readonly<{ note: string; snapshots: Readonly<Record<string, SnapshotEntry>> }>;

const args = process.argv.slice(2);
const write = args.includes("--write");
const unknown = args.filter(a => a !== "--write");
if (unknown.length > 0) {
  console.error(`Unknown argument(s): ${unknown.join(", ")}. Usage: terms:check [--write]`);
  process.exitCode = 2;
} else {
  process.exitCode = await run();
}

async function run(): Promise<number> {
  let manifest: Manifest;
  try {
    manifest = JSON.parse(await readFile(MANIFEST, "utf8")) as Manifest;
  } catch (error) {
    console.error(`Cannot read ${MANIFEST}: ${error instanceof Error ? error.message : "unknown error"}`);
    return 2;
  }

  const entries = Object.entries(manifest.snapshots);
  if (entries.length === 0) {
    console.error(`${MANIFEST} contains no snapshots — nothing to check.`);
    return 2;
  }

  const updated: Record<string, SnapshotEntry> = { ...manifest.snapshots };
  let changed = 0;
  let failed = 0;
  let fetchedAt = "";

  for (const [sourceId, entry] of entries) {
    let html: string;
    try {
      const response = await fetch(entry.url, {
        headers: { "user-agent": USER_AGENT, accept: "text/html,*/*" },
        redirect: "follow",
      });
      if (!response.ok) {
        console.error(`${sourceId}: HTTP ${response.status} for ${entry.url} — check did not run`);
        failed += 1;
        continue;
      }
      html = await response.text();
    } catch (error) {
      console.error(`${sourceId}: fetch failed (${error instanceof Error ? error.message : "unknown"}) — check did not run`);
      failed += 1;
      continue;
    }

    const fingerprint = termsFingerprint(html);
    fetchedAt ||= new Date().toISOString();

    if (write) {
      const text = normalizeTermsText(html);
      await mkdir(path.dirname(entry.snapshot), { recursive: true });
      await writeFile(entry.snapshot, text, "utf8");
      updated[sourceId] = { ...entry, fetched_at: fetchedAt, sha256: fingerprint };
      console.log(`${sourceId}: snapshot written ${entry.snapshot} (${text.length} chars) sha256=${fingerprint}`);
      continue;
    }

    if (fingerprint === entry.sha256) {
      console.log(`${sourceId}: unchanged (${entry.url})`);
      continue;
    }

    changed += 1;
    console.log(`${sourceId}: CHANGED (${entry.url})`);
    console.log(`  recorded ${entry.sha256}`);
    console.log(`  current  ${fingerprint}`);
    try {
      const previous = await readFile(entry.snapshot, "utf8");
      describeChange(previous, normalizeTermsText(html));
    } catch {
      console.log(`  (no readable snapshot at ${entry.snapshot} to diff against)`);
    }
  }

  if (write) {
    const next: Manifest = { note: manifest.note, snapshots: updated };
    await writeFile(MANIFEST, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    console.log(`\nManifest updated: ${MANIFEST}`);
    console.log("Next: read the new text, then update the source policy's terms_hash/version by hand");
    console.log("(tests/unit/terms-fingerprint.test.ts fails until the policy, manifest and snapshot agree).");
    return failed > 0 ? 2 : 0;
  }

  if (failed > 0) {
    console.error(`\n${failed} page(s) could not be fetched — the check did not complete.`);
    return 2;
  }
  if (changed > 0) {
    console.error(`\n${changed} page(s) changed. Re-read the terms, then re-baseline with: npm run terms:check -- --write`);
    return 1;
  }
  console.log("\nAll terms pages fingerprint to their recorded values.");
  return 0;
}

/** Prints the first differing line with a little context — enough to see whether it is a real clause. */
function describeChange(previousText: string, currentText: string): void {
  const before = previousText.split("\n");
  const after = currentText.split("\n");
  let firstDifference = 0;
  while (firstDifference < before.length && firstDifference < after.length && before[firstDifference] === after[firstDifference]) {
    firstDifference += 1;
  }
  const differing = Math.abs(before.length - after.length) +
    before.filter((line, index) => after[index] !== undefined && line !== after[index]).length;
  console.log(`  ~${differing} differing line(s); first at line ${firstDifference + 1}:`);
  for (const line of before.slice(Math.max(0, firstDifference - 2), firstDifference + 2)) {
    console.log(`    - ${line.slice(0, 200)}`);
  }
  for (const line of after.slice(Math.max(0, firstDifference - 2), firstDifference + 2)) {
    console.log(`    + ${line.slice(0, 200)}`);
  }
}
