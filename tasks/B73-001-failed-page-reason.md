# B73-001 — a RemoteJobs.org import says why a page failed

**Status: implemented and tested locally 2026-11-09; not committed, not accepted.** Found by [S1-007](S1-007-remotejobs-org-source.md) on
the first live RemoteJobs.org run (its "Next" item 2); the owner asked to start it
("implement B73").

## Problem

The first live run read 7 pages and ended `traversal: "interrupted"`: page 8 (offset 350)
failed, and neither the printed report nor the worker's log says why. A manual request of
the same page a minute later answered 200 in 0.5 s with a valid envelope, so the cause is
unknown: network, an HTTP status, the content type, the size cap, the JSON or one of the
envelope checks. Today:

- `pinnedJsonBody` (`src/server/import/fetcher.ts`) turns each of those into a bare
  `server_error` or `network_error`, and `fetchRemoteJobsOrgPage` adds the envelope checks
  as one more bare `server_error`;
- `runRemoteJobsOrgImport` drops even that: a failed first page returns `retry_scheduled`
  (with a wait only for a 429), a failed later page sets `traversal: "interrupted"`;
- the worker logs `result`, `traversal` and `nextEligibleAt`, nothing about the page.

Found while reading the same path: `response.text()` sits outside any `try`. A
connection lost while the body is read throws through the fetcher and the adapter, so the
run ends as an exception (`IMPORT_FAILED` / `IMPORT_ERROR`) and **the pages already read
are not stored**, against the adapter's rule that a failed later page keeps what was read.
Such a failure could not be recorded as a page's reason without catching it.

## Result and boundaries

**User result:** the owner reads, in the import's printed report and in the worker's log
line, which RemoteJobs.org page failed and why: its offset, the outcome class, a fixed
reason code, the HTTP status when a response arrived, and the runtime's error code for a
failed connection.

**Not included:**
- the Himalayas, Jobicy and Remote First Jobs reports: their fetcher results keep the bare
  status (the shared `pinnedJsonFetch` drops the reason), so their reports and tests are
  unchanged apart from the body-read fix below;
