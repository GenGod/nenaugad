# DS-002c — Signal slice 3: the job detail as a ruled condition label

**Status: implemented and tested locally 2026-11-02; owner acceptance pending.** Owner request: "Start DS-002c" after
[DS-002b](DS-002b-signal-strip.md) (`fdc0bb1` on `feature/ds-002-signal`).

## Result and boundaries

**User-facing result:** `/jobs/[id]` (the four synthetic catalog jobs; real Himalayas and
Jobicy jobs link out to their source and have no detail page) renders its condition map as
a Signal **label**: a ruled white panel with the display title, a mono source line, a 4px
rule, the five rows, and a footer stating it is a check against the posting's text, not a
guarantee of hire or legal eligibility. The remote-format Ground reads as a **receipt**
(the quote, then its provenance in an outlined mono stamp). Absences are drawn:
- unpublished hours get an **empty ribbon** (a hatched, dashed bar: no invented hours);
- unknown hiring countries get an **empty receipt** (a hatched band and what to ask).
The source-and-freshness card becomes a petrol band.

**Semantics unchanged.** Each row keeps its status and icon exactly (e2e pins five rows,
no review marker on `fern-frontend`, a review marker and badge on `orbit-product`'s
countries). The heading stays «Карта условий» — the established product term (Atlas §11),
also pinned by the catalog e2e — rather than the mockups' «Условия вакансии».

**Not included:** a detail page for real snapshots (product scope, not design); the hours
overlap ribbon (no team hours in the data, see DS-002b); home (DS-002d).

**Risk:** low: markup and CSS of one page; no data, rules or API change.

## Plan
1. Markup in `src/app/jobs/[id]/page.tsx` (classes kept; label wrapper, footer, empty
   ribbon, empty receipt, receipt and inverse classes).
2. CSS in `globals.css` with tokens only.
3. Visual baselines for the two detail routes (×3 viewports); e2e unchanged.

## Changes

- `src/app/jobs/[id]/page.tsx`: `section.condition-label` labelled by its `h2` (still
  «Карта условий»), a `.label-source` line, the footer `.label-foot`; the remote Ground
  `figure.evidence.receipt`; `.empty-ribbon` in the hours row; `.empty-receipt` in the
  countries row when they are unknown (new copy: «В записи нет списка стран найма. Это
  вопрос работодателю, а не отказ: спросите, из каких стран возможен найм и по какому
  договору.»); the source card `.aside-card.inverse`. No row status or icon changed.
- `src/app/globals.css`: the label, ribbon, receipt and inverse rules (tokens only);
  `.prose h2` in ink (it inherited the grey of body text) — this also changes `/status`.
- `docs/solo/context/NENAUGAD_SIGNAL.md` §6: what is built and what waits for data
  (team hours for the overlap ribbon; evidence spans for `<mark>`).

Reviewed with full-page shots of `/jobs/orbit-product` (1440, 390) and `/jobs/fern-frontend`
(1440; 390 with the receipt open).

## Checks (2026-11-02)

| Command | Result |
|---|---|
| `npm run check` | exit 0: unit 377/377, lint, typecheck, guardrails, tokens |
| `npm run build` | exit 0 on the second start (the first stops on Next's upgrade notice) |
| e2e visual | baselines regenerated for `/jobs/fern-frontend`, `/jobs/orbit-product` and `/status` (×3 viewports); then 36/36 |
| e2e design-system + catalog | 44 passed, 1 failed: the first desktop test, the page reloading during the cold start. Re-run with `--repeat-each=2` on desktop: the warm copy of "inspect evidence" and both "condition map" runs pass; only the first, cold copy fails |
| `test:db`, `test:coverage` | not run: no `.ts` logic changed (markup and CSS only; coverage counts `src/**/*.ts`) |

Note: the parallel session E2E-001 shares port 3100 with this checkout; runs were retried
when it held the port.
