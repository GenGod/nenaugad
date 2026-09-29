// Vocabulary worklist for the skills dictionary (design item A3).
//
// This is deliberately NOT a quality metric. Job postings are mostly ordinary
// prose, so most tokens are unknown by construction and a "coverage share"
// would be a number nobody can act on. What IS actionable is the
// frequency-ranked list of unknown tokens across the catalog: those are the
// candidates a human reviews before anything is added to the dictionary
// (dictionary growth stays a reviewed change, never an automatic one).
//
// Deterministic and side-effect free: same texts, same worklist.

import { hasAlias, SKILLS_DICTIONARY_VERSION } from "./skills.ts";

export type UnknownToken = Readonly<{ token: string; count: number }>;

export type DictionaryWorklist = Readonly<{
  dictionaryVersion: number;
  tokenCount: number;
  unknownTokenCount: number;
  distinctUnknownCount: number;
  topUnknown: readonly UnknownToken[];
}>;

// Words that are frequent in postings but carry no skill signal. The list is
// intentionally short and auditable; a longer one would start hiding real
// candidates. Role and domain nouns are included because they would otherwise
// dominate the worklist ("engineer(18), data(17)…") without ever becoming
// dictionary entries — a worklist nobody can act on is noise.
const STOPWORDS: ReadonlySet<string> = new Set([
  "about", "after", "also", "among", "analyst", "and", "any", "are", "automation",
  "backend", "background", "been", "being", "both", "but", "can", "candidate", "company",
  "contract", "data", "days", "design", "designer", "developer", "each", "email",
  "engineer", "engineering", "experience", "frontend", "from", "full", "game", "have",
  "hours", "into", "join", "junior", "knowledge", "lead", "learning", "like", "looking",
  "machine", "manager", "manual", "more", "most", "must", "need", "nice", "offer", "only",
  "other", "ours", "over", "part", "platform", "plus", "preferred", "product", "provide",
  "remote", "requirements", "required", "role", "salary", "science", "senior", "services",
  "should", "skills", "some", "strong", "team", "teams", "testing", "than", "that", "their",
  "them", "then", "there", "these", "they", "this", "time", "using", "very", "want", "well",
  "what", "when", "where", "which", "while", "will", "with", "work", "working", "would",
  "year", "years", "your", "yours",
  "будет", "вакансии", "года", "данных", "для", "если", "есть", "или", "ищем",
  "кандидата", "как", "команде", "команды", "мы", "наших", "них", "опыт", "по",
  "при", "проекта", "работа", "работать", "работе", "также", "требования", "уже",
  "условия", "что", "это",
]);

const TOKEN_SPLIT = /[^\p{L}\p{N}+#]+/u;

function isTokenCandidate(token: string): boolean {
  if (token.length < 4) return false; // "the", "and", "go", "ml" are noise here
  if (/^\p{N}+$/u.test(token)) return false;
  if (STOPWORDS.has(token)) return false;
  return !hasAlias(token);
}

export function dictionaryWorklist(
  texts: readonly string[],
  options: Readonly<{ topN?: number; minCount?: number }> = {},
): DictionaryWorklist {
  const topN = options.topN ?? 20;
  const minCount = options.minCount ?? 2;
  const counts = new Map<string, number>();
  let tokenCount = 0;
  for (const text of texts) {
    for (const raw of text.toLowerCase().split(TOKEN_SPLIT)) {
      if (raw.length === 0) continue;
      tokenCount += 1;
      if (!isTokenCandidate(raw)) continue;
      counts.set(raw, (counts.get(raw) ?? 0) + 1);
    }
  }
  const repeated = [...counts.entries()].filter(([, count]) => count >= minCount);
  const topUnknown = repeated
    .map(([token, count]) => ({ token, count }))
    .sort((a, b) => (b.count - a.count) || (a.token < b.token ? -1 : 1))
    .slice(0, topN);
  return {
    dictionaryVersion: SKILLS_DICTIONARY_VERSION,
    tokenCount,
    unknownTokenCount: [...counts.values()].reduce((sum, count) => sum + count, 0),
    distinctUnknownCount: counts.size,
    topUnknown,
  };
}
