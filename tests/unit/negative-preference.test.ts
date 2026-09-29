// Unit tests for the negative-preference layer (design item A6, second part).
//
// Hiding a posting is one statement about ONE posting. These tests pin what the
// layer may do with it: demote the neighbourhood by a bounded amount, never hide
// and never lift, never treat a single shared skill as a neighbourhood, and move
// nothing at all when the candidate hid nothing.
import assert from "node:assert/strict";
import { test } from "node:test";
import { GOLDEN_PROFILES, GOLDEN_SET } from "../../src/data/matching-golden.ts";
import { runMatchingEval, type Ranker } from "../../src/domain/matching-eval.ts";
import { evaluateJob } from "../../src/domain/matching.ts";
import { rankJobs, type RankableJob } from "../../src/domain/match-ranker.ts";
import {
  dislikedPosting, PREFERENCE_MIN_SHARED_SKILLS, PREFERENCE_WEIGHTS, preferenceDemotion,
} from "../../src/domain/negative-preference.ts";
import type { JobSnapshot } from "../../src/domain/source-contracts.ts";

const NOW = GOLDEN_SET.evaluatedAt;
const BASE_SNAPSHOT = GOLDEN_SET.jobs[0]!.snapshot;

/** A posting that differs from the fixture only in the fields under test. */
function posting(id: string, company: string, text: string): JobSnapshot {
  return {
    ...BASE_SNAPSHOT, id, source_record_id: id, company_name: company,
    title: "Synthetic posting for the preference layer", description_text: text,
  };
}

function rankable(snapshot: JobSnapshot, profile: (typeof GOLDEN_PROFILES)[number]): RankableJob {
  const evaluation = evaluateJob(snapshot, profile.profile);
  assert.ok(evaluation.status === "eligible" || evaluation.status === "needs_review",
    `${snapshot.id} must be visible to be rankable`);
  return { snapshot, status: evaluation.status };
}

test("preference: the same employer demotes, with A4's normalisation of legal forms", () => {
  const hidden = posting("synthetic-hidden", "Hidden Labs GmbH", "React TypeScript PostgreSQL Redis");
  const twin = posting("synthetic-twin", "Hidden Labs", "React TypeScript PostgreSQL Redis");
  const otherCompanySameStack = posting("synthetic-other", "Open Labs", "React TypeScript PostgreSQL Redis");
  const unrelated = posting("synthetic-unrelated", "Open Labs", "Rust Go Kubernetes Terraform");
  assert.equal(preferenceDemotion(twin, [dislikedPosting(hidden)]), PREFERENCE_WEIGHTS.sameCompany,
    "the legal form is stripped on both sides (A4's normalisation)");
  assert.equal(preferenceDemotion(otherCompanySameStack, [dislikedPosting(hidden)]), PREFERENCE_WEIGHTS.sharedStack,
    "another employer with the same stack is a weaker signal, not a company match");
  assert.equal(preferenceDemotion(unrelated, [dislikedPosting(hidden)]), 0,
    "a posting sharing neither employer nor stack is not in the neighbourhood");
});

test("preference: an unreadable company name never becomes 'the same company'", () => {
  const hidden = posting("synthetic-hidden", "   ", "React TypeScript PostgreSQL Redis");
  const other = posting("synthetic-other", "", "React TypeScript PostgreSQL Redis");
  assert.equal(preferenceDemotion(other, [dislikedPosting(hidden)]), PREFERENCE_WEIGHTS.sharedStack,
    "the stack signal may still apply, but not the company signal");
});

test("preference: the stack threshold is the measured one, and aliases resolve", () => {
  // Four canonical skills shared -> the neighbourhood signal fires; three do not.
  // Measured on the golden set (2026-09-29): at two or three shared skills the
  // layer demotes RELEVANT postings (aggregate NDCG@10 0.919056 / 0.919417 vs
  // 0.930164 at four), so the threshold is four, not two.
  const hidden = posting("synthetic-hidden", "Hidden Labs", "React TypeScript PostgreSQL Redis");
  const threeShared = posting("synthetic-three", "Other Labs", "React TypeScript PostgreSQL");
  // Aliases resolve through the same dictionary on both sides ("postgres").
  const fourShared = posting("synthetic-four", "Other Labs", "react typescript postgres redis");
  assert.equal(PREFERENCE_MIN_SHARED_SKILLS, 4);
  assert.equal(preferenceDemotion(threeShared, [dislikedPosting(hidden)]), 0);
  assert.equal(preferenceDemotion(fourShared, [dislikedPosting(hidden)]), PREFERENCE_WEIGHTS.sharedStack);
  // A single shared skill is the noisiest case of all and must stay silent.
  const oneShared = posting("synthetic-one", "Other Labs", "React");
  assert.equal(preferenceDemotion(oneShared, [dislikedPosting(hidden)]), 0);
});

