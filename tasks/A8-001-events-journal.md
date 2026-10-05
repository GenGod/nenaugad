# A8-001 — the interaction journal and propensities

**Result:** an impressions and clicks journal with honest propensities appeared:
migration 0014 `job_events`, ownership-scoped writing through the session, the
`POST /api/v1/events` API, deletion of the journal together with the profile.
Impressions and clicks are facts for which no other table exists; the state
(saved/hidden/response) stays in its own tables so that every fact has one
source of truth.

**Out of scope:** client-side sending of impressions/clicks from the UI (a client
component and a decision on the sending moments are needed — the next small task),
reading the journal in the UI (deliberately absent), off-policy evaluation (D7).

**Context:** [the brief](../docs/design/2026-09-27-matching-implementation-brief.md)
(item A8); [the research](../docs/research/2026-09-26-job-matching-research.md)
part 1 ("Feedback loop"), part 2 D6 («логировать propensities с первого дня»
["log propensities from day one"]).

## What was added

- `migrations/0014_job_events.sql` — the `job_events` table (user FK cascade,
  snapshot FK cascade, `event_type IN ('impression','click')`, position ≥ 0,
  `propensity numeric(6,5)` with CHECK 0..1, `ranker_version`), the indexes
  (user_id, created_at DESC) and (snapshot_id), comments on the table and columns.
- `src/domain/events.ts` — strict batch parsing: fixed types, ids in the
  source namespace (`himalayas:`/`jobicy:`), the bounds (≤50 events, no
  duplicates), `normalisePropensity` (a relative score, clamped; null on
  absence/a zero maximum — the probability is not invented), `parseRankerVersion`.
- `src/server/events-service.ts` — `recordImpressions`, `recordClicks`,
  `countEventsForUser`, `deleteEventsForUser`. All inserts are one
  parameterized `INSERT ... SELECT ... FROM unnest(...)`: there is no
  string SQL in the file at all.
- `src/app/api/v1/events/route.ts` — `POST` (session → 401; parsing → 400; an FK to
  a vanished snapshot → 404; otherwise 201). `GET` is deliberately absent.
- `src/server/profile-service.ts` — `deleteAllProfiles` now deletes the journal too
  (a profile leaves no behavioral trace).
- Tests: `tests/unit/events.test.ts` (4 tests), `tests/integration/events.test.ts`
  (4 tests on the live DB).

## V0–V6 protocol

- **V0.** A separate task; migration 0014 is the only schema change.
- **V1.** Item A8 was re-read; confirmed from the research: propensity must
  be logged from day one, it cannot be restored after the fact — hence
  the column appears now, even while the ranker is not yet wired into the product path.
- **V2.** Principles: events belong to the user and are written only from the session
  (test: A does not see/write B); profile deletion deletes the journal (test);
  `propensity` = NULL while there is no ranker — no invented probabilities (a test
  on null in storage and on `normalisePropensity`); no free text in the schema;
  no reads in the UI.
- **V3.** `npm run check` → exit 0 (163/163 unit, biome, tsc); **`npm run test:db`
  → exit 0 (all the integration tests, including the 4 new A8 ones — on the live
  test DB)**; `npm run build` → exit 0 (the `/api/v1/events` route built).
  `test:e2e` — `not_run`: the UI was not changed.
- **V4.** Cases: ownership isolation, deletion with the profile, rejection on
  a nonexistent snapshot (FK 23503, not a silent write), null-propensity.
- **V5.** Existing tests not weakened, all passed; the thresholds were not moved.
- **V6.** This file + the entry in `IMPLEMENTATION_STATUS.md`.

## Repair cycle: 1/2

1. The Mimosa write gate blocked the first version of `events-service.ts`: building
   SQL text from placeholders (`rows.join(", ")`). Hypothesis: the same intent
   is expressed by a single parameterized `INSERT ... FROM unnest($1::text[], ...)`
   with no string SQL at all — that is, the edit is not a "workaround" but a safer
   form. Confirmed: the file passed the gate, the live-DB tests are green.

## Limitations

1. Client-side sending of impressions/clicks is not wired: the API and the service
   are ready and tested, but the product does not call them yet (the next small
   task; a client component and a decision on the sending moments are needed).
2. `propensity` in the product will be NULL until A10 — this is stated in the
   column comment so that nobody reads NULL as "probability 0".
3. Journal retention is not bounded by a policy (unlike the snapshots): for user
   events the retention period is an owner decision, recorded in the brief
   (the «Решения владельца» ["Owner decisions"] section, item 8).

## Risk and rollback

Ordinary risk: a new table + a new route; product behavior was not changed.
Rollback — `git revert` of the A8 commit (the migration is additive; no schema
rollback is required, the table simply stops being used).
