# PERF-002 — `/jobs` renders the whole external catalog at once

**Status: implemented and tested locally 2026-11-02; owner acceptance pending.** Found by the owner while reviewing DS-002 locally:
"page "jobs" is loading too slow and with no loading state".

## Evidence (2026-11-02, dev server on the local database)

| Measure | Value |
|---|---|
| `/jobs` time to first byte, three runs | 34.9 s, 29.6 s, 26.1 s |
| `/jobs` HTML | 21.3 MB, 3,531 `<article>` cards (4 demo + 3,527 external) |
| `/` for comparison | 0.09 s |
| `readSnapshotCardsData` himalayas / jobicy | 2,981 rows in 215 ms / 601 rows in 47 ms |
| `readSnapshotCards` (read + dedup + projection) | 3,527 cards in ~250 ms |

**Root cause:** the «Внешние источники» section renders every published snapshot card in
one response; there is no page size. Data costs ~0.25 s; rendering and sending 3.5k cards
costs the rest. The catalog grew 2.6× since B57 (Jobicy pages through its whole feed) and
the B59 remap, so this crossed from slow to unusable. Not caused by DS-002: the Signal
branch does not touch `snapshot-catalog-service.ts`, `jobs/page.tsx` or `snapshot-card.tsx`.
Also: the SQL has no `ORDER BY`, so the cards' order was arbitrary, while the page says
«Сначала новые».

## Result and boundaries

- The external section shows **24 cards per page**, newest first (source publication date,
  else first seen; then id), with «Показаны 1–24 из 3 527» and «Новее / Старее» links that
  keep `q`. A new `page` parameter (1–9999) is validated as strictly as the others, but
  apart from the shared catalog query; a page past the end shows the last page.
- `/jobs/loading.tsx`: a Signal loading state (the page head, a `role="status"` line and
  static skeleton rows) while the server renders.

**Not included:** the search box filters only the demo catalog, not external sources (a
product gap, recorded in `docs/OPEN_GAPS.md` if not already there); pushing the limit into
SQL (data is 0.25 s, not the bottleneck).

**Risk:** low: presentation of public data; no rights, storage or API change.

## Plan
1. `page` is parsed apart from `parseCatalogQuery` (changed during the work: that parser
   also serves `/api/v1/jobs`, whose contract should not gain a meaningless parameter).
2. `src/domain/catalog-page.ts`: `newestFirst`, `pageOf`, `parsePageParam`; unit tests first.
3. `src/app/jobs/page.tsx`: sorted, paged section and pager; `loading.tsx`.
4. Measure again; e2e and visual unchanged (the fixture backend has no external section).

## Changes

- `src/domain/catalog-page.ts` (new): `newestFirst` (source date, else first seen, then
  id; does not mutate), `pageOf` (clamps a page past the end to the last page; an empty
  list is one empty page), `parsePageParam` (absent → 1; one integer 1–9999; else
  `INVALID_QUERY`), `EXTERNAL_PAGE_SIZE = 24`.
- `src/app/jobs/page.tsx`: reads `page` itself and removes it before `parseCatalogQuery`,
  so `/api/v1/jobs` keeps its contract; the external section is sorted, paged, anchored at
  `#external`, says «Показаны 1–24 из 3527 · сначала новые …», and has a pager
  («← Новее» · «Страница N из M» · «Старее →») that keeps `q`.
- `src/app/jobs/loading.tsx` (new): the page head, an `<output>` status line («Загружаем
  вакансии…») and three static skeleton rows; streamed before the page content.
- `src/app/globals.css`: `.loading-row`, `.pager` (tokens only).
- `docs/OPEN_GAPS.md`: B60 — the search ignores external sources.

## Measured after (same dev server, same database)

| Measure | Before | After |
|---|---|---|
| `/jobs` time to first byte | 26.1–34.9 s | 0.05–0.08 s |
| `/jobs` total | 26.4–35.8 s | 0.63–0.71 s |
| `/jobs` HTML | 21.3 MB, 3,531 cards | 192 KB, 28 cards |
| `/jobs?page=147` (last) | — | 200, 0.56 s |
| `/jobs?page=abc` | — | the existing «Проверьте параметры поиска» page |

The loading fallback is in the streamed HTML at byte 3,903, before the page content
(byte 131,951); rendered on its own it shows the head, the status line and three skeleton
rows. The pager was checked on page 2 of 147.

## Tests

- `tests/unit/catalog-page.test.ts` (new, 5 tests, written first and seen failing).
- No e2e change: the e2e server runs on the fixture backend, which has no external
  section.

## Checks (2026-11-02)

| Command | Result |
|---|---|
| `npm run check` | exit 0 (unit 382/382, lint, typecheck, guardrails) |
| `npm run test:coverage` | exit 0, 504/504; 84.66 / 88.02 / 93.30 (ratchet 84/88/93 holds); `catalog-page.ts` 100% lines |
| `npm run test:e2e` | 126/126 (run with the review dev server stopped: Next 16 refuses a second `next dev` in the same folder) |
| `build`, `test:db` | not re-run: `test:db` does not touch the page; the build was green at DS-002d and this adds one route file and a pure module |

## Repair log: CI's coverage gate after the push of main (2026-11-02)

CI run 41447897923 (merge `239e3e0`): Code quality and Build green; Tests failed with every
test passing (`fail 0`) and "87.99% branch coverage does not meet threshold of 88%". The
threshold was raised 87 → 88 in DS-002b on a local 88.02%; Linux CI measures ~0.03 points
lower, so the raise overshot.

**Cycle 1 (hypothesis recorded):** "CI measures 87.99% branch coverage against the 88%
ratchet because the new catalog-page and condition-strip modules leave a few branches
untested; covering those branches lifts CI above 88% without lowering the ratchet."
Change: three tests — an unreadable date sorts last and equal cards keep a stable order
(`catalog-page.ts` 83.33% → 100% branches); a job-level rule the engine did not return is
unknown with a reason; an explicit schedule without offsets draws no strip
(`condition-strip.ts` 97.96% → 100%). Local branch coverage 88.02% → 88.14%. The
ratchet is not lowered.

**Found on the way, not fixed here (auth, B53):** `tests/integration/auth-attempts.test.ts`
"expired windows are pruned…" fails in the local full run (2/2) and sometimes alone: one
prune removed all 150 expired rows instead of at most 100. `EXPLAIN` on the test database
shows `pruneAttempts`' `DELETE … WHERE key IN (SELECT … LIMIT 100 FOR UPDATE SKIP LOCKED)`
planned as a Nested Loop Semi Join with the limited subquery on the inner side, which
PostgreSQL may rescan, so the per-login bound depends on table statistics. Only expired
windows are ever deleted (no security bypass); the bounded-work guarantee fails. Passed on
CI (fresh database). Proposed as its own task; auth changes need a separate review.
