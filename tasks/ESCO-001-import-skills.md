# ESCO-001 — wiring the skills part of ESCO into the skills dictionary (owner decision 2026-10-02)

**Status: done (implemented), 2026-10-04.** Local checks are complete
(see "Result"), acceptance rests with the owner. Basis: the owner decision on item
E.6 of batch #4 after verbatim reading of the conditions (official ESCO Handbook, §5
"Legal conditions applying to the ESCO service", extracted from the PDF 2026-10-02).

**What is permitted — verbatim (handbook §5):**
- mandatory attribution when using ESCO: **"This service uses the ESCO
  classification of the European Commission."**;
- **"Any modified or adapted version of ESCO must be clearly indicated as such."**;
- the occupations part is based on ISCO (© International Labour Organization 2012,
  "can be adapted and reproduced with permission") — **not part of this task**;
- the skills part is EU; reuse is governed by Decision 2011/833/EU (the current
  Commission policy in its legal notice: CC BY 4.0, attribution + indication of
  changes).

**Task boundaries (the skills part).**
1. Obtain the ESCO skills (version v1.2.1 / release v5.7.0; the portal requires
   accepting a privacy statement and obtaining a download link — this is an explicit
   action with an external service, not a background one). The artifact is versioned
   as an artifact (modeled on B1: revision + sha256, not stored in git).
2. Build **alias deltas** against `src/domain/skills.ts` v2 — do not replace the
   dictionary wholesale: the deltas go through review just like v1→v2, with a
   precision metric on the golden set; ratchet thresholds are not lowered.
3. Attribution: the line "This service uses the ESCO classification of the European
   Commission." — in the interface (minimally: status/footer; the placement point —
   at implementation time) and in `docs/DEPENDENCIES.md` together with
   Decision 2011/833/EU and an "adapted version" note.
4. Russian coverage: ESCO is multilingual (ru exists) — extending Russian aliases
   from the ESCO ru set is measured the same way as A3-001 (worklist,
   unknown tokens of the catalog).

**Checks at execution:** `npm run check`, `test:db`, `build`,
`npm run eval:matching` (accuracy/NDCG not below the thresholds), guardrails — the
content source is registered per the source rules (purpose-specific review).

**Rollback:** remove the artifact and the deltas (the dictionary returns to v2);
the attribution line is removed together with the data.

## Channel reconnaissance (2026-10-04)

