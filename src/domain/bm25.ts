// BM25 over the already-gated pool (design item B2).
//
// Why in Node and not in the database: BM25 needs no storage when the pool is
// small. The caller already has the gate-passed postings, scoring them costs one
// pass over their tokens per request, and that keeps this leg free of extensions
// (no owner decision), free of a stale index (nothing can drift from the posted
// text) and measurable in the offline harness. The break threshold is stated
// below; past it this moves to tsvector/GIN or ParadeDB `pg_search`, and picking
// an extension is an owner decision, not an implementation detail.
//
// Formulas (V1, checked 2026-09-30 against primary sources):
//   * IDF = log(1 + (docCount - docFreq + 0.5) / (docFreq + 0.5))
//     — Apache Lucene, BM25Similarity javadoc (9.9.1).
//   * score(q, D) = Σ idf(qi) · f(qi,D)·(k1+1) / (f(qi,D) + k1·(1 - b + b·|D|/avgdl))
//     — the same formula; the field-length term is described in elastic.co
//     "Practical BM25, part 2".
//   * k1 = 1.2, b = 0.75 — the Lucene/Elasticsearch defaults, confirmed in both
//     sources above. They are NOT tuned here: tuning is what the A1 harness is
//     for, and an unmeasured value would be a guess.
//
// Determinism: scores are computed from the pool as given, ties break on id
// ascending, and no clock or randomness is involved.

import type { ManualProfileInput } from "./profile.ts";

export const BM25_LEG_VERSION = "bm25-l1";

export const BM25_PARAMS = { k1: 1.2, b: 0.75 } as const;

/**
 * Break threshold, recorded rather than hidden: this leg scores the whole gated
 * pool per request, so its cost grows with pool × tokens per posting. At the
 * current catalog (hundreds of postings, ~1–2k tokens each) that is a few
 * milliseconds. Revisit when a single request's pool approaches ~5k postings —
 * then the leg moves into PostgreSQL and that choice gets its own decision.
 */
export const BM25_IN_NODE_POOL_LIMIT = 5000;

export type Bm25Document = Readonly<{ id: string; text: string }>;
export type Bm25Scored = Readonly<{ id: string; score: number }>;

/**
 * Tokenizer for lexical matching. Two properties are deliberate:
 *   * compound technical tokens survive as one token ("c#", "c++", "node.js",
 *     ".net"), because splitting them destroys exactly the queries this leg
 *     exists to serve (the C# case in the B2 verification matrix);
 *   * a dotted/compound token also contributes its alphabetic parts when they are
 *     at least two characters, so "node" finds a posting that only says
 *     "node.js" — single characters are dropped to keep "c" from matching
 *     everything.
 * No stop-word list: it is language-specific, and IDF already discounts a term
 * that appears everywhere. Adding one is a measurement question, not a
 * preference.
 */
export function tokenizeForBm25(text: string): readonly string[] {
  const tokens: string[] = [];
  for (const raw of text.toLowerCase().split(/[^\p{L}\p{N}+#.]+/u)) {
    const token = raw.replace(/^[.#+]+/u, "").replace(/[.]+$/u, "");
    if (token.length === 0) continue;
    if (token.length >= 2 || /\p{N}/u.test(token)) tokens.push(token);
    if (/[.+#]/u.test(token)) {
      for (const part of token.split(/[.+#]+/u)) {
        if (part.length >= 2 && part !== token) tokens.push(part);
      }
    }
  }
  return tokens;
}

type TermFrequency = Readonly<Map<string, number>>;

function termFrequencies(text: string): TermFrequency {
  const counts = new Map<string, number>();
  for (const token of tokenizeForBm25(text)) counts.set(token, (counts.get(token) ?? 0) + 1);
  return counts;
}

/**
 * Scores every document in the pool against the query.
 *
 * Documents that share no term with the query are NOT returned: a position list
 * that contains everything would hand out rank credit in the fusion (B2's RRF)
 * to postings the query never matched, which is how a fusion leg silently
 * becomes noise. Absence from this list is meaningful; the caller reports the
 * uncovered count.
 */
/**
 * The lexical query for a profile: the same information the embedding query
 * carries, without the labels. A dense model reads "Skills: python" as a header
 * plus content, and the header helps it; a lexical leg would treat the word
 * "skills" as a query term and match every posting that mentions the word in
 * prose. Roles, skills and employment types are content words, so those go in;
 * residence and timezone are deliberately left out — country codes and zone names
 * are not what a posting is about, and the eligibility gates already handle them.
 */
export function profileLexicalQuery(input: ManualProfileInput): string {
  const parts = [
    ...input.targetRoles,
    ...input.skills,
    ...input.employmentTypes.map(type => type.replace(/^employment_/u, "").replace(/_/gu, " ")),
  ];
  return parts.join(" ");
}

export function bm25Rank(
  query: string,
  documents: readonly Bm25Document[],
  limit?: number,
): readonly Bm25Scored[] {
  const queryTerms = [...new Set(tokenizeForBm25(query))];
  if (queryTerms.length === 0 || documents.length === 0) return [];

  const frequencies = documents.map(document => termFrequencies(document.text));
  const lengths = frequencies.map(counts => {
    let total = 0;
    for (const count of counts.values()) total += count;
    return total;
  });
  const averageLength = lengths.reduce((sum, length) => sum + length, 0) / (lengths.length || 1);
  const documentFrequency = new Map<string, number>();
  for (const term of queryTerms) {
    let frequency = 0;
    for (const counts of frequencies) if (counts.has(term)) frequency += 1;
    documentFrequency.set(term, frequency);
  }

  const scored: Bm25Scored[] = [];
  documents.forEach((document, index) => {
    const counts = frequencies[index];
    const length = lengths[index];
    if (!counts || length === undefined) return;
    let score = 0;
    for (const term of queryTerms) {
      const frequency = counts.get(term);
      if (frequency === undefined) continue;
      const df = documentFrequency.get(term) ?? 0;
      const idf = Math.log(1 + (documents.length - df + 0.5) / (df + 0.5));
      const normalisation = BM25_PARAMS.k1 * (1 - BM25_PARAMS.b + BM25_PARAMS.b * (length / averageLength));
      score += idf * (frequency * (BM25_PARAMS.k1 + 1)) / (frequency + normalisation);
    }
    if (score > 0) scored.push({ id: document.id, score });
  });

  scored.sort((left, right) => {
    if (left.score !== right.score) return right.score - left.score;
    if (left.id === right.id) return 0;
    return left.id < right.id ? -1 : 1;
  });
  return limit === undefined ? scored : scored.slice(0, Math.max(0, limit));
}
