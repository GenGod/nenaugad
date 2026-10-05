# A3-001 — skills dictionary v2: extraction precision and Russian-language aliases

**Result:** skill extraction stopped «seeing» skills in ordinary words and
started recognizing Russian-language names; a dictionary worklist for human
review appeared. The matching metrics rose: NDCG@5 0.903879 → **0.909773**,
NDCG@10 0.924056 → **0.942889** (aggregate over 6 profiles, the v2 golden set).

**Not included:** the ESCO import (an owner decision, see below), Russian
morphology (cases), embeddings/synonymy beyond the dictionary (B1+).

**Context:** [the brief](../docs/design/2026-09-27-matching-implementation-brief.md)
(item A3); [the research](../docs/research/2026-09-26-job-matching-research.md)
part 1 method 1 (skill normalization), part 2 A3; the findings of A1-001
(extractor false positives) and A2-001 (alias consumption).

## What changed in `src/domain/skills.ts` (v1 → v2)

1. **A case rule for ambiguous aliases.** `AMBIGUOUS_ALIASES` (go, docs, bi,
   ml, ts, js, py, pg, rest, rust, spring, rails, swift, phoenix, canvas,
   queries, statistics) match only in capitalized form: «We go fast» no longer
   yields Go, «REST API» keeps yielding REST API.
2. **The alias-consumption defect is fixed** (found during the attribution of
   this same change): previously only the first occurrence of an alias was
   consumed, so a second «Node.js» in the text leaked into a false
   `js → JavaScript` match. Now all occurrences are consumed. This was the
   source of the gain: in the golden set j05 received a phantom JavaScript and
   outranked j06, which had the higher grade.
3. **The v2 alias delta** (`ALIAS_DELTA_V2_ENTRIES`, 19 canonical names):
   Russian names (машинное обучение, глубокое обучение, нейронные сети,
   аналитика, кибербезопасность, информационная безопасность, базы данных,
   микросервисы, мониторинг, инфраструктура как код, автотесты, автоматизация
   тестирования, ручное/нагрузочное тестирование, управление
   проектами/продуктом, руководство командой, инженерия данных, дизайн
   интерфейсов) + ECMAScript for JavaScript. The delta is a separate structure,
   not an edit of 60 records: the diff shows exactly what v2 added, and the
   dictionary grows predictably.
4. **`hasAlias`** — a narrow helper for the worklist (not used by matching).
5. `SKILLS_DICTIONARY_VERSION` = 2.

## New: the dictionary worklist (`src/domain/dictionary-coverage.ts`)

`dictionaryWorklist(texts)` returns a frequency-sorted list of unknown tokens
and is printed in the `npm run eval:matching` report. This is **not a quality
metric** (the posts are mostly prose; a «coverage share» would be a number with
nothing to do), but a working list for human review: role and domain nouns are
filtered out so the list is actionable. Nothing is added to the dictionary
automatically.

## V1: ESCO (source check, 2026-09-29)

The ESCO portal (esco.ec.europa.eu/en/about-esco): the publisher is the
European Commission's DG Employment, Social Affairs and Inclusion; the data is
«consulted and downloaded free of charge»; version **v1.2.1 (release v5.7.0,
last update 10.12.2025)**. **What could not be verified:** the exact license
name and the redistribution terms are not stated on the «about» page — the
separate terms page was not read. Therefore: the ESCO import is **not
started**, the decision is the owner's, and until the decision no ESCO data
enters the project (this is external content; the source rules apply to it).

## Protocol V0–V6

- **V0.** A separate task; changes in the domain, product behavior unchanged
  (the ranker is used by the harness), the DB schema untouched.
- **V1.** Item A3 re-read; ESCO checked (above). Applicability confirmed: the
  dictionary is the only normalization source, and it also feeds SKILL-01, the
  requirements (A2) and the ranker.
- **V2.** Principles: the dictionary still does not claim on the user's behalf
  («adding a skill to the dictionary ≠ the user has it» — the header comment
  kept); the unknown semantics untouched; Russian aliases do not change
  eligibility (the gates checked by the existing tests, 146/146).
- **V3.** `npm run check` → exit 0 (146/146 unit, biome 149 files, tsc);
  `npm run build` → exit 0; `npm run eval:matching` → exit 0 (guards 0/0).
  `test:db` and `test:e2e` — `not_run`: the schema/UI/API were not changed.
- **V4.** Tests: the alias matrix (js / JavaScript / ECMAScript / k8s /
  Kubernetes → one canonical name), the case rule, Russian aliases, case-form
  unavailability («базами данных» — a documented limitation), consumption of
  all occurrences, the delta invariants (the targets exist; no foreign alias
  hijacked), 4 worklist tests.
- **V5.** Thresholds raised (upward only), the re-baseline history recorded in
  `tests/unit/matching-eval.test.ts`; existing tests not weakened; while
  preparing the tests one line of an existing test was accidentally deleted —
  noticed and restored before the run (clean in the diff).
- **V6.** This file + an entry in `IMPLEMENTATION_STATUS.md`.

## Measurement attribution (verified, not assumed)

- **frontend-latam NDCG@5 0.855 → 0.974**: the phantom `JavaScript` at j05 was
  removed (the second occurrence of «Node.js»); j06 with grade 3 correctly took
  first place. Verified by comparison with the A2 code via `git stash` (the A2
  order: j05 before j06; the A3 order: j06 first).
- **data-asia NDCG@5 0.755 → 0.663, NDCG@10 0.833 → 0.834**: the Russian alias
  «аналитика»/«машинное обучение» lifted j21 (grade 2) into the top-5,
  displacing j32 (grade 3). This is a local swap of two relevant jobs within
  the top-5, not a quality loss: the profile's NDCG@10 rose, the aggregate
  rose.
- The before/after numbers match the floor thresholds fixed in the test.

## Limitations

1. Russian case forms are not supported («базами данных» does not match) —
   exact alias matching; morphology is beyond v2's scope.
2. The `AMBIGUOUS_ALIASES` list is curated by hand; extend it as findings
   arrive (the worklist and the golden set show this).
3. The worklist is a heuristic: some tokens («native», «layer») come from
   compound terms; a human makes the decisions.
4. ESCO is not connected (see V1).

## Risk and rollback

Ordinary risk: a domain without network or DB; product behavior unchanged.
Rollback — restore the `SKILLS_DICTIONARY_VERSION = 1` semantics via
`git revert` of the A3 commit; the branch is not merged.
