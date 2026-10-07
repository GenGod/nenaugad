# B38-001 — Clean posting text and the extraction prompt p2 (B38 and B39 together)

**Status: accepted by the owner, 2026-10-08.** Implemented and independently reviewed on
2026-10-07.
Basis: [docs/OPEN_GAPS.md](../docs/OPEN_GAPS.md) B38 and B39, found by the review of the
owner's first live extraction run (2026-10-07, 5 himalayas postings).

**Owner decision (2026-10-07, this session):** fix B38 and B39 together, before the worker
extracts the catalog. The prompt version re-keys every extraction, and the text re-keys
every posting an import re-reads; together, and before the catalog is extracted, a posting
is paid once under p2. The review corrected the first version of this claim: it holds only
if the catalog is re-read before it is extracted (see "Stored postings").

## Result and boundaries

**User result:** every posting's description is plain text: no leftover tags, and
paragraphs, headings and list items separated by a space instead of run together. The
extraction prompt p2 records a compensation only when the posting states an amount,
files a spoken language as a language, and files personal qualities as `other`, so a
future reader of the fields can trust `compensation` and the skill list.

**B38, the text.** `descriptionToText` removes only `p`, `br`, `li`, `ul`, `ol`, `strong`,
`em`, `b`, `i` and `a`, without a space: `h2`–`h5`, `div`, `u` and `hr` stay, and
paragraphs glue together. 608 of 700 local postings keep tags and 409 have glued
sentences. It also decodes four entities in two steps, so "&amp;lt;" became "<" (noted in
B30). The fix: every tag goes, a block tag leaves a space and an inline tag does not;
comments and script or style blocks go; entities are decoded once, with B30's decoder.

**B39, the prompt.** One record kept "Competitive compensation packages (depending on
experience, …)" as stated compensation; a spoken language was once filed as `skill`; a
sales posting's soft-skill sentences became ten `skill` requirements. Prompt p2 adds three
rules, and the parser enforces the first: a compensation whose wording holds no digit is
stored as `unknown`, so a paid call is not thrown away over a vague phrase.

**Stored postings.** No re-map: the stored text no longer has the original HTML (the old
cleaner already dropped the paragraph and list tags with their boundaries), so only a
fresh read of the source can produce the clean text. Each import re-maps the postings it
re-reads: their text, content hash and version move, and the next extraction and
embedding runs treat them as new input.

