import test from "node:test";
import assert from "node:assert/strict";
import { localPool, migrate } from "../../scripts/db.ts";
import { createPostgresPersistence } from "../../src/server/storage/snapshots.ts";
import { jobicyCandidatePolicy } from "../../src/server/source-policies.ts";
import { runJobicyImport } from "../../src/server/import/jobicy-adapter.ts";
import {
  jobicyContractFixture, type JobicyRawRecord,
} from "../../src/server/import/jobicy-fixture.ts";
import {
  runClosureCheckPass, closureStatus,
} from "../../src/server/import/closure-checks.ts";

// Missing config fails loudly. Never report a skipped DB suite as passing.
const pool = localPool(process.env.TEST_DATABASE_URL, true);
const enabledJobicy = { ...jobicyCandidatePolicy, enabled: true };
test.after(async () => { await pool.end(); });

const T0 = "2026-09-25T08:00:00.000Z";
const HOUR = 60 * 60 * 1000;
const at = (hoursAfterT0: number) =>
  new Date(Date.parse(T0) + hoursAfterT0 * HOUR).toISOString();

async function seedFixtureRecords(raws: readonly JobicyRawRecord[], now: string): Promise<void> {
  const persistence = createPostgresPersistence(pool, enabledJobicy);
  await runJobicyImport({
    transport: async () => ({ status: "ok" as const, jobs: [...raws] }),
    persistence, policy: enabledJobicy, now,
  });
}

async function resetJobicy(): Promise<void> {
  await migrate(pool);
  await pool.query("DELETE FROM closure_checks");
  await pool.query("DELETE FROM job_snapshots WHERE source_id = 'jobicy'");
  await pool.query("DELETE FROM import_state WHERE source_id = 'jobicy'");
}

function manyRaws(count: number): JobicyRawRecord[] {
  return Array.from({ length: count }, (_, index) => ({
    ...jobicyContractFixture[0]!,
    id: 910000 + index,
    url: `https://jobicy.com/jobs/${910000 + index}-bulk-synthetic-fixture`,
  }));
}

const headWith = (results: Record<number, "active" | "inactive" | "unknown"> | "active" | "inactive" | "unknown") =>
  async (listingUrl: string) => {
    const id = Number(listingUrl.match(/\/(\d+)-/u)?.[1] ?? 0);
    const outcome = typeof results === "string" ? results : (results[id] ?? "unknown");
    return { result: outcome };
  };

const lifecycleOf = async (id: string) =>
  (await pool.query("SELECT snapshot->>'lifecycle' AS lifecycle FROM job_snapshots WHERE id = $1", [id]))
    .rows[0] as { lifecycle: string } | undefined;

test("two spaced inactive checks close a record; one does not", async () => {
  await resetJobicy();
  await seedFixtureRecords(jobicyContractFixture, T0);
  // 7h later: all three due; all inactive; 3 < min sample so no quarantine.
  const first = await runClosureCheckPass({ pool, now: at(7), head: headWith("inactive") });
  assert.equal(first.result, "ok");
  assert.equal(first.checked, 3);
  assert.equal(first.closed, 0); // streak 1 only
  // Within the 6h spacing nothing is due again.
  const tooSoon = await runClosureCheckPass({ pool, now: at(9), head: headWith("inactive") });
  assert.equal(tooSoon.result, "nothing_due");
  // Second inactive check closes.
  const second = await runClosureCheckPass({ pool, now: at(14), head: headWith("inactive") });
  assert.equal(second.checked, 3);
  assert.equal(second.closed, 3);
  for (const raw of jobicyContractFixture) {
    assert.equal((await lifecycleOf(`jobicy:${raw.id}`))?.lifecycle, "closed");
  }
  const status = await closureStatus(pool);
  assert.equal(status.closedJobicy, 3);
  assert.equal(status.tracked, 3);
});

test("active resets the streak; unknown never closes", async () => {
  await resetJobicy();
  const [first, second, third] = jobicyContractFixture;
  await seedFixtureRecords(jobicyContractFixture, T0);
  const byId = (raws: readonly JobicyRawRecord[]) => Object.fromEntries(
    raws.map(raw => [raw.id, "inactive" as const]));
  await runClosureCheckPass({ pool, now: at(7), head: headWith(byId(jobicyContractFixture)) });
  await runClosureCheckPass({ pool, now: at(14), head: headWith({
    [first!.id]: "inactive", [second!.id]: "unknown", [third!.id]: "active",
  }) });
  assert.equal((await lifecycleOf(`jobicy:${first!.id}`))?.lifecycle, "closed");
  assert.equal((await lifecycleOf(`jobicy:${second!.id}`))?.lifecycle, "active");
  assert.equal((await lifecycleOf(`jobicy:${third!.id}`))?.lifecycle, "active");
  // Unknown keeps the streak: one more inactive closes the second record.
  await runClosureCheckPass({ pool, now: at(21), head: headWith({
    [first!.id]: "inactive", [second!.id]: "inactive", [third!.id]: "unknown",
  }) });
  assert.equal((await lifecycleOf(`jobicy:${second!.id}`))?.lifecycle, "closed");
  assert.equal((await lifecycleOf(`jobicy:${third!.id}`))?.lifecycle, "active");
});

test("a dominating inactive pass quarantines closures (breaking-change guard)", async () => {
  await resetJobicy();
  const five = manyRaws(5);
  await seedFixtureRecords(five, T0);
  const first = await runClosureCheckPass({ pool, now: at(7), head: headWith("inactive") });
  assert.equal(first.result, "quarantined"); // 5/5 inactive >= min sample
  assert.equal(first.closed, 0);
  for (const raw of five) {
    assert.equal((await lifecycleOf(`jobicy:${raw.id}`))?.lifecycle, "active");
  }
  // Checks are still recorded, so the owner can inspect the suspicion.
  assert.equal((await closureStatus(pool)).lastInactive, 5);
});

test("hourly budget caps checks and survives restarts", async () => {
  await resetJobicy();
  await seedFixtureRecords(manyRaws(30), T0);
  const pass = await runClosureCheckPass({ pool, now: at(7), head: headWith("active") });
  assert.equal(pass.checked, 25); // budget cap
  const immediate = await runClosureCheckPass({ pool, now: at(7.5), head: headWith("active") });
  assert.equal(immediate.result, "budget_exhausted");
  assert.equal(immediate.checked, 0);
});

test("closed snapshots still validate against the canonical contract", async () => {
  // Belt and braces: jsonb_set must not corrupt the document.
  await resetJobicy();
  await seedFixtureRecords(jobicyContractFixture, T0);
  await runClosureCheckPass({ pool, now: at(7), head: headWith("inactive") });
  await runClosureCheckPass({ pool, now: at(14), head: headWith("inactive") });
  const { isJobSnapshot } = await import("../../src/domain/source-contracts.ts");
  const rows = await pool.query("SELECT snapshot FROM job_snapshots WHERE source_id = 'jobicy'");
  for (const row of rows.rows) {
    assert.equal(isJobSnapshot(row.snapshot), true);
    assert.equal((row.snapshot as { lifecycle: string }).lifecycle, "closed");
  }
});
