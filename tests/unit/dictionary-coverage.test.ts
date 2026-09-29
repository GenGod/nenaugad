// Vocabulary worklist tests (design item A3).
//
// The worklist is a human-review aid, so these tests pin its two honesty
// properties: it never proposes something the dictionary already knows, and it
// never invents entries — it only counts repeated unknown tokens.
import assert from "node:assert/strict";
import { test } from "node:test";
import { dictionaryWorklist } from "../../src/domain/dictionary-coverage.ts";
import { SKILLS_DICTIONARY_VERSION } from "../../src/domain/skills.ts";

test("worklist counts repeated unknown tokens and ignores known aliases", () => {
  const worklist = dictionaryWorklist([
    "Kubernetes and Terraform with ZooKeeper streaming",
    "ZooKeeper streaming pipelines, ZooKeeper again",
    "Snowflake warehouse and Snowflake tasks",
  ]);
  const tokens = worklist.topUnknown.map(item => item.token);
  assert.ok(!tokens.includes("kubernetes"), "known aliases must never be proposed");
  assert.ok(!tokens.includes("terraform"), "known aliases must never be proposed");
  assert.ok(!tokens.includes("kafka"), "Kafka is a known alias of Big Data");
  assert.equal(tokens[0], "zookeeper"); // 3 occurrences, more than any other candidate
  assert.equal(worklist.topUnknown.find(item => item.token === "zookeeper")?.count, 3);
  assert.equal(worklist.topUnknown.find(item => item.token === "snowflake")?.count, 2);
  assert.equal(worklist.dictionaryVersion, SKILLS_DICTIONARY_VERSION);
});

test("worklist respects minCount and topN without inventing entries", () => {
  const worklist = dictionaryWorklist(["alpha alpha beta gamma"], { minCount: 2, topN: 5 });
  assert.deepEqual(worklist.topUnknown.map(item => item.token), ["alpha"]);
  const single = dictionaryWorklist(["alpha"], { minCount: 1, topN: 5 });
  assert.deepEqual(single.topUnknown.map(item => item.token), ["alpha"]);
  const limited = dictionaryWorklist(["alpha alpha beta beta gamma gamma"], { topN: 1 });
  assert.equal(limited.topUnknown.length, 1);
  assert.equal(limited.topUnknown[0]?.token, "alpha"); // ties break alphabetically
});

test("worklist skips stopwords, numbers and short tokens", () => {
  const worklist = dictionaryWorklist(["we are the team 2026 with you and the role"], { minCount: 1 });
  assert.deepEqual(worklist.topUnknown, []);
  assert.ok(worklist.tokenCount > 0, "tokens are still counted for context");
});

test("worklist is deterministic for identical input", () => {
  const texts = ["postings with repeated unknown words words words"];
  assert.deepEqual(dictionaryWorklist(texts), dictionaryWorklist(texts));
});