**The operating rule (review finding 1).** The extraction pass walks the whole catalog,
not only what an import re-read, and on the local database the himalayas pass is midway
(its cursor is set; last run 2026-09-25) while all 498 himalayas postings share one
`first_seen_at`. A posting extracted on its old text and re-read later is paid twice.
So, before the catalog is extracted, with live AI off (the import scripts extract after an
import, B34): run `npm run import:himalayas` until a pass that started at page 1 has
finished (the current pass first; at most one run per 24 hours, 25 pages by default,
`--pages=` up to 500), and run `npm run import:jobicy` once. Postings no feed lists any
more keep the old text and are paid once on it. Without the rule the extra cost is at
most one call per posting extracted before its re-read, about $0.0005 each (under $0.40
for today's 700).

**Not included:**
- A re-map of stored postings from their stored text (above). Postings no feed lists any
  more keep the old text until retention tombstones them.
- Other uses of the text: card excerpts come from the source's own excerpt field. The
  description is also the fallback AI input when a card has no excerpt (relevance,
  `relevance/route.ts:196` and `:263`; the batch queue, `batch-queue-service.ts:70`; letter
  generation, `cover-letters/[id]/generations/route.ts:59`); those paths are closed by the
  personal-data boundary today.
- The extraction validator's other rules, the key's shape, the model.
- Spelled-out amounts ("fifty thousand dollars"): no digit, so stored as `unknown`.

**Context:** `src/server/import/himalayas-fixture.ts` (`descriptionToText`, used by both
adapters), `src/server/import/html-entities.ts` (B30), `src/domain/extraction.ts`
(`extractionInstruction`, `parseExtraction`, `EXTRACTION_PROMPT_VERSION`),
`src/server/ai/extraction-service.ts` (the key), the B24 geography text check (it reads
the description).

**Risk: high.** It changes the input of every paid extraction and the text of every
posting an import re-reads, which feeds matching, BM25, the embeddings and the B24
geography check. Negative tests, an independent review and the owner's acceptance are
required.

**Data:** the adapters' contract fixtures and synthetic strings; no live fetch, no
provider call. The local database changes only when the owner's worker or an import runs.

## Acceptance (fixed before the code)

1. `descriptionToText` leaves no tag: a block tag (`p`, `br`, `li`, `div`, `h1`–`h6`, `hr`,
   `table` cells and rows, any unknown tag) becomes a space; an inline tag (`a`, `b`,
   `strong`, `em`, `i`, `u`, `span`, `sup`, `sub`, `small`, `code` and the like) disappears
   without one, so a word split by markup stays whole. Comments and script or style blocks
   disappear. Whitespace collapses.
2. Entities are decoded once, after the tags are gone: "&amp;lt;b&amp;gt;" reads
   "&lt;b&gt;", and an escaped tag in the source stays text.
3. Both adapters' contract fixtures still map to valid snapshots; the B24 geography
   decisions on them are unchanged.
4. `EXTRACTION_PROMPT_VERSION` is `extraction-p2`, and the instruction states the three new
   rules: an amount or `unknown`; a spoken language is `language`; personal qualities are
   `other`.
5. `parseExtraction` stores a grounded compensation whose wording holds no digit as
   `unknown` with an empty quote; a compensation with an amount is kept; every other rule
   is unchanged (an ungrounded quote still rejects the record).
6. Unchanged: the key's shape (posting, input hash, prompt version), the validator's
   rejection rules, B28's answer from a stored record.

## Plan

1. Tests first: `tests/unit/description-text.test.ts` (1, 2); in
   `tests/unit/extraction.test.ts` the prompt version and rules (4) and the compensation
   rule (5).
2. `descriptionToText`; the prompt and the parser.
3. Checks (the adapter and geography tests cover 3); mutation check; independent review;
   docs; then the owner.

**Rollback:** `git revert`. Postings an import re-mapped in between keep the new text until
they are re-read again.

## Approvals and limits

Local code and tests. No provider call, no live fetch, no spend. Coding-host spend: not
visible.

## Result (2026-10-07)

**What changed.**
- `src/server/import/himalayas-fixture.ts`: `descriptionToText` removes comments and
  script or style blocks, then every tag (an inline tag without a space, any other tag
  with one), then decodes entities once with B30's decoder; a description over 100,000
  characters is refused as one bad record (`DESCRIPTION_TOO_LONG`); the tag pattern
  cannot run past the next "<" (review finding 3).
- `src/domain/extraction.ts`: `extraction-p2`; rules (6) to (8); a grounded compensation
  without a digit (`\p{Nd}`, any script) is stored as `unknown`.
- Tests: `tests/unit/description-text.test.ts` (new: block and inline tags in any case,
  comments and scripts, one-pass entities, whitespace, the cap and a hostile input under
  500 ms, both adapters on real-looking markup, and two B24 decisions across list items
  through the jobicy adapter); `tests/unit/extraction.test.ts` (the version, the three
  rules, the compensation rule in two scripts' digits, an ungrounded vague phrase still
  rejected).

**Measured on the local database** (read-only): the new cleaner over the 700 stored
descriptions leaves 0 tags (608 had them) and loses no letter or digit outside a tag. It
cannot un-glue stored text: that needs the source's HTML, hence the operating rule.

**Mutation check:** 15 of 15 fail at least one test: a block tag without a space, an
inline tag with one, entities before the tags, entities twice, comments kept, scripts
kept, the old ten-tag list, tag names compared in their own case, script and style in
lower case only, the old backtracking tag pattern, no length cap, a vague compensation
kept, ASCII digits only, the prompt version unchanged, the language rule dropped.

**Independent review** (fresh context, 2026-10-07): the code is correct and the tests real;
not ready as first written, because of the money claim (finding 1). It ran
`npm run check:agent` (0), `npm run test:db` (88/88) and `npm run test:coverage` (0), and
probed the cleaner and the geography reader on the old and new text. Findings and what
was done:
1. *"One re-extraction for both" is not guaranteed:* the himalayas pass is midway and the
   extraction walks the whole catalog. The claim is corrected, and the operating rule and
   the bound are written above and in the status snapshot.
2. *The B24 acceptance passed trivially* (every contract fixture is one `<p>`). Adapter-level
   tests now pin two decisions across list items; real geography and workplace decisions
   change when a posting is re-read (a rule in one list item no longer runs into the next).
3. *Quadratic time on a hostile description* (an 8 MB body is allowed). Length cap and a
   non-backtracking tag pattern, both tested.
4. *Edge cases* (an attribute holding ">", CDATA and doctype kept as text, a raw "<letter"
   in text, adjacent inline elements gluing): none occurs in the local data; listed below.
5. *Uppercase inline tags and an uppercase `<SCRIPT>` were untested.* Added.
6. *The digit rule keeps "401(k)" or "3 weeks PTO" if the model returns them, and loses
   spelled-out or CJK amounts; a downgrade to `unknown` leaves no trace.* The prompt's rule
   (6) is the first line; listed below.
7. *The description is also an AI fallback input.* Named under "Not included".
8. *The OPEN_GAPS wording overstated which postings change.* Corrected.

**Checks** (on the final code, 2026-10-07):

| Command | Exit | Result |
|---|---|---|
| `npm run check` | 0 | unit 315/315; guardrails, Biome 240 files, `tsc` clean |
| `npm run test:coverage` | 0 | unit and DB 403/403; 83.15% lines, 86.75% branches, 92.01% functions |
| `npm run build` | 0 | compiled |
| `npm run test:e2e` | 0 | 99 passed |

Not run: CI on GitHub (not pushed); a live import or extraction (the owner's switch).

**Acceptance:** 1–6 met and tested locally; the independent review is done.
**Accepted by the owner 2026-10-08**, together with the operating rule.

**Limitations.**
- Stored postings keep the old text until an import re-reads them; postings no feed lists
  any more keep it until retention.
- Geography and workplace decisions can change when a posting is re-read, because rules
  no longer run across list items (correctly, in the cases probed).
- Edge markup: an attribute holding ">" leaks its tail; CDATA, doctype and processing
  instructions stay as text; adjacent inline elements still glue ("RemoteGermany"). None
  occurs in today's data.
- The digit rule is a backstop: a model that returns "401(k)" as compensation is kept,
  and a spelled-out or CJK amount becomes `unknown`; the downgrade is not marked.

**Rollback:** `git revert`. Postings an import re-mapped in between keep the new text until
they are re-read again; extractions made under p2 stay as paid evidence.

**Next small task:** the owner's catalog refresh (the operating rule), then the worker.
