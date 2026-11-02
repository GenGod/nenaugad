# B64-001 — required travel is detected, and the candidate's profile decides

**Status: implemented, re-mapped and tested locally 2026-11-02; not committed.** The owner asked for "a rule that catches required
travel" after the S1-006 activation check found about 13 of the 102 Remote First Jobs
catalog postings requiring travel (two up to 50%), and no source detecting it.

## Problem

Spec §10.1 asks to store mandatory travel with its exact quote; §10.2 says known
mandatory travel "is excluded under the `zero_mandatory_attendance` policy" — a
candidate's setting (the profile asks about willingness for mandatory travel), and an
optional offsite does not turn remote into hybrid. Today:

- no adapter detects travel: `workplace.mandatory_travel` is always `not_stated`;
- REMOTE-01 (the rule that applies the zero-attendance setting) reads only
  `mandatory_onsite`;
- `classifySnapshot` would drop a posting with required travel from the catalog and the
  feed for everyone, which is not what §10.2 says.

## Owner decisions (2026-11-02)

1. **The profile decides** (spec §10.2): a posting with required travel stays in the
   catalog with a note quoting the text; REMOTE-01 fails it for a candidate with "no
   mandatory attendance" (the default) and leaves it alone for one who accepts travel;
   "travel may be required" is unknown, not required.
2. **All three sources** share one detector, and the stored postings are re-mapped.

## Acceptance (fixed before the code)

1. A shared detector (`src/server/import/travel-text.ts`) reads a posting's title and
   text and answers `required`, `unknown`, `explicitly_not_required` or `not_stated`,
   with the quote:
   - required: a share of travel ("up to 25% travel", "travel approximately 25%",
     "comfortable traveling up to 20%"), "travel (is) required", "required/expected to
     travel", "must (be able/willing to) travel", travel to client or customer sites or
     to a named office/facility, and a "/Travel" label in the title;
   - unknown: "travel may be required", "may require (occasional) travel";
   - explicitly not required: "no travel (is) required", "no mandatory travel", "travel
     is not required";
   - not travel: perks and insurance ("travel stipend", "travel insurance"), people
     ("travelers"), the product or industry ("passengers travel", "travel industry"), and
     an offsite or retreat (spec: optional offsites are not mandatory travel).
   Errors toward `not_stated` are preferred to inventing a requirement.
2. All three mappers store the detector's answer in `workplace.mandatory_travel` and a
   `ev:<id>:travel` evidence item with the quote (listed in `workplace.evidence_ids`).
3. `classifySnapshot` no longer excludes a posting for required travel; mandatory
   on-site still excludes it.
4. REMOTE-01 (`RULESET_VERSION` 6), with "no mandatory attendance": required travel →
   `fail` (`MANDATORY_TRAVEL`, the quote in the explanation); unknown travel → `unknown`
   (`MANDATORY_TRAVEL_UNCLEAR`); on-site unchanged. Without the setting → `not_applicable`
   as today. The profile checkbox says that it covers travel.
5. The catalog card shows "Обязательные поездки" or "Поездки возможны" with the quote.
6. The stored postings of all three sources take the detector, with REMAP-001's guards:
   dry run first, `--apply --expect=<n>`, a backup without posting text, an exact
   rollback proven on the real rows, a re-import of the same records reads `seen`, and
   nothing outside the workplace travel field and its evidence changes.
7. Measured per source on the stored postings, and the `required` set read by hand for
   false positives.

## Plan

1. `travel-text.ts` + unit tests (a table of phrasings, both directions).
2. The three mappers; `classifySnapshot`; REMOTE-01 and `RULESET_VERSION`; the card and
   its projection; the checkbox label.
3. A one-off re-map in the gitignored `backups/remap-2026-11-02/` (REMAP-001's pattern).
4. Checks, the re-map with its rollback proof, the measurement.

**Risk: normal** (matching semantics and catalog visibility; no auth, money or rights).
Effort `high`. **Rollback:** revert the commit and run the re-map's `rollback.mjs`.
**Data:** stored public postings; no personal data; nothing leaves the machine.

**Not included:** optional offsites (`optional_offsites` stays `null`), a travel share
threshold in the profile, mandatory-attendance rules for other kinds of presence.

## Result (2026-11-02)

**Implemented, re-mapped on the local database and tested locally; not committed.** No
repair cycle used. Not independently reviewed (risk normal).

- `travel-text.ts`: `readTravel(title, text)` and `withTravel`. Possibilities ("travel may
  be required", "travel of up to 10% may be required") and negations are taken out of the
  text before the requirement patterns run, and so are travel as a topic ("travel industry
  experience (required)", "travel stipend") and statements about other roles ("roles that
  require travel"). A "/Travel" title label counts; "Travel Nurse" does not. Unicode
  hyphens fold as in the remote rule.
- The three mappers pass the stored title and the description text (not the excerpt, so a
  re-map rebuilds the same answer) and append a `ev:<id>:travel` item only when something
  is stated: a silent posting maps byte-identically to before.
- `classifySnapshot` keeps required travel in the catalog; on-site still excludes.
- REMOTE-01 (ruleset 6): required → `fail` `MANDATORY_TRAVEL` with the quote; possible →
  `unknown` `MANDATORY_TRAVEL_UNCLEAR`. A job-level fail moves an eligible job to
  needs-review and a job-level unknown leaves the status alone: the existing aggregation,
  shared with on-site, salary and skills, unchanged here.
- The catalog card shows "Обязательные поездки: «…»" or "Поездки возможны: «…»" in its
  facts row (checked on the running dev server; no horizontal scroll at 375 px, where the
  facts row is hidden as before).
- **Not done (acceptance 4, the checkbox wording):** the label "Исключать обязательное
  физическое присутствие" was not changed. It is in 9 visual baselines, and the e2e
  server cannot start while another session's `next dev` holds this folder, so they could
  not be re-recorded. The rule's explanation says "обязательные поездки". A small
  follow-up: change the label and re-record the profile baselines.

**Measured** (4,080 stored rows; the detector over every active posting):

| Source | required | possible | not required |
|---|---|---|---|
| himalayas | 208 | 32 | 5 |
| jobicy | 84 | 7 | 1 |
| remote_first_jobs | 82 | 15 | 0 |

For a candidate with "no mandatory attendance", REMOTE-01 moves pass → fail on 358 postings
and pass → unknown on 51 (the rest already failed on on-site presence). Read by hand: the
largest groups in context ("willingness / ability to travel" ×98, "travel up to N%" ×48:
all stated requirements); three misreadings found and fixed before the re-map
(possibilities with words between "travel" and "may be required"; "roles that require
travel" in a benefits clause; "travel industry experience"). On the 102 Remote First
Jobs catalog postings the detector marks exactly the 12 distinct postings found by hand
(14 rows; two are listed twice) as required and the nurse practitioner's "travel may be
required" as possible. The matching golden set is unchanged (NDCG@10 0.892).

**Re-map** (one-off scripts in the gitignored `backups/remap-2026-11-02/`, REMAP-001's
pattern): dry run, then `--apply --expect=434`: 434 changed, 3,646 rows byte-identical,
re-import `seen`; the rollback restored all 434 and the table matched its recorded start
state; applied again with the same result. Gates: nothing outside the travel field and its
evidence changes, no classification moves, the backup holds no posting text.

**Checks:** `npm run check:agent` exit 0 (408 unit tests); `npm run test:coverage` exit 0
(532 unit and DB tests; 85.43 / 88.82 / 93.77); `npm run eval:matching` exit 0. Not run:
`npm run test:e2e`, `npm run build` (the other session's dev server holds the folder).
