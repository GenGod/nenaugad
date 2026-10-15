# PERF-001 — /matched on a catalog 2.6 times larger

**Status: measured 2026-10-15.** The owner asked to start it ("start the /matched
measurement"). Basis: [B41-001](B41-001-matched-page-latency.md) measured `/matched` on
1,398 postings (4.0 s cold, 1.5 s repeat); on 2026-10-15 the owner's imports grew the
local catalog to 3,582 active postings (2,981 himalayas, 601 jobicy), and B57-001 lets
each Jobicy run add up to 2,000 more.

**Goal.** Measure, the way B41 did, whether `/matched` is still answered in seconds; if
not, find where the time goes. A measurement: nothing in `src/` changes here; a fix,
if one is needed, is its own task.

## Method (B41's)

- `matchedForUser` for the owner's profile on the local catalog, read-only, with a no-op
  shadow callback: one cold call in a fresh process, then repeat calls in the same
  process. Three fresh processes for the cold number.
- Recorded: the times, the counts (eligible, needs review, not evaluated), and, if the
  time grew, a CPU profile of the cold call.
- Printed: counts and timings only; nothing from the profile or the postings.

**Risk: low** (read-only, local). **Data:** the owner's private profile, read inside the
local contour; nothing is printed or sent. No provider call, no spend.

## Result (2026-10-15)

**No regression today.** 3,582 active postings, the owner's profile, `matchedForUser` with
a no-op shadow, three fresh processes:

| | B41 (1,398 postings) | now (3,582) |
|---|---|---|
| cold call | 4.0 s | 3.93 / 3.97 / 3.84 s |
| repeat call | 1.5 s | 1.21–1.32 s |
| eligible / needs review / not evaluated | 0 / 1,349 / — | 0 / 3,367 / 47 |
| process memory after the call | — | 371 MB |

The page renders at most 50 cards (`page.tsx`), so the list's length does not reach the
HTML; the function's time is the page's time. The browser was not measured: it needs the
owner's session.

**The skill cache is 59 % full.** After one cold call the `extractSkills` memo (B41,
`MEMO_CHAR_BUDGET` 48M characters, oldest out first) holds 90,022 texts and 28.1M
characters (measured in a scratch process by observing `Map.prototype.set`; nothing in the
code changed). That is about 7,800 characters per posting, so the budget holds about
6,100 postings of today's text size. Past that, a feed request scans the catalog in the
same order every time, the oldest-first cache keeps evicting what the next request needs
first, and repeat calls fall back to the cold cost.

**How fast the catalog can grow.** The worker imports himalayas once a day, 25 pages of
20 (`DEFAULT_MAX_PAGES_PER_RUN`), moving deeper into a feed of about 100,000 jobs, so
nearly every run adds about 500 postings; retention tombstones them 30 days after they
were last seen. With the worker running daily, the catalog would pass 6,100 postings in
about five days and settle near 15,000 himalayas postings, plus Jobicy's whole 7-day
window now that B57-001 reads it. At today's cost per posting (about 1.1 ms cold), 15,000
postings would mean about 16 s per `/matched` request, cold and repeat alike. That is an
extrapolation, not a measurement: between B41 and now the cost per posting fell
(4.0 s for 1,398 then, 3.9 s for 3,582 now), so the scaling is not proven linear.

**Not investigated, noted:** the owner's profile has 0 eligible postings and 3,367 that
need review, the same shape B41 recorded (0 and 1,349). Nothing reaches the main tab.

## Conclusion

Fine today; a fix is needed before the catalog passes about 6,000 postings. Two ways,
each its own task:
1. **Store the extracted skills with the posting at import time** (B41's second option):
   the feed reads them instead of scanning text per request; the cost moves to the import
   and is paid once per posting version.
2. **Limit what the feed evaluates,** e.g. postings seen in the last N days, or a cap
   per source; this changes what the candidate sees, so it is a product decision.

Option 1 changes no result and is the natural next step. Separately, the 0-eligible
profile deserves a look: either the rules or the profile leave nothing in the main tab.

## Checks

Read-only measurement; no file in `src/` changed. Not run: `npm run check` (no code
changed). No provider call; no spend; coding-host spend unknown.
