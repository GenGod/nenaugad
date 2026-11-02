# DS-002 — the «Сигнал» (Signal) design language, slice 1: the foundation

**Status: implemented and tested locally 2026-11-02 (slice 1 of 5); committed `aa8d5a9` on
`feature/ds-002-signal`; owner acceptance pending.** Owner decision 2026-11-02: after a design research
([reports/Distinctive UI language for Nenaugad.md](../reports/Distinctive%20UI%20language%20for%20Nenaugad.md))
and mockups of three directions, the owner chose «Сигнал» / Signal ("Signal") to replace
the Nenaugad 1.3 appearance (Atlas 1.1 values). Font files: the owner approved downloading
the three OFL fonts ("Yes, download").

## Why

The 1.3 skin matched the 2026 "AI default": warm cream paper with a serif display, a
floating example card, a three-icon feature strip, Inter, one blue, traffic-light pills.
Signal moves the identity into the product's own evidence: cyan marks verification, and
"unknown" gets its own drawn state instead of amber.

## Result and boundaries (slice 1)

**User-facing result:** every existing screen renders in Signal without markup changes:
cool paper `#F1F8F9`, ink `#04191F`, cyan `#22DEE6` as an ink-bordered surface (never text,
never on a dark ground), petrol `#004250` bands, petrol links `#005F75`; Tektur (display),
Geologica (UI), Martian Mono (times, sources); 2px radii on data, 6px on controls, 2px ink
outlines, no shadows; a cyan header band with the 24-tick ruler; job results as one ruled
list of rows; the status grammar (pass: solid + ✓; unknown: ink hatch + dashed outline +
?; fail: solid + notched corner) on badges, condition icons and banners. New header mark:
two bars with their overlap; the wordmark is live text.

**Not included (next slices):** DS-002b list rows with the five-cell signal strip and the
overlap micro-strip; DS-002c job detail as the «Условия вакансии» label, the overlap ribbon
and the Ground as a receipt with `<mark>` on quotes; DS-002d home without the floating
card and the feature strip; DS-002e favicon and `Reference/` brandbook update. No new
product behavior, no dark theme.

**Risk:** low (as DS-001): a local visual change; data, rights, contracts and API untouched.
Tests changed only where they pinned 1.3 values (see below).

## Changes

- `docs/solo/context/nenaugad.tokens.json` → 2.0.0 (147 tokens, was 140): Signal refs;
  new semantic tokens `color.bg.inverse`, `color.text.link`, `color.status.success.solid`,
  `color.status.danger.solid`, `weight.bold`; `font.editorial` renamed `font.display`;
  review (unknown) is ink on white; primary-button foreground is ink. `src/app/tokens.css`
  regenerated (`npm run tokens`).
- `public/fonts/`: Geologica, Tektur, Martian Mono, Latin + Cyrillic woff2 subsets
  (156 KB, from fonts.gstatic.com) with their OFL texts. CSP `font-src 'self'` unchanged.
- `src/app/globals.css`: rewritten values for the same class names; `@font-face`; no hex
  and no rgb() in the file.
- `src/components/shell.tsx`: SVG mark + text wordmark instead of `/brand/wordmark.png`
  (the PNG stays in `public/brand/`, unused).
- `src/app/page.tsx`: inline `var(--amber)` → `var(--review)`.
- Docs: `docs/solo/context/NENAUGAD_SIGNAL.md` (the language), a superseding note in
  `ATLAS_DESIGN_LANGUAGE.md`, the "Approved appearance" line of `AGENTS.md`.

## Tests changed and why

- `tests/unit/design-system.test.ts`: expected values follow the owner's decision (count
  147, Signal hexes, fonts, radii; primary foreground = text primary). The hex rule got
  stricter (no hex, no rgb() at all) and a new test checks 16 WCAG 2.2 AA pairs.
- `tests/e2e/design-system.spec.ts`: the lockup assertions follow the new markup; the
  served-assets test checks the six fonts instead of the unused PNG.
- `tests/e2e/visual.spec.ts`: baselines regenerated for the anonymous routes; see the
  repair log for the dev-server reload handling.

## Checks (2026-11-02)

| Command | Result |
|---|---|
| `npm run tokens` / `tokens:check` | 147 tokens, no drift |
| `npm run check` | exit 0: unit 365/365 (incl. the new AA-pairs test), lint, typecheck, guardrails |
| `npm run build` | exit 0 on the second start; the first compiled and generated all 16 pages, then exited 1 on Next's upgrade notice |
| e2e visual, anonymous (33 shots, 3 viewports) | baselines regenerated; 33/33 on two repeat runs |
| e2e design-system + catalog | 41 passed, 4 failed: desktop-only cold-start navigations (`ERR_ABORTED`, "waiting for navigation to finish"). A/B on the stashed pre-DS-002 code: the same 3 catalog tests fail the same way, so this predates DS-002 |
| `test:db`, `test:coverage`, authed e2e (account, s2, s2b, s3, authed visual) | **not run**: the compose database (port 54329) was down. The 18 authed visual baselines still show 1.3 and must be regenerated with the database up |

Manual review: full-page shots of `/`, `/jobs`, `/jobs/orbit-product`, `/profile` at 1440 and
390 px; fonts load from `/fonts/`, Cyrillic renders in all three faces.

## Open after slice 1

- ~~Regenerate the authed visual baselines with the database running~~ — done in DS-002b
  (the owner approved starting the compose database).
- Desktop cold-start navigation failures in the e2e suite (pre-existing; see the A/B above).
  A likely cause is the dev tooling of this Next.js version (it now prints a security
  advisory and stops every other start); an upgrade needs the owner's go-ahead.
- Slices DS-002b–e (see "Not included").

## Repair log

**Cycle 1 (hypothesis recorded 2026-11-02):** "Cold-start next dev compiles trigger
full-page reloads during the first desktop visual tests; visiting every anonymous route
once in a beforeAll warm-up makes all 33 anonymous baselines pass on two repeat runs."

Evidence before the cycle:
- Every other start, this Next.js version's `next dev` exits after printing a security
  upgrade notice ("This command stopped to show the upgrade recommendation. Retry the same
  command to continue"); Playwright's web server then refuses connections and every test
  fails. The next start continues. Not changed here: an upgrade needs the owner's go-ahead.
- On a continuing start, the first desktop tests failed with "Execution context was
  destroyed, most likely because of a navigation" or a screenshot timeout; later tests and
  all mobile/narrow tests passed. The page itself paints in ~0.1 s (measured directly).
- The Next dev-tools badge ("1 Insight") was painted into some baselines despite the
  existing `nextjs-portal{display:none}` rule.

Changes in `tests/e2e/visual.spec.ts` (test infrastructure only; no assertion weakened, no
threshold added): a `beforeAll` that visits the 11 anonymous routes (180 s budget), and
`shot()` removes the `nextjs-portal` host before the screenshot.

Result: after the warm-up no navigation failures remained; the five remaining desktop diffs
were the badge baked into baselines saved earlier (present in "expected", absent in
"actual"), so those baselines were regenerated.