- The open ESCO REST API (`https://ec.europa.eu/esco/api`, software v1.1.3,
  release notes 28/08/2025) serves the **v1.2.1** dataset ("third iteration of
  1.2.1"). The `selectedVersion=v1.2.1` parameter is confirmed:
  `search?...type=skill` returns a total of **13 939** skills; without the pin
  ("latest") — 13 485, which is a different, narrower sample. The version in this
  task is pinned by this parameter.
- The email-gated download from the portal is not required: the same dataset is
  available via the open API. The artifact is collected page by page (`search`,
  limit=100, 140 pages, labels in all 28 languages; full concept documents —
  targeted, by matched URIs) and is not stored in git: the manifest with the
  date/sha256 is `data/esco-manifest.json`, the pages are `data/esco/` (gitignored).
- **Clarification to item 4 of the plan: ESCO has no Russian language.** The API
  serves 28 languages: ar + 24 official EU + is + no + en-us. An "ESCO ru set" does
  not exist; Russian aliases remain our own work (v2), and the RU part of the item
  is executed as a re-measurement of the worklist (unknown tokens of the catalog),
  not as an import of ru labels.

## Execution plan

1. `scripts/esco-fetch.ts` + `npm run esco:fetch` (fetch / `--check` / `--propose`):
   the v1.2.1 artifact, a sha256 manifest, an offline proposal of mapping candidates
   and deltas from the local artifact.
2. Review of the candidates → `src/domain/skills-esco.ts`: mapping of the canonical
   skills onto ESCO concepts (URIs + labels from the artifact) and an alias delta
   (only multi-word EN labels that passed the v2 invariants; others — with
   justification).
3. `src/domain/skills.ts` → v3: the ESCO delta is merged next to ALIAS_DELTA_V2;
   invariant tests; ratchet thresholds are not lowered.
4. Attribution: "This service uses the ESCO classification of the European
   Commission." + an adaptation note (footer), `docs/DEPENDENCIES.md`
   (Decision 2011/833/EU, legal notice CC BY 4.0, ISCO/ILO out of scope).
5. Measurements: `npm run eval:matching` before/after (accuracy, NDCG, worklist),
   `check`, `test:db`, `build`, `test:e2e` (visual baselines updated: the footer
   changes on all pages).
6. Rollback: remove `data/esco*`, `src/domain/skills-esco.ts`, the v3 delta and the
   attribution line.

## Result (2026-10-04)

Retrieval channel: the open ESCO REST API (software v1.1.3, release notes
28.08.2025) serves the **v1.2.1** dataset; the version is pinned by
`selectedVersion=v1.2.1` (13 939 skills; without the `latest` pin it is a different,
smaller sample, 13 485). Artifact: full skill documents, 140 pages, 180 MB, labels
in all 28 languages; collected by `npm run esco:fetch` (sha256 pins in
`data/esco-manifest.json`, the files themselves are not stored in git). Two
non-obvious API quirks are documented in the script: `offset` is a **page number**,
not an offset into records; `full=true` caps the page at 100 records regardless of
`limit` (the intuitive reading of both gives empty pages at depth — verified live).

Review of the mapping and the delta (`npm run esco:fetch -- --propose`; the
decisions are recorded in `src/domain/skills-esco.ts`):
- **50 links** "our canon → ESCO concept" covering 33 of 83 canonical skills: exact
  label matches (SQL, JavaScript, C#, MySQL, English…), parenthesized ones
  ("Python (computer programming)", "Swift (computer programming)") and via
  alternative labels (business intelligence ↔ "BI", ICT encryption ↔ "TLS"/"SSL",
  Hadoop ↔ our alias "hadoop").
- **Alias delta v3: 8 canonical skills, 11 aliases** — business intelligence, apache
  hadoop, c sharp, information security, it security, statistical analysis,
  artificial neural networks, supervised/semi-/unsupervised learning, programme
  management. Review rules (in the header of `skills-esco.ts` and in the tests):
  only multi-word term-like labels; not ability phrases, not versions/editions,
  not historical names; no collisions.
- **False friends rejected and recorded:** ".NET" is an alt-label of the Visual
  Basic concept; "transformers" — "electrical machines"; "Canvas" — an LMS concept;
  tech names (AngularJS, OpenCV, bash, tensorflow) sit in the alt-labels of the
  generalized "computer programming" / "computer vision". Conclusion: ESCO
  alt-labels are not imported wholesale — only one by one via review.
- An honest limitation of the mapping: many brand-name tools have no concepts in
  ESCO (Docker, Kubernetes, Terraform, MongoDB, Redis, Elasticsearch, SQLite,
  AWS/GCP/Azure, Nginx, React Native, Flutter, Node.js, Go, Rust…).

**Russian part — a clarification of the premise of item 4:** ESCO **has no Russian
language** (28 API languages: ar + 24 official EU languages + is + no + en-us). An
"ESCO ru set" does not exist; Russian aliases remain the project's own work (v2) and
do not come from ESCO. Re-measured worklist: 95 distinct unknown / 119 occurrences
(unchanged); the RU unknowns — инженер(3), обучение(2), разработка(2), тестов(2)
[the tokens themselves: "engineer" ×3, "training" ×2, "development" ×2, "tests" ×2]
— cannot be closed from ESCO; morphology is a separate task (as recorded in the v2
tests).

**Attribution:** "This service uses the ESCO classification of the European
Commission." + an adaptation note («Словарь псевдонимов навыков — адаптированная
версия ESCO (v1.2.1)» [product string: "The skills aliases dictionary — an adapted
version of ESCO (v1.2.1)"]) — in the footer, on every page; e2e test
(`design-system.spec.ts`). The terms — `docs/DEPENDENCIES.md` (Decision 2011/833/EU,
Commission legal notice CC BY 4.0, the occupations part ISCO/ILO out of scope).

**Measurements:** `npm run eval:matching` before (v2,
`reports/local/esco-001-before.txt`) and after (v3, `…-after.txt`) — the metrics are
**exactly neutral**: R@5 0.611 · R@10 0.850 · NDCG@5 0.875 · NDCG@10 0.892 ·
MRR 1.000, guards unjudged/hidden 0/0. Not one added label occurs in the 39 posts
of the golden set, so the delta buys coverage for future posts, not score today;
the ratchet thresholds were neither lowered nor raised, the record of it is in
`tests/unit/matching-eval.test.ts`.

**Checks (all local, exit code 0):** `npm run esco:fetch` (fetch + verification of
the mapping against the artifact), `npm run esco:fetch -- --check` (artifact
verified), `npm run check` (244/244 unit, lint, typecheck), `npm run test:db`
(57/57, local DB), `npm run build`, `npm run test:e2e` (99 passed; visual baselines
updated — the footer changed on all pages), `npm run eval:matching`.

**Files:** `scripts/esco-fetch.ts`, `src/domain/skills-esco.ts`,
`src/domain/skills.ts` (the v3 merge), `tests/unit/skills-esco.test.ts`,
`tests/unit/matching-eval.test.ts` (the measurement record),
`src/components/shell.tsx` (footer), `tests/e2e/design-system.spec.ts`,
`tests/e2e/visual.spec.ts-snapshots/*` (regeneration), `docs/DEPENDENCIES.md`,
`data/esco-manifest.json` (the pins; the artifact itself, `data/esco/`, is
gitignored), `package.json` (`esco:fetch`), `.gitignore`.

**Not done / limitations:** 33 of 83 canonical skills have links (ESCO is a
conceptual dictionary, not a tool catalog); the delta's effect on the golden
metrics is unobservable by the construction of the set; visual acceptance of the
footer rests with the owner (screenshots updated); coding-host spend — unknown (as
before).

**Rollback:** remove `data/esco/`, `data/esco-manifest.json`,
`src/domain/skills-esco.ts`; in `src/domain/skills.ts` remove the import and the
merge of the ESCO delta and return the version to 2; remove the attribution line
from the footer, the `skills-esco.test.ts` tests and the record in
`docs/DEPENDENCIES.md`; after the rollback — `npm run check` and
`npm run eval:matching`.
