# S1-005 — Jobicy closure HEAD checks

**Result:** the worker periodically checks the canonical Jobicy listings with the
HEAD method: 404/410 in two consecutive checks → lifecycle `closed` (with
provenance); any other outcomes (429/5xx/network/redirect) never close a
record. Closed records disappear from the catalog/matching, but remain in
«Сохранённом» with a mark.

**Not included:** HEAD checks for Himalayas (it has a full feed with its own
lifecycle policy), deletion of closed records (retention is being worked out),
notifications.

**Context:** spec 5.2 (Jobicy: HEAD of the card, 404/410 — an inactivity signal,
other errors do not mean closure; «checking availability once or twice per
hour is generally sufficient»), 14.3 (closure only by an explicit signal;
API errors ≠ closed), 17 (a breaking change must not close in bulk);
a live smoke of the listings URL scheme 2026-09-25.

## Acceptance
1. `headJobicyListing` in the allowlisted fetcher: pinned jobicy.com, HEAD,
   `redirect:"error"`, a timeout; 200→active, 404/410→inactive, other→unknown.
2. Budget: ≤25 HEAD/hour (rolling, persisted in the DB — a restart does not
   reset it); a per-record interval ≥6 h; records recently seen in the window
   are not checked.
3. Closure: 2 consecutive inactive (with an interval ≥6h) → `lifecycle='closed'`
   (jsonb_set, provenance and dates are not rewritten); active resets the
   counter; unknown changes nothing.
4. Mass-closure guard: if >50% are inactive in a run (with ≥4 checks) —
   closures are NOT applied, the log gets `closure_quarantine`
   (a breaking-change suspicion), the check results are recorded.
5. The worker performs a check pass after the import cycle (for the enabled
   jobicy); `--status` shows check statistics; repeated passes are idempotent.
6. «Сохранённое»: closed records are visible with a «Закрыта» badge; the
   catalog/matching exclude them automatically (the existing gates).
7. Tests: unit (classification, counters, the guard), integration (the SQL flow
   on the test DB with a fake HEAD transport: closure after 2 inactive, an
   active reset, unknown neutrality, the budget, quarantine).

**Risk:** ordinary (no rights change — fetch is already allowed; HEAD of
listings is covered by the «normal integrations» of the Jobicy docs).
**Rollback:** the worker flag `--no-closure`; records are not reopened
automatically (only a repeated import of the window returns active through
versioning).
