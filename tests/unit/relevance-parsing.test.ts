import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildBatchPrompt, parseBatchResponse, parseRelevanceResponse,
} from "../../src/server/relevance-service.ts";

// The relevance path's prompt and parsing helpers. Model outputs below are hand-written
// strings, not provider answers; scoring itself stays closed by the personal-data boundary.

test("a single relevance answer: rounded score, lists kept, explanation clipped to 500", () => {
  const parsed = parseRelevanceResponse(JSON.stringify({
    score: 72.6, matched_skills: ["Python"], missing_skills: ["Go"], explanation: "x".repeat(600),
  }));
  assert.deepEqual(parsed, {
    score: 73, matchedSkills: ["Python"], missingSkills: ["Go"], explanation: "x".repeat(500),
  });
  // Missing or malformed optional fields become empty, never a guess.
  assert.deepEqual(parseRelevanceResponse(JSON.stringify({ score: 0, matched_skills: "Python", explanation: 7 })), {
    score: 0, matchedSkills: [], missingSkills: [], explanation: "",
  });
  assert.equal(parseRelevanceResponse(JSON.stringify({ score: 100 }))?.score, 100);
});

test("a single relevance answer without a score in 0–100, or not JSON, is refused", () => {
  for (const raw of [
    JSON.stringify({ score: -1 }), JSON.stringify({ score: 101 }), JSON.stringify({ score: "80" }),
    JSON.stringify({}), "not json", "",
  ]) {
    assert.equal(parseRelevanceResponse(raw), null, raw);
  }
});

test("a batch answer keeps only entries with an id and a score in 0–100", () => {
  const parsed = parseBatchResponse(JSON.stringify([
    { id: "himalayas:a", score: 40.4, matched_skills: ["SQL"], explanation: "fits" },
    { id: "himalayas:b", score: 101 },
    { id: "himalayas:c", score: -5 },
    { id: 7, score: 50 },
    { score: 50 },
    { id: "himalayas:d", score: "60" },
    { id: "himalayas:e", score: 100, missing_skills: ["Rust"], explanation: "y".repeat(501) },
  ]));
  assert.deepEqual(parsed, [
    { snapshotId: "himalayas:a", score: 40, matchedSkills: ["SQL"], missingSkills: [], explanation: "fits" },
    { snapshotId: "himalayas:e", score: 100, matchedSkills: [], missingSkills: ["Rust"], explanation: "y".repeat(500) },
  ]);
});

test("a batch answer that is not an array, has no usable entry, or is not JSON is refused", () => {
  for (const raw of [
    JSON.stringify({ id: "himalayas:a", score: 50 }), JSON.stringify([]),
    JSON.stringify([{ id: "himalayas:a", score: 200 }]), "[", "",
  ]) {
    assert.equal(parseBatchResponse(raw), null, raw);
  }
});

test("the chunk prompt numbers each job, clips its description to 400 and names skills only when confirmed", () => {
  const jobs = [
    { id: "himalayas:a", title: "Backend Engineer", company: "Meridian", description: "d".repeat(450) },
    { id: "jobicy:b", title: "Data Analyst", company: "Northwind", description: "Short text" },
  ];
  const prompt = buildBatchPrompt(jobs, { targetRoles: ["Backend Engineer", "SRE"], country: "DE" });
  assert.match(prompt, /^Analyze relevance of 2 jobs for this candidate\./u);
  assert.ok(prompt.includes("Candidate target roles: Backend Engineer, SRE\nCandidate country: DE"));
  assert.ok(prompt.includes(`[1] ID: himalayas:a\nTitle: Backend Engineer at Meridian\nDescription: ${"d".repeat(400)}\n`));
  assert.equal(prompt.includes("d".repeat(401)), false);
  assert.ok(prompt.includes("[2] ID: jobicy:b\nTitle: Data Analyst at Northwind\nDescription: Short text"));
  assert.equal(prompt.includes("Candidate confirmed skills"), false);

  const withSkills = buildBatchPrompt(jobs, { targetRoles: ["SRE"], country: "DE", skills: ["Go", "SQL"] });
  assert.ok(withSkills.includes("Candidate confirmed skills: Go, SQL\nCandidate country: DE"));
  assert.equal(buildBatchPrompt(jobs, { targetRoles: ["SRE"], country: "DE", skills: [] })
    .includes("Candidate confirmed skills"), false);
});
