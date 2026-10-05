# A7-001 — «Что нового»: a deterministic digest (push-MVP without email)

**Result:** matching now has an honest in-app «what's new» digest: the candidate
sees the jobs that appeared **after their last view of matching**, and nothing
more. The window comes from facts the product already records: when we first
saw the job (`firstSeenAt`, A5) and when the candidate last saw the feed (a
fresh impression in the journal, A8). No new table, no writes on page render —
a GET that moved the cursor could be triggered by a prefetch, and a digest that
lies about «new» is worse than no digest. A closed job cannot enter the digest:
it is computed at read time from the same gates as the feed.

**Not included:** email/external channels (`send_email` — denied in the source
matrices; the delivery channel is an owner decision), a precomputed
candidate-set table (meaningful only with external delivery and traffic —
research D9), a frequency cap (nothing to limit: the candidate opens the in-app
page themselves), push notifications.

**Dependencies:** A1, A4, A5, A8 (the journal as the window source), A6 (the
seen-set as the «do not repeat» filter).

## What was added

- `src/domain/digest.ts` — pure rules: `classifyFreshness` (`new` / `earlier` /
  `unknown_age`), `compareForDigest` (fresh first, dateless last, id as the
  tie-break), `lastFeedViewLabel` (an honest window label in UTC or null for
  the first view). No clock inside — time is passed in.
- `src/server/digest-service.ts` — `digestForUser`: builds the digest from
  `matchedForUser` (the same gates, dedup, hidings and seen-set) and the cursor
  from the journal; `MAX_DIGEST_ITEMS = 50`.
- `src/server/events-service.ts` — `lastImpressionAt` (an owner-scoped journal
  read): the time of the last feed impression.
- `src/server/matching-service.ts` — `matchedForUser(userId, { pool })`: the
  pool became injectable so the product path and the tests run one code path
  (additive, the default value unchanged).
- `src/app/api/v1/digest/route.ts` — `GET` (401 without a session; 409 without
  a profile; 200 with `status`, `since`, `newCount`, `earlierCount`,
  `seenSuppressed`, `items`). No POST: the page writes nothing.
- `src/app/whats-new/page.tsx` — the «Что нового» page: the first view is
  honestly named the first view; there is a «Новое с прошлого просмотра» block
  and a «Совпадения из прошлых обзоров» block; the empty state explains the
  reason, including items hidden by the seen-set (A6) with their return date.
- `src/app/matched/page.tsx` — a «Что нового» link in the mode switcher
  (rendered only in postgres mode with data, so the fixture-mode visual
  baselines do not change).
- Tests: `tests/unit/digest.test.ts` (4 tests), `tests/integration/digest.test.ts`
  (3 tests on the live DB), `tests/e2e/s2b.spec.ts` — the API contract (401
  anonymous, 200 and honest emptiness on the fixture backend, a page without a
  fake list).

## Protocol V0–V6

- **V0.** A separate task (item A7); the DB schema was not changed — no new
  migration.
- **V1.** Part 2 D1 re-read: push matching as a value generator at zero
  traffic; filter by job status when sending. Verified against the code:
  closure lives in `lifecycle`, and `classifySnapshot` cuts everything except
  `active` — so computing the digest at read time gives us the status filter
  «for free» and we cannot send a closed job. The «precomputed candidate-set»
  decision is deliberately postponed (research D9: realtime is cheap with a
  small catalog; the table becomes relevant when delivery leaves the app).
- **V2.** Principles: letters/notifications do not leave the local contour (the
  channel is the page only; recorded explicitly); the digest does not show what
  the candidate has already seen (the A6 seen-set — a test); unknown age is not
  «new»; one candidate's signals do not affect another (a two-user test);
  deleting the profile deletes the window (the journal) — a test; a closed job
  is not served (golden 7 — a test through the real closure-checks mechanism).
- **V3.** `npm run check` → exit 0 (**180/180** unit, was 176; biome 171 files;
  tsc clean); **`npm run test:db` → exit 0 (40/40**, 3 new A7 tests on the live
  test DB); `npm run build` → exit 0 (the routes `/api/v1/digest`,
  `/whats-new` built); **`npm run test:e2e` → 96 passed** (93 + 3 viewports of
  the new contract test). The scenario was walked manually on the local dev DB
  (postgres): the first view — «подбор ещё не открывался, «новым» считается
  всё»; after viewing matching (46 impressions recorded by the A6 client) the
  digest showed the window «2026-09-29 13:20 UTC», 0 new, and the honest reason
  («скрыто 46, вернутся при изменении или через 14 дней»). The test user's
  records were deleted after the check.
- **V4.** A7 golden cases: golden 7 — a closed job excluded (test: two spaced
  inactive checks close the records, the digest is empty); «new» appears only
  after the window (test: a late import is the only new one);
  dedup/hidings/the eligibility gate are inherited from the feed by
  construction.
- **V5.** Existing tests not weakened; the new catalog reset in the digest
  tests touches only the test DB and runs before each file's own inserts;
  guardrails/check green; the diff reviewed.
- **V6.** This file + an entry in `IMPLEMENTATION_STATUS.md`.

## Repair cycles: 2/2 (limit exhausted, work green)

1. The digest's first `test:db` returned `no_profile`: the service went to
   `snapshotPool()` (DATABASE_URL, the dev database), while the tests run
   against `TEST_DATABASE_URL`. Hypothesis: the pool must be injectable — then
   the product path and the test run one code path. Confirmed (the change is
   additive, the default behavior unchanged).
2. Second run: hard-coded expectations (3 visible jobs, a specific id) do not
   match the data: part of the jobicy fixtures is cut by the rules (contract,
   remote conflict), and snapshots from himalayas of other files remain in the
   shared test DB. Hypothesis: the visible set must be derived by the same
   gate pipeline (`matchedForUser`), and the catalog must be cleaned entirely
   in the test. Confirmed.

## Limitations

1. The delivery channel is the in-app page only. Email is impossible:
   `send_email` is denied in the source matrices; an owner decision (brief,
   decisions №7).
2. No frequency cap implemented: there is nothing to limit while there are no
   send-outs; it will come with the external channel.
3. «New» is defined by our first observation (`firstSeenAt`), not by the date
   the source claims — this is deliberate (A5 anti-gaming); a job that has hung
   on the source for a long time but was first seen by us will honestly be
   «new».
4. The window = the last *feed impression*, not «the last visit to the site»:
   if the candidate only opened the catalog, the window does not move. This is
   stated in the page copy.
5. The digest shows up to 50 items (like the feed).

## Risk and rollback

Ordinary risk: new reads + a page/route; the matching product behavior was not
changed (only the link in the switcher). Rollback — `git revert` of the A7
commit; the schema was not changed, no data rollback required.
