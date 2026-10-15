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
  runClosureCheckPass, closureStatus, IDS_PER_REQUEST, MAX_REQUESTS_PER_PASS,
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

type Answer = "active" | "inactive" | "unknown";
type Call = readonly number[];

// A labelled stand-in for fetchJobicyStatuses: answers per Jobicy ID (or one
// answer for all), and records the IDs of every request it receives.
function checkWith(answers: Record<number, Answer> | Answer, calls: Call[] = []) {
  return async (ids: readonly number[]) => {
    calls.push([...ids]);
    const outcomes = new Map<number, Answer>(ids.map(id =>
      [id, typeof answers === "string" ? answers : (answers[id] ?? "unknown")]));
    return { status: "ok" as const, outcomes };
  };
}

const lifecycleOf = async (id: string) =>
  (await pool.query("SELECT snapshot->>'lifecycle' AS lifecycle FROM job_snapshots WHERE id = $1", [id]))
    .rows[0] as { lifecycle: string } | undefined;

test("two spaced inactive checks close a record; one does not", async () => {
  await resetJobicy();
  await seedFixtureRecords(jobicyContractFixture, T0);
  // 7h later: all three due; all inactive; 3 < min sample so no quarantine.
  const first = await runClosureCheckPass({ pool, now: at(7), check: checkWith("inactive") });
  assert.equal(first.result, "ok");
  assert.equal(first.checked, 3);
  assert.equal(first.closed, 0); // streak 1 only
  // Within the 6h spacing nothing is due again.
  const tooSoon = await runClosureCheckPass({ pool, now: at(9), check: checkWith("inactive") });
  assert.equal(tooSoon.result, "nothing_due");
  // Second inactive check closes.
  const second = await runClosureCheckPass({ pool, now: at(14), check: checkWith("inactive") });
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
  await runClosureCheckPass({ pool, now: at(7), check: checkWith(byId(jobicyContractFixture)) });
  await runClosureCheckPass({ pool, now: at(14), check: checkWith({
    [first!.id]: "inactive", [second!.id]: "unknown", [third!.id]: "active",
  }) });
  assert.equal((await lifecycleOf(`jobicy:${first!.id}`))?.lifecycle, "closed");
  assert.equal((await lifecycleOf(`jobicy:${second!.id}`))?.lifecycle, "active");
  assert.equal((await lifecycleOf(`jobicy:${third!.id}`))?.lifecycle, "active");
  // Unknown keeps the streak: one more inactive closes the second record.
  await runClosureCheckPass({ pool, now: at(21), check: checkWith({
    [first!.id]: "inactive", [second!.id]: "inactive", [third!.id]: "unknown",
  }) });
  assert.equal((await lifecycleOf(`jobicy:${second!.id}`))?.lifecycle, "closed");
  assert.equal((await lifecycleOf(`jobicy:${third!.id}`))?.lifecycle, "active");
});

test("a dominating inactive pass quarantines closures (breaking-change guard)", async () => {
  await resetJobicy();
  const five = manyRaws(5);
  await seedFixtureRecords(five, T0);
  const first = await runClosureCheckPass({ pool, now: at(7), check: checkWith("inactive") });
  assert.equal(first.result, "quarantined"); // 5/5 inactive >= min sample
  assert.equal(first.closed, 0);
  for (const raw of five) {
    assert.equal((await lifecycleOf(`jobicy:${raw.id}`))?.lifecycle, "active");
  }
  // Checks are still recorded, so the owner can inspect the suspicion.
  assert.equal((await closureStatus(pool)).lastInactive, 5);
});

test("a pass sends batches of 100, at most 5, and one pass an hour survives restarts", async () => {
  await resetJobicy();
  await seedFixtureRecords(manyRaws(510), T0);
  const calls: Call[] = [];
  const pass = await runClosureCheckPass({ pool, now: at(7), check: checkWith("active", calls) });
  assert.equal(pass.result, "ok");
  assert.equal(pass.requests, MAX_REQUESTS_PER_PASS);
  assert.equal(pass.checked, IDS_PER_REQUEST * MAX_REQUESTS_PER_PASS);
  assert.deepEqual(calls.map(ids => ids.length), [100, 100, 100, 100, 100]);
  assert.equal(new Set(calls.flat()).size, 500);
  // A new process within the hour sends nothing: the gate lives in the database.
  const immediate = await runClosureCheckPass({ pool, now: at(7.9), check: checkWith("active", calls) });
  assert.equal(immediate.result, "budget_exhausted");
  assert.equal(immediate.requests, 0);
  assert.equal(calls.length, 5);
  // An hour later the ten left are checked; the 500 wait their six hours.
  const next = await runClosureCheckPass({ pool, now: at(8.1), check: checkWith("active", calls) });
  assert.equal(next.requests, 1);
  assert.equal(next.checked, 10);
});

