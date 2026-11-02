# DS-002b — Signal slice 2: the condition strip and the time-zone strip on feed cards

**Status: in progress 2026-11-02.** Owner request: "Start DS-002b" after slice 1
([DS-002](DS-002-signal-design-language.md), committed `aa8d5a9` on
`feature/ds-002-signal`). Owner approved starting the local compose database the same day.

## Result and boundaries

**User-facing result:** each card in «Для вас» (`/matched`, both tabs) shows
- a five-cell **condition strip** in a fixed order: страна · часы · договор · оплата ·
  навыки, each cell in the Signal status grammar (pass ✓ solid; unknown ? hatch + dashed;
  fail ✕ notched; not applicable —), with its word for screen readers. It is an index, not
  a meter: no counts, no "4/5", nothing fills up.
- a **time-zone strip** when the job publishes accepted UTC offsets: a −12…+14 hour axis
  with the accepted zones filled and the candidate's zone marked, plus a text line.

**Honesty rules.** The strip shows the rules engine's own outcomes (`JobEvaluation.rules`),
nothing recomputed. Per-option rules (GEO-01, CONTRACT-01, TIME-01) come from the job's
**best hiring option** (pass > unknown > fail, first in order on a tie), the same option
that decides the job's status, so the strip never shows a pass the status contradicts.
Job-level: SAL-01 → оплата, SKILL-01 → навыки. ROLE-01 (relevance) and REMOTE-01 (a gate)
are not conditions and stay out.

**Deviation from the Signal mockups (recorded in NENAUGAD_SIGNAL.md):** the mockups show
an hours *overlap* ("6 ч"). The imported data has no team working hours — Himalayas
gives accepted UTC offsets, Jobicy gives none — and TIME-01 checks the zone, not hours.
Drawing hours would invent data, so the list shows accepted zones instead; the overlap
ribbon waits for real hours in the data.

**Not included:** the open catalog (`/jobs`) — it is not evaluated against a profile, so a
strip there would only say "not evaluated"; the job detail label and ribbon (DS-002c);
home (DS-002d).

**Risk:** low. Read-only projection of existing evaluation data into the page; no change to
rules, ranking, statuses, storage or API.

## Plan
1. `src/domain/condition-strip.ts`: pure `conditionStrip(evaluation)` and
   `bestHiringOptionId(evaluation)`; unit tests first.
2. `src/domain/matching.ts`: export `timezoneOffsetMinutes` (no behaviour change).
3. `MatchedJob.zones`: accepted offsets of the best option, or null (matching-service).
4. Components `ConditionStrip`, `ZoneStrip`; CSS in globals with tokens only.
5. Wire into `MatchedCard`; regenerate the authed visual baselines. (No e2e assertion on
   the strip: e2e `/matched` runs on the fixture backend, which is honestly empty.)

## Changes

- `src/domain/condition-strip.ts` (new): `bestHiringOptionId`, `conditionStrip`,
  `zoneFactOf`, `zoneStrip`, `candidateOffsets`, `formatUtcOffset`. Pure; offsets sampled
  like TIME-01 (15th of each month, 2026); runs of 3+ whole hours read as a range.
- `src/domain/matching.ts`: `timezoneOffsetMinutes` exported (no behaviour change).
- `src/server/matching-service.ts`: `MatchedJob.zones` (the best option's accepted offsets).
- `src/components/condition-strip.tsx` (new): `ConditionStrip` (an `<ol>`; each cell has an
  icon from the sprite and a screen-reader word; the rule's explanation as `title`) and
  `ZoneStrip` (the axis is decorative; the text line carries the facts).
- `src/app/matched/page.tsx`: both strips on every feed card; the candidate's offsets are
  computed once per page from the profile time zone.
- `src/app/globals.css`: `.signal-*`, `.zone-*` with tokens only.
- `docs/solo/context/NENAUGAD_SIGNAL.md` §6: the feed-card components and the deviation.

## Tests

- `tests/unit/condition-strip.test.ts` (new, 12 tests, written first): order and labels;
  relevance/gate rules excluded; cells never mixed across options; best-option ranking and
  ties; eligible jobs never show an option fail/unknown; no option → unknown with a reason;
  zone axis, half hours, ranges, an unknown candidate zone; candidate offsets for Berlin,
  Tbilisi, London and an invalid zone; the zone fact from a real Himalayas fixture.
- Components are not unit-rendered (the unit runner strips types but has no JSX
  transform); they were checked on the dev server against the local database with the
  e2e-style test account `visual-review@example.invalid` and a test profile (DE,
  Europe/Berlin): 50 strips and 46 zone strips on «Условия совпадают», both tabs at 1440
  and 390 px. The e2e `/matched` runs on the fixture backend, which is honestly empty, so
  the visual baselines do not show the strip.

## Repair log

**Cycle 1:** "With the database up a warmed page never reaches networkidle, so the visual
warm-up hangs past 180 s; waiting only for the load event keeps it within budget and all
36 visual tests pass on a repeat run." Evidence: the warm-up added in DS-002 timed out at
180 s once the database was running. Change: `waitUntil: "load"`. Result: 36/36 on two
repeat runs — confirmed.

## Checks (2026-11-02)

| Command | Result |
|---|---|
| `npm run check` | exit 0: unit 377/377, lint, typecheck, guardrails, tokens |
| `npm run test:db` | 122/122 (compose database up, owner-approved) |
| `npm run test:coverage` | exit 0, 499/499; 84.60 / 88.02 / 93.25 (was 84.43 / 87.80 / 93.11); ratchet raised 84/87/92 → 84/88/93; `condition-strip.ts` 100% lines |
| `npm run build` | exit 0 on the second start (the first stops on Next's upgrade notice) |
| e2e visual | authed baselines regenerated (closes DS-002's open item); 36/36 on two repeat runs |
| `npm run test:e2e` | 114 passed, 9 failed: all desktop and first in the run (7 account, 2 catalog). Call logs show the page reloading during the dev server's cold start ("navigated to /login" three times, the submit button still disabled). Same pattern as the A/B on the pre-DS-002 code in DS-002; the same tests pass at 390 and 320 px. Not caused by this slice (no login code changed) |

Open: the pre-existing desktop cold-start reloads (a global warm-up or the Next.js upgrade,
both owner decisions); the hours overlap waits for team hours in the imported data.
