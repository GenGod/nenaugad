# B56-001 — Jobicy closure checks use the documented batch status endpoint

**Status: accepted by the owner, 2026-10-15.** Implemented, independently reviewed and
checked locally the same day. The owner took all four recommendations below the same day ("agree with all
four recommendations, go ahead").
Basis: [DEVX-003](DEVX-003-weekly-checks.md) found on 2026-10-05 that Jobicy's API page
changed; the owner asked on 2026-10-15 to re-read it and check the import and closure
checks against it.

## What the page says now (read 2026-10-15)

The live page (`https://jobicy.com/jobs-rss-feed`, dated "October 1, 2026"), normalized by
`normalizeTermsText`, against the committed snapshot `docs/sources/terms/jobicy-feed.txt`
("September 16, 2026"): 443 → 573 lines.

- **Fair use: unchanged** word for word; only its section number moved from 08 to 09. No
  permission in `policy/jobicy` is affected.
- **Liveness:** the HEAD check is gone from the page. In its place is a batch status
  endpoint, `GET /api/v2/remote-jobs/status?ids=…`: 1–100 numeric IDs per request,
  answers `active`, `closed` (expired, filled or past its expiry date) or `unknown` (does
  not exist, deleted, not public). It covers jobs older than the 7-day window, costs $0,
  needs no key, and should run "hourly or less often"; 429 → retry later. The page says a
  job leaving the feed can still be active, to close only on an explicit `closed`, and
  that `unknown` is not a confirmed closure.
- **Feed:** listings come only from the last 7 days, with a 3-hour delay; `count` is now a
  per-page limit (1–200, default 200), and `nextCursor`/`hasMore` continue a traversal
  (a cursor lives 24 hours; a changed filter or an expired cursor → 400). A new automated
  pass may start at most once an hour.
- **Fields:** `jobType` is now "Full-Time"; the excerpt is up to 55 words, not characters.
- **Commercial API:** paid, with a key, about $0.01 per new direct-link job. Out of scope,
  as before (the policy excludes paid direct links).

## What that means for our code

| Part | State | Evidence |
|---|---|---|
| Import (`fetchJobicyWindow`) | **Works.** One request, `count=200`, no cursor | 2026-10-15 import: 200 postings, 199 new |
| Field mapping | **Works.** `jobType` is lower-cased before the map | today's 200: 188 full-time, 12 contractor, none lost |
| Closure checks (S1-005) | **Undocumented.** `headJobicyListing` sends HEAD; 404/410 is the inactivity signal. The page no longer offers HEAD, so a closed job may now answer 200 and never close | `fetcher.ts` `headJobicyListing`; `closure-checks.ts` |
| Closure history | **Never ran on the local database:** `closure_checks` is empty, all 601 jobicy postings are `active`, 401 of them are out of the feed | queried 2026-10-15 |
| Terms fingerprint | **Stale.** `policy/jobicy` `terms_hash` matches the September snapshot; `npm run terms:check` fails | DEVX-003 |
| Coverage | **Partial when runs are rare.** Every import so far got exactly 200, the cap: the newest 200, not the whole 7 days. The worker every 6 hours covers it; a weekly manual run does not | imports 09-25, 10-08, 10-15 |

The closure state reaches users: the card's ghost marker and the A10 demotion read
`closure_checks.last_result` (`snapshots.ts` `toClosureSignal`).

## Decisions for the owner

1. **Re-baseline the Jobicy terms fingerprint** after reading the change above (fair use
   unchanged): `npm run terms:check -- --write`, the policy's `terms_hash`,
   `reviewed_at` and version 5 → 6. Source rights: owner acceptance.
2. **Replace HEAD with the batch status endpoint** for closure checks. Recommended: it is
   the documented method, and one request checks 100 jobs instead of one.
3. **How many `closed` answers close a posting.** Recommended: keep S1-005's rule of two,
   six hours apart, and its mass-closure quarantine. Jobicy says one explicit `closed`
   suffices; two costs at most six hours and guards against a bad answer.
4. **Cursor paging of the feed:** recommended as a separate task, later. With the worker
   every 6 hours the newest 200 cover the window; paging matters only for rare manual runs.

## Plan (after the decisions)

1. `fetcher.ts`: `fetchJobicyStatuses(ids)`, pinned to `https://jobicy.com/api/v2/remote-jobs/status`,
   1–100 positive integer IDs, GET, `redirect: "error"`, timeout and size limit as the
   other transports; `closed` → `inactive`, `active` → `active`, `unknown`, a missing ID, a
   malformed body, 429, 5xx or a network error → `unknown`. Never closes on doubt.
   `headJobicyListing` is removed.
2. `closure-checks.ts`: candidates in groups of 100 per request; the hourly budget counts
   requests (at most one pass an hour, as the page asks), not HEADs. The two-in-a-row
   rule, the quarantine and the `closure_checks` vocabulary stay, so the card and A10
   need no change.
3. The worker calls the new transport; `--status` unchanged.
4. Decision 1: re-baseline the terms snapshot and the policy.
5. Tests: status parsing (every answer, a missing ID, a malformed body, 429), batching at
   100, the budget, the two-in-a-row rule and the quarantine with the batch transport;
   the guardrail keeps the transport in `fetcher.ts`.

**Risk: high** (source rights: a new endpoint at a source and a policy change). Effort
`xhigh`, an independent `reviewer` pass, then owner acceptance before the worker uses it.
**Data:** public job IDs only; nothing about a candidate is sent. No spend.

**Not included:** cursor paging of the feed (decision 4); the himalayas "Current as of"
normalization (a separate source-rights decision, DEVX-003).

## Result (2026-10-15)

**Implemented, reviewed, tested locally and accepted by the owner (2026-10-15).** The
worker uses the new transport from its next start.

- **Terms (decision 1):** `npm run terms:check` gained `--source=<id>`, so one source can
  be checked or re-baselined without the other (`--write` alone would also have
  re-baselined himalayas, whose date-line decision is still open). `--write
  --source=jobicy` wrote a snapshot identical to the text reviewed above;
  `policy/jobicy` is version 6 with the new `terms_hash`, `reviewed_at` 2026-10-15 and
  the decision in `approval_reference`. `valid_until` stays 2026-12-23.
- **Transport (decision 2):** `fetchJobicyStatuses(ids)` in `fetcher.ts` (the guardrail's
  only transport module): pinned URL, 1–100 safe positive integer IDs or no request,
  literal commas, GET, `redirect: "error"`, the shared JSON fetch (content type, size,
  timeout). `closed` → `inactive`; `active` → `active`; `unknown`, a missing ID, an
  undocumented status, contradictory duplicates and malformed entries → `unknown`;
  status casing and numeric-string IDs are tolerated. 429 → `rate_limited`, other
  failures → `server_error` or `network_error`. `headJobicyListing` is removed.
- **Pass (decision 3):** `runClosureCheckPass({ pool, now, check })`: at most one pass an
  hour (any check in the last hour, read from `closure_checks`, so a restart cannot run a
  second one); up to 5 requests of 100 IDs; the two-in-a-row rule, the 6-hour spacing and
  the mass-closure quarantine are unchanged. A failed request ends the pass: its batch is
  recorded as `unknown` (streak unchanged), later batches are not sent, and the pass
  (`deferred`) closes nothing, even records whose streak reached two in an earlier batch
  of the same pass; they close at their next `closed`, never on `unknown` (review
  finding 1). The report adds `requests`.
- **Worker:** calls `fetchJobicyStatuses`; the hourly gate's `budget_exhausted` is not
  logged, since it answers every 60-second tick between passes.
- **Live smoke (one call, read-only, 2026-10-15 11:47 UTC):** 4 stored IDs (2 from
  today's feed, 2 last seen 2026-09-25) and ID 1 → HTTP 200 `application/json`, all four
  `active`, ID 1 `unknown`, parsed the same. So postings out of the feed are often still
  open, as the page says. Closure checks never ran on this database, so the old method
  closed nothing here.
- **Unchanged:** the card's ghost marker and the A10 demotion read the same
  `closure_checks` vocabulary; the feed import and its mapping.
- **The new page may move on its own:** its example response carries
  "2026-10-15T05:46:49" in a page dated October 1, the same in two fetches hours apart.
  If tomorrow's `terms:check -- --source=jobicy` shows only those two lines changed, it
  is the himalayas date-line problem again: a normalization decision for the owner.
- **Coverage ratchet** raised to 84/87/92 (lines/branches/functions; measured 84.32 /
  87.47 / 93.13 after the review fix).
- The technical spec (`docs/solo/context/01_TECHNICAL_SPEC.md`) notes the change of method.

### Independent review (2026-10-15, `reviewer`, fresh context)

1. **High, fixed:** a record whose streak had reached two in a held-back pass
   (quarantined, which existed before, or `deferred`, new here) closed on its next
   `unknown`, because closing looked at the streak and not at this pass's answer. A
   response the parser cannot read is all `unknown` with HTTP 200, which the mass guard
   does not catch, so up to 500 records could close at once. Now only a `closed` answer
   in the same pass can close. Two tests (a deferred pass, then `unknown`; two
   quarantined passes, then all `unknown`, then one `closed`) fail without the fix and
   pass with it.
2. **Low, left:** the hourly gate is written after the request returns; a worker killed
   during a request, or a first database write that throws after it, leaves no row, and
   a restart sends again at once. The worker is started by hand.
3. **Low, left (before this task):** the shared JSON fetch clears its timeout once the
   headers arrive, so a slowly sent body has no deadline. It affects every source; a
   separate fix.
4. **Low, read:** the reviewer read "must not exceed once per hour" as Fair Use; it is the
   last line of the RSS section (snapshot line 415), and the reviewer withdrew that part. The status section asks for status
   synchronization "hourly or less often", with IDs batched in groups of 100, which the
   pass does; the feed import keeps its 6-hour interval. `Retry-After` is not read; a
   429 waits for the next hourly pass anyway.
5. **Low, by design:** the worker uses the endpoint by default; the owner accepted it the
   same day.
6. **Low, fixed:** a stale "HEAD" comment in `src/domain/ev-multipliers.ts`. The comment
   in `migrations/0006_closure_checks.sql` still describes HEAD; a migration is not
   edited after it ran. `next-env.d.ts`, rewritten by the build, was restored.

### Changed files

`scripts/terms-check.ts`; `docs/sources/terms/jobicy-feed.txt`,
`docs/sources/terms/snapshots.json`; `src/server/source-policies.ts`;
`src/server/import/fetcher.ts`; `src/server/import/closure-checks.ts`;
`scripts/worker.ts`; `src/domain/ev-multipliers.ts` (comment); `tests/unit/closure.test.ts`; `tests/integration/closure.test.ts`,
`digest.test.ts`, `ev-signal.test.ts`; `package.json` (thresholds); the spec note; this
file, `tasks/current.json`, `docs/OPEN_GAPS.md`, `IMPLEMENTATION_STATUS.md`.

### Checks

After the review fix: `npm run check` (unit 353/353, guardrails, lint, typecheck) and
`npm run test:coverage` (unit and DB 475/475, the new ratchet) exit 0; the closure DB
tests 7/7, and the two review tests fail without the fix. Before it: `npm run test:db`
121/121 and `npm run build` exit 0. Not run: `test:e2e` (no page changed). One read-only
live call to the status endpoint; no other call to a source. No spend; coding-host spend
unknown.

**Rollback:** `git revert`; the policy and the terms snapshot return with it. The local
`closure_checks` table is empty, so there is no stored state to undo.