test("a failed request ends the pass, records its batch as unknown and closes nothing", async () => {
  await resetJobicy();
  const raws = manyRaws(250);
  await seedFixtureRecords(raws, T0);
  // First pass: every answer is closed, so the mass guard holds closures back
  // while each record's streak reaches 1.
  const first = await runClosureCheckPass({ pool, now: at(7), check: checkWith("inactive") });
  assert.equal(first.result, "quarantined");
  // Second pass: the first batch answers closed again (streak 2), the second is
  // refused with 429.
  const calls: Call[] = [];
  let request = 0;
  const flaky = async (ids: readonly number[]) => {
    calls.push([...ids]);
    request += 1;
    return request === 1
      ? { status: "ok" as const, outcomes: new Map(ids.map(id => [id, "inactive" as const])) }
      : { status: "rate_limited" as const };
  };
  const second = await runClosureCheckPass({ pool, now: at(14), check: flaky });
  assert.equal(second.result, "deferred");
  assert.equal(second.requests, 2);
  assert.equal(second.checked, 200);
  assert.equal(second.inactive, 100);
  assert.equal(second.unknown, 100);
  assert.equal(second.closed, 0);
  assert.equal(calls.length, 2); // the third batch is not sent
  for (const raw of raws) {
    assert.equal((await lifecycleOf(`jobicy:${raw.id}`))?.lifecycle, "active");
  }
  // The refused batch keeps its streak (unknown is neutral) and its check time.
  const refused = (await pool.query(
    "SELECT last_result, consecutive_inactive, last_check_at FROM closure_checks WHERE snapshot_id = $1",
    [`jobicy:${calls[1]![0]}`],
  )).rows[0] as { last_result: string; consecutive_inactive: number; last_check_at: Date };
  assert.equal(refused.last_result, "unknown");
  assert.equal(Number(refused.consecutive_inactive), 1);
  assert.equal(refused.last_check_at.toISOString(), at(14));
  // The hourly gate holds after a refusal too.
  const retry = await runClosureCheckPass({ pool, now: at(14.5), check: checkWith("inactive") });
  assert.equal(retry.result, "budget_exhausted");
  // The first batch reached two `closed` answers in the deferred pass; an
  // `unknown` answer afterwards must not close it (B56-001 review, finding 1).
  const third = await runClosureCheckPass({ pool, now: at(21), check: checkWith("unknown") });
  assert.equal(third.result, "ok");
  assert.equal(third.closed, 0);
  for (const raw of raws) {
    assert.equal((await lifecycleOf(`jobicy:${raw.id}`))?.lifecycle, "active");
  }
});

test("a streak held back by the mass guard closes only on a later closed answer", async () => {
  await resetJobicy();
  const five = manyRaws(5);
  await seedFixtureRecords(five, T0);
  assert.equal((await runClosureCheckPass({ pool, now: at(7), check: checkWith("inactive") })).result, "quarantined");
  assert.equal((await runClosureCheckPass({ pool, now: at(14), check: checkWith("inactive") })).result, "quarantined");
  // Streak 2 everywhere; a response the parser cannot read is all unknown with
  // HTTP 200, so the mass guard does not fire: nothing may close.
  const unreadable = await runClosureCheckPass({ pool, now: at(21), check: checkWith("unknown") });
  assert.equal(unreadable.result, "ok");
  assert.equal(unreadable.inactive, 0);
  assert.equal(unreadable.closed, 0);
  for (const raw of five) {
    assert.equal((await lifecycleOf(`jobicy:${raw.id}`))?.lifecycle, "active");
  }
  // One explicit closed answer, outside a mass pattern, closes that record only.
  const [first] = five;
  const confirmed = await runClosureCheckPass({
    pool, now: at(28), check: checkWith({ [first!.id]: "inactive" }),
  });
  assert.equal(confirmed.result, "ok");
  assert.equal(confirmed.closed, 1);
  assert.equal((await lifecycleOf(`jobicy:${first!.id}`))?.lifecycle, "closed");
  for (const raw of five.slice(1)) {
    assert.equal((await lifecycleOf(`jobicy:${raw.id}`))?.lifecycle, "active");
  }
});

test("closed snapshots still validate against the canonical contract", async () => {
  // Belt and braces: jsonb_set must not corrupt the document.
  await resetJobicy();
  await seedFixtureRecords(jobicyContractFixture, T0);
  await runClosureCheckPass({ pool, now: at(7), check: checkWith("inactive") });
  await runClosureCheckPass({ pool, now: at(14), check: checkWith("inactive") });
  const { isJobSnapshot } = await import("../../src/domain/source-contracts.ts");
  const rows = await pool.query("SELECT snapshot FROM job_snapshots WHERE source_id = 'jobicy'");
  for (const row of rows.rows) {
    assert.equal(isJobSnapshot(row.snapshot), true);
    assert.equal((row.snapshot as { lifecycle: string }).lifecycle, "closed");
  }
});
