// Near-duplicate candidate detection over stored posting vectors (design item
// B5 — the cross-lingual, embedding part of deduplication that A4's exact keys
// deliberately do not cover).
//
// What it produces: a REVIEW LIST. Nothing here merges, hides or re-ranks
// anything — the product path is untouched, and a queued pair is a question for
// a human, not a decision (until C5 puts an LLM behind the same queue, it stays
// a manual review, per the brief).
//
// The rule is deliberately not a pure threshold (the brief records that failure):
//
//   candidate  ⟺  text cosine >= textCosine  AND  title cosine >= titleCosine
//
// The title gate is what separates "the same posting, translated or reworded"
// from "another role at the same employer": two postings from one company share
// boilerplate (remote policy, benefits, about-us) and can push the full-text
// cosine up while the titles disagree. Both gates compare DOCUMENT vectors from
// the same artifact — a lexical title comparison would break exactly the
// cross-lingual case this item exists for.
//
// Measured 2026-10-04 with the reference artifact (Qwen3-Embedding-0.6B int8,
// synthetic postings written for the measurement — EN/RU translation pair, an EN
// paraphrase of the same posting, a different role at the same company, a
// same-title template at another company, and an unrelated posting):
//
//   same posting, EN vs RU translation          0.811 / 0.846
//   same posting, EN vs EN paraphrase           0.854 / 0.913
//   translation vs paraphrase                   0.743 / 0.789   <- lowest true pair
//   different role, same company                0.582 / 0.731   <- excluded by both gates
//   same title, other company, template text    0.662 / 1.000   <- title alone is not enough
//   same title, other company, shared phrasing  0.724 / 0.913   <- KNOWN false positive
//   unrelated postings                          0.365 / 0.659
//
// Thresholds 0.70 / 0.75 sit between the lowest true pair and the highest pair
// whose roles differ. The remaining false-positive class (queue above) is
// accepted ON PURPOSE: a wrongly queued pair costs a reviewer a minute, while a
// missed duplicate stays in the catalog exactly as it is today — and the queue
// never merges anything. Skipping a real duplicate is the cheaper mistake.
//
// Pairs that A4 already groups (equal dedup key) are not candidates here: they
// are exact duplicates, already shown as one card; this module never re-reports
// them. A pair whose HIRING GEOGRAPHY differs is not a candidate either: A4's
// identity already treats the same title under a different hiring scope as a
// different opportunity (dedup.ts: geography is part of the key because merging
// across it would silently widen or narrow eligibility). The live catalog made
// the case for the veto measurable — before it, the queue was dominated by
// regional clones ("Senior Backend Engineer | UK" vs "… | USA", text cosine
// 0.94): real pairs by score, automatic "no" for a reviewer. The price is a
// syndicated copy whose geography is missing on one side ("unspecified" is its
// own key and does not match a specified scope) — A4 keeps that pair apart too,
// so the queue does not propose what the product will not merge. Same-source
// near-duplicates ARE included (a board can carry one posting twice, e.g. after
// a repost) — the pair carries `sameSource` so the reviewer can tell the two
// cases apart.
//
// Scale (measured on this machine, 2026-10-04): the pairwise scan runs at
// ~0.24M pairs/s — 700 postings ≈ 1 s, 5 000 ≈ 53 s, 20 000 ≈ 14 min.
// textNeighbours is the place where LSH/MinHash (research part 2 D2) would
// replace the full scan; that switch is due when the catalog approaches ~5 000
// postings. Recorded in docs/EMBEDDING_PLAYBOOK.md.
//
// Deterministic: same vectors, same list — no clock, no database; pairs come
// out best-first with the lexicographically smaller id first.
import { cosineSimilarity, EmbeddingVersionMismatchError, type EmbeddingVector } from "./embeddings.ts";

export const NEAR_DUP_VERSION = "near-dup-l1";

/** Measured, not chosen: see the measurement block above. */
export const NEAR_DUP_THRESHOLDS = {
  textCosine: 0.70,
  titleCosine: 0.75,
} as const;

export type NearDupThresholds = Readonly<{ textCosine: number; titleCosine: number }>;

/** Everything the cheap first pass needs. */
export type TextVectorItem = Readonly<{
  id: string;
  /** Document vector of title + body (jobEmbeddingText). */
  text: EmbeddingVector;
}>;

