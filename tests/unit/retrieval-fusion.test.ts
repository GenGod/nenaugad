import test from "node:test";
import assert from "node:assert/strict";
import {
  BM25_IN_NODE_POOL_LIMIT, BM25_LEG_VERSION, BM25_PARAMS, bm25Rank, tokenizeForBm25, type Bm25Document,
} from "../../src/domain/bm25.ts";
import { RRF_K, RRF_VERSION, describeFusion, reciprocalRankFusion } from "../../src/domain/rrf.ts";

const CODE_POSTING: Bm25Document = {
  id: "csharp-role",
  text: "We are hiring a C# and .NET developer. The C# codebase runs on .NET 8.",
};
const PYTHON_POSTING: Bm25Document = {
  id: "python-role",
  text: "Senior Python developer, postgres, async services, remote.",
};
const WRAPPER_POSTING: Bm25Document = {
  id: "keyword-stuffed",
  text: "Python Python Python developer developer developer synergy ninja.",
};
const POOL: readonly Bm25Document[] = [CODE_POSTING, PYTHON_POSTING, WRAPPER_POSTING];

test("bm25: parameters are the source defaults, not invented values", () => {
  // V1 (2026-09-30): k1 = 1.2 and b = 0.75 are the Lucene/Elasticsearch
  // defaults; the IDF form is Lucene's log(1 + (N - n + 0.5)/(n + 0.5)).
  assert.deepEqual(BM25_PARAMS, { k1: 1.2, b: 0.75 });
  assert.equal(BM25_LEG_VERSION, "bm25-l1");
  assert.equal(BM25_IN_NODE_POOL_LIMIT, 5000);
});

test("bm25: compound technical tokens survive tokenization", () => {
  // The C# case is why this leg exists: a dense leg can miss an exact technical
  // token, and splitting "c#" into "c" would make the term useless.
  assert.deepEqual(tokenizeForBm25("C#"), ["c#"]);
  assert.deepEqual(tokenizeForBm25("c++"), ["c++"]);
  assert.deepEqual(tokenizeForBm25(".NET"), ["net"]);
  assert.ok(tokenizeForBm25("Node.js").includes("node.js"));
  // A dotted token also contributes its parts, so "node" finds "node.js".
  assert.ok(tokenizeForBm25("Node.js").includes("node"));
  assert.ok(tokenizeForBm25("Node.js").includes("js"));
  // Single characters are dropped: "c" must not match everything.
  assert.deepEqual(tokenizeForBm25("c a"), []);
  // Digits survive without a length-2 token.
  assert.deepEqual(tokenizeForBm25("5"), ["5"]);
});

test("bm25: an exact technical query finds the posting that contains it", () => {
  // "C#" alone: only the posting that actually contains the token may come back.
  const exact = bm25Rank("C#", POOL);
  assert.deepEqual(exact.map(entry => entry.id), ["csharp-role"]);
  // With an ordinary word added, the ordinary word still matches elsewhere — so
  // the assertion is about who wins, not about who is present.
  const mixed = bm25Rank("C# developer", POOL);
  assert.equal(mixed[0]?.id, "csharp-role");
  const pythonScore = mixed.find(entry => entry.id === "python-role")?.score ?? 0;
  assert.ok((mixed[0]?.score ?? 0) > pythonScore, "the exact technical match must outrank a general word match");
});

test("bm25: postings that share no term with the query are not returned at all", () => {
  const ranked = bm25Rank("kubernetes helm chart", POOL);
  assert.deepEqual(ranked, []);
  const partially = bm25Rank("python welder", POOL);
  assert.deepEqual(partially.map(entry => entry.id).sort(), ["keyword-stuffed", "python-role"]);
});

test("bm25: repetition grows the score sub-linearly, and this leg does not solve stuffing", () => {
  // Isotonic lengths would be ideal, but the property that matters is only that
  // term frequency is saturated: three occurrences score more than one and less
  // than three times as much.
  const ranked = bm25Rank("python", [
    { id: "once", text: "python developer" },
    { id: "thrice", text: "python python python developer" },
  ]);
  const once = ranked.find(entry => entry.id === "once")?.score ?? 0;
  const thrice = ranked.find(entry => entry.id === "thrice")?.score ?? 0;
  assert.ok(once > 0 && thrice > 0);
  assert.ok(thrice > once, "more occurrences still help");
  assert.ok(thrice < 3 * once, `saturation must be sub-linear (got ${thrice / once})`);

  // Honest note, measured on this fixture: in the three-posting pool above the
  // keyword-stuffed posting still wins on "python developer". Length
  // normalisation and saturation limit stuffing; they do not defeat it. Which is
  // why the fused order, not this leg alone, is what gets measured (B2) and why
  // the product ranker keeps its own signals (A2/A3).
  const pooled = bm25Rank("python developer", POOL);
  assert.equal(pooled[0]?.id, "keyword-stuffed");
});

