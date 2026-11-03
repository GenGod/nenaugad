# B60-001 — the `/jobs` search box searches the external sources too

**Status: implemented and tested locally 2026-11-02; committed in `40feb4e` and merged into main 2026-11-03 at the owner's word; not pushed.** Gap B60 in
`docs/OPEN_GAPS.md`, found by PERF-002: the search box (`q`) filters only the 4 synthetic
catalog jobs, while the «Внешние источники» section (about 3,600 cards from Himalayas,
Jobicy and Remote First Jobs, 24 a page, newest first) shows the same pages whatever the
query.

## Problem

`src/app/jobs/page.tsx` passes `q` to `readCatalog` (the demo catalog, `selectCatalog`:
every whitespace-separated term must be a case-insensitive substring of title, company
or skills) and calls `readSnapshotCards()` with no query. The pager already keeps `q` in
its links, so a query plus «Старее →» walks the unfiltered external list.

## Owner decisions (2026-11-02, relayed by the parent session)

Asked before the code; measured on the local database the same day: the excerpt
averages 175 characters for Himalayas, 364 for Jobicy and 296 for Remote First Jobs,
against 4.2k–6.3k of full text.

1. **Fields: the text the card shows: title, company and excerpt** (option A). Not
   chosen: also skills extracted from the full text (a card could match on a word it
   does not show; needs a migration and a re-map); title and company only.
2. **Order: filter, then newest first, then page** (option A), as without a query.
   Not chosen: lexical relevance (BM25). Filter-then-page is the only coherent pairing:
   filtering a page of the unfiltered list would show 0–24 cards and a wrong total.
3. **Matching rule** (proposed with the questions, not objected to): every query word
   must match (AND), case-insensitively, at the start of a word.

## Acceptance (fixed before the code)

1. With a non-empty `q`, the external section lists only the cards whose title,
   company or excerpt contains every query word at the start of a word; the count and
   the pages («Показаны 1–24 из N», «Страница 1 из M») are those of the matches, newest
   first; the pager keeps `q` (it already does).
2. Word rules: case-insensitive, Unicode-compatible forms folded (NFKC: full-width
   «ＡＷＳ» finds "aws"); "design" finds "Designer", "go" does not find "cargo";
   "full-stack", "c#", "c++", "node.js" stay whole; "stack" finds "Full-Stack"; a word
   that starts with a sign (".net") matches anywhere ("ASP.NET"); a word in a script
   written without spaces (Chinese, Japanese, Thai) matches anywhere; quotes and
   trailing punctuation around a query word are dropped («"React,"» → "react").
3. A query with nothing searchable left ("!!!") matches no external card, as it
   matches no demo job. An empty query changes nothing.
4. Never searched: the full text (`description_text`), a source whose policy does not
   publish, a posting outside the main catalog, and the text of a duplicate that is not
   the card's primary record: the search runs on the cards `readSnapshotCards` returns.
5. With a query and no external match, the section stays, says so, and says what is
   searched («по названию, компании и показанному фрагменту; полный текст — на
   источнике»); with matches, the same scope line is shown. Without a query the section
   is unchanged.
6. `/jobs` without a query is no slower than PERF-002 measured (TTFB 0.05–0.08 s, total
   0.63–0.71 s on the dev server); with a query the added cost is measured and stated.

## Boundaries (fixed whatever the decisions)

- Only cards that already reach the section are searched: the query runs after
  `readSnapshotCards` (policy publishes, main catalog, cross-source dedup). A source whose
  policy does not publish contributes nothing to the search either.
- The query never reads text the card may not show. All three external policies deny
  `publish_full_text`, so `description_text` is not matched; a hit must be explainable
  from what the card publishes, unless the owner rules otherwise for derived fields.
- `/api/v1/jobs` and `parseCatalogQuery` keep their contract; the query is validated as
  today (up to 100 characters, no control characters, no repeated parameter).
- The demo catalog's own filter is not changed.

**Risk:** normal — the public read path for third-party content (policy gates), no
storage, rights or API change. Effort `high`.

## Plan

1. `src/domain/catalog-search.ts` (new): `searchTerms(q)` and `searchCards(cards, q)`
   over `{ title, company, excerpt }`; unit tests first, seen failing.
2. Filter in Node after `readSnapshotCards`, not in SQL: the query must see the card as
   shown, after policy gates and cross-source dedup. Filtering rows before dedup could
   change which copy becomes the card or drop a source from its provenance. Data costs
   ~0.25 s for the whole catalog (PERF-002), and the filter is one pass over ~3.6k short
   texts.
3. `src/app/jobs/page.tsx`: `pageOf(newestFirst(searchCards(cards, q)))`; the section
   shows while any external card exists; the query line and the empty state.
4. DB test in `tests/integration/snapshots.test.ts`: a Jobicy fixture import, then
   `readSnapshotCards` + `searchCards`: title, company and excerpt words find their
   card; a description-only word and an excluded posting's title find nothing.