- storing the failure in `import_state` or showing it in `--status` (no migration);
- retrying a failed page within a run, or any change to the walk, the cap or the wait;
- the 15 s deadline: it covers the request up to the response headers only (the timer is
  cleared before the body is read; Node's own body timeout, 300 s, bounds the rest). Noted,
  not changed.

**Risk: normal** (an import contract's diagnostics and one failure path; no new request,
no rights, policy or schema change). Effort `high`. **Data:** synthetic fixtures and a
stubbed `fetch`; no live request. **Spend:** none.

## Acceptance (fixed before the code)

1. `fetchRemoteJobsOrgPage` names each failure: `invalid_request` (refused before
   sending), `timeout`, `network` (with the runtime's code when it gives a clean one, e.g.
   `ECONNRESET`), `body_read`, `http_status`, `content_type`, `too_large`, `invalid_json`,
   and one code per envelope check (`envelope_data`, `envelope_pagination`,
   `envelope_offset`, `envelope_version`); the HTTP status is kept whenever a response
   arrived. Nothing else from the response (no header value, no body) is kept.
2. The import report carries `failedPage`: `null` when no page failed; otherwise the
   page's offset, status and the fetcher's reason, for a failed first page
   (`retry_scheduled`) and a failed later page (`interrupted`) alike; a 429 is recorded as
   `rate_limited` with its offset (its wait stays in `nextEligibleAt`).
3. Through the real fetcher with a stubbed `fetch`: a page-2 envelope with another offset
   ends the walk `interrupted` with `failedPage` `{ offset: 50, status: "server_error",
   reason: "envelope_offset", httpStatus: 200 }`; a page-2 body that fails mid-read no
   longer throws: page 1 is stored and `failedPage.reason` is `body_read` (both fail before
   the fix).
4. The worker's import log line carries `failedPage` for RemoteJobs.org; the printed CLI
   report carries it as part of the report.
5. The other three sources' fetchers answer exactly as before for every failure
   (`{ status: "server_error" }` / `{ status: "network_error" }`), except that a body that
   fails mid-read is now `network_error` instead of an exception.

## Plan

1. Tests first in `tests/unit/remotejobs-org.test.ts` (fetcher reasons, the report's
   `failedPage`, the two end-to-end cases), seen failing.
2. `fetcher.ts`: `pinnedJsonBody` returns the reason, the HTTP status and a validated error
   code (`/^[A-Z][A-Z0-9_]{1,63}$/u`, the cause's code first) and catches a failed body
   read; `pinnedJsonFetch` strips the detail for the other sources; `fetchRemoteJobsOrgPage`
   names its envelope checks. Types: `RemoteJobsOrgPageResult` failures carry the reason.
3. `remotejobs-org-adapter.ts`: `failedPage` on every report, picked field by field.
4. `scripts/worker.ts`: log `failedPage` when the report has it.
5. Records: this file, `tasks/current.json`, `docs/OPEN_GAPS.md` (B73),
   `IMPLEMENTATION_STATUS.md`.

**Checks:** `npm run check:agent` while iterating, `npm run check` and
`npm run test:coverage` before the report. Not planned: `build`, `test:e2e` (no page
changes), a live run (the worker's next run will show the field).

**Rollback:** `git revert`; nothing stored changes shape.

## Result (2026-11-09)

- **Fetcher** (`src/server/import/fetcher.ts`): `pinnedJsonBody` returns a reason with
  every failure and the HTTP status once a response arrived. `timeout` is told from
  `network` by the request's own abort signal. The runtime's code is taken from the
  error's cause first, then the error, and kept only when it matches
  `/^[A-Z][A-Z0-9_]{1,63}$/u`. A failed body read is caught as `body_read`. The shared
  `pinnedJsonFetch` returns the bare status, so the other three sources answer as before.
  `fetchRemoteJobsOrgPage` returns `invalid_request` for a refused offset, and each
  envelope check has its own code, named by the first check that fails (data, pagination,
  offset, version). The checks themselves are unchanged.
- **Adapter** (`remotejobs-org-adapter.ts`): `failedPage` on every report: `null` on a
  clean run or a refusal, `{ offset, status, reason, httpStatus?, errorCode? }` for a
  failed first or later page, `{ offset, status: "rate_limited" }` for a 429. It copies
  only those fields.
- **Worker** (`scripts/worker.ts`): the import log line carries `failedPage` when the
  report has one. The CLI prints the whole report, so it carries it too.
- **Checked on real undici** (a loopback server in the scratchpad, no external request): a
  socket closed mid-body rejects `text()` with `TypeError: terminated` and cause code
  `UND_ERR_SOCKET`; a refused connection has cause code `ECONNREFUSED`; an unknown host has
  `ENOTFOUND`; an abort rejects with `AbortError`. These are the shapes the tests stub. A
  port on fetch's blocked list gives no code, so it is reported as `network` with none.

Acceptance 1–5: met by the tests below. Item 4's worker line is checked by typecheck and
by reading, not by a test: the worker has no unit test, and a run would make live requests.

### Tests (written first; 6 failed before the fix)

`tests/unit/remotejobs-org.test.ts`:
- the fetcher names every failure, with its HTTP status: invalid offsets, the four
  envelope checks across 10 bodies, content type, 404/500/503, invalid JSON, over 8 MB,
  a refused redirect, ECONNRESET on the cause, ENOTFOUND on the error, six unclean codes
  dropped, a body failing mid-read, a timeout;
- the other three fetchers answer `{ status: "server_error" }` /
  `{ status: "network_error" }` exactly. A failed body read now returns
  `network_error`; before the fix it threw `TypeError: terminated`;
- the report's `failedPage` for a failed first page (502, timeout), a failed later page
  (envelope version), a 429 on the first and a later page, `null` on a clean run, and a
  failure object with an extra `body` field, which is not copied;
- through the real fetcher with a stubbed `fetch`: page 2 with another offset ends
  `interrupted` with `envelope_offset`. Page 2's body failing mid-read keeps page 1's 50
  postings and records `body_read` with `UND_ERR_SOCKET`; before the fix the run threw
  and stored nothing.

### Checks

| Command | Result |
|---|---|
| `npm run check:agent` before any change | exit 0 (unit 492/492) |
| the new tests before the fix | 6 of 24 failed, as intended |
| `npm run check` | exit 0 (unit 494/494, guardrails, lint, typecheck) |
| `npm run test:coverage` | exit 1 without `PG_TOOLS_CONTAINER`: the 12 backup-restore tests failed with `PG_TOOL_NOT_FOUND` (no `pg_dump` on PATH, as in S1-007 and B69-001) |
| `PG_TOOLS_CONTAINER=nenaugad-db-1 npm run test:coverage` | exit 0 (652/652; 88.53 / 90.09 / 95.27; `fetcher.ts` 100 % lines, `remotejobs-org-adapter.ts` 100 %) |

Not run: `build` and `test:e2e` (no page changed), a live import. The worker's next
RemoteJobs.org run will show the field, and only a page that fails fills it. No live call,
no spend; coding-host spend unknown. The ratchet is unchanged: no metric crossed a new whole
percent.

### Changed files

`src/server/import/fetcher.ts`, `src/server/import/remotejobs-org-adapter.ts`,
`scripts/worker.ts`; `tests/unit/remotejobs-org.test.ts`; this file, `tasks/current.json`,
`docs/OPEN_GAPS.md` (B73), `IMPLEMENTATION_STATUS.md`.

### Still open

- The Himalayas, Jobicy and Remote First Jobs reports do not name a failure's reason. A
  Jobicy walk also ends `interrupted`. Extending them means dropping the strip in
  `pinnedJsonFetch` and adding the field to their reports.
- The 15 s deadline covers the request only up to the response headers. Node's own body
  timeout (300 s) bounds the body read.
- The cause of the 2026-11-07 page-8 failure is still unknown; the field records it the
  next time a page fails.

**Next small task:** B72 (perks boilerplate should not exclude; shared with Remote First
Jobs), as S1-007 ordered.