test("bm25: scores are deterministic and ties break on id", () => {
  const first = bm25Rank("python", POOL);
  const second = bm25Rank("python", [...POOL].reverse());
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  const tied = bm25Rank("python", [
    { id: "z", text: "python" },
    { id: "a", text: "python" },
  ]);
  assert.deepEqual(tied.map(entry => entry.id), ["a", "z"]);
  assert.equal(tied[0]?.score, tied[1]?.score);
});

test("rrf: the paper's k, and a document that wins one leg is lifted", () => {
  assert.equal(RRF_K, 60);
  assert.equal(RRF_VERSION, "rrf-l1");
  // "shared" is third in leg A and second in leg B; "first-a" leads leg A but is
  // absent from leg B. RRF must prefer the document both legs agree on.
  const legA = ["first-a", "second-a", "shared"];
  const legB = ["other-b", "shared"];
  const fused = reciprocalRankFusion([legA, legB]);
  assert.equal(fused[0]?.id, "shared");
  assert.equal(fused[0]?.score, 1 / (RRF_K + 3) + 1 / (RRF_K + 2));
  assert.deepEqual(fused[0]?.positions, [3, 2]);
  // A document only one leg found is still fused, with null in the other leg.
  const solo = fused.find(entry => entry.id === "first-a");
  assert.deepEqual(solo?.positions, [1, null]);
  assert.equal(solo?.score, 1 / (RRF_K + 1));
});

test("rrf: fusion is deterministic, capped and honest about which leg found what", () => {
  const legs = [["b", "a"], ["a"]];
  const first = reciprocalRankFusion(legs);
  const second = reciprocalRankFusion([["b", "a"], ["a"]]);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.deepEqual(first.map(entry => entry.id), ["a", "b"]);
  assert.equal(reciprocalRankFusion(legs, { limit: 1 }).length, 1);
  // A smaller k weights the top of each leg more; the id set must not change.
  assert.deepEqual(
    reciprocalRankFusion(legs, { k: 1 }).map(entry => entry.id).sort(),
    ["a", "b"],
  );
  assert.equal(describeFusion(legs, first), "fusion: legs=2/1 fused=2");
  assert.deepEqual(reciprocalRankFusion([[ ], []]), []);
});

test("rrf: a leg can be weighted, and weight zero removes its contribution", () => {
  const legs = [["dense-first", "shared"], ["shared", "bm25-second"]];
  const equal = reciprocalRankFusion(legs);
  assert.equal(equal[0]?.id, "shared");
  // Agreement across legs beats a single lead until the weight on that lead
  // exceeds the k scale (1/(k+1) vs 1/(k+2) + 1/(k+1) is only decided around
  // w ≈ k). Asserting the real threshold keeps the mechanism honest: a "small"
  // weight does not flip the fusion, and pretending otherwise would mislead the
  // calibration the CLI reports.
  assert.equal(reciprocalRankFusion(legs, { weights: [3, 1] })[0]?.id, "shared");
  assert.equal(reciprocalRankFusion(legs, { weights: [100, 1] })[0]?.id, "dense-first");
  // Weight zero is exactly "drop this leg": only the other leg's order remains.
  const bm25Only = reciprocalRankFusion(legs, { weights: [0, 1] });
  assert.deepEqual(bm25Only.map(entry => entry.id), ["shared", "bm25-second"]);
  assert.throws(() => reciprocalRankFusion(legs, { weights: [1] }), /RRF_WEIGHTS_MISMATCH/u);
});

test("rrf: an id absent from every leg cannot be invented", () => {
  const fused = reciprocalRankFusion([["x"], ["y"]]);
  assert.deepEqual(fused.map(entry => entry.id).sort(), ["x", "y"]);
  assert.ok(!fused.some(entry => entry.id === "z"));
});
