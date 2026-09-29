// Unit tests for the EV layer, phase 1 (design item A10).
//
// Phase 1 here is the ghost multiplier: a posting whose availability we could not
// confirm sinks and is explained, but is never hidden and never lifted. These
// tests pin the boundaries the pipeline's own closure rules demand — unknown
// never becomes suspicion, one failed check is not a verdict, and the demotion
// cannot cross a tier.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  GHOST_WEIGHTS, ghostDemotion, ghostNote, type ClosureSignal,
} from "../../src/domain/ev-multipliers.ts";
import { GOLDEN_PROFILES, GOLDEN_SET } from "../../src/data/matching-golden.ts";
import { evaluateJob } from "../../src/domain/matching.ts";
import { RANKER_WEIGHTS, rankJobs, rankJobsBaselineV0, type RankableJob } from "../../src/domain/match-ranker.ts";
import type { JobSnapshot } from "../../src/domain/source-contracts.ts";

const NOW = GOLDEN_SET.evaluatedAt;
const BASE_SNAPSHOT = GOLDEN_SET.jobs[0]!.snapshot;

function posting(id: string): JobSnapshot {
  return { ...BASE_SNAPSHOT, id, source_record_id: id };
}

function rankable(snapshot: JobSnapshot, closure: ClosureSignal | null): RankableJob {
  const profile = GOLDEN_PROFILES.find(candidate => candidate.id === "p-backend-eu");
  assert.ok(profile);
  const evaluation = evaluateJob(snapshot, profile.profile);
  assert.ok(evaluation.status === "eligible" || evaluation.status === "needs_review");
  return { snapshot, status: evaluation.status, closure };
}

test("ev: without a check there is no suspicion, and unknown never demotes", () => {
  assert.equal(ghostDemotion(null), 0);
  assert.equal(ghostDemotion(undefined), 0);
  assert.equal(ghostDemotion({ lastResult: "active", consecutiveInactive: 0 }), 0);
  // The closure guard refuses to close on unknown; the ranking must not turn that
  // same uncertainty into a penalty.
  assert.equal(ghostDemotion({ lastResult: "unknown", consecutiveInactive: 1 }), 0);
  assert.equal(ghostNote({ lastResult: "unknown", consecutiveInactive: 1 }), null);
  assert.equal(ghostNote(null), null);
});

test("ev: one unconfirmed check sinks the posting and says so honestly", () => {
  const suspected: ClosureSignal = { lastResult: "inactive", consecutiveInactive: 1 };
  assert.equal(ghostDemotion(suspected), GHOST_WEIGHTS.suspectedInactive);
  // Wording: "possible", no invented cause, no threat.
  assert.match(ghostNote(suspected) ?? "", /Возможно неактивна/u);
  // Two failures close the record and it leaves the feed entirely, so the
  // demotion may only be deeper, never lighter.
  assert.ok(ghostDemotion({ lastResult: "inactive", consecutiveInactive: 2 }) <= ghostDemotion(suspected));
});

test("ev: a suspected posting loses to an equally relevant confirmed one", () => {
  const profile = GOLDEN_PROFILES.find(candidate => candidate.id === "p-backend-eu");
  assert.ok(profile);
  const clean = rankable(posting("synthetic-a-clean"), { lastResult: "active", consecutiveInactive: 0 });
  const suspected = rankable(posting("synthetic-b-suspected"), { lastResult: "inactive", consecutiveInactive: 1 });
  const ranked = rankJobs([suspected, clean], profile.profile, NOW);
  assert.deepEqual(ranked.map(entry => entry.snapshot.id), ["synthetic-a-clean", "synthetic-b-suspected"]);
  assert.deepEqual(ranked.map(entry => entry.ghost), [0, GHOST_WEIGHTS.suspectedInactive]);
  // Demoted, not hidden: both stay in the result, and the layer never lifts.
  assert.equal(ranked.length, 2);
  const baseline = rankJobsBaselineV0([suspected, clean], profile.profile, NOW);
  for (const entry of ranked) {
    const before = baseline.find(candidate => candidate.snapshot.id === entry.snapshot.id);
    assert.equal(entry.score, (before?.score ?? 0) + entry.freshness + entry.preference + entry.ghost);
    assert.ok(entry.ghost <= 0);
  }
});

test("ev: the ghost demotion cannot flip a tier on its own", () => {
  // Bounded on purpose: the research asks for ghost hygiene, not for silencing a
  // posting we could not verify. The demotion stays inside the tier gap (30).
  assert.ok(Math.abs(GHOST_WEIGHTS.suspectedInactive) < RANKER_WEIGHTS.eligibleStatus);
  assert.ok(Math.abs(GHOST_WEIGHTS.pipelineStale) < RANKER_WEIGHTS.eligibleStatus);
});

test("ev: the golden set carries no closure signals, so the A1 numbers cannot move", () => {
  // The fixtures describe content, not availability checks (GoldenJob carries no
  // closure field): this layer is inert there by construction, which is what keeps
  // the A1 ratchet comparable. If a future fixture adds a signal, this test is the
  // one to revisit deliberately.
  const profile = GOLDEN_PROFILES[0]!;
  const jobs: RankableJob[] = GOLDEN_SET.jobs.map(job => ({
    snapshot: job.snapshot, status: "eligible", firstSeenAt: job.firstSeenAt,
  }));
  const ranked = rankJobs(jobs, profile.profile, NOW);
  assert.ok(ranked.every(entry => entry.ghost === 0));
});
