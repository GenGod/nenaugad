// B60: the /jobs search box filters the external cards too. Owner decisions 2026-11-02:
// a query searches the text the card shows (title, company, excerpt), and every query
// word must start a word of it. The full text is never searched: no source's policy
// publishes it, so a hit has to be explainable from the card itself. The caller passes
// the cards it is allowed to show (policy gates and dedup already applied), and keeps
// its own order: the section stays newest first.

export type Searchable = Readonly<{ title: string; company: string; excerpt: string }>;

const WORD_CHAR = /[\p{L}\p{N}]/u;
// Scripts written without spaces between words: a word there can start anywhere.
const UNSPACED_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]/u;

// NFKC folds compatibility forms ("ＡＷＳ" is "AWS") on both sides of the comparison.
const fold = (text: string): string => text.normalize("NFKC").toLowerCase();

/**
 * The query's words, folded. Quotes and punctuation around a word are dropped, while
 * the signs of compound technical words stay ("c#", "c++", "node.js", ".net"); a word
 * with no letter or digit left is not searchable.
 */
export function searchTerms(q: string): readonly string[] {
  const terms: string[] = [];
  for (const raw of fold(q).split(/\s+/u)) {
    const term = raw.replace(/^[^\p{L}\p{N}.#+]+/u, "").replace(/[^\p{L}\p{N}#+]+$/u, "");
    if (WORD_CHAR.test(term)) terms.push(term);
  }
  return terms;
}

// "design" finds "Designer" and "stack" finds "Full-Stack", while "go" does not find
// "cargo". A word that starts with a sign (".net" in "ASP.NET") or is written in a
// script without spaces matches anywhere.
function matcherFor(term: string): (text: string) => boolean {
  if (!WORD_CHAR.test(term[0]!) || UNSPACED_SCRIPT.test(term)) return text => text.includes(term);
  return text => {
    for (let at = text.indexOf(term); at !== -1; at = text.indexOf(term, at + 1)) {
      if (at === 0 || !WORD_CHAR.test(text[at - 1]!)) return true;
    }
    return false;
  };
}

/** The cards that hold every query word; an empty query returns the input as is. */
export function searchCards<T extends Searchable>(cards: readonly T[], q: string): readonly T[] {
  if (q.trim() === "") return cards;
  const matchers = searchTerms(q).map(matcherFor);
  if (matchers.length === 0) return [];
  // Fields are joined by a line break, so no word can span two of them.
  return cards.filter(card => {
    const text = fold(`${card.title}\n${card.company}\n${card.excerpt}`);
    return matchers.every(matches => matches(text));
  });
}