export type NearDupItem = TextVectorItem & Readonly<{
  sourceId: string;
  /** A4's normalised company key; empty means "not readable". */
  companyKey: string;
  /** A4's exact key — equal keys are exact duplicates, skipped here. */
  dedupKey: string;
  /** A4's geography key — different scopes are different opportunities. */
  geographyKey: string;
  /** Document vector of the title alone. */
  title: EmbeddingVector;
}>;

export type TextNeighbour = Readonly<{ a: string; b: string; textCosine: number }>;

export type NearDupPair = Readonly<{
  a: string;
  b: string;
  textCosine: number;
  titleCosine: number;
  sameCompany: boolean;
  sameSource: boolean;
}>;

/**
 * The cheap first pass: every pair whose full-text cosine clears `minTextCosine`,
 * best first. Exported because it is exactly the stage a caller uses to decide
 * WHOSE titles are worth embedding (the CLI embeds title vectors lazily for this
 * set only), and because it is the stage LSH would replace at scale.
 */
export function textNeighbours(
  items: readonly TextVectorItem[],
  minTextCosine: number,
): readonly TextNeighbour[] {
  const neighbours: TextNeighbour[] = [];
  for (let left = 0; left < items.length; left += 1) {
    const a = items[left];
    if (!a) continue;
    for (let right = left + 1; right < items.length; right += 1) {
      const b = items[right];
      if (!b) continue;
      const textCosine = cosineSimilarity(a.text, b.text);
      if (textCosine >= minTextCosine) {
        // Canonical pair order (smaller id first): the output then does not
        // depend on the input order, which the tests pin.
        const [first, second] = a.id < b.id ? [a, b] : [b, a];
        neighbours.push({ a: first.id, b: second.id, textCosine });
      }
    }
  }
  return sortPairs(neighbours);
}

/**
 * The queue. Every returned pair passed both gates; pairs with equal A4 keys are
 * excluded (they are exact duplicates — A4's business, not this module's).
 */
export function nearDuplicateCandidates(
  items: readonly NearDupItem[],
  thresholds: NearDupThresholds = NEAR_DUP_THRESHOLDS,
): readonly NearDupPair[] {
  for (const item of items) {
    if (item.text.role !== "document" || item.title.role !== "document") {
      throw new EmbeddingVersionMismatchError("DOCUMENT_ROLE_REQUIRED");
    }
    if (
      item.text.modelVersion !== item.title.modelVersion
      || item.text.instructionVersion !== item.title.instructionVersion
    ) {
      throw new EmbeddingVersionMismatchError("MODEL_VERSION_MISMATCH");
    }
  }
  const first = items[0];
  if (first) {
    for (const item of items) {
      if (
        item.text.modelVersion !== first.text.modelVersion
        || item.text.instructionVersion !== first.text.instructionVersion
      ) {
        // A queue built from two vector spaces would compare apples with pears
        // and look plausible; that is the failure this refusal exists for.
        throw new EmbeddingVersionMismatchError("MODEL_VERSION_MISMATCH");
      }
    }
  }
  const byId = new Map(items.map(item => [item.id, item]));
  const queue: NearDupPair[] = [];
  for (const neighbour of textNeighbours(items, thresholds.textCosine)) {
    const a = byId.get(neighbour.a);
    const b = byId.get(neighbour.b);
    if (!a || !b) continue;
    if (a.dedupKey === b.dedupKey) continue; // exact duplicate: A4 already groups it
    if (a.geographyKey !== b.geographyKey) continue; // different hiring scope: a different opportunity
    const titleCosine = cosineSimilarity(a.title, b.title);
    if (titleCosine < thresholds.titleCosine) continue;
    const [first, second] = a.id < b.id ? [a, b] : [b, a];
    queue.push({
      a: first.id,
      b: second.id,
      textCosine: neighbour.textCosine,
      titleCosine,
      sameCompany: first.companyKey.length > 0 && first.companyKey === second.companyKey,
      sameSource: first.sourceId === second.sourceId,
    });
  }
  return sortPairs(queue);
}

/** Best first, then by id pair so the output never depends on input order. */
function sortPairs<T extends Readonly<{ a: string; b: string; textCosine: number }>>(
  pairs: readonly T[],
): readonly T[] {
  return [...pairs].sort((left, right) =>
    (right.textCosine - left.textCosine)
    || left.a.localeCompare(right.a)
    || left.b.localeCompare(right.b));
}
