# DS-001 — the Nenaugad design system 1.3 in the app (pixel-perfect + screenshot tests)

> **Accepted by the owner 2026-09-27.** Continuation under the same task: an expansion of
> coverage — screenshot states (unknown geography, an empty feed, search,
> validation errors), unit tests of design-system integrity (tokens, the sprite,
> the `var()` closure), e2e assets/headings/semantics.

## Result and boundaries
**ID / title:** DS-001 · Applying the brandbook «Ненаугад» (Reference/Nenaugad, v1.3) to the existing app.

**User-facing result:** all existing screens of the app are rendered in the approved Nenaugad 1.3 system — tokens `--ng-*` (140), brand (wordmark, favicon, voice), 64 SVG icons, components and screen templates match the standalone showcase `nenaugad-ui-kit.html`; visual regression is pinned by Playwright screenshot tests (1440/390/320).

**Not included:** renaming internal identifiers (`atlas-fixtures`, `ATLAS_ENV`, `globalThis.nenaugadSnapshotPool`, API, DB); new product behavior (filters, dialogs, toasts, sticky apply logic, a dark theme); connecting font files (stacks without files, CSP `font-src 'self'`); the CL module of the showcase `nenaugad-cover-letters.html` as separate screens (the letter editor is brought into the system with base components); the demo pages of the DS showcase (kitbar/foundations/swatches) are not reproduced in the app.

**Context:** `Reference/Nenaugad/NENAUGAD_DESIGN_SYSTEM.md` (v1.3), `Reference/Nenaugad/MIGRATION.md`, `Reference/Nenaugad/START_HERE.md`, the reference CSS is extracted into `.scratch/ng-extract/` (outside git). Priority: SP 1.0 invariants → brandbook → showcase. Conflict rule: «при конфликте screenshot с доменным правилом выбрать правило и зафиксировать исправление» [when a screenshot conflicts with a domain rule, choose the rule and record the fix].

**Risk:** low — a local visual change with no change to data, rights or contracts. The protection (guardrails, tokens:check, the existing e2e) stays; tests are updated only following the changed DOM/copy, not to "green" them.

**Data:** synthetic only. No real CVs, live AI, sources, deploy.

## Acceptance
1. `npm run tokens:check` green: `src/app/tokens.css` is generated from `docs/solo/context/nenaugad.tokens.json`, 140 `--ng-*` tokens, the values match the showcase (132 inherited unchanged + 8 brand).
2. `public/icons/nenaugad.sprite.svg` contains 64 glyphs from the manifest; the `Icon` component uses `<use href="/icons/nenaugad.sprite.svg#ng-<name>">`, decorative ones — `aria-hidden`, no `dangerouslySetInnerHTML`; guardrails green.
3. Header: a PNG wordmark 208 px (176 mobile), the tagline «Только удалённо», navigation «Вакансии / Сохранённое / Профиль» with `aria-current`, a mobile bottom navigation with SVG icons (not unicode); the favicon is connected.
4. The screens `/`, `/jobs`, `/jobs/[id]`, `/matched`, `/profile`, `/saved`, `/status`, `/login`, `/cv`, `/letters` use the showcase classes/markup (`.wrap`, `.btn`, `.badge`, `.job-card`, `.context`, `.conditions`, `.empty`, `.banner` etc.); the data, the honesty of states and the internal identifiers do not change.
5. The display layer is renamed: «Ненаугад» in the UI copy, the `display_name` of the fixture source; `source_id` and all internal keys unchanged.
6. Screenshot tests: `tests/e2e/visual.spec.ts`, baselines in git; a repeated run without changes gives 0 diff.
7. `npm run check` and `npm run build` green; the existing e2e scenarios pass with updated selectors reflecting the new DOM.

**Documented deviations from the showcase** (the "domain beats screenshot" rule):
- The «Фильтры» button from the showcase is not drawn: the catalog has no filters besides search; a dead button would violate UI honesty.
- The bookmark icon is not placed on fixture cards: saving works only for source snapshots (the API contract), fixtures have no snapshotId.
- The status in «Сохранённое» is real actions (mark applied / return), not the demo select with five states: personal progress is changed by a human, only confirmed events are available.
- The demo strip copy is adapted to the actual state of the app (local AI/upload exist, live is off), not copied from the showcase.

## Eligibility gates and limits
Local coding and tests within the workspace; no spend, no new dependencies, no deploy. Commit — on the `feature/nenaugad-design-system` branch, no push/merge. Coding-host spend: not visible (unknown). Fixes: at most two cycles with a new hypothesis.

## Checks and report
`npm run check:offline`, `npm run check`, `npm run build`, `npm run test:e2e` (visual included). `test:db` is untouched (no data changes) — `not_run`. The report goes into `IMPLEMENTATION_STATUS.md`. The next step after acceptance: S3-002 (the PDF parser) or the batch API test per S4-003.