5. Measure `/jobs`, `/jobs?q=…` and a later page on a dev server in this worktree; run
   `npm run check`, `npm run test:coverage`; close B60.

## Changes

- `src/domain/catalog-search.ts` (new): `searchTerms(q)` (NFKC + lower case, whitespace
  split, surrounding quotes and punctuation dropped, `.#+` kept, a word without a letter
  or digit dropped) and `searchCards(cards, q)` (an empty query returns the input as
  is; a query with no searchable word matches nothing; title, company and excerpt are
  joined by line breaks so no word spans two fields; input order kept).
- `src/app/jobs/page.tsx`: `pageOf(newestFirst(searchCards(snapshots.cards, query.q)))`;
  the section shows while any external card exists; with a query the head says «По
  запросу «q» показаны 1–24 из N», a line says what is searched («Поиск идёт по
  названию, компании и показанному фрагменту; полный текст вакансии — на источнике»),
  and no match shows «Во внешних источниках по этому запросу ничего нет» with a link to
  all external cards. Without a query the section is unchanged.
- `tests/unit/catalog-search.test.ts` (new, 13 tests); `tests/integration/snapshots.test.ts`:
  one DB test.
- `docs/OPEN_GAPS.md`: B60 closed.

## Measured (2026-11-02, dev server in this worktree on the local database)

| Request | First byte | Total | External cards |
|---|---|---|---|
| `/jobs` | 0.04–0.05 s | 0.57–0.63 s | 24 of 3,622 |
| `/jobs?page=2`, `?page=147` | 0.04–0.06 s | 0.55–0.62 s | 24 |
| `/jobs?q=engineer` (and `&page=3`) | 0.04–0.05 s | 0.52–0.56 s | 24 of 662 |
| `/jobs?q=python` | 0.04–0.06 s | 0.56–0.61 s | 24 of 26 |
| `/jobs?q=senior%20react` | 0.04 s | 0.41 s | 8 |
| `/jobs?q=zzqqxx` | 0.04 s | 0.37–0.47 s | 0 (empty state) |

PERF-002 measured 0.05–0.08 s and 0.63–0.71 s for `/jobs`: no regression. The filter
alone, timed on the 3,622 real cards: median 2.9–3.8 ms per query (max 6.3 ms), against
~350 ms for `readSnapshotCards`. Checked in the browser: «По запросу «engineer» показаны
25–48 из 662», «Страница 2 из 28», both pager links keep `q`, every card on the page
holds the word in its title, company or excerpt; the empty state and the scope line
render; no console errors.

## Tests

- Unit (13, written first, seen failing on the missing module): fields, AND, word start
  ("design" → "Designer", "go" ↛ "cargo", "esigner" ↛ anything), compound words, a
  sign-led word, no word across fields, NFKC, Japanese, Cyrillic, punctuation, a query
  with nothing searchable, order and no mutation. Red-green on the rule: with the
  word-start check disabled, 2 tests fail; restored, 13/13.
- DB: Himalayas and Jobicy fixture imports, then `readSnapshotCards` + `searchCards`:
  title, company and excerpt words find their card; a word only the stored full text
  holds ("asynchronously", "netherlands") finds nothing; an excluded posting's title
  ("office-leaning", "harbor") finds nothing; the syndicated Northwind posting is one
  card, and the word only its non-primary Jobicy copy shows ("worldwide") finds nothing.
  A source whose policy does not publish is not tested here: `readSnapshotCards` skips
  it before the search (its own tests), and the committed policies all publish.

## Checks (2026-11-02)

| Command | Result |
|---|---|
| `npm run check` | exit 0 (unit 421/421, lint, typecheck, guardrails, tokens, icons) |
| `test:coverage` | exit 0, 546/546; 85.48 / 88.90 / 93.84 (ratchet 85/88/93 holds; the next whole numbers are not reached); `catalog-search.ts` 100% |
| `test:db` | covered by the coverage run (all `tests/integration/*.test.ts`) |
| `build`, `test:e2e` | not run: the e2e and visual runs use the fixture backend, which has no external section, and the demo section is unchanged |

The worktree has no `.env` (copying it is denied), so the coverage command ran as its
`package.json` line with `--env-file=<main checkout>/.env` in place of
`--env-file-if-exists=.env`; the dev server loaded the same file through a wrapper in the
session scratchpad. Nothing was printed. The temporary launch entry was reverted.

## Limitations

- Recall is bounded by the excerpt (owner decision 1): a skill named only deep in a
  posting is not found; Himalayas excerpts are the shortest.
- Prefix matching finds "java" in "JavaScript" and "go" in "Golang" or "Good".
- No relevance order (owner decision 2): a multi-word query lists matches newest first.

**Rollback:** revert `src/app/jobs/page.tsx`; the new module and tests can stay or go.
No data, schema or policy change.
