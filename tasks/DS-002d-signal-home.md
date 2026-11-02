# DS-002d — Signal slice 4: home as search and live rows

**Status: implemented and tested locally 2026-11-02; owner acceptance pending.** Owner request: "Start DS-002d" after DS-002c
(`8dfa752`) and the E2E-001 merge (`60b8a04`) on `feature/ds-002-signal`.

## Why

The research named the 1.3 home's two strongest AI tells: the floating example card beside
a serif hero, and the three-icon feature strip. Signal's home is the product itself: the
search and real rows from the catalog, plus the one thing a new visitor must learn — how to
read the three outcomes.

## Result and boundaries

**User-facing result:** `/` shows, in one column:
1. the hero: the overline, «Выбирать работу. Не наугад.» (the cyan mark on «Не наугад»),
   the lead, a search form that submits to `/jobs?q=` (the catalog's own form and limits),
   «Подобрать по резюме» and «Смотреть вакансии», and the privacy line;
2. «Свежее в демо-каталоге»: the three newest catalog rows (the same `readCatalog` and
   `JobCard` as `/jobs`) and a link to all jobs; if the catalog cannot be read, a plain
   line says so (no demo rows invented in its place);
3. «Как читать условия»: the three outcomes in the status grammar, each with one honest
   sentence, and the no-percentage line. It replaces the icon strip; its three principles
   live on in these sentences and the privacy line.

**Removed:** the floating proof card and the promise strip (markup and their CSS).

**Copy checked against behaviour:** "fail" does not claim the job is hidden — a job-level
fail (e.g. skills) caps a job at «Нужно уточнить», so it can still be listed.

**Not included:** README and `Reference/Nenaugad/` brandbook (DS-002e).

**Risk:** low. The home page gains a read of the public catalog (already public on `/jobs`)
and becomes dynamic like `/jobs`; no profile data, no new endpoint.

## Plan
1. `src/app/page.tsx` rewritten; `export const dynamic = "force-dynamic"`.
2. CSS: single-column `.hero`, `.home-search`, `.home-legend`; drop `.proof-*`,
   `.promise-*` and the two-column hero rules.
3. e2e: keep the heading and «Смотреть вакансии» assertions; add a check that the home
   search lands on `/jobs?q=`; visual baselines for `/` (×3).

## Changes

- `src/app/page.tsx` rewritten: the hero (search form → `/jobs?q=`, «Подобрать по резюме»
  now secondary, «Смотреть вакансии» a tertiary link, the privacy line); «Свежее в
  демо-каталоге» from `readCatalog` + `JobCard` (null → a plain "not answering" line);
  «Как читать условия». `dynamic = "force-dynamic"`.
- `src/app/globals.css`: single-column `.hero`, `.home-search`, `.home-latest`,
  `.home-legend`; the `.proof-*`, `.promise-*` and two-column hero rules removed (only the
  home page used them). The `.company-mark` rules, which sat inside the old home block, are
  kept unchanged under their own heading.
- `tests/e2e/catalog.spec.ts`: a new test — three catalog rows on home, three outcomes in
  the guide with the "question, not refusal" line, and the home search landing on
  `/jobs?q=React` with one result.
- `docs/solo/context/NENAUGAD_SIGNAL.md` §6: the home as built.

Reviewed with full-page shots at 1440 and 390 px (fixture catalog).

## Checks (2026-11-02)

| Command | Result |
|---|---|
| `npm run check` | exit 0 (unit 377/377). The first run exited 1 on four `noDescendingSpecificity` warnings: the home overrides sat before the rules they refine; moved after them (no visual change: the home shots still match) |
| `npm run build` | exit 0 |
| e2e visual | home baselines regenerated (×3) |
| `npm run test:e2e` | 126/126 on two runs in a row (123 + the new home test ×3) |
| `test:db`, `test:coverage` | not run: no `.ts` logic changed (the page reads the existing `readCatalog`) |