test("preference: signals do not accumulate — many hidden postings cannot bury a neighbour", () => {
  const hiddenText = "React TypeScript PostgreSQL Redis";
  const hidden = Array.from({ length: 12 }, (_, index) =>
    posting(`synthetic-hidden-${index}`, "Hidden Labs", hiddenText));
  const neighbour = posting("synthetic-neighbour", "Hidden Labs GmbH", hiddenText);
  const demotion = preferenceDemotion(neighbour, hidden.map(dislikedPosting));
  assert.equal(demotion, PREFERENCE_WEIGHTS.sameCompany,
    "the strongest single signal wins, so the cost does not grow with the number of hides");
  assert.ok(demotion >= PREFERENCE_WEIGHTS.maxDemotion);
  assert.ok(demotion <= 0, "the layer can only demote");
});

test("preference: hiding a posting sinks its twin below an equally scored control", () => {
  const profile = GOLDEN_PROFILES.find(candidate => candidate.id === "p-backend-eu");
  assert.ok(profile);
  const stack = "React TypeScript PostgreSQL Redis";
  const hidden = posting("synthetic-hidden", "Hidden Labs", stack);
  // Same stack for both visible postings, so their base scores are equal and the
  // only difference is the neighbourhood: the twin shares the hidden employer
  // (-12), the control shares only the stack (-6). The neighbour id sorts BEFORE
  // the control, so without the layer the neighbour leads on the tie-break.
  const neighbour = posting("synthetic-a-neighbour", "Hidden Labs GmbH", stack);
  const control = posting("synthetic-b-control", "Open Labs", stack);
  const jobs = [rankable(neighbour, profile), rankable(control, profile)];

  const without = rankJobs(jobs, profile.profile, NOW);
  assert.deepEqual(without.map(entry => entry.snapshot.id), ["synthetic-a-neighbour", "synthetic-b-control"]);
  assert.deepEqual(without.map(entry => entry.preference), [0, 0]);

  const withLayer = rankJobs(jobs, profile.profile, NOW, { disliked: [dislikedPosting(hidden)] });
  assert.deepEqual(withLayer.map(entry => entry.snapshot.id), ["synthetic-b-control", "synthetic-a-neighbour"]);
  assert.deepEqual(withLayer.map(entry => entry.preference),
    [PREFERENCE_WEIGHTS.sharedStack, PREFERENCE_WEIGHTS.sameCompany]);
  // Both postings stay in the result (demoted, never hidden), and each score
  // moves by exactly its reported demotion — the layer cannot lift anything.
  assert.equal(withLayer.length, 2);
  for (const entry of withLayer) {
    const before = without.find(candidate => candidate.snapshot.id === entry.snapshot.id);
    assert.equal(entry.score, (before?.score ?? 0) + entry.preference);
    assert.ok(entry.preference <= 0);
  }
});

test("golden set: with a hide set the layer helps and never worsens a profile", () => {
  // Synthetic candidate state, never real behaviour: the two keyword-trap
  // postings (weapons of the "keyword-stuffed posting" failure from A2) are
  // treated as hidden, and the layer is measured against the hand grades.
  const hidden = ["golden-j28", "golden-j29"]
    .map(id => GOLDEN_SET.jobs.find(job => job.snapshot.id === id))
    .filter(job => job !== undefined);
  assert.equal(hidden.length, 2);
  const disliked = hidden.map(job => dislikedPosting(job.snapshot));
  const ranker: Ranker = (jobs, profile, now) => rankJobs(jobs, profile, now, { disliked });

  const baseline = runMatchingEval(GOLDEN_SET);
  const withLayer = runMatchingEval(GOLDEN_SET, ranker);
  // Recorded 2026-09-29: 0.916478 -> 0.930164, no profile worse.
  assert.ok(withLayer.aggregate.ndcgAt10 >= baseline.aggregate.ndcgAt10,
    `aggregate NDCG@10 must not fall: ${baseline.aggregate.ndcgAt10} -> ${withLayer.aggregate.ndcgAt10}`);
  for (const [index, profile] of withLayer.profiles.entries()) {
    const before = baseline.profiles[index]?.ndcgAt10 ?? null;
    assert.ok(profile.ndcgAt10 !== null && before !== null);
    assert.ok(profile.ndcgAt10 >= before,
      `${profile.profileId} must not be worse with the layer: ${before} -> ${profile.ndcgAt10}`);
  }
  // The gates are not touched by a preference: the same jobs are shown.
  assert.deepEqual(withLayer.guards, baseline.guards);
});
